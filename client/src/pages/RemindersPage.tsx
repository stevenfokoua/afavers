import { useState, useEffect } from 'react';
import { useReminderStore, type Reminder, type ReminderType } from '../store/reminderStore';
import { scheduleReminder, cancelReminder, requestNotificationPermission } from '../services/notification.service';
import { useLanguage } from '../store/languageStore';

// ── Type config ────────────────────────────────────────────────────────────────
const TYPE_CONFIG: Record<ReminderType, { labelKey: string; color: string; ring: string; bg: string }> = {
  interview: { labelKey: 'calendarInterview',  color: 'bg-purple-500', ring: 'ring-purple-400', bg: 'bg-purple-50' },
  followup:  { labelKey: 'calendarFollowUp',  color: 'bg-amber-500',  ring: 'ring-amber-400',  bg: 'bg-amber-50'  },
  deadline:  { labelKey: 'deadline',   color: 'bg-red-500',    ring: 'ring-red-400',    bg: 'bg-red-50'    },
  custom:    { labelKey: 'reminder',   color: 'bg-blue-500',   ring: 'ring-blue-400',   bg: 'bg-blue-50'   },
};

const groupLabelKey = (label: string) => ({
  Today: 'today',
  Tomorrow: 'tomorrow',
  'This Week': 'thisWeek',
  Upcoming: 'upcoming',
  Overdue: 'overdue',
}[label] ?? label);

// ── Group helpers ──────────────────────────────────────────────────────────────
function groupReminders(reminders: Reminder[]) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1);
  const nextWeek = new Date(today); nextWeek.setDate(today.getDate() + 7);

  const groups: { label: string; items: Reminder[] }[] = [
    { label: 'Today',     items: [] },
    { label: 'Tomorrow',  items: [] },
    { label: 'This Week', items: [] },
    { label: 'Upcoming',  items: [] },
    { label: 'Overdue',   items: [] },
  ];

  reminders.forEach(r => {
    const d = new Date(r.date + 'T00:00:00');
    if (d < today)     { groups[4].items.push(r); return; }
    if (d.getTime() === today.getTime()) { groups[0].items.push(r); return; }
    if (d.getTime() === tomorrow.getTime()) { groups[1].items.push(r); return; }
    if (d < nextWeek)  { groups[2].items.push(r); return; }
    groups[3].items.push(r);
  });

  return groups.filter(g => g.items.length > 0);
}

function formatDate(dateStr: string) {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString(undefined, {
    weekday: 'short', month: 'short', day: 'numeric',
  });
}

