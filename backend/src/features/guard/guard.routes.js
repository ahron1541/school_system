const express = require('express');
const { createGuardService } = require('./guard.service');
const {ApiError}=require('../../shared/middleware/error-handler');

function guardRoutes(db, config, devices, auth) {
  const router = express.Router();
  const service = createGuardService(db, config, devices);
  const connections=new Map();
  router.use(auth.requireAuth, auth.allow('ADMIN', 'GUARD'));
  router.get('/stream',async(req,res)=> {
    const userId=req.auth.user.id,count=connections.get(userId)||0;
    if(count>=4) throw new ApiError(429,'TOO_MANY_DISPLAYS','Close an unused gate display before opening another.');
    connections.set(userId,count+1);
    res.set({'Content-Type':'text/event-stream','Cache-Control':'no-store','Connection':'keep-alive','X-Accel-Buffering':'no'});res.flushHeaders();
    let stopped=false,timer;
    const suppliedCursor=req.get('Last-Event-ID')||'';
    let cursor=/^\d{1,19}$/.test(suppliedCursor)&&BigInt(suppliedCursor)<=9223372036854775807n?suppliedCursor:null;
    res.once('close',()=>{stopped=true;clearTimeout(timer);const remaining=(connections.get(userId)||1)-1;if(remaining)connections.set(userId,remaining);else connections.delete(userId);});
    async function send() {
      try {
        const session=await auth.checkSession(req);
        if(!['ADMIN','GUARD'].includes(session.user.role)||session.user.mustChangePassword) throw new ApiError(403,'SESSION_CHANGED','Session closed.');
        if(cursor===null)cursor=(await db.query('SELECT COALESCE(max(sequence),0)::text AS cursor FROM scan_events WHERE device_id=$1',[config.deviceId])).rows[0].cursor;
        const state=req.query.display==='1'?await service.latest(true):await service.dashboard();
        const events=(await db.query('SELECT sequence FROM scan_events WHERE device_id=$1 AND sequence>$2 ORDER BY sequence LIMIT 100',[config.deviceId,cursor])).rows;
        if(events.length) cursor=events.at(-1).sequence;
        if(!stopped && !res.write(`id: ${cursor}\nevent: gate\ndata: ${JSON.stringify({...state,eventIds:events.map(e=>e.sequence)})}\n\n`)) {res.end();stopped=true;}
      } catch(error) {
        if(!stopped) {res.write(`event: ${error.status===401||error.status===403?'session-expired':'unavailable'}\ndata: {}\n\n`);res.end();stopped=true;}
      }
      if(!stopped) timer=setTimeout(send,750);
    }
    send();
  });
  router.get('/dashboard', async (req, res) => res.json({ success: true, message: 'Guard post status.', data: await service.dashboard() }));
  router.get('/display', async (req, res) => res.json({ success: true, message: 'Scan display status.', data: await service.latest(true) }));
  return router;
}
module.exports = { guardRoutes };
