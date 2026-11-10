import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import worker from '../src/worker.js';

function mockDatabase() {
  const sqlite = new DatabaseSync(':memory:');
  for (const file of readdirSync(new URL('../migrations/', import.meta.url)).filter(f => f.endsWith('.sql')).sort())
    sqlite.exec(readFileSync(new URL('../migrations/' + file, import.meta.url), 'utf8'));
  const wrap = query => { const st = sqlite.prepare(query); let b = []; return { bind(...v) { b = v; return this; }, async all() { return { results: st.all(...b) }; }, async first() { return st.get(...b) ?? null; }, async run() { const { changes } = st.run(...b); return { meta: { changes } }; } }; };
  const DB = { prepare: wrap, async batch(qs) { sqlite.exec('BEGIN'); try { const r = []; for (const q of qs) r.push(await q.run()); sqlite.exec('COMMIT'); return r; } catch (e) { sqlite.exec('ROLLBACK'); throw e; } } };
  return { DB, sqlite };
}
const password = 'a-strong-demo-password-123!';
const ctx = { waitUntil(p) { p?.catch?.(() => {}); } };
const env = DB => ({ DB, ADMIN_PASSWORD: password, ASSETS: { fetch: async () => new Response('ok') } });
const req = (path, method = 'GET', body = null, cookie = '') => new Request('https://example.com' + path, { method, headers: { ...(method === 'GET' ? {} : { Origin: 'https://example.com', 'Content-Type': 'application/json' }), ...(cookie ? { Cookie: cookie } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
const call = async (e, ...a) => { const r = await worker.fetch(req(...a), e, ctx); return { status: r.status, headers: r.headers, data: await r.json() }; };
const tomorrowOpen = () => { const d = new Date(); d.setUTCDate(d.getUTCDate() + 1); if (d.getUTCDay() === 2) d.setUTCDate(d.getUTCDate() + 1); return d.toISOString().slice(0, 10); };
const login = async e => (await call(e, '/api/admin/login', 'POST', { password })).headers.get('set-cookie').split(';')[0];

test('real Tipiko menu and site info are public', async () => {
  const { DB } = mockDatabase(); const e = env(DB);
  const menu = await call(e, '/api/menu');
  assert.equal(menu.status, 200);
  const items = menu.data.categories.flatMap(c => c.items);
  assert.ok(items.length >= 140);
  const tipiko = items.find(i => i.name === 'Tipiko');
  assert.equal(tipiko.price_cents, 1200); assert.equal(tipiko.orderable, true);
  assert.equal(items.find(i => /piccola/.test(i.name)).orderable, false);
  const pub = await call(e, '/api/public');
  assert.equal(pub.data.site.name, 'Tipiko');
  assert.deepEqual(pub.data.closed_weekdays, [2]);
  assert.equal(pub.data.ordering.ordering_enabled, true);
});

test('order is priced on the server, tracked, capacity-limited and managed by staff', async () => {
  const { DB, sqlite } = mockDatabase(); const e = env(DB); const date = tomorrowOpen();
  const slots = await call(e, '/api/order-slots?date=' + date);
  assert.ok(slots.data.slots.includes('20:00'));
  const ids = Object.fromEntries(sqlite.prepare('SELECT name,id FROM menu_items').all().map(r => [r.name, r.id]));
  const order = { type: 'takeaway', date, time: '20:00', name: 'Mario Rossi', phone: '3291234567', payment: 'cash', privacy: true,
    items: [{ id: ids['Tipiko'], qty: 2, price_cents: 1 }, { id: ids['Regina margherita'], qty: 1, notes: 'ben cotta' }] };
  const created = await call(e, '/api/orders', 'POST', order);
  assert.equal(created.status, 201, JSON.stringify(created.data));
  assert.equal(created.data.total_cents, 3000);
  assert.match(created.data.code, /^TK-[A-Z0-9]{5}$/);
  const token = created.data.track_url.split('#')[1];
  const tracked = await call(e, '/api/order/lookup', 'POST', { token });
  assert.equal(tracked.data.order.items.length, 2);
  assert.equal(tracked.data.order.status, 'pending');
  // Draft beers cannot be ordered online.
  const beer = await call(e, '/api/orders', 'POST', { ...order, items: [{ id: ids['Angelo Poretti 4 Luppoli Originale piccola'], qty: 1 }] });
  assert.equal(beer.status, 409);
  // Slot capacity (default 5) is enforced.
  for (let i = 0; i < 4; i++) assert.equal((await call(e, '/api/orders', 'POST', order)).status, 201);
  const full = await call(e, '/api/orders', 'POST', order);
  assert.equal(full.status, 409);
  assert.ok(!(await call(e, '/api/order-slots?date=' + date)).data.slots.includes('20:00'));
  // Staff workflow.
  const cookie = await login(e);
  const list = await call(e, '/api/admin/orders?date=' + date, 'GET', null, cookie);
  assert.equal(list.data.orders.length, 5);
  assert.equal(list.data.orders[0].track_token_hash, undefined);
  const id = list.data.orders[0].id;
  assert.equal((await call(e, '/api/admin/orders/' + id, 'PATCH', { status: 'out_for_delivery' }, cookie)).status, 400);
  assert.equal((await call(e, '/api/admin/orders/' + id, 'PATCH', { status: 'preparing' }, cookie)).status, 200);
  const status = (await call(e, '/api/order/lookup', 'POST', { token })).data.order.status;
  const cancel = await call(e, '/api/order/cancel', 'POST', { token });
  assert.equal(cancel.status, status === 'pending' ? 200 : 409);
  assert.equal((await call(e, '/api/order/lookup', 'POST', { token: 'x'.repeat(43) })).status, 404);
});

test('delivery requires address and respects settings; closed days have no slots', async () => {
  const { DB, sqlite } = mockDatabase(); const e = env(DB); const date = tomorrowOpen();
  const id = sqlite.prepare("SELECT id FROM menu_items WHERE name='Silana'").get().id;
  const base = { type: 'delivery', date, time: '20:00', name: 'Anna Bianchi', phone: '3291234567', privacy: true, items: [{ id, qty: 1 }] };
  assert.equal((await call(e, '/api/orders', 'POST', base)).status, 400);
  const cookie = await login(e);
  const current = (await call(e, '/api/admin/order-settings', 'GET', null, cookie)).data.settings;
  const saved = await call(e, '/api/admin/order-settings', 'POST', { ordering_enabled: true, takeaway_enabled: true, delivery_enabled: true, card_payment_enabled: true, slots: current.slots, slot_capacity: 5, lead_minutes: 30, days_ahead: 2, delivery_fee_cents: 250, delivery_min_cents: 1500, delivery_area: 'Amantea', site: current.site }, cookie);
  assert.equal(saved.status, 200, JSON.stringify(saved.data));
  assert.equal((await call(e, '/api/orders', 'POST', { ...base, address: 'Via Roma 10, Amantea' })).status, 409); // 9 € < 15 € minimum
  const ok = await call(e, '/api/orders', 'POST', { ...base, address: 'Via Roma 10, Amantea', items: [{ id, qty: 2 }] });
  assert.equal(ok.status, 201, JSON.stringify(ok.data));
  assert.equal(ok.data.total_cents, 2050);
  const d = new Date(); d.setUTCDate(d.getUTCDate() + ((2 - d.getUTCDay() + 7) % 7 || 7));
  const tuesday = d.toISOString().slice(0, 10);
  const closed = await call(e, '/api/order-slots?date=' + tuesday);
  assert.equal(closed.data.closed, true); assert.equal(closed.data.slots.length, 0);
});

test('menu admin CRUD', async () => {
  const { DB } = mockDatabase(); const e = env(DB); const cookie = await login(e);
  assert.equal((await call(e, '/api/admin/menu')).status, 401);
  const before = await call(e, '/api/admin/menu', 'GET', null, cookie);
  const cat = before.data.categories.find(c => c.name === 'Pizze classiche');
  assert.equal((await call(e, '/api/admin/menu/items', 'POST', { category_id: cat.id, name: 'Pizza test', description: 'Prova', price_cents: 1050, tags: ['piccante', 'xx'] }, cookie)).status, 200);
  const after = await call(e, '/api/admin/menu', 'GET', null, cookie);
  const item = after.data.categories.find(c => c.id === cat.id).items.find(i => i.name === 'Pizza test');
  assert.deepEqual(item.tags, ['piccante']);
  assert.equal((await call(e, '/api/admin/menu/items/' + item.id, 'PATCH', { available: false }, cookie)).status, 200);
  assert.ok(!(await call(e, '/api/menu')).data.categories.flatMap(c => c.items).some(i => i.id === item.id));
  assert.equal((await call(e, '/api/admin/menu/categories/' + cat.id, 'DELETE', null, cookie)).status, 409);
  assert.equal((await call(e, '/api/admin/menu/items/' + item.id, 'DELETE', null, cookie)).status, 200);
});
