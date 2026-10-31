import type { AccountItem, CollectionKind } from './accountSyncCore';
const object = (value: unknown): value is Record<string,unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
const text = (value: unknown, max: number): value is string => typeof value === 'string' && value.length <= max;
const clock = (value: unknown) => typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);

/** Validate persisted/remote item shapes before they reach React or filter logic. */
export function isCollectionItem(kind: CollectionKind, value: unknown): value is AccountItem {
  if (!object(value) || !text(value.id,100) || !value.id) return false;
  if (kind === 'saved_searches') {
    if (!text(value.name,60) || !value.name.trim() || !object(value.filters)) return false;
    const filters = value.filters;
    return ['tab','search','sortBy','source','dateDays','location'].every(key => text(filters[key],2000)) && ['remoteOnly','studentOnly','highMatchOnly'].every(key => typeof filters[key] === 'boolean');
  }
  if (!text(value.title,500) || !value.title.trim() || typeof value.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value.date)) return false;
  if (kind === 'calendar_events') return ['interview','followup','deadline','note'].includes(String(value.type)) && (value.time === undefined || value.time === '' || clock(value.time));
  return ['interview','followup','deadline','custom'].includes(String(value.type)) && clock(value.time) && typeof value.completed === 'boolean' && (value.notes === undefined || text(value.notes,32000)) && (value.timezone === undefined || text(value.timezone,100)) && (value.emailEnabled === undefined || typeof value.emailEnabled === 'boolean') && (value.linkedJobId === undefined || Number.isSafeInteger(value.linkedJobId) && (value.linkedJobId as number) > 0);
}
