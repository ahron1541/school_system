import { ArrowUpRight, Database, Radio, Server, RefreshCw } from 'lucide-react';
import { Status } from '../../../shared/components/Status';
import { BusyButton, Skeleton, Spinner } from '../../../shared/components/Loading';

export function systemStates(system) {
  const fallback = system.error ? 'unknown' : 'checking';
  return {
    api: system.error ? 'disconnected' : system.data?.api.state || fallback,
    database: system.data?.database.state || fallback,
    device: system.data?.device.state || fallback,
  };
}

export function CheckButton({ system, text = false }) {
  if (text) return <BusyButton onClick={system.refresh} busy={system.checking} busyLabel="Checking connection..." icon={RefreshCw} title="Refresh system status" aria-label="Refresh system status">Check connection</BusyButton>;
  return <button className="icon-button" onClick={system.refresh} disabled={system.checking} aria-busy={system.checking} title="Refresh system status" aria-label="Refresh system status">{system.checking ? <Spinner /> : <RefreshCw size={15} />}</button>;
}

export default function SystemPanel({ system }) {
  const states = systemStates(system);
  const firstCheck = system.checking && !system.data;
  return <section className="system-panel" aria-label="Live system status">
    <div className="section-heading"><h2>System status</h2><CheckButton system={system} /></div>
    <div className="live-caption"><span className="live-dot" />Live checks</div>
    <div className="service-line" aria-busy={firstCheck}><span><Server size={16} />Backend API</span>{firstCheck ? <Skeleton className="skeleton-cell" /> : <Status state={states.api} />}</div>
    <div className="service-line" aria-busy={firstCheck}><span><Database size={16} />Database</span>{firstCheck ? <Skeleton className="skeleton-cell" /> : <Status state={states.database} />}</div>
    <div className="service-line" aria-busy={firstCheck}><span><Radio size={16} />Gate device</span>{firstCheck ? <Skeleton className="skeleton-cell" /> : <Status state={states.device} />}</div>
    <p className="status-note">{system.error || (states.database === 'not_configured' ? 'Database setup is pending. Attendance is not being saved.' : states.database === 'connected' ? 'Records are stored in the local PostgreSQL database.' : 'Connection checks refresh every 10 seconds.')}</p>
    <a className="text-link" href="#system">View system details<ArrowUpRight size={14} /></a>
  </section>;
}
