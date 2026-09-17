import { LoadingRegion, Skeleton, TableSkeleton } from '../../../shared/components/Loading';
import SystemPanel from '../../system/components/SystemPanel';

export default function OverviewSkeleton({ system }) {
  return <><LoadingRegion label="Retrieving attendance totals"><div className="metrics">{['Loaded scans','Entries','Exits','Students with alerts'].map((label) => <section key={label}><div className="metric-label">{label}</div><Skeleton className="skeleton-value" /></section>)}</div></LoadingRegion>
    <div className="overview-columns"><div className="overview-main"><section className="activity-chart"><div className="section-heading"><h2>Gate activity</h2></div><LoadingRegion label="Retrieving activity chart"><Skeleton className="skeleton-chart" /></LoadingRegion></section><section className="recent-section"><div className="section-heading"><h2>Recent gate activity</h2></div><TableSkeleton columns={['Student','Time','Activity','Review']} rows={6} label="Retrieving recent activity" /></section></div><aside className="overview-aside"><SystemPanel system={system} /><section className="latest-section"><h2>Latest record</h2><LoadingRegion label="Retrieving latest student"><div className="skeleton-profile"><Skeleton className="skeleton-avatar" /><div><Skeleton /><Skeleton /></div></div></LoadingRegion></section></aside></div>
  </>;
}
