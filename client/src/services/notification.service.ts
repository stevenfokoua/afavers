import type { Reminder } from '../store/reminderStore';
import { deviceTimezone, reminderInstant } from './reminderTime';

const browserTimers = new Map<string, ReturnType<typeof setTimeout>>();

function notificationId(id: string): number {
  // Stable FNV-1a hash; summing UUID character codes caused frequent collisions.
  let hash = 2166136261;
  for (const char of id) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return (hash >>> 0) % 2147483647;
}

// Detect if running inside Capacitor (native iOS/Android)
const isNative = () =>
  typeof (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } })
    .Capacitor?.isNativePlatform === 'function' &&
  (window as unknown as { Capacitor: { isNativePlatform: () => boolean } })
    .Capacitor.isNativePlatform();

async function getCapacitorNotifications() {
  if (!isNative()) return null;
  try {
    const { LocalNotifications } = await import('@capacitor/local-notifications');
    return LocalNotifications;
  } catch {
    return null;
  }
}

export async function requestNotificationPermission(): Promise<boolean> {
  const cap = await getCapacitorNotifications();
  if (cap) {
    const result = await cap.requestPermissions();
    return result.display === 'granted';
  }
  // Browser fallback
  if ('Notification' in window) {
    const result = await Notification.requestPermission();
    return result === 'granted';
  }
  return false;
}

export async function scheduleReminder(reminder: Reminder): Promise<void> {
  await cancelReminder(reminder.id);
  if (reminder.completed) return;
  const fireAt = reminderInstant(reminder.date, reminder.time, reminder.timezone || deviceTimezone());

  if (!fireAt || fireAt <= new Date()) return; // invalid or already past

  const cap = await getCapacitorNotifications();

  if (cap) {
    await cap.schedule({
      notifications: [
        {
          id: notificationId(reminder.id),
          title: 'afavers reminder',
          body: reminder.title,
          schedule: { at: fireAt },
          sound: 'default',
          smallIcon: 'ic_stat_icon_config_sample',
        },
      ],
    });
    return;
  }

  // Browser fallback: use setTimeout + Notification API
  if ('Notification' in window && Notification.permission === 'granted') {
    const ms = fireAt.getTime() - Date.now();
    if (ms > 0 && ms < 7 * 24 * 60 * 60 * 1000) {
      const timer = setTimeout(() => {
        browserTimers.delete(reminder.id);
        new Notification('afavers reminder', { body: reminder.title, icon: '/logo.png' });
      }, ms);
      browserTimers.set(reminder.id, timer);
    }
  }
}

export async function cancelReminder(reminderId: string): Promise<void> {
  const timer = browserTimers.get(reminderId);
  if (timer !== undefined) {
    clearTimeout(timer);
    browserTimers.delete(reminderId);
  }
  const cap = await getCapacitorNotifications();
  if (cap) {
    const notifId = notificationId(reminderId);
    const legacyId = Math.abs(reminderId.split('').reduce((sum, char) => sum + char.charCodeAt(0), 0)) % 2147483647;
    await cap.cancel({ notifications: [{ id: notifId }, { id: legacyId }] });
  }
}
