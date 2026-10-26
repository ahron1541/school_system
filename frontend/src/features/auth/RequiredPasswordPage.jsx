import { useState } from 'react';
import { LogOut, Moon, Sun } from 'lucide-react';
import AccountPage from './AccountPage';
import { BusyButton } from '../../shared/components/Loading';
import BrandLogo from '../../shared/components/BrandLogo';

export default function RequiredPasswordPage({ auth, theme, toggleTheme }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function logout() { setBusy(true); setError(''); try { await auth.logout(); } catch (failure) { setError(failure.message); } finally { setBusy(false); } }
  return <main className="required-password"><div className="dialog-top"><span className="display-brand"><BrandLogo/><strong>CvSU Imus</strong></span><button className="icon-button" title="Change appearance" aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'} onClick={toggleTheme}>{theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}</button></div><AccountPage forced auth={auth} theme={theme} toggleTheme={toggleTheme} />{error && <p role="alert">{error}</p>}<BusyButton busy={busy} busyLabel="Signing out..." icon={LogOut} onClick={logout}>Log out</BusyButton></main>;
}
