
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const sqlite3 = require('sqlite3');

test('workout API with real SQLite', async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'gym-workouts-'));
  const filename = path.join(directory, 'test.db');
  const db = new sqlite3.Database(filename);

  const databasePath = require.resolve('../backend/database');
  require.cache[databasePath] = {
    id: databasePath,
    filename: databasePath,
    loaded: true,
    exports: db
  };

  const exec = sql => new Promise((resolve, reject) =>
    db.exec(sql, err => err ? reject(err) : resolve())
  );

  const all = sql => new Promise((resolve, reject) =>
    db.all(sql, (err, rows) => err ? reject(err) : resolve(rows))
  );

  await exec(fs.readFileSync(
    path.join(__dirname, '../database/schema.sql'),
    'utf8'
  ));

  await exec(`
    INSERT INTO exercises (name, muscle_group, equipment)
    VALUES ('Bench', 'Chest', 'Barbell'),
           ('Squat', 'Legs', 'Barbell');
  `);

  process.env.SESSION_SECRET = 'workout-integration-only';

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

    return {
      status: res.status,
      body: await res.json(),
      cookie: res.headers.get('set-cookie'),
      cache: res.headers.get('cache-control')
    };
  }

  const cookies = [];

  for (const name of ['Alice', 'Bob']) {
    const data = {
      name,
      email: name + '@example.test',
      password: 'testing-123'
    };

    assert.equal(
      (await request('/api/auth/register', 'POST', data)).status,
      201
    );

    cookies.push(
      (await request('/api/auth/login', 'POST', data))
        .cookie.split(';')[0]
    );
  }

  await t.test('workout endpoints require authentication', async () => {
    assert.equal((await request('/api/workouts')).status, 401);
    assert.equal((await request('/api/workouts', 'POST', {})).status, 401);
    assert.equal((await request('/api/workouts/1/sets', 'POST', {})).status, 401);
  });

  let workoutId;

  await t.test('start workout and keep it private to its owner', async () => {
    const started = await request(
      '/api/workouts',
      'POST',
      {},
      cookies[0]
    );

    assert.equal(started.status, 201);
    assert.ok(started.body.workout.id);
    assert.equal(started.body.workout.end_time, null);

    workoutId = started.body.workout.id;

    const history = await request('/api/workouts', 'GET', undefined, cookies[0]);
    assert.equal(history.status, 200);
    assert.equal(history.cache, 'no-store');
    assert.equal(history.body.workouts.length, 1);

    const bobHistory = await request('/api/workouts', 'GET', undefined, cookies[1]);
    assert.equal(bobHistory.status, 200);
    assert.equal(bobHistory.body.workouts.length, 0);

    assert.equal(
      (await request('/api/workouts/' + workoutId, 'GET', undefined, cookies[1])).status,
      404
    );
  });

  await t.test('save sets and reject invalid exercise IDs', async () => {
    const saved = await request(
      '/api/workouts/' + workoutId + '/sets',
      'POST',
      {
        exercise_id: 1,
        set_number: 1,
        weight: 100,
        reps: 10,
        completed: true
      },
      cookies[0]
    );

    assert.equal(saved.status, 201);
    assert.equal(saved.body.set.exercise_id, 1);
    assert.equal(saved.body.set.weight, 100);
    assert.equal(saved.body.set.reps, 10);

    const invalid = await request(
      '/api/workouts/' + workoutId + '/sets',
      'POST',
      {
        exercise_id: 999999,
        set_number: 2,
        weight: 50,
        reps: 8,
        completed: true
      },
      cookies[0]
    );

    assert.equal(invalid.status, 400);

    const details = await request(
      '/api/workouts/' + workoutId,
      'GET',
      undefined,
      cookies[0]
    );

    assert.equal(details.status, 200);
    assert.equal(details.body.workout.sets.length, 1);
    assert.equal(details.body.workout.sets[0].exercise_name, 'Bench');
  });

  await t.test('finish workout and persist its history', async () => {
    const finished = await request(
      '/api/workouts/' + workoutId + '/finish',
      'POST',
      {},
      cookies[0]
    );

    assert.equal(finished.status, 200);
    assert.ok(finished.body.workout.end_time);

    const history = await request(
      '/api/workouts',
      'GET',
      undefined,
      cookies[0]
    );

    assert.equal(history.status, 200);
    assert.ok(history.body.workouts[0].end_time);
    assert.equal(history.body.workouts[0].total_sets, 1);

    const anotherSet = await request(
      '/api/workouts/' + workoutId + '/sets',
      'POST',
      {
        exercise_id: 1,
        set_number: 2,
        weight: 105,
        reps: 8,
        completed: true
      },
      cookies[0]
    );

    assert.equal(anotherSet.status, 400);
  });

});
