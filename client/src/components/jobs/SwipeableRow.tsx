import type { ReactNode } from 'react';
import { useSwipeAction } from '../../hooks/useSwipeAction';
export function SwipeableRow({
  children,
  onSave,
  onHide,
  saveLabel,
  hideLabel
}: {
  children: ReactNode;
  onSave?: () => void;
  onHide: () => void;
  saveLabel: string;
  hideLabel: string;
}) {
  const {
    touchHandlers,
    cardStyle,
    bgOpacity,
    action
  } = useSwipeAction(onSave ?? (() => {}), onHide);
  return <div className="relative overflow-hidden"><div aria-hidden="true" className="absolute inset-0 flex items-center justify-between px-5 bg-subtle text-muted text-sm" style={{
      opacity: bgOpacity
    }}><span>{action === 'save' && onSave ? saveLabel : ''}</span><span>{action === 'hide' ? hideLabel : ''}</span></div><div {...touchHandlers} style={cardStyle} className="relative bg-surface">{children}</div></div>;
}
