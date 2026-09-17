import { useRef, useState } from 'react';
import { Download, ShieldAlert, Check, ChevronLeft, ChevronRight } from 'lucide-react';
import { reportViolation, clearViolation } from './violationApi';
import { downloadCsv } from '../../shared/lib/csv';

import { BusyButton, TableSkeleton, Spinner } from '../../shared/components/Loading';

const dateAtSchool = (value) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(value));
const timeAtSchool = (value) => new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Manila', dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));

export default function ViolationsPage({ students, records, role, onChanged, initialStudentId = '', loading = false, studentResource, exportDisabled = false }) {
  const [studentId, setStudentId] = useState(initialStudentId);
  const [description, setDescription] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [pendingAction, setPendingAction] = useState('');
  const busy = !!pendingAction;
  const pending = useRef(false);
  const [status, setStatus] = useState('ALL');
  const [date, setDate] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const request = useRef(null);
  const visible = records.filter((record) => (status === 'ALL' || record.status === status) && (!date || dateAtSchool(record.createdAt) === date) && (record.name + ' ' + record.studentNo).toLowerCase().includes(search.toLowerCase()));
  const totalPages = Math.max(1, Math.ceil(visible.length / 25));
  const currentPage = Math.min(page, totalPages);
  const pageRecords = visible.slice((currentPage - 1) * 25, currentPage * 25);
  async function report(event) {
    event.preventDefault(); if (pending.current) return; pending.current = true;
    const content = JSON.stringify({ studentId, description: description.trim() });
    if (!request.current || request.current.content !== content) request.current = { content, id: crypto.randomUUID() };
    setPendingAction('report'); setError(''); setSuccess('');
    try {
      await reportViolation({ studentId, description, requestId: request.current.id });
      setDescription(''); request.current = null; setSuccess('Violation recorded.'); await onChanged();
    } catch (failure) { setError(failure.message); }
    finally { pending.current = false; setPendingAction(''); }
  }
  async function clear(id) {
    if (pending.current) return;
    pending.current = true; setPendingAction(id); setError(''); setSuccess('');
    try { await clearViolation(id); setSuccess('Violation cleared.'); await onChanged(); }
    catch (failure) { setError(failure.message); }
    finally { pending.current = false; setPendingAction(''); }
  }
  function exportReport() {
    downloadCsv('violation-report-' + (date || 'loaded-records') + '.csv', [
      ['Report ID','Student number','Name','Description','Status','Reported by','Reported at (Asia/Manila)'],
      ...visible.map((record) => [record.id,record.studentNo,record.name,record.description,record.status,record.reportedBy,timeAtSchool(record.createdAt)]),
    ]);
    setSuccess('CSV download requested.');
  }
  return <>
    <div className="page-heading"><div><h1>Violations</h1><p>Incident reports and disciplinary review</p></div><button className="button" disabled={loading || exportDisabled || !visible.length} onClick={exportReport}><Download size={16} />Export report</button></div>
    {error && <div className="notice notice-error" role="alert">{error}</div>}
    {success && <div className="notice notice-success" role="status">{success}</div>}
    {['ADMIN','GUARD'].includes(role) && <form className="record-form violation-form" onSubmit={report} aria-busy={pendingAction === 'report'}>
      <label>Student<select required disabled={busy || studentResource?.loading || !!studentResource?.error} value={studentId} onChange={(event) => setStudentId(event.target.value)}><option value="">Select a student</option>{students.map((student) => <option key={student.id} value={student.id}>{student.name} / {student.studentNo}</option>)}</select></label>
      <label>Description<textarea required minLength={3} maxLength={1000} disabled={busy} value={description} onChange={(event) => setDescription(event.target.value)} /></label>
      <BusyButton className="button primary" busy={pendingAction === 'report'} busyLabel="Recording violation..." icon={ShieldAlert} disabled={busy || !students.length || !!studentResource?.error}>Record violation</BusyButton>
    </form>}
    {studentResource?.loading && <p className="inline-busy" role="status"><Spinner />Retrieving student directory...</p>}
    {studentResource?.error && <div className="notice notice-error" role="alert">Student directory unavailable. <BusyButton busy={studentResource.refreshing} busyLabel="Retrying..." onClick={studentResource.refresh}>Retry students</BusyButton></div>}
    <div className="report-filters"><label>Search student<input type="search" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} /></label><label>Status<select value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }}><option value="ALL">All statuses</option><option value="ACTIVE">Active</option><option value="CLEARED">Cleared</option></select></label><label>Report date<input type="date" value={date} onChange={(event) => { setDate(event.target.value); setPage(1); }} /></label></div>
    {loading ? <TableSkeleton columns={['Student','Description','Reported','Status','Action']} label="Retrieving violation reports" /> : <><div className="table-scroll" role="region" aria-label="Violation reports" tabIndex={0}><table><thead><tr><th>Student</th><th>Description</th><th>Reported</th><th>Status</th><th>Action</th></tr></thead><tbody>{pageRecords.map((record) => <tr key={record.id}><td>{record.name}<small className="cell-small">{record.studentNo}</small></td><td className="wrap-cell">{record.description}</td><td>{timeAtSchool(record.createdAt)}<small className="cell-small">{record.reportedBy}</small></td><td>{record.status === 'ACTIVE' ? 'Active' : 'Cleared'}</td><td>{record.status === 'ACTIVE' && ['ADMIN','DISCIPLINE'].includes(role) && <BusyButton busy={pendingAction === record.id} busyLabel="Clearing..." icon={Check} disabled={busy} onClick={() => clear(record.id)}>Clear violation</BusyButton>}</td></tr>)}</tbody></table></div>
    {!visible.length && <div className="empty-state"><h3>{records.length ? 'No matching reports' : 'No violations recorded'}</h3></div>}
    <div className="report-pagination"><p className="footnote">{visible.length} matching reports / up to 1,000 most recent records</p><div><button className="icon-button" title="Previous page" aria-label="Previous report page" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}><ChevronLeft size={18} /></button><span>Page {currentPage} of {totalPages}</span><button className="icon-button" title="Next page" aria-label="Next report page" disabled={currentPage === totalPages} onClick={() => setPage(currentPage + 1)}><ChevronRight size={18} /></button></div></div>
    </>}
  </>;
}
