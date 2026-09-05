// afavers Job Capture — content script
// Runs on every page; responds to extraction requests from the popup

function getText(selector, context) {
  const el = (context || document).querySelector(selector);
  return el ? el.textContent.trim() : '';
}

function getMeta(name) {
  const el = document.querySelector(`meta[property="${name}"], meta[name="${name}"]`);
  return el ? (el.getAttribute('content') || '').trim() : '';
}

// ── JSON-LD structured data (most reliable) ──────────────────────────────
function extractFromJsonLd() {
  const scripts = document.querySelectorAll('script[type="application/ld+json"]');
  for (const script of scripts) {
    try {
      const raw = JSON.parse(script.textContent || '');
      const items = Array.isArray(raw) ? raw : [raw];
      for (const item of items) {
        const posting = item['@type'] === 'JobPosting' ? item
          : item['@graph']?.find(n => n['@type'] === 'JobPosting');
        if (!posting) continue;
        const loc = posting.jobLocation;
        const locStr = Array.isArray(loc)
          ? (loc[0]?.address?.addressLocality || '')
          : (loc?.address?.addressLocality || loc?.address?.addressRegion || '');
        return {
          title:       (posting.title || '').replace(/<[^>]*>/g, '').trim(),
          company:     posting.hiringOrganization?.name || '',
          location:    locStr,
          description: (posting.description || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 3000),
          salary:      posting.baseSalary?.value?.value
                    || posting.estimatedSalary?.value
                    || '',
        };
      }
    } catch {}
  }
  return null;
}

// ── LinkedIn ──────────────────────────────────────────────────────────────
function extractLinkedIn() {
  // Try multiple selector generations (LinkedIn changes DOM frequently)
  const titleSelectors = [
    'h1.top-card-layout__title',
    'h1.jobs-unified-top-card__job-title',
    '.job-details-jobs-unified-top-card__job-title h1',
    '.jobs-top-card__job-title',
    'h1',
  ];
  const companySelectors = [
    'a.topcard__org-name-link',
    '.job-details-jobs-unified-top-card__company-name a',
    '.jobs-unified-top-card__company-name a',
    '.topcard__org-name-link',
  ];
  const locationSelectors = [
    '.topcard__flavor--bullet',
    '.job-details-jobs-unified-top-card__bullet',
    '.jobs-unified-top-card__bullet',
  ];
  const descSelectors = [
    '#job-details',
    '.jobs-description-content__text',
    '.description__text',
  ];

  const title    = titleSelectors.map(s => getText(s)).find(Boolean) || '';
  const company  = companySelectors.map(s => getText(s)).find(Boolean) || '';
  const location = locationSelectors.map(s => getText(s)).find(Boolean) || '';
  const descEl   = descSelectors.map(s => document.querySelector(s)).find(Boolean);
  const description = descEl ? (descEl.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 3000) : '';

  return { title, company, location, description, salary: '' };
}

// ── Indeed ────────────────────────────────────────────────────────────────
function extractIndeed() {
  const title    = getText('[data-testid="simpler-jobTitle"] span')
                || getText('h1.jobsearch-JobInfoHeader-title')
                || getText('h1[data-testid="simpler-jobTitle"]')
                || getText('h1');
  const company  = getText('[data-testid="inlineHeader-companyName"] a')
                || getText('[data-testid="inlineHeader-companyName"]')
                || getText('.jobsearch-InlineCompanyRating-companyName');
  const location = getText('[data-testid="job-location"]')
                || getText('.jobsearch-JobInfoHeader-subtitle > div:last-child');
  const descEl   = document.querySelector('#jobDescriptionText');
  const description = descEl ? (descEl.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 3000) : '';
  const salary   = getText('[data-testid="compensation-model"]')
                || getText('.jobsearch-JobMetadataHeader-item');

  return { title, company, location, description, salary };
}

