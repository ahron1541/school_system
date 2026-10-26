const express=require('express');
const {createHmac}=require('node:crypto');
const {ApiError}=require('../../shared/middleware/error-handler');
const {gateDeviceHttp}=require('./device-security');
const {uuid}=require('./semesters');
function gateDeviceRoutes(config,service) {
  const router=express.Router(); const security=gateDeviceHttp(config);
  router.post('/time',security,(req,res)=> {
    const nonce=req.body?.nonce;
    if(typeof nonce!=='string' || !/^[a-f0-9-]{32,40}$/.test(nonce)) throw new ApiError(422,'INVALID_NONCE','Invalid clock request.');
    const unixMs=Date.now();
    res.json({success:true,data:{nonce,unixMs,signature:createHmac('sha256',config.deviceKey).update(nonce+'\n'+unixMs).digest('hex')}});
  });
  router.post('/heartbeat',security,async(req,res)=> {
    if(!['ONLINE','DEGRADED'].includes(req.body?.state)) throw new ApiError(422,'INVALID_STATE','Invalid device state.');
    await service.heartbeat(req.body.state); res.json({success:true,data:{serverTime:new Date().toISOString()}});
  }); return router;
}
function gateStaffRoutes(db,config,service,auth) {
  const router=express.Router(); router.use(auth.requireAuth,auth.allow('ADMIN','GUARD'));
  router.get('/recent',async(req,res)=> {
    const before=req.query.before||'9223372036854775807';
    if(typeof before!=='string'||!/^\d{1,19}$/.test(before)||BigInt(before)>9223372036854775807n) throw new ApiError(422,'INVALID_CURSOR','Invalid activity cursor.');
    const rows=(await db.query(`SELECT e.sequence,e.id,e.received_at AS "receivedAt",e.result->>'message' AS message,e.result->>'type' AS direction,
      s.id AS "studentId",s.full_name AS name,s.student_no AS "studentNo" FROM scan_events e LEFT JOIN students s ON s.id=e.student_id
      WHERE e.device_id=$1 AND e.sequence<$2 ORDER BY e.sequence DESC LIMIT 26`,[config.deviceId,before])).rows;
    res.json({success:true,data:{items:rows.slice(0,25),next:rows.length>25?rows[24].sequence:null}});
  });
  router.get('/presence/:id',async(req,res)=> {
    if(!uuid(req.params.id)) throw new ApiError(422,'INVALID_ID','Invalid student.');
    await service.reconcile();
    const result=(await db.query(`SELECT s.id,s.full_name AS name,COALESCE(p.status,'OUTSIDE') AS status,p.reason,
      COALESCE(p.version,1) AS version,p.updated_at,p.last_gate_event_id FROM students s LEFT JOIN student_presence p ON p.student_id=s.id WHERE s.id=$1`,[req.params.id])).rows[0];
    if(!result) throw new ApiError(404,'NOT_FOUND','Student not found.');
    const history=(await db.query('SELECT previous_status,new_status,reason,actor_id,created_at FROM presence_changes WHERE student_id=$1 ORDER BY created_at DESC LIMIT 20',[req.params.id])).rows;
    res.json({success:true,data:{...result,history}});
  });
  router.post('/presence/:id/correction',async(req,res)=> {
    if(!uuid(req.params.id)) throw new ApiError(422,'INVALID_ID','Invalid student.');
    res.json({success:true,data:await service.correct(req.params.id,req.body,req.auth.user.id)});
  });
  router.get('/exceptions',async(req,res)=> {
    await service.reconcile();
    const rows=(await db.query(`SELECT p.student_id AS id,s.full_name AS name,s.student_no AS "studentNo",p.reason,p.version,p.updated_at
      FROM student_presence p JOIN students s ON s.id=p.student_id WHERE p.status='UNKNOWN' ORDER BY p.updated_at DESC LIMIT 100`)).rows;
    res.json({success:true,data:rows});
  });
  router.get('/configuration',async(req,res)=>res.json({success:true,data:{sessionStart:config.schoolSessionStart||'07:00',sessionEnd:config.schoolSessionEnd||'20:00',semester:(await db.query('SELECT id,name FROM semesters WHERE active')).rows[0]||null}}));
  return router;
}
module.exports={gateDeviceRoutes,gateStaffRoutes};
