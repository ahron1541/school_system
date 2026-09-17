import { useRef, useState } from 'react';
import { api } from '../../shared/lib/api';

import { Save } from 'lucide-react';
import { BusyButton } from '../../shared/components/Loading';

export default function AccountPage({ auth, theme, toggleTheme }) {
  const [currentPassword, setCurrent] = useState('');
  const [newPassword, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const pending = useRef(false);
  const [busy, setBusy] = useState(false);
  async function submit(event) {
    event.preventDefault(); if (pending.current) return; setError('');
    if (newPassword !== confirm) { setError('New passwords do not match.'); return; }
    pending.current = true; setBusy(true);
    try { await api('/auth/password', { method: 'POST', body: { currentPassword, newPassword } }); auth.signedOut('Password updated. Sign in with your new password.'); }
    catch (failure) { setError(failure.message); } finally { pending.current = false; setBusy(false); }
  }
  return <><div className="page-heading"><div><h1>Account settings</h1><p>{auth.user.fullName} / {auth.user.username}</p></div></div><section className="section-block"><div className="section-heading"><h2>Appearance</h2></div><button className="button" onClick={toggleTheme}>{theme === 'dark' ? 'Use light mode' : 'Use night mode'}</button></section><section className="section-block"><h2>Change password</h2><form className="record-form account-form" onSubmit={submit} aria-busy={busy}>{error && <div className="notice notice-error" role="alert">{error}</div>}<label>Current password<input type="password" autoComplete="current-password" required value={currentPassword} onChange={(event) => setCurrent(event.target.value)} /></label><label>New password (12+ characters)<input type="password" autoComplete="new-password" required minLength={12} value={newPassword} onChange={(event) => setNext(event.target.value)} /></label><label>Confirm new password<input type="password" autoComplete="new-password" required minLength={12} value={confirm} onChange={(event) => setConfirm(event.target.value)} /></label><BusyButton className="button primary" busy={busy} busyLabel="Updating password..." icon={Save}>Change password and sign out</BusyButton></form></section></>;
}
