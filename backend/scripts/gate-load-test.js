const {randomUUID}=require('node:crypto');
const {readdir,readFile}=require('node:fs/promises');
const path=require('node:path');
const assert=require('node:assert/strict');
const {Client}=require('pg');
const {createDatabase}=require('../src/database/client');
const {createApp}=require('../src/app/app');
const {sign}=require('../src/features/gate/device-security');
async function main(){
  const admin=new Client({connectionString:process.env.DATABASE_URL});await admin.connect();
  const schema='test_gate_load_'+randomUUID().replaceAll('-','');await admin.query('CREATE SCHEMA '+schema);
  const url=new URL(process.env.DATABASE_URL);url.searchParams.set('options','-c search_path='+schema);
  const db=createDatabase(url.toString());let server;
  try {
    const dir=path.join(__dirname,'../src/database/migrations');for(const name of(await readdir(dir)).filter(f=>f.endsWith('.sql')).sort())await db.query(await readFile(path.join(dir,name),'utf8'));
    const actor=randomUUID(),term=randomUUID();await db.query("INSERT INTO users(id,username,full_name,role,password_hash) VALUES($1,'load.test','Load Test','ADMIN','test')",[actor]);
    await db.query('INSERT INTO semesters(id,name,active,created_by) VALUES($1,$2,true,$3)',[term,'Load test semester',actor]);
    for(let i=0;i<650;i++)await db.query("INSERT INTO students(id,student_no,full_name,course,year_level,rfid_uid) VALUES($1,$2,$3,'IT','1',$4)",[randomUUID(),'LOAD-'+i,'Load Student '+i,(i+1).toString(16).padStart(8,'0').toUpperCase()]);
    const realtime=process.argv.includes('--realtime'),clockStart=performance.now(),schoolStart=Date.parse('2026-10-05T00:00:00.000Z');
    let now=new Date(schoolStart);const clock=()=>realtime?new Date(schoolStart+performance.now()-clockStart):now;
    const config={gateEnabled:true,deviceId:'gate-01',deviceKey:'d'.repeat(64)};
    const app=createApp(config,{db,clock});server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
    const base='http://127.0.0.1:'+server.address().port,route='/api/entry-logs/scan';
    async function send(index){const body=JSON.stringify({deviceId:config.deviceId,eventId:randomUUID(),uid:(index+1).toString(16).padStart(8,'0').toUpperCase(),occurredAt:clock().toISOString()}),stamp=String(Date.now()),start=performance.now();const res=await fetch(base+route,{method:'POST',headers:{'Content-Type':'application/json','X-Device-ID':config.deviceId,'X-Timestamp':stamp,'X-Signature':sign(config.deviceKey,'POST',route,stamp,body)},body});const result=await res.json();assert.equal(res.status,201,JSON.stringify(result));assert.equal(result.data.eventType,'ENTRY',`Scan ${index}: ${JSON.stringify(result)}`);return performance.now()-start;}
    async function phase(label,start,count,interval,advance){
      const began=performance.now(),memory=process.memoryUsage().rss,times=[],running=[],failures=[];
      for(let i=0;i<count;i++){
        const wait=began+i*interval-performance.now();if(wait>0)await new Promise(r=>setTimeout(r,wait));
        if(failures.length)break;
        if(advance)now=new Date(+now+3600);
        // Observe failures immediately, then drain in-flight requests before database cleanup.
        const job=send(start+i).then(ms=>times.push(ms)).catch(error=>failures.push(error));running.push(job);
        if(advance&&!interval)await job;
        if(i&&i%100===0)console.log(label+': '+i+'/'+count);
      }
      await Promise.all(running);if(failures.length)throw new AggregateError(failures,label+' failed');
      times.sort((a,b)=>a-b);console.log(JSON.stringify({phase:label,requests:count,elapsedSeconds:(performance.now()-began)/1000,meanMs:times.reduce((a,b)=>a+b,0)/count,p95Ms:times[Math.floor(count*.95)],p99Ms:times[Math.floor(count*.99)],errors:0,rssDeltaMiB:(process.memoryUsage().rss-memory)/1048576}));
    }
    await phase(process.argv.includes('--realtime')?'500 scans over 30 minutes':'500 scans accelerated over simulated 30 minutes',0,500,process.argv.includes('--realtime')?3600:0,true);
    await phase('5 requests per second',500,50,200,false);
    await phase('10 requests per second',550,100,100,false);
    assert.equal((await db.query('SELECT count(*)::int n FROM entry_logs')).rows[0].n,650);
    assert.equal((await db.query("SELECT count(*)::int n FROM student_presence WHERE status='INSIDE'")).rows[0].n,650);
    assert.equal((await db.query('SELECT 1 FROM scan_events e JOIN students s ON s.id=e.student_id WHERE e.uid<>s.rfid_uid')).rowCount,0);
    assert.equal((await db.query('SELECT student_id FROM entry_logs GROUP BY student_id HAVING count(*)<>1')).rowCount,0);
    assert.equal((await db.query("SELECT 1 FROM student_presence p JOIN scan_events e ON e.id=p.last_gate_event_id WHERE p.student_id<>e.student_id OR e.result->>'eventType'<>'ENTRY'")).rowCount,0);
    console.log('PASS: 650 separate students, 650 entries, 650 INSIDE states. Isolated test data only.');
  }finally{if(server)await new Promise(r=>server.close(r));await db.close();await admin.query('DROP SCHEMA '+schema+' CASCADE');await admin.end();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
