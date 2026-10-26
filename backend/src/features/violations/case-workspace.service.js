const {randomUUID}=require('node:crypto');
const {ApiError}=require('../../shared/middleware/error-handler');
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const validId=id=>{if(!uuid.test(id))throw new ApiError(422,'INVALID_ID','Invalid case ID.');};
function createCaseWorkspace(db){
  async function summary(userId){
    return db.transaction(async client=>{
      await client.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY');
      const counts=(await client.query(`SELECT count(*) FILTER(WHERE status='ACTIVE')::int AS pending,
        count(*) FILTER(WHERE status='CLEARED')::int AS cleared,
        count(*) FILTER(WHERE status='ACTIVE' AND NOT EXISTS(SELECT 1 FROM violation_reads r WHERE r.violation_id=v.id AND r.user_id=$1))::int AS unread FROM violations v`,[userId])).rows[0];
      const reports=(await client.query(`SELECT v.id,s.full_name AS name,s.student_no AS "studentNo",v.description,v.created_at AS "createdAt"
        FROM violations v JOIN students s ON s.id=v.student_id WHERE v.status='ACTIVE'
        AND NOT EXISTS(SELECT 1 FROM violation_reads r WHERE r.violation_id=v.id AND r.user_id=$1)
        ORDER BY v.created_at DESC,v.id DESC LIMIT 20`,[userId])).rows;
      const latest=(await client.query('SELECT id,reported_by AS "reportedBy",created_at AS "createdAt" FROM violations ORDER BY created_at DESC,id DESC LIMIT 1')).rows[0]||null;
      return {...counts,reports,latest};
    });
  }
  async function read(id,userId){
    validId(id);
    const result=await db.query(`INSERT INTO violation_reads(violation_id,user_id) SELECT id,$2 FROM violations WHERE id=$1
      ON CONFLICT(violation_id,user_id) DO UPDATE SET read_at=violation_reads.read_at RETURNING violation_id`,[id,userId]);
    if(!result.rowCount)throw new ApiError(404,'VIOLATION_NOT_FOUND','Violation report not found.');
  }
  async function remark(id,body,userId){
    validId(id);
    if(!body||typeof body.remarks!=='string'||!body.remarks.trim()||body.remarks.trim().length>2000||!uuid.test(body.requestId||''))throw new ApiError(422,'INVALID_REMARK','Enter a remark of 1-2000 characters.');
    const value=body.remarks.trim();
    return db.transaction(async client=>{
      await client.query('SELECT pg_advisory_xact_lock(4,hashtext($1))',[body.requestId]);
      const prior=(await client.query('SELECT * FROM violation_remarks WHERE id=$1',[body.requestId])).rows[0];
      if(prior){if(prior.violation_id!==id||prior.author_id!==userId||prior.remarks!==value)throw new ApiError(409,'REMARK_CONFLICT','This submission was already used for a different remark.');return {id:prior.id,duplicate:true};}
      if(!(await client.query('SELECT 1 FROM violations WHERE id=$1',[id])).rowCount)throw new ApiError(404,'VIOLATION_NOT_FOUND','Violation report not found.');
      const row=(await client.query('INSERT INTO violation_remarks(id,violation_id,author_id,remarks) VALUES($1,$2,$3,$4) RETURNING *',[body.requestId,id,userId,value])).rows[0];
      await client.query('INSERT INTO audit_logs(id,actor_id,action,target_id) VALUES($1,$2,$3,$4)',[randomUUID(),userId,'VIOLATION_REMARK_ADDED',id]);
      await client.query('INSERT INTO sync_outbox(id,entity_type,entity_id,payload) VALUES($1,$2,$3,$4)',[randomUUID(),'violation_remarks',row.id,row]);
      return {id:row.id,duplicate:false};
    });
  }
  async function history(id,query={}){
    validId(id);const page=query.page??'1';
    if(Object.keys(query).some(key=>key!=='page')||typeof page!=='string'||!/^\d{1,5}$/.test(page)||Number(page)<1)throw new ApiError(422,'INVALID_PAGE','Choose a valid history page.');
    if(!(await db.query('SELECT 1 FROM violations WHERE id=$1',[id])).rowCount)throw new ApiError(404,'VIOLATION_NOT_FOUND','Violation report not found.');
    const rows=(await db.query(`SELECT * FROM (
      SELECT v.id,'REPORTED' AS action,v.created_at AS at,u.full_name AS author,v.remarks FROM violations v JOIN users u ON u.id=v.reported_by WHERE v.id=$1
      UNION ALL SELECT v.id,'CLEARED',v.cleared_at,u.full_name,NULL FROM violations v JOIN users u ON u.id=v.cleared_by WHERE v.id=$1 AND v.status='CLEARED'
      UNION ALL SELECT r.id,'REMARK',r.created_at,u.full_name,r.remarks FROM violation_remarks r JOIN users u ON u.id=r.author_id WHERE r.violation_id=$1
      ) events ORDER BY at DESC,id DESC,action LIMIT 21 OFFSET $2`,[id,(Number(page)-1)*20])).rows;
    return {records:rows.slice(0,20),page:Number(page),hasMore:rows.length>20};
  }
  return {summary,read,remark,history};
}
module.exports={createCaseWorkspace};
