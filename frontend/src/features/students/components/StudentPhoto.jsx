import { useEffect, useRef, useState } from 'react';
import { Upload } from 'lucide-react';
import { uploadStudentPhoto } from '../services/studentPhotoApi';

import { BusyButton } from '../../../shared/components/Loading';
import Photo from '../../../shared/components/Photo';

export default function StudentPhoto({ student, disabled, onBusy, onUnsaved, onFile, stagedFile }) {
  if (onFile) return <StagedPhoto student={student} disabled={disabled} file={stagedFile} onFile={onFile} />;
  return <ExistingPhoto student={student} disabled={disabled} onBusy={onBusy} onUnsaved={onUnsaved} />;
}

function StagedPhoto({ student, disabled, file, onFile }) {
  const [preview, setPreview] = useState('');
  const [error, setError] = useState('');
  const input = useRef(null);
  useEffect(() => { if (!file) { setPreview(''); return; } const url = URL.createObjectURL(file); setPreview(url); return () => URL.revokeObjectURL(url); }, [file]);
  function choose(event) {
    const next = event.target.files[0]; setError('');
    if (!next) return;
    if (!['image/jpeg','image/png','image/webp'].includes(next.type) || next.size > 2 * 1024 * 1024) { setError('Choose a JPG, PNG or WebP photo up to 2 MB.'); event.target.value = ''; return; }
    onFile(next);
  }
  return <div className="profile-photo-field"><Photo src={preview || student.photo} fallback={student.initials || 'No photo'} alt="Student picture preview" /><div><label htmlFor="profile-picture">Student picture <small className="optional-label">(optional)</small></label><input ref={input} id="profile-picture" aria-label="Student picture" type="file" accept="image/jpeg,image/png,image/webp" disabled={disabled} onChange={choose} /><p className="muted photo-requirements">JPG, PNG or WebP / Up to 2 MB</p>{file && <button type="button" className="button" disabled={disabled} onClick={() => { onFile(null); input.current.value = ''; }}>Remove selection</button>}{error && <p role="alert" className="field-error">{error}</p>}</div></div>;
}

function ExistingPhoto({ student, disabled, onBusy, onUnsaved }) {
  const [uploading, setUploading] = useState(false);
  const pending = useRef(false);
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  useEffect(() => { onUnsaved?.(!!file && !message); }, [file, message, onUnsaved]);
  useEffect(() => {
    if (!file) { setPreview(''); return; }
    const url = URL.createObjectURL(file); setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  function choose(event) {
    const next = event.target.files[0]; setError(''); setMessage(''); setFile(null);
    if (!next) return;
    if (!['image/jpeg','image/png','image/webp'].includes(next.type) || next.size > 2 * 1024 * 1024) { setError('Choose a JPG, PNG or WebP photo up to 2 MB.'); event.target.value = ''; return; }
    setFile(next);
  }
  async function upload() {
    if (!file || disabled || pending.current) return;
    pending.current = true; setUploading(true); setMessage('');
    setError(''); onBusy(true);
    try { await uploadStudentPhoto(student.id, file); setMessage('Photo saved.'); }
    catch (failure) { setError(failure.message); }
    finally { pending.current = false; setUploading(false); onBusy(false); }
  }
  return <section className="student-photo-editor" aria-label="Photo management"><label htmlFor="student-photo">Student photo</label><input id="student-photo" type="file" accept="image/jpeg,image/png,image/webp" disabled={disabled || uploading} onChange={choose} />{(preview || student.photo) && <Photo src={preview || student.photo} alt="Student photo preview" fallback="Photo unavailable" />}{file && <p className="upload-file"><strong>{file.name}</strong>{Math.ceil(file.size / 1024)} KB</p>}<BusyButton type="button" busy={uploading} busyLabel="Uploading photo..." icon={Upload} disabled={!file || disabled} onClick={upload}>Upload photo</BusyButton>{file && !message && <button type="button" className="button" disabled={disabled || uploading} onClick={() => { setFile(null); document.getElementById('student-photo').value = ''; }}>Remove selection</button>}<div className="upload-feedback">{error && <p role="alert">{error} Select the file again or retry the upload.</p>}{message && <p role="status">{message}</p>}</div></section>;
}
