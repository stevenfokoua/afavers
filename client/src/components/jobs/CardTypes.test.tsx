// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Job } from '../../types';
import { FeaturedOpportunity } from './FeaturedOpportunity';
import { ActionCard } from './ActionCard';
import { ApplicationCard } from './ApplicationCard';

let root: Root;
let host: HTMLDivElement;
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
});
afterEach(() => { act(() => root.unmount()); host.remove(); vi.unstubAllGlobals(); });
const job = { id: 1, title: 'Test role', company: 'Test company', location: 'Berlin', status: 'interviewing', interview_date: '2026-11-04', updated_at: '2026-10-31', description: '<p>Role description</p><script>alert(1)</script>' } as Job;

describe('task-specific cards', () => {
  it('does not fabricate match scores or render an empty explanation', () => {
    act(() => root.render(<FeaturedOpportunity job={job} source="Manual" t={key => key}><button>Open</button></FeaturedOpportunity>));
    expect(host.textContent).not.toContain('0%');
    expect(host.querySelector('.opportunity-reasons')).toBeNull();
    expect(host.querySelector('script')).toBeNull();
  });
  it('keeps a real zero score and supplied reasons visible', () => {
    act(() => root.render(<FeaturedOpportunity job={{ ...job, match_score: 0, match_reasons: ['Location matches'], match_gaps: ['German'] }} source="Manual" t={key => key}>{null}</FeaturedOpportunity>));
    expect(host.textContent).toContain('0/100 relevance');
    expect(host.textContent).toContain('Location matches');
    expect(host.textContent).toContain('missing: German');
    expect(host.textContent).toContain('requirementsUnavailable');
    expect(host.textContent).toContain('workingLanguageUnconfirmed');
  });
  it('opens the correct application through its named action', () => {
    const onClick = vi.fn();
    act(() => root.render(<ActionCard date="2026-11-04" title="Test company" description="Test role" kind="Interview" action="Prepare interview" de={false} onClick={onClick} />));
    const button = host.querySelector('button')!;
    expect(button.getAttribute('aria-label')).toBe('Prepare interview: Test company');
    act(() => button.click()); expect(onClick).toHaveBeenCalledOnce();
  });
  it('preserves board controls and detailed job navigation', () => {
    const onOpen = vi.fn();
    act(() => root.render(<ApplicationCard job={job} de={false} onOpen={onOpen} controls={<select aria-label="Stage"><option>Interviewing</option></select>} />));
    expect(host.textContent).toContain('Prepare interview');
    expect(host.textContent).toContain('4 Nov 2026');
    expect(host.querySelector('select')).not.toBeNull();
    act(() => host.querySelector('button')!.click()); expect(onOpen).toHaveBeenCalledOnce();
  });
});
