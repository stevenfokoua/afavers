// afavers Job Capture — popup script
// ────────────────────────────────────────────────────────────────────────────
// Migration note (2026-04-17):
//   Prior versions of this extension shelled out to an Express server
//   (server-production-ebd2b.up.railway.app/api/auth/login + /api/jobs/capture)
//   to authenticate users and upsert jobs.  That server is being retired.
//   This file now talks directly to Supabase via `@supabase/supabase-js`:
//     - `supabase.auth.signInWithPassword(...)` for login
//     - REST upserts on `jobs` + `user_jobs` for capture
//   Legacy users who have an old JWT in `chrome.storage.local` under the
//   `accessToken` key will be logged out on first open (no matching Supabase
//   session) and must sign in again.
// ────────────────────────────────────────────────────────────────────────────

import { createClient } from '@supabase/supabase-js';

// ── Config ────────────────────────────────────────────────────────────────
// `config.js` is loaded by popup.html BEFORE this bundle and assigns the
// configuration object to `self.__AFAVERS_CONFIG__`.  If the user forgot to
// fill it in, the placeholder value will trigger a visible error on login
// rather than silently failing.
const CONFIG = (typeof self !== 'undefined' && self.__AFAVERS_CONFIG__) || {};
const SUPABASE_URL = CONFIG.SUPABASE_URL || '';
const SUPABASE_ANON_KEY = CONFIG.SUPABASE_ANON_KEY || '';
const DASHBOARD_URL = CONFIG.DASHBOARD_URL || 'https://afavers.online/jobs';

const CONFIG_OK = /^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(SUPABASE_URL)
  && SUPABASE_ANON_KEY
  && !SUPABASE_URL.includes('YOUR-PROJECT-REF')
  && !SUPABASE_ANON_KEY.includes('YOUR-SUPABASE');

// ── chrome.storage-backed session adapter ─────────────────────────────────
// The Supabase client wants a localStorage-like interface.  We use
// `chrome.storage.session` by default (cleared when the browser closes) and
// only fall back to `chrome.storage.local` when the user explicitly checks
// "Remember me".
const SESSION_STORAGE_KEY = 'afavers.session.durable';

function makeChromeStorage(area) {
  return {
    async getItem(key) {
      return new Promise((resolve) => {
        chrome.storage[area].get([key], (res) => resolve(res?.[key] ?? null));
      });
    },
    async setItem(key, value) {
      return new Promise((resolve) => {
        chrome.storage[area].set({ [key]: value }, () => resolve());
      });
    },
    async removeItem(key) {
      return new Promise((resolve) => {
        chrome.storage[area].remove([key], () => resolve());
      });
    },
  };
}

async function getPreferredStorageArea() {
  return new Promise((resolve) => {
    chrome.storage.local.get([SESSION_STORAGE_KEY], (res) => {
      resolve(res?.[SESSION_STORAGE_KEY] ? 'local' : 'session');
    });
  });
}

async function setPreferredStorageArea(area) {
  return new Promise((resolve) => {
    if (area === 'local') {
      chrome.storage.local.set({ [SESSION_STORAGE_KEY]: true }, () => resolve());
    } else {
      chrome.storage.local.remove([SESSION_STORAGE_KEY], () => resolve());
    }
  });
}

// ── Supabase client ───────────────────────────────────────────────────────
// We construct the client lazily (after we know the preferred area) so
// sessions persist to the correct storage bucket.
let supabase = null;
let currentStorageArea = 'session';

async function getSupabase() {
  if (supabase) return supabase;
  if (!CONFIG_OK) {
    throw new Error('Extension is not configured. Edit extension/config.js and reload.');
  }
  currentStorageArea = await getPreferredStorageArea();
  supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      storage: makeChromeStorage(currentStorageArea),
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
      storageKey: 'afavers.auth.token',
    },
  });

  // Keep a cached copy of the appUserId whenever the auth state changes.
  supabase.auth.onAuthStateChange(async (event, session) => {
    if (event === 'SIGNED_OUT' || !session) {
      await clearAppUserCache();
      return;
    }
    try {
      const appUser = await fetchAppUser(session.user?.id, session.user?.email);
      await setAppUserCache({
        appUserId: appUser.id,
        authUserId: session.user?.id,
        email: appUser.email || session.user?.email,
      });
    } catch {
      // non-fatal — we'll try again at capture time
    }
  });

  return supabase;
}

