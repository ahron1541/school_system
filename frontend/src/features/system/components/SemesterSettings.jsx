import {useEffect,useState} from 'react';
import {Plus,Check} from 'lucide-react';
import {api} from '../../../shared/lib/api';
import {BusyButton} from '../../../shared/components/Loading';
export default function SemesterSettings(){
  const [items,setItems]=useState([]),[name,setName]=useState(''),[selected,setSelected]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[loaded,setLoaded]=useState(false);
  async function load(){try{const rows=await api('/semesters');setItems(rows);setSelected(rows.find(s=>s.active)?.id||'');setLoaded(true);setError('');}catch(e){setLoaded(false);setError(e.message);}}
  useEffect(()=>{load();},[]);
  async function save(create){if(busy)return;setBusy(true);try{await api(create?'/semesters':'/semesters/'+selected+'/active',{method:create?'POST':'PUT',body:create?{name}: {}});setName('');await load();}catch(e){setError(e.message);}finally{setBusy(false);}}
  return <section className="section-block"><h2>Current semester</h2>{error&&<p role="alert">{error} <button className="button" type="button" onClick={load}>Retry</button></p>}{loaded&&!items.some(s=>s.active)&&<p className="notice" role="status">SEMESTER NOT CONFIGURED. Normal entries need a current semester.</p>}<div className="modal-grid"><label>Semester<select aria-label="Semester" value={selected} disabled={busy||!loaded} onChange={e=>setSelected(e.target.value)}><option value="">Select semester</option>{items.map(s=><option key={s.id} value={s.id}>{s.name}{s.active?' (current)':''}</option>)}</select></label><div><BusyButton type="button" busy={busy} busyLabel="Saving..." icon={Check} disabled={!loaded||!selected||items.some(s=>s.id===selected&&s.active)} onClick={()=>save(false)}>Set current semester</BusyButton></div><label>New semester name<input value={name} maxLength={100} disabled={busy} onChange={e=>setName(e.target.value)}/></label><div><BusyButton type="button" busy={busy} busyLabel="Saving..." icon={Plus} disabled={!name.trim()} onClick={()=>save(true)}>Create semester</BusyButton></div></div></section>;
}
