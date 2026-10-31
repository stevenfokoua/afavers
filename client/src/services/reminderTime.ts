/** Converts a wall-clock reminder to an instant without freezing today's UTC offset.
 * For DST folds choose the later occurrence (PostgreSQL's standard-time choice).
 * Reject nonexistent local times rather than silently shifting the appointment.
 */
export function reminderInstant(date: string, time: string, timezone = 'UTC'): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return null;
  const [year, month, day] = date.split('-').map(Number), [hour, minute] = time.split(':').map(Number);
  const wall = Date.UTC(year, month - 1, day, hour, minute);
  const raw = new Date(wall); if (raw.getUTCFullYear() !== year || raw.getUTCMonth() !== month - 1 || raw.getUTCDate() !== day) return null;
  try {
    const format = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
    const local = (instant: number) => {
      const parts = Object.fromEntries(format.formatToParts(new Date(instant)).map(part => [part.type, part.value]));
      return Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute));
    };
    let instant = wall;
    for (let i = 0; i < 4; i++) instant += wall - local(instant);
    if (local(instant) !== wall) return null;
    for (const minutes of [30, 60, 90, 120]) if (local(instant + minutes * 60_000) === wall) instant += minutes * 60_000;
    return new Date(instant);
  } catch { return null; }
}

export function deviceTimezone(): string { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; } catch { return 'UTC'; } }
