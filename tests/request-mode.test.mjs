import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import worker from '../src/worker.js';

function mockDatabase() {
  const sqlite = new DatabaseSync(':memory:');
  for (const file of ['0001_initial.sql', '0002_requests_mode.sql']) {
    sqlite.exec(readFileSync(new URL('../migrations/' + file, import.meta.url), 'utf8'));
  }
  const DB = {
    prepare(query) {
      const statement = sqlite.prepare(query);
      let bindings = [];
      return {
        bind(...values) { bindings = values; return this; },
        async all() { return { results: statement.all(...bindings) }; },
        async first() { return statement.get(...bindings) ?? null; },
        async run() { const { changes } = statement.run(...bindings); return { meta: { changes } }; }
      };
    },
    async batch(queries) {
      sqlite.exec('BEGIN');
      try {
        const results = [];
        for (const statement of queries) results.push(await statement.run());
        sqlite.exec('COMMIT');
        return results;
      } catch (error) {
        sqlite.exec('ROLLBACK'); throw error;
      }
    }
  };
  return { DB, sqlite };
}
const password = 'a-strong-demo-password-123!';
const envFor = DB => ({
  DB, ADMIN_PASSWORD: password,
  ASSETS: { fetch: async () => new Response('ok') }
});
const ctx = { waitUntil(promise) { if (promise) promise.catch(() => {}); } };
function req(path, method = 'GET', body = null, cookie = '') {
  const headers = { ...(method === 'GET' ? {} : { Origin: 'https://example.com', 'Content-Type': 'application/json' }), ...(cookie ? { Cookie: cookie } : {}) };
  return new Request('https://example.com' + path, { method, headers, ...(body ? { body: JSON.stringify(body) } : {}) });
}
const read = async response => ({ status: response.status, headers: response.headers, data: await response.json() });
const futureDate = () => {
  const d = new Date(); d.setUTCDate(d.getUTCDate() + 4);
  return d.toISOString().slice(0, 10);
};
test('pending customer request after migration is saved WITHOUT assigning demo tables', async () => {
  const { DB, sqlite } = mockDatabase();
  const env = envFor(DB);
  const publicConfig = await read(await worker.fetch(req('/api/public'), env, ctx));
  assert.equal(publicConfig.status, 200);
  assert.equal(publicConfig.data.booking_enabled, true);
  assert.equal(publicConfig.data.booking_mode, 'request');
  const date = futureDate();
  const availability = await read(await worker.fetch(req('/api/availability?date=' + date + '&guests=2'), env, ctx));
  assert.ok(availability.data.slots.includes('20:00'));
  const request = { date, time: '20:00', guests: 2, name: 'Mario Rossi', phone: '3332866829', privacy: true, notes: 'Tavolo esterno' };
  const booking = await read(await worker.fetch(req('/api/reservations', 'POST', request), env, ctx));
  assert.equal(booking.status, 201, JSON.stringify(booking.data));
  const record = sqlite.prepare('SELECT id,table_id,status FROM reservations WHERE id=?').get(booking.data.id);
  assert.equal(record.table_id, null);
  assert.equal(record.status, 'pending');
  const login = await read(await worker.fetch(req('/api/admin/login', 'POST', { password }), env, ctx));
  assert.equal(login.status, 200);
  const cookie = login.headers.get('set-cookie').split(';')[0];
  const dashboard = await read(await worker.fetch(req('/api/admin/dashboard?date=' + date, 'GET', null, cookie), env, ctx));
  assert.equal(dashboard.data.bookings.length, 1);
  const premature = await read(await worker.fetch(req('/api/admin/reservations/' + record.id, 'PATCH', { status: 'confirmed' }, cookie), env, ctx));
  assert.equal(premature.status, 400);
  const confirmed = await read(await worker.fetch(req('/api/admin/reservations/' + record.id, 'PATCH', { status: 'confirmed', table_id: 1 }, cookie), env, ctx));
  assert.equal(confirmed.status, 200, JSON.stringify(confirmed.data));
  assert.equal(sqlite.prepare('SELECT status,table_id FROM reservations WHERE id=?').get(record.id).table_id, 1);
  const cancelled = await read(await worker.fetch(req('/api/admin/reservations/' + record.id, 'PATCH', { status: 'cancelled' }, cookie), env, ctx));
  assert.equal(cancelled.status, 200);
});
test('automatic table allocation is still supported when staff explicitly selects that mode', async () => {
  const { DB, sqlite } = mockDatabase(); const env = envFor(DB);
  const login = await read(await worker.fetch(req('/api/admin/login', 'POST', { password }), env, ctx));
  const cookie = login.headers.get('set-cookie').split(';')[0];
  const cfg = await read(await worker.fetch(req('/api/admin/settings', 'POST', {
    booking_enabled: true, booking_mode: 'auto', max_guests: 8, duration: 120,
    slots: ['19:00', '20:00', '21:00'], closed_dates: []
  }, cookie), env, ctx));
  assert.equal(cfg.status, 200, JSON.stringify(cfg.data));
  const data = { date: futureDate(), time: '20:00', guests: 2, name: 'Laura Rossi', phone: '3931922629', privacy: true };
  const booked = await read(await worker.fetch(req('/api/reservations', 'POST', data), env, ctx));
  assert.equal(booked.status, 201, JSON.stringify(booked.data));
  assert.ok(sqlite.prepare('SELECT table_id FROM reservations WHERE id=?').get(booked.data.id).table_id);
});
