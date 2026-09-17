import { useCallback, useEffect, useRef, useState } from 'react';
import { getSystemStatus } from '../services/systemApi';

export function useSystemStatus(enabled = true) {
  const [state, setState] = useState({ data: null, checking: true, error: '' });
  const active = useRef(null);
  const refresh = useCallback(async () => {
    active.current?.abort();
    const controller = new AbortController();
    active.current = controller;
    const timeout = setTimeout(() => controller.abort('timeout'), 6000);
    setState((previous) => ({ ...previous, checking: true }));
    try {
      const data = await getSystemStatus(controller.signal);
      if (active.current === controller) setState({ data, checking: false, error: '' });
    } catch (error) {
      if (active.current !== controller) return;
      if (controller.signal.aborted && controller.signal.reason !== 'timeout') return;
      setState({ data: null, checking: false, error: error instanceof Error && error.message !== 'Failed to fetch' ? error.message : 'Unable to reach the backend.' });
    } finally {
      clearTimeout(timeout);
    }
  }, []);
  useEffect(() => {
    if (!enabled) return;
    refresh();
    const interval = setInterval(refresh, 10000);
    return () => { clearInterval(interval); const request = active.current; active.current = null; request?.abort(); };
  }, [refresh, enabled]);
  return { ...state, refresh };
}
