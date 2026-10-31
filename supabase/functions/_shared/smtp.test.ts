import { sendSmtpEmail, SmtpDeliveryError } from './smtp.ts';

// Real loopback SMTP protocol tests; no external mail is sent or queued.
async function smtpFixture(mode: 'quit_disconnect' | 'data_disconnect' | 'greeting_disconnect' | 'data_stall' | 'temporary_reject' | 'permanent_reject' | 'data_temporary_reject' | 'data_permanent_reject', run: (port: number, messages: string[]) => Promise<void>) {
  const listener = Deno.listen({ hostname: '127.0.0.1', port: 0 });
  const messages: string[] = [];
  const server = (async () => {
    const connection = await listener.accept();
    try {
      const decoder = new TextDecoder(), encoder = new TextEncoder(); let pending = '', data = false;
      const reply = (text: string) => connection.write(encoder.encode(text+'\r\n'));
      if (mode === 'greeting_disconnect') return;
      await reply('220 fixture');
      const buffer = new Uint8Array(4096);
      while (true) {
        const length = await connection.read(buffer); if (length === null) break; pending += decoder.decode(buffer.subarray(0,length));
        while (pending.includes('\n')) {
          const index = pending.indexOf('\n'), line = pending.slice(0,index).replace(/\r$/,''); pending = pending.slice(index+1);
          if (data) {
            if (line === '.') {
              data = false;
              if (mode === 'data_disconnect') return;
              if (mode !== 'data_stall') await reply(mode === 'data_temporary_reject' ? '450 queue unavailable' : mode === 'data_permanent_reject' ? '550 rejected' : '250 queued');
            }
            else messages.push(line);
          } else if (line.startsWith('EHLO')) await reply('250 fixture');
          else if (line.startsWith('MAIL')) await reply('250 sender');
          else if (line.startsWith('RCPT')) await reply(mode === 'temporary_reject' ? '450 mailbox unavailable' : mode === 'permanent_reject' ? '550 rejected' : '250 recipient');
          else if (line === 'DATA') { data = true; await reply('354 data'); }
          else if (line === 'QUIT') return;
        }
      }
    } finally { connection.close(); }
  })();
  const oldHost = Deno.env.get('SMTP_HOST'), oldPort = Deno.env.get('SMTP_PORT');
  Deno.env.set('SMTP_HOST','127.0.0.1'); Deno.env.set('SMTP_PORT',String((listener.addr as Deno.NetAddr).port));
  try { await run((listener.addr as Deno.NetAddr).port,messages); }
  finally { listener.close(); await server; if (oldHost === undefined) Deno.env.delete('SMTP_HOST'); else Deno.env.set('SMTP_HOST',oldHost); if (oldPort === undefined) Deno.env.delete('SMTP_PORT'); else Deno.env.set('SMTP_PORT',oldPort); }
}
const assert = (value: unknown, message: string) => { if (!value) throw new Error(message); };
Deno.test('accepted DATA remains successful when QUIT disconnects; message id is stable', async () => {
  await smtpFixture('quit_disconnect',async (_port,messages) => {
    await sendSmtpEmail('test@example.invalid','Fixture','<p>No external delivery</p>',{messageId:'fixture-stable@saintcreators.com'});
    assert(messages.includes('Message-ID: <fixture-stable@saintcreators.com>'),'Stable message id missing');
  });
});
Deno.test('disconnect after DATA is uncertain and cannot be retried automatically', async () => {
  await smtpFixture('data_disconnect',async () => {
    try { await sendSmtpEmail('test@example.invalid','Fixture','Test'); throw Error('Expected failure'); }
    catch (error) { assert(error instanceof SmtpDeliveryError && error.uncertain && !error.retryable,'Must classify DATA disconnect as uncertain'); }
  });
});
Deno.test('explicit SMTP 4xx is known retryable and 5xx is terminal', async () => {
  for (const mode of ['temporary_reject','permanent_reject','data_temporary_reject','data_permanent_reject'] as const) await smtpFixture(mode,async () => {
    try { await sendSmtpEmail('test@example.invalid','Fixture','Test'); throw Error('Expected rejection'); }
    catch (error) { assert(error instanceof SmtpDeliveryError && !error.uncertain && error.retryable === (mode === 'temporary_reject' || mode === 'data_temporary_reject'),'Explicit rejection classification failed'); }
  });
});
Deno.test('disconnect before DATA is safe to retry', async () => {
  await smtpFixture('greeting_disconnect',async () => {
    try { await sendSmtpEmail('test@example.invalid','Fixture','Test'); throw Error('Expected disconnect'); }
    catch (error) { assert(error instanceof SmtpDeliveryError && !error.uncertain && error.retryable,'Pre-DATA disconnect must be retryable'); }
  });
});
Deno.test('SMTP deadline closes a stalled DATA acknowledgement as uncertain', async () => {
  const startedAt = Date.now();
  await smtpFixture('data_stall',async () => {
    try { await sendSmtpEmail('test@example.invalid','Fixture','Test'); throw Error('Expected timeout'); }
    catch (error) { assert(error instanceof SmtpDeliveryError && error.uncertain && !error.retryable,'A timed out DATA acknowledgement must be uncertain'); }
  });
  assert(Date.now()-startedAt >= 14000 && Date.now()-startedAt < 25000,'SMTP conversation did not respect its 15-second deadline');
});
