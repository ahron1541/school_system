import {useEffect,useState,useRef} from 'react';
import {Check} from 'lucide-react';
import {api} from '../../../shared/lib/api';
import {BusyButton} from '../../../shared/components/Loading';
export default function SemesterValidation({student}) {
  const [data,setData]=useState(),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  const request=useRef(0);
  async function load(){const current=++request.current;setData(undefined);setError('');try{const result=await api('/semesters/validation/'+student.id);if(current===request.current)setData(result);}catch(e){if(current===request.current)setError(e.message);}}
  useEffect(()=>{load();return()=>{request.current++;};},[student.id,student.uid]);
  async function validate(){if(busy)return;setBusy(true);try{await api('/semesters/validation/'+student.id,{method:'POST',body:{semesterId:data.semesterId,uid:student.uid}});await load();}catch(e){setError(e.message);}finally{setBusy(false);}}
  return <section className="profile-group"><h3>Semester validation</h3>{error&&<p role="alert">{error} <button className="button" type="button" disabled={busy} onClick={load}>Retry</button></p>}{data===undefined?(!error&&<p>Checking validation...</p>):!data?<p role="status">No current semester configured. Set one in System status.</p>:<><p>{data.name}</p><p>{data.validatedAt?'Validated on '+new Date(data.validatedAt).toLocaleString('en-PH'):'ID not validated for this semester.'}</p><BusyButton type="button" busy={busy} busyLabel="Validating..." icon={Check} disabled={!!data.validatedAt||!student.uid||!student.active} onClick={validate}>Validate current RFID</BusyButton></>}</section>;
}
