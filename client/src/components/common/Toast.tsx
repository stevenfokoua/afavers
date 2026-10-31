import { useToastStore } from '../../store/toastStore';
import { Button, Icon } from '../ui';
import { useLanguage } from '../../store/languageStore';
export function ToastContainer() {
  const {
      toasts,
      remove
    } = useToastStore(),
    {
      lang
    } = useLanguage();
  return <div className="fixed bottom-[calc(var(--mobile-nav-height)+12px)] md:bottom-5 right-4 left-4 md:left-auto md:w-96 z-[90] flex flex-col gap-2 pointer-events-none">{toasts.map(toast => <div className="ui-panel p-4 pointer-events-auto" key={toast.id} role={toast.type === 'error' ? 'alert' : 'status'}><div className="flex items-center justify-between gap-3"><p className={toast.type === 'error' ? 'text-danger text-sm' : 'text-ink text-sm'}>{toast.message}</p><Button variant="quiet" onClick={() => remove(toast.id)} aria-label={lang === 'de' ? 'Schließen' : 'Dismiss'}><Icon name="close" /></Button></div>{toast.action && <Button className="mt-2" onClick={() => {
        toast.action?.onClick();
        remove(toast.id);
      }}>{toast.action.label}</Button>}</div>)}</div>;
}
