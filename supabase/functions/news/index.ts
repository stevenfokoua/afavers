import { buildCorsHeaders, handleOptions, jsonResponse } from '../_shared/cors.ts';

const TAGESSCHAU_BASE = 'https://www.tagesschau.de/api2u';
const MAX_ARTICLES = 50;

Deno.serve(async (req) => {
  const options = handleOptions(req);
  if (options) return options;

  try {
    const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {};
    const url = new URL(req.url);
    const ressort = String(body.ressort ?? url.searchParams.get('ressort') ?? '').trim();
    const upstream = ressort
      ? `${TAGESSCHAU_BASE}/news/?ressort=${encodeURIComponent(ressort)}`
      : `${TAGESSCHAU_BASE}/news/`;

    const response = await fetch(upstream, {
      headers: { Accept: 'application/json', 'User-Agent': 'afavers-app/1.0' },
    });
    if (!response.ok) throw new Error(`Tagesschau API error: ${response.status}`);

    const data = await response.json();
    if (Array.isArray(data.news)) data.news = data.news.slice(0, MAX_ARTICLES);
    return new Response(JSON.stringify(data), {
      status: 200,
      headers: {
        ...buildCorsHeaders(req),
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=300, stale-while-revalidate=900',
      },
    });
  } catch (error) {
    console.error('news failed', { url: req.url, error });
    return jsonResponse({ error: error instanceof Error ? error.message : 'Failed to fetch news' }, 502, req);
  }
});
