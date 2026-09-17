import { ArrowUpRight, ScanLine, ArrowDownLeft, ShieldAlert } from 'lucide-react';
import ActivityTable from '../../gate-activity/components/ActivityTable';
import SystemPanel from '../../system/components/SystemPanel';
import { Avatar } from '../../../shared/components/Status';
import OverviewSkeleton from './OverviewSkeleton';

export default function OverviewPage({ events, system, onSelect, loading = false }) {
  if (loading) return <OverviewSkeleton system={system} />;
  const metrics = [
    { label: 'Loaded scans', value: events.length, icon: ScanLine },
    { label: 'Entries', value: events.filter((event) => event.direction === 'IN').length, icon: ArrowDownLeft },
    { label: 'Exits', value: events.filter((event) => event.direction === 'OUT').length, icon: ArrowUpRight },
    { label: 'Students with alerts', value: new Set(events.filter((event) => event.alert).map((event) => event.person.id)).size, icon: ShieldAlert },
  ];
  const bins = Array.from({ length: 6 }, (_, index) => ({ hour: index * 4, count: events.filter((event) => Math.floor(Number(event.time.slice(0,2)) / 4) === index).length }));
  const max = Math.max(4, ...bins.map((bin) => bin.count));
  const latest = events[0];
  return <>
    <div className="metrics">{metrics.map(({ label, value, icon: Icon }) => <section key={label}><div className="metric-label">{label}<Icon size={16} /></div><div className="metric-value">{value.toLocaleString()}</div></section>)}</div>
    <div className="overview-columns"><div className="overview-main"><section className="activity-chart"><div className="section-heading"><h2>Gate activity</h2><span className="chart-key"><i />Scans per 4 hours</span></div><div className="chart" role="img" aria-label={bins.map((bin) => bin.hour + ':00, ' + bin.count + ' scans').join('. ')}><div className="chart-grid"><span>{max}</span><span>{Math.floor(max / 2)}</span><span>0</span></div><div className="chart-bars" style={{ gridTemplateColumns: 'repeat(6,minmax(0,1fr))' }}>{bins.map((bin) => <div className="chart-column" key={bin.hour}><div className="bar-track"><div className="bar" style={{ height: (bin.count / max * 100) + '%' }}>{bin.count > 0 && <span>{bin.count}</span>}</div></div><span>{String(bin.hour).padStart(2,'0')}:00</span></div>)}</div></div></section>
    <section className="recent-section"><div className="section-heading"><h2>Recent gate activity</h2><a className="text-link" href="#activity">View all<ArrowUpRight size={14} /></a></div><ActivityTable compact events={events} onSelect={onSelect} /></section></div>
    <aside className="overview-aside"><SystemPanel system={system} /><section className="latest-section"><div className="section-heading"><h2>Latest record</h2></div>{latest ? <><div className="latest-person"><Avatar person={latest.person} large /><strong>{latest.person.name}</strong><span>{latest.person.studentNo}</span></div><dl className="latest-details"><div><dt>Activity</dt><dd>{latest.direction === 'IN' ? 'Entry' : 'Exit'}</dd></div><div><dt>Time</dt><dd>{latest.time}</dd></div><div><dt>Device</dt><dd>{latest.gate}</dd></div></dl><button className="button full-width" onClick={() => onSelect(latest.person)}>View student record<ArrowUpRight size={14} /></button></> : <p className="status-note">No student scan for this date.</p>}</section></aside></div>
  </>;
}
