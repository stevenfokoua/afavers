// Supabase supports self-hosted API prefixes as well as hosted project origins.
export function isExtensionConfigured(apiUrl, anonKey) {
  if (typeof apiUrl !== 'string' || typeof anonKey !== 'string' || !anonKey.trim()
    || apiUrl.includes('YOUR-PROJECT-REF') || anonKey.includes('YOUR-SUPABASE')) return false;
  try {
    const url = new URL(apiUrl);
    const local = url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    return (url.protocol === 'https:' || local) && Boolean(url.hostname)
      && !url.username && !url.password && !url.search && !url.hash;
  } catch { return false; }
}
