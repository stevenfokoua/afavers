import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { supabase } from '../lib/supabase';
import { activatePrivateDataOwner } from './privateStorage';
import { useReminderStore } from './reminderStore';
import { cancelReminder, scheduleReminder } from '../services/notification.service';
import './calendarStore';
import './goalStore';
import { invalidateJobSnapshot } from '../services/jobSnapshot';

interface User {
  id: number;
  email: string;
  isAdmin?: boolean;
}

interface SupabaseAuthUser {
  id: string;
  email?: string;
}

const DEMO_EMAIL = import.meta.env.VITE_DEMO_EMAIL || 'demo@afavers.com';
let privateOwner: number | null = null;
async function switchPrivateUser(userId: number | null): Promise<void> {
  if (privateOwner === userId) return;
  const previous = useReminderStore.getState().reminders;
  await Promise.all(previous.map((reminder) => cancelReminder(reminder.id).catch(() => {})));
  await activatePrivateDataOwner(userId);
  privateOwner = userId;
  await Promise.all(useReminderStore.getState().reminders
    .filter((reminder) => !reminder.completed)
    .map((reminder) => scheduleReminder(reminder).catch(() => {})));
}
const DEMO_PASSWORD = 'demo1234';
const SUPABASE_AUTH_STORAGE_KEY = 'afavers-supabase-auth-v3';
const LEGACY_AUTH_STORAGE_KEYS = ['afavers-supabase-auth-v2'];
const DEMO_STATUSES: Array<'applied' | 'preparing' | 'saved' | 'followup' | 'interviewing' | 'offered' | 'rejected'> = [
  'applied',
  'applied',
  'preparing',
  'preparing',
  'saved',
  'saved',
  'followup',
  'interviewing',
  'interviewing',
  'offered',
  'rejected',
  'saved',
];

interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isDemo: boolean;
  hasCheckedSession: boolean;
  lastActivity: number | null;
  login: (email: string, password: string, adminKey?: string) => Promise<void>;
  loginDemo: () => Promise<void>;
  register: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  updateActivity: () => void;
}

function isDemoEmail(email?: string | null): boolean {
  return email?.toLowerCase() === DEMO_EMAIL;
}

function clearStoredAuth(): void {
  try {
    const storageAreas = [localStorage, sessionStorage];
    storageAreas.forEach((storage) => {
      storage.removeItem('auth-storage');
      storage.removeItem(SUPABASE_AUTH_STORAGE_KEY);
      LEGACY_AUTH_STORAGE_KEYS.forEach((key) => storage.removeItem(key));
      Object.keys(storage)
        .filter((key) => key.startsWith('sb-') && key.includes('-auth-token'))
        .forEach((key) => storage.removeItem(key));
    });
  } catch {
    // Browser storage can be blocked in some privacy modes.
  }
}

function clearAuthState(): void {
  void switchPrivateUser(null);
  clearStoredAuth();
  useAuthStore.setState({ user: null, token: null, isAuthenticated: false, isDemo: false, hasCheckedSession: true, lastActivity: null });
  invalidateJobSnapshot();
}

async function getCurrentAppUser(authUser?: SupabaseAuthUser): Promise<User> {
  let currentAuthUser = authUser;
  if (!currentAuthUser) {
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError) throw new Error(authError.message);
    currentAuthUser = authData.user ?? undefined;
  }

  if (!currentAuthUser?.email) throw new Error('No active Supabase session');

  let { data, error } = await supabase
    .from('users')
    .select('id,email,is_admin')
    .eq('auth_user_id', currentAuthUser.id)
    .maybeSingle();

  if (error && !/auth_user_id/i.test(error.message)) throw new Error(error.message);
  if (!data) {
    const fallback = await supabase
      .from('users')
      .select('id,email,is_admin')
      .ilike('email', currentAuthUser.email)
      .maybeSingle();
    if (fallback.error) throw new Error(fallback.error.message);
    data = fallback.data;
  }

  if (!data) {
    throw new Error('Your Supabase account is not linked to an app profile yet. Run the Supabase Auth/RLS migration, then try again.');
  }

  return {
    id: data.id,
    email: data.email,
    isAdmin: Boolean(data.is_admin),
  };
}

