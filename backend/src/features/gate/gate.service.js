const {randomUUID,createHash}=require('node:crypto');
const {ApiError}=require('../../shared/middleware/error-handler');
const {schoolSession}=require('./session');

function createGateService(db,config,devices,{clock=()=>new Date()}={}) {
  async function expire(client,studentId,now) {
    const changed=await client.query(`UPDATE student_presence SET status='UNKNOWN',reason='MISSING_EXIT',version=version+1,updated_at=$1
      WHERE status='INSIDE' AND session_end <= $1 AND ($2::uuid IS NULL OR student_id=$2) RETURNING *`,[now,studentId]);
    for(const row of changed.rows) await client.query(`INSERT INTO presence_changes(id,student_id,previous_status,new_status,reason,related_event_id,created_at)
      VALUES($1,$2,'INSIDE','UNKNOWN','MISSING_EXIT',$3,$4)`,[randomUUID(),row.student_id,row.last_gate_event_id,now]);
  }
  async function reconcile() { await db.transaction(client=>expire(client,null,clock())); }
  async function heartbeat(state='ONLINE') {
    await db.query(`INSERT INTO gate_device_health(device_id,last_seen_at,state) VALUES($1,$2,$3)
      ON CONFLICT(device_id) DO UPDATE SET last_seen_at=EXCLUDED.last_seen_at,state=EXCLUDED.state`,[config.deviceId,clock(),state]);
    devices?.heartbeat(config.deviceId);
  }
  async function scan(input) {
    if(input.deviceId!==config.deviceId) throw new ApiError(403,'DEVICE_NOT_ALLOWED','Device is not configured.');
    const fingerprint=createHash('sha256').update(JSON.stringify([input.uid,input.occurredAt ?? null])).digest('hex');
    const result=await db.transaction(async client=> {
      await client.query('SELECT pg_advisory_xact_lock(2,hashtext($1))',[input.deviceId+':'+input.eventId]);
      const prior=(await client.query('SELECT uid,result,request_hash FROM scan_events WHERE device_id=$1 AND event_id=$2',[input.deviceId,input.eventId])).rows[0];
      if(prior) {
        if(prior.uid!==input.uid || (prior.request_hash && prior.request_hash!==fingerprint)) throw new ApiError(409,'EVENT_CONFLICT','Event ID already belongs to different scan data.');
        return {...prior.result,duplicate:true};
      }
      const student=(await client.query('SELECT id,full_name,active FROM students WHERE rfid_uid=$1 FOR UPDATE',[input.uid])).rows[0];
      const now=clock(),session=schoolSession(now,config);
      let presence, direction=null,reason=null;
      let response={eventId:input.eventId,eventType:null,result:'ID_NOT_REGISTERED',status:'unknown',message:'ID NOT REGISTERED',receivedAt:now.toISOString(),duplicate:false,notices:[]};
      if(student) {
        await client.query("INSERT INTO student_presence(student_id,status) VALUES($1,'OUTSIDE') ON CONFLICT DO NOTHING",[student.id]);
        // Student and presence locks serialize scans with corrections and reconciliation.
        await client.query('SELECT student_id FROM student_presence WHERE student_id=$1 FOR UPDATE',[student.id]);
        await expire(client,student.id,now);
        presence=(await client.query('SELECT *,session_date::text AS session_date FROM student_presence WHERE student_id=$1',[student.id])).rows[0];
        const last=(await client.query('SELECT scanned_at FROM entry_logs WHERE student_id=$1 ORDER BY scanned_at DESC LIMIT 1',[student.id])).rows[0];
        const occurred=input.occurredAt ? new Date(input.occurredAt) : null;
        const delayed=input.occurredAt===null || (occurred && (now-occurred > (config.gateMaxDelaySeconds || 15)*1000 || occurred-now>5000));
        const setResult=(result,message,status='blocked')=> {response={...response,result,message,status};};
        if(delayed) {
          setResult('DELAYED_SCAN_REVIEW','DELAYED SCAN - PLEASE SEE GUARD');
          // An old queued event must never undo a newer movement or human correction.
          if(presence.version===1 || !occurred || occurred>=new Date(presence.updated_at)) reason='NETWORK_INTERRUPTION';
        } else if(last && now-new Date(last.scanned_at)<(config.gateDuplicateSeconds || 5)*1000) {
          setResult('DUPLICATE_SCAN','CARD ALREADY READ','ignored');
        } else {
          const oldMissing=presence.status==='UNKNOWN' && presence.reason==='MISSING_EXIT' && presence.session_date && String(presence.session_date).slice(0,10)<session.date;
          const acceptedToday=oldMissing && (await client.query('SELECT 1 FROM entry_logs WHERE student_id=$1 AND scanned_at >= $2 LIMIT 1',[student.id,session.start])).rowCount;
          if(presence.status==='UNKNOWN' && !(oldMissing && session.open && !acceptedToday)) setResult('PRESENCE_UNKNOWN','PRESENCE NOT CONFIRMED - SEE GUARD');
          else if(presence.status==='INSIDE') {
            direction='OUT'; setResult('EXIT_RECORDED','EXIT RECORDED','ok');
          } else if(!student.active) setResult('ENTRY_REJECTED_INACTIVE','ENROLLMENT INACTIVE - SEE OFFICE');
          else if(!session.open) setResult('SESSION_CLOSED','OUTSIDE SCHOOL HOURS - SEE GUARD');
          else {
            const semester=(await client.query('SELECT id FROM semesters WHERE active')).rows[0];
            if(!semester) setResult('SEMESTER_NOT_CONFIGURED','SCHOOL SEMESTER NOT CONFIGURED');
            else {
              response.semesterId=semester.id;
              const validated=(await client.query('SELECT 1 FROM semester_validations WHERE student_id=$1 AND semester_id=$2 AND uid=$3',[student.id,semester.id,input.uid])).rowCount;
              const alert=(await client.query("SELECT 1 FROM violations WHERE student_id=$1 AND status='ACTIVE' LIMIT 1",[student.id])).rowCount;
              if(!validated) response.notices.push('ID_NOT_VALIDATED');
              if(alert) response.notices.push('REPORT_TO_OFFICE');
              direction='IN'; setResult(response.notices.length ? 'ENTRY_RECORDED_WITH_NOTICE':'ENTRY_RECORDED',!validated?'ID NOT VALIDATED - SEE OFFICE':alert?'PLEASE REPORT TO OFFICE':'ENTRY RECORDED',response.notices.length?'alert':'ok');
              if(oldMissing) response.recovery='PREVIOUS_SESSION_MISSING_EXIT';
            }
          }
        }
        if(direction) response.displayName=student.full_name.split(/\s+/)[0];
      }
      response.eventType=direction==='IN'?'ENTRY':direction==='OUT'?'EXIT':null;
      response.type=direction;
      const scanId=randomUUID();
      // Allocate ordered stream positions only after all decision locks are held.
      await client.query('SELECT pg_advisory_xact_lock(7914003)');
      await client.query(`INSERT INTO scan_events(id,device_id,event_id,uid,result,received_at,student_id,occurred_at_device,request_hash)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,[scanId,input.deviceId,input.eventId,input.uid,response,now,student?.id||null,input.occurredAt||null,fingerprint]);
      if(direction) {
        const row=(await client.query('INSERT INTO entry_logs(id,student_id,scan_id,device_id,direction,scanned_at) VALUES($1,$2,$3,$4,$5,$6) RETURNING *',[randomUUID(),student.id,scanId,input.deviceId,direction,now])).rows[0];
        await client.query(`UPDATE student_presence SET status=$2,reason=NULL,last_gate_event_id=$3,session_date=$4,session_end=$5,version=version+1,updated_at=$6 WHERE student_id=$1`,[student.id,direction==='IN'?'INSIDE':'OUTSIDE',scanId,session.date,session.end,now]);
        await client.query('INSERT INTO sync_outbox(id,entity_type,entity_id,payload) VALUES($1,$2,$3,$4)',[randomUUID(),'entry_logs',row.id,row]);
      } else if(reason) {
        await client.query(`UPDATE student_presence SET status='UNKNOWN',reason=$2,version=version+1,updated_at=$3 WHERE student_id=$1`,[student.id,reason,now]);
        await client.query('INSERT INTO presence_changes(id,student_id,previous_status,new_status,reason,related_event_id,created_at) VALUES($1,$2,$3,$4,$5,$6,$7)',[randomUUID(),student.id,presence.status,'UNKNOWN',reason,scanId,now]);
      }
      return response;
    });
    // A health write failure must not turn a committed scan into a lost result.
    await heartbeat().catch(()=>{});
    if(config.gateLogEvents) console.info(JSON.stringify({scope:'GATE',deviceId:input.deviceId,eventId:input.eventId,result:result.result,eventType:result.eventType,duplicate:result.duplicate}));
    return result;
  }
  async function correct(studentId,input,actorId) {
    if(!['INSIDE','OUTSIDE'].includes(input?.status) || Object.keys(input).some(key=>!['status','reason','version'].includes(key)) || typeof input.reason!=='string' || input.reason.trim().length<5 || input.reason.trim().length>500 || !Number.isInteger(input.version)) throw new ApiError(422,'INVALID_CORRECTION','Choose presence and give a reason of 5-500 characters.');
    return db.transaction(async client=> {
      if(!(await client.query('SELECT id FROM students WHERE id=$1 FOR UPDATE',[studentId])).rowCount) throw new ApiError(404,'NOT_FOUND','Student not found.');
      await client.query("INSERT INTO student_presence(student_id,status) VALUES($1,'OUTSIDE') ON CONFLICT DO NOTHING",[studentId]);
      const old=(await client.query('SELECT * FROM student_presence WHERE student_id=$1 FOR UPDATE',[studentId])).rows[0];
      if(old.version!==input.version) throw new ApiError(409,'PRESENCE_CHANGED','Presence changed. Refresh and check before correcting.');
      const now=clock(),session=schoolSession(now,config),id=randomUUID();
      await client.query('INSERT INTO presence_changes(id,student_id,previous_status,new_status,reason,actor_id,related_event_id,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',[id,studentId,old.status,input.status,input.reason.trim(),actorId,old.last_gate_event_id,now]);
      await client.query('UPDATE student_presence SET status=$2,reason=NULL,session_date=$3,session_end=$4,updated_at=$5,version=version+1 WHERE student_id=$1',[studentId,input.status,session.date,session.end,now]);
      await client.query('INSERT INTO audit_logs(id,actor_id,action,target_id) VALUES($1,$2,$3,$4)',[randomUUID(),actorId,'PRESENCE_CORRECTED',id]);
      return {id};
    });
  }
  return {scan,correct,reconcile,heartbeat};
}
module.exports={createGateService};
