import { useEffect, useState } from 'react';
import { UserPlus, Pencil, KeyRound, LogOut, ChevronLeft, ChevronRight, Search } from 'lucide-react';
import { useRecords } from '../../shared/hooks/useRecords';
import { RefreshFeedback, TableSkeleton } from '../../shared/components/Loading';
import AccountDialog from './AccountDialog';
import { roleNames } from './usersApi';
import './users.css';
import DraftRecovery from '../../shared/components/DraftRecovery';

export default function AccountsPage({ auth }) {
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState({ search: '', role: '', status: '', sort: 'fullName', page: 1, limit: 25 });
  const [dialog, setDialog] = useState(null);
  const [message, setMessage] = useState('');
  useEffect(() => { const timer = setTimeout(() => setFilters((current) => current.search === search.trim() ? current : { ...current, search: search.trim(), page: 1 }), 250); return () => clearTimeout(timer); }, [search]);
  const resource = useRecords('/users?' + new URLSearchParams(filters));
  const { accounts = [], pagination } = resource.data || {};
  useEffect(() => { if (pagination && filters.page > pagination.totalPages) setFilters((current) => ({ ...current, page: pagination.totalPages })); }, [pagination, filters.page]);
  const filter = (key) => (event) => { setMessage(''); setFilters((current) => ({ ...current, [key]: key === 'limit' ? Number(event.target.value) : event.target.value, page: 1 })); };
  function open(action, account) { setMessage(''); setDialog({ action, account }); }
  async function saved(result) {
    const { action, account } = dialog;
    setDialog(null);
    if (account?.id === auth.user.id && (action === 'revoke' || result.sessionsRevoked)) {
      auth.signedOut('Your account was updated. Sign in again.'); return;
    }
    setMessage({ create: 'Account created. Share the temporary password privately with the account holder.', edit: 'Account saved.', reset: 'Password reset. Share the new temporary password privately.', revoke: 'Sessions revoked.' }[action]);
    await resource.refresh();
  }
  return <>
    <div className="page-heading"><div><h1>Account management</h1><p>Staff accounts and access</p></div><button className="button primary" onClick={() => open('create')}><UserPlus size={16} />Create account</button></div>
    {message && <div className="notice notice-success" role="status">{message}</div>}
    {!dialog && <DraftRecovery userId={auth.user.id} feature="accounts" onResume={setDialog} />}
    <div className="accounts-toolbar">
      <label className="search-field"><Search size={16} /><span className="sr-only">Search accounts</span><input type="search" placeholder="Search name or username" maxLength={100} value={search} onChange={(event) => setSearch(event.target.value)} /></label>
      <label>Role<select value={filters.role} onChange={filter('role')}><option value="">All roles</option>{Object.entries(roleNames).map(([value, name]) => <option key={value} value={value}>{name}</option>)}</select></label>
      <label>Status<select value={filters.status} onChange={filter('status')}><option value="">All statuses</option><option value="active">Active</option><option value="inactive">Inactive</option></select></label>
      <label>Sort by<select value={filters.sort} onChange={filter('sort')}><option value="fullName">Name</option><option value="username">Username</option><option value="createdAt">Newest first</option></select></label>
    </div>
    <RefreshFeedback resource={resource} label="accounts" />
    {resource.loading ? <TableSkeleton columns={['Account', 'Role', 'Status', 'Sessions', 'Actions']} label="Retrieving accounts" /> : resource.data && <>
      <div className="table-scroll accounts-table" role="region" aria-label="Staff accounts" tabIndex={0} aria-busy={resource.refreshing}>
        <table><thead><tr><th>Account</th><th>Role</th><th>Status</th><th>Sessions</th><th>Actions</th></tr></thead><tbody>{accounts.map((account) => <tr key={account.id}>
          <td><strong>{account.fullName}</strong><small className="cell-small">@{account.username}{account.id === auth.user.id ? ' / You' : ''}</small></td>
          <td>{roleNames[account.role]}</td>
          <td><span className={'account-state ' + (account.active ? 'is-active' : '')}>{account.active ? 'Active' : 'Inactive'}</span>{account.mustChangePassword && <small className="cell-small">{new Date(account.temporaryPasswordExpiresAt) <= new Date() ? 'Temporary password expired' : 'Password change required'}</small>}{account.lockedUntil && new Date(account.lockedUntil) > new Date() && <small className="cell-small">Sign-in temporarily locked</small>}</td>
          <td>{account.activeSessions}</td>
          <td><div className="account-row-actions"><button className="icon-button" title="Edit account" aria-label={'Edit ' + account.username} disabled={!!resource.error} onClick={() => open('edit', account)}><Pencil size={16} /></button><button className="icon-button" title={account.id === auth.user.id ? 'Use Account settings for your password' : 'Reset password'} aria-label={'Reset password for ' + account.username} disabled={!!resource.error || account.id === auth.user.id} onClick={() => open('reset', account)}><KeyRound size={16} /></button><button className="icon-button" title="Revoke sessions" aria-label={'Revoke sessions for ' + account.username} disabled={!!resource.error || !account.activeSessions} onClick={() => open('revoke', account)}><LogOut size={16} /></button></div></td>
        </tr>)}</tbody></table>
      </div>
      {!accounts.length && <div className="empty-state"><h3>No matching accounts</h3><p>Try a different name or filter.</p></div>}
      <div className="table-footer accounts-pagination"><span>{pagination.total} accounts</span><label>Rows per page<select value={filters.limit} onChange={filter('limit')}><option value="25">25</option><option value="50">50</option><option value="100">100</option></select></label><div className="pagination"><button className="icon-button" title="Previous page" aria-label="Previous account page" disabled={resource.refreshing || filters.page <= 1} onClick={() => setFilters((current) => ({ ...current, page: current.page - 1 }))}><ChevronLeft size={16} /></button><span>Page {pagination.page} of {pagination.totalPages}</span><button className="icon-button" title="Next page" aria-label="Next account page" disabled={resource.refreshing || filters.page >= pagination.totalPages} onClick={() => setFilters((current) => ({ ...current, page: current.page + 1 }))}><ChevronRight size={16} /></button></div></div>
    </>}
    {dialog && <AccountDialog {...dialog} currentUserId={auth.user.id} onClose={() => setDialog(null)} onSaved={saved} />}
  </>;
}
