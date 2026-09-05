// Svix webhook signature verification, used by supabase/functions/resend-webhook.
//
// Resend delivers webhooks through Svix. Every request carries svix-id,
// svix-timestamp and svix-signature, and the signature is
// base64(HMAC-SHA256(`${id}.${timestamp}.${rawBody}`, secret)) where the secret
// is the base64 payload of the `whsec_` value. Verifying it by hand keeps the
// svix package and its transitive tree out of the function bundle -- the whole
// check is the sixty lines below, and svix.test.ts runs it against Svix's own
// published test vector.

/** How far a webhook's timestamp may be from now before it is treated as a replay. */
export const TOLERANCE_SECONDS = 5 * 60;

function decodeBase64(value: string): Uint8Array<ArrayBuffer> {
  const binary = atob(value);
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function encodeBase64(bytes: ArrayBuffer): string {
  const view = new Uint8Array(bytes);
  let binary = '';
  for (let i = 0; i < view.length; i++) binary += String.fromCharCode(view[i]);
  return btoa(binary);
}

/** Length-independent equality, so a mismatch does not leak its position. */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** The expected `v1` signature for one message, base64 encoded. */
export async function signPayload(
  secret: string,
  id: string,
  timestamp: string,
  body: string,
): Promise<string> {
  const rawSecret = secret.startsWith('whsec_') ? secret.slice(6) : secret;
  const key = await crypto.subtle.importKey(
    'raw',
    decodeBase64(rawSecret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signed = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(`${id}.${timestamp}.${body}`),
  );
  return encodeBase64(signed);
}

/**
 * True only when the request carries a valid, in-date Svix signature.
 *
 * Fails closed on everything: a missing secret, a missing header, an
 * unparseable secret, a stale timestamp, or a mismatch.
 */
export async function isValidSignature(
  req: Request,
  rawBody: string,
  secret: string,
  nowSeconds: number = Date.now() / 1000,
): Promise<boolean> {
  // An unconfigured secret must reject, never wave requests through.
  if (!secret) return false;

  const id = req.headers.get('svix-id');
  const timestamp = req.headers.get('svix-timestamp');
  const signatureHeader = req.headers.get('svix-signature');
  if (!id || !timestamp || !signatureHeader) return false;

  // Reject replays of an old capture.
  const sent = Number(timestamp);
  if (!Number.isFinite(sent)) return false;
  if (Math.abs(nowSeconds - sent) > TOLERANCE_SECONDS) return false;

  let expected: string;
  try {
    expected = await signPayload(secret, id, timestamp, rawBody);
  } catch {
    return false;
  }

  // The header holds one or more space-separated `v1,<base64>` pairs.
  return signatureHeader.split(' ').some((part) => {
    const [version, value] = part.split(',');
    return version === 'v1' && value !== undefined && timingSafeEqual(value, expected);
  });
}
