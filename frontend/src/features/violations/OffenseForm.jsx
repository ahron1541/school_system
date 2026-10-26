import {useEffect,useRef,useState} from 'react';
import {Save,Search,X} from 'lucide-react';
import Modal from '../../shared/components/Modal';
import Photo from '../../shared/components/Photo';
import {BusyButton} from '../../shared/components/Loading';
import {useRecords} from '../../shared/hooks/useRecords';
import {reportViolation} from './violationApi';
import {notify} from '../../shared/components/Toast';

export default function OffenseForm({user,types,today,initialStudent,onClose,onSaved}){
  const [student,setStudent]=useState(initialStudent||null),[search,setSearch]=useState(''),[term,setTerm]=useState('');
  const [values,setValues]=useState({offenseCode:'',customOffense:'',offenseDate:today,validFrom:'',validUntil:'',remarks:''});
  const [errors,setErrors]=useState({}),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  const pending=useRef(false),request=useRef(null),root=useRef(null);
  useEffect(()=>{const timer=setTimeout(()=>setTerm(search.trim()),300);return()=>clearTimeout(timer);},[search]);
  const lookup=useRecords('/violations/students?search='+encodeURIComponent(term),term.length>=2&&!student,0);
  const recent=useRecords('/violations/recent-students',!student&&!search.trim(),5000);
  const dirty=!!student||!!search||values.offenseDate!==today||Object.entries(values).some(([key,value])=>key!=='offenseDate'&&!!value);
  const set=(key,value)=>{setValues(old=>({...old,[key]:value,...(key==='offenseCode'?{customOffense:''}:{})}));setErrors(old=>({...old,[key]:''}));};
  useEffect(()=>{if(Object.keys(errors).length)root.current?.querySelector('[aria-invalid="true"]')?.focus();},[errors]);
  async function submit(event){
    event.preventDefault();if(pending.current)return;
    const found={};
    if(!student)found.studentId='Search for and select a student.';
    if(!values.offenseCode)found.offenseCode='Select an offense.';
    if(values.offenseCode==='OTHER'&&values.customOffense.trim().length<3)found.customOffense='Describe the offense in 3-160 characters.';
    if(!values.offenseDate)found.offenseDate='Choose an offense date.';
    if(!!values.validFrom!==!!values.validUntil)found.validUntil='Provide both dates or leave both empty.';
    if(values.validFrom&&values.validUntil<values.validFrom)found.validUntil='Valid until must be on or after valid from.';
    if(Object.keys(found).length){setErrors(found);return;}
    const body={...values,studentId:student.id},content=JSON.stringify(body);
    if(request.current?.content!==content)request.current={content,id:crypto.randomUUID()};
    pending.current=true;setBusy(true);setError('');
    try{await reportViolation({...body,requestId:request.current.id});notify('Offense recorded successfully.');onSaved();}
    catch(failure){setError(failure.message);setErrors(failure.fields||{});}
    finally{pending.current=false;setBusy(false);}
  }
  function field(key,label,type='text',required=false){const id='offense-'+key;return <label htmlFor={id}>{label}{required?' *':''}<input id={id} aria-label={label+(required?' *':'')} type={type} value={values[key]} disabled={busy} maxLength={key==='customOffense'?160:undefined} aria-required={required} aria-invalid={!!errors[key]} aria-describedby={errors[key]?id+'-error':undefined} onChange={event=>set(key,event.target.value)}/>{errors[key]&&<span className="field-error" id={id+'-error'}>{errors[key]}</span>}</label>;}
  return <Modal className="offense-modal" title="Record offense" onClose={onClose} busy={busy} dirty={dirty} lossWarning={dirty?'This offense has not been saved. Close without saving?':''} onSubmit={submit} footer={({close})=><><button type="button" className="button" disabled={busy} onClick={close}>Cancel</button><BusyButton className="button primary" busy={busy} busyLabel="Recording..." icon={Save}>Record offense</BusyButton></>}>
    <div className="offense-form" ref={root}>
      {error&&<p className="notice notice-error" role="alert">{error}</p>}
      <section className="offense-person-section"><h3>1. Student</h3>{student?<div className="offense-student"><Photo src={student.photo} fallback={student.name.slice(0,1)} alt=""/><div><strong>{student.name}</strong><p>{student.studentNo}</p><p>{student.course} / Year {student.year}{student.section?' / '+student.section:''}</p></div><button className="icon-button" type="button" title="Change student" aria-label="Change student" disabled={busy} onClick={()=>setStudent(null)}><X size={18}/></button></div>:<>
        <label className="offense-search">Search student *<span><Search size={16}/><input autoFocus type="search" value={search} maxLength={120} disabled={busy} aria-invalid={!!errors.studentId} aria-describedby={errors.studentId?'student-search-error':undefined} onChange={event=>setSearch(event.target.value)}/></span></label>
        {errors.studentId&&<p id="student-search-error" className="field-error">{errors.studentId}</p>}
        {term.length>=2&&<div className="student-results" aria-label="Student results">{lookup.error?<p role="alert">{lookup.error}</p>:lookup.loading||lookup.refreshing?<p role="status">Searching students...</p>:lookup.data?.length?lookup.data.map(item=><button className="student-result" type="button" key={item.id} onClick={()=>{setStudent(item);setErrors(old=>({...old,studentId:''}));}}><strong>{item.name}</strong><span>{item.studentNo} / {item.course}</span></button>):<p>No matching students.</p>}</div>}
        {!search.trim()&&<section className="offense-recent" aria-label="Recent scans"><h4>Recent scans <span>Last 24 hours</span></h4>{recent.error?<p role="alert">{recent.error}</p>:recent.loading?<p role="status">Loading recent scans...</p>:recent.data?.length?<div className="recent-scan-list">{recent.data.map(item=><button type="button" className="recent-scan-student" key={item.id} disabled={busy} onClick={()=>{setStudent(item);setErrors(old=>({...old,studentId:''}));}}><Photo src={item.photo} fallback={item.name.slice(0,1)} alt=""/><span><strong>{item.name}</strong><span>{item.studentNo}</span></span></button>)}</div>:<p>No student scans in the last 24 hours.</p>}</section>}
      </>}</section>
      <section className="offense-details-section"><h3>2. Offense details</h3><div className="modal-grid">
        <label className="full-row">Offense *<select aria-label="Offense *" value={values.offenseCode} disabled={busy} aria-required="true" aria-invalid={!!errors.offenseCode} aria-describedby={errors.offenseCode?'offense-code-error':undefined} onChange={event=>set('offenseCode',event.target.value)}><option value="">Select offense</option>{types.map(type=><option value={type.code} key={type.code}>{type.name}</option>)}</select>{errors.offenseCode&&<span className="field-error" id="offense-code-error">{errors.offenseCode}</span>}</label>
        {values.offenseCode==='OTHER'&&field('customOffense','Specify offense','text',true)}
        {field('offenseDate','Offense date','date',true)}{field('validFrom','Valid from','date')}{field('validUntil','Valid until','date')}
        <label className="full-row">Remarks<textarea rows={3} maxLength={2000} disabled={busy} value={values.remarks} aria-invalid={!!errors.remarks} onChange={event=>set('remarks',event.target.value)}/>{errors.remarks&&<span className="field-error">{errors.remarks}</span>}</label>
      </div></section><section className="offense-issuer"><h3>Issuing officer</h3><p>{user.fullName}</p></section>
    </div>
  </Modal>;
}
