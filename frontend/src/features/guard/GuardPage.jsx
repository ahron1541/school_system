import { MonitorUp, ShieldAlert, Activity } from 'lucide-react';
import { useGuardState } from './useGuardState';
import ScanIdentity from './ScanIdentity';
import GuardSkeleton from './GuardSkeleton';
import { Spinner, useDelayedBusy } from '../../shared/components/Loading';

export default function GuardPage({ onReport }) {
  const { data, loading, error, refreshing } = useGuardState();
  const slowRefresh = useDelayedBusy(refreshing && !loading, 600);
  return <>
    <div className="page-heading"><div><h1>Guard post</h1><p>Live gate monitoring / Asia/Manila</p></div><a className="button" href="/?display=1" target="_blank" rel="noopener"><MonitorUp size={17} />Open scan display</a></div>
    <div className="guard-connections" role="status"><span>Backend / database: <strong>{loading ? 'Checking' : error ? 'Unavailable' : 'Connected'}</strong></span><span>Reader: <strong>{data?.device.connection === 'online' ? 'Online' : data?.device.connection === 'offline' ? 'Disconnected' : data ? 'Not seen' : 'Unknown'}</strong></span><span>{data?.device.deviceId || ''}</span>{slowRefresh && <span className="inline-busy"><Spinner />Refreshing scan status...</span>}</div>
    {error ? <div className="notice notice-error" role="alert">{error} Reconnecting automatically.</div> : loading ? <GuardSkeleton /> : <>
      <dl className="guard-totals"><div><dt>Entries today</dt><dd>{data.totals.entries}</dd></div><div><dt>Exits today</dt><dd>{data.totals.exits}</dd></div><div><dt>Active violations</dt><dd>{data.totals.alerts}</dd></div></dl>
      <ScanIdentity scan={data.scan} />
      <div className="guard-actions"><button className="button primary" onClick={() => onReport(data.scan?.person?.id || '')}><ShieldAlert size={16} />Report violation</button><a className="button" href="#activity"><Activity size={16} />View gate activity</a></div>
      <section className="guard-recent"><h2>Recent scans</h2><div className="table-scroll" role="region" aria-label="Recent scans" tabIndex={0}><table><thead><tr><th>Time</th><th>Student</th><th>Result</th><th>Action</th></tr></thead><tbody>{data.recent.map((scan) => <tr key={scan.id}><td>{new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Manila', dateStyle: 'short', timeStyle: 'medium' }).format(new Date(scan.receivedAt))}</td><td>{scan.name || 'Unknown card'}<small className="cell-small">{scan.studentNo}</small></td><td>{scan.status === 'alert' ? 'Recorded / active violation' : scan.status === 'ok' ? (scan.direction === 'IN' ? 'Entry recorded' : 'Exit recorded') : scan.status === 'blocked' ? 'Inactive enrollment' : scan.status === 'ignored' ? 'Repeat tap' : 'Not registered'}</td><td>{scan.studentId && <button className="button" onClick={() => onReport(scan.studentId)}>Report violation</button>}</td></tr>)}</tbody></table></div>{!data.recent.length && <p className="footnote">No scans received</p>}</section>
    </>}
  </>;
}
