import type { Job } from '../../types';
import { useLanguage } from '../../store/languageStore';
import {JOB_STATUSES} from './jobStatus';
const keys = {
  new: 'statusNew',
  saved: 'statusSaved',
  preparing: 'statusPreparing',
  applied: 'statusApplied',
  followup: 'statusFollowup',
  interviewing: 'statusInterviewing',
  offered: 'statusOffered',
  rejected: 'statusRejected',
  archived: 'statusArchived'
};
export function StatusSelect({
  value,
  onChange,
  disabled,
  label,
  id
}: {
  value: Job['status'];
  onChange: (status: Job['status']) => void;
  disabled?: boolean;
  label: string;
  id?: string;
}) {
  const {
    t
  } = useLanguage();
  return <select id={id} className="ui-field" aria-label={label} value={value} disabled={disabled} onChange={event => {
    if (JOB_STATUSES.includes(event.target.value as Job['status'])) onChange(event.target.value as Job['status']);
  }}>{JOB_STATUSES.map(status => <option key={status} value={status}>{t(keys[status])}</option>)}</select>;
}
