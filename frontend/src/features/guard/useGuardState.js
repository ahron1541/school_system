import { useEffect, useState } from 'react';
import { getGuardState } from './guardApi';

export function useGuardState(display = false) {
  const [state, setState] = useState({ data: null, loading: true, error: '' });
  useEffect(() => {
    let stopped = false;
    let timer;
    let expiry;
    let controller;
    async function poll() {
      controller = new AbortController();
      setState((previous) => ({ ...previous, refreshing: true }));
      const timeout = setTimeout(() => controller.abort(), 5000);
      try {
        const data = await getGuardState(display, controller.signal);
        if (!stopped) {
          clearTimeout(expiry);
          setState({ data, loading: false, refreshing: false, error: '' });
          if (data.scan) {
            // Use server-relative time so a wrong workstation clock cannot keep a face visible.
            const remaining = Math.max(0, new Date(data.scan.expiresAt) - new Date(data.serverTime));
            expiry = setTimeout(() => setState((current) => ({ ...current, data: current.data ? { ...current.data, scan: null } : null })), remaining);
          }
        }
      } catch (error) {
        if (!stopped) { clearTimeout(expiry); setState({ data: null, loading: false, refreshing: false, error: error.message }); }
      } finally {
        clearTimeout(timeout);
        if (!stopped) timer = setTimeout(poll, 1000);
      }
    }
    poll();
    return () => { stopped = true; clearTimeout(timer); clearTimeout(expiry); controller?.abort(); };
  }, [display]);
  return state;
}
