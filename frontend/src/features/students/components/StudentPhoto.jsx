import { useEffect, useRef, useState } from 'react';
import { Upload } from 'lucide-react';
import { uploadStudentPhoto } from '../services/studentPhotoApi';

import { BusyButton } from '../../../shared/components/Loading';
import Photo from '../../../shared/components/Photo';

export default function StudentPhoto({ student, disabled, onBusy }) {
  const [uploading, setUploading] = useState(false);
  const pending = useRef(false);
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
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
  return <section className="student-photo-editor" aria-label="Photo management"><label htmlFor="student-photo">Student photo</label><input id="student-photo" type="file" accept="image/jpeg,image/png,image/webp" disabled={disabled || uploading} onChange={choose} />{(preview || student.photo) && <Photo src={preview || student.photo} alt="Student photo preview" fallback="Photo unavailable" />}{file && <p className="upload-file"><strong>{file.name}</strong>{Math.ceil(file.size / 1024)} KB</p>}<BusyButton type="button" busy={uploading} busyLabel="Uploading photo..." icon={Upload} disabled={!file || disabled} onClick={upload}>Upload photo</BusyButton><div className="upload-feedback">{error && <p role="alert">{error} Select the file again or retry the upload.</p>}{message && <p role="status">{message}</p>}</div></section>;
}
