import type { ReactNode } from 'react';
import { cardDate, isOverdue } from './cardDetails';

export function DateStamp({ value, de }: { value: string; de: boolean }) {
  const date = cardDate(value);
  if (!date) return null;
  return <time className="card-date" dateTime={value} aria-label={date.toLocaleDateString(de ? 'de-DE' : 'en-GB', { dateStyle: 'full' })}>
    <strong>{date.getDate()}</strong><span>{date.toLocaleDateString(de ? 'de-DE' : 'en-GB', { month: 'short' })}</span>
  </time>;
}

export function ActionCard({ date, title, description, action, kind, de, onClick }: { date: string; title: string; description: ReactNode; action: string; kind: string; de: boolean; onClick: () => void }) {
  const overdue = isOverdue(date);
  return <article className="action-card" data-overdue={overdue}>
    <DateStamp value={date} de={de} />
    <div className="action-card-copy"><p className="action-card-kind">{kind}{overdue && <span className="card-overdue">{de ? 'Überfällig' : 'Overdue'}</span>}</p><h3>{title}</h3><p>{description}</p></div>
    <button type="button" className="ui-button" onClick={onClick} aria-label={`${action}: ${title}`}>{action}</button>
  </article>;
}
