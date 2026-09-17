import { LoadingRegion, Skeleton, TableSkeleton } from '../../shared/components/Loading';

export function IdentitySkeleton() {
  return <LoadingRegion label="Retrieving latest scan"><div className="scan-skeleton"><Skeleton className="skeleton-portrait" /><div><Skeleton className="skeleton-name" /><Skeleton className="skeleton-name" /><Skeleton className="skeleton-cell" /></div></div></LoadingRegion>;
}

export default function GuardSkeleton() {
  return <><LoadingRegion label="Retrieving gate totals"><dl className="guard-totals">{['Entries today','Exits today','Active violations'].map((label) => <div key={label}><dt>{label}</dt><dd><Skeleton className="skeleton-value" /></dd></div>)}</dl></LoadingRegion><IdentitySkeleton /><section className="guard-recent"><h2>Recent scans</h2><TableSkeleton columns={['Time','Student','Result','Action']} rows={3} label="Retrieving recent scans" /></section></>;
}
