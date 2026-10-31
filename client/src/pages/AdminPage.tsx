import { ModalSurface } from "../components/ui";
import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

// ── Types ──────────────────────────────────────────────────────────────────
interface PlatformStats {
  totalUsers: number;
  adminCount: number;
  totalJobs: number;
  statusBreakdown: {
    status: string;
    count: number;
  }[];
  recentUsers: {
    id: number;
    email: string;
    created_at: string;
  }[];
  dailySignups: {
    day: string;
    count: number;
  }[];
}
interface AdminUser {
  id: number;
  email: string;
  isAdmin: boolean;
  createdAt: string;
  jobCount: number;
  appliedCount: number;
}
interface JobStats {
  totalJobs: number;
  bySource: {
    source: string;
    count: number;
  }[];
  byStatus: {
    status: string;
    count: number;
  }[];
  recentFetches: {
    day: string;
    count: number;
  }[];
}
interface InboxEmail {
  uid: number;
  from: string;
  fromName: string;
  subject: string;
  date: string;
  body: string;
  seen: boolean;
}
interface ContactMessage {
  id: number;
  name: string;
  email: string;
  subject: string;
  message: string;
  is_read: boolean;
  created_at: string;
}
type Tab = 'overview' | 'users' | 'jobs' | 'messages' | 'inbox';

// ── Helpers ────────────────────────────────────────────────────────────────
const STATUS_COLORS: Record<string, string> = {
  new: 'bg-subtle text-muted',
  saved: 'bg-subtle text-muted',
  preparing: 'bg-subtle text-muted',
  applied: 'bg-subtle text-muted',
  followup: 'bg-subtle text-muted',
  interviewing: 'bg-subtle text-muted',
  offered: 'bg-subtle text-accent',
  rejected: 'bg-danger-soft text-danger',
  archived: 'bg-subtle text-ink'
};
function StatCard({
  label,
  value,
  sub
}: {
  label: string;
  value: string | number;
  sub?: string;
}) {
  return <div className="bg-surface rounded-lg border border-line p-5">
      <p className="text-xs font-semibold text-muted uppercase tracking-wide">{label}</p>
      <p className="text-3xl font-semibold text-ink mt-1">{value}</p>
      {sub && <p className="text-xs text-muted mt-1">{sub}</p>}
    </div>;
}

