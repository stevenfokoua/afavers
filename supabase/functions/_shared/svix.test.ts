// Run with: deno test supabase/functions/_shared/svix.test.ts
//
// Unlike jobs.test.ts this file has no Supabase or Deno.env dependency, so it
// runs as is. It guards the one security control standing between the public
// internet and a service-role write to email_suppressions.

import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { isValidSignature, signPayload } from './svix.ts';

// Svix's own published test vector, from the svix-webhooks test suite.
const SECRET = 'whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw';
const MSG_ID = 'msg_p5jXN8AQM9LWM0D4loKWxJek';
const TIMESTAMP = '1614265330';
const PAYLOAD = '{"test": 2432232314}';
const EXPECTED = 'g0hM9SsE+OTPJTGt/tmIKtSyZlE3uFJELVlNIOLJ1OE=';

const NOW = Number(TIMESTAMP);

function request(headers: Record<string, string>): Request {
  return new Request('https://example.test/resend-webhook', { method: 'POST', headers });
}

function validHeaders(overrides: Record<string, string> = {}): Record<string, string> {
  return {
    'svix-id': MSG_ID,
    'svix-timestamp': TIMESTAMP,
    'svix-signature': `v1,${EXPECTED}`,
    ...overrides,
  };
}

Deno.test('signPayload reproduces the published Svix signature', async () => {
  assertEquals(await signPayload(SECRET, MSG_ID, TIMESTAMP, PAYLOAD), EXPECTED);
});

Deno.test('signPayload accepts a secret without the whsec_ prefix', async () => {
  assertEquals(await signPayload(SECRET.slice(6), MSG_ID, TIMESTAMP, PAYLOAD), EXPECTED);
});

Deno.test('a correctly signed request is accepted', async () => {
  assertEquals(await isValidSignature(request(validHeaders()), PAYLOAD, SECRET, NOW), true);
});

Deno.test('the real signature among several versions is found', async () => {
  const headers = validHeaders({ 'svix-signature': `v0,bogus v1,${EXPECTED} v2,alsobogus` });
  assertEquals(await isValidSignature(request(headers), PAYLOAD, SECRET, NOW), true);
});

Deno.test('an unconfigured secret rejects rather than failing open', async () => {
  assertEquals(await isValidSignature(request(validHeaders()), PAYLOAD, '', NOW), false);
});

Deno.test('a tampered body is rejected', async () => {
  const tampered = '{"test": 2432232315}';
  assertEquals(await isValidSignature(request(validHeaders()), tampered, SECRET, NOW), false);
});

Deno.test('a wrong secret is rejected', async () => {
  const other = 'whsec_' + btoa('a different signing secret entirely');
  assertEquals(await isValidSignature(request(validHeaders()), PAYLOAD, other, NOW), false);
});

Deno.test('a replayed old capture is rejected', async () => {
  // Same valid signature, six minutes later.
  assertEquals(await isValidSignature(request(validHeaders()), PAYLOAD, SECRET, NOW + 360), false);
  // And six minutes before, so a future-dated timestamp cannot buy time either.
  assertEquals(await isValidSignature(request(validHeaders()), PAYLOAD, SECRET, NOW - 360), false);
});

Deno.test('a request just inside the tolerance window is accepted', async () => {
  assertEquals(await isValidSignature(request(validHeaders()), PAYLOAD, SECRET, NOW + 299), true);
});

Deno.test('missing headers are rejected', async () => {
  for (const missing of ['svix-id', 'svix-timestamp', 'svix-signature']) {
    const headers = validHeaders();
    delete headers[missing];
    assertEquals(await isValidSignature(request(headers), PAYLOAD, SECRET, NOW), false, missing);
  }
});

Deno.test('a non-numeric timestamp is rejected', async () => {
  const headers = validHeaders({ 'svix-timestamp': 'not-a-number' });
  assertEquals(await isValidSignature(request(headers), PAYLOAD, SECRET, NOW), false);
});

Deno.test('a v1 signature of the wrong length is rejected without throwing', async () => {
  const headers = validHeaders({ 'svix-signature': 'v1,short' });
  assertEquals(await isValidSignature(request(headers), PAYLOAD, SECRET, NOW), false);
});

Deno.test('an unparseable secret is rejected without throwing', async () => {
  assertEquals(await isValidSignature(request(validHeaders()), PAYLOAD, 'whsec_!!!not base64!!!', NOW), false);
});
