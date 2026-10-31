import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { useBeforeUnload, useBlocker } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';
import { useLanguage } from '../../store/languageStore';
import { Button, Dialog } from '../ui';
import { resetDrafts } from '../jobs/jobDrafts';
import { useToastStore } from '../../store/toastStore';
import {DirtyContext} from '../../hooks/useDirtyNavigation';
export function NavigationGuard({
  children
}: {
  children: ReactNode;
}) {
  const [dirty, setDirty] = useState(false),
    [retain, setRetain] = useState(true),
    owner = useAuthStore(s => s.user?.id),
    {
      lang
    } = useLanguage();
  const de = lang === 'de';
  const updateDirty = useCallback((value:boolean, keepDraft=true) => { setDirty(value); setRetain(keepDraft); }, []);
  const blocker = useBlocker(({
    currentLocation,
    nextLocation
  }) => Boolean(owner) && dirty && (currentLocation.pathname !== nextLocation.pathname || new URLSearchParams(currentLocation.search).get('job') !== new URLSearchParams(nextLocation.search).get('job')));
  useEffect(() => {
    resetDrafts(owner ?? null);
    useToastStore.setState({
      toasts: []
    });
  }, [owner]);
  useBeforeUnload(useCallback(event => {
    if (dirty && owner) {
      event.preventDefault();
      event.returnValue = '';
    }
  }, [dirty, owner]));
  return <DirtyContext.Provider value={updateDirty}>{children}<Dialog open={blocker.state === 'blocked'} title={de ? 'Ungespeicherte Änderungen' : 'Unsaved changes'} onClose={() => blocker.reset?.()}><p className="ui-muted">{retain ? (de ? 'Dein Entwurf ist noch nicht gespeichert. Beim Wechsel bleibt er für diese Sitzung erhalten.' : 'Your draft has not been saved. Leaving retains it for this session.') : (de ? 'Deine Änderungen sind noch nicht gespeichert. Möchtest du diese Seite verlassen?' : 'Your changes have not been saved. Leave this page anyway?')}</p><div className="ui-form-footer"><Button onClick={() => blocker.reset?.()}>{de ? 'Weiter bearbeiten' : 'Keep editing'}</Button><Button variant="primary" onClick={() => {
          setDirty(false);
          blocker.proceed?.();
        }}>{retain ? (de ? 'Entwurf behalten und wechseln' : 'Leave and keep draft') : (de ? 'Seite verlassen' : 'Leave page')}</Button></div></Dialog></DirtyContext.Provider>;
}
