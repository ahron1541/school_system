import { useEffect, useState } from 'react';
import { LoaderCircle, RefreshCw, ScanLine } from 'lucide-react';

export function useDelayedBusy(busy, delay = 150) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!busy) { setVisible(false); return; }
    const timer = setTimeout(() => setVisible(true), delay);
    return () => clearTimeout(timer);
  }, [busy, delay]);
  return busy && visible;
}

export function Spinner({ busy = true }) {
  const visible = useDelayedBusy(busy);
  return <LoaderCircle size={16} className={'loading-spinner ' + (!visible ? 'indicator-hidden' : '')} aria-hidden="true" />;
}

export function BusyButton({ busy, busyLabel, children, icon: Icon, className = 'button', disabled, ...props }) {
  return <button {...props} className={className + ' busy-button'} disabled={disabled || busy} aria-busy={busy || undefined}>
    <span className="button-icon">{busy ? <Spinner /> : Icon ? <Icon size={16} aria-hidden="true" /> : null}</span>
    <span className="button-labels"><span className={busy ? 'label-hidden' : ''} aria-hidden={busy || undefined}>{children}</span><span className={!busy ? 'label-hidden' : ''} aria-hidden={!busy || undefined}>{busyLabel}</span></span>
  </button>;
}

export function Skeleton({ className = '' }) { return <span aria-hidden="true" className={'skeleton ' + className} />; }

export function LoadingRegion({ label, children, className = '' }) {
  const visible = useDelayedBusy(true);
  return <div className={'loading-region ' + className} aria-busy="true" role="status" aria-label={label}>
    <div className={visible ? 'skeleton-content' : 'skeleton-content indicator-hidden'} aria-hidden="true">{children}</div>
  </div>;
}

export function TableSkeleton({ columns, rows = 5, label = 'Retrieving records' }) {
  return <LoadingRegion label={label}><div className="table-scroll"><table><thead><tr>{columns.map((column) => <th key={column}>{column}</th>)}</tr></thead><tbody>{Array.from({ length: rows }, (_, row) => <tr key={row}>{columns.map((column, index) => <td key={column}><Skeleton className={index === 0 ? 'skeleton-name' : 'skeleton-cell'} />{index === 0 && <Skeleton className="skeleton-secondary" />}</td>)}</tr>)}</tbody></table></div></LoadingRegion>;
}

export function RefreshFeedback({ resource, label = 'records' }) {
  const visible = useDelayedBusy(resource.refreshing);
  return <div className="resource-feedback">
    {resource.error ? <div className="notice notice-error" role="alert"><span>{resource.error}{resource.data !== null && ' Showing previously retrieved records.'}</span><BusyButton busy={resource.refreshing} busyLabel="Retrying..." onClick={() => resource.refresh()} icon={RefreshCw}>Try again</BusyButton></div> : <div className="refresh-line"><span role="status">{visible && <><Spinner />Refreshing {label}...</>}</span><button className="icon-button" title={'Refresh ' + label} aria-label={'Refresh ' + label} disabled={resource.refreshing} onClick={() => resource.refresh()}><RefreshCw size={16} /></button></div>}
  </div>;
}

export function Initialization() {
  return <div className="session-loading" aria-busy="true"><div className="initialization-brand"><ScanLine size={28} /><strong>Gatehouse</strong><span role="status">Preparing your workspace...</span></div></div>;
}
