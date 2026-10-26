async function gateHealth(db,deviceId,now=Date.now()) {
  const health=(await db.query('SELECT last_seen_at,state FROM gate_device_health WHERE device_id=$1',[deviceId])).rows[0];
  return {deviceId,lastSeenAt:health?.last_seen_at||null,connection:!health?'never_seen':now-new Date(health.last_seen_at)>15000?'offline':health.state==='DEGRADED'?'degraded':'online'};
}
module.exports={gateHealth};
