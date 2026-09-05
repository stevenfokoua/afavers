// Origin-aware CORS helper shared by every Edge Function.
// Replaces the previous wildcard Access-Control-Allow-Origin with an
// allowlist. Subdomain wildcards (e.g. *.vercel.app preview URLs) are
// supported by matching the request's Origin header and echoing it back
// -- browsers do not accept wildcard values for credentialed origins.

const EXACT_ORIGINS = new Set<string>([
  'https://afavers.online',
  'https://www.afavers.online',
  'http://localhost:5173',
  'capacitor://localhost',
]);

// Patterns with a single leading wildcard subdomain segment.
const WILDCARD_SUFFIXES: string[] = [
  '.afavers.vercel.app',
];

function isAllowedOrigin(origin: string | null): boolean {
  if (!origin) return false;
  if (EXACT_ORIGINS.has(origin)) return true;
  try {
    const url = new URL(origin);
    if (url.protocol !== 'https:') return false;
    return WILDCARD_SUFFIXES.some((suffix) => url.hostname.endsWith(suffix));
  } catch {
    return false;
  }
}

export function buildCorsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get('origin');
  const headers: Record<string, string> = {
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Vary': 'Origin',
  };
  if (isAllowedOrigin(origin)) {
    headers['Access-Control-Allow-Origin'] = origin as string;
  }
  return headers;
}

export function jsonResponse(body: unknown, status = 200, req: Request): Response {
  const cors = buildCorsHeaders(req);
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...cors,
      'Content-Type': 'application/json',
    },
  });
}

export function handleOptions(req: Request): Response | null {
  if (req.method !== 'OPTIONS') return null;
  return new Response('ok', { headers: buildCorsHeaders(req) });
}
