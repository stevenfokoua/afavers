import { useLanguage } from '../../store/languageStore';

const NRW_SOURCE = 'https://www.arbeitsagentur.de/vor-ort/rd-nrw/presse/2026-24-nrw-arbeitsmarkt-oktober-2026-stabile-herbstbelebung-aber-noch-kein-aufschwung';
const SHORTAGE_SOURCE = 'https://www.arbeitsagentur.de/presse/2026-32-fachkraefte-bleiben-knapp-zuwanderung-gewinnt-weiter-an-bedeutung';

/** Dated context is intentionally separate from a person's relevance score. */
export function LabourMarketContext() {
  const de = useLanguage(state => state.lang) === 'de';
  const stale = Date.now() > Date.parse('2026-11-30T23:59:59Z');
  return <details className="review-next mt-5 text-sm">
    <summary className="cursor-pointer font-medium">{de ? 'Arbeitsmarkt einordnen' : 'Understand the job market'}</summary>
    <p className="mt-3 ui-muted">{de ? 'NRW · Oktober 2026 · veröffentlicht am 30. Oktober' : 'NRW · October 2026 · published 30 October'}</p>
    <p className="mt-3">{de ? '160.615 gemeldete offene Stellen. Im Oktober wurden 21.763 Stellen neu gemeldet, 7,3 % weniger als ein Jahr zuvor.' : '160,615 registered vacancies. October brought 21,763 newly reported vacancies, 7.3% fewer than a year earlier.'}</p>
    <p className="mt-3">{de ? 'Die Engpassanalyse für 2025 nennt unter anderem Vermessungstechnik. Softwareentwicklung gilt bundesweit nicht mehr als Engpassberuf. Diese Jahresdaten sagen nichts über deine Qualifikation oder einzelne Jobchancen aus.' : 'The 2025 shortage analysis includes surveying. Software development is no longer classified as a shortage occupation nationally. These annual figures do not establish your qualifications or prospects for an individual job.'}</p>
    {stale && <p className="mt-3 text-warning">{de ? 'Historischer Stand: Aktuelle Zahlen bitte in den Quellen prüfen.' : 'Historical snapshot: check the sources for updated figures.'}</p>}
    <div className="flex flex-wrap gap-3 mt-3 text-xs"><a className="underline" href={NRW_SOURCE} target="_blank" rel="noopener noreferrer">{de ? 'BA: NRW-Monatsbericht' : 'BA: NRW monthly report'}</a><a className="underline" href={SHORTAGE_SOURCE} target="_blank" rel="noopener noreferrer">{de ? 'BA: Engpassanalyse' : 'BA: shortage analysis'}</a></div>
  </details>;
}
