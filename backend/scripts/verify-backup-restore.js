const {Client}=require('pg');
const {readFileSync,existsSync}=require('node:fs');
const {spawnSync}=require('node:child_process');
const {randomUUID}=require('node:crypto');
const path=require('node:path');
// This development helper restores only into a newly created, randomly named database.
const file=path.resolve(process.argv[2]||'');
const executable=process.env.PG_RESTORE_PATH||'C:\\Program Files\\PostgreSQL\\18\\bin\\pg_restore.exe';
const name='restore_check_'+randomUUID().replaceAll('-','');
(async()=>{
  if(!existsSync(file)||!file.endsWith('.dump')||!existsSync(executable))throw new Error('Provide a dump file and PG_RESTORE_PATH.');
  const source=new URL(process.env.DATABASE_URL);
  if(!['127.0.0.1','localhost'].includes(source.hostname))throw new Error('Only the local development database is supported.');
  const secrets=JSON.parse(readFileSync(path.resolve(__dirname,'../../.local/database-secrets.json'),'utf8'));
  const options={host:source.hostname,port:Number(source.port||5432),user:'postgres',password:secrets.admin};
  const admin=new Client({...options,database:'postgres'});await admin.connect();let created=false;
  try{
    await admin.query('CREATE DATABASE '+name);created=true;
    const empty=new Client({...options,database:name});await empty.connect();
    try{await empty.query('DROP SCHEMA public');}finally{await empty.end();}
    const result=spawnSync(executable,['--exit-on-error','--no-owner','--no-privileges','--host',options.host,'--port',String(options.port),'--username',options.user,'--dbname',name,file],{env:{...process.env,PGPASSWORD:options.password},windowsHide:true,encoding:'utf8'});
    if(result.status!==0){console.error('[RESTORE] Tool status:',result.status,'error:',result.error?.code||'none');console.error((result.stderr||'').replaceAll(options.password,'[REDACTED]').slice(0,1800));throw new Error('Restore failed.');}
    const restored=new Client({...options,database:name});await restored.connect();
    try{
      const result=await restored.query('SELECT (SELECT count(*) FROM students) AS students,(SELECT count(*) FROM violations) AS violations,(SELECT count(*) FROM users) AS accounts');
      console.log('[RESTORE] Disposable database restored successfully. Counts:',result.rows[0]);
      console.log('[RESTORE] Original database was not changed.');
    }finally{await restored.end();}
  }finally{
    if(created&&/^restore_check_[a-f0-9]{32}$/.test(name))await admin.query('DROP DATABASE '+name);
    await admin.end();
  }
})().catch(error=>{console.error('[RESTORE] Verification failed ('+(error.code||'TOOL_OR_INPUT_ERROR')+'). Check local administrator credentials, dump and PostgreSQL tools. No production restore was attempted.');process.exitCode=1;});
