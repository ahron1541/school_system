import { useEffect, useRef, useState } from 'react';
import { X, Save } from 'lucide-react';
import { api } from '../../../shared/lib/api';
import StudentPhoto from './StudentPhoto';
import { BusyButton } from '../../../shared/components/Loading';

export default function StudentForm({ student, onClose, onSaved }) {
  const dialog = useRef(null);
  const [values, setValues] = useState({ studentNo: student?.studentNo || '', name: student?.name || '', course: student?.course || '', year: student?.year || '', section: student?.section || '', uid: student?.uid || '', active: student?.active ?? true });
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const pending = useRef(false);
  const busy = saving || uploading;
  const [error, setError] = useState('');
  useEffect(() => { const element = dialog.current; element.showModal(); return () => element.close(); }, []);
  async function submit(event) {
    event.preventDefault(); if (pending.current || busy) return; pending.current = true; setSaving(true); setError('');
    try { await api('/students' + (student ? '/' + student.id : ''), { method: student ? 'PUT' : 'POST', body: values }); onSaved(); }
    catch (failure) { setError(failure.message); }
    finally { pending.current = false; setSaving(false); }
  }
  return <dialog className="student-dialog" ref={dialog} aria-labelledby="form-title" onCancel={(event) => { if (busy) event.preventDefault(); else onClose(); }}><div className="dialog-top"><h2 id="form-title">{student ? 'Edit student' : 'Register student'}</h2><button className="icon-button" disabled={busy} onClick={onClose} title="Close" aria-label="Close form"><X size={19} /></button></div><form className="record-form" onSubmit={submit} aria-busy={busy}>
    {error && <div className="notice notice-error" role="alert">{error}</div>}
    {[['studentNo','Student number',50],['name','Full name',120],['course','Course / program',120],['year','Year level',30],['section','Section',40],['uid','RFID UID',20]].map(([key,label,max]) => <label key={key}>{label}{!['uid','section'].includes(key) && ' *'}<input disabled={busy} value={values[key]} maxLength={max} required={!['uid','section'].includes(key)} pattern={key === 'uid' ? '([a-fA-F0-9]{8}|[a-fA-F0-9]{14}|[a-fA-F0-9]{20})' : undefined} onChange={(event) => setValues({ ...values, [key]: event.target.value })} /></label>)}
    <label className="remember-label"><input disabled={busy} type="checkbox" checked={values.active} onChange={(event) => setValues({ ...values, active: event.target.checked })} />Active enrollment</label>{student && <StudentPhoto student={student} disabled={saving} onBusy={setUploading} />}<div className="form-actions"><button type="button" className="button" disabled={busy} onClick={onClose}>Cancel</button><BusyButton className="button primary" busy={saving} disabled={uploading} busyLabel="Saving student..." icon={Save}>Save student</BusyButton></div>
  </form></dialog>;
}
