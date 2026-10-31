import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';
import { handleOptions, jsonResponse } from '../_shared/cors.ts';
import { BUNDESAGENTUR_URL, parseBundesagenturResponse } from '../_shared/bundesagentur.ts';

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
    if (!userData.user) return jsonResponse({ error: 'Unauthorized' }, 401, req);
    const body = await req.json().catch(() => ({}));
    const keyword = String(body.keyword ?? '').trim();
    const location = String(body.location ?? '').trim();

    let userLocations: string[] = [];
    let userKeywords: string[] = [];
    if (userData.user) {
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
    }

    const locations = location ? [location] : (userLocations.length ? userLocations : DEFAULT_LOCATIONS);
    const extra = keyword || userKeywords[0] || '';
    const searchTerm = extra ? `werkstudent ${extra}` : 'werkstudent';
    const seen = new Set<string>();
    const jobs: unknown[] = [];
    const apiKey = Deno.env.get('BUNDESAGENTUR_API_KEY') || 'jobboerse-jobsuche';

    for (const loc of locations.slice(0, 6)) {
      const url = new URL(BUNDESAGENTUR_URL);
      url.searchParams.set('was', searchTerm);
      url.searchParams.set('wo', loc);
      url.searchParams.set('size', '25');
      url.searchParams.set('page', '1');
      url.searchParams.set('angebotsart', '1');
      url.searchParams.set('umkreis', '25');

      try {
        const response = await fetch(url, {
          headers: {
            'User-Agent': 'Jobsuche/2.9.2 (de.arbeitsagentur.jobboerse; build:1077; iOS 15.1.0) Alamofire/5.4.4',
            'X-API-Key': apiKey,
          },
        });
        if (!response.ok) continue;
        const parsed = parseBundesagenturResponse(await response.json(), loc);
        for (const item of parsed.jobs) {
          if (seen.has(item.reference)) continue;
          seen.add(item.reference);
          jobs.push({
            refnr: item.reference,
            title: item.title,
            company: item.company,
            location: item.location,
            postedDate: item.postedDate,
            url: item.url,
          });
        }
      } catch {
        // Continue with the next location.
      }
    }

    return jsonResponse({ jobs, total: jobs.length, searchTerm, locations, userKeywords }, 200, req);
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : 'Search failed' }, 500, req);
  }
});
