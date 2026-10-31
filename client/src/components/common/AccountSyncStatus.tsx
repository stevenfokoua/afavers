import { useLanguage } from '../../store/languageStore';
import { recoverAccountSync, resolveAccountSync, retryAccountSync, useAccountSync, type CollectionKind } from '../../services/accountSync';
import { Button } from '../ui';

export function AccountSyncStatus({ collection, compact = false }: { collection: CollectionKind; compact?: boolean }) {
  const { lang } = useLanguage(), de = lang === 'de';
  const status = useAccountSync(state => state.collections[collection]);
  if (!status || status.phase === 'idle' && !status.pending) return null;
  const pending = status.pending;
  const message = status.journalIssue ? de ? 'Gespeicherte Synchronisierungsdaten sind nicht lesbar und bleiben unverändert. Beim erneuten Verbinden wird zuerst eine Wiederherstellungskopie auf diesem Gerät gespeichert. Sichtbare Einträge werden mit deinem Konto verglichen.' : 'Stored sync data could not be read and is unchanged. Reconnecting first keeps a recovery copy on this device, then compares visible items with your account.' : status.storageUnavailable && pending > 0 ? de ? 'Browser-Speicher ist nicht verfügbar. Halte diesen Tab bis zur Synchronisierung geöffnet.' : 'Browser storage is unavailable. Keep this tab open until sync finishes.' : status.phase === 'conflict' ? de ? 'Dieses Gerät und dein Konto enthalten unterschiedliche Änderungen. Deine Änderungen bleiben hier erhalten.' : 'This device and your account have different changes. Your edits are kept here.' : status.phase === 'synced' ? de ? 'Mit deinem Konto synchronisiert.' : 'Synced to your account.' : status.phase === 'syncing' ? de ? 'Wird mit deinem Konto synchronisiert…' : 'Syncing to your account…' : status.phase === 'offline' ? de ? `${pending} Änderungen warten auf eine Verbindung.` : `${pending} changes are waiting for a connection.` : de ? 'Synchronisierung fehlgeschlagen. Ausstehende Änderungen bleiben auf diesem Gerät.' : 'Could not sync. Pending changes are kept on this device.';
  return <div className={`text-xs ${status.phase === 'conflict' || status.phase === 'error' ? 'text-warning' : 'text-muted'} ${compact ? '' : 'py-3'}`} role="status">
    <p>{message}</p>
    {status.journalIssue ? <div className="ui-actions mt-2"><Button onClick={() => recoverAccountSync(collection)}>{de ? 'Sicher erneut verbinden' : 'Reconnect safely'}</Button><Button variant="quiet" onClick={() => retryAccountSync(collection)}>{de ? 'Erneut versuchen' : 'Retry sync'}</Button></div> : status.phase === 'conflict' ? <div className="ui-actions mt-2"><Button onClick={() => resolveAccountSync(collection,'local')}>{de ? 'Änderungen dieses Geräts verwenden' : 'Keep this device’s changes'}</Button><Button onClick={() => resolveAccountSync(collection,'account')}>{de ? 'Kontoversion verwenden' : 'Use account version'}</Button></div> : (status.phase === 'offline' || status.phase === 'error') && <Button variant="quiet" onClick={() => retryAccountSync(collection)}>{de ? 'Erneut versuchen' : 'Retry sync'}</Button>}
  </div>;
}
