const express=require('express');
const rateLimit=require('express-rate-limit');
const {createHmac,timingSafeEqual}=require('node:crypto');
const {ApiError}=require('../../shared/middleware/error-handler');
const sign=(key,method,path,timestamp,body)=>createHmac('sha256',key).update([method,path,timestamp,body].join('\n')).digest('hex');
function gateDeviceHttp(config) {
  const message={success:false,message:'Too many gate requests. Retry after the indicated delay.',error:{code:'GATE_RATE_LIMIT'}};
  const incoming=rateLimit({windowMs:60000,limit:config.gateIncomingRateLimit||1800,standardHeaders:'draft-8',legacyHeaders:false,message});
  const limiter=rateLimit({windowMs:60000,limit:config.gateRateLimit||1200,keyGenerator:()=>config.deviceId,standardHeaders:'draft-8',legacyHeaders:false,message});
  return [incoming,express.raw({type:'application/json',limit:'2kb',inflate:false}), (req,res,next)=> {
    const raw=req.body?.toString('utf8');
    const stamp=req.get('X-Timestamp')||'', signature=req.get('X-Signature')||'';
    const path=req.originalUrl.split('?')[0];
    if(req.get('X-Device-ID')!==config.deviceId || !/^[a-f0-9]{64}$/.test(signature) || typeof raw!=='string') throw new ApiError(401,'INVALID_DEVICE','Valid signed device request required.');
    const expected=sign(config.deviceKey,req.method,path,stamp,raw);
    if(!timingSafeEqual(Buffer.from(signature,'hex'),Buffer.from(expected,'hex'))) throw new ApiError(401,'INVALID_SIGNATURE','Device signature is invalid.');
    if(path!=='/api/gate/time' && (!/^\d{13}$/.test(stamp) || Math.abs(Date.now()-Number(stamp))>60000)) throw new ApiError(401,'EXPIRED_REQUEST','Synchronize device time and retry.');
    try { req.body=JSON.parse(raw); } catch { throw new ApiError(400,'INVALID_JSON','Invalid JSON.'); }
    const json=res.json.bind(res);
    res.json=body=> {
      res.set('X-Response-Signature',createHmac('sha256',config.deviceKey).update(stamp+'\n'+signature+'\n'+JSON.stringify(body)).digest('hex'));
      return json(body);
    };
    next();
  },limiter];
}
function validateGateScan(body) {
  if(!body || typeof body!=='object' || Array.isArray(body) || Object.keys(body).some(k=>!['uid','deviceId','eventId','occurredAt'].includes(k))) throw new ApiError(422,'INVALID_SCAN','Invalid gate scan.');
  const uid=typeof body.uid==='string'?body.uid.replace(/[:-]/g,'').toUpperCase():'';
  if(typeof body.deviceId!=='string'||typeof body.eventId!=='string'||typeof body.uid!=='string'||body.uid.length>29) throw new ApiError(422,'INVALID_SCAN','Invalid scanner identifiers.');
  if(!/^(?:[A-F0-9]{8}|[A-F0-9]{14}|[A-F0-9]{20})$/.test(uid) || !/^[a-zA-Z0-9_-]{1,40}$/.test(body.deviceId||'') || !/^[a-zA-Z0-9_-]{16,80}$/.test(body.eventId||'') || !Object.hasOwn(body,'occurredAt') || (body.occurredAt!==null && (typeof body.occurredAt!=='string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(body.occurredAt) || !Number.isFinite(Date.parse(body.occurredAt))))) throw new ApiError(422,'INVALID_SCAN','Provide a valid UID, device, event ID and device time.');
  if(body.occurredAt!==null && new Date(body.occurredAt).toISOString()!==body.occurredAt) throw new ApiError(422,'INVALID_SCAN','Invalid device date.');
  return {...body,uid};
}
module.exports={sign,gateDeviceHttp,validateGateScan};