// ── Check circle ───────────────────────────────────────────────────────────────
const CheckCircle = ({ completed, color }: { completed: boolean; color: string }) => (
  <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 transition-all duration-200 ${
    completed ? `${color} border-transparent` : 'border-gray-300 bg-white'
  }`}>
    {completed && (
      <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
      </svg>
    )}
  </div>
);

// ── New reminder form ──────────────────────────────────────────────────────────
const NewReminderForm = ({ onSave, onCancel }: { onSave: (r: Omit<Reminder, 'id' | 'completed'>) => void; onCancel: () => void }) => {
  const { t } = useLanguage();
  const todayStr = new Date().toISOString().slice(0, 10);
  const nowTime  = new Date().toTimeString().slice(0, 5);

  const [title, setTitle]   = useState('');
  const [date, setDate]     = useState(todayStr);
  const [time, setTime]     = useState(nowTime);
  const [type, setType]     = useState<ReminderType>('custom');
  const [notes, setNotes]   = useState('');

  const handleSave = () => {
    if (!title.trim()) return;
    onSave({ title: title.trim(), date, time, type, notes: notes.trim() || undefined });
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-white w-full sm:max-w-md sm:rounded-2xl rounded-t-2xl shadow-2xl overflow-hidden animate-slide-up">
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <button onClick={onCancel} className="text-sm text-gray-400 hover:text-gray-600 transition">{t('cancel')}</button>
          <h2 className="text-base font-bold text-gray-900">{t('newReminder')}</h2>
          <button
            onClick={handleSave}
            disabled={!title.trim()}
            className="text-sm font-bold text-green-600 disabled:text-gray-300 transition"
          >
            {t('add')}
          </button>
        </div>

        <div className="px-5 pb-8 space-y-4">
          {/* Title */}
          <input
            autoFocus
            type="text"
            value={title}
            onChange={e => setTitle(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSave()}
            placeholder={t('title')}
            className="w-full text-lg font-medium text-gray-900 placeholder-gray-300 border-b border-gray-200 pb-2 outline-none focus-visible:border-green-500 transition bg-transparent"
          />

          {/* Notes */}
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder={t('notes')}
            rows={2}
            className="w-full text-sm text-gray-700 placeholder-gray-300 border-b border-gray-200 pb-2 outline-none resize-none focus-visible:border-green-500 transition bg-transparent"
          />

          {/* Date + Time */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-gray-50 rounded-xl p-3">
              <p className="text-xs text-gray-400 font-medium mb-1">{t('date')}</p>
              <input
                type="date"
                value={date}
                onChange={e => setDate(e.target.value)}
                className="w-full text-sm font-semibold text-gray-900 bg-transparent outline-none"
              />
            </div>
            <div className="bg-gray-50 rounded-xl p-3">
              <p className="text-xs text-gray-400 font-medium mb-1">{t('time')}</p>
              <input
                type="time"
                value={time}
                onChange={e => setTime(e.target.value)}
                className="w-full text-sm font-semibold text-gray-900 bg-transparent outline-none"
              />
            </div>
          </div>

          {/* Type pills */}
          <div>
            <p className="text-xs text-gray-400 font-medium mb-2">{t('type')}</p>
            <div className="flex flex-wrap gap-2">
              {(Object.entries(TYPE_CONFIG) as [ReminderType, typeof TYPE_CONFIG[ReminderType]][]).map(([k, v]) => (
                <button
                  key={k}
                  onClick={() => setType(k)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition ${
                    type === k
                      ? `${v.bg} border-transparent text-gray-800 ring-2 ${v.ring}`
                      : 'bg-white border-gray-200 text-gray-500 hover:border-gray-300'
                  }`}
                >
                  <span className={`w-2 h-2 rounded-full ${v.color}`} />
                  {t(v.labelKey)}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// ── Reminder row ───────────────────────────────────────────────────────────────
