const {randomUUID}=require('node:crypto');
const {readEnv}=require('../src/shared/config/env');
const {sign}=require('../src/features/gate/device-security');
async function run(){
  const uid=(process.argv[2]||'').replace(/[:-]/g,'').toUpperCase();
  if(!/^(?:[A-F0-9]{8}|[A-F0-9]{14}|[A-F0-9]{20})$/.test(uid)||!process.argv.includes('--record')) throw new Error('This creates real attendance. Use: npm run gate:scan -- UID --record [EVENT_ID ISO_TIMESTAMP] with a designated test student.');
  const config=readEnv(),path='/api/entry-logs/scan',stamp=String(Date.now());
  const eventId=process.argv[4]||randomUUID(),occurredAt=process.argv[5]||new Date().toISOString();
  const body=JSON.stringify({deviceId:config.deviceId,eventId,uid,occurredAt});
  const response=await fetch(`http://127.0.0.1:${config.port}${path}`,{method:'POST',headers:{'Content-Type':'application/json','X-Device-ID':config.deviceId,'X-Timestamp':stamp,'X-Signature':sign(config.deviceKey,'POST',path,stamp,body)},body});
  console.log(JSON.stringify({httpStatus:response.status,eventId,occurredAt,response:await response.json()},null,2));
}
run().catch(error=>{console.error(error.message);process.exitCode=1;});
