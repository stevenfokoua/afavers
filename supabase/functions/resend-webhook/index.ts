import { adminClient } from '../_shared/jobs.ts';
import { handleOptions, jsonResponse } from '../_shared/cors.ts';

// Resend delivers webhooks through Svix. Every request carries svix-id,
// svix-timestamp and svix-signature, and the signature is
// base64(HMAC-SHA256(`${id}.${timestamp}.${rawBody}`, secret)) where the
// secret is the base64 payload of RESEND_WEBHOOK_SECRET's `whsec_` value.
// Verifying it by hand keeps the svix package (and its transitive tree) out
// of the function bundle -- the whole check is the twenty lines below.

const TOLERANCE_SECONDS = 5 * 60;

function decodeBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function encodeBase64(bytes: ArrayBuffer): string {
  const view = new Uint8Array(bytes);
  let binary = '';
  for (let i = 0; i < view.length; i++) binary += String.fromCharCode(view[i]);
  return btoa(binary);
}

// Length-independent equality so a mismatch does not leak its position.
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function isValidSignature(req: Request, rawBody: string): Promise<boolean> {
  const secret = Deno.env.get('RESEND_WEBHOOK_SECRET') ?? '';
  // Fail closed: an unconfigured secret must reject, never wave requests through.
  if (!secret) return false;

  const id = req.headers.get('svix-id');
  const timestamp = req.headers.get('svix-timestamp');
  const signatureHeader = req.headers.get('svix-signature');
  if (!id || !timestamp || !signatureHeader) return false;

  // Reject replays of an old capture.
  const sent = Number(timestamp);
  if (!Number.isFinite(sent)) return false;
  if (Math.abs(Date.now() / 1000 - sent) > TOLERANCE_SECONDS) return false;

  const rawSecret = secret.startsWith('whsec_') ? secret.slice(6) : secret;
  let keyBytes: Uint8Array;
  try {
    keyBytes = decodeBase64(rawSecret);
  } catch {
    return false;
  }

  const key = await crypto.subtle.importKey(
    'raw',
    keyBytes,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signed = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(`${id}.${timestamp}.${rawBody}`),
  );
  const expected = encodeBase64(signed);

  // The header holds one or more space-separated `v1,<base64>` pairs.
  return signatureHeader
    .split(' ')
    .some((part) => {
      const [version, value] = part.split(',');
      return version === 'v1' && value !== undefined && timingSafeEqual(value, expected);
    });
}

Deno.serve(async (req) => {
  const options = handleOptions(req);
  if (options) return options;

  const rawBody = await req.text();
  if (!(await isValidSignature(req, rawBody))) {
    return jsonResponse({ error: 'invalid signature' }, 401, req);
  }

  let event: { type?: string; data?: { to?: string[] } };
  try {
    event = JSON.parse(rawBody);
  } catch {
    return jsonResponse({ error: 'invalid payload' }, 400, req);
  }

  if (event?.type === 'email.bounced' || event?.type === 'email.complained') {
    const email = event?.data?.to?.[0];
    if (email) {
      const { error } = await adminClient()
        .from('email_suppressions')
        .upsert(
          { email, reason: event.type, updated_at: new Date().toISOString() },
          { onConflict: 'email' },
        );
      if (error) return jsonResponse({ error: 'suppression write failed' }, 500, req);
    }
  }
  return jsonResponse({ ok: true }, 200, req);
});
