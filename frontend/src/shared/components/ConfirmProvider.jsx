import {createContext,useContext,useEffect,useRef,useState} from 'react';
import Modal from './Modal';
const Context=createContext(null);
export const useConfirm=()=>useContext(Context);
export default function ConfirmProvider({children}){
  const [message,setMessage]=useState(''),resolve=useRef(null);
  const finish=answer=>{resolve.current?.(answer);resolve.current=null;setMessage('');};
  useEffect(()=>()=>resolve.current?.(false),[]);
  const confirm=text=>{if(resolve.current)return Promise.resolve(false);return new Promise(done=>{resolve.current=done;setMessage(text);});};
  return <Context.Provider value={confirm}>{children}{message&&<Modal compact title="Leave student registration?" onClose={()=>finish(false)} footer={<><button className="button" autoFocus onClick={()=>finish(false)}>Keep editing</button><button className="button" onClick={()=>finish(true)}>Leave registration</button></>}><p>{message}</p></Modal>}</Context.Provider>;
}
