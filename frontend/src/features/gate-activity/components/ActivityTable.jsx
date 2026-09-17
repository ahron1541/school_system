import { useState } from 'react';
import { ArrowDownLeft, ArrowUpRight, ChevronLeft, ChevronRight, Search, ScanLine } from 'lucide-react';
import { TableSkeleton } from '../../../shared/components/Loading';
import { Avatar } from '../../../shared/components/Status';

export function Direction({ value }) {
  return <span className={`direction direction-${value.toLowerCase()}`}>{value === 'IN' ? <ArrowDownLeft size={13} /> : <ArrowUpRight size={13} />}{value === 'IN' ? 'Entry' : 'Exit'}</span>;
}

export default function ActivityTable({ events, onSelect, compact = false, loading = false }) {
  const [search, setSearch] = useState('');
  const [direction, setDirection] = useState('all');
  const [page, setPage] = useState(0);
  const matches = events.filter((event) => `${event.person.name} ${event.person.studentNo}`.toLowerCase().includes(search.toLowerCase()) && (direction === 'all' || event.direction === direction));
  const size = compact ? 6 : 8;
  const pageCount = Math.max(1, Math.ceil(matches.length / size));
  const currentPage = Math.min(page, pageCount - 1);
  const visible = matches.slice(currentPage * size, (currentPage + 1) * size);
  return <>
    <div className="table-toolbar">
      <label className="search-field"><Search size={16} /><span className="sr-only">Search gate activity</span><input placeholder="Search name or student ID" value={search} onChange={(event) => { setSearch(event.target.value); setPage(0); }} /></label>
      <label className="filter-label"><span className="sr-only">Direction</span><select value={direction} onChange={(event) => { setDirection(event.target.value); setPage(0); }}><option value="all">All activity</option><option value="IN">Entries</option><option value="OUT">Exits</option></select></label>
    </div>
    {loading ? <TableSkeleton columns={compact ? ['Student','Time','Activity','Review'] : ['Student','Time','Activity','Gate','Review']} rows={compact ? 6 : 5} label="Retrieving gate activity" /> : <><div className="table-scroll" tabIndex={0} role="region" aria-label="Gate activity table">
      <table><thead><tr><th>Student</th><th>Time</th><th>Activity</th>{!compact && <th>Gate</th>}<th>Review</th></tr></thead>
        <tbody>{visible.map((event) => <tr key={event.id}>
          <td><button className="person-button" onClick={() => onSelect(event.person)}><Avatar person={event.person} /><span><strong>{event.person.name}</strong><small>{event.person.studentNo}</small></span></button></td>
          <td className="numeric">{event.time.slice(0, 5)}</td>
          <td><Direction value={event.direction} /></td>
          {!compact && <td>{event.gate}</td>}
          <td>{event.alert ? <button className="alert-link" onClick={() => onSelect(event.person)}>Active alert</button> : <span className="muted">Clear</span>}</td>
        </tr>)}</tbody>
      </table>
    </div>
    {!matches.length && <div className="empty-state"><ScanLine size={24} /><h3>{events.length ? 'No matching activity' : 'No gate activity'}</h3><p>{events.length ? 'Try another name or clear the filters.' : 'No attendance records are available for this date.'}</p>{(search || direction !== 'all') && <button className="button" onClick={() => { setSearch(''); setDirection('all'); }}>Clear filters</button>}</div>}
    <div className="table-footer"><span>{matches.length ? `${currentPage * size + 1}-${Math.min((currentPage + 1) * size, matches.length)} of ${matches.length} records` : '0 records'}</span><div className="pagination"><button className="icon-button" title="Previous page" aria-label="Previous page" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}><ChevronLeft size={16} /></button><span>{currentPage + 1} / {pageCount}</span><button className="icon-button" title="Next page" aria-label="Next page" disabled={currentPage + 1 >= pageCount} onClick={() => setPage(currentPage + 1)}><ChevronRight size={16} /></button></div></div>
    </>}
  </>;
}