// ── App-user cache (id/email for the current user) ────────────────────────
const APP_USER_CACHE_KEY = 'afavers.appUser';

async function setAppUserCache(payload) {
  return new Promise((resolve) => {
    chrome.storage.session.set({ [APP_USER_CACHE_KEY]: payload }, () => resolve());
  });
}

async function getAppUserCache() {
  return new Promise((resolve) => {
    chrome.storage.session.get([APP_USER_CACHE_KEY], (res) => resolve(res?.[APP_USER_CACHE_KEY] || null));
  });
}

async function clearAppUserCache() {
  return new Promise((resolve) => {
    chrome.storage.session.remove([APP_USER_CACHE_KEY], () => {
      chrome.storage.local.remove([APP_USER_CACHE_KEY], () => resolve());
    });
  });
}

async function fetchAppUser(authUserId, email) {
  const client = await getSupabase();
  // RLS on public.users allows the authenticated user to read their own row
  // (matched by auth.jwt() -> email).  Query by auth_user_id first and fall
  // back to email for older accounts that never had auth_user_id populated.
  if (authUserId) {
    const { data, error } = await client
      .from('users')
      .select('id,email,is_admin')
      .eq('auth_user_id', authUserId)
      .limit(1);
    if (!error && data && data.length) return data[0];
  }
  if (email) {
    const { data, error } = await client
      .from('users')
      .select('id,email,is_admin')
      .ilike('email', email)
      .limit(1);
    if (error) throw new Error(error.message);
    if (data && data.length) return data[0];
  }
  throw new Error('Account profile is not ready yet. Sign in on afavers once, then try again.');
}

async function hashText(value) {
  const bytes = new TextEncoder().encode(value || String(Date.now()));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 24);
}

// ── DOM refs / helpers ────────────────────────────────────────────────────
const $ = (id) => document.getElementById(id);
const views = {
  login: $('view-login'),
  capture: $('view-capture'),
  success: $('view-success'),
};

function showView(name) {
  Object.values(views).forEach((v) => v && v.classList.add('hidden'));
  views[name] && views[name].classList.remove('hidden');
}
function showError(id, msg) {
  const el = $(id);
  if (!el) return;
  el.textContent = msg;
  el.classList.remove('hidden');
}
function hideError(id) {
  const el = $(id);
  if (el) el.classList.add('hidden');
}
function setUserInfo(email) {
  $('user-email').textContent = email || '';
  $('user-info').classList.remove('hidden');
}

// ── Login ─────────────────────────────────────────────────────────────────
$('login-btn').addEventListener('click', async () => {
  const email = $('login-email').value.trim();
  const password = $('login-password').value;
  const rememberEl = $('login-remember');
  const remember = !!(rememberEl && rememberEl.checked);

  if (!email || !password) return showError('login-error', 'Email and password required.');
  if (!CONFIG_OK) {
    return showError('login-error', 'Extension is not configured. Edit extension/config.js.');
  }
  hideError('login-error');
  $('login-btn').disabled = true;
  $('login-btn').textContent = 'Signing in…';

  try {
    // Set the preferred storage BEFORE constructing the client so the session
    // lands in the right place from the start.
    await setPreferredStorageArea(remember ? 'local' : 'session');
    // Reset cached client so it picks up the new storage area.
    supabase = null;
    const client = await getSupabase();

    const { data, error } = await client.auth.signInWithPassword({ email, password });
    if (error) throw error;

    const profile = await fetchAppUser(data.user?.id, data.user?.email);
    await setAppUserCache({
      appUserId: profile.id,
      authUserId: data.user?.id,
      email: profile.email || data.user?.email,
    });

    setUserInfo(profile.email || data.user?.email);
    showView('capture');
    extractFromPage();
  } catch (err) {
    showError('login-error', err?.message || 'Login failed');
  } finally {
    $('login-btn').disabled = false;
    $('login-btn').textContent = 'Sign In';
  }
});

