import { useId, type ReactNode } from 'react';

export function GroupedPanel({ title, children, action, className = '' }: { title: string; children: ReactNode; action?: ReactNode; className?: string }) {
  const id = useId();
  return <section className={`grouped-panel ${className}`} aria-labelledby={id}>
    <header className="grouped-panel-header"><h2 id={id}>{title}</h2>{action}</header>
    <div className="grouped-panel-body">{children}</div>
  </section>;
}
