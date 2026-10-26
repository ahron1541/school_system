import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { ScanLine, LayoutDashboard, Users, Activity, Settings2, ChevronRight, Menu, X, Download, Moon, Sun, LogOut, ShieldAlert, UserRound, Plus } from 'lucide-react';
import { useAuth } from '../features/auth/useAuth';
import LoginPage from '../features/auth/LoginPage';
import AccountPage from '../features/auth/AccountPage';
import RequiredPasswordPage from '../features/auth/RequiredPasswordPage';
import AccountsPage from '../features/users/AccountsPage';
import { useRecords } from '../shared/hooks/useRecords';
import { BusyButton, Initialization, RefreshFeedback } from '../shared/components/Loading';
import { useSystemStatus } from '../features/system/hooks/useSystemStatus';
import OverviewPage from '../features/admin/pages/OverviewPage';
import ActivityTable from '../features/gate-activity/components/ActivityTable';
import StudentsPage from '../features/students/pages/StudentsPage';
import StudentDialog from '../features/students/components/StudentDialog';
import StudentForm from '../features/students/components/StudentForm';
import SystemPage from '../features/system/pages/SystemPage';
const ViolationsPage=lazy(()=>import('../features/violations/ViolationsPage'));
import ToastHost, {notify} from '../shared/components/Toast';
import BrandLogo from '../shared/components/BrandLogo';
import GuardPage from '../features/guard/GuardPage';
import ScanDisplay from '../features/guard/ScanDisplay';
import { downloadCsv } from '../shared/lib/csv';
import DraftRecovery from '../shared/components/DraftRecovery';
import CaseNotifications from '../features/violations/CaseNotifications';

const schoolDate = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const pages = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard, roles: ['ADMIN'] },
  { id: 'guard', label: 'Guard post', icon: ScanLine, roles: ['ADMIN','GUARD'] },
  { id: 'activity', label: 'Gate activity', icon: Activity, roles: ['ADMIN','GUARD'] },
  { id: 'students', label: 'Students', icon: Users, roles: ['ADMIN','GUARD','REGISTRAR','DISCIPLINE'] },
  { id: 'violations', label: 'Violations', icon: ShieldAlert, roles: ['ADMIN','GUARD','DISCIPLINE'] },
  { id: 'system', label: 'System status', icon: Settings2, roles: ['ADMIN'] },
  { id: 'users', label: 'Account management', icon: Users, roles: ['ADMIN'] },
  { id: 'account', label: 'Account settings', icon: UserRound, roles: ['ADMIN','GUARD','REGISTRAR','DISCIPLINE'] },
];
const homes = { ADMIN: 'overview', GUARD: 'guard', REGISTRAR: 'students', DISCIPLINE: 'violations' };
const readPreference = (key, fallback) => { try { return localStorage.getItem(key) || fallback; } catch { return fallback; } };
const savePreference = (key, value) => { try { localStorage.setItem(key, value); } catch { /* Preferences are optional. */ } };

