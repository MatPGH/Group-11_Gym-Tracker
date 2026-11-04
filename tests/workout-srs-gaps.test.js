const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const sqlite3 = require('sqlite3');

test('SRS workout units, notes, removal and legacy confirmation', async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'gym-srs-workout-'));
  const db = new sqlite3.Database(path.join(directory, 'test.db'));
  const modulePath = require.resolve('../backend/database');
  require.cache[modulePath] = { id: modulePath, filename: modulePath, loaded: true, exports: db };
  const exec = sql => new Promise((ok, no) => db.exec(sql, error => error ? no(error) : ok()));
  const get = (sql, params = []) => new Promise((ok, no) => db.get(sql, params, (error, row) => error ? no(error) : ok(row)));
  await exec(fs.readFileSync(path.join(__dirname, '../database/schema.sql'), 'utf8'));
  await exec("INSERT INTO exercises(id,name,muscle_group,equipment) VALUES(1,'Bench','Chest','Barbell'),(2,'Squat','Legs','Barbell');");
  process.env.SESSION_SECRET = 'workout-srs-gaps-test';
  const server = await new Promise(ok => { const s = require('../backend/app').listen(0, '127.0.0.1', () => ok(s)); });
  t.after(async () => { await new Promise(ok => server.close(ok)); await new Promise(ok => db.close(ok)); fs.rmSync(directory, { recursive: true }); });
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
  const profile = unit => request('/profile', 'PUT', { name: 'Alice', weightUnit: unit }, a);
  const start = async body => (await request('/workouts', 'POST', body || {}, a)).data.workout.id;
  const details = async id => (await request(`/workouts/${id}`, 'GET', undefined, a)).data.workout;
  const set = (weight, unit = 'lbs', exercise = 1, n = 1) => ({ exercise_id: exercise, set_number: n, weight, weightUnit: unit, reps: 8, completed: true });
  let id, first;
  await t.test('new endpoints reject anonymous access', async () => {
    for (const [route, method, body] of [['/workouts/1/notes','PUT',{notes:'x'}],['/workouts/1/exercises/1','DELETE'],['/workouts/1/weight-unit','PUT',{weightUnit:'lbs'}]]) assert.equal((await request(route,method,body)).status,401);
  });
  await t.test('explicit input units remain correct when the profile preference changes', async () => {
    await profile('kg'); id = await start();
    const added = await request(`/workouts/${id}/sets`, 'POST', set(100,'lbs'), a);
    assert.equal(added.status,201); first=added.data.set.id;
    assert.equal((await get('SELECT weight FROM workout_sets WHERE id=?',[first])).weight,100);
    assert.ok(Math.abs((await details(id)).sets[0].weight-100/2.20462)<1e-9);
    await profile('lbs'); assert.equal((await details(id)).sets[0].weight,100);
    assert.equal((await request(`/workouts/${id}/sets`, 'POST', set(80,'kg',1,2), a)).status,201);
    const update = await request(`/workouts/${id}/sets/${first}`, 'PUT', {weight:50,weightUnit:'kg',reps:9,completed:true}, a);
    assert.equal(update.status,200);
    assert.ok(Math.abs((await get('SELECT weight FROM workout_sets WHERE id=?',[first])).weight-50*2.20462)<1e-9);
    await profile('kg'); assert.ok(Math.abs((await details(id)).sets[0].weight-50)<1e-9);
    assert.equal((await request(`/workouts/${id}/sets`, 'POST', set(1,'stones'), a)).status,400);
  });
  await t.test('notes validate, preserve plain text and remain private', async () => {
    assert.equal((await request(`/workouts/${id}/notes`, 'PUT', {notes:'  Felt strong\n<img src=x>  '}, a)).status,200);
    assert.equal((await details(id)).notes,'Felt strong\n<img src=x>');
    assert.equal((await request(`/workouts/${id}/notes`, 'PUT', {notes:'stolen'}, b)).status,404);
    for (const notes of ['x'.repeat(2001),[],null]) assert.equal((await request(`/workouts/${id}/notes`, 'PUT', {notes}, a)).status,400);
    assert.equal((await details(id)).notes,'Felt strong\n<img src=x>');
    const reopened=new sqlite3.Database(db.filename);
    const saved=await new Promise((ok,no)=>reopened.get('SELECT notes FROM workouts WHERE id=?',[id],(e,row)=>e?no(e):ok(row)));
    await new Promise(ok=>reopened.close(ok)); assert.equal(saved.notes,'Felt strong\n<img src=x>');
  });
  await t.test('finished history and details convert mixed input units consistently and retain notes', async () => {
    assert.equal((await request(`/workouts/${id}/finish`,'POST',{},a)).status,200);
    let history=(await request('/workouts/history','GET',undefined,a)).data.workouts;
    assert.ok(Math.abs(history[0].sets[0].weight-50)<1e-9);
    assert.ok(Math.abs(history[0].sets[1].weight-80)<1e-9);
    await profile('lbs'); history=(await request('/workouts/history','GET',undefined,a)).data.workouts;
    assert.ok(Math.abs(history[0].sets[0].weight-50*2.20462)<1e-9);
    assert.equal((await details(id)).notes,'Felt strong\n<img src=x>');
    assert.equal((await request(`/workouts/${id}/notes`,'PUT',{notes:'changed'},a)).status,400);
    assert.equal((await request(`/workouts/${id}/exercises/1`,'DELETE',undefined,a)).status,400);
  });
  await t.test('removal persists, cannot modify another user or saved routine, and supports explicit re-add', async () => {
    await exec("INSERT INTO routines(id,user_id,name) VALUES(1,1,'Original routine'); INSERT INTO routine_exercises(routine_id,exercise_id,target_sets,target_reps,exercise_order) VALUES(1,1,2,8,1),(1,2,1,8,2);");
    const workout=await start({routine_id:1});
    for (const body of [set(100),set(110,'lbs',1,2),set(200,'lbs',2)]) assert.equal((await request(`/workouts/${workout}/sets`,'POST',body,a)).status,201);
    assert.equal((await request(`/workouts/${workout}/exercises/1`,'DELETE',undefined,b)).status,404);
    assert.equal((await request(`/workouts/${workout}/exercises/1`,'DELETE',undefined,a)).status,200);
    assert.deepEqual((await details(workout)).removed_exercise_ids,[1]);
    assert.deepEqual((await details(workout)).sets.map(s=>s.exercise_id),[2]);
    assert.equal((await get('SELECT COUNT(*) AS n FROM routine_exercises WHERE routine_id=1')).n,2);
    assert.equal((await request(`/workouts/${workout}/sets`,'POST',set(100),a)).status,409,'stale tabs cannot silently recreate removed exercises');
    assert.equal((await request(`/workouts/${workout}/sets`,'POST',{...set(95),readd:true},a)).status,201);
    assert.deepEqual((await details(workout)).removed_exercise_ids,[]);
    assert.equal((await request(`/workouts/${workout}/exercises/1`,'DELETE',undefined,a)).status,200);
    assert.equal((await request(`/workouts/${workout}/exercises/2`,'DELETE',undefined,a)).status,200);
    assert.equal((await details(workout)).sets.length,0);
    assert.equal((await request(`/workouts/${workout}/finish`,'POST',{},a)).status,200);
  });
  await t.test('legacy weights remain unmodified until their owner confirms the original unit exactly once', async () => {
    await exec("INSERT INTO workouts(id,user_id,start_time,end_time,weight_unit) VALUES(100,1,'2026-11-03','2026-11-03',NULL); INSERT INTO workout_sets(workout_id,exercise_id,set_number,weight,reps,completed) VALUES(100,1,1,80,8,1);");
    assert.equal((await details(100)).weight_unit,null);
    assert.equal((await details(100)).sets[0].weight,80);
    assert.equal((await request('/workouts/100/weight-unit','PUT',{weightUnit:'kg'},b)).status,404);
    assert.equal((await request('/workouts/100/weight-unit','PUT',{weightUnit:'stones'},a)).status,400);
    assert.equal((await request('/workouts/100/weight-unit','PUT',{weightUnit:'kg'},a)).status,200);
    assert.ok(Math.abs((await details(100)).sets[0].weight-80*2.20462)<1e-9);
    assert.equal((await request('/workouts/100/weight-unit','PUT',{weightUnit:'kg'},a)).status,409);
    assert.ok(Math.abs((await details(100)).sets[0].weight-80*2.20462)<1e-9);
    await profile('kg'); assert.ok(Math.abs((await details(100)).sets[0].weight-80)<1e-9);
  });
});