// ── Logout ────────────────────────────────────────────────────────────────
$('logout-btn').addEventListener('click', async () => {
  try {
    const client = await getSupabase();
    await client.auth.signOut();
  } catch {
    // ignore — we still want to clear local state
  }
  await clearAppUserCache();
  // Also wipe the legacy fields written by pre-2026-04-17 clients, in case
  // someone upgrades without clearing storage first.
  chrome.storage.local.remove(['accessToken', 'refreshToken', 'userEmail', 'authUserId', 'appUserId', 'token'], () => {});
  $('user-info').classList.add('hidden');
  showView('login');
});

// ── Extract job from page ─────────────────────────────────────────────────
async function extractFromPage() {
  showView('capture');
  $('extract-status').classList.remove('hidden');
  $('capture-form').classList.add('hidden');

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    // Inject content script if needed (some pages may not have it running).
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['content.js'],
      });
    } catch {
      /* already injected */
    }

    const response = await chrome.tabs.sendMessage(tab.id, { type: 'EXTRACT_JOB' });

    $('extract-status').classList.add('hidden');
    $('capture-form').classList.remove('hidden');

    if (response?.success && response.data) {
      populateForm(response.data);
    } else {
      populateForm({ title: '', company: '', location: '', description: '', salary: '', url: tab.url, source: 'manual' });
    }
  } catch {
    $('extract-status').classList.add('hidden');
    $('capture-form').classList.remove('hidden');
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true }).catch(() => [{}]);
    populateForm({ title: '', company: '', location: '', description: '', salary: '', url: tab?.url || '', source: 'manual' });
  }
}

function populateForm(data) {
  $('field-title').value = data.title || '';
  $('field-company').value = data.company || '';
  $('field-location').value = data.location || '';
  $('field-salary').value = data.salary || '';

  const badge = $('source-badge');
  const source = data.source || 'manual';
  const sourceLabels = {
    linkedin: '🔵 LinkedIn', indeed: '🔵 Indeed', stepstone: '🟠 StepStone',
    xing: '🟢 Xing', bundesagentur: '🇩🇪 Bundesagentur', glassdoor: '🟡 Glassdoor',
    adzuna: '🔍 Adzuna', manual: '✏️ Manual entry',
  };
  badge.textContent = sourceLabels[source] || `🌐 ${source}`;
  badge.dataset.url = data.url || '';
  badge.dataset.source = source;
  badge.dataset.description = data.description || '';
}

// ── Save job (direct Supabase upsert) ─────────────────────────────────────
async function ensureSession() {
  const client = await getSupabase();
  const { data, error } = await client.auth.getSession();
  if (error) throw new Error(error.message);
  return data?.session || null;
}