function Workspace({ auth, theme, toggleTheme }) {
  const role = auth.user.role;
  const available = pages.filter((page) => page.roles.includes(role));
  const [page, setPage] = useState(() => available.some((item) => item.id === location.hash.slice(1)) ? location.hash.slice(1) : homes[role]);
  const [menuOpen, setMenuOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(() => readPreference('sidebar-collapsed','false') === 'true');
  const [date, setDate] = useState(schoolDate);
  const [person, setPerson] = useState(null);
  const [form, setForm] = useState(null);
  const leaveStudentForm = useRef(null);
  const [reportStudent, setReportStudent] = useState('');
  const [requestedCase,setRequestedCase]=useState(null);
  const caseSummary=useRecords('/violations/summary',['ADMIN','DISCIPLINE'].includes(role),15000);
  function openCase(id){setRequestedCase(id);location.hash='violations';}
  function openPending(){const url=new URL(location.href);for(const key of [...url.searchParams.keys()])if(key.startsWith('offense_'))url.searchParams.delete(key);history.replaceState(null,'',url);window.dispatchEvent(new PopStateEvent('popstate'));location.hash='violations';}
  const studentRecords = useRecords('/students', ['students','guard'].includes(page));
  const eventRecords = useRecords('/entry-logs?date=' + encodeURIComponent(date), ['ADMIN','GUARD'].includes(role)&&['overview','activity','students'].includes(page));
  const data = { students: studentRecords.data || [], events: eventRecords.data || [] };
  const current = page === 'students' ? studentRecords : eventRecords;
  const refresh = () => Promise.all([studentRecords.refresh(), eventRecords.refresh()]);
  const [feedback, setFeedback] = useState('');
  const [actionError, setActionError] = useState('');
  const [signingOut, setSigningOut] = useState(false);
  const logoutPending = useRef(false);
  const system = useSystemStatus(role === 'ADMIN'&&['overview','system'].includes(page));
  useEffect(() => {
    if (!pages.some((item) => item.id === location.hash.slice(1) && item.roles.includes(role))) location.hash = homes[role];
    const navigate = async () => {
      const target = location.hash.slice(1);
      if (target !== 'students' && leaveStudentForm.current) {
        if (!await leaveStudentForm.current()) { history.replaceState(null, '', '#students'); return; }
        setForm(null);
      }
      setPage(pages.some((item) => item.id === target && item.roles.includes(role)) ? target : homes[role]); setMenuOpen(false); setPerson(null); setFeedback('');
    };
    addEventListener('hashchange', navigate);
    const escape = (event) => { if (event.key === 'Escape') setMenuOpen(false); };
    addEventListener('keydown', escape);
    return () => { removeEventListener('hashchange', navigate); removeEventListener('keydown', escape); };
  }, [role]);
  const title = available.find((item) => item.id === page)?.label || 'Overview';
  const canEdit = ['ADMIN','REGISTRAR'].includes(role);
  function collapse() { setCollapsed(!collapsed); savePreference('sidebar-collapsed', String(!collapsed)); }
  async function logout() { if (logoutPending.current || (leaveStudentForm.current && !await leaveStudentForm.current())) return; logoutPending.current = true; setSigningOut(true); setActionError(''); try { await auth.logout(); location.hash = 'login'; } catch (error) { setActionError(error.message); } finally { logoutPending.current = false; setSigningOut(false); } }
  function download() {
    const rows = [['Student ID','Name','Date','Time','Activity','Gate'], ...data.events.map((event) => [event.person.studentNo,event.person.name,date,event.time,event.direction,event.gate])];
    downloadCsv('gate-activity-' + date + '.csv', rows);
    notify('CSV download requested.','info');
  }
  return <div className={'app-shell ' + (collapsed ? 'sidebar-collapsed' : '')}>
    <ToastHost/>
    <a href="#main-content" className="skip-link" onClick={(event) => { event.preventDefault(); document.getElementById('main-content').focus(); }}>Skip to content</a>
    {menuOpen && <button className="mobile-backdrop" aria-label="Close navigation" onClick={() => setMenuOpen(false)} />}
    <aside className={'sidebar ' + (menuOpen ? 'is-open' : '')}>
      <div className="sidebar-header"><a href={'#' + homes[role]} className="brand" title="Cavite State University - Imus Campus"><BrandLogo/><span className="brand-text">CvSU Imus<small>School entry & records</small></span></a><button className="icon-button sidebar-toggle" onClick={collapse} title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} aria-expanded={!collapsed} aria-controls="workspace-navigation"><ChevronRight size={18}/></button><button className="icon-button sidebar-mobile-close" aria-label="Close sidebar" title="Close sidebar" onClick={() => setMenuOpen(false)}><X size={18} /></button></div>
      <div className="workspace-label">WORKSPACE</div>
      <nav id="workspace-navigation" aria-label="Main navigation">{available.map(({ id, label, icon: Icon }) => <a key={id} href={'#' + id} title={collapsed ? label : undefined} aria-label={label} aria-current={page === id ? 'page' : undefined} className={page === id ? 'nav-active' : ''}><Icon size={18} /><span>{label}{id==='violations'&&caseSummary.data&&!caseSummary.error&&<b className="case-nav-count" title="Pending cases">{caseSummary.data.pending}</b>}</span></a>)}</nav>
      <div className="sidebar-bottom"><div className="admin-profile"><span className="admin-avatar">{auth.user.fullName.split(' ').slice(0,2).map((part) => part[0]).join('')}</span><span className="profile-text"><strong>{auth.user.fullName}</strong><small>{role}</small></span></div><BusyButton className="logout-button" onClick={logout} busy={signingOut} busyLabel="Signing out..." icon={LogOut} title="Log out" aria-label="Log out">Log out</BusyButton></div>
    </aside>
    <div className="main-shell"><header className="topbar"><div className="breadcrumb"><button className="icon-button mobile-menu" aria-label={menuOpen ? 'Close navigation' : 'Open navigation'} aria-expanded={menuOpen} onClick={() => setMenuOpen(!menuOpen)}>{menuOpen ? <X size={20} /> : <Menu size={20} />}</button><span>{role === 'ADMIN' ? 'Administration' : role === 'GUARD' ? 'Guard workspace' : role === 'REGISTRAR' ? 'Registrar workspace' : 'Discipline workspace'}</span><ChevronRight size={14} /><strong>{title}</strong></div><div className="topbar-actions">{['ADMIN','DISCIPLINE'].includes(role)&&<CaseNotifications currentUserId={auth.user.id} resource={caseSummary} onOpen={openCase} onPending={openPending}/>}<button className="icon-button" title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'} aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'} onClick={toggleTheme}>{theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}</button></div></header>
      <main id="main-content" tabIndex={-1}>
        {feedback && <div className="notice notice-success" role="status">{feedback}</div>}
        {actionError && <div className="notice notice-error" role="alert">{actionError}</div>}
        {page === 'students' && canEdit && !form && <DraftRecovery userId={auth.user.id} feature="students" onResume={setForm} />}
        {['overview','activity'].includes(page) && <div className="page-heading"><div><h1>{page === 'overview' ? 'Gate overview' : 'Gate activity'}</h1><p>School gate attendance / Asia/Manila</p></div><div className="heading-actions"><label className="date-field"><span className="sr-only">Activity date</span><input type="date" aria-label="Activity date" required value={date} onChange={(event) => setDate(event.target.value)} /></label><button className="button" disabled={!data.events.length || eventRecords.loading || !!eventRecords.error} onClick={download}><Download size={15} />Export</button></div></div>}
        {page==='students' && current.error && current.data === null && <div className="page-heading"><h1>{title}</h1></div>}
        {['overview','activity','students'].includes(page) && <RefreshFeedback resource={current} label={page === 'students' ? 'students' : 'gate activity'} />}
        {page === 'users' ? <AccountsPage auth={auth} /> : page === 'guard' ? <GuardPage students={data.students} onReport={(id) => { setReportStudent(id); location.hash = 'violations'; }} /> : page === 'system' ? <SystemPage system={system} /> : page === 'account' ? <AccountPage auth={auth} theme={theme} toggleTheme={toggleTheme} /> : current.error && current.data === null ? null : <>
          {page === 'overview' && <OverviewPage loading={eventRecords.loading} events={data.events} system={system} onSelect={setPerson} />}
          {page === 'activity' && <ActivityTable key={date} loading={eventRecords.loading} events={data.events} onSelect={setPerson} />}
          {page === 'students' && (!form || form.student) && <StudentsPage loading={studentRecords.loading} students={data.students} privateAccess={canEdit} onAdd={canEdit ? () => setForm({}) : undefined} onSelect={setPerson} />}
        </>}
        {page === 'students' && form && !form.student && <StudentForm currentUserId={auth.user.id} leaveGuard={leaveStudentForm} onClose={() => { setForm(null); studentRecords.refresh(); }} onSaved={() => studentRecords.refresh()} onView={saved => { setForm(null); setPerson(saved); }} />}
        {page==='violations'&&<Suspense fallback={<p role="status">Loading offenses...</p>}><ViolationsPage user={auth.user} initialStudent={data.students.find(student=>student.id===reportStudent)||null} caseSummary={['ADMIN','DISCIPLINE'].includes(role)?caseSummary:undefined} requestedCase={requestedCase} onCaseOpened={()=>setRequestedCase(null)} onChanged={()=>setReportStudent('')}/></Suspense>}
        <footer className="page-footer"><span>Cavite State University / Imus Campus</span><span>School entry and student records</span></footer>
      </main>
    </div>
    {person && <StudentDialog canValidate={role === 'ADMIN'} key={person.id} person={person} events={data.events} showActivity={['ADMIN','GUARD'].includes(role)} onClose={() => setPerson(null)} onEdit={canEdit ? (detail, section) => { setForm({ student: detail, section }); setPerson(null); } : undefined} />}
    {form?.student && <StudentForm currentUserId={auth.user.id} student={form.student} initialSection={form.section} onClose={() => { setForm(null); studentRecords.refresh(); }} onSaved={() => { setForm(null); setFeedback('Student information updated successfully.'); refresh(); }} />}
  </div>;
}

export default function App() {
  const auth = useAuth();
  const [theme, setTheme] = useState(() => readPreference('theme','light'));
  useEffect(() => { document.documentElement.dataset.theme = theme; savePreference('theme', theme); }, [theme]);
  function toggleTheme() { setTheme((value) => value === 'dark' ? 'light' : 'dark'); }
  if (auth.loading) return <Initialization />;
  if (new URLSearchParams(location.search).get('display') === '1') {
    if (!auth.user || auth.user.mustChangePassword || !['ADMIN','GUARD'].includes(auth.user.role)) return <div className="scan-display"><div className="scan-idle" role="status"><h1>Display locked</h1><p>Sign in as guard on the main screen, then reopen this display.</p></div></div>;
    return <ScanDisplay theme={theme} toggleTheme={toggleTheme} />;
  }
  if (!auth.user) return <LoginPage auth={auth} theme={theme} toggleTheme={toggleTheme} />;
  if (auth.user.mustChangePassword) return <RequiredPasswordPage auth={auth} theme={theme} toggleTheme={toggleTheme} />;
  return <Workspace key={auth.user.id} auth={auth} theme={theme} toggleTheme={toggleTheme} />;
}
