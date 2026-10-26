import {useEffect,useRef,useState} from 'react';
import {Plus,Download,ChevronLeft,ChevronRight,Eye,Check,ClipboardList} from 'lucide-react';
import {useRecords} from '../../shared/hooks/useRecords';
import {BusyButton,RefreshFeedback,TableSkeleton} from '../../shared/components/Loading';
import Modal from '../../shared/components/Modal';
import Photo from '../../shared/components/Photo';
import {notify} from '../../shared/components/Toast';
import {downloadCsv} from '../../shared/lib/csv';
import {clearViolation} from './violationApi';
import CaseGateRecords from './CaseGateRecords';
import OffenseForm from './OffenseForm';
import CaseHistory from './CaseHistory';
import {api} from '../../shared/lib/api';
import './violations.css';
const time=value=>value?new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Manila',dateStyle:'medium',timeStyle:'short'}).format(new Date(value)):'Not recorded';
const defaults={page:'1',pageSize:'20',search:'',status:'ACTIVE',offense:'',from:'',to:'',sort:'newest'};
function readFilters(){const query=new URLSearchParams(location.search);return Object.fromEntries(Object.entries(defaults).map(([key,value])=>[key,query.get('offense_'+key)??value]));}
function Detail({id,role,onClose,onChanged,onReview}){
  const resource=useRecords('/violations/'+id),[confirm,setConfirm]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const pending=useRef(false),record=resource.data;
  const [remarkDirty,setRemarkDirty]=useState(false),[remarkBusy,setRemarkBusy]=useState(false),[readError,setReadError]=useState('');
  const read=useRef(false),changed=useRef(onChanged);changed.current=onChanged;
  useEffect(()=>{if(!record||read.current)return;read.current=true;api('/violations/'+id+'/read',{method:'POST',body:{}}).then(()=>changed.current()).catch(()=>setReadError('Could not mark this report as read. Reopen the case to retry.'));},[record,id]);
  async function clear(){if(pending.current)return;pending.current=true;setBusy(true);setError('');try{await clearViolation(id);notify('Violation cleared.');onChanged();onClose();}catch(failure){setError(failure.message);}finally{pending.current=false;setBusy(false);}}
  return <Modal title={confirm?'Clear violation?':'Offense record'} onClose={onClose} busy={busy||remarkBusy} dirty={remarkDirty} lossWarning={remarkDirty?'This remark has not been saved. Close without saving?':''} footer={({close})=><><button className="button" disabled={busy||remarkBusy} onClick={confirm?()=>setConfirm(false):close}>{confirm?'Back':'Close'}</button>{record&&['ADMIN','DISCIPLINE'].includes(role)&&!confirm&&<button className="button" disabled={remarkDirty||remarkBusy} onClick={()=>onReview(record)}><ClipboardList size={16}/><span>Review gate records</span></button>}{record?.status==='ACTIVE'&&['ADMIN','DISCIPLINE'].includes(role)&&<BusyButton className="button primary" busy={busy} disabled={remarkDirty||remarkBusy} title={remarkDirty?'Save or discard the remark first':undefined} busyLabel="Clearing..." icon={Check} onClick={confirm?clear:()=>setConfirm(true)}>{confirm?'Confirm clearance':'Clear violation'}</BusyButton>}</>}>
    {error&&<p className="notice notice-error" role="alert">{error}</p>}
    {readError&&<p role="alert">{readError}</p>}
    {resource.loading?<p role="status">Loading offense...</p>:resource.error?<p role="alert">{resource.error}</p>:<>
      {confirm&&<p className="notice">This marks the offense as cleared. The original report and issuing officer remain in the record.</p>}
      <div className="offense-student"><Photo src={record.photo} fallback={record.name.slice(0,1)} alt=""/><div><strong>{record.name}</strong><p>{record.studentNo} / {record.course} / Year {record.year} {record.section}</p></div></div>
      <dl className="offense-details"><div><dt>Offense</dt><dd>{record.description}</dd></div><div><dt>Status</dt><dd><span className={'offense-status '+record.status.toLowerCase()}>{record.status==='ACTIVE'?'Pending':'Cleared'}</span></dd></div><div><dt>Offense date</dt><dd>{record.offenseDate||time(record.createdAt)}</dd></div><div><dt>Recorded</dt><dd>{time(record.createdAt)}</dd></div><div><dt>Issuing officer</dt><dd>{record.reportedBy}</dd></div><div><dt>Validity</dt><dd>{record.validFrom?record.validFrom+' to '+record.validUntil:'Not specified'}</dd></div><div className="full-row"><dt>Original remarks</dt><dd>{record.remarks||'None recorded'}</dd></div>{record.status==='CLEARED'&&<div className="full-row"><dt>Cleared</dt><dd>{record.clearedBy} / {time(record.clearedAt)}</dd></div>}</dl>
      {!confirm&&<CaseHistory id={id} canWrite={['ADMIN','DISCIPLINE'].includes(role)} onDirty={setRemarkDirty} onBusy={setRemarkBusy}/>}
    </>}
  </Modal>;
}
export default function ViolationsPage({user,initialStudent=null,onChanged,caseSummary,requestedCase,onCaseOpened}){
  const [filters,setFilters]=useState(readFilters),[search,setSearch]=useState(filters.search),[adding,setAdding]=useState(!!initialStudent),[detail,setDetail]=useState(null),[review,setReview]=useState(null);
  useEffect(()=>{if(requestedCase){setDetail(requestedCase);onCaseOpened?.();}},[requestedCase]);
  useEffect(()=>{const timer=setTimeout(()=>setFilters(old=>old.search===search?old:{...old,search,page:'1'}),300);return()=>clearTimeout(timer);},[search]);
  useEffect(()=>{const url=new URL(location.href);for(const [key,value] of Object.entries(filters)){url.searchParams.delete('offense_'+key);if(value!==defaults[key])url.searchParams.set('offense_'+key,value);}history.replaceState(null,'',url);},[filters]);
  useEffect(()=>{const restore=()=>{const next=readFilters();setFilters(next);setSearch(next.search);};addEventListener('popstate',restore);return()=>removeEventListener('popstate',restore);},[]);
  const query=new URLSearchParams(Object.entries(filters).filter(([,value])=>value));
  const resource=useRecords('/violations?'+query),catalog=useRecords('/violations/types',true,0);
  const localSummary=useRecords('/violations/summary',!caseSummary),summary=caseSummary||localSummary;
  const rows=resource.data?.records||[],pagination=resource.data?.pagination;
  const set=(key,value)=>setFilters(old=>({...old,[key]:value,page:key==='page'?value:'1'}));
  const changed=()=>{resource.refresh();summary.refresh();onChanged?.();};
  const filtered=!!(filters.search||filters.offense||filters.from||filters.to);
  function exportPage(){downloadCsv('offenses-page-'+pagination.page+'.csv',[['Student number','Name','Offense','Status','Offense date','Issuing officer'],...rows.map(row=>[row.studentNo,row.name,row.description,row.status,row.offenseDate,row.reportedBy])]);notify('Current page exported.','info');}
  return <>
    <div className="page-heading"><div><h1>Violations</h1><p>Student offenses and disciplinary records</p></div><div className="heading-actions"><button className="icon-button" title="Export current page" aria-label="Export current page" onClick={exportPage} disabled={!rows.length||!!resource.error||resource.refreshing}><Download size={18}/></button><button className="button primary" disabled={!catalog.data||!!catalog.error} onClick={()=>setAdding(true)}><Plus size={17}/>Record offense</button></div></div>
    <RefreshFeedback resource={resource} label="offense records"/>
    <div className="case-status-tabs" role="group" aria-label="Case status">{[['ACTIVE','Pending','pending'],['CLEARED','Cleared','cleared'],['','All',null]].map(([value,label,count])=><button key={label} className={filters.status===value?'selected':''} aria-pressed={filters.status===value} onClick={()=>set('status',value)}>{label} <span>{summary.error||!summary.data?'--':count?summary.data[count]:summary.data.pending+summary.data.cleared}</span></button>)}</div>
    {summary.error&&<p role="alert">Case counts unavailable. <button className="button" onClick={summary.refresh}>Retry counts</button></p>}
    {catalog.error&&<p className="notice notice-error" role="alert">Offense options unavailable. <button className="button" onClick={catalog.refresh}>Retry options</button></p>}
    <div className="offense-filters"><label className="filter-search">Search student or offense<input type="search" maxLength={120} value={search} onChange={event=>setSearch(event.target.value)}/></label><label>Offense<select value={filters.offense} onChange={event=>set('offense',event.target.value)}><option value="">All offenses</option>{catalog.data?.types.map(type=><option value={type.code} key={type.code}>{type.name}</option>)}</select></label><label>From<input type="date" value={filters.from} onChange={event=>set('from',event.target.value)}/></label><label>Until<input type="date" value={filters.to} min={filters.from} onChange={event=>set('to',event.target.value)}/></label><label>Order<select value={filters.sort} onChange={event=>set('sort',event.target.value)}><option value="newest">Newest first</option><option value="oldest">Oldest first</option><option value="student">Student name</option></select></label></div>
    {filtered&&<button className="button filter-reset" onClick={()=>{setSearch('');setFilters({...defaults,status:filters.status});}}>Clear filters</button>}
    {resource.loading?<TableSkeleton columns={['Student','Offense','Recorded','Status','Action']} label="Loading offenses"/>:resource.error&&!resource.data?null:<>
      <div className="table-scroll offense-table" role="region" aria-label="Offense records" tabIndex={0} aria-busy={resource.refreshing}><table><thead><tr><th>Student</th><th>Offense</th><th>Recorded</th><th>Status</th><th><span className="sr-only">Action</span></th></tr></thead><tbody>{rows.map(row=><tr key={row.id}><td><div className="offense-student"><Photo src={row.photo} fallback={row.name.slice(0,1)} alt=""/><div><strong>{row.name}</strong><small className="cell-small">{row.studentNo} / {row.course}</small></div></div></td><td className="wrap-cell">{row.description}{row.isNew&&<span className="case-new">New</span>}</td><td>{time(row.createdAt)}<small className="cell-small">{row.reportedBy}</small></td><td><span className={'offense-status '+row.status.toLowerCase()}>{row.status==='ACTIVE'?'Pending':'Cleared'}</span></td><td><button className="icon-button" title="View offense" aria-label={'View offense for '+row.name} onClick={()=>setDetail(row.id)}><Eye size={18}/></button></td></tr>)}</tbody></table></div>
      {!rows.length&&!resource.error&&<div className="empty-state"><h3>{filters.search?'No violations match your search':filtered?'No records match the selected filters':'No violations recorded'}</h3><p>{filtered?'Try another student, offense or date.':'Recorded student offenses will appear here.'}</p></div>}
      {pagination&&<div className="offense-pagination"><p>Showing {pagination.total?(pagination.page-1)*pagination.pageSize+1:0}-{Math.min(pagination.page*pagination.pageSize,pagination.total)} of {pagination.total}</p><label>Rows<select value={filters.pageSize} onChange={event=>set('pageSize',event.target.value)}>{[10,20,50].map(size=><option key={size}>{size}</option>)}</select></label><div><button className="icon-button" title="Previous page" aria-label="Previous offense page" disabled={pagination.page===1||resource.refreshing} onClick={()=>set('page',String(pagination.page-1))}><ChevronLeft size={18}/></button><span>Page {pagination.page} of {pagination.totalPages}</span><button className="icon-button" title="Next page" aria-label="Next offense page" disabled={pagination.page>=pagination.totalPages||resource.refreshing} onClick={()=>set('page',String(pagination.page+1))}><ChevronRight size={18}/></button></div></div>}
    </>}
    {adding&&catalog.data&&<OffenseForm user={user} types={catalog.data.types} today={catalog.data.today} initialStudent={initialStudent} onClose={()=>setAdding(false)} onSaved={()=>{setAdding(false);set('status','ACTIVE');changed();}}/>}
    {detail&&<Detail key={detail} id={detail} role={user.role} onClose={()=>setDetail(null)} onChanged={changed} onReview={record=>{setDetail(null);setReview(record);}}/>}
    {review&&<CaseGateRecords report={review} onClose={()=>setReview(null)}/>}
  </>;
}