const ReminderRow = ({
  reminder,
  onToggle,
  onDelete,
}: {
  reminder: Reminder;
  onToggle: () => void;
  onDelete: () => void;
}) => {
  const { t } = useLanguage();
  const cfg = TYPE_CONFIG[reminder.type];
  const [showDelete, setShowDelete] = useState(false);

  return (
    <div
      className={`flex items-center gap-3.5 px-4 py-3.5 bg-white transition-all ${reminder.completed ? 'opacity-50' : ''}`}
      onTouchStart={() => setShowDelete(false)}
    >
      <button onClick={onToggle} className="shrink-0 active:scale-90 transition-transform">
        <CheckCircle completed={reminder.completed} color={cfg.color} />
      </button>

      <div className="flex-1 min-w-0">
        <p className={`text-sm font-medium text-gray-900 leading-snug ${reminder.completed ? 'line-through' : ''}`}>
          {reminder.title}
        </p>
        <div className="flex items-center gap-2 mt-0.5">
          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${cfg.color}`} />
          <span className="text-xs text-gray-400">{formatDate(reminder.date)} · {reminder.time}</span>
          {reminder.notes && (
            <span className="text-xs text-gray-300 truncate">· {reminder.notes}</span>
          )}
        </div>
      </div>

      <button
        onClick={() => { setShowDelete(v => !v); }}
        className="shrink-0 p-1 text-gray-300 hover:text-gray-500 transition"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
        </svg>
      </button>

      {showDelete && (
        <button
          onClick={onDelete}
          className="shrink-0 text-xs font-semibold text-red-500 bg-red-50 px-2.5 py-1 rounded-lg hover:bg-red-100 transition"
        >
          {t('delete')}
        </button>
      )}
    </div>
  );
};

// ── Main page ──────────────────────────────────────────────────────────────────
export const RemindersPage = () => {
  const { t } = useLanguage();
  const { reminders, addReminder, toggleComplete, removeReminder } = useReminderStore();
  const [showForm, setShowForm] = useState(false);
  const [showCompleted, setShowCompleted] = useState(false);

  // Request notification permission once on mount
  useEffect(() => {
    requestNotificationPermission().catch(() => {});
  }, []);

  const active    = reminders.filter(r => !r.completed);
  const completed = reminders.filter(r => r.completed);
  const groups    = groupReminders(active);

  const handleSave = async (data: Omit<Reminder, 'id' | 'completed'>) => {
    const id = addReminder(data);
    const full: Reminder = { ...data, id, completed: false };
    await scheduleReminder(full).catch(() => {});
    setShowForm(false);
  };

  const handleDelete = async (r: Reminder) => {
    await cancelReminder(r.id).catch(() => {});
    removeReminder(r.id);
  };

  return (
    <div className="min-h-screen bg-gray-50">

      {/* Header — Apple style */}
      <div className="bg-white border-b border-gray-100 px-5 pt-6 pb-4">
        <div className="flex items-end justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 tracking-tight">{t('reminders')}</h1>
            <p className="text-sm text-gray-400 mt-0.5">{active.length} {t('remaining')}</p>
          </div>
          <button
            onClick={() => setShowForm(true)}
            className="w-10 h-10 rounded-full bg-green-600 hover:bg-green-700 flex items-center justify-center text-white shadow-md active:scale-95 transition"
          >
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
            return (
              <div key={k} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold shrink-0 ${v.bg} text-gray-700`}>
                <span className={`w-2 h-2 rounded-full ${v.color}`} />
                {t(v.labelKey)} · {count}
              </div>
            );
          })}
        </div>
      </div>

      <div className="max-w-2xl mx-auto">

        {/* Empty state */}
        {reminders.length === 0 && (
          <div className="flex flex-col items-center justify-center py-24 px-8 text-center">
            <div className="w-16 h-16 rounded-2xl bg-green-50 flex items-center justify-center mb-4">
              <svg className="w-8 h-8 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
              </svg>
            </div>
            <p className="text-lg font-bold text-gray-900 mb-1">{t('noReminders')}</p>
            <p className="text-sm text-gray-400 mb-6">{t('noRemindersHint')}</p>
            <button
              onClick={() => setShowForm(true)}
              className="px-6 py-2.5 bg-green-600 text-white text-sm font-semibold rounded-xl hover:bg-green-700 active:scale-95 transition shadow-sm"
            >
              {t('newReminder')}
            </button>
          </div>
        )}

        {/* Grouped active reminders */}
        {groups.map(group => (
          <div key={group.label} className="mt-6">
            <div className="px-5 mb-2">
              <span className={`text-xs font-bold uppercase tracking-widest ${
                group.label === 'Overdue' ? 'text-red-500' :
                group.label === 'Today' ? 'text-green-600' : 'text-gray-400'
              }`}>
                {t(groupLabelKey(group.label))}
              </span>
            </div>
            <div className="bg-white rounded-2xl shadow-sm overflow-hidden mx-4 divide-y divide-gray-100">
              {group.items.map(r => (
                <ReminderRow
                  key={r.id}
                  reminder={r}
                  onToggle={() => toggleComplete(r.id)}
                  onDelete={() => handleDelete(r)}
                />
              ))}
            </div>
          </div>
        ))}

        {/* Completed section */}
        {completed.length > 0 && (
          <div className="mt-6 mx-4 mb-8">
            <button
              onClick={() => setShowCompleted(v => !v)}
              className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-gray-400 mb-2 hover:text-gray-600 transition"
            >
              <svg className={`w-3.5 h-3.5 transition-transform ${showCompleted ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
              </svg>
              {t('completed')} · {completed.length}
            </button>
            {showCompleted && (
              <div className="bg-white rounded-2xl shadow-sm overflow-hidden divide-y divide-gray-100">
                {completed.map(r => (
                  <ReminderRow
                    key={r.id}
                    reminder={r}
                    onToggle={() => toggleComplete(r.id)}
                    onDelete={() => handleDelete(r)}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* Bottom padding for nav */}
        <div className="h-8" />
      </div>

      {/* New reminder modal */}
      {showForm && (
        <NewReminderForm
          onSave={handleSave}
          onCancel={() => setShowForm(false)}
        />
      )}
    </div>
  );
};
