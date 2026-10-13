const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const sqlite3 = require('sqlite3');

test('S1-09 account integration', async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'gym-account-'));
  const filename = path.join(directory, 'test.db');
  const db = new sqlite3.Database(filename);
  const databasePath = require.resolve('../backend/database');
  require.cache[databasePath] = { id: databasePath, filename: databasePath, loaded: true, exports: db };
  const exec = sql => new Promise((resolve, reject) => db.exec(sql, err => err ? reject(err) : resolve()));
  const get = sql => new Promise((resolve, reject) => db.get(sql, (err, row) => err ? reject(err) : resolve(row)));
  await exec(fs.readFileSync(path.join(__dirname, '../database/schema.sql'), 'utf8'));
  process.env.SESSION_SECRET = 'isolated-test-session-secret';
  const app = require('../backend/app');
  const server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  t.after(async () => {
    await new Promise(resolve => server.close(resolve));
    await new Promise(resolve => db.close(resolve));
    fs.rmSync(directory, { recursive: true });
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  async function request(url, method = 'GET', body, cookie) {
    const response = await fetch(base + url, {
      method, headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) })
    });
    const text = await response.text();
    let data; try { data = JSON.parse(text); } catch { data = text; }
    return { status: response.status, data, cookie: response.headers.get('set-cookie'), cache: response.headers.get('cache-control') };
  }
  let cookieA, cookieB;
  await t.test('private endpoints reject anonymous access', async () => {
    for (const [url, method, body] of [['/api/profile','GET'], ['/api/profile','PUT',{name:'Unauthorized',weightUnit:'kg'}], ['/api/dashboard','GET']]) {
      assert.equal((await request(url,method,body)).status,401);
    }
  });
  await t.test('register and log in two independent accounts', async () => {
    for (const [name,email] of [['Alice','alice@example.test'],['Bob','bob@example.test']]) {
      const body={name,email,password:'test-password-123'};
      assert.equal((await request('/api/auth/register','POST',body)).status,201);
      const login=await request('/api/auth/login','POST',body);
      assert.equal(login.status,200);
      if(name==='Alice') cookieA=login.cookie.split(';')[0]; else cookieB=login.cookie.split(';')[0];
    }
  });
  await t.test('profile loads safe fields with no-store caching', async () => {
    const response=await request('/api/profile','GET',undefined,cookieA);
    assert.equal(response.status,200);
    assert.equal(response.cache,'no-store');
    assert.deepEqual(response.data.user,{id:1,name:'Alice',email:'alice@example.test',weightUnit:'lbs'});
  });
  await t.test('save trimmed name and kg to SQLite, ignoring a supplied user id', async () => {
    const response=await request('/api/profile','PUT',{name:'  Alice Updated  ',weightUnit:'kg',id:2,userId:2},cookieA);
    assert.equal(response.status,200);
    assert.equal(response.data.user.name,'Alice Updated');
    assert.equal(response.data.user.weightUnit,'kg');
    assert.deepEqual(await get('SELECT name,weight_unit FROM users WHERE id=1'),{name:'Alice Updated',weight_unit:'kg'});
    assert.equal((await request('/api/profile','GET',undefined,cookieB)).data.user.name,'Bob');
  });
  await t.test('invalid names and units do not change saved settings', async () => {
    for(const body of [{name:' ',weightUnit:'lbs'},{name:'x'.repeat(61),weightUnit:'lbs'},{name:[],weightUnit:'lbs'},{name:'Alice',weightUnit:'stones'},{name:'Alice'}]) {
      assert.equal((await request('/api/profile','PUT',body,cookieA)).status,400);
    }
    assert.equal((await request('/api/profile','GET',undefined,cookieA)).data.user.weightUnit,'kg');
  });
  await t.test('lbs preference and HTML-like names remain plain data', async () => {
    const response=await request('/api/profile','PUT',{name:'<img src=x onerror=alert(1)>',weightUnit:'lbs'},cookieA);
    assert.equal(response.status,200);
    assert.equal(response.data.user.weightUnit,'lbs');
    assert.equal((await request('/api/profile','GET',undefined,cookieA)).data.user.name,'<img src=x onerror=alert(1)>');
  });
  await t.test('empty Dashboard has real zero counts', async () => {
    const response=await request('/api/dashboard','GET',undefined,cookieB);
    assert.equal(response.status,200);
    assert.deepEqual(response.data,{workoutsThisWeek:0,savedRoutines:0,trainingStreak:0,recentWorkouts:[]});
  });
  await t.test('Dashboard scopes records, ignores unfinished/future workouts, and handles week/streak boundaries', async () => {
    await exec(`INSERT INTO routines(user_id,name) VALUES(1,'Alice routine'),(2,'Bob routine');
      INSERT INTO workouts(user_id,start_time,end_time) VALUES
      (1,'2026-10-10T09:00:00Z','2026-10-10T10:00:00Z'),
      (1,'2026-10-11T09:00:00Z','2026-10-11T10:00:00Z'),
      (1,'2026-10-12T09:00:00Z','2026-10-12T10:00:00Z'),
      (1,'2026-10-12T10:00:00Z','2026-10-12T11:00:00Z'),
      (1,'2026-10-12T11:00:00Z',NULL),
      (1,'2099-10-12T09:00:00Z','2099-10-12T10:00:00Z'),
      (2,'2026-10-12T09:00:00Z','2026-10-12T10:00:00Z');`);
    const model=require('../backend/models/accountModel');
    const result=await model.dashboard(1,new Date('2026-10-12T12:00:00Z'));
    assert.equal(result.workoutsThisWeek,2);
    assert.equal(result.savedRoutines,1);
    assert.equal(result.trainingStreak,3);
    assert.deepEqual(result.recentWorkouts.map(x=>x.id),[4,3,2]);
    assert.equal((await model.dashboard(1,new Date('2026-10-13T12:00:00Z'))).trainingStreak,3);
    assert.equal((await model.dashboard(1,new Date('2026-10-14T12:00:00Z'))).trainingStreak,0);
    const response=await request('/api/dashboard','GET',undefined,cookieA);
    assert.equal(response.status,200);
    assert.equal(response.data.savedRoutines,1);
    assert.ok(response.data.recentWorkouts.every(x=>![5,6,7].includes(x.id)));
  });
  await t.test('saved profile remains after opening a new database connection', async () => {
    const reopened = new sqlite3.Database(filename);
    const stored=await new Promise((resolve,reject)=>reopened.get('SELECT weight_unit FROM users WHERE id=1',(err,row)=>err?reject(err):resolve(row)));
    assert.equal(stored.weight_unit,'lbs');
    await new Promise(resolve=>reopened.close(resolve));
  });
  await t.test('every navigation destination is served', async () => {
    for(const url of ['/','/profile.html','/login.html','/routines.html','/workout.html','/progress.html','/history.html']) {
      const response=await request(url);
      assert.equal(response.status,200,url);
      assert.match(response.data,/api.js/);
    }
  });
  await t.test('logout invalidates access to profile updates and Dashboard', async () => {
    assert.equal((await request('/api/auth/logout','POST',{},cookieA)).status,200);
    assert.equal((await request('/api/profile','GET',undefined,cookieA)).status,401);
    assert.equal((await request('/api/profile','PUT',{name:'Fail',weightUnit:'kg'},cookieA)).status,401);
    assert.equal((await request('/api/dashboard','GET',undefined,cookieA)).status,401);
    assert.equal((await request('/api/profile','GET',undefined,cookieB)).status,200);
  });
});
