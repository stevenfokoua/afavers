// Self-hosted delivery via the VPS's existing Postfix relay. No external mail
// account or API is required. Use only a trusted private-network SMTP endpoint.
export class SmtpDeliveryError extends Error {
  constructor(message: string, public readonly uncertain: boolean, public readonly retryable: boolean) { super(message); this.name = 'SmtpDeliveryError'; }
}

export async function sendSmtpEmail(to: string, subject: string, html: string, options: { messageId?: string } = {}): Promise<void> {
  const startedAt = Date.now();
  const from = Deno.env.get('SMTP_FROM') || 'afavers@saintcreators.com';
  if (![from, to].every((value) => /^[^\s<>@\r\n]+@[^\s<>@\r\n]+$/.test(value))) {
    throw new SmtpDeliveryError('Invalid mail address', false, false);
  }
  const messageId = options.messageId || crypto.randomUUID() + '@saintcreators.com';
  if (!/^[a-zA-Z0-9._+-]+@[a-zA-Z0-9.-]+$/.test(messageId)) throw new SmtpDeliveryError('Invalid message identifier', false, false);
  let conn: Deno.Conn;
  let connectTimer: ReturnType<typeof setTimeout> | undefined;
  let connectExpired = false;
  const connecting = Deno.connect({ hostname: Deno.env.get('SMTP_HOST') || 'localhost', port: Number(Deno.env.get('SMTP_PORT') || 25) });
  // Deno.connect has no AbortSignal; close a connection that arrives after timeout.
  void connecting.then(connection => { if (connectExpired) connection.close(); }).catch(() => {});
  try { conn = await Promise.race([connecting,new Promise<never>((_resolve,reject) => { connectTimer = setTimeout(() => { connectExpired = true; reject(new Error('SMTP connect timeout')); },15000); })]); }
  catch { throw new SmtpDeliveryError('SMTP connection unavailable', false, true); }
  finally { if (connectTimer) clearTimeout(connectTimer); }
  const timeout = setTimeout(() => { try { conn.close(); } catch { /* already closed */ } }, Math.max(1,15000-(Date.now()-startedAt)));
  const reader = conn.readable.getReader();
  const writer = conn.writable.getWriter();
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  let pending = '';
  let submitted = false;
  let accepted = false;
  async function response(expected: number[]): Promise<void> {
    while (true) {
      const end = pending.indexOf('\n');
      if (end >= 0) {
        const line = pending.slice(0, end).replace(/\r$/, '');
        pending = pending.slice(end + 1);
        if (/^\d{3} /.test(line)) {
          const code = Number(line.slice(0, 3));
          if (!expected.includes(code)) throw new SmtpDeliveryError(`SMTP rejected request (${code})`, false, code >= 400 && code < 500);
          return;
        }
      } else {
        const chunk = await reader.read();
        if (chunk.done) throw new Error('SMTP connection closed before acceptance');
        pending += decoder.decode(chunk.value, { stream: true });
      }
    }
  }
  async function command(line: string, expected: number[]): Promise<void> {
    await writer.write(encoder.encode(line + '\r\n'));
    await response(expected);
  }
  const encode = (value: string) => btoa(String.fromCharCode(...encoder.encode(value)));
  try {
    await response([220]);
    await command('EHLO afavers.saintcreators.com', [250]);
    await command(`MAIL FROM:<${from}>`, [250]);
    await command(`RCPT TO:<${to}>`, [250, 251]);
    await command('DATA', [354]);
    const body = encode(html).match(/.{1,76}/g)?.join('\r\n') || '';
    const message = [`From: afavers <${from}>`, `To: <${to}>`, `Subject: =?UTF-8?B?${encode(subject)}?=`, `Date: ${new Date().toUTCString()}`, `Message-ID: <${messageId}>`, 'MIME-Version: 1.0', 'Content-Type: text/html; charset=UTF-8', 'Content-Transfer-Encoding: base64', '', body].join('\r\n');
    submitted = true;
    await command(message + '\r\n.', [250]);
    accepted = true;
    // A failed QUIT after DATA was accepted must never turn success into a retry.
    try { await command('QUIT', [221]); } catch { /* already queued by the relay */ }
  } catch (error) {
    if (accepted) return;
    if (error instanceof SmtpDeliveryError) throw error;
    throw new SmtpDeliveryError(submitted ? 'SMTP acceptance is unknown' : 'SMTP connection interrupted', submitted, !submitted);
  } finally {
    clearTimeout(timeout);
    reader.releaseLock();
    writer.releaseLock();
    try { conn.close(); } catch { /* already closed */ }
  }
}
