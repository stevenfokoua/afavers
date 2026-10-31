import { useState } from 'react';
import { useSavedSearchStore, type SavedSearchFilters } from '../../store/savedSearchStore';
import { useLanguage } from '../../store/languageStore';
import { Button, Dialog, Icon } from '../ui';
import { AccountSyncStatus } from './AccountSyncStatus';
export function SavedSearches({
  filters,
  onApply
}: {
  filters: SavedSearchFilters;
  onApply: (filters: SavedSearchFilters) => void;
}) {
  const {
      lang
    } = useLanguage(),
    de = lang === 'de',
    {
      searches,
      save,
      remove
    } = useSavedSearchStore();
  const [open, setOpen] = useState(false),
    [name, setName] = useState(''),
    [message, setMessage] = useState('');
  const comparable = (value: SavedSearchFilters) => JSON.stringify(Object.fromEntries(Object.keys(value).filter(key => key !== 'page').sort().map(key => [key, value[key as keyof SavedSearchFilters]])));
  const selected = searches.find(search => comparable(search.filters) === comparable(filters));
  const picker = <select className="ui-field" aria-label={de ? 'Gespeicherte Suchen' : 'Saved searches'} value={selected?.id ?? ''} onChange={event => {
    const search = searches.find(item => item.id === event.target.value);
    if (search) {
      onApply(search.filters);
      setName(search.name);
      setMessage('');
    }
  }}><option value="">{de ? 'Gespeicherte Suchen' : 'Saved searches'}</option>{searches.map(search => <option key={search.id} value={search.id}>{search.name}</option>)}</select>;
  return <div className="saved-searches">{searches.length > 0 && picker}<Button variant="quiet" onClick={() => setOpen(true)}><Icon name="bookmark" />{de ? 'Suche speichern' : 'Save search'}</Button><Dialog open={open} title={de ? 'Gespeicherte Suchen' : 'Saved searches'} onClose={() => setOpen(false)}><p className="ui-muted text-sm mb-2">{de ? 'Diese Filter werden mit deinem Konto synchronisiert. E-Mail-Stellenalarme bleiben unverändert.' : 'These filters sync with your account. Job-alert emails are unchanged.'}</p><AccountSyncStatus collection="saved_searches" />{searches.length > 0 && <div className="ui-actions mb-5">{picker}<Button disabled={!selected} onClick={() => {
          if (selected) remove(selected.id);
          setMessage('');
        }}>{de ? 'Entfernen' : 'Remove'}</Button></div>}<form onSubmit={event => {
        event.preventDefault();
        try {
          if (save(name, filters)) {
            setMessage(de ? 'Suche gespeichert.' : 'Search saved.');
          } else setMessage(de ? 'Name eingeben oder eine Suche entfernen (maximal 12).' : 'Enter a name or remove a search (maximum 12).');
        } catch {
          setMessage(de ? 'Browser-Speicher nicht verfügbar. Bitte erneut versuchen.' : 'Browser storage is unavailable. Please try again.');
        }
      }}><label className="ui-label">{de ? 'Name für diese Filter' : 'Name these filters'}<input className="ui-field" value={name} onChange={event => setName(event.target.value)} required maxLength={60} placeholder={de ? 'z. B. Remote-Entwicklung' : 'e.g. Remote development'} /></label><p className="ui-muted text-sm mt-3" role="status">{message}</p><div className="ui-form-footer"><Button onClick={() => setOpen(false)}>{de ? 'Schließen' : 'Close'}</Button><Button type="submit" variant="primary">{de ? 'Suche speichern' : 'Save search'}</Button></div></form></Dialog></div>;
}
