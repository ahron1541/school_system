const express = require('express');
const { randomUUID } = require('node:crypto');
const { ApiError } = require('../../shared/middleware/error-handler');
const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
function semesterRoutes(db, auth) {
  const router = express.Router();
  router.use(auth.requireAuth, auth.allow('ADMIN'));
  router.get('/', async (req,res) => res.json({ success:true, data:(await db.query('SELECT id,name,active,created_at FROM semesters ORDER BY created_at DESC')).rows }));
  router.post('/', async (req,res) => {
    const { name } = req.body || {};
    if (typeof name !== 'string' || !name.trim() || name.trim().length > 100 || Object.keys(req.body).some(k=>k!=='name')) throw new ApiError(422,'INVALID_SEMESTER','Enter a semester name up to 100 characters.');
    try {
      const result = await db.transaction(async client => {
        const row = (await client.query('INSERT INTO semesters(id,name,created_by) VALUES($1,$2,$3) RETURNING *',[randomUUID(),name.trim(),req.auth.user.id])).rows[0];
        await client.query('INSERT INTO audit_logs(id,actor_id,action,target_id) VALUES($1,$2,$3,$4)',[randomUUID(),req.auth.user.id,'SEMESTER_CREATED',row.id]); return row;
      });
      res.status(201).json({success:true,data:result});
    } catch(error) { if(error.code==='23505') throw new ApiError(409,'SEMESTER_EXISTS','That semester already exists.'); throw error; }
  });
  router.put('/:id/active', async(req,res) => {
    if(!uuid(req.params.id)) throw new ApiError(422,'INVALID_ID','Invalid semester.');
    if(req.body && Object.keys(req.body).length) throw new ApiError(422,'INVALID_SEMESTER','Unexpected semester settings.');
    await db.transaction(async client => {
      await client.query('SELECT pg_advisory_xact_lock(7914002)');
      if(!(await client.query('SELECT id FROM semesters WHERE id=$1',[req.params.id])).rowCount) throw new ApiError(404,'NOT_FOUND','Semester not found.');
      await client.query('UPDATE semesters SET active=false WHERE active');
      await client.query('UPDATE semesters SET active=true WHERE id=$1',[req.params.id]);
      await client.query('INSERT INTO audit_logs(id,actor_id,action,target_id) VALUES($1,$2,$3,$4)',[randomUUID(),req.auth.user.id,'SEMESTER_ACTIVATED',req.params.id]);
    }); res.json({success:true,data:null});
  });
  router.get('/validation/:studentId',async(req,res)=> {
    if(!uuid(req.params.studentId)) throw new ApiError(422,'INVALID_ID','Invalid student.');
    const result = await db.query(`SELECT sem.id AS "semesterId",sem.name,sv.validated_at AS "validatedAt",sv.validated_by AS "validatedBy"
      FROM semesters sem LEFT JOIN semester_validations sv ON sv.semester_id=sem.id AND sv.student_id=$1
      AND sv.uid=(SELECT rfid_uid FROM students WHERE id=$1) WHERE sem.active`,[req.params.studentId]);
    res.json({success:true,data:result.rows[0] || null});
  });
  router.post('/validation/:studentId',async(req,res)=> {
    if(!uuid(req.params.studentId) || !uuid(req.body?.semesterId)) throw new ApiError(422,'INVALID_ID','Choose a student and current semester.');
    if(typeof req.body.uid!=='string'||Object.keys(req.body).some(key=>!['semesterId','uid'].includes(key))) throw new ApiError(422,'INVALID_VALIDATION','Provide only the current semester and assigned RFID.');
    const result=await db.transaction(async client=> {
      await client.query('SELECT pg_advisory_xact_lock(7914002)');
      const semester=(await client.query('SELECT id FROM semesters WHERE active')).rows[0];
      if(!semester) throw new ApiError(409,'SEMESTER_NOT_CONFIGURED','Configure a current semester first.');
      if(semester.id!==req.body.semesterId) throw new ApiError(409,'SEMESTER_CHANGED','The current semester changed. Refresh before validating.');
      const student=(await client.query('SELECT rfid_uid,active FROM students WHERE id=$1 FOR UPDATE',[req.params.studentId])).rows[0];
      if(!student) throw new ApiError(404,'NOT_FOUND','Student not found.');
      if(!student.active || !student.rfid_uid) throw new ApiError(409,'NOT_ELIGIBLE','An active student with a registered RFID is required.');
      if(req.body.uid!==student.rfid_uid) throw new ApiError(409,'CARD_CHANGED','The assigned RFID changed. Refresh before validating.');
      const saved=await client.query(`INSERT INTO semester_validations(student_id,semester_id,uid,validated_by) VALUES($1,$2,$3,$4)
        ON CONFLICT DO NOTHING RETURNING *`,[req.params.studentId,semester.id,student.rfid_uid,req.auth.user.id]);
      if(saved.rowCount) await client.query('INSERT INTO audit_logs(id,actor_id,action,target_id) VALUES($1,$2,$3,$4)',[randomUUID(),req.auth.user.id,'SEMESTER_RFID_VALIDATED',req.params.studentId]);
      return { alreadyValidated:!saved.rowCount };
    }); res.json({success:true,data:result});
  });
  return router;
}
module.exports={semesterRoutes,uuid};
