const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const path = require('node:path');
const crypto = require('node:crypto');

// Explicitly target a disposable database; never point regression tests at live data.
const connectionString = process.env.TEST_DATABASE_URL;
test('production PostgreSQL registration, workouts and sessions survive process replacement',
  { skip: !connectionString, timeout: 90000 }, async t => {
    const url = new URL(connectionString);
    assert.match(url.pathname, /^\/gym_deployment_test/);
    assert.ok(['127.0.0.1', 'localhost'].includes(url.hostname));
    const secret = crypto.randomBytes(32).toString('hex');
    let server, base;
    async function start() {
      server = spawn(process.execPath, [path.join(__dirname, '../backend/productionStart.js')], {
        env: { ...process.env, NODE_ENV: 'production', DATABASE_URL: connectionString, SESSION_SECRET: secret, PORT: '0' },
        windowsHide: true, stdio: ['ignore', 'pipe', 'pipe']
      });
      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Server startup timed out')), 20000);
        server.stdout.on('data', data => {
          const match = data.toString().match(/ready on port (\d+)/);
          if (match) { clearTimeout(timer); base = 'http://127.0.0.1:' + match[1]; resolve(); }
        });
        server.once('exit', code => { clearTimeout(timer); reject(new Error('Server exited: ' + code)); });
        server.stderr.on('data', data => process.stderr.write(data));
      });
    }
    async function stop() {
      if (server && server.exitCode === null) { const exited = once(server, 'exit'); server.kill(); await exited; }
    }
    t.after(stop);
    async function request(route, method = 'GET', body, cookie, headers = {}) {
      const response = await fetch(base + route, {
        method, headers: { 'Content-Type': 'application/json', 'X-Forwarded-Proto': 'https', ...(cookie ? { Cookie: cookie } : {}), ...headers },
        ...(body === undefined ? {} : { body: JSON.stringify(body) })
      });
      const data = await response.json();
      assert.ok(response.status < 500, JSON.stringify(data));
      return { status: response.status, data, cookie: response.headers.get('set-cookie') };
    }
    await start();
    assert.equal((await request('/api/health')).status, 200);
    assert.equal((await request('/api/health', 'GET', undefined, undefined, { 'X-Forwarded-Proto': 'http' })).status, 200);
    assert.equal((await request('/api/auth/me', 'GET', undefined, undefined, { 'X-Forwarded-Proto': 'http' })).status, 400);
    assert.equal((await request('/api/auth/register', 'POST', {}, undefined, { Origin: 'https://evil.example' })).status, 403);
    assert.equal((await request('/api/workouts')).status, 401);
    const account = { name: 'Persistence Test', email: crypto.randomUUID() + '@example.test', password: crypto.randomBytes(16).toString('hex') };
    assert.equal((await request('/api/auth/register', 'POST', account)).status, 201);
    assert.equal((await request('/api/auth/register', 'POST', account)).status, 409);
    assert.equal((await request('/api/auth/login', 'POST', { ...account, password: 'incorrect' })).status, 401);
    const login = await request('/api/auth/login', 'POST', account);
    assert.equal(login.status, 200);
    assert.match(login.cookie, /Secure/); assert.match(login.cookie, /HttpOnly/); assert.match(login.cookie, /SameSite=Lax/);
    const cookie = login.cookie.split(';')[0];
    assert.equal((await request('/api/profile', 'PUT', { name: account.name, weightUnit: 'lbs' }, cookie)).status, 200);
    const picture = 'data:image/png;base64,' + require('node:fs').readFileSync(path.join(__dirname, 'fixtures/profile.png')).toString('base64');
    assert.equal((await request('/api/profile/picture', 'PUT', { image: picture }, cookie)).status, 200);
    assert.equal((await request('/api/profile/picture', 'PUT', { image: picture }, cookie)).status, 200, 'picture upsert');
    assert.equal((await request('/api/body-weight', 'POST', { date: '2026-11-10', weight: 180 }, cookie)).status, 201);
    const catalog = (await request('/api/exercises?name=bench', 'GET', undefined, cookie)).data;
    assert.ok(catalog.length);
    const exerciseId = catalog[0].id;
    const routine = await request('/api/routines', 'POST', { name: 'Persistent Routine', exercises: [{ exerciseId, targetSets: 1, targetReps: 8 }] }, cookie);
    assert.equal(routine.status, 201);
    const routineId = routine.data.routine.id;
    const created = await request('/api/workouts', 'POST', { routine_id: routineId }, cookie);
    assert.equal(created.status, 201);
    const workoutId = created.data.workout.id;
    assert.equal((await request(`/api/workouts/${workoutId}/sets`, 'POST', { exercise_id: exerciseId, set_number: 1, weight: 135, reps: 8, completed: true }, cookie)).status, 201);
    assert.equal((await request(`/api/workouts/${workoutId}/notes`, 'PUT', { notes: 'Survives restart' }, cookie)).status, 200);
    assert.equal((await request(`/api/workouts/${workoutId}/finish`, 'POST', {}, cookie)).status, 200);
    const before = await request(`/api/workouts/${workoutId}`, 'GET', undefined, cookie);
    assert.equal(before.data.workout.sets[0].weight, 135);
    await stop();
    await start(); // Starts a fresh app process and repeats schema + seed work.
    assert.equal((await request('/api/auth/me', 'GET', undefined, cookie)).status, 200, 'existing login survives replacement');
    const after = await request(`/api/workouts/${workoutId}`, 'GET', undefined, cookie);
    assert.deepEqual(after.data, before.data);
    assert.equal((await request('/api/workouts/history', 'GET', undefined, cookie)).data.workouts[0].sets[0].weight, 135);
    const dashboard = await request('/api/dashboard', 'GET', undefined, cookie);
    assert.equal(dashboard.data.workoutsThisWeek, 1);
    assert.equal(dashboard.data.trainingStreak, 1);
    assert.equal(dashboard.data.recentWorkouts[0].routineName, 'Persistent Routine');
    assert.equal((await request('/api/routines', 'GET', undefined, cookie)).data.routines[0].id, routineId);
    assert.equal((await request('/api/profile/picture', 'GET', undefined, cookie)).data.image, picture);
    assert.equal((await request('/api/auth/login', 'POST', account)).status, 200, 'stored credentials survive replacement');
    const bob = { name: 'Other', email: crypto.randomUUID() + '@example.test', password: account.password };
    await request('/api/auth/register', 'POST', bob);
    const bobCookie = (await request('/api/auth/login', 'POST', bob)).cookie.split(';')[0];
    assert.equal((await request(`/api/workouts/${workoutId}`, 'GET', undefined, bobCookie)).status, 404);
    assert.equal((await request('/api/workouts/history', 'GET', undefined, bobCookie)).data.workouts.length, 0);
    assert.equal((await request(`/api/routines/${routineId}`, 'PUT', { name: 'stolen' }, bobCookie)).status, 404);
    const changed = await request(`/api/routines/${routineId}`, 'PUT', { name: 'Updated', exercises: [{ exerciseId, targetSets: 2, targetReps: 10 }] }, cookie);
    assert.equal(changed.status, 200);
    const draft = (await request('/api/workouts', 'POST', {}, cookie)).data.workout.id;
    await request(`/api/workouts/${draft}/sets`, 'POST', { exercise_id: exerciseId, set_number: 1, weight: 10, reps: 8, completed: true }, cookie);
    assert.equal((await request(`/api/workouts/${draft}/exercises/${exerciseId}`, 'DELETE', undefined, cookie)).status, 200);
    assert.equal((await request(`/api/routines/${routineId}`, 'DELETE', undefined, cookie)).status, 200);
    assert.equal((await request(`/api/workouts/${workoutId}`, 'GET', undefined, cookie)).data.workout.routine_id, null);
    assert.equal((await request('/api/auth/logout', 'POST', {}, cookie)).status, 200);
    assert.equal((await request('/api/auth/me', 'GET', undefined, cookie)).status, 401);
    const freshCookie = (await request('/api/auth/login', 'POST', account)).cookie.split(';')[0];
    assert.equal((await request('/api/account', 'DELETE', { confirmation: 'DELETE', password: account.password }, freshCookie)).status, 200);
    assert.equal((await request('/api/auth/login', 'POST', account)).status, 401);
    assert.equal((await request('/api/auth/me', 'GET', undefined, bobCookie)).status, 200);
  });
