import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';

const initial = (path) => ({ path, data: null, loading: true, refreshing: false, error: '' });

export function useRecords(path, enabled = true, pollMs = 15000) {
  const [state, setState] = useState(() => initial(path));
  const active = useRef(null);
  const currentPath = useRef(path);
  currentPath.current = path;
  const refresh = useCallback(async () => {
    // A completed mutation can still hold the refresh callback for an older filter.
    if (!enabled || currentPath.current !== path) return;
    active.current?.abort();
    const controller = new AbortController();
    active.current = controller;
    const timeout = setTimeout(() => controller.abort('timeout'), 8000);
    setState((previous) => ({ ...(previous.path === path ? previous : initial(path)), refreshing: true }));
    try {
      const data = await api(path, { signal: controller.signal });
      if (active.current === controller && currentPath.current === path) setState({ path, data, loading: false, refreshing: false, error: '' });
    } catch (error) {
      if (active.current === controller && currentPath.current === path) setState((previous) => ({ ...previous, loading: false, refreshing: false, error: error.message }));
    } finally {
      clearTimeout(timeout);
      if (active.current === controller) active.current = null;
    }
  }, [path, enabled]);
  useEffect(() => {
    refresh();
    const timer = enabled && pollMs > 0 ? setInterval(() => { if (!active.current && !document.hidden) refresh(); }, pollMs) : null;
    return () => { clearInterval(timer); const controller = active.current; active.current = null; controller?.abort(); };
  }, [refresh, enabled, pollMs]);
  const current = state.path === path ? state : initial(path);
  return { ...current, refresh };
}