// ── Main Component ─────────────────────────────────────────────────────────
export const AdminPage = () => {
  const [tab, setTab] = useState<Tab>('overview');
  const [stats, setStats] = useState<PlatformStats | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [userTotal, setUserTotal] = useState(0);
  const [userPage, setUserPage] = useState(1);
  const [userTotalPages, setUserTotalPages] = useState(1);
  const [userSearch, setUserSearch] = useState('');
  const [jobStats, setJobStats] = useState<JobStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<AdminUser | null>(null);
  const [actionMsg, setActionMsg] = useState('');
  const [messages, setMessages] = useState<ContactMessage[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [expandedMsg, setExpandedMsg] = useState<number | null>(null);
  const [replyText, setReplyText] = useState<Record<number, string>>({});
  const [replying, setReplying] = useState<number | null>(null);
  const [inbox, setInbox] = useState<InboxEmail[]>([]);
  const [inboxError, setInboxError] = useState('');
  const [expandedEmail, setExpandedEmail] = useState<number | null>(null);
  const [inboxReply, setInboxReply] = useState<Record<number, string>>({});
  const [sendingReply, setSendingReply] = useState<number | null>(null);
  const [composing, setComposing] = useState(false);
  const [compose, setCompose] = useState({
    to: '',
    subject: '',
    body: ''
  });
  const [sending, setSending] = useState(false);

  // ── Load data by tab ──────────────────────────────────────────────────
  useEffect(() => {
    if (tab === 'overview') loadStats();
    if (tab === 'users') loadUsers(userPage, userSearch);
    if (tab === 'jobs') loadJobStats();
    if (tab === 'messages') loadMessages();
    if (tab === 'inbox') loadInbox();
  }, [tab]);
  const loadStats = async () => {
    setLoading(true);
    setError('');
    try {
      const {
        data,
        error
      } = await supabase.rpc('admin_get_stats');
      if (error) throw error;
      setStats(data as PlatformStats);
    } catch {
      setError('Failed to load stats. Run the admin SQL migration, then try again.');
    } finally {
      setLoading(false);
    }
  };
  const loadUsers = async (page = 1, search = '') => {
    setLoading(true);
    setError('');
    try {
      const {
        data,
        error
      } = await supabase.rpc('admin_list_users', {
        p_page: page,
        p_search: search
      });
      if (error) throw error;
      const payload = data as {
        users: AdminUser[];
        total: number;
        page: number;
        totalPages: number;
      };
      setUsers(payload.users);
      setUserTotal(payload.total);
      setUserTotalPages(payload.totalPages);
    } catch {
      setError('Failed to load users. Run the admin SQL migration, then try again.');
    } finally {
      setLoading(false);
    }
  };
  const loadJobStats = async () => {
    setLoading(true);
    setError('');
    try {
      const {
        data,
        error
      } = await supabase.rpc('admin_get_job_stats');
      if (error) throw error;
      setJobStats(data as JobStats);
    } catch {
      setError('Failed to load job stats. Run the admin SQL migration, then try again.');
    } finally {
      setLoading(false);
    }
  };
  const loadInbox = async () => {
    setLoading(true);
    setInboxError('');
    setInbox([]);
    setInboxError('Inbox is unavailable after the backend migration. Use the contact messages tab for form submissions.');
    setLoading(false);
  };
  const handleInboxReply = async (email: InboxEmail) => {
    const body = inboxReply[email.uid]?.trim();
    if (!body) return;
    setSendingReply(email.uid);
    try {
      window.location.href = `mailto:${email.from}?subject=${encodeURIComponent(`Re: ${email.subject}`)}&body=${encodeURIComponent(body)}`;
      setInboxReply(prev => ({
        ...prev,
        [email.uid]: ''
      }));
      flash('Opened your email app');
    } finally {
      setSendingReply(null);
    }
  };
  const handleDeleteInbox = async (uid: number) => {
    setInbox(prev => prev.filter(e => e.uid !== uid));
    flash('Removed from this view');
  };
  const handleComposeSend = async () => {
    if (!compose.to || !compose.subject || !compose.body) return;
    setSending(true);
    try {
      window.location.href = `mailto:${compose.to}?subject=${encodeURIComponent(compose.subject)}&body=${encodeURIComponent(compose.body)}`;
      setCompose({
        to: '',
        subject: '',
        body: ''
      });
      setComposing(false);
      flash('Opened your email app');
    } finally {
      setSending(false);
    }
  };
  const loadMessages = async () => {
    setLoading(true);
    setError('');
    try {
      const {
        data,
        error
      } = await supabase.rpc('admin_list_messages');
      if (error) throw error;
      const payload = data as {
        messages: ContactMessage[];
        unreadCount: number;
      };
      setMessages(payload.messages);
      setUnreadCount(payload.unreadCount);
    } catch {
      setError('Failed to load messages. Run the admin SQL migration, then try again.');
    } finally {
      setLoading(false);
    }
  };
  const handleMarkRead = async (id: number) => {
    try {
      const {
        error
      } = await supabase.rpc('admin_mark_message_read', {
        p_id: id
      });
      if (error) throw error;
      setMessages(prev => prev.map(m => m.id === id ? {
        ...m,
        is_read: true
      } : m));
      setUnreadCount(c => Math.max(0, c - 1));
    } catch {
      flash('Failed to mark as read', true);
    }
  };
  const handleReply = async (id: number) => {
    const body = replyText[id]?.trim();
    if (!body) return;
    setReplying(id);
    try {
      const message = messages.find(m => m.id === id);
      if (!message) return;
      window.location.href = `mailto:${message.email}?subject=${encodeURIComponent(`Re: ${message.subject}`)}&body=${encodeURIComponent(body)}`;
      await supabase.rpc('admin_mark_message_read', {
        p_id: id
      });
      setReplyText(prev => ({
        ...prev,
        [id]: ''
      }));
      setMessages(prev => prev.map(m => m.id === id ? {
        ...m,
        is_read: true
      } : m));
      setUnreadCount(c => Math.max(0, c - 1));
      flash('Opened your email app');
    } catch {
      flash('Failed to prepare reply', true);
    } finally {
      setReplying(null);
    }
  };
  const handleDeleteMessage = async (id: number) => {
    try {
      const {
        error
      } = await supabase.rpc('admin_delete_message', {
        p_id: id
      });
      if (error) throw error;
      const msg = messages.find(m => m.id === id);
      if (msg && !msg.is_read) setUnreadCount(c => Math.max(0, c - 1));
      setMessages(prev => prev.filter(m => m.id !== id));
    } catch {
      flash('Failed to delete', true);
    }
  };
  const handleToggleAdmin = async (user: AdminUser) => {
    try {
      const {
        error
      } = await supabase.rpc('admin_toggle_user_admin', {
        p_user_id: user.id
      });
      if (error) throw error;
      setUsers(prev => prev.map(u => u.id === user.id ? {
        ...u,
        isAdmin: !u.isAdmin
      } : u));
      flash(user.isAdmin ? `${user.email} demoted` : `${user.email} promoted to admin`);
    } catch {
      flash('Action failed', true);
    }
  };
  const handleDelete = async (user: AdminUser) => {
    try {
      const {
        error
      } = await supabase.rpc('admin_delete_user', {
        p_user_id: user.id
      });
      if (error) throw error;
      setUsers(prev => prev.filter(u => u.id !== user.id));
      setUserTotal(t => t - 1);
      flash(`${user.email} deleted`);
    } catch {
      flash('Delete failed', true);
    } finally {
      setConfirmDelete(null);
    }
  };
  const flash = (msg: string, isErr = false) => {
    setActionMsg(isErr ? ` ${msg}` : `✓ ${msg}`);
    setTimeout(() => setActionMsg(''), 3000);
  };
  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setUserPage(1);
    loadUsers(1, userSearch);
  };
  const inboxUnread = inbox.filter(e => !e.seen).length;
  const tabs: {
    key: Tab;
    label: string;
  }[] = [{
    key: 'overview',
    label: 'Overview'
  }, {
    key: 'users',
    label: `Users${userTotal ? ` (${userTotal})` : ''}`
  }, {
    key: 'jobs',
    label: 'Jobs'
  }, {
    key: 'messages',
    label: `Forms${unreadCount > 0 ? ` (${unreadCount})` : ''}`
  }, {
    key: 'inbox',
    label: `Inbox${inboxUnread > 0 ? ` (${inboxUnread})` : ''}`
  }];
  return <div className="px-4 py-6 max-w-5xl mx-auto w-full">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-xs font-semibold bg-danger-soft text-danger px-2 py-0.5 rounded-md uppercase tracking-wide">Admin</span>
          <h1 className="text-2xl font-semibold text-ink">Admin Panel</h1>
        </div>
        <p className="text-sm text-muted">Platform management · afavers.online</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-subtle rounded-lg p-1 w-fit">
        {tabs.map(t => <button key={t.key} onClick={() => setTab(t.key)} className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab === t.key ? 'bg-surface text-ink shadow-none' : 'text-muted hover:text-ink'}`}>
            {t.label}
          </button>)}
      </div>

      {/* Toast */}
      {actionMsg && <div className="mb-4 px-4 py-2.5 rounded-lg bg-ink text-on-ink text-sm font-medium w-fit">{actionMsg}</div>}

      {error && <p className="text-danger text-sm mb-4">{error}</p>}

      {/* ── OVERVIEW TAB ── */}
      {tab === 'overview' && (loading ? <SkeletonCards /> : stats && <div className="space-y-6">
            {/* Stat cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <StatCard label="Total Users" value={stats.totalUsers} sub={`${stats.adminCount} admin${stats.adminCount !== 1 ? 's' : ''}`} />
              <StatCard label="Total Jobs" value={stats.totalJobs.toLocaleString()} sub="in database" />
              <StatCard label="Avg Jobs/User" value={stats.totalUsers ? Math.round(stats.totalJobs / stats.totalUsers) : 0} />
              <StatCard label="Signups (30d)" value={stats.dailySignups.reduce((s, d) => s + d.count, 0)} sub="last 30 days" />
            </div>

            {/* Status breakdown */}
            {stats.statusBreakdown.length > 0 && <div className="bg-surface rounded-lg border border-line p-5">
                <h2 className="text-sm font-semibold text-ink mb-4">Job Status Breakdown</h2>
                <div className="space-y-2">
                  {stats.statusBreakdown.map(s => {
            const max = Math.max(...stats.statusBreakdown.map(x => x.count));
            return <div key={s.status} className="flex items-center gap-3">
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-md w-24 text-center ${STATUS_COLORS[s.status] || 'bg-subtle text-muted'}`}>
                          {s.status}
                        </span>
                        <div className="flex-1 bg-subtle rounded-md h-2 overflow-hidden">
                          <div className="bg-ink h-2 rounded-md transition-colors" style={{
                  width: `${s.count / max * 100}%`
                }} />
                        </div>
                        <span className="text-xs font-semibold text-muted w-10 text-right">{s.count}</span>
                      </div>;
          })}
                </div>
              </div>}

            {/* Recent signups */}
            {stats.recentUsers.length > 0 && <div className="bg-surface rounded-lg border border-line p-5">
                <h2 className="text-sm font-semibold text-ink mb-3">Recent Signups</h2>
                <div className="space-y-2">
                  {stats.recentUsers.map(u => <div key={u.id} className="flex items-center justify-between py-1">
                      <span className="text-sm text-ink">{u.email}</span>
                      <span className="text-xs text-muted">{new Date(u.created_at).toLocaleDateString()}</span>
                    </div>)}
                </div>
              </div>}

            {/* 30-day signup sparkline */}
            {stats.dailySignups.length > 0 && <div className="bg-surface rounded-lg border border-line p-5">
                <h2 className="text-sm font-semibold text-ink mb-4">Signups — Last 30 Days</h2>
                <div className="flex items-end gap-1 h-16">
                  {stats.dailySignups.map(d => {
            const max = Math.max(...stats.dailySignups.map(x => x.count), 1);
            return <div key={d.day} title={`${d.day}: ${d.count}`} className="flex-1 bg-ink rounded-sm opacity-80 hover:opacity-100 transition-colors" style={{
              height: `${d.count / max * 100}%`,
              minHeight: d.count > 0 ? '4px' : '1px'
            }} />;
          })}
                </div>
              </div>}
          </div>)}

      {/* ── USERS TAB ── */}
      {tab === 'users' && <div className="space-y-4">
          {/* Search */}
          <form onSubmit={handleSearchSubmit} className="flex gap-2">
            <input type="text" value={userSearch} onChange={e => setUserSearch(e.target.value)} placeholder="Search by email…" className="flex-1 px-4 py-2.5 border border-line rounded-lg text-sm outline-none focus-visible:ring-2 focus-visible:ring-green-500 focus-visible:border-transparent bg-surface" />
            <button type="submit" className="px-4 py-2.5 bg-ink text-on-ink text-sm font-semibold rounded-lg hover:bg-ink transition">
              Search
            </button>
          </form>

          {loading ? <SkeletonTable /> : <div className="bg-surface rounded-lg border border-line overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line">
                    <th className="text-left px-4 py-3 text-xs font-semibold text-muted uppercase tracking-wide">Email</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-muted uppercase tracking-wide hidden sm:table-cell">Joined</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-muted uppercase tracking-wide">Jobs</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-muted uppercase tracking-wide">Role</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {users.map(u => <tr key={u.id} className="border-b border-line hover:bg-canvas transition-colors">
                      <td className="px-4 py-3 font-medium text-ink max-w-[180px] truncate">
                        {u.email}
                      </td>
                      <td className="px-4 py-3 text-muted text-xs hidden sm:table-cell">
                        {new Date(u.createdAt).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3 text-muted">
                        {u.jobCount} <span className="text-muted">/ {u.appliedCount} applied</span>
                      </td>
                      <td className="px-4 py-3">
                        {u.isAdmin ? <span className="text-xs font-semibold bg-danger-soft text-danger px-2 py-0.5 rounded-md">Admin</span> : <span className="text-xs text-muted">User</span>}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2 justify-end">
                          <button onClick={() => handleToggleAdmin(u)} className="text-xs px-2.5 py-1 rounded-lg border border-line text-muted hover:border-line hover:text-muted transition">
                            {u.isAdmin ? 'Demote' : 'Make Admin'}
                          </button>
                          <button onClick={() => setConfirmDelete(u)} className="text-xs px-2.5 py-1 rounded-lg border border-line text-muted hover:border-line hover:text-danger transition">
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>)}
                  {users.length === 0 && <tr>
                      <td colSpan={5} className="px-4 py-12 text-center text-muted text-sm">No users found</td>
                    </tr>}
                </tbody>
              </table>
            </div>}

          {/* Pagination */}
          {userTotalPages > 1 && <div className="flex items-center justify-between">
              <p className="text-xs text-muted">{userTotal} users total</p>
              <div className="flex gap-1">
                {Array.from({
            length: userTotalPages
          }, (_, i) => i + 1).map(p => <button key={p} onClick={() => {
            setUserPage(p);
            loadUsers(p, userSearch);
          }} className={`w-8 h-8 rounded-lg text-sm font-medium transition ${p === userPage ? 'bg-ink text-on-ink' : 'bg-subtle text-muted hover:bg-line'}`}>
                    {p}
                  </button>)}
              </div>
            </div>}
        </div>}

      {/* ── JOBS TAB ── */}
      {tab === 'jobs' && (loading ? <SkeletonCards /> : jobStats && <div className="space-y-6">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              <StatCard label="Total Jobs" value={jobStats.totalJobs.toLocaleString()} sub="in database" />
              <StatCard label="Sources" value={jobStats.bySource.length} />
              <StatCard label="Status Types" value={jobStats.byStatus.length} />
            </div>

            {/* By status */}
            <div className="bg-surface rounded-lg border border-line p-5">
              <h2 className="text-sm font-semibold text-ink mb-4">User Actions by Status</h2>
              <div className="space-y-2">
                {jobStats.byStatus.map(s => {
            const max = Math.max(...jobStats.byStatus.map(x => x.count), 1);
            return <div key={s.status} className="flex items-center gap-3">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-md w-24 text-center ${STATUS_COLORS[s.status] || 'bg-subtle text-muted'}`}>
                        {s.status}
                      </span>
                      <div className="flex-1 bg-subtle rounded-md h-2 overflow-hidden">
                        <div className="bg-ink h-2 rounded-md" style={{
                  width: `${s.count / max * 100}%`
                }} />
                      </div>
                      <span className="text-xs font-semibold text-muted w-10 text-right">{s.count}</span>
                    </div>;
          })}
              </div>
            </div>

            {/* By source */}
            <div className="bg-surface rounded-lg border border-line p-5">
              <h2 className="text-sm font-semibold text-ink mb-3">Jobs by Source</h2>
              <div className="space-y-1.5">
                {jobStats.bySource.map(s => <div key={s.source} className="flex items-center justify-between text-sm">
                    <span className="text-muted">{s.source || 'unknown'}</span>
                    <span className="font-semibold text-ink">{s.count.toLocaleString()}</span>
                  </div>)}
              </div>
            </div>

            {/* Recent fetches bar chart */}
            {jobStats.recentFetches.length > 0 && <div className="bg-surface rounded-lg border border-line p-5">
                <h2 className="text-sm font-semibold text-ink mb-4">Jobs Added — Last 14 Days</h2>
                <div className="flex items-end gap-1 h-16">
                  {[...jobStats.recentFetches].reverse().map(d => {
            const max = Math.max(...jobStats.recentFetches.map(x => x.count), 1);
            return <div key={d.day} title={`${d.day}: ${d.count}`} className="flex-1 bg-ink rounded-sm opacity-80 hover:opacity-100 transition-colors" style={{
              height: `${d.count / max * 100}%`,
              minHeight: d.count > 0 ? '4px' : '1px'
            }} />;
          })}
                </div>
              </div>}
          </div>)}

      {/* ── Messages tab ── */}
      {tab === 'messages' && (loading ? <SkeletonTable /> : <div className="space-y-3">
            {messages.length === 0 && <p className="text-sm text-muted text-center py-12">No messages yet.</p>}
            {messages.map(msg => <div key={msg.id} className={`bg-surface rounded-lg border p-4 ${msg.is_read ? 'border-line' : 'border-line bg-subtle'}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      {!msg.is_read && <span className="text-xs font-semibold text-accent bg-subtle px-2 py-0.5 rounded-md">New</span>}
                      <span className="text-sm font-semibold text-ink truncate">{msg.subject}</span>
                    </div>
                    <p className="text-xs text-muted mt-0.5">
                      {msg.name} · <a href={`mailto:${msg.email}`} className="text-accent hover:underline">{msg.email}</a>
                      {' · '}{new Date(msg.created_at).toLocaleDateString('en-GB', {
                day: '2-digit',
                month: 'short',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
              })}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {!msg.is_read && <button onClick={() => handleMarkRead(msg.id)} className="text-xs text-muted hover:text-accent transition">Mark read</button>}
                    <button onClick={() => setExpandedMsg(expandedMsg === msg.id ? null : msg.id)} className="text-xs text-muted hover:text-ink transition">
                      {expandedMsg === msg.id ? 'Hide' : 'View'}
                    </button>
                    <button onClick={() => handleDeleteMessage(msg.id)} className="text-xs text-danger hover:text-danger transition">Delete</button>
                  </div>
                </div>
                {expandedMsg === msg.id && <div className="mt-3 pt-3 border-t border-line space-y-3">
                    <p className="text-sm text-ink whitespace-pre-wrap">{msg.message}</p>
                    <div className="bg-canvas rounded-lg p-3 space-y-2">
                      <p className="text-xs font-semibold text-muted uppercase tracking-wide">
                        Reply to {msg.name} · <span className="text-accent">{msg.email}</span>
                      </p>
                      <textarea rows={4} value={replyText[msg.id] || ''} onChange={e => setReplyText(prev => ({
              ...prev,
              [msg.id]: e.target.value
            }))} placeholder="Write your reply…" className="w-full text-sm border border-line rounded-lg px-3 py-2 outline-none focus-visible:ring-2 focus-visible:ring-green-500 resize-none bg-surface" />
                      <div className="flex items-center gap-2">
                        <button onClick={() => handleReply(msg.id)} disabled={replying === msg.id || !replyText[msg.id]?.trim()} className="px-4 py-1.5 bg-ink hover:bg-ink disabled:opacity-40 text-on-ink text-xs font-semibold rounded-lg transition">
                          {replying === msg.id ? 'Sending…' : 'Send Reply'}
                        </button>
                        <span className="text-xs text-muted">Sends from contact@afavers.online</span>
                      </div>
                    </div>
                  </div>}
              </div>)}
          </div>)}

      {/* ── INBOX TAB ── */}
      {tab === 'inbox' && <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted">{inbox.length} emails · contact@afavers.online</p>
            <div className="flex gap-2">
              <button onClick={loadInbox} className="text-xs px-3 py-1.5 rounded-lg border border-line text-muted hover:bg-canvas transition">Refresh</button>
              <button onClick={() => setComposing(true)} className="text-xs px-3 py-1.5 rounded-lg bg-ink hover:bg-ink text-on-ink font-semibold transition">+ Compose</button>
            </div>
          </div>

          {inboxError && <p className="text-sm text-danger bg-danger-soft rounded-lg px-4 py-3">{inboxError} — make sure SMTP_HOST, SMTP_USER, SMTP_PASS are set in your backend environment.</p>}

          {loading ? <SkeletonTable /> : inbox.length === 0 && !inboxError ? <p className="text-sm text-muted text-center py-12">Inbox is empty.</p> : inbox.map(email => <div key={email.uid} className={`bg-surface rounded-lg border p-4 ${email.seen ? 'border-line' : 'border-line bg-subtle'}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0 cursor-pointer" onClick={() => setExpandedEmail(expandedEmail === email.uid ? null : email.uid)}>
                  <div className="flex items-center gap-2">
                    {!email.seen && <span className="text-xs font-semibold text-accent bg-subtle px-2 py-0.5 rounded-md shrink-0">New</span>}
                    <span className="text-sm font-semibold text-ink truncate">{email.subject}</span>
                  </div>
                  <p className="text-xs text-muted mt-0.5">
                    <span className="font-medium">{email.fromName || email.from}</span>
                    {email.fromName && email.fromName !== email.from && ` · ${email.from}`}
                    {' · '}{new Date(email.date).toLocaleDateString('en-GB', {
                day: '2-digit',
                month: 'short',
                hour: '2-digit',
                minute: '2-digit'
              })}
                  </p>
                </div>
                <button onClick={() => handleDeleteInbox(email.uid)} className="text-xs text-danger hover:text-danger transition shrink-0">Delete</button>
              </div>

              {expandedEmail === email.uid && <div className="mt-3 pt-3 border-t border-line space-y-3">
                  <pre className="text-sm text-ink whitespace-pre-wrap font-sans">{email.body}</pre>
                  <div className="bg-canvas rounded-lg p-3 space-y-2">
                    <p className="text-xs font-semibold text-muted uppercase tracking-wide">Reply to <span className="text-accent">{email.from}</span></p>
                    <textarea rows={4} value={inboxReply[email.uid] || ''} onChange={e => setInboxReply(prev => ({
              ...prev,
              [email.uid]: e.target.value
            }))} placeholder="Write your reply…" className="w-full text-sm border border-line rounded-lg px-3 py-2 outline-none focus-visible:ring-2 focus-visible:ring-green-500 resize-none bg-surface" />
                    <div className="flex items-center gap-2">
                      <button onClick={() => handleInboxReply(email)} disabled={sendingReply === email.uid || !inboxReply[email.uid]?.trim()} className="px-4 py-1.5 bg-ink hover:bg-ink disabled:opacity-40 text-on-ink text-xs font-semibold rounded-lg transition">
                        {sendingReply === email.uid ? 'Sending…' : 'Send Reply'}
                      </button>
                      <span className="text-xs text-muted">From: contact@afavers.online</span>
                    </div>
                  </div>
                </div>}
            </div>)}

          {/* Compose modal */}
          {composing && <ModalSurface label="New email" onClose={() => setComposing(false)}>
              <div className="bg-surface rounded-lg p-6 w-full max-w-lg shadow-none space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-base font-semibold text-ink">New Email</h3>
                  <button onClick={() => setComposing(false)} className="text-muted hover:text-muted text-lg leading-none">×</button>
                </div>
                <input value={compose.to} onChange={e => setCompose(p => ({
            ...p,
            to: e.target.value
          }))} placeholder="To (email)" className="w-full text-sm border border-line rounded-lg px-3 py-2 outline-none focus-visible:ring-2 focus-visible:ring-green-500" />
                <input value={compose.subject} onChange={e => setCompose(p => ({
            ...p,
            subject: e.target.value
          }))} placeholder="Subject" className="w-full text-sm border border-line rounded-lg px-3 py-2 outline-none focus-visible:ring-2 focus-visible:ring-green-500" />
                <textarea rows={6} value={compose.body} onChange={e => setCompose(p => ({
            ...p,
            body: e.target.value
          }))} placeholder="Message…" className="w-full text-sm border border-line rounded-lg px-3 py-2 outline-none focus-visible:ring-2 focus-visible:ring-green-500 resize-none" />
                <div className="flex gap-3">
                  <button onClick={() => setComposing(false)} className="flex-1 px-4 py-2.5 border border-line rounded-lg text-sm text-ink hover:bg-canvas transition">Cancel</button>
                  <button onClick={handleComposeSend} disabled={sending || !compose.to || !compose.subject || !compose.body} className="flex-1 px-4 py-2.5 bg-ink hover:bg-ink disabled:opacity-40 text-on-ink text-sm font-semibold rounded-lg transition">
                    {sending ? 'Sending…' : 'Send'}
                  </button>
                </div>
              </div>
            </ModalSurface>}
        </div>}

      {/* ── Confirm Delete Modal ── */}
      {confirmDelete && <ModalSurface label="Delete user" onClose={() => setConfirmDelete(null)}>
          <div className="bg-surface rounded-lg p-6 max-w-sm w-full shadow-none">
            <h3 className="text-base font-semibold text-ink mb-2">Delete user?</h3>
            <p className="text-sm text-muted mb-5">
              This will permanently delete <strong>{confirmDelete.email}</strong> and all their data. This cannot be undone.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmDelete(null)} className="flex-1 px-4 py-2.5 border border-line rounded-lg text-sm font-medium text-ink hover:bg-canvas transition">
                Cancel
              </button>
              <button onClick={() => handleDelete(confirmDelete)} className="flex-1 px-4 py-2.5 bg-red-600 hover:bg-red-700 text-on-ink text-sm font-semibold rounded-lg transition">
                Delete
              </button>
            </div>
          </div>
        </ModalSurface>}
    </div>;
};

// ── Skeletons ──────────────────────────────────────────────────────────────
const SkeletonCards = () => <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 ">
    {Array.from({
    length: 4
  }, (_, i) => <div key={i} className="bg-subtle rounded-lg h-24" />)}
  </div>;
const SkeletonTable = () => <div className="space-y-2 ">
    {Array.from({
    length: 6
  }, (_, i) => <div key={i} className="bg-subtle rounded-lg h-12" />)}
  </div>;
