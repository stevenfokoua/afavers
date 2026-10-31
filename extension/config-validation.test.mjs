import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isExtensionConfigured } from './config-validation.mjs';

test('the configured self-hosted release and hosted Supabase origins are accepted', () => {
  for (const url of ['https://afavers.saintcreators.com/backend', 'https://example.supabase.co', 'http://127.0.0.1:18080/backend']) {
    assert.equal(isExtensionConfigured(url, 'public-anon-test'), true, url);
  }
});
test('unconfigured, malformed and credential-bearing API locations fail visibly', () => {
  for (const url of ['', 'invalid', 'https://YOUR-PROJECT-REF.supabase.co', 'http://remote.example', 'https://name:password@example.com', 'https://example.com/?token=a', 'https://example.com/#key']) {
    assert.equal(isExtensionConfigured(url, 'public-anon-test'), false);
  }
  assert.equal(isExtensionConfigured('https://afavers.saintcreators.com/backend', ''), false);
  assert.equal(isExtensionConfigured('https://example.com', 'YOUR-SUPABASE-ANON-KEY'), false);
});
