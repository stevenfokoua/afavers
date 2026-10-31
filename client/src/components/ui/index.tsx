import { forwardRef, useEffect, useId, useRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from './Icon';
export { Icon } from './Icon';
export const Button = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'quiet' | 'danger';
  busy?: boolean;
}>(function Button({
  variant = 'secondary',
  busy = false,
  className = '',
  children,
  disabled,
  ...props
}, ref) {
  return <button type="button" {...props} ref={ref} disabled={disabled || busy} aria-busy={busy || undefined} className={`ui-button ui-button--${variant} ${className}`}>{children}</button>;
});
export function PageHeader({
  title,
  children
}: {
  title: string;
  children?: ReactNode;
}) {
  return <header className="ui-page-header"><h1>{title}</h1><div className="ui-actions">{children}</div></header>;
}
export function InlineError({
  children,
  retry,
  label
}: {
  children: ReactNode;
  retry?: () => void;
  label?: string;
}) {
  return <div className="ui-error" role="alert"><p>{children}</p>{retry && <Button onClick={retry}>{label ?? 'Retry'}</Button>}</div>;
}
export function Skeleton({
  rows = 3
}: {
  rows?: number;
}) {
  return <div className="ui-skeleton" role="status" aria-label="Loading"><span className="sr-only">Loading</span>{Array.from({
      length: rows
    }, (_, i) => <div key={i}><span /><span /></div>)}</div>;
}
export function EmptyState({
  title,
  children,
  action
}: {
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return <div className="ui-empty"><h2>{title}</h2>{children && <p>{children}</p>}{action}</div>;
}
export function Dialog({
  open,
  title,
  onClose,
  children
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null),
    id = useId();
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const trigger = document.activeElement as HTMLElement | null;
    if (open && !node.open) {
      if (node.showModal) node.showModal();else node.setAttribute('open', '');
    }
    if (!open && node.open) node.close?.();
    return () => {
      if (node.open) node.close?.();
      trigger?.focus?.();
    };
  }, [open]);
  if (!open) return null;
  return createPortal(<dialog ref={ref} className="ui-dialog" aria-labelledby={id} onCancel={e => {
    e.preventDefault();
    onClose();
  }}><header><h2 id={id}>{title}</h2><Button variant="quiet" aria-label="Close / Schließen" onClick={onClose}><Icon name="close" /></Button></header>{children}</dialog>, document.body);
}

/** Native modal boundary for existing, feature-specific dialog contents. */
export function ModalSurface({
  label,
  onClose,
  children,
  wide = false
}: {
  label: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const trigger = document.activeElement as HTMLElement | null;
    if (node.showModal) node.showModal();else node.setAttribute('open', '');
    return () => {
      node.close?.();
      trigger?.focus?.();
    };
  }, []);
  return createPortal(<dialog ref={ref} className={`ui-modal-surface${wide ? ' ui-modal-surface--wide' : ''}`} aria-label={label} onCancel={event => {
    event.preventDefault();
    onClose();
  }}>{children}</dialog>, document.body);
}
