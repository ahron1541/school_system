import { useEffect, useRef, useState } from 'react';

const prefix = 'gate-draft-v1:';
const lifetime = 8 * 60 * 60 * 1000;
const keyFor = (userId, feature, id) => `${prefix}${userId}:${feature}:${id}`;
const announce = () => window.dispatchEvent(new Event('drafts-changed'));
export function readDraft(key) {
  try {
    const draft = JSON.parse(sessionStorage.getItem(key));
    if (!draft || typeof draft.values !== 'object' || !draft.meta || !Number.isFinite(draft.savedAt) || Date.now() - draft.savedAt > lifetime) {
      sessionStorage.removeItem(key); return null;
    }
    return draft;
  } catch { return null; }
}
export function removeDraft(key) { try { sessionStorage.removeItem(key); announce(); } catch { /* Storage can be unavailable. */ } }
export function clearUserDrafts(userId) {
  try { Object.keys(sessionStorage).filter((key) => key.startsWith(prefix + userId + ':')).forEach(removeDraft); } catch { /* Storage is optional. */ }
}
export function latestDraft(userId, feature) {
  try { return Object.keys(sessionStorage).filter((key) => key.startsWith(`${prefix}${userId}:${feature}:`)).map((key) => ({ key, ...readDraft(key) })).filter((draft) => draft.savedAt).sort((a,b) => b.savedAt-a.savedAt)[0] || null; } catch { return null; }
}
export function useFormDraft({ userId, feature, id, initial, fields, meta }) {
  const key = keyFor(userId, feature, id);
  const [restored] = useState(() => fields.length ? readDraft(key) : null);
  const [values, update] = useState(() => ({ ...initial, ...Object.fromEntries(fields.filter((field) => typeof restored?.values?.[field] === typeof initial[field]).map((field) => [field, restored.values[field]])) }));
  const current = useRef(values);
  const [saved, setSaved] = useState(!!restored);
  const [storageError, setStorageError] = useState(false);
  const [dirty, setDirty] = useState(!!restored);
  function setValues(next) {
    const value = typeof next === 'function' ? next(current.current) : next;
    current.current = value; update(value); setDirty(true);
    if (!fields.length) return;
    try {
      // Explicit allowlist: passwords and file contents never enter browser storage.
      sessionStorage.setItem(key, JSON.stringify({ savedAt: Date.now(), values: Object.fromEntries(fields.map((field) => [field, value[field]])), meta: restored?.meta || meta }));
      setSaved(true); setStorageError(false); announce();
    } catch { setStorageError(true); setSaved(false); }
  }
  function clear() { removeDraft(key); setSaved(false); setDirty(false); }
  return { values, setValues, clear, dirty, saved, storageError, restored: !!restored, meta: restored?.meta || meta };
}
export function useUnloadWarning(active) {
  useEffect(() => {
    if (!active) return;
    const warn = (event) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [active]);
}
