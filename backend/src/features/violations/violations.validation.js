const { ApiError } = require('../../shared/middleware/error-handler');
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
function validDate(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !value.startsWith('0000') &&
    !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0,10) === value;
}
function invalid(fields) { const error = new ApiError(422,'INVALID_VIOLATION','Check the highlighted offense fields.'); error.fields=fields; throw error; }
function validateReport(body) {
  const fields={};
  if (!body || typeof body !== 'object' || Array.isArray(body)) invalid({ studentId:'Select a student.' });
  if (typeof body.studentId!=='string'||!uuid.test(body.studentId)) fields.studentId='Select a student.';
  if (body.requestId!==undefined&&(typeof body.requestId!=='string'||!uuid.test(body.requestId))) fields.requestId='Invalid submission identifier.';
  // Explicit projection: client-supplied officer, status and internal fields never become writable.
  const typed = body.offenseCode !== undefined;
  const text = (key,max) => {
    if (body[key]===undefined) return '';
    if (typeof body[key]!=='string'||body[key].length>max) { fields[key]=`Use no more than ${max} characters.`;return ''; }
    return body[key].trim();
  };
  const input={ studentId:body.studentId,requestId:body.requestId,offenseCode:typed?body.offenseCode:null,
    customOffense:null,description:typed?'':text('description',1000),remarks:text('remarks',2000),offenseDate:null,validFrom:null,validUntil:null };
  if (typed && (typeof input.offenseCode!=='string'||! /^[A-Z_]{2,50}$/.test(input.offenseCode))) fields.offenseCode='Select an offense.';
  if (typed && input.offenseCode==='OTHER') { input.customOffense=text('customOffense',160); if(input.customOffense.length<3) fields.customOffense='Describe the offense in 3-160 characters.'; }
  if (!typed && input.description.length<3) fields.description='Enter a description (3-1000 characters).';
  for(const name of ['offenseDate','validFrom','validUntil']) {
    if(body[name]!==undefined&&body[name]!==null&&body[name]!=='') {
      if(!validDate(body[name])) fields[name]='Choose a valid date.'; else input[name]=body[name];
    }
  }
  if(!!input.validFrom!==!!input.validUntil) fields.validUntil='Provide both validity dates or leave both empty.';
  if(input.validFrom&&input.validUntil&&input.validUntil<input.validFrom) fields.validUntil='Valid until must be on or after valid from.';
  if(Object.keys(fields).length) invalid(fields);
  return input;
}
function listFilters(query={}) {
  const allowed=['page','pageSize','search','status','offense','from','to','sort'];
  if(Object.keys(query).some(key=>!allowed.includes(key))||Object.values(query).some(value=>typeof value!=='string')) throw new ApiError(422,'INVALID_FILTER','Invalid report filters.');
  const page=query.page||'1',size=query.pageSize||'20';
  if(!/^[1-9]\d*$/.test(page)||Number(page)>100000||!['10','20','50'].includes(size)||(query.search||'').length>120||
    (query.status&&!['ACTIVE','CLEARED'].includes(query.status))||(query.offense&&!/^[A-Z_]{2,50}$/.test(query.offense))||
    (query.from&&!validDate(query.from))||(query.to&&!validDate(query.to))||(query.from&&query.to&&query.to<query.from)||
    (query.sort&&!['newest','oldest','student'].includes(query.sort))) throw new ApiError(422,'INVALID_FILTER','Choose valid filters, dates and page size.');
  return {...query,page:Number(page),pageSize:Number(size),search:(query.search||'').trim(),sort:query.sort||'newest'};
}
module.exports={validateReport,listFilters,validDate};
