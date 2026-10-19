const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const sqlite3 = require('sqlite3');

test('routine API with real SQLite', async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'gym-routines-'));
  const filename = path.join(directory, 'test.db');
  const db = new sqlite3.Database(filename);
  const databasePath = require.resolve('../backend/database');
  require.cache[databasePath] = { id: databasePath, filename: databasePath, loaded: true, exports: db };
  const exec = sql => new Promise((resolve,reject)=>db.exec(sql,e=>e?reject(e):resolve()));
  const all = sql => new Promise((resolve,reject)=>db.all(sql,(e,r)=>e?reject(e):resolve(r)));
  await exec(fs.readFileSync(path.join(__dirname,'../database/schema.sql'),'utf8'));
  await exec("INSERT INTO exercises(name,muscle_group,equipment) VALUES('Bench','Chest','Barbell'),('Squat','Legs','Barbell');");
  process.env.SESSION_SECRET = 'routine-integration-only';
  const app = require('../backend/app');
  const server = await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});
  t.after(async()=>{
    await new Promise(resolve=>server.close(resolve));
    await new Promise(resolve=>db.close(resolve));
    fs.rmSync(directory,{recursive:true});
  });
  const base = 'http://127.0.0.1:'+server.address().port;
  async function request(url,method='GET',body,cookie) {
    const res=await fetch(base+url,{method,headers:{'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});
    return {status:res.status,body:await res.json(),cookie:res.headers.get('set-cookie'),cache:res.headers.get('cache-control')};
  }
  const cookies=[];
  for(const name of ['Alice','Bob']){
    const data={name,email:name+'@example.test',password:'testing-123'};
    assert.equal((await request('/api/auth/register','POST',data)).status,201);
    cookies.push((await request('/api/auth/login','POST',data)).cookie.split(';')[0]);
  }
  const payload={name:'Upper',description:'Test',exercises:[{exercise_id:2,target_sets:4,target_reps:8},{exercise_id:1,target_sets:3,target_reps:10}]};
  let id;
  await t.test('all routine endpoints require authentication',async()=>{
    for(const [url,method,body] of [['/api/routines','GET'],['/api/routines','POST',payload],['/api/routines/1','PUT',payload],['/api/routines/1','DELETE']]){
      assert.equal((await request(url,method,body)).status,401);
    }
  });
  await t.test('create and list preserve order, targets, names and ownership',async()=>{
    const r=await request('/api/routines','POST',{...payload,userId:2},cookies[0]);
    assert.equal(r.status,201); id=r.body.routine.id;
    assert.deepEqual(r.body.routine.exercises.map(e=>[e.name,e.target_sets,e.target_reps,e.exercise_order]),[['Squat',4,8,1],['Bench',3,10,2]]);
    const list=await request('/api/routines','GET',undefined,cookies[0]);
    assert.equal(list.cache,'no-store'); assert.equal(list.body.routines.length,1);
    assert.equal((await request('/api/routines','GET',undefined,cookies[1])).body.routines.length,0);
    for(const method of ['PUT','DELETE']) assert.equal((await request('/api/routines/'+id,method,payload,cookies[1])).status,404);
  });
  await t.test('invalid exercise rolls back create and update',async()=>{
    const bad={...payload,exercises:[payload.exercises[0],{exercise_id:999,target_sets:3,target_reps:10}]};
    assert.equal((await request('/api/routines','POST',bad,cookies[0])).status,400);
    assert.equal((await request('/api/routines/'+id,'PUT',{...bad,name:'Lost'},cookies[0])).status,400);
    const list=await request('/api/routines','GET',undefined,cookies[0]);
    assert.equal(list.body.routines.length,1);
    assert.equal(list.body.routines[0].name,'Upper');
    assert.equal(list.body.routines[0].exercises.length,2);
  });
  await t.test('update persists across a new database connection',async()=>{
    assert.equal((await request('/api/routines/'+id,'PUT',{...payload,name:'Push',exercises:[payload.exercises[1]]},cookies[0])).status,200);
    const reopened=new sqlite3.Database(filename);
    const row=await new Promise((resolve,reject)=>reopened.get('SELECT name FROM routines WHERE id=?',[id],(e,r)=>e?reject(e):resolve(r)));
    assert.equal(row.name,'Push'); await new Promise(resolve=>reopened.close(resolve));
  });
  await t.test('delete preserves historical workouts and logged sets',async()=>{
    await exec("INSERT INTO workouts(user_id,routine_id,start_time,end_time) VALUES(1,"+id+",'2026-10-19T10:00:00Z','2026-10-19T11:00:00Z'); INSERT INTO workout_sets(workout_id,exercise_id,set_number,weight,reps,completed) VALUES(1,1,1,100,10,1);");
    assert.equal((await request('/api/routines/'+id,'DELETE',undefined,cookies[0])).status,200);
    assert.deepEqual(await all('SELECT routine_id FROM workouts'),[{routine_id:null}]);
    assert.equal((await all('SELECT * FROM workout_sets')).length,1);
    assert.equal((await all('SELECT * FROM routine_exercises')).length,0);
  });
  await t.test('simultaneous saves succeed without overlapping transactions',async()=>{
    const results=await Promise.all(Array.from({length:5},(_,i)=>request('/api/routines','POST',{...payload,name:'Concurrent '+i},cookies[i%2])));
    assert.deepEqual(results.map(r=>r.status),[201,201,201,201,201]);
    assert.equal((await all('SELECT * FROM routines')).length,5);
  });
});

