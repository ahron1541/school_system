import { useRef, useState } from 'react';
import { ScanLine, Eye, EyeOff, ArrowRight, Moon, Sun } from 'lucide-react';

import { BusyButton } from '../../shared/components/Loading';

export default function LoginPage({ auth, theme, toggleTheme }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(false);
  const [visible, setVisible] = useState(false);
  const pending = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit(event) {
    event.preventDefault(); if (pending.current) return; pending.current = true; setError(''); setBusy(true);
    try { await auth.login({ username: username.trim(), password, remember }); }
    catch (failure) { setError(failure.message); }
    finally { pending.current = false; setBusy(false); }
  }
  return <div className="login-page"><header className="login-header"><span className="brand"><span className="brand-mark"><ScanLine size={23} /></span><span>Gatehouse<small>School gate management</small></span></span><button className="icon-button" onClick={toggleTheme} title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'} aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}>{theme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}</button></header>
    <main className="login-main"><div className="login-title"><span className="eyebrow">STAFF ACCESS</span><h1>Welcome back</h1><p>Sign in to your school workspace.</p></div>
      <form onSubmit={submit} className="login-form" aria-busy={busy}>
        {auth.notice && <div className="notice notice-success" role="status">{auth.notice}</div>}
        {(error || auth.error) && <div className="notice notice-error" role="alert">{error || auth.error}</div>}
        <label>Username<input autoComplete="username" autoFocus required maxLength={50} value={username} onChange={(event) => setUsername(event.target.value)} /></label>
        <label>Password<span className="password-field"><input type={visible ? 'text' : 'password'} autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} /><button type="button" className="icon-button" aria-label={visible ? 'Hide password' : 'Show password'} title={visible ? 'Hide password' : 'Show password'} onClick={() => setVisible(!visible)}>{visible ? <EyeOff size={17} /> : <Eye size={17} />}</button></span></label>
        <label className="remember-label"><input type="checkbox" checked={remember} onChange={(event) => setRemember(event.target.checked)} />Keep me signed in for 7 days</label>
        <BusyButton className="button primary login-submit" busy={busy} busyLabel="Signing in..." icon={ArrowRight}>Sign in</BusyButton>
      </form><p className="login-help">Need access? Contact your system administrator.</p>
    </main><footer className="login-footer">Gatehouse / School gate & attendance</footer></div>;
}
