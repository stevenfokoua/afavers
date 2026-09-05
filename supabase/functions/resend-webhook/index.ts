import { adminClient } from '../_shared/jobs.ts';
import { handleOptions, jsonResponse } from '../_shared/cors.ts';
import { isValidSignature } from '../_shared/svix.ts';

// Bounce and complaint webhook from Resend. It writes to email_suppressions
// with the service-role client, so it must authenticate the caller before
// touching the database: without that, anyone who knows the URL can suppress
// mail to any address they choose. See _shared/svix.ts for the check itself.

Deno.serve(async (req) => {
  const options = handleOptions(req);
  if (options) return options;

  const rawBody = await req.text();
  const secret = Deno.env.get('RESEND_WEBHOOK_SECRET') ?? '';
  if (!(await isValidSignature(req, rawBody, secret))) {
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
