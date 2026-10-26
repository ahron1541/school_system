const sharp=require('sharp');
const {createDatabase}=require('../src/database/client');
const db=createDatabase(process.env.DATABASE_URL);
(async()=>{
  let count=0;
  try{
    while(true){
      const rows=(await db.query('SELECT student_id,image,updated_at FROM student_photos WHERE thumbnail IS NULL ORDER BY student_id LIMIT 20')).rows;
      if(!rows.length)break;
      for(const row of rows){const thumbnail=await sharp(row.image).resize(96,96,{fit:'cover'}).jpeg({quality:75}).toBuffer();const result=await db.query('UPDATE student_photos SET thumbnail=$2 WHERE student_id=$1 AND image=$3 AND thumbnail IS NULL',[row.student_id,thumbnail,row.image]);count+=result.rowCount;}
    }
    console.log('[PHOTOS] Thumbnails generated: '+count);
  }finally{await db.close();}
})().catch(()=>{console.error('[PHOTOS] Backfill failed; originals retained. Check database availability and stored photos.');process.exitCode=1;});
