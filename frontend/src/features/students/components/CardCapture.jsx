import { useEffect, useRef, useState } from 'react';
import { ScanLine, Check, X } from 'lucide-react';
import { BusyButton } from '../../../shared/components/Loading';
import { adminScannerApi } from '../services/adminScannerApi';
import './card-capture.css';

export default function CardCapture({ studentId, disabled, onUse, onBusy }) {
  const [capture, setCapture] = useState(null);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const active = useRef(null);
  const mounted = useRef(false);
  const pending = useRef(false);
  const busy = working || !!capture;
  useEffect(() => { onBusy(busy); }, [busy, onBusy]);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; if (active.current) void adminScannerApi.cancel(active.current).catch(() => {}); };
  }, []);
  useEffect(() => {
    if (capture?.state !== 'waiting') return;
    let stopped = false, timer;
    async function poll() {
      try {
        if (Date.now() >= capture.expiresAt) throw new Error('Scan request expired. Start a new scan.');
        const result = await adminScannerApi.read(capture.id);
        if (!stopped) { setCapture(result); if (result.state === 'waiting') timer = setTimeout(poll, 700); }
      } catch (failure) {
        if (!stopped) {
          void adminScannerApi.cancel(capture.id).catch(() => {});
          active.current = null; setCapture(null); setError(failure.message);
        }
      }
    }
    timer = setTimeout(poll, 500);
    return () => { stopped = true; clearTimeout(timer); };
  }, [capture?.id, capture?.state, capture?.expiresAt]);
  async function start() {
    if (pending.current || active.current) return;
    pending.current = true; setWorking(true); setError(''); setNotice('');
    try {
      const result = await adminScannerApi.start(studentId);
      if (!mounted.current) { void adminScannerApi.cancel(result.id).catch(() => {}); return; }
      active.current = result.id; setCapture(result);
    } catch (failure) { if (mounted.current) setError(failure.message); }
    finally { pending.current = false; if (mounted.current) setWorking(false); }
  }
  async function finish(use) {
    if (pending.current || !capture) return;
    pending.current = true; setWorking(true); setError('');
    try {
      if (use && Date.now() >= capture.expiresAt) throw new Error('Scan request expired. Scan the card again.');
      await adminScannerApi.cancel(capture.id);
      if (use) { onUse(capture.uid); setNotice('Card added to this form. Save student to assign it.'); }
    } catch (failure) { setError(failure.message); }
    finally { active.current = null; setCapture(null); pending.current = false; setWorking(false); }
  }
  return <section className="card-capture" aria-label="Admin RFID scanner" aria-busy={working || undefined}>
    <div className="card-capture-heading"><strong>Admin scanner</strong>{!capture && <BusyButton type="button" icon={ScanLine} busy={working} busyLabel="Preparing..." disabled={disabled} onClick={start}>Scan card</BusyButton>}</div>
    <div role="status">{capture?.state === 'waiting' ? 'Waiting for a card on Scanner 1. Request expires after 90 seconds.' : capture?.state === 'captured' ? 'Card received. Review the UID before using it.' : capture?.state === 'conflict' ? 'This card is already assigned to another student. Choose a different card.' : notice}</div>
    {capture?.uid && <code className="captured-uid">{capture.uid}</code>}
    {capture && <div className="card-capture-actions">{capture.state === 'captured' && <button type="button" className="button primary" disabled={working || disabled} onClick={() => finish(true)}><Check size={16} />Use this card</button>}<button type="button" className="button" disabled={working} onClick={() => finish(false)}><X size={16} />Cancel scan</button></div>}
    {error && <div className="notice notice-error" role="alert">{error}</div>}
  </section>;
}
