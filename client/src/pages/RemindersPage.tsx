import { DateStamp } from "../components/jobs/ActionCard";
import { isOverdue } from "../components/jobs/cardDetails";
import { ModalSurface } from "../components/ui";
import { useState, useEffect } from 'react';
import { useReminderStore, type Reminder, type ReminderType } from '../store/reminderStore';
import { scheduleReminder, cancelReminder, requestNotificationPermission } from '../services/notification.service';
import { useLanguage } from '../store/languageStore';
import { AccountSyncStatus } from '../components/common/AccountSyncStatus';
import { deviceTimezone, reminderInstant } from '../services/reminderTime';
import { getReminderDeliveries, type ReminderDelivery } from '../services/reminderDelivery.service';

// ── Type config ────────────────────────────────────────────────────────────────
const TYPE_CONFIG: Record<ReminderType, {
  labelKey: string;
  color: string;
  ring: string;
  bg: string;
}> = {
  interview: {
    labelKey: 'calendarInterview',
    color: 'bg-ink',
    ring: 'ring-purple-400',
    bg: 'bg-subtle'
  },
  followup: {
    labelKey: 'calendarFollowUp',
    color: 'bg-ink',
    ring: 'ring-amber-400',
    bg: 'bg-subtle'
  },
  deadline: {
    labelKey: 'deadline',
    color: 'bg-red-500',
    ring: 'ring-red-400',
    bg: 'bg-danger-soft'
  },
  custom: {
    labelKey: 'reminder',
    color: 'bg-ink',
    ring: 'ring-blue-400',
    bg: 'bg-subtle'
  }
};
const groupLabelKey = (label: string) => ({
  Today: 'today',
  Tomorrow: 'tomorrow',
  'This Week': 'thisWeek',
  Upcoming: 'upcoming',
  Overdue: 'overdue'
})[label] ?? label;

// ── Group helpers ──────────────────────────────────────────────────────────────
function groupReminders(reminders: Reminder[]) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  const nextWeek = new Date(today);
  nextWeek.setDate(today.getDate() + 7);
  const groups: {
    label: string;
    items: Reminder[];
  }[] = [{
    label: 'Today',
    items: []
  }, {
    label: 'Tomorrow',
    items: []
  }, {
    label: 'This Week',
    items: []
  }, {
    label: 'Upcoming',
    items: []
  }, {
    label: 'Overdue',
    items: []
  }];
  reminders.forEach(r => {
    const d = new Date(r.date + 'T00:00:00');
    if (d < today) {
      groups[4].items.push(r);
      return;
    }
    if (d.getTime() === today.getTime()) {
      groups[0].items.push(r);
      return;
    }
    if (d.getTime() === tomorrow.getTime()) {
      groups[1].items.push(r);
      return;
    }
    if (d < nextWeek) {
      groups[2].items.push(r);
      return;
    }
    groups[3].items.push(r);
  });
  return groups.filter(g => g.items.length > 0);
}
// ── Check circle ───────────────────────────────────────────────────────────────
const CheckCircle = ({
  completed,
  color
}: {
  completed: boolean;
  color: string;
}) => <div className={`w-6 h-6 rounded-md border-2 flex items-center justify-center shrink-0 transition-colors duration-200 ${completed ? `${color} border-transparent` : 'border-line bg-surface'}`}>
    {completed && <svg className="w-3.5 h-3.5 text-on-ink" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
      </svg>}
  </div>;