test('existing database migration is repeatable and preserves ambiguous weights', async () => {
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'gym-unit-migration-'));
  const db=new sqlite3.Database(path.join(directory,'old.db'));
  try {
    const exec=sql=>new Promise((ok,no)=>db.exec(sql,e=>e?no(e):ok()));
    const get=sql=>new Promise((ok,no)=>db.get(sql,(e,row)=>e?no(e):ok(row)));
    await exec("CREATE TABLE workouts(id INTEGER PRIMARY KEY,user_id INTEGER,start_time TEXT,end_time TEXT,notes TEXT); CREATE TABLE workout_sets(id INTEGER PRIMARY KEY,workout_id INTEGER,weight REAL); INSERT INTO workouts VALUES(1,1,'2026-10-01',NULL,'keep notes'); INSERT INTO workout_sets VALUES(1,1,123.4);");
    const migrate=require('../backend/migrateDatabase'); await migrate(db); await migrate(db);
    assert.equal((await get('SELECT weight_unit FROM workouts')).weight_unit,null);
    assert.equal((await get('SELECT weight FROM workout_sets')).weight,123.4);
    assert.equal((await get('SELECT notes FROM workouts')).notes,'keep notes');
  } finally { await new Promise(ok=>db.close(ok));fs.rmSync(directory,{recursive:true}); }
});
