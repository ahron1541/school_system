import { useEffect, useRef, useState } from 'react';
import { Save, Plus, Trash2, ArrowLeft, ArrowRight, Check, Pencil, UserRound } from 'lucide-react';
import Modal from '../../../shared/components/Modal';
import {useConfirm} from '../../../shared/components/ConfirmProvider';
import { useFormDraft, useUnloadWarning } from '../../../shared/hooks/useFormDraft';
import { DraftStatus } from '../../../shared/components/DraftRecovery';
import { api } from '../../../shared/lib/api';
import StudentPhoto from './StudentPhoto';
import { BusyButton } from '../../../shared/components/Loading';
import CardCapture from './CardCapture';
import { uploadStudentPhoto } from '../services/studentPhotoApi';
import { emptyProfile, personalFields, contactFields, schoolFields, familyFields, levels, relatives, ageFromBirth } from '../profile';
import '../students.css';
import { registrationSteps, fieldStep, fieldValue, registrationFields, validateRegistration } from '../registration';

const sections = ['Profile', 'Personal', 'Contact', 'Education', 'Family', 'Medical', 'RFID'];
export default function StudentForm({ student, currentUserId, onClose, onSaved, onView, leaveGuard, initialSection = 'Profile' }) {
  const confirm=useConfirm();
  const guided = !student;
  const initial = { studentNo: student?.studentNo || '', name: student?.name || '', course: student?.course || '', year: student?.year || '', section: student?.section || '', uid: student?.uid || '', active: student?.active ?? true, profile: student?.profile || emptyProfile(), persistedId: student?.id || '', registrationStep: 0 };
  const draft = useFormDraft({ userId: currentUserId, feature: 'students', id: student?.id || 'new', initial, fields: Object.keys(initial), meta: { student } });
  const { values, setValues } = draft;
  const [section, setSection] = useState(initialSection);
  const [saving, setSaving] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [file, setFile] = useState(null);
  const [error, setError] = useState('');
  const [errors, setErrors] = useState({});
  const [savedId, setSavedId] = useState(values.persistedId || student?.id);
  const [step, setStep] = useState(Math.max(0, Math.min(4, values.registrationStep)));
  const [returnToReview, setReturnToReview] = useState(false);
  const [created, setCreated] = useState(null);
  const [uploading, setUploading] = useState(false);
  const pending = useRef(false);
  const focusErrors = useRef(false);
  const root = useRef(null);
  const busy = saving || scanning;
  const meaningful = !created && (draft.dirty || !!file);
  useUnloadWarning(guided && (meaningful || busy));
  async function canLeave() { return !busy && (!meaningful || await confirm('Your changes have not been submitted. Any selected photo must be selected again.')); }
  useEffect(() => {
    if (!guided || !leaveGuard) return;
    leaveGuard.current = canLeave;
    return () => { leaveGuard.current = null; };
  });
  useEffect(() => {
    if (focusErrors.current) {
      const invalid = root.current?.querySelector('[aria-invalid="true"]');
      let parent = invalid?.parentElement;
      while (parent && parent !== root.current) { if (parent.tagName === 'DETAILS') parent.open = true; parent = parent.parentElement; }
      invalid?.focus(); focusErrors.current = false;
    }
  }, [errors, section, step]);
  useEffect(() => { if (guided && !Object.values(errors).some(Boolean)) root.current?.querySelector('.registration-step-title')?.focus(); }, [step, created]);
  function move(next) { setStep(next); setValues(current => ({ ...current, registrationStep: next })); }
  function advance() {
    const found = validateRegistration(values, step);
    if (Object.keys(found).length) { showErrors(found); return; }
    setErrors({}); move(returnToReview ? 4 : step + 1); setReturnToReview(false);
  }
  function set(path, value) {
    setValues(current => {
      const next = structuredClone(current); const keys = path.split('.');
      let target = next; for (const key of keys.slice(0, -1)) target = target[key];
      target[keys.at(-1)] = value; return next;
    });
    setErrors(current => ({ ...current, [path]: '' }));
  }
  function field([key, label, max, type = 'text'], prefix = '', required = false) {
    const path = prefix ? `${prefix}.${key}` : key;
    const value = path.split('.').reduce((object, part) => object?.[part], values) ?? '';
    const id = 'student-' + path.replaceAll('.', '-');
    const props = { id, disabled: busy, value, maxLength: max, 'aria-label': label + (required ? ' *' : ''), 'aria-required': required, 'aria-invalid': !!errors[path], 'aria-describedby': errors[path] ? id + '-error' : undefined, onChange: event => set(path, event.target.value) };
    return <label key={path} className={type === 'textarea' ? 'full-row' : ''} htmlFor={id}><span>{label}{required ? ' *' : <small className="optional-label"> (optional)</small>}</span>{key === 'civilStatus' ? <select {...props}><option value="">Not provided</option>{['Single','Married','Widowed','Separated','Other'].map(option => <option key={option}>{option}</option>)}</select> : type === 'textarea' ? <textarea {...props} rows={3} /> : <input {...props} type={type} />}{errors[path] && <span id={id + '-error'} className="field-error">{errors[path]}</span>}</label>;
  }
  function showErrors(found) {
    focusErrors.current = true;
    setErrors(found);
    const key = Object.keys(found)[0];
    if (guided) { move(fieldStep(key)); return; }
    setSection(key?.startsWith('profile.education') ? 'Education' : key?.startsWith('profile.family') ? 'Family' : key === 'profile.medication' ? 'Medical' : contactFields.some(([name]) => key === 'profile.' + name) ? 'Contact' : key?.startsWith('profile.') ? 'Personal' : key === 'uid' ? 'RFID' : 'Profile');
  }
  async function submit(event) {
    event.preventDefault(); if (pending.current || busy) return;
    if (guided && step !== 4) { advance(); return; }
    const found = validateRegistration(values);
    if (Object.keys(found).length) { showErrors(found); return; }
    pending.current = true; setSaving(true); setError('');
    let recordSaved = false;
    try {
      const { persistedId, registrationStep, ...body } = values;
      const saved = await api('/students' + (savedId ? '/' + savedId : ''), { method: savedId ? 'PUT' : 'POST', body });
      setSavedId(saved.id); recordSaved = true;
      setValues(current => ({ ...current, persistedId: saved.id }));
      if (file) { setUploading(true); await uploadStudentPhoto(saved.id, file); }
      draft.clear(); setFile(null); if (guided) setCreated(saved); onSaved(saved);
    } catch (failure) {
      if (recordSaved) {
        // Persist the saved ID so retrying or restoring the draft updates this record.
        setError('Student record saved, but the photo was not uploaded. Retry saving to upload the selected photo without creating another student.');
      } else { if (failure.fields) showErrors(failure.fields); setError(failure.status && failure.status < 500 ? failure.message : 'Unable to save student. Please try again.'); }
    } finally { pending.current = false; setSaving(false); setUploading(false); }
  }
  function renderSection(section) {
    return <section aria-label={section}>
        {!guided && <h3>{section === 'Personal' ? 'Personal information' : section === 'Contact' ? 'Contact information' : section === 'RFID' ? 'RFID information' : section}</h3>}
        {section === 'Profile' && <>{!guided && <StudentPhoto student={student || {}} disabled={saving} onFile={setFile} stagedFile={file} />}<div className="modal-grid">{field(['studentNo','Student ID',50], '', true)}{field(['course','Course / program',120], '', true)}{field(['year','Year level',30], '', true)}{field(['section','Section',40])}<label className="remember-label"><input type="checkbox" checked={values.active} onChange={event => set('active', event.target.checked)} disabled={busy} />Active enrollment</label></div></>}
        {section === 'Personal' && <>{student && !student.profile && <p className="muted">Existing name: {student.name}. Enter the name components to complete this profile.</p>}<div className="modal-grid">{personalFields.map(item => field(item, 'profile', ['givenName','lastName'].includes(item[0])))}<div><span className="muted">Age</span><p>{ageFromBirth(values.profile.dateOfBirth) || 'Not provided'}</p></div></div></>}
        {section === 'Contact' && <div className="modal-grid">{contactFields.map(item => field(item, 'profile'))}</div>}
        {section === 'Education' && levels.map(([key, label]) => <fieldset className="profile-group" key={key}><legend>{label}</legend><div className="modal-grid">{schoolFields.map(item => field(item, 'profile.education.' + key))}</div></fieldset>)}
        {section === 'Family' && <>{relatives.map(([key, label]) => <fieldset className="profile-group" key={key}><legend>{label}</legend><div className="modal-grid">{familyFields.map(item => field(item, 'profile.family.' + key))}</div></fieldset>)}{values.profile.family.siblings.map((sibling, index) => <fieldset className="profile-group" key={index}><legend>Sibling {index + 1}</legend><div className="modal-grid">{familyFields.map(item => field(item, 'profile.family.siblings.' + index))}</div><button type="button" className="icon-button" title="Remove sibling" aria-label={`Remove sibling ${index + 1}`} disabled={busy} onClick={() => set('profile.family.siblings', values.profile.family.siblings.filter((_, i) => i !== index))}><Trash2 size={17} /></button></fieldset>)}<button type="button" className="button" disabled={busy || values.profile.family.siblings.length >= 20} onClick={() => set('profile.family.siblings', [...values.profile.family.siblings, { name: '', occupation: '', contactNumber: '' }])}><Plus size={16} />Add sibling</button></>}
        {section === 'Medical' && <div className="modal-grid">{field(['medication','Medication',2000,'textarea'], 'profile')}</div>}
        {section === 'RFID' && <><p className="enrolled">{values.uid ? 'Registered card selected' : 'Not registered'}</p><div className="modal-grid">{field(['uid','RFID UID',20])}</div><CardCapture studentId={savedId} disabled={saving} onBusy={setScanning} onUse={uid => set('uid', uid)} /></>}
      </section>;
  }
  if (guided) return <div ref={root} className="student-editor student-registration">
    <button className="button registration-return" type="button" disabled={busy} onClick={async () => { if (await canLeave()) onClose(); }}><ArrowLeft size={16} />Students</button>
    {created ? <section className="registration-success" aria-label="Student created"><Check size={28} /><h1>Student created</h1><p><strong>{created.name}</strong><br />{created.studentNo}</p><div className="registration-success-actions"><button className="button primary" onClick={() => onView(created)}><UserRound size={16} />View student</button><button className="button" onClick={() => { setValues(initial); draft.clear(); setSavedId(undefined); setStep(0); setCreated(null); setErrors({}); setError(''); }}><Plus size={16} />Add another student</button><button className="button" onClick={onClose}><ArrowLeft size={16} />Back to students</button></div></section> : <>
      <header className="registration-heading"><h1>Add student</h1><p aria-live="polite">Step {step + 1} of 5 / {registrationSteps[step]}</p></header>
      <ol className="registration-progress" aria-label="Registration progress">{registrationSteps.map((label, index) => <li key={label} aria-current={index === step ? 'step' : undefined}><button type="button" disabled={busy || index > step} onClick={() => { setReturnToReview(step === 4); move(index); }}><span className="step-number">{index < step && !Object.keys(validateRegistration(values, index)).length ? <Check size={15} /> : index + 1}</span><span>{label}</span></button></li>)}</ol>
      <DraftStatus draft={draft} />
      {savedId && <p className="notice" role="status">The student record is already saved. Further saves update this record. Reselect any photo after restoring this draft.</p>}
      {error && <div className="notice notice-error" role="alert">{error}</div>}
      <form noValidate onSubmit={submit}>
        <h2 className="registration-step-title" tabIndex={-1}>{['Personal information','Academic information','Contact information','Additional information','Review student'][step]}</h2>
        {Object.values(errors).some(Boolean) && <p className="field-error" role="alert">Check the highlighted fields.</p>}
        {step === 0 && <><StudentPhoto student={{}} disabled={busy} onFile={setFile} stagedFile={file} />{renderSection('Personal')}</>}
        {step === 1 && <>{renderSection('Profile')}<details className="registration-details"><summary>Previous education <small>Optional</small></summary>{renderSection('Education')}</details></>}
        {step === 2 && renderSection('Contact')}
        {step === 3 && <>{renderSection('RFID')}<details className="registration-details"><summary>Family <small>Optional</small></summary>{renderSection('Family')}</details><details className="registration-details"><summary>Medical information <small>Optional</small></summary>{renderSection('Medical')}</details></>}
        {step === 4 && <>{registrationSteps.slice(0, 4).map((label, index) => <section className="registration-review" key={label} aria-label={label + ' review'}><header><h3>{label}</h3><button className="button" type="button" disabled={busy} onClick={() => { setReturnToReview(true); move(index); }}><Pencil size={14} />Edit {label.toLowerCase()}</button></header>{index > 1 && !registrationFields(values).some(([path]) => fieldStep(path) === index && fieldValue(values, path)) && <p className="muted">No optional information provided.</p>}<dl className="student-profile-values">{registrationFields(values).filter(([path]) => fieldStep(path) === index && fieldValue(values, path)).map(([path, name]) => <div key={path}><dt>{name}</dt><dd>{fieldValue(values, path) || 'Not provided'}</dd></div>)}{index === 0 && <div><dt>Student picture</dt><dd>{file?.name || 'No new photo selected'}</dd></div>}{index === 1 && <div><dt>Enrollment</dt><dd>{values.active ? 'Active' : 'Inactive'}</dd></div>}</dl></section>)}</>}
        <footer className="registration-actions"><button type="button" className="button" disabled={busy || step === 0} onClick={() => { setReturnToReview(false); move(step - 1); }}><ArrowLeft size={16} />Back</button><BusyButton type="submit" className="button primary" busy={saving} disabled={scanning} busyLabel={uploading ? 'Uploading photo...' : 'Saving student...'} icon={step === 4 ? Save : ArrowRight}>{step === 4 ? (savedId ? 'Save student' : 'Create student') : returnToReview ? 'Return to review' : 'Continue'}</BusyButton></footer>
      </form>
    </>}
  </div>;
  return <Modal title="Edit student" onClose={onClose} busy={busy} dirty={draft.dirty || !!file} lossWarning={file ? 'The selected photo has not been saved. You will need to select it again.' : draft.storageError ? 'Your draft could not be saved. Closing will lose these changes.' : ''} onSubmit={submit} footer={({ close }) => <><button type="button" className="button" disabled={busy} onClick={close}>Cancel</button><BusyButton className="button primary" busy={saving} disabled={scanning} busyLabel={uploading ? 'Uploading photo...' : 'Saving...'} icon={Save}>Save changes</BusyButton></>}>
    <div ref={root} className="student-editor"><DraftStatus draft={draft} />
      {error && <div className="notice notice-error" role="alert">{error}</div>}
      <nav className="student-sections" aria-label="Student form sections">{sections.map(name => <button key={name} type="button" disabled={busy} aria-current={section === name ? 'page' : undefined} onClick={() => setSection(name)}>{name}</button>)}</nav>
      {renderSection(section)}
    </div>
  </Modal>;
}