// ── StepStone (Germany) ───────────────────────────────────────────────────
function extractStepStone() {
  const title    = getText('[data-at="header-job-title"]') || getText('h1');
  const company  = getText('[data-at="header-company-name"]')
                || getText('[data-at="job-ad-company"]');
  const location = getText('[data-at="header-job-location"]')
                || getText('[data-at="job-ad-workplace-location"]');
  const descEl   = document.querySelector('[data-at="job-ad-benefits-section"], [data-at="job-ad-requirements-section"], .at-section-text-description, #job-ad-description');
  const description = descEl ? (descEl.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 3000) : '';
  const salary   = getText('[data-at="salary-info"]') || '';

  return { title, company, location, description, salary };
}

// ── Xing (Germany) ────────────────────────────────────────────────────────
function extractXing() {
  const title    = getText('h1[data-testid="job-detail-headline"]') || getText('h1');
  const company  = getText('[data-testid="job-detail-company-name"]')
                || getText('.company-name');
  const location = getText('[data-testid="job-detail-location"]')
                || getText('.job-location');
  const description = getText('.description') || '';

  return { title, company, location, description, salary: '' };
}

// ── Arbeitsagentur (German Job Agency) ───────────────────────────────────
function extractArbeitsagentur() {
  const title    = getText('h1.jil-jobad__title') || getText('h1');
  const company  = getText('.jil-jobad__company') || '';
  const location = getText('.jil-jobad__location') || '';
  const description = getText('.jil-jobad__requirements') || '';

  return { title, company, location, description, salary: '' };
}

// ── Generic fallback ──────────────────────────────────────────────────────
function extractGeneric() {
  const title    = getText('h1')
                || getMeta('og:title')
                || document.title.split(' | ')[0].split(' - ')[0].trim();
  const company  = getMeta('og:site_name')
                || getText('[class*="company"], [class*="employer"], [class*="organisation"]')
                || '';
  const location = getText('[class*="location"], [class*="city"], [itemprop="addressLocality"]')
                || getMeta('geo.region')
                || '';
  const descEl   = document.querySelector('[class*="description"], [class*="job-detail"], article, main');
  const description = descEl
    ? (descEl.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 3000)
    : getMeta('description');
  const salary   = getText('[class*="salary"], [class*="compensation"]') || '';

  return { title, company, location, description, salary };
}

// ── Main extract function ─────────────────────────────────────────────────
function extractJobData() {
  const url      = window.location.href;
  const hostname = window.location.hostname;

  // Always try JSON-LD first
  const jsonLd = extractFromJsonLd();
  if (jsonLd && jsonLd.title) {
    return { ...jsonLd, url, source: detectSource(hostname) };
  }

  let data;
  if (hostname.includes('linkedin.com'))        data = extractLinkedIn();
  else if (hostname.includes('indeed.'))        data = extractIndeed();
  else if (hostname.includes('stepstone.'))     data = extractStepStone();
  else if (hostname.includes('xing.com'))       data = extractXing();
  else if (hostname.includes('arbeitsagentur.de')) data = extractArbeitsagentur();
  else                                          data = extractGeneric();

  return { ...data, url, source: detectSource(hostname) };
}

function detectSource(hostname) {
  if (hostname.includes('linkedin'))      return 'linkedin';
  if (hostname.includes('indeed'))        return 'indeed';
  if (hostname.includes('stepstone'))     return 'stepstone';
  if (hostname.includes('xing'))          return 'xing';
  if (hostname.includes('arbeitsagentur')) return 'bundesagentur';
  if (hostname.includes('glassdoor'))     return 'glassdoor';
  if (hostname.includes('monster'))       return 'monster';
  return hostname.replace('www.', '').split('.')[0];
}

// ── Message listener ──────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Only our own extension pages may drive this listener. Without
  // externally_connectable nothing else can reach it today, but that is one
  // manifest edit away from being false and the guard is one line.
  if (sender.id !== chrome.runtime.id) return false;

  if (message?.type !== 'EXTRACT_JOB') {
    // Returning true for a message we do not answer leaves the sender's
    // promise hanging forever.
    return false;
  }

  // extractJobData is synchronous, so the response is already sent by the time
  // we return and there is no pending reply to keep the channel open for.
  try {
    const data = extractJobData();
    sendResponse({ success: true, data });
  } catch (err) {
    sendResponse({ success: false, error: String(err) });
  }
  return false;
});
