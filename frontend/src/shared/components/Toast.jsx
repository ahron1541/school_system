import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, AlertCircle, AlertTriangle, Info, X } from 'lucide-react';
const listeners=new Set();let nextId=0;
export function notify(message,variant='success',persistent=false){for(const listener of listeners)listener({id:++nextId,message,variant,persistent});}
function Toast({item,dismiss}){
  const [paused,setPaused]=useState(false);
  useEffect(()=>{if(paused||item.persistent)return;const timer=setTimeout(()=>dismiss(item.id),item.variant==='error'?9000:5000);return()=>clearTimeout(timer);},[item,paused,dismiss]);
  const Icon={success:CheckCircle2,error:AlertCircle,warning:AlertTriangle,info:Info}[item.variant]||Info;
  return <div className={'toast toast-'+item.variant} role={item.variant==='error'?'alert':'status'} onMouseEnter={()=>setPaused(true)} onMouseLeave={()=>setPaused(false)} onFocus={()=>setPaused(true)} onBlur={()=>setPaused(false)}><Icon size={20}/><p>{item.message}</p><button className="icon-button" title="Dismiss notification" aria-label="Dismiss notification" onClick={()=>dismiss(item.id)}><X size={16}/></button></div>;
}
export default function ToastHost(){
  const [items,setItems]=useState([]);
  useEffect(()=>{const receive=item=>setItems(old=>[...old.filter(other=>other.message!==item.message).slice(-2),item]);listeners.add(receive);return()=>listeners.delete(receive);},[]);
  const dismiss=useCallback(id=>setItems(old=>old.filter(item=>item.id!==id)),[]);
  return <aside className="toast-region" aria-label="Notifications">{items.map(item=><Toast key={item.id} item={item} dismiss={dismiss}/>)}</aside>;
}
