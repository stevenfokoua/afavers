import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { DndContext, DragOverlay, KeyboardSensor, PointerSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { jobsService } from '../services/jobs.service';
import { useAuthStore } from '../store/authStore';
import { useLanguage } from '../store/languageStore';
import { useToastStore } from '../store/toastStore';
import type { Job } from '../types';
import { Button, EmptyState, Icon, InlineError, PageHeader, Skeleton } from '../components/ui';
import { ApplicationCard } from '../components/jobs/ApplicationCard';
import { StatusSelect } from '../components/jobs/StatusSelect';
import {JOB_STATUSES} from '../components/jobs/jobStatus';
import { moveCard } from '../utils/uiMotion';
import { useMediaQuery } from '../hooks/useMediaQuery';
const STAGES: Job['status'][] = JOB_STATUSES.filter(status => status !== 'new');
const ZOOMS = [75, 90, 100, 115, 130];
function DropColumn({
  status,
  children
}: {
  status: Job['status'];
  children: ReactNode;
}) {
  const {
    setNodeRef,
    isOver
  } = useDroppable({
    id: status
  });
  return <div ref={setNodeRef} className="board-drop" data-over={isOver}>{children}</div>;
}
function DragCard({
  job,
  children,
  label
}: {
  job: Job;
  children: (handle: ReactNode) => ReactNode;
  label: string;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    isDragging
  } = useDraggable({
    id: String(job.id)
  });
  return <div ref={setNodeRef} style={{
    transform: transform ? `translate3d(${transform.x}px,${transform.y}px,0)` : undefined,
    opacity: isDragging ? 0.45 : 1
  }}>{children(<button type="button" className="ui-button ui-button--quiet board-drag" aria-label={label} {...attributes} {...listeners}><Icon name="menu" /></button>)}</div>;
}
export function ApplicationWorkspace() {
  const {
      lang,
      t
    } = useLanguage(),
    de = lang === 'de',
    owner = useAuthStore(s => s.user?.id ?? null),
    navigate = useNavigate(),
    phone = useMediaQuery('(max-width:767px)');
  const [data, setData] = useState<{
      owner: number | null;
      jobs: Job[];
    }>({
      owner,
      jobs: []
    }),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(''),
    [stage, setStage] = useState<Job['status']>('saved'),
    [active, setActive] = useState<Job | null>(null),
    [busy, setBusy] = useState<number | null>(null),
    [retry, setRetry] = useState(0);
  const [zoom, setZoom] = useState(() => {
    try {
      const value = Number(localStorage.getItem('kanban-zoom'));
      return ZOOMS.includes(value) ? value : 100;
    } catch {
      return 100;
    }
  });
  const jobs = data.owner === owner ? data.jobs : [],
    root = useRef<HTMLDivElement>(null),
    positions = useRef(new Map<number, DOMRect>()),
    request = useRef(0),
    showToast = useToastStore(s => s.show);
  const sensors = useSensors(useSensor(PointerSensor, {
    activationConstraint: {
      distance: 5
    }
  }), useSensor(KeyboardSensor, {
    coordinateGetter: sortableKeyboardCoordinates
  }));
  const capture = () => {
    positions.current.clear();
    root.current?.querySelectorAll<HTMLElement>('.board-scroll .board-card[data-job-id]').forEach(card => positions.current.set(Number(card.dataset.jobId), card.getBoundingClientRect()));
  };
  useLayoutEffect(() => {
    positions.current.forEach((rect, id) => {
      const card = root.current?.querySelector<HTMLElement>(`.board-scroll .board-card[data-job-id="${id}"]`);
      if (card) moveCard(card, rect);
    });
    positions.current.clear();
  }, [data]);
  useEffect(() => {
    const current = ++request.current;
    setLoading(true);
    setError('');
    jobsService.getAllJobs().then(value => {
      if (current === request.current && useAuthStore.getState().user?.id === owner) setData({
        owner,
        jobs: value.filter(job => job.status !== 'new')
      });
    }).catch(() => {
      if (current === request.current) setError(de ? 'Bewerbungen konnten nicht geladen werden.' : 'Unable to load your applications.');
    }).finally(() => {
      if (current === request.current) setLoading(false);
    });
    return () => {
      request.current++;
    };
  }, [owner, retry]);
  useEffect(() => {
    try {
      localStorage.setItem('kanban-zoom', String(zoom));
    } catch {/* Optional display preference. */}
  }, [zoom]);
  const visible = (status: Job['status']) => jobs.filter(job => job.status === status && !job.is_hidden);
  const update = async (job: Job, status: Job['status']) => {
    if (busy !== null || job.status === status) return;
    capture();
    setBusy(job.id);
    setError('');
    setData(current => ({
      ...current,
      jobs: current.jobs.map(value => value.id === job.id ? {
        ...value,
        status
      } : value)
    }));
    try {
      const updated = await jobsService.updateStatus(job.id, status, status === 'applied' && !job.applied_date ? new Date().toISOString().slice(0, 10) : undefined);
      if (useAuthStore.getState().user?.id !== owner) return;
      setData(current => ({
        ...current,
        jobs: current.jobs.map(value => value.id === job.id ? updated : value)
      }));
      showToast(`${de ? 'Status' : 'Status'}: ${t(status)}`);
    } catch {
      if (useAuthStore.getState().user?.id === owner) {
        capture();
        setData(current => ({
          ...current,
          jobs: current.jobs.map(value => value.id === job.id ? job : value)
        }));
        setError(de ? 'Status nicht gespeichert. Der vorherige Stand wurde wiederhergestellt.' : 'Status was not saved. The previous stage has been restored.');
      }
    } finally {
      setBusy(null);
    }
  };
  const hide = async (job: Job) => {
    if (busy !== null) return;
    setBusy(job.id);
    setError('');
    try {
      const updated = await jobsService.toggleHidden(job.id, true);
      if (useAuthStore.getState().user?.id !== owner) return;
      setData(current => ({
        ...current,
        jobs: current.jobs.map(value => value.id === job.id ? updated : value)
      }));
      showToast(t('toastJobHidden'), 'info', {
        label: de ? 'Rückgängig' : 'Undo',
        onClick: () => {
          if (useAuthStore.getState().user?.id !== owner) return;
          void jobsService.toggleHidden(job.id, false).then(value => {
            if (useAuthStore.getState().user?.id === owner) setData(current => ({
              ...current,
              jobs: current.jobs.map(item => item.id === job.id ? value : item)
            }));
          }).catch(() => setError(de ? 'Wiederherstellen fehlgeschlagen.' : 'Unable to restore application.'));
        }
      });
    } catch {
      setError(de ? 'Ausblenden fehlgeschlagen.' : 'Unable to hide application.');
    } finally {
      setBusy(null);
    }
  };
  const card = (job: Job, handle?: ReactNode) => <ApplicationCard job={job} de={de} onOpen={() => navigate(`/jobs/${job.id}`)} showNotes={zoom > 90} controls={<><StatusSelect label={`${de ? 'Status für' : 'Stage for'} ${job.title}`} value={job.status} onChange={value => void update(job, value)} disabled={busy !== null} /><div className="board-card-tools"><Button variant="quiet" disabled={busy !== null} onClick={() => void hide(job)}>{t('hide')}</Button>{handle}</div></>} />;

  const dragEnd = (event: DragEndEvent) => {
    setActive(null);
    if (!event.over) return;
    const job = jobs.find(value => String(value.id) === String(event.active.id)),
      status = String(event.over.id) as Job['status'];
    if (job && STAGES.includes(status)) void update(job, status);
  };
  return <div className="ui-page" ref={root}><PageHeader title={de ? 'Bewerbungen' : 'Applications'}><Button variant="primary" onClick={() => navigate('/jobs')}><Icon name="plus" />{de ? 'Jobs finden' : 'Find jobs'}</Button></PageHeader><div className="board-toolbar"><label className="ui-label">{de ? 'Bewerbungsphase' : 'Application stage'}<select className="ui-field" value={stage} onChange={event => setStage(event.target.value as Job['status'])}>{STAGES.map(value => <option key={value} value={value}>{t(value)} ({visible(value).length})</option>)}</select></label><div className="hidden md:flex ui-actions"><Button aria-label={de ? 'Verkleinern' : 'Zoom out'} disabled={zoom === 75} onClick={() => setZoom(ZOOMS[Math.max(0, ZOOMS.indexOf(zoom) - 1)])}>−</Button><Button onClick={() => setZoom(100)} aria-label={de ? 'Zoom zurücksetzen' : 'Reset zoom'}>{zoom}%</Button><Button aria-label={de ? 'Vergrößern' : 'Zoom in'} disabled={zoom === 130} onClick={() => setZoom(ZOOMS[Math.min(4, ZOOMS.indexOf(zoom) + 1)])}>+</Button></div></div>{error && <InlineError retry={() => setRetry(value => value + 1)} label={de ? 'Erneut versuchen' : 'Retry'}>{error}</InlineError>}{loading ? <Skeleton /> : jobs.filter(job => !job.is_hidden && job.status !== 'new').length === 0 ? <EmptyState title={t('noJobsTracked')} action={<Button onClick={() => navigate('/jobs')}>{t('browseJobs2')}</Button>}>{t('noJobsTrackedHint')}</EmptyState> : phone ? <div className="board-mobile">{visible(stage).length ? visible(stage).map(job => <div key={job.id}>{card(job)}</div>) : <EmptyState title={t('kanbanEmpty')} />}</div> : <DndContext sensors={sensors} onDragStart={event => setActive(jobs.find(job => String(job.id) === String(event.active.id)) ?? null)} onDragEnd={dragEnd} onDragCancel={() => setActive(null)} accessibility={{
      announcements: {
        onDragStart: () => de ? 'Bewerbung aufgenommen. Statusmenü als Alternative verfügbar.' : 'Application picked up. A stage menu is also available.',
        onDragOver: ({over}) => over ? (de ? `Ziel: ${t(String(over.id))}` : `Target: ${t(String(over.id))}`) : undefined,
        onDragCancel: () => de ? 'Verschieben abgebrochen.' : 'Move cancelled.',
        onDragEnd: () => de ? 'Bewerbung abgelegt.' : 'Application dropped.'
      }
    }}><div className="board-scroll"><div className="board-columns">{STAGES.map(status => <section className="board-column" key={status} style={{
            width: Math.round(256 * zoom / 100)
          }}><h2 className="board-heading"><span>{t(status)}</span><span>{visible(status).length}</span></h2><DropColumn status={status}>{visible(status).length ? visible(status).map(job => <DragCard key={job.id} job={job} label={`${de ? 'Verschieben' : 'Move'} ${job.title}`}>{handle => card(job, handle)}</DragCard>) : <div className="ui-muted text-sm py-6 min-h-24">{t('kanbanEmpty')}</div>}</DropColumn></section>)}</div></div><DragOverlay>{active ? <div style={{
          width: Math.round(256 * zoom / 100),
          pointerEvents: 'none'
        }}>{card(active)}</div> : null}</DragOverlay></DndContext>}</div>;
}