async function resetDemoData(userId: number): Promise<void> {
  const { data: jobs, error: jobsError } = await supabase
    .from('jobs')
    .select('id,title,company')
    .eq('is_manual', false)
    .order('created_at', { ascending: false })
    .limit(DEMO_STATUSES.length + 4);

  if (jobsError) throw new Error(jobsError.message);
  const picks = (jobs ?? []).slice(0, DEMO_STATUSES.length);
  if (picks.length === 0) return;

  const { error: deleteError } = await supabase
    .from('user_jobs')
    .delete()
    .eq('user_id', userId);
  if (deleteError) throw new Error(deleteError.message);

  const today = new Date();
  const rows = picks.map((job, index) => {
    const status = DEMO_STATUSES[index];
    const appliedDate = ['applied', 'followup', 'interviewing', 'offered', 'rejected'].includes(status)
      ? new Date(today.getTime() - (index + 2) * 86400000).toISOString().slice(0, 10)
      : null;
    const followUpDate = status === 'followup'
      ? today.toISOString().slice(0, 10)
      : status === 'applied'
        ? new Date(today.getTime() + 7 * 86400000).toISOString().slice(0, 10)
        : null;
    const interviewDate = status === 'interviewing'
      ? new Date(today.getTime() + (index + 1) * 86400000).toISOString().slice(0, 10)
      : null;

    return {
      user_id: userId,
      job_id: job.id,
      status,
      applied_date: appliedDate,
      follow_up_date: followUpDate,
      interview_date: interviewDate,
      checklist: status === 'preparing'
        ? { 'CV tailored': true, 'Cover letter ready': index % 2 === 0 }
        : status === 'applied' || status === 'followup' || status === 'interviewing'
          ? { 'CV tailored': true, 'Cover letter ready': true, 'Application submitted': true }
          : {},
      notes: status === 'followup' ? 'Demo note: send a polite follow-up today.' : null,
      history: [
        { type: 'manual', label: 'Added to demo tracker', at: new Date(today.getTime() - (index + 4) * 86400000).toISOString() },
        { type: 'status', label: `Moved to ${status}`, at: new Date(today.getTime() - (index + 1) * 86400000).toISOString() },
      ],
      updated_at: new Date().toISOString(),
    };
  });

  const { error: insertError } = await supabase
    .from('user_jobs')
    .insert(rows);
  if (insertError) throw new Error(insertError.message);
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      token: null,
      isAuthenticated: false,
      isDemo: false,
      hasCheckedSession: false,
      lastActivity: null,

      login: async (email, password, _adminKey?) => {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: email.toLowerCase().trim(),
          password,
        });
        if (error) throw new Error(error.message);
        if (!data.session) throw new Error('Please confirm your email before signing in.');

        const user = await getCurrentAppUser(data.user ?? undefined);
        await switchPrivateUser(user.id);
        set({
          user,
          token: data.session.access_token,
          isAuthenticated: true,
          isDemo: false,
          hasCheckedSession: true,
          lastActivity: Date.now(),
        });
      },

      loginDemo: async () => {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: DEMO_EMAIL,
          password: DEMO_PASSWORD,
        });
        if (error) throw new Error(error.message);
        if (!data.session) throw new Error('Demo account unavailable.');

        const user = await getCurrentAppUser(data.user ?? undefined);
        await resetDemoData(user.id);
        await switchPrivateUser(user.id);
        set({
          user,
          token: data.session.access_token,
          isAuthenticated: true,
          isDemo: true,
          hasCheckedSession: true,
          lastActivity: Date.now(),
        });
      },

      register: async (email, password) => {
        const { data, error } = await supabase.auth.signUp({
          email: email.toLowerCase().trim(),
          password,
        });
        if (error) throw new Error(error.message);
        if (!data.session) return;

        const user = await getCurrentAppUser(data.user ?? undefined);
        await switchPrivateUser(user.id);
        set({
          user,
          token: data.session.access_token,
          isAuthenticated: true,
          isDemo: false,
          hasCheckedSession: true,
          lastActivity: Date.now(),
        });
      },

      logout: async () => {
        await switchPrivateUser(null);
        try {
          await supabase.auth.signOut();
        } catch {
          // Clear local state even if the remote session is already invalid.
        }
        clearStoredAuth();
        set({ user: null, token: null, isAuthenticated: false, isDemo: false, hasCheckedSession: true, lastActivity: null });
        // A read can start while remote sign-out is pending and repopulate the
        // cache after switchPrivateUser(null). Retire that snapshot as well.
        invalidateJobSnapshot();
      },

      updateActivity: () => {
        set({ lastActivity: Date.now() });
      },
    }),
    {
      name: 'auth-storage',
      // Keep auth state in sessionStorage so it is wiped on tab close,
      // mirroring the Supabase client's storage choice in lib/supabase.ts.
      storage: createJSONStorage(() => sessionStorage),
      // Never persist the Supabase access token; supabase-js owns the
      // canonical session in its own storage. Persisting the token here
      // would duplicate a sensitive credential.
      partialize: (state) => ({
        user: state.user,
        isAuthenticated: state.isAuthenticated,
        isDemo: state.isDemo,
        lastActivity: state.lastActivity,
      }),
    }
  )
);

supabase.auth.getSession().then(async ({ data }) => {
  if (!data.session) {
    clearAuthState();
    return;
  }
  try {
    const user = await getCurrentAppUser(data.session.user);
    await switchPrivateUser(user.id);
    useAuthStore.setState({
      user,
      token: data.session.access_token,
      isAuthenticated: true,
      isDemo: isDemoEmail(user.email),
      hasCheckedSession: true,
      lastActivity: Date.now(),
    });
  } catch {
    try {
      await supabase.auth.signOut();
    } catch {}
    clearAuthState();
  }
});

supabase.auth.onAuthStateChange((_event, session) => {
  if (!session) {
    clearAuthState();
    return;
  }

  useAuthStore.setState({ token: session.access_token });
  setTimeout(async () => {
    try {
      const user = await getCurrentAppUser(session.user);
      await switchPrivateUser(user.id);
      useAuthStore.setState({
        user,
        token: session.access_token,
        isAuthenticated: true,
        isDemo: isDemoEmail(user.email),
        hasCheckedSession: true,
        lastActivity: Date.now(),
      });
    } catch {
      useAuthStore.setState({ user: null, token: session.access_token, isAuthenticated: false, isDemo: false, hasCheckedSession: true });
    }
  }, 0);
});
