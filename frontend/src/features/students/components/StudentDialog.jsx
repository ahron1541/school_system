import { useEffect, useState } from 'react';
import { AlertCircle } from 'lucide-react';
import Modal from '../../../shared/components/Modal';
import { Avatar } from '../../../shared/components/Status';
import { LoadingRegion, Skeleton } from '../../../shared/components/Loading';
import { api } from '../../../shared/lib/api';
import { Direction } from '../../gate-activity/components/ActivityTable';
import { personalFields, contactFields, levels, relatives, familyFields, schoolFields, ageFromBirth } from '../profile';
import '../students.css';
import SemesterValidation from './SemesterValidation';

function Values({ fields, data }) {
  return <dl className="student-profile-values">{fields.map(([key, label]) => <div key={key}><dt>{label}</dt><dd>{data?.[key] || 'Not provided'}</dd></div>)}</dl>;
}
export default function StudentDialog({ person, events, onClose, onEdit, showActivity = true,canValidate=false }) {
  const [detail, setDetail] = useState(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [tab, setTab] = useState('Overview');
  useEffect(() => {
    const controller = new AbortController(); let active = true;
    setDetail(null); setError('');
    api('/students/' + person.id, { signal: controller.signal }).then(result => { if (active) setDetail(result); }).catch(() => { if (active) setError('Unable to load student profile.'); });
    return () => { active = false; controller.abort(); };
  }, [person.id, attempt]);
  const current = detail || person, profile = detail?.profile;
  const privateAccess = detail && Object.hasOwn(detail, 'profile');
  const tabs = privateAccess ? ['Overview','Education','Family','Medical','RFID'] : ['Overview','RFID'];
  const records = events.filter(event => event.person.id === person.id);
  return <Modal title="Student profile" onClose={onClose} footer={<><button className="button" onClick={onClose}>Close</button>{onEdit && <button className="button primary" disabled={!detail || !!error} onClick={() => onEdit(detail)}>Edit student</button>}</>}>
    <div className="student-profile"><Avatar person={current} large /><h2>{current.name}</h2><p>{current.studentNo}</p><p>{current.course} / {current.year}{current.section ? ' / ' + current.section : ''}</p><span className="enrolled">{current.active ? 'Enrolled' : 'Inactive'}</span> <span className="enrolled">RFID: {current.uid ? 'Registered' : 'Not registered'}</span></div>
    {error ? <div className="notice notice-error" role="alert">{error} <button className="button" onClick={() => setAttempt(value => value + 1)}>Retry</button></div> : !detail ? <LoadingRegion label="Retrieving student profile"><div className="student-profile-values">{Array.from({ length: 6 }, (_, index) => <div key={index}><Skeleton className="skeleton-secondary" /><Skeleton className="skeleton-name" /></div>)}</div></LoadingRegion> : <>
      <nav className="student-sections" aria-label="Student profile sections">{tabs.map(name => <button key={name} aria-current={tab === name ? 'page' : undefined} onClick={() => setTab(name)}>{name}</button>)}</nav>
      {tab === 'Overview' && <><Values fields={[[ 'studentNo','Student ID'],['name','Full name'],['course','Course / program'],['year','Year level'],['section','Section']]} data={detail} />{privateAccess && <Values fields={[...personalFields, ['age','Age'], ...contactFields]} data={{ ...profile, age: ageFromBirth(profile?.dateOfBirth) }} />}
        {records.some(event => event.alert) && <div className="notice"><AlertCircle size={18} /><span>Active violation on record. Review the Violations module for details.</span></div>}
        {showActivity && <><h3 className="dialog-subheading">Recent gate activity</h3><div className="profile-activity">{records.length ? records.map(event => <div key={event.id}><Direction value={event.direction} /><span>{event.gate}</span><time>{event.time}</time></div>) : <p className="muted">No activity for this date.</p>}</div></>}
      </>}
      {tab === 'Education' && privateAccess && levels.map(([key,label]) => <section className="profile-group" key={key}><h3>{label}</h3><Values fields={schoolFields} data={profile?.education?.[key]} /></section>)}
      {tab === 'Family' && privateAccess && <>{relatives.map(([key,label]) => <section className="profile-group" key={key}><h3>{label}</h3><Values fields={familyFields} data={profile?.family?.[key]} /></section>)}<h3>Siblings</h3>{profile?.family?.siblings?.length ? profile.family.siblings.map((item,index) => <section className="profile-group" key={index}><h4>Sibling {index+1}</h4><Values fields={familyFields} data={item} /></section>) : <p className="muted">Not provided</p>}</>}
      {tab === 'Medical' && privateAccess && <Values fields={[[ 'medication','Medication']]} data={profile} />}
      {tab === 'RFID' && canValidate && <SemesterValidation student={detail}/>}
      {tab === 'RFID' && <><Values fields={[[ 'status','RFID status'],['uid','RFID UID']]} data={{ uid: detail.uid, status: detail.uid ? 'Registered' : 'Not registered' }} />{onEdit && <button className="button" onClick={() => onEdit(detail, 'RFID')}>{detail.uid ? 'Manage RFID' : 'Register RFID'}</button>}</>}
    </>}
  </Modal>;
}