$('save-btn').addEventListener('click', async () => {
  const title = $('field-title').value.trim();
  const company = $('field-company').value.trim();
  const location = $('field-location').value.trim();
  const salary = $('field-salary').value.trim();
  const status = $('field-status').value;
  const badge = $('source-badge');
  const url = badge.dataset.url || '';
  const source = badge.dataset.source || 'manual';
  const description = badge.dataset.description || '';

  if (!title) return showError('save-error', 'Job title is required.');
  hideError('save-error');

  $('save-btn').disabled = true;
  $('save-btn').textContent = 'Saving…';

  try {
    const session = await ensureSession();
    if (!session) {
      await clearAppUserCache();
      showView('login');
      return;
    }

    let cached = await getAppUserCache();
    if (!cached?.appUserId) {
      const profile = await fetchAppUser(session.user?.id, session.user?.email);
      cached = { appUserId: profile.id, authUserId: session.user?.id, email: profile.email || session.user?.email };
      await setAppUserCache(cached);
    }
    const appUserId = cached.appUserId;

    const client = await getSupabase();
    const cleanUrl = url || '';
    const externalHash = await hashText(`${appUserId}:${cleanUrl || `${title}:${company}:${location}`}`);
    const capturedFrom = source && source !== 'manual'
      ? `Captured from ${source}`
      : 'Captured from browser extension';
    const now = new Date().toISOString();

    // 1) Upsert the job row (dedup on external_id — which has a UNIQUE
    //    constraint per the original `jobs` schema).
    const { data: jobRows, error: jobError } = await client
      .from('jobs')
      .upsert({
        external_id: `capture_${appUserId}_${externalHash}`,
        title,
        company: company || 'Unknown company',
        location: location || 'Not specified',
        salary: salary || null,
        url: cleanUrl,
        description: description ? `${capturedFrom}\n\n${description}` : capturedFrom,
        source: 'manual',
        posted_date: now.slice(0, 10),
        owner_user_id: appUserId,
        is_manual: true,
      }, { onConflict: 'external_id' })
      .select('id');

    if (jobError) throw new Error(jobError.message);
    const jobId = jobRows?.[0]?.id;
    if (!jobId) throw new Error('Save failed — no job id returned.');

    // 2) Upsert the per-user overlay row (user_jobs).
    //    history and checklist are JSONB columns, and an upsert replaces them
    //    wholesale. Writing literal values here used to destroy the entire
    //    application timeline and checklist of any job the user was already
    //    tracking -- silently, and it is exactly the data the proof-of-search
    //    export depends on. Read the existing overlay and merge into it.
    const { data: existing, error: existingError } = await client
      .from('user_jobs')
      .select('status, applied_date, checklist, history')
      .eq('user_id', appUserId)
      .eq('job_id', jobId)
      .maybeSingle();
    if (existingError) throw new Error(existingError.message);

    const isAppliedStatus = ['applied', 'followup', 'interviewing', 'offered'].includes(status);
    // Never clear a date the user already has; only fill one in.
    const appliedDate = existing?.applied_date || (isAppliedStatus ? now.slice(0, 10) : null);

    const checklist = { ...(existing?.checklist || {}) };
    if (status === 'applied') checklist['Application submitted'] = true;

    const previousHistory = Array.isArray(existing?.history) ? existing.history : [];
    const newEvents = [{ type: 'manual', label: capturedFrom, at: now }];
    if (existing?.status !== status) {
      newEvents.push({ type: 'status', label: `Moved to ${status}`, at: now });
    }
    // ponytail: read-then-write, so two captures of the same job at the same
    // moment can still lose an event. A SECURITY DEFINER RPC appending with
    // `history = history || $1::jsonb` would close that and the same race in
    // client/src/services/jobs.service.ts; worth doing if the extension gets a
    // real release, but it would also break capture until the migration is
    // applied, which this does not.
    const history = [...previousHistory, ...newEvents].slice(-80);

    const { error: overlayError } = await client
      .from('user_jobs')
      .upsert({
        user_id: appUserId,
        job_id: jobId,
        status,
        applied_date: appliedDate,
        checklist,
        history,
        updated_at: now,
      }, { onConflict: 'user_id,job_id' });

    if (overlayError) throw new Error(overlayError.message);

    $('success-sub').textContent = `${title}${company ? ` at ${company}` : ''}`;
    $('open-dashboard').href = DASHBOARD_URL;
    showView('success');
    $('user-info').classList.remove('hidden');
  } catch (err) {
    const msg = err?.message || 'Save failed';
    // If the session expired we got kicked; route back to login.
    if (/JWT|expired|invalid token|not authenticated|Unauthorized/i.test(msg)) {
      await clearAppUserCache();
      showView('login');
      showError('login-error', 'Your session expired — please sign in again.');
      return;
    }
    showError('save-error', msg);
  } finally {
    $('save-btn').disabled = false;
    $('save-btn').textContent = 'Save to afavers';
  }
});

// ── Save another ──────────────────────────────────────────────────────────
$('save-another').addEventListener('click', () => {
  extractFromPage();
});

// ── Init ──────────────────────────────────────────────────────────────────
(async () => {
  if (!CONFIG_OK) {
    showView('login');
    showError('login-error', 'Extension is not configured. Edit extension/config.js and reload the unpacked extension.');
    return;
  }

  try {
    const client = await getSupabase();
    const { data } = await client.auth.getSession();
    const session = data?.session;
    if (session) {
      let cached = await getAppUserCache();
      if (!cached?.appUserId) {
        try {
          const profile = await fetchAppUser(session.user?.id, session.user?.email);
          cached = { appUserId: profile.id, authUserId: session.user?.id, email: profile.email || session.user?.email };
          await setAppUserCache(cached);
        } catch {
          // fall through — we'll try again at save time
        }
      }
      setUserInfo(cached?.email || session.user?.email);
      showView('capture');
      extractFromPage();
    } else {
      showView('login');
    }
  } catch (err) {
    showView('login');
    showError('login-error', err?.message || 'Failed to initialise');
  }
})();
