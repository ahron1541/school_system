const express = require('express');
const { createViolationsService } = require('./violations.service');
const {createCaseWorkspace}=require('./case-workspace.service');

function violationsRoutes(db, auth) {
  const router = express.Router();
  const service = createViolationsService(db);
  const workspace=createCaseWorkspace(db);
  router.use(auth.requireAuth, auth.allow('ADMIN','GUARD','DISCIPLINE'));
  router.get('/', async (req, res) => res.json({ success: true, message: 'Violations retrieved.', data: await service.list(req.query,req.auth.user.id) }));
  router.get('/summary',async(req,res)=>res.json({success:true,data:await workspace.summary(req.auth.user.id)}));
  router.post('/:id/read',async(req,res)=>{await workspace.read(req.params.id,req.auth.user.id);res.json({success:true,data:null});});
  router.get('/:id/history',async(req,res)=>res.json({success:true,data:await workspace.history(req.params.id,req.query)}));
  router.post('/:id/remarks',auth.allow('ADMIN','DISCIPLINE'),async(req,res)=>{const data=await workspace.remark(req.params.id,req.body,req.auth.user.id);res.status(data.duplicate?200:201).json({success:true,data});});
  router.get('/types',async(req,res)=>res.json({success:true,data:{types:await service.types(),today:new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Manila',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())}}));
  router.get('/students',async(req,res)=>res.json({success:true,data:await service.students(req.query)}));
  router.get('/recent-students',async(req,res)=>res.json({success:true,data:await service.recentStudents()}));
  router.get('/:id',async(req,res)=>res.json({success:true,data:await service.detail(req.params.id)}));
  router.get('/:id/gate-activity', auth.allow('ADMIN','DISCIPLINE'), async (req, res) => res.json({ success: true, message: 'Case gate records retrieved.', data: await service.gateActivity(req.params.id, req.query) }));
  router.post('/', auth.allow('ADMIN','GUARD','DISCIPLINE'), async (req, res) => {
    const data = await service.report(req.body, req.auth.user.id);
    res.status(data.duplicate ? 200 : 201).json({ success: true, message: 'Violation recorded.', data });
  });
  router.patch('/:id/clear', auth.allow('ADMIN','DISCIPLINE'), async (req, res) => {
    await service.clear(req.params.id, req.auth.user.id);
    res.json({ success: true, message: 'Violation cleared.', data: null });
  });
  return router;
}
module.exports = { violationsRoutes };
