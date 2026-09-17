import { Database, Server, Radio, CheckCircle2, AlertCircle } from 'lucide-react';
import { Status } from '../../../shared/components/Status';
import { CheckButton, systemStates } from '../components/SystemPanel';
import { LoadingRegion, Skeleton } from '../../../shared/components/Loading';

const descriptions = {
  connected: 'The database accepted a connection and completed a read-only check.',
  disconnected: 'The configured database could not be reached. Check the database service and connection settings.',
  not_configured: 'No database connection has been configured.',
  invalid_configuration: 'The database connection setting is invalid.',
  unknown: 'Database status cannot be determined until the backend is reachable.',
  checking: 'Checking the database connection.',
};

export default function SystemPage({ system }) {
  const states = systemStates(system);
  const checked = system.data?.checkedAt ? new Date(system.data.checkedAt).toLocaleTimeString('en-PH', { timeZone: 'Asia/Manila' }) : 'Not checked';
  if (system.checking && !system.data) return <>
    <div className="page-heading"><div><h1>System status</h1><p>Connection health and service availability</p></div><CheckButton system={system} text /></div>
    <LoadingRegion label="Checking system connections"><section className="database-summary"><div className="component-icon"><Database size={24} /></div><div><Skeleton className="skeleton-name" /><Skeleton className="skeleton-secondary" /></div></section><section className="section-block"><h2>Services</h2>{['Backend API','PostgreSQL database','Gate device'].map((label) => <div className="service-skeleton" key={label}><span>{label}</span><Skeleton className="skeleton-cell" /></div>)}</section><section className="section-block"><h2>Data &amp; access</h2>{Array.from({ length:5 }, (_, index) => <div className="service-skeleton" key={index}><Skeleton /><Skeleton /></div>)}</section></LoadingRegion>
  </>;
  return <>
    <div className="page-heading"><div><h1>System status</h1><p>Connection health and service availability</p></div><CheckButton system={system} text /></div>
    {system.error && <div className="notice notice-error" role="alert"><AlertCircle size={18} /><span>{system.error} Check that the backend is running, then retry.</span></div>}
    <section className="database-summary">
      <div className="component-icon"><Database size={24} /></div><div><span className="eyebrow">DATABASE CONNECTION</span><h2>{states.database === 'connected' ? 'Database is connected' : states.database === 'not_configured' ? 'Database setup pending' : states.database === 'disconnected' ? 'Database is disconnected' : states.database === 'checking' ? 'Checking database' : 'Database status unavailable'}</h2><p>{descriptions[states.database]}</p></div><Status state={states.database} />
    </section>
    <section className="section-block"><div className="section-heading"><h2>Services</h2><span className="muted small" aria-live="polite">Last checked {checked}</span></div>
      <div className="service-details"><div className="service-detail"><Server size={19} /><div><h3>Backend API</h3><p>Local application server</p></div><Status state={states.api} /></div>
        <div className="service-detail"><Database size={19} /><div><h3>PostgreSQL database</h3><p>{system.data?.database.latencyMs != null ? `Connection check completed in ${system.data.database.latencyMs} ms` : 'Connection check only; no schema changes'}</p></div><Status state={states.database} /></div>
        <div className="service-detail"><Radio size={19} /><div><h3>Gate device <span className="device-id">{system.data?.device.deviceId || 'gate-01'}</span></h3><p>{system.data?.device.lastSeenAt ? `Last contact ${new Date(system.data.device.lastSeenAt).toLocaleString('en-PH', { timeZone: 'Asia/Manila' })}` : 'No heartbeat received since the server started'}</p></div><Status state={states.device} /></div>
      </div>
    </section>
    <section className="section-block"><div className="section-heading"><h2>Data & access</h2></div><dl className="settings-list"><div><dt>Attendance storage</dt><dd>Local PostgreSQL</dd></div><div><dt>Device test storage</dt><dd>Temporary memory</dd></div><div><dt>Workspace access</dt><dd>Administrator only</dd></div><div><dt>Pending sync changes</dt><dd>{system.data?.sync?.pending ?? "Unavailable"}</dd></div><div><dt>Reporting timezone</dt><dd>Asia/Manila</dd></div></dl></section>
    <div className="footnote"><CheckCircle2 size={15} /><span>Local records are saved without internet. Supabase synchronization is not configured.</span></div>
  </>;
}
