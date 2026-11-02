// End-to-end check of workout logging and Finish Workout with a real server and SQLite.
// Trello card: "Make workout logging and Finish Workout work - Wasif"
// Acceptance: active workout data is sent to the backend and saved when finished.
// Follows what the Active Workout page does: create sets, edit them as the user
// types (PUT), mark them done, then finish. Run with: npm test
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const sqlite3 = require('sqlite3');

test('workout logging and Finish Workout with real SQLite', async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'gym-logging-'));
  const filename = path.join(directory, 'test.db');
  const db = new sqlite3.Database(filename);

  const databasePath = require.resolve('../backend/database');
  require.cache[databasePath] = { id: databasePath, filename: databasePath, loaded: true, exports: db };

  const exec = sql => new Promise((resolve, reject) => db.exec(sql, err => err ? reject(err) : resolve()));
  const all = (sql, params = []) => new Promise((resolve, reject) =>
    db.all(sql, params, (err, rows) => err ? reject(err) : resolve(rows)));

  await exec(fs.readFileSync(path.join(__dirname, '../database/schema.sql'), 'utf8'));
  await exec(`
    INSERT INTO exercises (name, muscle_group, equipment)
    VALUES ('Bench', 'Chest', 'Barbell'),
           ('Squat', 'Legs', 'Barbell');
  `);

  process.env.SESSION_SECRET = 'logging-integration-only';

  const app = require('../backend/app');
  const server = await new Promise(resolve => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });

  t.after(async () => {
    await new Promise(resolve => server.close(resolve));
    await new Promise(resolve => db.close(resolve));
    fs.rmSync(directory, { recursive: true, force: true });
  });

  const base = 'http://127.0.0.1:' + server.address().port;

  async function request(url, method = 'GET', body, cookie) {
    const res = await fetch(base + url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(cookie ? { Cookie: cookie } : {})
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) })
    });
    return { status: res.status, body: await res.json(), cookie: res.headers.get('set-cookie') };
  }

  async function signUpAndIn(name) {
    const data = { name, email: name.toLowerCase() + '@example.test', password: 'testing-123' };
    assert.equal((await request('/api/auth/register', 'POST', data)).status, 201);
    return (await request('/api/auth/login', 'POST', data)).cookie.split(';')[0];
  }

  const alice = await signUpAndIn('Alice');
  const bob = await signUpAndIn('Bob');

  // What the page does when a routine workout opens: start it, then create
  // one not-done set per target set.
  async function startWithPlaceholders(cookie, exerciseId, count) {
    const started = await request('/api/workouts', 'POST', { routine_id: null }, cookie);
    assert.equal(started.status, 201);
    const id = started.body.workout.id;
    const sets = [];
    for (let n = 1; n <= count; n++) {
      const r = await request('/api/workouts/' + id + '/sets', 'POST',
        { exercise_id: exerciseId, set_number: n, weight: 0, reps: 8, completed: false }, cookie);
      assert.equal(r.status, 201);
      assert.equal(r.body.set.completed, false);
      sets.push(r.body.set);
    }
    return { id, sets };
  }

  let workout;

  await t.test('sets are saved as the user types and marks them done', async () => {
    workout = await startWithPlaceholders(alice, 1, 3);
    const [first, second] = workout.sets;

    const typed = await request('/api/workouts/' + workout.id + '/sets/' + first.id, 'PUT',
      { weight: 135, reps: 8, completed: false }, alice);
    assert.equal(typed.status, 200);

    for (const [set, weight] of [[first, 135], [second, 145]]) {
      const done = await request('/api/workouts/' + workout.id + '/sets/' + set.id, 'PUT',
        { weight, reps: 8, completed: true }, alice);
      assert.equal(done.status, 200);
      assert.equal(done.body.set.completed, true);
    }

    const details = await request('/api/workouts/' + workout.id, 'GET', undefined, alice);
    assert.deepEqual(details.body.workout.sets.map(s => [s.set_number, s.weight, s.completed]),
      [[1, 135, true], [2, 145, true], [3, 0, false]]);
  });

  await t.test("edits are checked and nobody can edit someone else's sets", async () => {
    const url = '/api/workouts/' + workout.id + '/sets/' + workout.sets[0].id;
    assert.equal((await request(url, 'PUT', { weight: -5, reps: 8, completed: true }, alice)).status, 400);
    assert.equal((await request(url, 'PUT', { weight: 100, reps: 0, completed: true }, alice)).status, 400);
    assert.equal((await request(url, 'PUT', { weight: 100, reps: 8 }, alice)).status, 400, 'completed is required');
    assert.equal((await request(url, 'PUT', { weight: 999, reps: 1, completed: true }, bob)).status, 404, "Bob can't edit Alice's set");

    // A set id from a different workout can't be edited through this one.
    const other = await startWithPlaceholders(alice, 2, 1);
    const crossed = await request('/api/workouts/' + workout.id + '/sets/' + other.sets[0].id, 'PUT',
      { weight: 50, reps: 5, completed: true }, alice);
    assert.equal(crossed.status, 404);

    const row = await all('SELECT weight, reps, completed FROM workout_sets WHERE id = ?', [workout.sets[0].id]);
    assert.deepEqual(row, [{ weight: 135, reps: 8, completed: 1 }], 'nothing above changed the saved set');
  });

  await t.test('Finish Workout keeps only the sets marked done', async () => {
    const finished = await request('/api/workouts/' + workout.id + '/finish', 'POST', {}, alice);
    assert.equal(finished.status, 200);
    assert.ok(finished.body.workout.end_time);
    assert.equal(finished.body.workout.removed_sets, 1, 'the skipped placeholder set was removed');

    const details = await request('/api/workouts/' + workout.id, 'GET', undefined, alice);
    assert.deepEqual(details.body.workout.sets.map(s => [s.exercise_name, s.set_number, s.weight, s.completed]),
      [['Bench', 1, 135, true], ['Bench', 2, 145, true]]);

    const history = await request('/api/workouts', 'GET', undefined, alice);
    const saved = history.body.workouts.find(w => w.id === workout.id);
    assert.equal(saved.total_sets, 2, 'history counts only real sets');

    const dashboard = await request('/api/dashboard', 'GET', undefined, alice);
    assert.equal(dashboard.body.workoutsThisWeek, 1);
  });

  await t.test('a finished workout can no longer be changed', async () => {
    const setUrl = '/api/workouts/' + workout.id + '/sets/' + workout.sets[0].id;
    assert.equal((await request(setUrl, 'PUT', { weight: 1, reps: 1, completed: true }, alice)).status, 400);
    assert.equal((await request('/api/workouts/' + workout.id + '/sets', 'POST',
      { exercise_id: 1, set_number: 9, weight: 1, reps: 1, completed: true }, alice)).status, 400);
    assert.equal((await request('/api/workouts/' + workout.id + '/finish', 'POST', {}, alice)).status, 400);
  });

  await t.test('an empty workout saves the exercises added during it', async () => {
    const started = await request('/api/workouts', 'POST', {}, alice);
    const id = started.body.workout.id;
    assert.equal(started.body.workout.routine_id, null);

    // The page saves the first set as soon as an exercise is added.
    const added = await request('/api/workouts/' + id + '/sets', 'POST',
      { exercise_id: 2, set_number: 1, weight: 0, reps: 10, completed: false }, alice);
    await request('/api/workouts/' + id + '/sets/' + added.body.set.id, 'PUT',
      { weight: 225, reps: 5, completed: true }, alice);

    assert.equal((await request('/api/workouts/' + id + '/finish', 'POST', {}, alice)).status, 200);
    const details = await request('/api/workouts/' + id, 'GET', undefined, alice);
    assert.deepEqual(details.body.workout.sets.map(s => [s.exercise_name, s.weight, s.reps]), [['Squat', 225, 5]]);
  });

  await t.test('finishing with no sets done saves an empty workout', async () => {
    const { id } = await startWithPlaceholders(bob, 1, 2);
    const finished = await request('/api/workouts/' + id + '/finish', 'POST', {}, bob);
    assert.equal(finished.status, 200);
    assert.equal(finished.body.workout.removed_sets, 2);
    const details = await request('/api/workouts/' + id, 'GET', undefined, bob);
    assert.deepEqual(details.body.workout.sets, []);
    assert.ok(details.body.workout.end_time);
  });

  await t.test('combined Progress history contains only the owner\'s finished workouts and completed sets', async () => {
    assert.equal((await request('/api/workouts/history')).status, 401);
    const result = await request('/api/workouts/history', 'GET', undefined, alice);
    assert.equal(result.status, 200);
    assert.equal(result.body.workouts.length, 2, 'unfinished Alice workouts and Bob workouts stay out');
    assert.ok(result.body.workouts.every(w => w.end_time));
    const logged = result.body.workouts.find(w => w.id === workout.id);
    assert.deepEqual(logged.sets.map(s => [s.exercise_name, s.weight, s.reps]), [['Bench', 135, 8], ['Bench', 145, 8]]);
    const bobResult = await request('/api/workouts/history', 'GET', undefined, bob);
    assert.equal(bobResult.body.workouts.length, 1);
    assert.deepEqual(bobResult.body.workouts[0].sets, []);
    assert.ok(!bobResult.body.workouts.some(w => w.id === workout.id));
  });
});
