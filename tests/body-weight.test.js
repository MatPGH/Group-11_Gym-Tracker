const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const repo=path.resolve(__dirname,'..');
const load=require('node:module').createRequire(path.join(repo,'package.json'));

test('body-weight API with real SQLite',async t=>{
  const sqlite=load('sqlite3');
  const directory=fs.mkdtempSync(path.join(require('node:os').tmpdir(),'gym-weight-'));
  const filename=path.join(directory,'test.db');
  const db=new sqlite.Database(filename);
  const dbModule=load.resolve('./backend/database');
  require.cache[dbModule]={id:dbModule,filename:dbModule,loaded:true,exports:db};
  await new Promise((ok,no)=>db.exec(fs.readFileSync(path.join(repo,'database/schema.sql'),'utf8'),e=>e?no(e):ok()));
  process.env.SESSION_SECRET='review-tests-only';
  const app=load('./backend/app');
  const server=await new Promise(ok=>{const s=app.listen(0,'127.0.0.1',()=>ok(s));});
  t.after(async()=>{await new Promise(ok=>server.close(ok));await new Promise(ok=>db.close(ok));fs.rmSync(directory,{recursive:true});});
  async function request(url,method='GET',body,cookie){
    const res=await fetch(`http://127.0.0.1:${server.address().port}/api${url}`,{method,headers:{'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});
    return {status:res.status,data:await res.json(),cookie:res.headers.get('set-cookie')?.split(';')[0]};
  }
  const cookies=[];
  for(const name of ['WeightAlice','WeightBob']){
    const body={name,email:name+'@example.test',password:'review-password-123'};
    assert.equal((await request('/auth/register','POST',body)).status,201);
    cookies.push((await request('/auth/login','POST',body)).cookie);
  }
  const [a,b]=cookies;
  await t.test('anonymous reads and writes rejected',async()=>{
    assert.equal((await request('/body-weight')).status,401);
    assert.equal((await request('/body-weight','POST',{date:'2026-11-04',weight:180})).status,401);
  });
  await t.test('save lbs, scope to owner, ignore supplied userId and sort oldest first',async()=>{
    for(const date of ['2026-11-03','2026-11-04'])assert.equal((await request('/body-weight','POST',{date,weight:180,userId:2},a)).status,201);
    assert.deepEqual((await request('/body-weight','GET',undefined,b)).data.entries,[]);
    const entries=(await request('/body-weight','GET',undefined,a)).data.entries;
    assert.deepEqual(entries.map(x=>x.date),['2026-11-03','2026-11-04']);
    assert.equal(entries[0].weight,180);
  });
  await t.test('lbs to kg conversion, kg insertion, and round trip back to lbs',async()=>{
    assert.equal((await request('/profile','PUT',{name:'WeightAlice',weightUnit:'kg'},a)).status,200);
    assert.ok(Math.abs((await request('/body-weight','GET',undefined,a)).data.entries[0].weight-180/2.20462)<1e-8);
    assert.equal((await request('/body-weight','POST',{date:'2026-11-04',weight:80},a)).status,201);
    await request('/profile','PUT',{name:'WeightAlice',weightUnit:'lbs'},a);
    assert.ok(Math.abs((await request('/body-weight','GET',undefined,a)).data.entries[2].weight-80*2.20462)<1e-8);
  });
  await t.test('invalid weights and malformed dates rejected',async()=>{
    for(const weight of [0,-1,'180',null])assert.equal((await request('/body-weight','POST',{date:'2026-11-04',weight},a)).status,400);
    assert.equal((await request('/body-weight','POST',{date:'bad',weight:180},a)).status,400);
  });
  await t.test('entries persist through a second SQLite connection',async()=>{
    const reopened=new sqlite.Database(filename);
    const row=await new Promise((ok,no)=>reopened.get('SELECT COUNT(*) AS n FROM body_weight_entries WHERE user_id=1',(e,r)=>e?no(e):ok(r)));
    await new Promise(ok=>reopened.close(ok));assert.equal(row.n,3);
  });
  await t.test('impossible calendar dates must be rejected',async()=>{
    const results=[];
    for(const date of ['2026-02-30','2026-99-99'])results.push((await request('/body-weight','POST',{date,weight:180},a)).status);
    assert.deepEqual(results,[400,400]);
  });
  await t.test('edit and delete entries enforce ownership and validate dates',async()=>{
    const entries=(await request('/body-weight','GET',undefined,a)).data.entries;
    const id=entries[0].id;
    assert.equal((await request('/body-weight/'+id,'PUT',{date:'2026-10-10',weight:175},b)).status,404);
    assert.equal((await request('/body-weight/'+id,'DELETE',undefined,b)).status,404);
    assert.equal((await request('/body-weight/'+id,'PUT',{date:'2026-02-30',weight:175},a)).status,400);
    assert.equal((await request('/body-weight/'+id,'PUT',{date:'2026-10-10',weight:175},a)).status,200);
    assert.equal((await request('/body-weight','GET',undefined,a)).data.entries[0].date,'2026-10-10');
    assert.equal((await request('/body-weight/'+id,'DELETE',undefined,a)).status,200);
    assert.equal((await request('/body-weight/'+id,'DELETE',undefined,a)).status,404);
    assert.equal((await request('/body-weight','GET',undefined,a)).data.entries.length,2);
    assert.equal((await request('/body-weight/not-an-id','DELETE',undefined,a)).status,404);
    assert.equal((await request('/body-weight','POST',{date:'2024-02-29',weight:175},a)).status,201);
    assert.equal((await request('/body-weight','POST',{date:'2025-02-29',weight:175},a)).status,400);
  });
});

test('rapid Save Weight submissions must issue only one POST',async()=>{
  const elements=new Map();
  const element=()=>({value:'',listeners:{},addEventListener(k,f){this.listeners[k]=f;},replaceChildren(){},append(){},reset(){},querySelectorAll(){return [];}});
  const get=s=>{if(!elements.has(s))elements.set(s,element());return elements.get(s);};
  let posts=0;
  const context=vm.createContext({console,Intl,Map,Date,Number,JSON,document:{querySelector:get,createElement:element},window:{addEventListener(){}},gymApi:async(url,options)=>{
    if(url==='/profile')return new Promise(()=>{});
    if(options?.method==='POST'){posts++;return new Promise(()=>{});}
    return {entries:[]};
  }});
  vm.runInContext(fs.readFileSync(path.join(repo,'frontend/progress.js'),'utf8'),context);
  get('#body-weight-date').value='2026-11-04';get('#body-weight-input').value='180';
  const submit=get('#body-weight-form').listeners.submit;
  submit({preventDefault(){}});submit({preventDefault(){}});
  assert.equal(posts,1,'a second submit while saving creates another request');
});
