import { useAuthStore } from '../store/authStore';
import { useNavigate } from 'react-router-dom';
import { useState, useEffect, useRef } from 'react';
import { jobsService } from '../services/jobs.service';
import type { DashboardStats, FollowUpAlert, Job } from '../types';
import { useLanguage } from '../store/languageStore';
import { useGoalStore, type GoalType } from '../store/goalStore';
import { useCalendarStore, type CalendarEventType } from '../store/calendarStore';
import { useReminderStore } from '../store/reminderStore';
import { scheduleReminder } from '../services/notification.service';
import { usePreferencesStore, jobMatchesFilter } from '../store/preferencesStore';
import { NewsCarousel } from '../components/common/NewsCarousel';
import { GamificationWidget } from '../components/common/GamificationWidget';

// ── Icons ─────────────────────────────────────────────────────────────────────

const IconTarget = ({ className = 'w-5 h-5' }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor">
    <circle cx="12" cy="12" r="10" strokeWidth="1.5"/>
    <circle cx="12" cy="12" r="6" strokeWidth="1.5"/>
    <circle cx="12" cy="12" r="2" fill="currentColor" stroke="none"/>
  </svg>
);

const IconClock = ({ className = 'w-4 h-4' }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor">
    <circle cx="12" cy="12" r="10" strokeWidth="1.5"/>
    <path d="M12 7v5l3 3" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

const IconBriefcase = ({ className = 'w-4 h-4' }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor">
    <rect x="2" y="7" width="20" height="14" rx="2" strokeWidth="1.5"/>
    <path d="M16 7V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v2" strokeWidth="1.5"/>
    <line x1="2" y1="13" x2="22" y2="13" strokeWidth="1.5"/>
  </svg>
);

const IconBookmark = ({ className = 'w-4 h-4' }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor">
    <path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

const IconSend = ({ className = 'w-4 h-4' }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor">
    <line x1="22" y1="2" x2="11" y2="13" strokeWidth="1.5" strokeLinecap="round"/>
    <polygon points="22 2 15 22 11 13 2 9 22 2" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

const IconMic = ({ className = 'w-4 h-4' }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor">
    <rect x="9" y="2" width="6" height="11" rx="3" strokeWidth="1.5"/>
    <path d="M5 10a7 7 0 0014 0" strokeWidth="1.5" strokeLinecap="round"/>
    <line x1="12" y1="19" x2="12" y2="23" strokeWidth="1.5" strokeLinecap="round"/>
    <line x1="8" y1="23" x2="16" y2="23" strokeWidth="1.5" strokeLinecap="round"/>
  </svg>
);

const IconTrophy = ({ className = 'w-4 h-4' }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor">
    <path d="M6 9H4a2 2 0 000 4h2" strokeWidth="1.5" strokeLinecap="round"/>
    <path d="M18 9h2a2 2 0 010 4h-2" strokeWidth="1.5" strokeLinecap="round"/>
    <path d="M6 3h12v9a6 6 0 01-12 0V3z" strokeWidth="1.5"/>
    <line x1="12" y1="18" x2="12" y2="22" strokeWidth="1.5" strokeLinecap="round"/>
    <line x1="8" y1="22" x2="16" y2="22" strokeWidth="1.5" strokeLinecap="round"/>
  </svg>
);

const IconRefresh = ({ className = 'w-4 h-4' }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor">
    <polyline points="23 4 23 10 17 10" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M20.49 15a9 9 0 11-2.12-9.36L23 10" strokeWidth="1.5" strokeLinecap="round"/>
  </svg>
);

const IconSearch = ({ className = 'w-4 h-4' }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor">
    <circle cx="11" cy="11" r="8" strokeWidth="1.5"/>
    <path d="M21 21l-4.35-4.35" strokeWidth="1.5" strokeLinecap="round"/>
  </svg>
);

const IconBarChart = ({ className = 'w-4 h-4' }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor">
    <line x1="18" y1="20" x2="18" y2="10" strokeWidth="1.5" strokeLinecap="round"/>
    <line x1="12" y1="20" x2="12" y2="4" strokeWidth="1.5" strokeLinecap="round"/>
    <line x1="6" y1="20" x2="6" y2="14" strokeWidth="1.5" strokeLinecap="round"/>
  </svg>
);

// ── Goal widget ───────────────────────────────────────────────────────────────

const GOAL_PRESETS: Record<GoalType, number[]> = {
  applications: [5, 10, 20],
  interviews:   [2, 5, 10],
};

const CONFETTI_COLORS = ['#FF6B6B','#4ECDC4','#45B7D1','#96CEB4','#FFEAA7','#DDA0DD','#F7DC6F','#BB8FCE','#F1948A','#98D8C8'];
const CONFETTI_PIECES = Array.from({ length: 30 }, (_, i) => ({
  color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
  left: `${3 + (i / 30) * 94}%`,
  size: 6 + (i % 3) * 4,
  round: i % 3 !== 0,
  delay: `${(i * 0.07).toFixed(2)}s`,
  duration: `${1.4 + (i % 5) * 0.2}s`,
}));

const GoalWidget = ({ stats }: { stats: DashboardStats }) => {
  const { goal, setGoal, clearGoal } = useGoalStore();
  const { t } = useLanguage();
  const [setting, setSetting] = useState(false);
  const [type, setType]       = useState<GoalType>('applications');
  const [target, setTarget]   = useState(10);
  const [showConfetti, setShowConfetti] = useState(false);
  const confettiFired = useRef(false);

  const current = goal?.type === 'applications' ? stats.applied : stats.interviewing;
  const pct     = goal ? Math.min(Math.round((current / goal.target) * 100), 100) : 0;
  const done    = goal ? current >= goal.target : false;

  useEffect(() => {
    if (done && !confettiFired.current) {
      confettiFired.current = true;
      setShowConfetti(true);
      setTimeout(() => setShowConfetti(false), 2800);
    }
    if (!done) confettiFired.current = false;
  }, [done]);

  if (!goal && !setting) {
    return (
      <div
        className="flex items-center gap-4 border border-dashed border-[#c1cbd5] rounded p-4 hover:border-[#16a34a] transition-colors cursor-pointer group"
        onClick={() => setSetting(true)}
      >
        <IconTarget className="w-5 h-5 text-[#6f839c]" />
        <div className="flex-1">
          <p className="text-[14px] font-bold text-[#223a5a] group-hover:text-[#0a1a25]">{t('setAGoal')}</p>
          <p className="text-[12px] text-[#6f839c]">{t('stayMotivated')}</p>
        </div>
        <span className="text-[12px] font-bold text-[#6f839c] group-hover:text-[#16a34a] transition-colors">{t('setArrow')}</span>
      </div>
    );
  }

  if (setting) {
    return (
      <div className="animate-scale-in">
        <p className="text-[14px] font-bold text-[#223a5a] mb-3">{t('whatsYourGoal')}</p>
        <div className="flex gap-2 mb-3">
          {(['applications', 'interviews'] as const).map(tp => (
            <button key={tp} onClick={() => { setType(tp); setTarget(GOAL_PRESETS[tp][1]); }}
              className={`px-3 py-1.5 text-[12px] font-bold rounded border transition active:scale-95 ${
                type === tp ? 'bg-[#0a1a25] text-white border-[#0a1a25]' : 'bg-white text-[#6f839c] border-[#dfe3eb] hover:border-[#c1cbd5]'
              }`}
            >
              {tp === 'applications' ? t('applicationsSentGoal') : t('interviewsReachedGoal')}
            </button>
          ))}
        </div>
        <div className="flex gap-2 mb-4 items-center">
          {GOAL_PRESETS[type].map(n => (
            <button key={n} onClick={() => setTarget(n)}
              className={`px-4 py-2 text-[13px] font-bold rounded border transition active:scale-95 ${
                target === n ? 'bg-[#16a34a] text-white border-[#16a34a]' : 'bg-white text-[#6f839c] border-[#dfe3eb] hover:border-[#c1cbd5]'
              }`}
            >
              {n}
            </button>
          ))}
          <input type="number" min={1} value={target}
            onChange={e => setTarget(Math.max(1, parseInt(e.target.value) || 1))}
            className="w-16 px-2 py-2 text-[13px] text-center border border-[#dfe3eb] rounded focus-visible:ring-2 focus-visible:ring-green-500 outline-none"
          />
        </div>
        <div className="flex gap-2">
          <button onClick={() => { setGoal({ type, target }); setSetting(false); }}
            className="flex-1 py-2 bg-[#16a34a] hover:bg-green-700 text-white text-[13px] font-bold rounded transition active:scale-95"
          >
            {t('saveGoal')}
          </button>
          <button onClick={() => setSetting(false)}
            className="px-4 py-2 border border-[#dfe3eb] text-[#6f839c] text-[13px] rounded hover:bg-[#f4f6fa] transition"
          >
            {t('cancel')}
          </button>
        </div>
      </div>
    );
  }

  const barColor  = done ? 'bg-green-500' : pct >= 60 ? 'bg-blue-500' : 'bg-orange-400';
  const messageKey = done ? 'goalReached' : pct >= 60 ? 'almostThere' : 'everyApplicationCounts';

  return (
    <>
      {showConfetti && (
        <div className="fixed inset-0 pointer-events-none z-[150] overflow-hidden">
          {CONFETTI_PIECES.map((p, i) => (
            <div key={i} style={{
              position: 'absolute', left: p.left, top: '8%',
              width: p.size, height: p.size,
              borderRadius: p.round ? '50%' : '3px',
              backgroundColor: p.color,
              animation: `confetti-fall ${p.duration} ease-in forwards`,
              animationDelay: p.delay,
            }} />
          ))}
        </div>
      )}
      <div className="animate-fade-in">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <IconTarget className="w-4 h-4 text-[#6f839c]" />
            <span className="text-[14px] font-bold text-[#223a5a]">
              {goal!.type === 'applications' ? t('applicationsGoal') : t('interviewsGoal')}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-[15px] font-black text-[#0a1a25] tabular-nums">{current} / {goal!.target}</span>
            <button onClick={() => clearGoal()} className="text-[11px] text-[#c1cbd5] hover:text-[#6f839c] transition" title={t('clearGoal')}>✕</button>
          </div>
        </div>
        <div className="h-1.5 bg-[#f4f6fa] rounded-full overflow-hidden mb-2">
          <div className={`h-full rounded-full transition-all duration-700 ${barColor}`} style={{ width: `${pct}%` }} />
        </div>
        <div className="flex items-center justify-between">
          <p className="text-[12px] text-[#6f839c]">{t(messageKey)}</p>
          <button onClick={() => { setSetting(true); setType(goal!.type); setTarget(goal!.target); }}
            className="text-[11px] text-[#c1cbd5] hover:text-[#6f839c] transition ml-3 shrink-0"
          >
            {t('edit')}
          </button>
        </div>
      </div>
    </>
  );
};

// ── Mini calendar ─────────────────────────────────────────────────────────────

const WEEKDAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];

const EVENT_TYPE_META: Record<CalendarEventType, { label: string; dot: string; dotSel: string }> = {
  interview: { label: 'Interview',  dot: 'bg-purple-500', dotSel: 'bg-purple-300' },
  followup:  { label: 'Follow-up',  dot: 'bg-amber-500',  dotSel: 'bg-amber-300'  },
  deadline:  { label: 'Deadline',   dot: 'bg-red-500',    dotSel: 'bg-red-300'    },
  note:      { label: 'Note',       dot: 'bg-blue-400',   dotSel: 'bg-blue-200'   },
};

const MiniCalendar = ({ upcomingInterviews, followUps }: { upcomingInterviews: Job[]; followUps: FollowUpAlert[] }) => {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const { events: customEvents, addEvent, removeEvent } = useCalendarStore();
  const { addReminder } = useReminderStore();
  const today = new Date();
  const [viewDate, setViewDate]   = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [showForm, setShowForm]   = useState(false);
  const [formTitle, setFormTitle] = useState('');
  const [formType, setFormType]   = useState<CalendarEventType>('interview');
  const [formTime, setFormTime]   = useState('');
  const [formRemind, setFormRemind] = useState(true);

  const year  = viewDate.getFullYear();
  const month = viewDate.getMonth();

  const toKey = (y: number, m: number, d: number) =>
    `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

  const todayKey = toKey(today.getFullYear(), today.getMonth(), today.getDate());

  const interviewMap = new Map<string, Job[]>();
  upcomingInterviews.forEach(j => {
    const k = j.interview_date!.slice(0, 10);
    interviewMap.set(k, [...(interviewMap.get(k) || []), j]);
  });
  const followUpMap = new Map<string, FollowUpAlert[]>();
  followUps.forEach(f => {
    const k = f.follow_up_date.slice(0, 10);
    followUpMap.set(k, [...(followUpMap.get(k) || []), f]);
  });
  const customMap = new Map<string, typeof customEvents>();
  customEvents.forEach(e => {
    customMap.set(e.date, [...(customMap.get(e.date) || []), e]);
  });

  const firstDow  = new Date(year, month, 1).getDay();
  const blanks    = firstDow === 0 ? 6 : firstDow - 1;
  const totalDays = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = [
    ...Array(blanks).fill(null),
    ...Array.from({ length: totalDays }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const monthLabel = new Date(year, month, 1).toLocaleString(undefined, { month: 'long', year: 'numeric' });

  const selInterviews = selectedDay ? (interviewMap.get(selectedDay) || []) : [];
  const selFollowUps  = selectedDay ? (followUpMap.get(selectedDay) || []) : [];
  const selCustom     = selectedDay ? (customMap.get(selectedDay) || []) : [];

  const handleSelectDay = (key: string) => {
    setSelectedDay(key === selectedDay ? null : key);
    setShowForm(false);
  };

  const handleAddEvent = () => {
    if (!formTitle.trim() || !selectedDay) return;
    addEvent({ date: selectedDay, title: formTitle.trim(), type: formType, time: formTime || undefined });
    if (formRemind && formTime) {
      const rid = addReminder({
        title: formTitle.trim(),
        date: selectedDay,
        time: formTime,
        type: formType === 'followup' ? 'followup' : formType === 'deadline' ? 'deadline' : formType === 'note' ? 'custom' : 'interview',
      });
      scheduleReminder({ id: rid, title: formTitle.trim(), date: selectedDay, time: formTime, type: formType === 'followup' ? 'followup' : formType === 'deadline' ? 'deadline' : formType === 'note' ? 'custom' : 'interview', completed: false }).catch(() => {});
    }
    setFormTitle('');
    setFormTime('');
    setFormRemind(true);
    setShowForm(false);
  };

  const formatSelectedDay = (key: string) =>
    new Date(key + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });

  return (
    <div className="animate-fade-in">
      {/* Month nav */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-1">
          <button onClick={() => setViewDate(new Date(year, month - 1, 1))}
            className="w-7 h-7 flex items-center justify-center rounded hover:bg-[#f4f6fa] text-[#6f839c] transition text-base leading-none border border-[#dfe3eb]"
          >‹</button>
          <span className="text-[13px] font-bold text-[#223a5a] px-2 min-w-[140px] text-center capitalize">{monthLabel}</span>
          <button onClick={() => setViewDate(new Date(year, month + 1, 1))}
            className="w-7 h-7 flex items-center justify-center rounded hover:bg-[#f4f6fa] text-[#6f839c] transition text-base leading-none border border-[#dfe3eb]"
          >›</button>
        </div>
      </div>

      <div className="grid grid-cols-7 mb-1">
        {WEEKDAYS.map(d => (
          <div key={d} className="text-center text-[11px] font-bold text-[#6f839c] uppercase tracking-wide py-1">{d}</div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-y-0.5">
        {cells.map((day, idx) => {
          if (day === null) return <div key={idx} />;
          const key          = toKey(year, month, day);
          const isToday      = key === todayKey;
          const isSelected   = key === selectedDay;
          const hasInterview = interviewMap.has(key);
          const hasFollowUp  = followUpMap.has(key);
          const hasCustom    = customMap.has(key);

          return (
            <button key={idx} onClick={() => handleSelectDay(key)}
              className={`relative flex flex-col items-center justify-center py-1.5 rounded transition-all active:scale-95 ${
                isSelected ? 'bg-[#0a1a25] text-white'
                  : isToday ? 'bg-[#dcfce7] text-[#16a34a] font-black ring-2 ring-[#16a34a]'
                  : 'hover:bg-[#f4f6fa] text-[#223a5a]'
              }`}
            >
              <span className="text-[12px] font-medium leading-none mb-0.5">{day}</span>
              {(hasInterview || hasFollowUp || hasCustom) && (
                <div className="flex gap-0.5 mt-0.5 flex-wrap justify-center max-w-[24px]">
                  {hasInterview && <span className={`w-1 h-1 rounded-full ${isSelected ? 'bg-purple-300' : 'bg-purple-500'}`} />}
                  {hasFollowUp  && <span className={`w-1 h-1 rounded-full ${isSelected ? 'bg-amber-300'  : 'bg-amber-500'}`} />}
                  {hasCustom && customMap.get(key)!.slice(0, 2).map(e => (
                    <span key={e.id} className={`w-1 h-1 rounded-full ${isSelected ? EVENT_TYPE_META[e.type].dotSel : EVENT_TYPE_META[e.type].dot}`} />
                  ))}
                </div>
              )}
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap gap-3 mt-3 pt-3 border-t border-[#dfe3eb]">
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-purple-500 shrink-0" />
          <span className="text-[11px] text-[#6f839c]">{t('calendarInterview')}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0" />
          <span className="text-[11px] text-[#6f839c]">{t('calendarFollowUp')}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-blue-400 shrink-0" />
          <span className="text-[11px] text-[#6f839c]">Custom</span>
        </div>
      </div>

      {selectedDay && (
        <div className="mt-3 pt-3 border-t border-[#dfe3eb] animate-fade-in">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[12px] font-bold text-[#223a5a]">{formatSelectedDay(selectedDay)}</p>
            <button
              onClick={() => { setShowForm(f => !f); setFormTitle(''); setFormTime(''); }}
              className="flex items-center gap-1 px-2 py-1 text-[11px] font-bold text-[#16a34a] bg-[#dcfce7] hover:bg-green-100 border border-green-200 rounded transition active:scale-95"
            >
              + Add event
            </button>
          </div>

          {showForm && (
            <div className="mb-3 p-3 bg-[#f4f6fa] rounded border border-[#dfe3eb] space-y-2 animate-fade-in">
              <input type="text" placeholder="Event title..." value={formTitle}
                onChange={e => setFormTitle(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleAddEvent()}
                autoFocus
                className="w-full px-3 py-2 text-[13px] border border-[#dfe3eb] rounded focus-visible:ring-2 focus-visible:ring-green-500 outline-none bg-white"
              />
              <div className="flex gap-2">
                <select value={formType} onChange={e => setFormType(e.target.value as CalendarEventType)}
                  className="flex-1 px-2 py-1.5 text-[12px] border border-[#dfe3eb] rounded focus-visible:ring-2 focus-visible:ring-green-500 outline-none bg-white text-[#223a5a]"
                >
                  {(Object.entries(EVENT_TYPE_META) as [CalendarEventType, { label: string }][]).map(([k, v]) => (
                    <option key={k} value={k}>{v.label}</option>
                  ))}
                </select>
                <input type="time" value={formTime} onChange={e => setFormTime(e.target.value)}
                  className="px-2 py-1.5 text-[12px] border border-[#dfe3eb] rounded focus-visible:ring-2 focus-visible:ring-green-500 outline-none bg-white text-[#223a5a]"
                />
              </div>
              {formTime && (
                <button
                  type="button"
                  onClick={() => setFormRemind(v => !v)}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded border transition text-[12px] font-bold ${
                    formRemind ? 'bg-[#dcfce7] border-green-200 text-[#16a34a]' : 'bg-white border-[#dfe3eb] text-[#6f839c]'
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                    </svg>
                    Remind me at this time
                  </span>
                  <div className={`w-8 h-4 rounded-full transition-colors ${formRemind ? 'bg-[#16a34a]' : 'bg-[#dfe3eb]'}`}>
                    <div className={`w-4 h-4 rounded-full bg-white shadow transition-transform ${formRemind ? 'translate-x-4' : 'translate-x-0'}`} />
                  </div>
                </button>
              )}
              <div className="flex gap-2">
                <button onClick={handleAddEvent} disabled={!formTitle.trim()}
                  className="flex-1 py-1.5 text-[12px] font-bold bg-[#16a34a] hover:bg-green-700 disabled:opacity-40 text-white rounded transition"
                >
                  Save
                </button>
                <button onClick={() => setShowForm(false)}
                  className="px-3 py-1.5 text-[12px] text-[#6f839c] border border-[#dfe3eb] rounded hover:bg-[#f4f6fa] transition"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            {selInterviews.map(j => (
              <div key={j.id} onClick={() => navigate(`/jobs/${j.id}`)} className="flex items-center gap-2 text-[12px] cursor-pointer hover:opacity-70 transition group">
                <span className="w-2 h-2 rounded-full bg-purple-500 shrink-0" />
                <span className="text-[#223a5a] font-bold truncate flex-1">{j.title} · {j.company}</span>
                <span className="text-[#6f839c] text-[11px] shrink-0">Interview</span>
              </div>
            ))}
            {selFollowUps.map(f => (
              <div key={f.id} onClick={() => navigate(`/jobs/${f.id}`)} className="flex items-center gap-2 text-[12px] cursor-pointer hover:opacity-70 transition">
                <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0" />
                <span className="text-[#223a5a] font-bold truncate flex-1">{f.title} · {f.company}</span>
                <span className="text-[#6f839c] text-[11px] shrink-0">Follow-up</span>
              </div>
            ))}
            {selCustom.map(e => (
              <div key={e.id} className="flex items-center gap-2 text-[12px] group">
                <span className={`w-2 h-2 rounded-full shrink-0 ${EVENT_TYPE_META[e.type].dot}`} />
                <span className="text-[#223a5a] font-bold truncate flex-1">
                  {e.time && <span className="text-[#6f839c] mr-1">{e.time}</span>}
                  {e.title}
                </span>
                <span className="text-[#6f839c] text-[11px] shrink-0">{EVENT_TYPE_META[e.type].label}</span>
                <button onClick={() => removeEvent(e.id)}
                  className="ml-1 text-[#c1cbd5] hover:text-red-500 transition opacity-0 group-hover:opacity-100 shrink-0"
                  title="Delete event"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>
            ))}
            {selInterviews.length === 0 && selFollowUps.length === 0 && selCustom.length === 0 && (
              <p className="text-[12px] text-[#6f839c] text-center py-1">{t('noEventsDay')}</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

// ── Animated number counter ───────────────────────────────────────────────────

const AnimatedNumber = ({ value }: { value: number }) => {
  const [display, setDisplay] = useState(0);
  useEffect(() => {
    if (!value) { setDisplay(0); return; }
    let frame = 0;
    const frames = 40;
    const id = setInterval(() => {
      frame++;
      const p = 1 - Math.pow(1 - frame / frames, 3);
      setDisplay(Math.round(p * value));
      if (frame >= frames) { setDisplay(value); clearInterval(id); }
    }, 16);
    return () => clearInterval(id);
  }, [value]);
  return <>{display.toLocaleString()}</>;
};

// ── Dawn Module wrapper ───────────────────────────────────────────────────────

const Module = ({
  title, action, children, editMode, onHide, onMoveUp, onMoveDown, noPad = false, className = '',
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  editMode?: boolean;
  onHide?: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  noPad?: boolean;
  className?: string;
}) => (
  <div className={`bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm ${className}`}>
    <div className="flex items-center justify-between px-5 border-b border-gray-100" style={{ minHeight: 52 }}>
      <h3 className="text-[11px] font-black text-gray-400 uppercase tracking-widest">{title}</h3>
      <div className="flex items-center gap-1.5">
        {action}
        {editMode && onMoveUp && (
          <button onClick={onMoveUp} className="text-[13px] text-gray-400 hover:text-[#0a1a25] border border-gray-200 hover:border-gray-300 rounded-lg px-1.5 py-0.5 leading-none transition">↑</button>
        )}
        {editMode && onMoveDown && (
          <button onClick={onMoveDown} className="text-[13px] text-gray-400 hover:text-[#0a1a25] border border-gray-200 hover:border-gray-300 rounded-lg px-1.5 py-0.5 leading-none transition">↓</button>
        )}
        {editMode && onHide && (
          <button
            onClick={onHide}
            className="text-[11px] font-bold text-gray-400 hover:text-red-500 border border-gray-200 hover:border-red-300 rounded-lg px-2 py-0.5 transition"
          >
            Hide
          </button>
        )}
      </div>
    </div>
    <div className={noPad ? '' : 'px-5 py-5'}>
      {children}
    </div>
  </div>
);

// ── Stat card ─────────────────────────────────────────────────────────────────

const StatCard = ({ label, value, sub, color, onClick, icon, accent }: {
  label: string; value: number; sub?: string; color?: string; onClick?: () => void;
  icon?: React.ReactNode; accent?: string;
}) => (
  <button
    onClick={onClick}
    className={`${accent || 'bg-white'} border border-gray-200 rounded-2xl p-4 text-left w-full hover:shadow-md transition-all active:scale-[0.98] shadow-sm group hover:border-gray-300`}
  >
    <div className="flex items-center justify-between mb-3">
      <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 truncate">{label}</p>
      {icon && <span className="opacity-40 group-hover:opacity-70 transition-opacity">{icon}</span>}
    </div>
    <p className={`text-[34px] font-black leading-none tabular-nums ${color || 'text-[#0a1a25]'}`}>
      <AnimatedNumber value={value} />
    </p>
    {sub && <p className="text-[11px] text-gray-400 mt-2 font-medium">{sub}</p>}
  </button>
);

// ── Today focus ───────────────────────────────────────────────────────────────

const TodayAction = ({
  label,
  value,
  detail,
  tone,
  onClick,
}: {
  label: string;
  value: number;
  detail: string;
  tone: 'green' | 'amber' | 'purple' | 'blue';
  onClick: () => void;
}) => {
  const toneClasses = {
    green: 'bg-green-50 text-green-700 border-green-200',
    amber: 'bg-amber-50 text-amber-700 border-amber-200',
    purple: 'bg-purple-50 text-purple-700 border-purple-200',
    blue: 'bg-blue-50 text-blue-700 border-blue-200',
  };

  return (
    <button
      onClick={onClick}
      className="bg-white border border-gray-200 rounded-2xl p-4 text-left hover:border-gray-300 hover:shadow-md transition active:scale-[0.99]"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[13px] font-black text-[#0a1a25]">{label}</p>
          <p className="text-[12px] text-gray-400 mt-1 leading-snug">{detail}</p>
        </div>
        <span className={`min-w-9 h-9 px-2 rounded-xl border flex items-center justify-center text-[18px] font-black tabular-nums ${toneClasses[tone]}`}>
          {value}
        </span>
      </div>
    </button>
  );
};

const TodayFocus = ({
  stats,
  followUps,
  upcomingInterviews,
  onReviewJobs,
  onFollowUps,
  onInterviews,
  onTracker,
  onHotPicks,
}: {
  stats: DashboardStats;
  followUps: FollowUpAlert[];
  upcomingInterviews: Job[];
  onReviewJobs: () => void;
  onFollowUps: () => void;
  onInterviews: () => void;
  onTracker: () => void;
  onHotPicks: () => void;
}) => {
  const { t } = useLanguage();
  const trackerCount = (stats.saved || 0) + (stats.preparing || 0);
  const hasFocus = (stats.new || 0) > 0 || followUps.length > 0 || upcomingInterviews.length > 0 || trackerCount > 0;

  return (
    <section className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden mb-5">
      <div className="px-5 py-5 border-b border-gray-100 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <p className="text-[11px] font-black text-gray-400 uppercase tracking-widest">{t('todayLabel')}</p>
          <h2 className="text-[24px] font-black text-[#0a1a25] leading-tight mt-1">{t('attentionTitle')}</h2>
          <p className="text-[13px] text-[#6f839c] mt-1">{t('attentionSubtitle')}</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={onHotPicks}
            className="px-4 py-2 rounded-lg border border-gray-200 text-[13px] font-black text-[#0a1a25] hover:border-green-300 hover:text-[#16a34a] transition"
          >
            {t('hotPicks')}
          </button>
          <button
            onClick={onTracker}
            className="px-4 py-2 rounded-lg bg-[#0a1a25] text-white text-[13px] font-black hover:bg-[#223a5a] transition"
          >
            {t('openTracker')}
          </button>
        </div>
      </div>

      {hasFocus ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 p-4">
          <TodayAction
            label={t('reviewJobs')}
            value={stats.new || 0}
            detail={stats.new_today ? `${stats.new_today} ${t('newToday')}` : t('clearUnreviewed')}
            tone="green"
            onClick={onReviewJobs}
          />
          <TodayAction
            label={t('sendFollowUps')}
            value={followUps.length}
            detail={followUps.length ? t('followUpsWaiting') : t('noFollowUpsDue')}
            tone="amber"
            onClick={onFollowUps}
          />
          <TodayAction
            label={t('prepareInterviews')}
            value={upcomingInterviews.length}
            detail={upcomingInterviews.length ? t('interviewsToPrepare') : t('noInterviewsScheduled')}
            tone="purple"
            onClick={onInterviews}
          />
          <TodayAction
            label={t('continueApplications')}
            value={trackerCount}
            detail={t('savedPreparingJobs')}
            tone="blue"
            onClick={onTracker}
          />
        </div>
      ) : (
        <div className="p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <p className="text-[15px] font-black text-[#0a1a25]">{t('clearForNow')}</p>
            <p className="text-[13px] text-[#6f839c] mt-1">{t('reviewOrSwipe')}</p>
          </div>
          <div className="flex gap-2">
            <button onClick={onReviewJobs} className="px-4 py-2 bg-[#16a34a] hover:bg-green-700 text-white text-[13px] font-black rounded-lg transition">{t('browseJobs')}</button>
            <button onClick={onHotPicks} className="px-4 py-2 border border-gray-200 hover:border-gray-300 text-[#0a1a25] text-[13px] font-black rounded-lg transition">{t('hotPicks')}</button>
          </div>
        </div>
      )}
    </section>
  );
};

// ── Widget visibility ─────────────────────────────────────────────────────────

const WIDGET_KEYS = ['news', 'stories', 'newJobs', 'followUps', 'interviews', 'applications', 'quickActions', 'goal', 'calendar', 'pipeline', 'weeklyActivity'] as const;
type WidgetKey = typeof WIDGET_KEYS[number];

const WIDGET_LABELS: Record<WidgetKey, string> = {
  news: 'News Feed',
  stories: 'New Jobs Feed',
  newJobs: 'New Jobs Banner',
  followUps: 'Follow-up Reminders',
  interviews: 'Upcoming Interviews',
  applications: 'Application Board',
  quickActions: 'Quick Actions',
  goal: 'Goal Tracker',
  calendar: 'Calendar',
  pipeline: 'Pipeline Funnel',
  weeklyActivity: 'Weekly Activity',
};

function useWidgetVisibility() {
  const [visible, setVisible] = useState<Record<WidgetKey, boolean>>(() => {
    try {
      const stored = localStorage.getItem('dashboard_widgets_v2');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          return { ...Object.fromEntries(WIDGET_KEYS.map(k => [k, true])), ...parsed };
        }
      }
    } catch {}
    return Object.fromEntries(WIDGET_KEYS.map(k => [k, true])) as Record<WidgetKey, boolean>;
  });
  const toggle = (key: WidgetKey) => setVisible(v => {
    const next = { ...v, [key]: !v[key] };
    localStorage.setItem('dashboard_widgets_v2', JSON.stringify(next));
    return next;
  });
  return { visible, toggle };
}

const LEFT_WIDGET_KEYS = ['news', 'newJobs', 'stories', 'followUps', 'interviews', 'applications', 'pipeline', 'weeklyActivity'] as const;
type LeftWidgetKey = typeof LEFT_WIDGET_KEYS[number];

function useWidgetOrder() {
  const [order, setOrder] = useState<LeftWidgetKey[]>(() => {
    try {
      const stored = localStorage.getItem('dashboard_widget_order_v1');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (!Array.isArray(parsed)) return [...LEFT_WIDGET_KEYS];
        const missing = LEFT_WIDGET_KEYS.filter(k => !parsed.includes(k));
        return [...parsed.filter((k): k is LeftWidgetKey => LEFT_WIDGET_KEYS.includes(k as LeftWidgetKey)), ...missing];
      }
    } catch {}
    return [...LEFT_WIDGET_KEYS];
  });
  const move = (key: LeftWidgetKey, dir: -1 | 1) => {
    setOrder(prev => {
      const idx = prev.indexOf(key);
      const newIdx = idx + dir;
      if (newIdx < 0 || newIdx >= prev.length) return prev;
      const next = [...prev];
      [next[idx], next[newIdx]] = [next[newIdx], next[idx]];
      localStorage.setItem('dashboard_widget_order_v1', JSON.stringify(next));
      return next;
    });
  };
  const reorder = (fromKey: LeftWidgetKey, toKey: LeftWidgetKey) => {
    setOrder(prev => {
      const next = [...prev];
      const fromIdx = next.indexOf(fromKey);
      const toIdx = next.indexOf(toKey);
      next.splice(fromIdx, 1);
      next.splice(toIdx, 0, fromKey);
      localStorage.setItem('dashboard_widget_order_v1', JSON.stringify(next));
      return next;
    });
  };
  return { order, move, reorder };
}

// ── Job Stories ───────────────────────────────────────────────────────────────

const STORY_COLORS = [
  'from-green-400 to-emerald-600',
  'from-blue-400 to-indigo-600',
  'from-orange-400 to-red-500',
  'from-purple-400 to-pink-600',
  'from-teal-400 to-cyan-600',
  'from-amber-400 to-orange-500',
  'from-rose-400 to-pink-600',
  'from-violet-400 to-purple-600',
];

const JobStories = ({ jobs, onJobClick }: { jobs: Job[]; onJobClick: (id: number) => void }) => {
  const [seenIds, setSeenIds] = useState<Set<number>>(new Set());

  if (jobs.length === 0) return null;

  const handleClick = (id: number) => {
    setSeenIds(prev => new Set([...prev, id]));
    onJobClick(id);
  };

  return (
    <div className="flex gap-3.5 overflow-x-auto pb-2 -mx-[18px] px-[18px] scrollbar-hide">
      {jobs.map((job, i) => {
        const seen = seenIds.has(job.id);
        const gradient = STORY_COLORS[i % STORY_COLORS.length];
        const initials = (job.company || '?')
          .split(' ')
          .slice(0, 2)
          .map(w => w[0]?.toUpperCase() || '')
          .join('');

        return (
          <button
            key={job.id}
            onClick={() => handleClick(job.id)}
            className="flex flex-col items-center gap-1.5 shrink-0 active:scale-95 transition group"
          >
            <div className={`p-[2.5px] rounded-full ${seen ? 'bg-[#dfe3eb]' : `bg-gradient-to-br ${gradient}`}`}>
              <div className="w-14 h-14 rounded-full bg-white p-[2px]">
                <div className={`w-full h-full rounded-full bg-gradient-to-br ${gradient} flex items-center justify-center`}>
                  <span className="text-white font-black text-sm leading-none">{initials}</span>
                </div>
              </div>
            </div>
            <span className={`text-[10px] font-bold text-center leading-tight max-w-[64px] line-clamp-2 ${seen ? 'text-[#c1cbd5]' : 'text-[#223a5a]'}`}>
              {job.company}
            </span>
          </button>
        );
      })}
    </div>
  );
};

// ── Application board ─────────────────────────────────────────────────────────

type BoardStatus = 'saved' | 'preparing' | 'applied' | 'followup' | 'interviewing' | 'offered';

const STATUS_CONFIG: Record<BoardStatus, {
  label: string;
  bg: string;
  text: string;
  dot: string;
  leftBorder: string;
}> = {
  saved:        { label: 'Saved',        bg: 'bg-amber-50',   text: 'text-amber-700',  dot: 'bg-amber-400',  leftBorder: '#d97706' },
  preparing:    { label: 'Preparing',    bg: 'bg-blue-50',    text: 'text-blue-700',   dot: 'bg-blue-500',   leftBorder: '#2563eb' },
  applied:      { label: 'Applied',      bg: 'bg-green-50',   text: 'text-green-700',  dot: 'bg-green-500',  leftBorder: '#16a34a' },
  followup:     { label: 'Follow-up',    bg: 'bg-orange-50',  text: 'text-orange-700', dot: 'bg-orange-500', leftBorder: '#ea580c' },
  interviewing: { label: 'Interviewing', bg: 'bg-purple-50',  text: 'text-purple-700', dot: 'bg-purple-500', leftBorder: '#7c3aed' },
  offered:      { label: 'Offered',      bg: 'bg-emerald-50', text: 'text-emerald-700',dot: 'bg-emerald-500',leftBorder: '#059669' },
};

const JobCard = ({ job, status, onClick, locale }: { job: Job; status: BoardStatus; onClick: () => void; locale: string }) => {
  const cfg = STATUS_CONFIG[status];
  const dateStr = job.applied_date
    ? new Date(job.applied_date).toLocaleDateString(locale, { day: '2-digit', month: '2-digit' })
    : new Date(job.created_at).toLocaleDateString(locale, { day: '2-digit', month: '2-digit' });

  return (
    <div
      onClick={onClick}
      className="flex items-center gap-3 px-[18px] py-3 cursor-pointer hover:bg-[#f4f6fa] transition-all group border-l-[3px]"
      style={{ borderLeftColor: cfg.leftBorder }}
    >
      <div className="flex-1 min-w-0">
        <p className="text-[14px] font-bold text-[#0a1a25] truncate leading-snug">{job.title}</p>
        <p className="text-[12px] text-[#6f839c] truncate mt-0.5">{job.company}{job.location ? ` · ${job.location}` : ''}</p>
      </div>
      <div className="flex flex-col items-end shrink-0 gap-1">
        <span className={`text-[11px] font-black px-2 py-0.5 rounded-full ${cfg.bg} ${cfg.text}`}>{cfg.label}</span>
        <span className="text-[11px] text-[#c1cbd5]">{dateStr}</span>
      </div>
    </div>
  );
};

const ApplicationBoard = ({
  stats,
  boardJobs,
  onJobClick,
  locale,
}: {
  stats: DashboardStats;
  boardJobs: Record<BoardStatus, Job[]>;
  onJobClick: (id: number) => void;
  locale: string;
}) => {
  const statuses: BoardStatus[] = ['saved', 'preparing', 'applied', 'followup', 'interviewing', 'offered'];
  const counts: Record<BoardStatus, number> = {
    saved:        stats.saved || 0,
    preparing:    stats.preparing || 0,
    applied:      stats.applied || 0,
    followup:     stats.followup || 0,
    interviewing: stats.interviewing || 0,
    offered:      stats.offered || 0,
  };

  const total = statuses.reduce((s, k) => s + counts[k], 0);
  const recentJobs = statuses
    .flatMap(s => (boardJobs[s] || []).map(j => ({ job: j, status: s })))
    .slice(0, 6);

  return (
    <div>
      {/* Pipeline strip */}
      <div className="grid grid-cols-3 sm:grid-cols-6 border-b border-gray-100">
        {statuses.map((status, i) => {
          const count = counts[status];
          const active = count > 0;
          return (
            <div
              key={status}
              className={`flex flex-col items-center py-4 ${i < statuses.length - 1 ? 'border-r border-gray-100' : ''}`}
            >
              <span className={`text-[28px] font-black tabular-nums leading-none ${active ? 'text-[#0a1a25]' : 'text-[#c1cbd5]'}`}>
                {count}
              </span>
              <span className="text-[10px] font-black text-[#6f839c] uppercase tracking-[0.5px] mt-1">
                {STATUS_CONFIG[status].label}
              </span>
            </div>
          );
        })}
      </div>

      {/* Job list */}
      {total > 0 ? (
        <div className="divide-y divide-gray-100">
          {recentJobs.map(({ job, status }) => (
            <JobCard key={job.id} job={job} status={status} onClick={() => onJobClick(job.id)} locale={locale} />
          ))}
        </div>
      ) : (
        <div className="py-10 text-center px-[18px]">
          <p className="text-[14px] text-[#6f839c]">No applications yet</p>
          <p className="text-[12px] text-[#c1cbd5] mt-1">Save or apply to jobs to see them here</p>
        </div>
      )}
    </div>
  );
};

// ── Pipeline Funnel ───────────────────────────────────────────────────────────

const PipelineFunnel = ({ stats }: { stats: DashboardStats }) => {
  const stages = [
    { label: 'Saved',       value: stats.saved || 0,        color: 'bg-amber-400',  text: 'text-amber-700',  light: 'bg-amber-50' },
    { label: 'Preparing',   value: stats.preparing || 0,    color: 'bg-blue-500',   text: 'text-blue-700',   light: 'bg-blue-50' },
    { label: 'Applied',     value: stats.applied || 0,      color: 'bg-green-500',  text: 'text-green-700',  light: 'bg-green-50' },
    { label: 'Follow-up',   value: stats.followup || 0,     color: 'bg-orange-500', text: 'text-orange-700', light: 'bg-orange-50' },
    { label: 'Interviewing',value: stats.interviewing || 0, color: 'bg-purple-500', text: 'text-purple-700', light: 'bg-purple-50' },
    { label: 'Offered',     value: stats.offered || 0,      color: 'bg-emerald-500',text: 'text-emerald-700',light: 'bg-emerald-50' },
  ];
  const max = Math.max(...stages.map(s => s.value), 1);

  return (
    <div className="space-y-2.5">
      {stages.map((s, i) => {
        const prev = stages[i - 1];
        const convRate = prev && prev.value > 0 ? Math.round((s.value / prev.value) * 100) : null;
        const barW = Math.max(4, Math.round((s.value / max) * 100));
        return (
          <div key={s.label}>
            <div className="flex items-center justify-between mb-1">
              <span className="text-[12px] font-bold text-[#223a5a]">{s.label}</span>
              <div className="flex items-center gap-2">
                {convRate !== null && (
                  <span className={`text-[10px] font-black px-1.5 py-0.5 rounded-full ${s.light} ${s.text}`}>
                    {convRate}% conversion
                  </span>
                )}
                <span className="text-[14px] font-black text-[#0a1a25] tabular-nums w-6 text-right">{s.value}</span>
              </div>
            </div>
            <div className="h-2 bg-[#f4f6fa] rounded-full overflow-hidden">
              <div className={`h-full ${s.color} rounded-full transition-all duration-700`} style={{ width: `${barW}%` }} />
            </div>
          </div>
        );
      })}
      {stages[1].value > 0 && (
        <div className="pt-2 border-t border-[#dfe3eb] flex justify-between text-[11px] text-[#6f839c]">
          <span>Response rate</span>
          <span className="font-black text-[#0a1a25]">
            {Math.round(((stats.interviewing || 0) + (stats.offered || 0)) / Math.max(stats.applied || 1, 1) * 100)}%
          </span>
        </div>
      )}
    </div>
  );
};

// ── Weekly Activity ────────────────────────────────────────────────────────────

const WeeklyActivity = ({ boardJobs }: { boardJobs: Record<string, { applied_date?: string | null; created_at: string }[]> }) => {
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    return d;
  });

  const allJobs = Object.values(boardJobs).flat();
  const counts = days.map(d => {
    const key = d.toISOString().slice(0, 10);
    return allJobs.filter(j => {
      const date = (j.applied_date || j.created_at || '').slice(0, 10);
      return date === key;
    }).length;
  });

  const max = Math.max(...counts, 1);
  const total = counts.reduce((a, b) => a + b, 0);
  const dayLabels = ['Su','Mo','Tu','We','Th','Fr','Sa'];

  return (
    <div>
      <div className="flex items-end gap-1.5 h-16 mb-2">
        {counts.map((c, i) => {
          const h = Math.max(4, Math.round((c / max) * 100));
          const isToday = i === 6;
          return (
            <div key={i} className="flex-1 flex flex-col items-center gap-1">
              <div className={`w-full rounded-sm transition-all duration-500 ${isToday ? 'bg-[#16a34a]' : c > 0 ? 'bg-[#bbf7d0]' : 'bg-[#f4f6fa]'}`} style={{ height: `${h}%` }} />
            </div>
          );
        })}
      </div>
      <div className="flex gap-1.5">
        {days.map((d, i) => (
          <div key={i} className="flex-1 text-center text-[10px] text-[#6f839c] font-bold">{dayLabels[d.getDay()]}</div>
        ))}
      </div>
      <div className="flex justify-between mt-2 pt-2 border-t border-[#dfe3eb]">
        <span className="text-[11px] text-[#6f839c]">This week</span>
        <span className="text-[12px] font-black text-[#0a1a25]">{total} actions</span>
      </div>
    </div>
  );
};

// ── Streak tracker ────────────────────────────────────────────────────────────

function useStreak() {
  const [streak, setStreak] = useState(0);
  useEffect(() => {
    try {
      const raw = localStorage.getItem('afavers_streak');
      const data = raw ? JSON.parse(raw) : null;
      const today = new Date().toISOString().slice(0, 10);
      if (!data) { localStorage.setItem('afavers_streak', JSON.stringify({ date: today, count: 1 })); setStreak(1); return; }
      const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1);
      const yKey = yesterday.toISOString().slice(0, 10);
      if (data.date === today) { setStreak(data.count); }
      else if (data.date === yKey) { const next = { date: today, count: data.count + 1 }; localStorage.setItem('afavers_streak', JSON.stringify(next)); setStreak(next.count); }
      else { localStorage.setItem('afavers_streak', JSON.stringify({ date: today, count: 1 })); setStreak(1); }
    } catch { setStreak(1); }
  }, []);
  return streak;
}

// ── Skeleton ──────────────────────────────────────────────────────────────────

const DashboardSkeleton = () => (
  <div className="bg-[#f4f6fa] min-h-screen" style={{ fontFamily: "'Figtree', system-ui, sans-serif" }}>
    <div className="bg-white border-b border-gray-200 px-6 py-4">
      <div className="h-6 w-48 bg-gray-200 rounded-xl animate-pulse mb-1.5" />
      <div className="h-3.5 w-32 bg-gray-100 rounded-xl animate-pulse" />
    </div>
    <div className="max-w-5xl mx-auto px-6 py-5">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="bg-white border border-gray-200 rounded-2xl p-5">
            <div className="h-3 w-16 bg-gray-200 rounded-lg animate-pulse mb-4" />
            <div className="h-10 w-12 bg-gray-100 rounded-lg animate-pulse" />
          </div>
        ))}
      </div>
      <div className="flex gap-4">
        <div className="flex-1 space-y-4">
          {[...Array(2)].map((_, i) => (
            <div key={i} className="bg-white border border-gray-200 rounded-2xl h-32 animate-pulse" />
          ))}
        </div>
        <div className="lg:w-72 space-y-4">
          <div className="bg-white border border-gray-200 rounded-2xl h-48 animate-pulse" />
        </div>
      </div>
    </div>
  </div>
);

function useGreeting(email: string | undefined) {
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const raw = email?.split('@')[0] ?? '';
  const displayName = raw.charAt(0).toUpperCase() + raw.slice(1);
  const todayFormatted = new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
  return { greeting, displayName, todayFormatted };
}

function formatLastUpdated(value: string | null, locale: string, t: (key: string) => string) {
  if (!value) return t('neverUpdated');

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return t('neverUpdated');

  return `${t('lastUpdated')}: ${new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date)}`;
}

export const DashboardPage = () => {
  const { user, isDemo } = useAuthStore();
  const navigate = useNavigate();
  const { t, lang } = useLanguage();
  const locale = lang === 'de' ? 'de-DE' : 'en-GB';
  const { greeting, displayName, todayFormatted } = useGreeting(user?.email);
  const streak = useStreak();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [followUps, setFollowUps] = useState<FollowUpAlert[]>([]);
  const [upcomingInterviews, setUpcomingInterviews] = useState<Job[]>([]);
  const [boardJobs, setBoardJobs] = useState<Record<BoardStatus, Job[]>>({ saved: [], preparing: [], applied: [], followup: [], interviewing: [], offered: [] });
  const [storyJobs, setStoryJobs] = useState<Job[]>([]);
  const { filterKeywords, filterEnabled, newsOnDashboard } = usePreferencesStore();
  const filteredStoryJobs = storyJobs.filter(j => jobMatchesFilter(j, filterKeywords, filterEnabled));
  const [loading, setLoading] = useState(true);
  const [statsError, setStatsError] = useState<Error | null>(null);
  const [fetching, setFetching] = useState(false);
  const [fetchMsg, setFetchMsg] = useState('');
  const [fetchMsgIsError, setFetchMsgIsError] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const { visible, toggle } = useWidgetVisibility();
  const { order: widgetOrder, move: moveWidget, reorder: reorderWidgets } = useWidgetOrder();
  const [draggedKey, setDraggedKey] = useState<LeftWidgetKey | null>(null);
  const [dragOverKey, setDragOverKey] = useState<LeftWidgetKey | null>(null);

  const hiddenKeys = WIDGET_KEYS.filter(k => !visible[k]);

  useEffect(() => {
    loadStats();
    jobsService.getFollowUps().then(setFollowUps).catch(() => {});
    jobsService.getJobs({ status: 'interviewing', limit: 20 })
      .then(r => {
        const withDate = (r?.jobs ?? [])
          .filter(j => j.interview_date)
          .sort((a, b) => new Date(a.interview_date!).getTime() - new Date(b.interview_date!).getTime());
        setUpcomingInterviews(withDate);
      })
      .catch(() => {});

    jobsService.getJobs({ status: 'new', limit: 10, sortBy: 'created_at', sortOrder: 'DESC' })
      .then(r => setStoryJobs(r?.jobs ?? []))
      .catch(() => {});

    const statuses: BoardStatus[] = ['saved', 'preparing', 'applied', 'followup', 'interviewing', 'offered'];
    Promise.all(
      statuses.map(status => jobsService.getJobs({ status, limit: 4 }).then(r => ({ status, jobs: r.jobs })))
    ).then(results => {
      const map = {} as Record<BoardStatus, Job[]>;
      results.forEach(r => { map[r.status] = r?.jobs ?? []; });
      setBoardJobs(map);
    }).catch(() => {});
  }, []);

  const loadStats = async () => {
    try {
      setLoading(true);
      setStatsError(null);
      const data = await jobsService.getStats();
      setStats(data);
    } catch (error) {
      console.error('Failed to fetch stats:', error);
      setStatsError(error instanceof Error ? error : new Error(String(error)));
    } finally {
      setLoading(false);
    }
  };

  const handleFetchJobs = async () => {
    setFetching(true);
    setFetchMsg('');
    setFetchMsgIsError(false);
    try {
      const result = await jobsService.fetchJobs();
      setFetchMsg(`${result.inserted ?? 0} ${t('fetchComplete')} • ${result.updated ?? 0} ${t('refreshedJobs')}`);
      await loadStats();
    } catch (error) {
      setFetchMsgIsError(true);
      setFetchMsg(error instanceof Error ? error.message : t('fetchFailed'));
    } finally {
      setFetching(false);
    }
  };

  const lastFetchTime = stats?.last_fetch_at ? new Date(stats.last_fetch_at).getTime() : NaN;
  const fetchIsStale = !Number.isNaN(lastFetchTime) && Date.now() - lastFetchTime > 6 * 3_600_000;

  const fetchCard = user?.isAdmin
    ? {
        icon: <IconRefresh className={`w-4 h-4 ${fetching ? 'animate-spin' : ''}`} />,
        iconBg: 'bg-amber-100 text-amber-600',
        label: t('fetchJobs'),
        sub: fetching ? t('fetching') : formatLastUpdated(stats?.last_fetch_at ?? null, locale, t),
        onClick: isDemo ? undefined : handleFetchJobs,
        disabled: fetching || isDemo,
      }
    : {
        icon: <IconRefresh className="w-4 h-4" />,
        iconBg: 'bg-slate-100 text-slate-500',
        label: t('fetchJobs'),
        sub: stats?.last_fetch_at ? formatLastUpdated(stats.last_fetch_at, locale, t) : t('autoFetchUsersNote'),
        onClick: undefined,
        disabled: true,
      };

  if (loading) return <DashboardSkeleton />;

  if (statsError && !stats) {
    return (
      <div className="bg-[#f4f6fa] min-h-screen flex items-center justify-center p-6" style={{ fontFamily: "'Figtree', system-ui, sans-serif" }}>
        <div
          role="alert"
          className="max-w-md w-full bg-white border border-red-200 rounded-2xl p-8 shadow-sm text-center"
        >
          <div className="text-4xl mb-3" aria-hidden="true">⚠️</div>
          <p className="text-gray-900 text-base font-bold mb-1">Couldn't load your dashboard</p>
          <p className="text-gray-500 text-sm mb-5 break-words">{statsError.message}</p>
          <button
            onClick={loadStats}
            className="px-5 py-2.5 bg-green-600 hover:bg-green-700 focus-visible:ring-2 focus-visible:ring-green-500 focus-visible:ring-offset-2 text-white font-semibold rounded-xl transition"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  const totalTracked = (stats?.saved || 0) + (stats?.preparing || 0) + (stats?.applied || 0) + (stats?.followup || 0) + (stats?.interviewing || 0) + (stats?.offered || 0);

  return (
    <div className="bg-[#f4f6fa] min-h-screen" style={{ fontFamily: "'Figtree', system-ui, sans-serif" }}>
      {/* Figtree is preloaded once in index.html — no per-render @import. */}

      {/* Page header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between sticky top-0 z-10">
        <div>
          <h1 className="text-[22px] font-black leading-tight text-[#0a1a25]">{greeting}, {displayName}</h1>
          <p className="text-[12px] text-gray-400 mt-0.5">
            {todayFormatted}
            {(followUps.length > 0 || upcomingInterviews.length > 0 || (stats?.new_today ?? 0) > 0) && (
              <span className="ml-2">
                {followUps.length > 0 && <span className="text-amber-500 font-semibold">{followUps.length} {t('headerFollowUpsDue')}</span>}
                {followUps.length > 0 && upcomingInterviews.length > 0 && <span className="mx-1.5 text-gray-300">·</span>}
                {upcomingInterviews.length > 0 && <span className="text-purple-500 font-semibold">{upcomingInterviews.length} {t('interviewsComingUp')}</span>}
                {(followUps.length > 0 || upcomingInterviews.length > 0) && (stats?.new_today ?? 0) > 0 && <span className="mx-1.5 text-gray-300">·</span>}
                {(stats?.new_today ?? 0) > 0 && <span className="text-[#16a34a] font-semibold">{stats!.new_today} {t('newJobsToday')}</span>}
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {streak > 1 && (
            <div className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 border border-amber-200 rounded-full text-amber-700 text-[12px] font-black">
              {streak}{t('dayStreak')}
            </div>
          )}
          <button
            onClick={() => setEditMode(e => !e)}
            className={`text-[13px] font-bold px-4 py-2 rounded-full border transition focus-visible:ring-2 focus-visible:ring-green-500 focus-visible:ring-offset-2 ${
              editMode
                ? 'bg-[#0a1a25] text-white border-[#0a1a25]'
                : 'bg-white text-[#0a1a25] border-gray-200 hover:bg-gray-50 hover:border-gray-300'
            }`}
          >
            {editMode ? t('done') : t('editDashboard')}
          </button>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-5">

        {/* Edit mode: hidden widgets restore */}
        {editMode && hiddenKeys.length > 0 && (
          <div className="mb-4 p-4 bg-white border border-gray-200 rounded-2xl flex flex-wrap gap-2 items-center animate-fade-in shadow-sm">
            <span className="text-[11px] font-black text-gray-400 uppercase tracking-widest">Hidden:</span>
            {hiddenKeys.map(key => (
              <button
                key={key}
                onClick={() => toggle(key)}
                className="text-[12px] font-bold text-[#0a1a25] bg-gray-50 border border-gray-200 rounded-full px-3 py-1 hover:border-[#16a34a] hover:text-[#16a34a] transition"
              >
                + {WIDGET_LABELS[key]}
              </button>
            ))}
          </div>
        )}

        {stats && (
          <TodayFocus
            stats={stats}
            followUps={followUps}
            upcomingInterviews={upcomingInterviews}
            onReviewJobs={() => navigate('/jobs')}
            onFollowUps={() => navigate(followUps[0] ? `/jobs/${followUps[0].id}` : '/jobs?tab=followup')}
            onInterviews={() => navigate(upcomingInterviews[0] ? `/jobs/${upcomingInterviews[0].id}` : '/kanban')}
            onTracker={() => navigate('/kanban')}
            onHotPicks={() => navigate('/hotpicks')}
          />
        )}

        {/* Stats strip */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-5">
          <StatCard
            label="Total Jobs"
            value={stats?.total || 0}
            sub={stats?.new ? `${stats.new} unreviewed` : 'Browse all jobs'}
            color="text-[#16a34a]"
            accent="bg-green-50"
            icon={<IconBriefcase className="w-4 h-4 text-[#16a34a]" />}
            onClick={() => navigate('/jobs')}
          />
          <StatCard
            label="Saved"
            value={stats?.saved || 0}
            sub="Shortlisted"
            color="text-amber-600"
            accent="bg-amber-50"
            icon={<IconBookmark className="w-4 h-4 text-amber-500" />}
            onClick={() => navigate('/kanban')}
          />
          <StatCard
            label="Applied"
            value={stats?.applied || 0}
            sub="Submitted"
            color="text-blue-600"
            accent="bg-blue-50"
            icon={<IconSend className="w-4 h-4 text-blue-500" />}
            onClick={() => navigate('/kanban')}
          />
          <StatCard
            label="Interviewing"
            value={stats?.interviewing || 0}
            sub="In progress"
            color="text-[#7c3aed]"
            accent="bg-purple-50"
            icon={<IconMic className="w-4 h-4 text-purple-500" />}
            onClick={() => navigate('/kanban')}
          />
          <StatCard
            label="Offered"
            value={stats?.offered || 0}
            sub={stats?.offered ? '🎉 Congrats!' : 'Keep going!'}
            color="text-emerald-600"
            accent="bg-emerald-50"
            icon={<IconTrophy className="w-4 h-4 text-emerald-500" />}
            onClick={() => navigate('/kanban')}
          />
        </div>

        {/* Main 2-col layout */}
        <div className="flex flex-col lg:flex-row gap-4">

          {/* Left column */}
          <div className="flex-1 min-w-0 flex flex-col gap-4">
            {widgetOrder.map((key, idx) => {
              const moveUp = idx > 0 ? () => moveWidget(key, -1) : undefined;
              const moveDown = idx < widgetOrder.length - 1 ? () => moveWidget(key, 1) : undefined;

              let content: React.ReactNode = null;

              if (key === 'news') {
                if (visible.news && newsOnDashboard) content = (
                  <Module title={t('news')} editMode={editMode} onHide={() => toggle('news')} onMoveUp={moveUp} onMoveDown={moveDown} noPad>
                    <div className="px-[18px] py-[14px]"><NewsCarousel /></div>
                  </Module>
                );
              } else if (key === 'newJobs') {
                if (visible.newJobs && stats && stats.new > 0) content = (
                  <div
                    onClick={() => navigate('/jobs')}
                    className={`bg-white border border-gray-200 rounded-2xl overflow-hidden cursor-pointer hover:border-green-300 hover:shadow-md transition-all group shadow-sm ${editMode ? 'ring-2 ring-dashed ring-gray-300' : ''}`}
                  >
                    <div className="flex items-center justify-between px-5 border-b border-gray-100" style={{ minHeight: 52 }}>
                      <h3 className="text-[11px] font-black text-gray-400 uppercase tracking-widest">Unreviewed Jobs</h3>
                      {editMode && (
                        <div className="flex items-center gap-1.5">
                          {moveUp && <button onClick={e => { e.stopPropagation(); moveUp(); }} className="text-[13px] text-gray-400 hover:text-[#0a1a25] border border-gray-200 rounded-lg px-1.5 py-0.5 leading-none transition">↑</button>}
                          {moveDown && <button onClick={e => { e.stopPropagation(); moveDown(); }} className="text-[13px] text-gray-400 hover:text-[#0a1a25] border border-gray-200 rounded-lg px-1.5 py-0.5 leading-none transition">↓</button>}
                          <button onClick={e => { e.stopPropagation(); toggle('newJobs'); }} className="text-[11px] font-bold text-gray-400 hover:text-red-500 border border-gray-200 hover:border-red-300 rounded-lg px-2 py-0.5 transition">Hide</button>
                        </div>
                      )}
                    </div>
                    <div className="px-5 py-5 flex items-center justify-between">
                      <div>
                        <p className="text-[38px] font-black text-[#16a34a] leading-none tabular-nums"><AnimatedNumber value={stats.new} /></p>
                        {stats.new_today > 0 && <p className="text-[12px] text-[#6f839c] mt-1">+{stats.new_today} added today</p>}
                      </div>
                      <span className="text-[13px] font-black text-[#16a34a] group-hover:text-green-700 transition">Review now →</span>
                    </div>
                  </div>
                );
              } else if (key === 'stories') {
                if (visible.stories && filteredStoryJobs.length > 0) content = (
                  <Module title={`New Jobs · ${filteredStoryJobs.length} unreviewed`} editMode={editMode} onHide={() => toggle('stories')} onMoveUp={moveUp} onMoveDown={moveDown} noPad>
                    <div className="px-[18px] py-[14px]">
                      <JobStories jobs={filteredStoryJobs} onJobClick={(id) => navigate(`/jobs/${id}`)} />
                    </div>
                  </Module>
                );
              } else if (key === 'followUps') {
                if (visible.followUps && followUps.length === 0) content = (
                  <Module title="Follow-ups Due" editMode={editMode} onHide={() => toggle('followUps')} onMoveUp={moveUp} onMoveDown={moveDown}>
                    <div className="flex flex-col items-center py-4 gap-2">
                      <span className="text-2xl">📬</span>
                      <p className="text-[13px] font-bold text-gray-400">No follow-ups due</p>
                      <p className="text-[11px] text-gray-300">Great — you're all caught up!</p>
                    </div>
                  </Module>
                );
                else if (visible.followUps && followUps.length > 0) content = (
                  <Module title={`Follow-ups Due · ${followUps.length}`} editMode={editMode} onHide={() => toggle('followUps')} onMoveUp={moveUp} onMoveDown={moveDown} noPad>
                    <div className="divide-y divide-[#dfe3eb]">
                      {followUps.map(f => (
                        <div key={f.id} onClick={() => navigate(`/jobs/${f.id}`)} className="flex justify-between items-center px-[18px] py-3 cursor-pointer hover:bg-[#f4f6fa] transition border-l-[3px] border-l-amber-400">
                          <span className="text-[14px] font-bold text-[#223a5a] truncate flex-1 flex items-center gap-2">
                            <IconClock className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                            {f.title} · {f.company}
                          </span>
                          <span className="text-[12px] text-[#6f839c] shrink-0 ml-3">{new Date(f.follow_up_date).toLocaleDateString(locale)}</span>
                        </div>
                      ))}
                    </div>
                  </Module>
                );
              } else if (key === 'interviews') {
                if (visible.interviews && upcomingInterviews.length === 0) content = (
                  <Module title="Upcoming Interviews" editMode={editMode} onHide={() => toggle('interviews')} onMoveUp={moveUp} onMoveDown={moveDown}>
                    <div className="flex flex-col items-center py-4 gap-2">
                      <span className="text-2xl">🎙️</span>
                      <p className="text-[13px] font-bold text-gray-400">No interviews scheduled</p>
                      <p className="text-[11px] text-gray-300">Keep applying — they'll show up here!</p>
                    </div>
                  </Module>
                );
                else if (visible.interviews && upcomingInterviews.length > 0) content = (
                  <Module title={`Upcoming Interviews · ${upcomingInterviews.length}`} editMode={editMode} onHide={() => toggle('interviews')} onMoveUp={moveUp} onMoveDown={moveDown} noPad>
                    <div className="divide-y divide-[#dfe3eb]">
                      {upcomingInterviews.map(j => (
                        <div key={j.id} onClick={() => navigate(`/jobs/${j.id}`)} className="flex justify-between items-center px-[18px] py-3 cursor-pointer hover:bg-[#f4f6fa] transition border-l-[3px] border-l-purple-500">
                          <span className="text-[14px] font-bold text-[#223a5a] truncate flex-1">{j.title} · {j.company}</span>
                          <span className="text-[12px] text-[#6f839c] shrink-0 ml-3">{new Date(j.interview_date!).toLocaleDateString(locale)}</span>
                        </div>
                      ))}
                    </div>
                  </Module>
                );
              } else if (key === 'applications') {
                if (visible.applications && stats) content = (
                  <Module
                    title={`Applications · ${totalTracked} tracked`}
                    action={<button onClick={() => navigate('/kanban')} className="text-[12px] font-black text-[#16a34a] hover:text-green-700 transition">Full board →</button>}
                    editMode={editMode}
                    onHide={() => toggle('applications')}
                    onMoveUp={moveUp}
                    onMoveDown={moveDown}
                    noPad
                  >
                    <ApplicationBoard stats={stats} boardJobs={boardJobs} onJobClick={(id) => navigate(`/jobs/${id}`)} locale={locale} />
                  </Module>
                );
              } else if (key === 'pipeline') {
                if (visible.pipeline && stats) content = (
                  <Module title="Pipeline Funnel" editMode={editMode} onHide={() => toggle('pipeline')} onMoveUp={moveUp} onMoveDown={moveDown}>
                    <PipelineFunnel stats={stats} />
                  </Module>
                );
              } else if (key === 'weeklyActivity') {
                if (visible.weeklyActivity) content = (
                  <Module title="Weekly Activity" editMode={editMode} onHide={() => toggle('weeklyActivity')} onMoveUp={moveUp} onMoveDown={moveDown}>
                    <WeeklyActivity boardJobs={boardJobs} />
                  </Module>
                );
              }

              if (!content) return null;

              return (
                <div
                  key={key}
                  draggable={editMode}
                  onDragStart={e => { e.dataTransfer.effectAllowed = 'move'; setDraggedKey(key); }}
                  onDragOver={e => { e.preventDefault(); if (key !== draggedKey) setDragOverKey(key); }}
                  onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOverKey(null); }}
                  onDrop={e => {
                    e.preventDefault();
                    if (draggedKey && key !== draggedKey) reorderWidgets(draggedKey, key);
                    setDraggedKey(null);
                    setDragOverKey(null);
                  }}
                  onDragEnd={() => { setDraggedKey(null); setDragOverKey(null); }}
                  style={{ opacity: draggedKey === key ? 0.4 : 1 }}
                  className={`transition-opacity ${editMode ? 'cursor-grab active:cursor-grabbing' : ''} ${dragOverKey === key && draggedKey !== key ? 'ring-2 ring-[#16a34a] rounded' : ''}`}
                >
                  {content}
                </div>
              );
            })}
          </div>

          {/* Right sidebar */}
          <div className="lg:w-72 shrink-0 flex flex-col gap-4">

            {/* Quick Actions */}
            {visible.quickActions && (
              <Module title="Quick Actions" editMode={editMode} onHide={() => toggle('quickActions')}>
                <div className="grid grid-cols-2 gap-2.5">
                  {[
                    { icon: <IconSearch className="w-4 h-4" />, iconBg: 'bg-green-100 text-green-600', label: t('browseJobs'), sub: `${stats?.new || 0} new`, onClick: () => navigate('/jobs') },
                    { icon: <IconBriefcase className="w-4 h-4" />, iconBg: 'bg-blue-100 text-blue-600', label: t('applicationsBoard'), sub: t('applicationsBoardDesc'), onClick: () => navigate('/kanban') },
                    { icon: <IconBarChart className="w-4 h-4" />, iconBg: 'bg-purple-100 text-purple-600', label: t('analytics'), sub: t('analyticsDesc'), onClick: () => navigate('/analytics') },
                    fetchCard,
                  ].map((card, i) => (
                    <button key={i} onClick={card.onClick} className="flex items-center gap-2.5 p-3 bg-gray-50 hover:bg-white border border-gray-200 hover:border-gray-300 rounded-xl transition text-left disabled:opacity-50 hover:shadow-sm group">
                      <span className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${card.iconBg} transition-transform group-hover:scale-110`}>{card.icon}</span>
                      <div className="min-w-0">
                        <p className="text-[12px] font-black text-[#0a1a25] truncate">{card.label}</p>
                        <p className="text-[10px] text-gray-400 truncate leading-snug">{card.sub}</p>
                      </div>
                    </button>
                  ))}
                </div>
                {fetchIsStale && (
                  <p className="text-[12px] mt-3 text-center font-bold text-amber-600">
                    {t('fetchStaleWarning')}
                  </p>
                )}
                {fetchMsg && (
                  <p className={`text-[12px] mt-3 text-center font-bold ${fetchMsgIsError ? 'text-red-500' : 'text-[#16a34a]'}`}>
                    {fetchMsg}
                  </p>
                )}
                {!user?.isAdmin && (
                  <p className="text-[11px] mt-3 text-center text-gray-500">{t('manualFetchAdminsOnly')}</p>
                )}
              </Module>
            )}

            {/* Goal tracker */}
            {visible.goal && stats && (
              <Module title="Goal Tracker" editMode={editMode} onHide={() => toggle('goal')}>
                <GoalWidget stats={stats} />
              </Module>
            )}

            {/* Gamification */}
            <GamificationWidget />

            {/* Calendar */}
            {visible.calendar && (
              <Module title="Calendar" editMode={editMode} onHide={() => toggle('calendar')}>
                <MiniCalendar upcomingInterviews={upcomingInterviews} followUps={followUps} />
              </Module>
            )}

          </div>
        </div>
      </div>
    </div>
  );
};
