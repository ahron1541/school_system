const { randomUUID } = require('node:crypto');
const { ApiError } = require('../../shared/middleware/error-handler');
const {validateReport,listFilters}=require('./violations.validation');
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;

function createViolationsService(db) {
  async function gateActivity(id, query) {
    const date = query.date;
    const page = query.page ?? '1';
    if (!uuid.test(id)) throw new ApiError(422, 'INVALID_ID', 'Invalid violation ID.');
    if (Object.keys(query).some((key) => !['date','page'].includes(key)) || typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date) || date.startsWith('0000') || Number.isNaN(Date.parse(date)) || new Date(date).toISOString().slice(0,10) !== date || typeof page !== 'string' || !/^[1-9]\d*$/.test(page) || Number(page) > 100000) throw new ApiError(422, 'INVALID_CASE_FILTER', 'Choose a valid date and page.');
    return db.transaction(async (client) => {
      await client.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY');
      const report = (await client.query('SELECT v.student_id,s.full_name,s.student_no FROM violations v JOIN students s ON s.id=v.student_id WHERE v.id=$1', [id])).rows[0];
      if (!report) throw new ApiError(404, 'VIOLATION_NOT_FOUND', 'Violation report not found.');
      // The report determines the student; clients cannot request another student's logs.
      const where = "student_id=$1 AND scanned_at >= ($2::date::timestamp AT TIME ZONE 'Asia/Manila') AND scanned_at < (($2::date+1)::timestamp AT TIME ZONE 'Asia/Manila')";
      const values = [report.student_id, date];
      const total = Number((await client.query('SELECT count(*) FROM entry_logs WHERE '+where, values)).rows[0].count);
      const events = (await client.query('SELECT id,direction,device_id AS gate,scanned_at AS "scannedAt" FROM entry_logs WHERE '+where+' ORDER BY scanned_at DESC,id DESC LIMIT 50 OFFSET $3', [...values,(Number(page)-1)*50])).rows;
      return { caseId: id, student: { name: report.full_name, studentNo: report.student_no }, date, events, pagination: { page: Number(page), pageSize: 50, total, totalPages: Math.max(1, Math.ceil(total/50)) } };
    });
  }
  const selection=`SELECT v.id,v.student_id AS "studentId",s.full_name AS name,s.student_no AS "studentNo",
    s.course,s.year_level AS year,s.section,CASE WHEN EXISTS(SELECT 1 FROM student_photos p WHERE p.student_id=s.id) THEN '/api/students/'||s.id||'/photo?size=thumbnail' ELSE NULL END AS photo,
    v.description,v.status,v.created_at AS "createdAt",v.cleared_at AS "clearedAt",u.full_name AS "reportedBy",
    c.full_name AS "clearedBy",v.offense_code AS "offenseCode",t.name AS "offenseName",v.custom_offense AS "customOffense",
    to_char(v.offense_date,'YYYY-MM-DD') AS "offenseDate",to_char(v.valid_from,'YYYY-MM-DD') AS "validFrom",
    to_char(v.valid_until,'YYYY-MM-DD') AS "validUntil",v.remarks
    FROM violations v JOIN students s ON s.id=v.student_id JOIN users u ON u.id=v.reported_by
    LEFT JOIN users c ON c.id=v.cleared_by LEFT JOIN offense_types t ON t.code=v.offense_code`;
  async function list(query={},userId) {
    const f=listFilters(query),values=[],conditions=[];
    const add=(sql,value)=>{values.push(value);conditions.push(sql.replace('?',`$${values.length}`));};
    if(f.search) add("concat_ws(' ',s.full_name,s.student_no,v.description,t.name,v.custom_offense) ILIKE ?",'%'+f.search+'%');
    if(f.status) add('v.status=?',f.status);
    if(f.offense) add('v.offense_code=?',f.offense);
    if(f.from) add("COALESCE(v.offense_date,(v.created_at AT TIME ZONE 'Asia/Manila')::date)>=?::date",f.from);
    if(f.to) add("COALESCE(v.offense_date,(v.created_at AT TIME ZONE 'Asia/Manila')::date)<=?::date",f.to);
    const where=conditions.length?' WHERE '+conditions.join(' AND '):'';
    const order={newest:'v.created_at DESC,v.id DESC',oldest:'v.created_at ASC,v.id ASC',student:'s.full_name ASC,v.id ASC'}[f.sort];
    return db.transaction(async client=>{
      await client.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ, READ ONLY');
      const total=Number((await client.query('SELECT count(*) FROM violations v JOIN students s ON s.id=v.student_id LEFT JOIN offense_types t ON t.code=v.offense_code'+where,values)).rows[0].count);
      const totalPages=Math.max(1,Math.ceil(total/f.pageSize)),page=Math.min(f.page,totalPages);
      const records=(await client.query(selection+where+` ORDER BY ${order} LIMIT $${values.length+1} OFFSET $${values.length+2}`,[...values,f.pageSize,(page-1)*f.pageSize])).rows;
      const readIds=new Set(userId?(await client.query('SELECT violation_id FROM violation_reads WHERE user_id=$1 AND violation_id=ANY($2::uuid[])',[userId,records.map(row=>row.id)])).rows.map(row=>row.violation_id):[]);
      for(const record of records)record.isNew=!!userId&&record.status==='ACTIVE'&&!readIds.has(record.id);
      return {records,pagination:{page,pageSize:f.pageSize,total,totalPages}};
    });
  }
  async function types(){return (await db.query("SELECT code,name FROM offense_types WHERE active ORDER BY sort_order,name")).rows;}
  async function detail(id){
    if(!uuid.test(id)) throw new ApiError(422,'INVALID_ID','Invalid violation ID.');
    const record=(await db.query(selection+' WHERE v.id=$1',[id])).rows[0];
    if(!record) throw new ApiError(404,'VIOLATION_NOT_FOUND','Violation report not found.');
    return record;
  }
  async function students(query={}){
    if(Object.keys(query).some(key=>key!=='search')||typeof query.search!=='string'||query.search.trim().length<2||query.search.length>120) throw new ApiError(422,'INVALID_SEARCH','Enter 2-120 characters to find a student.');
    return (await db.query(`SELECT s.id,s.full_name AS name,s.student_no AS "studentNo",s.course,s.year_level AS year,s.section,
      CASE WHEN EXISTS(SELECT 1 FROM student_photos p WHERE p.student_id=s.id) THEN '/api/students/'||s.id||'/photo?size=thumbnail' ELSE NULL END AS photo
      FROM students s WHERE full_name ILIKE $1 OR student_no ILIKE $1 ORDER BY full_name,id LIMIT 20`,['%'+query.search.trim()+'%'])).rows;
  }
  async function report(body, actorId) {
    const input=validateReport(body);
    const {studentId,requestId}=input;
    return db.transaction(async (client) => {
      if (requestId) {
        await client.query('SELECT pg_advisory_xact_lock(3,hashtext($1))', [actorId + ':' + requestId]);
        const prior = (await client.query('SELECT * FROM violations WHERE reported_by=$1 AND request_id=$2', [actorId, requestId])).rows[0];
        if (prior) {
          const date=value=>value?new Date(value).toLocaleDateString('en-CA'):null;
          if (prior.student_id !== studentId || prior.offense_code!==input.offenseCode || prior.custom_offense!==input.customOffense || prior.remarks!==input.remarks ||
            (!input.offenseCode&&prior.description!==input.description) || (input.offenseDate&&date(prior.offense_date)!==input.offenseDate) || date(prior.valid_from)!==input.validFrom || date(prior.valid_until)!==input.validUntil) throw new ApiError(409, 'REPORT_CONFLICT', 'This submission was already used for a different report.');
          return { id: prior.id, duplicate: true };
        }
      }
      if (!(await client.query('SELECT 1 FROM students WHERE id=$1', [studentId])).rowCount) throw new ApiError(404, 'STUDENT_NOT_FOUND', 'Student not found.');
      if(input.offenseCode){
        const type=(await client.query('SELECT name FROM offense_types WHERE code=$1 AND active FOR SHARE',[input.offenseCode])).rows[0];
        if(!type){const error=new ApiError(422,'INVALID_OFFENSE','Choose an available offense.');error.fields={offenseCode:'Choose an available offense.'};throw error;}
        input.description=input.offenseCode==='OTHER'?input.customOffense:type.name;
      }
      const id = randomUUID();
      const { rows } = await client.query(`INSERT INTO violations(id,student_id,reported_by,description,request_id,offense_code,custom_offense,offense_date,valid_from,valid_until,remarks)
        VALUES($1,$2,$3,$4,$5,$6,$7,COALESCE($8::date,(now() AT TIME ZONE 'Asia/Manila')::date),$9,$10,$11) RETURNING *`,
        [id,studentId,actorId,input.description,requestId||null,input.offenseCode,input.customOffense,input.offenseDate,input.validFrom,input.validUntil,input.remarks]);
      await client.query('INSERT INTO sync_outbox(id,entity_type,entity_id,payload) VALUES($1,$2,$3,$4)', [randomUUID(), 'violations', id, rows[0]]);
      await client.query('INSERT INTO audit_logs(id,actor_id,action,target_id) VALUES($1,$2,$3,$4)', [randomUUID(), actorId, 'VIOLATION_REPORTED', id]);
      return { id, duplicate: false };
    });
  }
  async function clear(id, actorId) {
    if (!uuid.test(id)) throw new ApiError(422, 'INVALID_ID', 'Invalid violation ID.');
    await db.transaction(async (client) => {
      const { rows } = await client.query("UPDATE violations SET status='CLEARED',cleared_by=$2,cleared_at=now() WHERE id=$1 AND status='ACTIVE' RETURNING *", [id, actorId]);
      if (!rows[0]) throw new ApiError(409, 'VIOLATION_UNAVAILABLE', 'Violation not found or already cleared.');
      await client.query('INSERT INTO sync_outbox(id,entity_type,entity_id,payload) VALUES($1,$2,$3,$4)', [randomUUID(), 'violations', id, rows[0]]);
      await client.query('INSERT INTO audit_logs(id,actor_id,action,target_id) VALUES($1,$2,$3,$4)', [randomUUID(), actorId, 'VIOLATION_CLEARED', id]);
    });
  }
  async function recentStudents(){
    return (await db.query(`SELECT s.id,s.full_name AS name,s.student_no AS "studentNo",s.course,s.year_level AS year,s.section,
      CASE WHEN EXISTS(SELECT 1 FROM student_photos p WHERE p.student_id=s.id) THEN '/api/students/'||s.id||'/photo?size=thumbnail' ELSE NULL END AS photo,
      recent.scanned_at AS "scannedAt"
      FROM (SELECT student_id,max(received_at) AS scanned_at FROM scan_events
        WHERE student_id IS NOT NULL AND received_at>=now()-interval '24 hours'
        GROUP BY student_id ORDER BY scanned_at DESC,student_id LIMIT 8) recent
      JOIN students s ON s.id=recent.student_id ORDER BY recent.scanned_at DESC,s.id`)).rows;
  }
  return { list, report, clear, gateActivity,types,detail,students,recentStudents };
}
module.exports = { createViolationsService };
