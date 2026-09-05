import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';
import { handleOptions, jsonResponse } from '../_shared/cors.ts';

const BA_URL = 'https://rest.arbeitsagentur.de/jobboerse/jobsuche-service/pc/v4/app/jobs';
const DEFAULT_LOCATIONS = ['Düsseldorf', 'Köln', 'Essen', 'Bochum', 'Dortmund'];

Deno.serve(async (req) => {
  const options = handleOptions(req);
  if (options) return options;

  try {
    const authHeader = req.headers.get('Authorization') ?? '';
    const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_ANON_KEY') ?? '', {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) {
      return jsonResponse({ error: 'Authentication required' }, 401, req);
    }
    const { data: quotaOk, error: quotaError } = await supabase.rpc('consume_search_quota', {
      p_bucket: 'werkstudent-search',
      p_subject: userData.user.id,
    });
    if (quotaError) throw quotaError;
    if (!quotaOk) return jsonResponse({ error: 'Rate limit exceeded' }, 429, req);

    const body = await req.json().catch(() => ({}));
    const keyword = String(body.keyword ?? '').trim();
    const location = String(body.location ?? '').trim();

    let userLocations: string[] = [];
    let userKeywords: string[] = [];
    const { data: appUser } = await supabase
      .from('users')
      .select('id')
      .eq('auth_user_id', userData.user.id)
      .maybeSingle();
    if (appUser?.id) {
      const { data: settings } = await supabase
        .from('user_settings')
        .select('keywords,locations')
        .eq('user_id', appUser.id)
        .maybeSingle();
      userLocations = String(settings?.locations ?? '').split(',').map((item) => item.trim()).filter(Boolean);
      userKeywords = String(settings?.keywords ?? '').split(',').map((item) => item.trim()).filter(Boolean);
    }

    const locations = location ? [location] : (userLocations.length ? userLocations : DEFAULT_LOCATIONS);
    const extra = keyword || userKeywords[0] || '';
    const searchTerm = extra ? `werkstudent ${extra}` : 'werkstudent';
    const seen = new Set<string>();
    const jobs: unknown[] = [];
    const apiKey = Deno.env.get('BUNDESAGENTUR_API_KEY');
    if (!apiKey) throw new Error('BUNDESAGENTUR_API_KEY is not configured');

    for (const loc of locations.slice(0, 6)) {
      const url = new URL(BA_URL);
      url.searchParams.set('was', searchTerm);
      url.searchParams.set('wo', loc);
      url.searchParams.set('size', '25');
      url.searchParams.set('angebotsart', '1');
      url.searchParams.set('umkreis', '25');

      for (let page = 1; page <= 4; page++) {
        url.searchParams.set('page', String(page));
        try {
          const response = await fetch(url, {
            headers: {
              'User-Agent': 'afavers-job-search/1.0 (+ops@afavers.online)',
              'X-API-Key': apiKey,
            },
          });
          if (!response.ok) break;
          const data = await response.json();
          for (const item of data?.stellenangebote ?? []) {
            if (seen.has(item.refnr)) continue;
            seen.add(item.refnr);
            const city = item.arbeitsort?.ort || loc;
            const plz = item.arbeitsort?.plz || '';
            jobs.push({
              refnr: item.refnr,
              title: item.titel || item.beruf || 'Werkstudent Position',
              company: item.arbeitgeber || 'Nicht angegeben',
              location: plz ? `${city} (${plz})` : city,
              postedDate: item.aktuelleVeroeffentlichungsdatum || item.modifikationsTimestamp,
              url: `https://www.arbeitsagentur.de/jobsuche/jobdetail/${item.refnr}`,
            });
          }
          if ((data?.stellenangebote?.length ?? 0) < 25) break;
        } catch (error) {
          console.error('werkstudent-search upstream failed', { loc, searchTerm, error });
          break;
        }
      }
    }

    return jsonResponse({ jobs, total: jobs.length, searchTerm, locations, userKeywords }, 200, req);
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : 'Search failed' }, 500, req);
  }
});
