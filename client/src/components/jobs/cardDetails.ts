import type { Job } from '../../types';

// Parse date-only values locally so their day never shifts with the UTC offset.
export function cardDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const date = new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? value + 'T00:00:00' : value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function isOverdue(value: string | null | undefined, now = new Date()): boolean {
  const date = cardDate(value);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return date !== null && date < today;
}

export function nextApplicationStep(job: Job, de: boolean): { label: string; date: string | null } {
  switch (job.status) {
    case 'interviewing': return { label: de ? 'Gespräch vorbereiten' : 'Prepare interview', date: job.interview_date };
    case 'applied':
    case 'followup': return { label: de ? 'Nachfassen' : 'Follow up', date: job.follow_up_date };
    case 'offered': return { label: de ? 'Angebot prüfen' : 'Review offer', date: null };
    case 'preparing': return { label: de ? 'Bewerbung abschließen' : 'Finish application', date: job.deadline };
    case 'saved': return { label: de ? 'Bewerbung vorbereiten' : 'Prepare application', date: job.deadline };
    default: return { label: de ? 'Bewerbung ansehen' : 'Review application', date: null };
  }
}
