const test=require('node:test');
const assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const {readdir,readFile}=require('node:fs/promises');
const path=require('node:path');
const {Client}=require('pg');
const {createDatabase}=require('../../database/client');
const {createGateService}=require('./gate.service');
const {createApp}=require('../../app/app');
const {sign}=require('./device-security');
test('Gate rules, recovery, correction, idempotency, signed HTTP and concurrent scans',async()=> {
  const admin=new Client({connectionString:process.env.DATABASE_URL}); await admin.connect();
  const schema='test_gate_'+randomUUID().replaceAll('-',''); await admin.query('CREATE SCHEMA '+schema);
  const url=new URL(process.env.DATABASE_URL);url.searchParams.set('options','-c search_path='+schema);
  const db=createDatabase(url.toString());let server;
  try {
    const dir=path.join(__dirname,'../../database/migrations');
    for(const file of (await readdir(dir)).filter(f=>f.endsWith('.sql')).sort()) await db.query(await readFile(path.join(dir,file),'utf8'));
    const actor=randomUUID(),student=randomUUID(),semester=randomUUID();
    await db.query("INSERT INTO users(id,username,full_name,role,password_hash) VALUES($1,'gate.test','Test Admin','ADMIN','test')",[actor]);
    await db.query("INSERT INTO students(id,student_no,full_name,course,year_level,rfid_uid) VALUES($1,'GATE-TEST','Gate Test','IT','1','12345678')",[student]);
    let now=new Date('2026-10-05T00:00:00.000Z');
    const config={gateEnabled:true,deviceId:'gate-01',deviceKey:'a'.repeat(64),schoolSessionStart:'07:00',schoolSessionEnd:'20:00',gateDuplicateSeconds:5};
    const gate=createGateService(db,config,null,{clock:()=>now});
    const input=()=>({uid:'12345678',deviceId:'gate-01',eventId:randomUUID(),occurredAt:now.toISOString()});
    assert.equal((await gate.scan(input())).result,'SEMESTER_NOT_CONFIGURED');
    assert.equal((await db.query('SELECT count(*)::int n FROM entry_logs')).rows[0].n,0);
    await db.query('INSERT INTO semesters(id,name,active,created_by) VALUES($1,$2,true,$3)',[semester,'2026 Term 1',actor]);
    const first=input(),entry=await gate.scan(first);
    assert.equal(entry.result,'ENTRY_RECORDED_WITH_NOTICE');assert.equal(entry.eventType,'ENTRY');
    // Discard the first response, retry the identical event after a simulated timeout.
    now=new Date(+now+6000);
    const retry=await gate.scan(first);assert.equal(retry.eventType,'ENTRY');assert.equal(retry.duplicate,true);
    await assert.rejects(gate.scan({...first,uid:'ABCDEF01'}),e=>e.code==='EVENT_CONFLICT');
    await db.query('UPDATE students SET active=false WHERE id=$1',[student]);
    assert.equal((await gate.scan(input())).result,'EXIT_RECORDED');
    now=new Date(+now+6000);
    assert.equal((await gate.scan(input())).result,'ENTRY_REJECTED_INACTIVE');
    await db.query('UPDATE students SET active=true WHERE id=$1',[student]);
    await db.query('INSERT INTO semester_validations(student_id,semester_id,uid,validated_by) VALUES($1,$2,$3,$4)',[student,semester,'12345678',actor]);
    assert.equal((await gate.scan(input())).result,'ENTRY_RECORDED');
    const duplicates=await Promise.all(Array.from({length:8},()=>gate.scan(input())));
    assert.ok(duplicates.every(r=>r.result==='DUPLICATE_SCAN'));
    await db.query('INSERT INTO violations(id,student_id,reported_by,description) VALUES($1,$2,$3,$4)',[randomUUID(),student,actor,'Private test description']);
    now=new Date(+now+6000);assert.equal((await gate.scan(input())).eventType,'EXIT','Violation must not block a trusted exit.');
    now=new Date(+now+6000);const notice=await gate.scan(input());
    assert.equal(notice.eventType,'ENTRY');assert.deepEqual(notice.notices,['REPORT_TO_OFFICE']);assert.ok(!JSON.stringify(notice).includes('Private test description'));
    now=new Date('2026-10-05T12:00:01.000Z');await gate.reconcile();
    assert.equal((await db.query('SELECT status,reason FROM student_presence WHERE student_id=$1',[student])).rows[0].reason,'MISSING_EXIT');
    const before=(await db.query('SELECT count(*)::int n FROM entry_logs')).rows[0].n;
    now=new Date('2026-10-06T00:00:00.000Z');
    assert.equal((await gate.scan(input())).recovery,'PREVIOUS_SESSION_MISSING_EXIT');
    assert.equal((await db.query('SELECT count(*)::int n FROM entry_logs')).rows[0].n,before+1);
    now=new Date(+now+6000);assert.equal((await gate.scan(input())).eventType,'EXIT');
    now=new Date('2026-10-06T12:00:01.000Z');await gate.reconcile();
    assert.equal((await db.query('SELECT status FROM student_presence WHERE student_id=$1',[student])).rows[0].status,'OUTSIDE');
    assert.equal((await gate.scan(input())).result,'SESSION_CLOSED');
    now=new Date('2026-10-07T00:00:00.000Z');
    await db.query("UPDATE student_presence SET status='UNKNOWN',reason='NETWORK_INTERRUPTION' WHERE student_id=$1",[student]);
    assert.equal((await gate.scan(input())).result,'PRESENCE_UNKNOWN');
    const presence=(await db.query('SELECT version FROM student_presence WHERE student_id=$1',[student])).rows[0];
    await gate.correct(student,{status:'OUTSIDE',reason:'Guard checked the student at entrance.',version:presence.version},actor);
    await assert.rejects(gate.correct(student,{status:'INSIDE',reason:'Stale correction attempt.',version:presence.version},actor),e=>e.code==='PRESENCE_CHANGED');
    assert.ok((await db.query('SELECT * FROM presence_changes WHERE actor_id=$1',[actor])).rowCount);
    const correction=(await db.query('SELECT * FROM student_presence WHERE student_id=$1',[student])).rows[0];
    assert.equal((await gate.scan({...input(),occurredAt:new Date(+now-60000).toISOString()})).result,'DELAYED_SCAN_REVIEW');
    assert.equal((await db.query('SELECT status FROM student_presence WHERE student_id=$1',[student])).rows[0].status,'OUTSIDE','Old queued scan cannot undo a later guard correction.');
    assert.equal((await gate.scan({...input(),occurredAt:null})).result,'DELAYED_SCAN_REVIEW');
    assert.equal((await db.query('SELECT status FROM student_presence WHERE student_id=$1',[student])).rows[0].status,'UNKNOWN');
    await assert.rejects(gate.correct(student,{status:'OUTSIDE',reason:'x',version:correction.version},actor),e=>e.code==='INVALID_CORRECTION');
    const delayedStudent=randomUUID();
    await db.query("INSERT INTO students(id,student_no,full_name,course,year_level,rfid_uid) VALUES($1,'DELAYED','Delayed Student','IT','1','ABCDEF01')",[delayedStudent]);
    assert.equal((await gate.scan({...input(),uid:'ABCDEF01',occurredAt:new Date(+now-60000).toISOString()})).result,'DELAYED_SCAN_REVIEW');
    assert.equal((await db.query('SELECT status FROM student_presence WHERE student_id=$1',[delayedStudent])).rows[0].status,'UNKNOWN','First delayed scan has no trusted presence to preserve.');
    // Inject a failure after the movement insert to verify the entire transaction rolls back.
    const rollbackStudent=randomUUID(),rollbackEvent={...input(),uid:'ABCDEF02'};
    await db.query("INSERT INTO students(id,student_no,full_name,course,year_level,rfid_uid) VALUES($1,'ROLLBACK','Rollback Student','IT','1','ABCDEF02')",[rollbackStudent]);
    const failingDb={query:db.query,transaction:work=>db.transaction(client=>work({query:(sql,values)=>{
      if(sql.startsWith('INSERT INTO sync_outbox'))throw new Error('Injected outbox failure');return client.query(sql,values);
    }}))};
    await assert.rejects(createGateService(failingDb,config,null,{clock:()=>now}).scan(rollbackEvent),e=>e.code==='DATABASE_UNAVAILABLE');
    assert.equal((await db.query('SELECT 1 FROM scan_events WHERE event_id=$1',[rollbackEvent.eventId])).rowCount,0);
    assert.equal((await db.query('SELECT 1 FROM entry_logs WHERE student_id=$1',[rollbackStudent])).rowCount,0);
    assert.equal((await db.query('SELECT 1 FROM student_presence WHERE student_id=$1',[rollbackStudent])).rowCount,0);
    assert.equal((await gate.scan(rollbackEvent)).eventType,'ENTRY');
    const restarted=createGateService(db,config,null,{clock:()=>now});
    assert.equal((await restarted.scan(rollbackEvent)).duplicate,true,'Retry after service restart uses persisted event.');
    assert.equal((await gate.scan({...input(),uid:'FFFFFFFF'})).result,'ID_NOT_REGISTERED');
    const app=createApp(config,{db,clock:()=>now});server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
    const base='http://127.0.0.1:'+server.address().port,route='/api/entry-logs/scan';
    const body=JSON.stringify(input()),timestamp=String(Date.now());
    const headers={'Content-Type':'application/json','X-Device-ID':config.deviceId,'X-Timestamp':timestamp,'X-Signature':sign(config.deviceKey,'POST',route,timestamp,body)};
    assert.equal((await fetch(base+route,{method:'POST',headers,body})).status,201);
    assert.equal((await fetch(base+route,{method:'POST',headers,body})).status,200);
    assert.equal((await fetch(base+route,{method:'POST',headers,body:body.replace('12345678','12345679')})).status,401);
    assert.equal((await fetch(base+route,{method:'POST',headers:{'Content-Type':'application/json','X-Device-Key':config.deviceKey},body})).status,401);
    const old=String(Date.now()-120000);
    assert.equal((await fetch(base+route,{method:'POST',headers:{...headers,'X-Timestamp':old,'X-Signature':sign(config.deviceKey,'POST',route,old,body)},body})).status,401);
    async function signed(raw,target=route){const stamp=String(Date.now());return fetch(base+target,{method:'POST',headers:{'Content-Type':'application/json','X-Device-ID':config.deviceId,'X-Timestamp':stamp,'X-Signature':sign(config.deviceKey,'POST',target,stamp,raw)},body:raw});}
    for(const invalid of [null,[],{...input(),uid:12345678},{...input(),uid:'A'},{...input(),direction:'IN'},{...input(),occurredAt:'2026-02-30T00:00:00.000Z'}])assert.equal((await signed(JSON.stringify(invalid))).status,422);
    assert.equal((await signed('{broken')).status,400);
    assert.equal((await signed(JSON.stringify({padding:'x'.repeat(3000)}))).status,413);
    assert.equal((await fetch(base+route,{method:'POST',headers:{...headers,'X-Device-ID':'wrong-device'},body})).status,401);
    const clockResponse=await signed(JSON.stringify({nonce:'b'.repeat(32)}),'/api/gate/time');assert.equal(clockResponse.status,200);
    assert.equal((await clockResponse.json()).data.nonce,'b'.repeat(32));
    const {gateHealth}=require('./health');
    await gate.heartbeat('DEGRADED');assert.equal((await gateHealth(db,config.deviceId,+now)).connection,'degraded');
    assert.equal((await gateHealth(db,config.deviceId,+now+16000)).connection,'offline');
    await gate.heartbeat();assert.equal((await gateHealth(db,config.deviceId,+now)).connection,'online');
    assert.equal((await fetch(base+'/api/gate/exceptions')).status,401);
    const password=randomUUID()+randomUUID();
    const hash=await require('bcryptjs').hash(password,4);
    await db.query('UPDATE users SET password_hash=$1 WHERE id=$2',[hash,actor]);
    async function login(username){const res=await fetch(base+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username,password})});assert.equal(res.status,200);const json=await res.json();return {Cookie:res.headers.get('set-cookie').split(';')[0],'X-CSRF-Token':json.data.csrfToken,'Content-Type':'application/json'};}
    const adminHeaders=await login('gate.test');
    for(const role of ['GUARD','REGISTRAR','DISCIPLINE']) {
      await db.query('INSERT INTO users(id,username,full_name,role,password_hash) VALUES($1,$2,$3,$4,$5)',[randomUUID(),role.toLowerCase(),role,role,hash]);
      const user=await login(role.toLowerCase());
      assert.equal((await fetch(base+'/api/semesters',{headers:user})).status,403);
      if(role!=='GUARD') assert.equal((await fetch(base+'/api/gate/presence/'+student,{headers:user})).status,403);
    }
    const term=await fetch(base+'/api/semesters',{method:'POST',headers:adminHeaders,body:JSON.stringify({name:'2026 Term 2'})});assert.equal(term.status,201);
    const termId=(await term.json()).data.id;
    assert.equal((await fetch(base+'/api/semesters/'+termId+'/active',{method:'PUT',headers:adminHeaders,body:'{}'})).status,200);
    for(const duplicate of [false,true]) {
      const res=await fetch(base+'/api/semesters/validation/'+student,{method:'POST',headers:adminHeaders,body:JSON.stringify({semesterId:termId,uid:'12345678'})});assert.equal(res.status,200);assert.equal((await res.json()).data.alreadyValidated,duplicate);
    }
    const noCsrf={...adminHeaders};delete noCsrf['X-CSRF-Token'];
    assert.equal((await fetch(base+'/api/semesters',{method:'POST',headers:noCsrf,body:JSON.stringify({name:'No CSRF'})})).status,403);
    assert.equal((await fetch(base+'/api/gate/recent?before=bad',{headers:adminHeaders})).status,422);
    const stream=await fetch(base+'/api/guard/stream',{headers:adminHeaders,signal:AbortSignal.timeout(4000)});
    assert.equal(stream.status,200);assert.match(stream.headers.get('content-type'),/text\/event-stream/);
    const reader=stream.body.getReader();const packet=new TextDecoder().decode((await reader.read()).value);assert.match(packet,/event: gate/);assert.ok(!packet.includes(config.deviceKey));await reader.cancel();
    assert.equal((await fetch(base+'/api/guard/stream')).status,401);
    const guardHeaders=await login('guard'),displays=[];
    try {
      for(let i=0;i<4;i++){const response=await fetch(base+'/api/guard/stream',{headers:guardHeaders});assert.equal(response.status,200);displays.push(response);}
      assert.equal((await fetch(base+'/api/guard/stream',{headers:guardHeaders})).status,429);
    }finally{for(const response of displays)await response.body.cancel();}
    await new Promise(resolve=>server.close(resolve));server=null;
    server=createApp({...config,gateRateLimit:2,gateIncomingRateLimit:4},{db}).listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
    const limitedBase='http://127.0.0.1:'+server.address().port,timeRoute='/api/gate/time',clockBody=JSON.stringify({nonce:'c'.repeat(32)}),stamp=String(Date.now());
    const clockHeaders={'Content-Type':'application/json','X-Device-ID':config.deviceId,'X-Timestamp':stamp,'X-Signature':sign(config.deviceKey,'POST',timeRoute,stamp,clockBody)};
    for(const expected of [200,200,429])assert.equal((await fetch(limitedBase+timeRoute,{method:'POST',headers:clockHeaders,body:clockBody})).status,expected);
    for(const expected of [401,429])assert.equal((await fetch(limitedBase+timeRoute,{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})).status,expected);
  } finally {if(server) await new Promise(resolve=>server.close(resolve));await db.close();await admin.query('DROP SCHEMA '+schema+' CASCADE');await admin.end();}
});
