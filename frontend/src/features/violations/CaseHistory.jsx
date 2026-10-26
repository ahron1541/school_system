import {useEffect,useRef,useState} from 'react';
import {MessageSquarePlus,ChevronLeft,ChevronRight} from 'lucide-react';
import {useRecords} from '../../shared/hooks/useRecords';
import {api} from '../../shared/lib/api';
import {BusyButton} from '../../shared/components/Loading';
import {notify} from '../../shared/components/Toast';
export default function CaseHistory({id,canWrite,onDirty,onBusy}){
  const [page,setPage]=useState(1),[remarks,setRemarks]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const request=useRef(null),pending=useRef(false);
  const history=useRecords(`/violations/${id}/history?page=${page}`,true,15000);
  useEffect(()=>{onDirty(!!remarks);},[remarks,onDirty]);
  async function save(event){
    event.preventDefault();if(pending.current||!remarks.trim())return;
    const value=remarks.trim();if(request.current?.value!==value)request.current={value,id:crypto.randomUUID()};
    pending.current=true;setBusy(true);onBusy(true);setError('');
    try{await api(`/violations/${id}/remarks`,{method:'POST',body:{remarks:value,requestId:request.current.id}});setRemarks('');setPage(1);history.refresh();notify('Case remark added.');}
    catch(failure){setError(failure.message);}finally{pending.current=false;setBusy(false);onBusy(false);}
  }
  return <section className="case-history"><h3>Case history</h3>{history.error?<p role="alert">{history.error}<button className="button" onClick={history.refresh}>Retry history</button></p>:history.loading?<p role="status">Loading history...</p>:<><ol>{history.data?.records.map(item=><li key={item.id+item.action}><strong>{item.action==='REPORTED'?'Reported':item.action==='CLEARED'?'Cleared':'Remark added'}</strong><span>{item.author} / {new Date(item.at).toLocaleString('en-GB',{timeZone:'Asia/Manila'})}</span>{item.remarks&&<p>{item.remarks}</p>}</li>)}</ol>{(page>1||history.data?.hasMore)&&<div className="case-history-pages"><button className="icon-button" aria-label="Newer case history" disabled={page===1} onClick={()=>setPage(page-1)}><ChevronLeft size={17}/></button><span>Page {page}</span><button className="icon-button" aria-label="Older case history" disabled={!history.data?.hasMore} onClick={()=>setPage(page+1)}><ChevronRight size={17}/></button></div>}</>}
    {canWrite&&<form onSubmit={save} className="case-remark-form"><label htmlFor="case-remark">Add remarks (optional)</label><textarea id="case-remark" value={remarks} maxLength={2000} rows={3} disabled={busy} onChange={event=>setRemarks(event.target.value)}/>{error&&<p role="alert">{error}</p>}<div><button type="button" className="button" disabled={busy||!remarks} onClick={()=>setRemarks('')}>Discard remark</button><BusyButton className="button" busy={busy} disabled={!remarks.trim()} busyLabel="Saving..." icon={MessageSquarePlus}>Save remark</BusyButton></div></form>}
  </section>;
}
