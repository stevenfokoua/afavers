import type { SVGProps } from 'react';
const paths = {
  search: 'm21 21-5-5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0',
  home: 'm3 10 9-7 9 7M5 9v12h5v-7h4v7h5V9',
  jobs: 'M3 7h18v14H3zM8 7V3h8v4M3 12h18M10 12v3h4v-3',
  board: 'M3 3h7v18H3zM14 3h7v12h-7z',
  calendar: 'M3 5h18v16H3zM7 3v4M17 3v4M3 10h18M7 14h2M13 14h2',
  chart: 'M4 3v18h18M8 16v-5M13 16V7M18 16v-9',
  book: 'M12 5C7 2 3 4 3 4v16s4-2 9 1c5-3 9-1 9-1V4s-4-2-9 1ZM12 5v16',
  news: 'M5 3h13v18H5a2 2 0 0 1-2-2V7h2M8 7h7M8 11h7M8 15h7M8 18h4',
  settings: 'M4 7h16M4 17h16M8 4v6M16 14v6',
  fire: 'M12 3c1 5 6 5 6 11a6 6 0 1 1-12 0c0-3 2-6 3-7 0 4 3 5 3-4Z',
  logout: 'M9 4H3v16h6M13 7l5 5-5 5M7 12h11',
  sun: 'M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1 1M18 18l1 1M5 19l1-1M18 6l1-1M17 12a5 5 0 1 1-10 0 5 5 0 0 1 10 0',
  moon: 'M20 14A8 8 0 0 1 10 4a8 8 0 1 0 10 10Z',
  menu: 'M4 6h16M4 12h16M4 18h16',
  more: 'M5 12h1M11 12h1M17 12h1',
  close: 'm6 6 12 12M6 18 18 6',
  plus: 'M12 4v16M4 12h16',
  back: 'm14 5-7 7 7 7',
  external: 'M14 3h7v7M21 3 10 14M10 3H3v18h18v-7',
  bookmark: 'M5 3h14v18l-7-4-7 4Z',
  check: 'm5 12 4 4L19 6',
  filter: 'M4 6h16M7 12h10M10 18h4',
  refresh: 'M20 10a8 8 0 1 0-1 8M20 3v7h-7',
  eyeOff: 'm3 3 18 18M10 5c5-1 9 4 11 7a20 20 0 0 1-3 4M6 6a22 22 0 0 0-5 6s4 7 11 7a13 13 0 0 0 5-1M10 10a3 3 0 0 0 4 4',
  pin: 'M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 1 1 14 0ZM15 10a3 3 0 1 1-6 0 3 3 0 0 1 6 0'
} satisfies Record<string, string>;
export type IconName = keyof typeof paths;
export function Icon({
  name,
  ...props
}: SVGProps<SVGSVGElement> & {
  name: IconName;
}) {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}><path d={paths[name]} /></svg>;
}
