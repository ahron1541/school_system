import { useRef, useState } from 'react';
import { Save, KeyRound, LogOut, UserPlus } from 'lucide-react';
import Modal from '../../shared/components/Modal';
import { useFormDraft } from '../../shared/hooks/useFormDraft';
import { DraftStatus } from '../../shared/components/DraftRecovery';
import { BusyButton } from '../../shared/components/Loading';
import { createAccount, updateAccount, resetAccountPassword, revokeAccountSessions, roleNames } from './usersApi';

export default function AccountDialog({ action, account, currentUserId, onClose, onSaved }) {
  const pending = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const draft = useFormDraft({ userId: currentUserId, feature: 'accounts', id: action + ':' + (account?.id || 'new'), initial: { username: account?.username || '', fullName: account?.fullName || '', role: account?.role || 'GUARD', active: account?.active ?? true, temporaryPassword: '', confirmPassword: '', adminPassword: '' }, fields: ['create','edit'].includes(action) ? ['username','fullName','role','active'] : [], meta: { action, account } });
  const { values, setValues } = draft;
  const titles = { create: 'Create account', edit: 'Edit account', reset: 'Reset password', revoke: 'Revoke sessions' };
  const labels = { create: 'Create account', edit: 'Save changes', reset: 'Reset password', revoke: 'Revoke sessions' };
  const busyLabels = { create: 'Creating account...', edit: 'Saving changes...', reset: 'Resetting password...', revoke: 'Revoking sessions...' };
  const icons = { create: UserPlus, edit: Save, reset: KeyRound, revoke: LogOut };
  const temporary = action === 'create' || action === 'reset';
  const self = account?.id === currentUserId;
  const change = (key) => (event) => setValues((previous) => ({ ...previous, [key]: event.target.type === 'checkbox' ? event.target.checked : event.target.value }));
  async function submit(event) {
    event.preventDefault();
    if (pending.current) return;
    setError(''); setPasswordError('');
    if (temporary && (values.temporaryPassword !== values.confirmPassword || new TextEncoder().encode(values.temporaryPassword).length > 72)) {
      setPasswordError(values.temporaryPassword !== values.confirmPassword ? 'The temporary passwords do not match.' : 'Use a password of at most 72 bytes.'); return;
    }
    pending.current = true; setBusy(true);
    try {
      const common = { adminPassword: values.adminPassword, version: draft.meta.account?.version };
      let result;
      if (action === 'create') result = await createAccount({ username: values.username.trim(), fullName: values.fullName.trim(), role: values.role, temporaryPassword: values.temporaryPassword, adminPassword: values.adminPassword });
      if (action === 'edit') result = await updateAccount(account.id, { ...common, fullName: values.fullName.trim(), role: values.role, active: values.active });
      if (action === 'reset') result = await resetAccountPassword(account.id, { ...common, temporaryPassword: values.temporaryPassword });
      if (action === 'revoke') result = await revokeAccountSessions(account.id, common);
      draft.clear(); onSaved(result);
    } catch (failure) { setError(failure.message); }
    finally { pending.current = false; setBusy(false); }
  }
  return <Modal title={titles[action]} closeLabel="Close account dialog" onClose={onClose} busy={busy} dirty={draft.dirty} lossWarning={values.adminPassword || values.temporaryPassword || values.confirmPassword ? 'Passwords will be cleared when this form closes.' : draft.storageError ? 'Your draft could not be saved. Closing will lose these changes.' : ''} compact={action === 'revoke'} onSubmit={submit} footer={({ close }) => <><button type="button" className="button" disabled={busy} onClick={close}>Cancel</button><BusyButton className="button primary" busy={busy} busyLabel={busyLabels[action]} icon={icons[action]}>{labels[action]}</BusyButton></>}>
    <DraftStatus draft={draft} passwords />
    {account && <p className="account-target">{account.fullName}<span>@{account.username}</span></p>}
    <div className="modal-grid">
      {error && <div className="notice notice-error" role="alert">{error}</div>}
      {(action === 'create' || action === 'edit') && <>
        {action === 'create' && <label>Username<input required minLength={3} maxLength={50} pattern="[a-zA-Z0-9_.\-]{3,50}" value={values.username} onChange={change('username')} disabled={busy} autoComplete="off" /></label>}
        <label>Full name<input required maxLength={120} value={values.fullName} onChange={change('fullName')} disabled={busy} /></label>
        <label>Role<select value={values.role} onChange={change('role')} disabled={busy || self}>{Object.entries(roleNames).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        {action === 'edit' && <label className="remember-label"><input type="checkbox" checked={values.active} onChange={change('active')} disabled={busy || self} />Active account</label>}
      </>}
      {temporary && <>
        <p className="account-consequence">The temporary password expires in 24 hours. The account holder must replace it at their next sign-in.</p>
        <label>Temporary password<input aria-label="Temporary password" type="password" required minLength={12} maxLength={72} autoComplete="new-password" value={values.temporaryPassword} onChange={change('temporaryPassword')} disabled={busy} aria-invalid={!!passwordError} aria-describedby="temporary-password-help" /><span id="temporary-password-help" className="field-help">12+ characters; maximum 72 bytes.</span></label>
        <label>Confirm temporary password<input type="password" required minLength={12} maxLength={72} autoComplete="new-password" value={values.confirmPassword} onChange={change('confirmPassword')} disabled={busy} aria-invalid={!!passwordError} aria-describedby={passwordError ? 'temporary-password-error' : undefined} /></label>
        {passwordError && <p id="temporary-password-error" className="field-error" role="alert">{passwordError}</p>}
      </>}
      {action !== 'create' && <p className="account-consequence">{action === 'edit' ? 'Saving changes signs this account out on all devices.' : action === 'reset' ? 'The existing password will stop working. All current sessions will end.' : 'All current sessions will end. The account can sign in again with its current password.'}{self && ' This includes your current session.'}</p>}
      <label className="full-row">Your administrator password<input type="password" required maxLength={72} autoComplete="current-password" value={values.adminPassword} onChange={change('adminPassword')} disabled={busy} /></label>
    </div>
  </Modal>;
}