// ── New reminder form ──────────────────────────────────────────────────────────
const NewReminderForm = ({
  onSave,
  onCancel,
  initial
}: {
  onSave: (r: Omit<Reminder, 'id' | 'completed'>) => void;
  onCancel: () => void;
  initial?: Reminder;
}) => {
  const {
    t, lang
  } = useLanguage();
  const de = lang === 'de', defaultTime = new Date(Date.now() + 15 * 60_000);
  const todayStr = `${defaultTime.getFullYear()}-${String(defaultTime.getMonth()+1).padStart(2,'0')}-${String(defaultTime.getDate()).padStart(2,'0')}`;
  const nowTime = defaultTime.toTimeString().slice(0, 5);
  const [title, setTitle] = useState(initial?.title || '');
  const [date, setDate] = useState(initial?.date || todayStr);
  const [time, setTime] = useState(initial?.time || nowTime);
  const [type, setType] = useState<ReminderType>(initial?.type || 'custom');
  const [notes, setNotes] = useState(initial?.notes || '');
  const [timezone, setTimezone] = useState(initial?.timezone || deviceTimezone());
  const [emailEnabled, setEmailEnabled] = useState(initial?.emailEnabled ?? false);
  const instant = reminderInstant(date,time,timezone);
  const schedulesEmail = emailEnabled && !initial?.completed;
  const valid = !!title.trim() && instant !== null && (!schedulesEmail || instant > new Date());
  const handleSave = () => {
    if (!valid) return;
    onSave({
      title: title.trim(),
      date,
      time,
      type,
      notes: notes.trim() || undefined,
      timezone, emailEnabled
    });
  };
  return <ModalSurface label={initial ? (de ? 'Erinnerung bearbeiten' : 'Edit reminder') : 'New reminder'} onClose={() => onCancel()}>
      <div className="bg-surface w-full sm:max-w-md sm:rounded-lg rounded-t-lg shadow-none overflow-hidden ">
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <button onClick={onCancel} className="text-sm text-muted hover:text-muted transition">{t('cancel')}</button>
          <h2 className="text-base font-semibold text-ink">{initial ? (de ? 'Erinnerung bearbeiten' : 'Edit reminder') : t('newReminder')}</h2>
          <button onClick={handleSave} disabled={!valid} className="text-sm font-semibold text-accent disabled:text-muted transition">
            {initial ? t('save') : t('add')}
          </button>
        </div>

        <div className="px-5 pb-8 space-y-4">
          {/* Title */}
          <input autoFocus aria-label={t('title')} type="text" value={title} onChange={e => setTitle(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSave()} placeholder={t('title')} className="w-full text-lg font-medium text-ink placeholder-gray-300 border-b border-line pb-2 outline-none focus-visible:border-line transition bg-transparent" />

          {/* Notes */}
          <textarea aria-label={t('notes')} value={notes} onChange={e => setNotes(e.target.value)} placeholder={t('notes')} rows={2} className="w-full text-sm text-ink placeholder-gray-300 border-b border-line pb-2 outline-none resize-none focus-visible:border-line transition bg-transparent" />

          {/* Date + Time */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-canvas rounded-lg p-3">
              <p className="text-xs text-muted font-medium mb-1">{t('date')}</p>
              <input aria-label={t('date')} type="date" value={date} onChange={e => setDate(e.target.value)} className="w-full text-sm font-semibold text-ink bg-transparent outline-none" />
            </div>
            <div className="bg-canvas rounded-lg p-3">
              <p className="text-xs text-muted font-medium mb-1">{t('time')}</p>
              <input aria-label={t('time')} type="time" value={time} onChange={e => setTime(e.target.value)} className="w-full text-sm font-semibold text-ink bg-transparent outline-none" />
            </div>
          </div>

          <label className="ui-label">{de ? 'Zeitzone' : 'Timezone'}<input className="ui-field" value={timezone} onChange={event => setTimezone(event.target.value)} placeholder="Europe/Berlin" /></label>
          <label className="ui-check"><input type="checkbox" checked={emailEnabled} onChange={event => setEmailEnabled(event.target.checked)} />{de ? 'E-Mail an meine Konto-Adresse senden' : 'Email my account address'}</label>
          <p className="text-xs text-muted">{de ? 'Nach der Synchronisierung sendet der Server die E-Mail auch bei geschlossener App. Browser-Benachrichtigungen benötigen einen geöffneten Tab und deine Erlaubnis.' : 'After sync, the server sends email even when the app is closed. Browser notifications need an open tab and your permission.'}</p>
          {(!instant || schedulesEmail && instant <= new Date()) && <p className="text-xs text-warning" role="alert">{de ? 'Wähle eine gültige lokale Uhrzeit und Zeitzone. Für E-Mail muss der Termin in der Zukunft liegen. Nicht vorhandene Zeiten bei der Zeitumstellung sind ungültig.' : 'Choose a valid local time and timezone. Email needs a future date. Times skipped by daylight saving are invalid.'}</p>}

          {/* Type pills */}
          <div>
            <p className="text-xs text-muted font-medium mb-2">{t('type')}</p>
            <div className="flex flex-wrap gap-2">
              {(Object.entries(TYPE_CONFIG) as [ReminderType, typeof TYPE_CONFIG[ReminderType]][]).map(([k, v]) => <button key={k} onClick={() => setType(k)} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold border transition ${type === k ? `${v.bg} border-transparent text-ink ring-2 ${v.ring}` : 'bg-surface border-line text-muted hover:border-line'}`}>
                  <span className={`w-2 h-2 rounded-md ${v.color}`} />
                  {t(v.labelKey)}
                </button>)}
            </div>
          </div>
        </div>
      </div>
    </ModalSurface>;
};

// ── Reminder row ───────────────────────────────────────────────────────────────
const ReminderRow = ({
  reminder,
  onToggle,
  onDelete,
  onEdit,
  delivery
}: {
  reminder: Reminder;
  onToggle: () => void;
  onDelete: () => void;
  onEdit: () => void;
  delivery?: ReminderDelivery;
}) => {
  const {
    t, lang
  } = useLanguage();
  const cfg = TYPE_CONFIG[reminder.type];
  const [showDelete, setShowDelete] = useState(false);
  return <div className={`reminder-action-row flex items-center gap-3.5 px-4 py-3.5 bg-surface transition-colors ${reminder.completed ? 'opacity-50' : ''}`} onTouchStart={() => setShowDelete(false)}>
      <div className="reminder-date"><DateStamp value={reminder.date} de={lang === 'de'} /></div>
      <button aria-label={`${reminder.completed ? (lang === 'de' ? 'Als unerledigt markieren' : 'Mark incomplete') : (lang === 'de' ? 'Erledigen' : 'Complete')}: ${reminder.title}`} aria-pressed={reminder.completed} onClick={onToggle} className="shrink-0  transition-colors">
        <CheckCircle completed={reminder.completed} color={cfg.color} />
      </button>

      <div className="reminder-copy flex-1 min-w-0">
        <p className={`text-sm font-medium text-ink leading-snug ${reminder.completed ? 'line-through' : ''}`}>
          {reminder.title}
        </p>
        <div className="flex items-center gap-2 mt-0.5">
          <span className={`w-1.5 h-1.5 rounded-md shrink-0 ${cfg.color}`} />
          <span className="text-xs text-muted">{reminder.time}</span>{!reminder.completed && isOverdue(reminder.date) && <span className="card-overdue">{t('overdue')}</span>}
          {reminder.notes && <span className="text-xs text-muted truncate">· {reminder.notes}</span>}
        </div>
        {reminder.emailEnabled && <p className={`text-xs mt-1 ${delivery && ['uncertain','failed','missed'].includes(delivery.state) ? 'text-warning' : 'text-muted'}`}>
          {lang === 'de' ? 'E-Mail' : 'Email'} · {delivery?.state === 'sent' ? (lang === 'de' ? 'Vom Mailserver angenommen' : 'Accepted by mail server') : delivery?.state === 'uncertain' ? (lang === 'de' ? 'Zustellung unklar; keine automatische Wiederholung' : 'Delivery uncertain; no automatic resend') : delivery?.state === 'retry' ? (lang === 'de' ? 'Wird erneut versucht' : 'Retry pending') : delivery?.state === 'failed' || delivery?.state === 'missed' ? (lang === 'de' ? 'Nicht zugestellt; Termin prüfen' : 'Not delivered; review this reminder') : reminder.completed ? t('completed') : delivery?.state === 'not_scheduled' ? (lang === 'de' ? 'Nicht geplant; zukünftigen Termin wählen' : 'Not scheduled; choose a future time') : (lang === 'de' ? 'Nach Synchronisierung geplant' : 'Scheduled after sync')} · {reminder.timezone || deviceTimezone()}
        </p>}
      </div>

      <button aria-label={`${t('delete')}: ${reminder.title}`} aria-expanded={showDelete} onClick={() => {
      setShowDelete(v => !v);
    }} className="reminder-menu shrink-0 p-1 text-muted hover:text-muted transition">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
        </svg>
      </button>

      {showDelete && <><button type="button" onClick={onEdit} className="ui-button">{t('edit')}</button><button onClick={onDelete} className="shrink-0 text-xs font-semibold text-danger bg-danger-soft px-2.5 py-1 rounded-lg hover:bg-danger-soft transition">
          {t('delete')}
        </button></>}
    </div>;
};

// ── Main page ──────────────────────────────────────────────────────────────────
export const RemindersPage = () => {
  const {
    t, lang
  } = useLanguage();
  const {
    reminders,
    addReminder,
    updateReminder,
    toggleComplete,
    removeReminder
  } = useReminderStore();
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Reminder | undefined>();
  const [deliveries, setDeliveries] = useState<ReminderDelivery[]>([]);
  const [deliveryError, setDeliveryError] = useState(false);
  const [showCompleted, setShowCompleted] = useState(false);

  // Request notification permission once on mount
  useEffect(() => {
    requestNotificationPermission().catch(() => {});
  }, []);
  useEffect(() => {
    let live = true;
    const refresh = () => { void getReminderDeliveries().then(rows => { if (live) { setDeliveries(rows); setDeliveryError(false); } }).catch(() => { if (live) setDeliveryError(true); }); };
    refresh(); const timer = setInterval(refresh,60_000);
    return () => { live = false; clearInterval(timer); };
  }, [reminders]);
  const active = reminders.filter(r => !r.completed);
  const completed = reminders.filter(r => r.completed);
  const groups = groupReminders(active);
  const handleSave = async (data: Omit<Reminder, 'id' | 'completed'>) => {
    const id = editing?.id || addReminder(data);
    if (editing) updateReminder(id,data);
    const full: Reminder = {
      ...data,
      id,
      completed: editing?.completed ?? false
    };
    await scheduleReminder(full).catch(() => {});
    setShowForm(false);
    setEditing(undefined);
  };
  const handleDelete = async (r: Reminder) => {
    await cancelReminder(r.id).catch(() => {});
    removeReminder(r.id);
  };
  const handleToggle = async (reminder: Reminder) => {
    toggleComplete(reminder.id);
    if (reminder.completed) await scheduleReminder({
      ...reminder,
      completed: false
    }).catch(() => {});else await cancelReminder(reminder.id).catch(() => {});
  };
  return <div className="min-h-screen bg-canvas">

      {/* Header — Apple style */}
      <div className="bg-surface border-b border-line px-5 pt-6 pb-4">
        <div className="flex items-end justify-between">
          <div>
            <h1 className="text-3xl font-semibold text-ink tracking-tight">{t('reminders')}</h1>
            <p className="text-sm text-muted mt-0.5">{active.length} {t('remaining')}</p>
          </div>
          <button aria-label={t('newReminder')} onClick={() => { setEditing(undefined); setShowForm(true); }} className="w-10 h-10 rounded-md bg-ink hover:bg-ink flex items-center justify-center text-on-ink shadow-none  transition">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
            </svg>
          </button>
        </div>

        {/* Summary pills */}
        <div className="flex gap-2 mt-4 overflow-x-auto pb-0.5 scrollbar-hide">
          {(Object.entries(TYPE_CONFIG) as [ReminderType, typeof TYPE_CONFIG[ReminderType]][]).map(([k, v]) => {
          const count = active.filter(r => r.type === k).length;
          if (count === 0) return null;
          return <div key={k} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold shrink-0 ${v.bg} text-ink`}>
                <span className={`w-2 h-2 rounded-md ${v.color}`} />
                {t(v.labelKey)} · {count}
              </div>;
        })}
        </div>
      </div>

      <div className="max-w-2xl mx-auto">
        <div className="px-4"><AccountSyncStatus collection="reminders" />{deliveryError && <p className="text-xs text-warning" role="status">{lang === 'de' ? 'Email-Zustellstatus derzeit nicht verfügbar. Deine Erinnerungen bleiben sichtbar.' : 'Email delivery status is unavailable. Your reminders are still visible.'}</p>}</div>

        {/* Empty state */}
        {reminders.length === 0 && <div className="flex flex-col items-center justify-center py-24 px-8 text-center">
            <div className="w-16 h-16 rounded-lg bg-subtle flex items-center justify-center mb-4">
              <svg className="w-8 h-8 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
              </svg>
            </div>
            <p className="text-lg font-semibold text-ink mb-1">{t('noReminders')}</p>
            <p className="text-sm text-muted mb-6">{t('noRemindersHint')}</p>
            <button onClick={() => setShowForm(true)} className="px-6 py-2.5 bg-ink text-on-ink text-sm font-semibold rounded-lg hover:bg-ink  transition shadow-none">
              {t('newReminder')}
            </button>
          </div>}

        {/* Grouped active reminders */}
        {groups.map(group => <div key={group.label} className="mt-6">
            <div className="px-5 mb-2">
              <span className={`text-xs font-semibold uppercase tracking-widest ${group.label === 'Overdue' ? 'text-danger' : group.label === 'Today' ? 'text-accent' : 'text-muted'}`}>
                {t(groupLabelKey(group.label))}
              </span>
            </div>
            <div className="bg-surface rounded-lg shadow-none overflow-hidden mx-4 divide-y divide-line">
              {group.items.map(r => <ReminderRow key={r.id} reminder={r} delivery={deliveries.find(d => d.item_id === r.id)} onEdit={() => { setEditing(r); setShowForm(true); }} onToggle={() => {
            void handleToggle(r);
          }} onDelete={() => handleDelete(r)} />)}
            </div>
          </div>)}

        {/* Completed section */}
        {completed.length > 0 && <div className="mt-6 mx-4 mb-8">
            <button onClick={() => setShowCompleted(v => !v)} className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-muted mb-2 hover:text-muted transition">
              <svg className={`w-3.5 h-3.5 transition-colors ${showCompleted ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
              </svg>
              {t('completed')} · {completed.length}
            </button>
            {showCompleted && <div className="bg-surface rounded-lg shadow-none overflow-hidden divide-y divide-line">
                {completed.map(r => <ReminderRow key={r.id} reminder={r} delivery={deliveries.find(d => d.item_id === r.id)} onEdit={() => { setEditing(r); setShowForm(true); }} onToggle={() => {
            void handleToggle(r);
          }} onDelete={() => handleDelete(r)} />)}
              </div>}
          </div>}

        {/* Bottom padding for nav */}
        <div className="h-8" />
      </div>

      {/* New reminder modal */}
      {showForm && <NewReminderForm initial={editing} onSave={handleSave} onCancel={() => { setShowForm(false); setEditing(undefined); }} />}
    </div>;
};
