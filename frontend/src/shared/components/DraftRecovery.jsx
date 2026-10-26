import { useEffect, useState } from 'react';
import { latestDraft, removeDraft } from '../hooks/useFormDraft';

export default function DraftRecovery({ userId, feature, onResume }) {
  const [draft, setDraft] = useState(() => latestDraft(userId, feature));
  const [confirm, setConfirm] = useState(false);
  useEffect(() => {
    const refresh = () => { setDraft(latestDraft(userId, feature)); setConfirm(false); };
    refresh(); window.addEventListener('drafts-changed', refresh);
    return () => window.removeEventListener('drafts-changed', refresh);
  }, [userId, feature]);
  if (!draft) return null;
  return <div className="draft-recovery"><span>{confirm ? 'Discard this unfinished form?' : 'Unfinished form saved in this tab.'}</span><div>{confirm ? <><button className="button" onClick={() => setConfirm(false)}>Keep draft</button><button className="button" onClick={() => removeDraft(draft.key)}>Discard draft</button></> : <><button className="button" onClick={() => onResume(draft.meta)}>Resume draft</button><button className="button" onClick={() => setConfirm(true)}>Discard</button></>}</div></div>;
}

export function DraftStatus({ draft, passwords = false }) {
  if (draft.storageError) return <p className="draft-status" role="alert">Draft could not be saved in this browser. Keep this form open.</p>;
  if (!draft.saved) return null;
  return <p className="draft-status" role="status">{draft.restored ? 'Draft restored. Review before saving.' : 'Draft saved in this tab.'}{passwords && ' Passwords are not saved.'}</p>;
}
