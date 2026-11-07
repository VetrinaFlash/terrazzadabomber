import { test } from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/worker.js';
test('API responds safely when D1 binding is absent', async () => {
  const response = await worker.fetch(new Request('https://example.com/api/health'), { ASSETS: { fetch: async () => new Response('static') } }, { waitUntil() {} });
  assert.equal(response.status, 503);
  const data = await response.json();
  assert.equal(data.ok, false);
});
