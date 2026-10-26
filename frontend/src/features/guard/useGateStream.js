import {useEffect,useState} from 'react';
export function useGateStream(display=false) {
  const [state,setState]=useState({data:null,loading:true,error:''});
  useEffect(()=> {
    let stream,expiry,watchdog;
    const unavailable=()=>setState(previous=>({...previous,loading:false,error:'Gate connection unavailable.',data:previous.data?{...previous.data,scan:null}:null}));
    function connect(){
      stream?.close();
      stream=new EventSource('/api/guard/stream'+(display?'?display=1':''));
      clearTimeout(watchdog);watchdog=setTimeout(unavailable,5000);
      stream.addEventListener('gate',event=> {
      try {
        const data=JSON.parse(event.data);
        clearTimeout(expiry);clearTimeout(watchdog);
        setState({data,loading:false,error:''});
        watchdog=setTimeout(unavailable,5000);
        if(data.scan) expiry=setTimeout(()=>setState(previous=>({...previous,data:previous.data?{...previous.data,scan:null}:null})),Math.max(0,new Date(data.scan.expiresAt)-new Date(data.serverTime)));
      } catch {unavailable();}
      });
      stream.addEventListener('unavailable',unavailable);stream.onerror=unavailable;
      stream.addEventListener('session-expired',()=>{stream.close();unavailable();window.dispatchEvent(new Event('session-expired'));});
    }
    const offline=()=>{stream?.close();unavailable();};
    window.addEventListener('offline',offline);window.addEventListener('online',connect);connect();
    return ()=>{stream.close();clearTimeout(expiry);clearTimeout(watchdog);window.removeEventListener('offline',offline);window.removeEventListener('online',connect);};
  },[display]);
  return state;
}
