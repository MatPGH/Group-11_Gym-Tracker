const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const sqlite3 = require('sqlite3');

test('profile picture and account deletion with real SQLite', async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'gym-profile-extras-'));
  const filename = path.join(directory, 'test.db');
  const db = new sqlite3.Database(filename);
  const modulePath = require.resolve('../backend/database');
  require.cache[modulePath] = { id: modulePath, filename: modulePath, loaded: true, exports: db };
  const exec = sql => new Promise((ok, no) => db.exec(sql, error => error ? no(error) : ok()));
  const get = (sql, params = []) => new Promise((ok, no) => db.get(sql, params, (error, row) => error ? no(error) : ok(row)));
  await exec(fs.readFileSync(path.join(__dirname, '../database/schema.sql'), 'utf8'));
  process.env.SESSION_SECRET = 'profile-extras-test';
  const app = require('../backend/app');
  const server = await new Promise(ok => { const s = app.listen(0, '127.0.0.1', () => ok(s)); });
  t.after(async () => {
    await new Promise(ok => server.close(ok)); await new Promise(ok => db.close(ok));
    fs.rmSync(directory, { recursive: true });
  });
  async function request(route, method = 'GET', body, cookie) {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api${route}`, {
      method, headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) })
    });
    return { status: response.status, data: await response.json(), cookie: response.headers.get('set-cookie')?.split(';')[0] };
  }
  const cookies = [];
  for (const name of ['Alice', 'Bob']) {
    const body = { name, email: `${name}@example.test`, password: 'test-password-123' };
    assert.equal((await request('/auth/register', 'POST', body)).status, 201);
    cookies.push((await request('/auth/login', 'POST', body)).cookie);
  }
  const [a, b] = cookies;
  const secondSession = (await request('/auth/login', 'POST', { email: 'Alice@example.test', password: 'test-password-123' })).cookie;
  const image = 'data:image/png;base64,' + fs.readFileSync(path.join(__dirname, 'fixtures/profile.png')).toString('base64');
  await t.test('picture and delete endpoints require sign-in', async () => {
    assert.equal((await request('/profile/picture')).status, 401);
    assert.equal((await request('/profile/picture', 'PUT', { image })).status, 401);
    assert.equal((await request('/account', 'DELETE', {})).status, 401);
  });
  await t.test('picture persists, replaces and removes without leaking across accounts', async () => {
    assert.equal((await request('/profile/picture', 'PUT', { image, userId: 2 }, a)).status, 200);
    assert.equal((await request('/profile/picture', 'GET', undefined, a)).data.image, image);
    assert.equal((await request('/profile/picture', 'GET', undefined, b)).data.image, null);
    const reopened = new sqlite3.Database(filename);
    const saved = await new Promise((ok, no) => reopened.get('SELECT image FROM profile_pictures WHERE user_id=1', (e, row) => e ? no(e) : ok(row)));
    await new Promise(ok => reopened.close(ok)); assert.equal(saved.image, image);
    assert.equal((await request('/profile/picture', 'PUT', { image }, a)).status, 200);
    assert.equal((await get('SELECT COUNT(*) AS n FROM profile_pictures')).n, 1);
    assert.equal((await request('/profile/picture', 'PUT', { image: null }, a)).status, 200);
    assert.equal((await request('/profile/picture', 'GET', undefined, a)).data.image, null);
  });
  await t.test('unsafe and oversized pictures do not replace the saved picture', async () => {
    await request('/profile/picture', 'PUT', { image }, a);
    const corrupt = fs.readFileSync(path.join(__dirname, 'fixtures/profile.png'));
    corrupt[45] ^= 1;
    for (const bad of ['https://example.com/image.png', 'data:image/svg+xml;base64,PHN2Zz4=', 'data:image/png;base64,AAAA', 'data:image/png;base64,' + corrupt.toString('base64'), 'data:image/png;base64,' + 'A'.repeat(360000)]) {
      assert.equal((await request('/profile/picture', 'PUT', { image: bad }, a)).status, 400);
    }
    assert.equal((await request('/profile/picture', 'GET', undefined, a)).data.image, image);
  });
  await t.test('confirmation and password are required before deleting anything', async () => {
    for (const body of [{}, { confirmation: 'DELETE', password: 'wrong' }, { confirmation: 'delete', password: 'test-password-123' }]) {
      assert.equal((await request('/account', 'DELETE', body, a)).status, 400);
    }
    assert.ok(await get('SELECT id FROM users WHERE id=1'));
  });
  await exec(`INSERT INTO exercises(id,name,muscle_group,equipment) VALUES(1,'Bench','Chest','Barbell');
    INSERT INTO routines(id,user_id,name) VALUES(1,1,'A routine'),(2,2,'B routine');
    INSERT INTO routine_exercises(routine_id,exercise_id,target_sets,target_reps,exercise_order) VALUES(1,1,3,8,0),(2,1,3,8,0);
    INSERT INTO workouts(id,user_id,routine_id,start_time) VALUES(1,1,1,'2026-11-04'),(2,2,2,'2026-11-04');
    INSERT INTO workout_sets(workout_id,exercise_id,set_number,weight,reps) VALUES(1,1,1,100,8),(2,1,1,110,8);
    INSERT INTO body_weight_entries(user_id,date,weight) VALUES(1,'2026-11-04',180),(2,'2026-11-04',190);
    INSERT INTO workout_removed_exercises(workout_id,exercise_id) VALUES(1,1),(2,1);`);
  await t.test('failed deletion rolls back every previously deleted record', async () => {
    await exec("CREATE TRIGGER prevent_delete BEFORE DELETE ON users WHEN OLD.id=1 BEGIN SELECT RAISE(ABORT,'test deletion failure'); END;");
    assert.equal((await request('/account', 'DELETE', { confirmation: 'DELETE', password: 'test-password-123' }, a)).status, 500);
    assert.equal((await get('SELECT COUNT(*) AS n FROM workout_sets WHERE workout_id=1')).n, 1);
    assert.equal((await get('SELECT COUNT(*) AS n FROM body_weight_entries WHERE user_id=1')).n, 1);
    assert.equal((await get('SELECT COUNT(*) AS n FROM profile_pictures WHERE user_id=1')).n, 1);
    await exec('DROP TRIGGER prevent_delete');
  });
  await t.test('deletion removes owned records only and revokes all existing sessions', async () => {
    assert.equal((await request('/account', 'DELETE', { confirmation: 'DELETE', password: 'test-password-123', userId: 2 }, a)).status, 200);
    for (const table of ['users', 'routines', 'workouts', 'workout_sets', 'routine_exercises', 'body_weight_entries', 'workout_removed_exercises']) {
      assert.equal((await get(`SELECT COUNT(*) AS n FROM ${table}`)).n, 1, table);
    }
    assert.equal((await get('SELECT COUNT(*) AS n FROM profile_pictures')).n, 0);
    for (const cookie of [a, secondSession]) {
      for (const route of ['/profile', '/workouts', '/body-weight', '/routines', '/profile/picture']) assert.equal((await request(route, 'GET', undefined, cookie)).status, 401);
    }
    assert.equal((await request('/auth/login', 'POST', { email: 'Alice@example.test', password: 'test-password-123' })).status, 401);
    assert.equal((await request('/profile', 'GET', undefined, b)).status, 200);
  });
});
