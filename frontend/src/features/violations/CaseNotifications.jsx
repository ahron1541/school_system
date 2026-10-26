import {useEffect,useRef,useState} from 'react';
import {Bell,ArrowRight} from 'lucide-react';
import Modal from '../../shared/components/Modal';
import {notify} from '../../shared/components/Toast';
import './case-workspace.css';
export default function CaseNotifications({resource,onOpen,onPending,currentUserId}){
  const [open,setOpen]=useState(false),latest=useRef(undefined);
  useEffect(()=>{
    if(!resource.data||resource.error)return;
    const next=resource.data.latest?.id||null;
    if(latest.current!==undefined&&next&&next!==latest.current&&resource.data.latest.reportedBy!==currentUserId)notify('New student offense reported.','info');
    latest.current=next;
  },[resource.data,resource.error]);
  const count=resource.error?'!':resource.data?.unread;
  return <><button className="icon-button case-bell" title="Case notifications" aria-label="Case notifications" onClick={()=>setOpen(true)}><Bell size={19}/>{!!count&&<span className="case-bell-count">{typeof count==='number'&&count>99?'99+':count}</span>}</button>
    {open&&<Modal title="New reports" compact onClose={()=>setOpen(false)} footer={<><button className="button" onClick={()=>setOpen(false)}>Close</button><button className="button primary" onClick={()=>{setOpen(false);onPending();}}>Pending cases<ArrowRight size={16}/></button></>}>
      {resource.error?<p role="alert">{resource.error}<button className="button" onClick={resource.refresh}>Retry</button></p>:!resource.data?<p role="status">Loading reports...</p>:<><p className="case-inbox-count">{resource.data.unread} unread pending {resource.data.unread===1?'report':'reports'}</p><div className="case-inbox">{resource.data.reports.map(item=><button key={item.id} onClick={()=>{setOpen(false);onOpen(item.id);}}><strong>{item.name}</strong><span>{item.studentNo}</span><span>{item.description}</span><time>{new Date(item.createdAt).toLocaleString('en-GB',{timeZone:'Asia/Manila'})}</time><ArrowRight size={16}/></button>)}</div>{resource.data.unread===0&&<p>No unread pending reports.</p>}{resource.data.unread>20&&<p>Showing the 20 newest unread reports.</p>}</>}
    </Modal>}
  </>;
}
