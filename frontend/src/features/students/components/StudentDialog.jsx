import { useEffect, useRef } from 'react';
import { X, AlertCircle } from 'lucide-react';
import { Avatar } from '../../../shared/components/Status';
import { Direction } from '../../gate-activity/components/ActivityTable';

export default function StudentDialog({ person, events, onClose, onEdit }) {
  const dialog = useRef(null);
  useEffect(() => {
    const element = dialog.current;
    element.showModal();
    return () => element.close();
  }, []);
  const records = events.filter((event) => event.person.id === person.id);
  return <dialog ref={dialog} className="student-dialog" aria-labelledby="student-name" onCancel={onClose} onClick={(event) => { if (event.target === dialog.current) onClose(); }}>
    <div className="dialog-top"><span className="eyebrow">STUDENT RECORD</span><button className="icon-button" aria-label="Close student record" title="Close" onClick={onClose}><X size={20} /></button></div>
    <div className="student-profile"><Avatar person={person} large /><h2 id="student-name">{person.name}</h2><p>{person.studentNo}</p><span className="enrolled">{person.active ? 'Enrolled' : 'Inactive'}</span></div>
    <dl className="profile-details"><div><dt>Course</dt><dd>{person.course}</dd></div><div><dt>Year / section</dt><dd>{person.year} / {person.section}</dd></div></dl>
    {records.some((event) => event.alert) && <div className="notice"><AlertCircle size={18} /><span><strong>Active alert</strong><br />This student has an active violation. Review the Violations module for details.</span></div>}
    {onEdit && <button className="button" onClick={onEdit}>Edit student</button>}<h3 className="dialog-subheading">Recent gate activity</h3>
    <div className="profile-activity">{records.length ? records.map((event) => <div key={event.id}><Direction value={event.direction} /><span>{event.gate}</span><time>{event.time}</time></div>) : <p className="muted">No activity for this date.</p>}</div>
  </dialog>;
}
