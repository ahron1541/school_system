import { MonitorUp, ShieldAlert, Activity } from 'lucide-react';
import { useGateStream as useGuardState } from './useGateStream';
import PresenceCorrection from './PresenceCorrection';
import GateActivity from './GateActivity';
import ScanIdentity from './ScanIdentity';
import GuardSkeleton from './GuardSkeleton';
import { Spinner, useDelayedBusy } from '../../shared/components/Loading';

export default function GuardPage({ onReport,students=[] }) {
  const { data, loading, error, refreshing } = useGuardState();
  const slowRefresh = useDelayedBusy(refreshing && !loading, 600);
  return <>
    <div className="page-heading"><div><h1>Guard post</h1><p>Live gate monitoring / Asia/Manila</p></div><a className="button" href="/?display=1" target="_blank" rel="noopener"><MonitorUp size={17} />Open scan display</a></div>
    <div className="guard-connections" role="status"><span>Backend / database: <strong>{loading ? 'Checking' : error ? 'Unavailable' : 'Connected'}</strong></span><span>Reader: <strong>{error ? 'Unknown' : data?.device.connection === 'online' ? 'Online' : data?.device.connection === 'degraded' ? 'Needs attention' : data?.device.connection === 'offline' ? 'Disconnected' : data ? 'Not seen' : 'Unknown'}</strong></span><span>{data?.device.deviceId || ''}</span>{slowRefresh && <span className="inline-busy"><Spinner />Refreshing scan status...</span>}</div>
    {error && <div className="notice notice-error" role="alert">{error} Reconnecting automatically.</div>}
    {loading ? <GuardSkeleton /> : data && <>
      {Object.hasOwn(data,'semester') && !data.semester && <p className="notice" role="status">School semester not configured. Ask the administrator to set the current semester.</p>}
      <dl className="guard-totals"><div><dt>Entries today</dt><dd>{data.totals.entries}</dd></div><div><dt>Exits today</dt><dd>{data.totals.exits}</dd></div><div><dt>Active violations</dt><dd>{data.totals.alerts}</dd></div></dl>
      <ScanIdentity scan={data.scan} connection={data.device.connection} />
      <div className="guard-actions"><button className="button primary" onClick={() => onReport(data.scan?.person?.id || '')}><ShieldAlert size={16} />Report violation</button><a className="button" href="#activity"><Activity size={16} />View gate activity</a></div>
      {data.exceptions && <PresenceCorrection students={students} exceptions={data.exceptions}/>}
      <GateActivity latestId={data.recent[0]?.id} onReport={onReport}/>
    </>}
  </>;
}
