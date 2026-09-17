import { useEffect, useState } from 'react';
import { api, setCsrfToken } from '../../shared/lib/api';

export function useAuth() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  function signedOut(message = '') { setUser(null); setCsrfToken(''); setError(''); setNotice(message); }
  useEffect(() => {
    let active = true;
    api('/auth/me').then((data) => { if (active) { setCsrfToken(data.csrfToken); setUser(data.user); } }).catch((failure) => { if (active && failure.status !== 401) setError(failure.message); }).finally(() => { if (active) setLoading(false); });
    const expired = () => { signedOut(); setError('Your session ended. Please sign in again.'); };
    window.addEventListener('session-expired', expired);
    return () => { active = false; window.removeEventListener('session-expired', expired); };
  }, []);
  async function login(values) { setNotice(''); const data = await api('/auth/login', { method: 'POST', body: values }); setCsrfToken(data.csrfToken); setError(''); setUser(data.user); }
  async function logout() { await api('/auth/logout', { method: 'POST', body: {} }); signedOut(); }
  return { user, loading, error, notice, login, logout, signedOut };
}
