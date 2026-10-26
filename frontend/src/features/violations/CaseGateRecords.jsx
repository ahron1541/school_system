import { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import Modal from '../../shared/components/Modal';
import { useRecords } from '../../shared/hooks/useRecords';
import { RefreshFeedback, TableSkeleton } from '../../shared/components/Loading';

export default function CaseGateRecords({ report, onClose }) {
  const [date, setDate] = useState(() => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(new Date(report.createdAt)));
  const [page, setPage] = useState(1);
  const resource = useRecords('/violations/'+encodeURIComponent(report.id)+'/gate-activity?'+new URLSearchParams({ date, page }));
  const data = resource.data;
  return <Modal title="Case gate records" onClose={onClose} footer={<button className="button" onClick={onClose}>Close</button>}>
    <p><strong>{report.name}</strong> / {report.studentNo}</p>
    <p className="case-description">{report.description}</p>
    <div className="report-filters"><label>Gate record date<input type="date" required value={date} onChange={(event) => { if (event.target.value) { setDate(event.target.value); setPage(1); } }} /></label><span className="muted">Asia/Manila</span></div>
    <RefreshFeedback resource={resource} label="case gate records" />
    {resource.loading ? <TableSkeleton columns={['Time','Activity','Gate']} label="Retrieving case gate records" /> : data && <>
      <div className="table-scroll" role="region" aria-label="Case gate records" tabIndex={0} aria-busy={resource.refreshing}><table><thead><tr><th>Time</th><th>Activity</th><th>Gate</th></tr></thead><tbody>{data.events.map((entry) => <tr key={entry.id}><td>{new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Manila', hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(new Date(entry.scannedAt))}</td><td>{entry.direction === 'IN' ? 'Entry' : 'Exit'}</td><td>{entry.gate}</td></tr>)}</tbody></table></div>
      {!data.events.length && <p className="notice">No gate records for this student on the selected date.</p>}
      <div className="report-pagination"><span>{data.pagination.total} records</span><div><button className="icon-button" title="Previous page" aria-label="Previous case records page" disabled={page <= 1 || resource.refreshing} onClick={() => setPage(page-1)}><ChevronLeft size={18} /></button><span>Page {page} of {data.pagination.totalPages}</span><button className="icon-button" title="Next page" aria-label="Next case records page" disabled={page >= data.pagination.totalPages || resource.refreshing} onClick={() => setPage(page+1)}><ChevronRight size={18} /></button></div></div>
    </>}
  </Modal>;
}
