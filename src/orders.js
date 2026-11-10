/** Tipiko — menu digitale e ordini online (asporto / consegna) su Cloudflare D1. */
import { isClosed } from './closures.js';

class UserError extends Error {}
const ZONE = 'Europe/Rome';
const ACTIVE_ORDER = ['pending', 'confirmed', 'preparing', 'ready', 'out_for_delivery'];
const ORDER_STATUSES = [...ACTIVE_ORDER, 'completed', 'cancelled', 'rejected'];
const TAGS = ['vegano', 'vegetariano', 'senza-glutine', 'piccante', 'dolce', 'novita'];

const json = (body, status = 200, headers = {}) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...headers } });
const fail = (error, status = 400) => json({ ok: false, error }, status);
const clean = (v, max = 120) => String(v ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max);
const cleanMultiline = (v, max = 400) => String(v ?? '').replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, ' ').trim().slice(0, max);
const okDate = s => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s + 'T12:00:00Z')) && new Date(s + 'T12:00:00Z').toISOString().slice(0, 10) === s;
const okTime = s => /^([01]\d|2[0-3]):[0-5]\d$/.test(s);
const mins = s => Number(s.slice(0, 2)) * 60 + Number(s.slice(3, 5));
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const clock = () => new Intl.DateTimeFormat('en-GB', { timeZone: ZONE, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date());
const dayOffset = d => (Date.parse(d + 'T12:00:00Z') - Date.parse(today() + 'T12:00:00Z')) / 86400000;
const b64 = bytes => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const hash = async token => b64(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token))));
const okToken = t => typeof t === 'string' && /^[A-Za-z0-9_-]{43}$/.test(t);
const httpsUrl = s => s === '' || (/^https:\/\/[^\s<>"']+$/.test(s) && s.length <= 300);
const phoneOK = s => /^\+?[0-9\s().-]{8,22}$/.test(s) && s.replace(/\D/g, '').length >= 8;

const SITE_KEYS = ['site_name', 'site_tagline', 'site_address', 'site_city', 'site_phone', 'site_whatsapp', 'site_email', 'site_hours', 'site_instagram', 'site_facebook', 'site_maps_url'];

export async function orderConfig(env) {
  const rows = (await env.DB.prepare('SELECT key,value FROM settings').all()).results;
  const s = Object.fromEntries(rows.map(r => [r.key, r.value]));
  const list = v => { try { const x = JSON.parse(v || '[]'); return Array.isArray(x) ? x : []; } catch { return []; } };
  const num = (v, d) => Number.isFinite(Number(v)) && v !== undefined && v !== '' ? Number(v) : d;
  return {
    ordering_enabled: s.ordering_enabled !== 'false',
    takeaway_enabled: s.takeaway_enabled !== 'false',
    delivery_enabled: s.delivery_enabled === 'true',
    card_payment_enabled: s.card_payment_enabled !== 'false',
    slots: list(s.order_slots).filter(okTime).sort(),
    slot_capacity: num(s.order_slot_capacity, 5),
    lead_minutes: num(s.order_lead_minutes, 30),
    days_ahead: num(s.order_days_ahead, 2),
    delivery_fee_cents: num(s.delivery_fee_cents, 0),
    delivery_min_cents: num(s.delivery_min_cents, 0),
    delivery_area: s.delivery_area || '',
    closures: { closed_dates: list(s.closed_dates), closed_weekdays: list(s.closed_weekdays), closed_periods: list(s.closed_periods) },
    site: Object.fromEntries(SITE_KEYS.map(k => [k.slice(5), s[k] || '']))
  };
}

const publicOrderConfig = c => ({
  ordering_enabled: c.ordering_enabled && (c.takeaway_enabled || c.delivery_enabled),
  takeaway_enabled: c.takeaway_enabled, delivery_enabled: c.delivery_enabled,
  card_payment_enabled: c.card_payment_enabled, days_ahead: c.days_ahead,
  delivery_fee_cents: c.delivery_fee_cents, delivery_min_cents: c.delivery_min_cents,
  delivery_area: c.delivery_area, lead_minutes: c.lead_minutes
});
export const publicInfo = async env => { const c = await orderConfig(env); return { site: c.site, ordering: publicOrderConfig(c) }; };

async function menu(env, admin = false) {
  const cats = (await env.DB.prepare(`SELECT id,section,name,description,position,active FROM menu_categories ${admin ? '' : 'WHERE active=1'} ORDER BY position,id`).all()).results;
  const items = (await env.DB.prepare(`SELECT id,category_id,name,description,price_cents,allergens,tags,image_url,available,orderable,position FROM menu_items ${admin ? '' : 'WHERE available=1'} ORDER BY position,id`).all()).results;
  const byCat = new Map(cats.map(c => [c.id, { ...c, active: !!c.active, items: [] }]));
  for (const i of items) byCat.get(i.category_id)?.items.push({ ...i, available: !!i.available, orderable: !!i.orderable && i.price_cents > 0, tags: i.tags ? i.tags.split(',').filter(Boolean) : [] });
  return [...byCat.values()].filter(c => admin || c.items.length);
}

async function slotLoad(env, date) {
  const rows = (await env.DB.prepare(`SELECT service_time t, COUNT(*) n FROM orders WHERE service_date=? AND status NOT IN ('cancelled','rejected') GROUP BY service_time`).bind(date).all()).results;
  return Object.fromEntries(rows.map(r => [r.t, r.n]));
}
async function availableSlots(env, c, date) {
  if (!c.ordering_enabled || !okDate(date) || dayOffset(date) < 0 || dayOffset(date) > c.days_ahead || isClosed(c.closures, date)) return [];
  const load = await slotLoad(env, date);
  const limit = date === today() ? mins(clock()) + c.lead_minutes : -1;
  return c.slots.filter(t => mins(t) >= limit && (load[t] || 0) < c.slot_capacity);
}

function validateOrder(d, c) {
  const type = d.type === 'delivery' ? 'delivery' : d.type === 'takeaway' ? 'takeaway' : '';
  if (!type) throw new UserError('Scegli asporto o consegna');
  if (type === 'delivery' && !c.delivery_enabled) throw new UserError('La consegna a domicilio non è disponibile al momento');
  if (type === 'takeaway' && !c.takeaway_enabled) throw new UserError('L’asporto non è disponibile al momento');
  const date = clean(d.date, 10), time = clean(d.time, 5);
  if (!okDate(date) || !okTime(time)) throw new UserError('Scegli giorno e orario');
  const name = clean(d.name, 70), phone = clean(d.phone, 30), address = clean(d.address, 180), notes = cleanMultiline(d.notes, 400);
  if (name.length < 3 || /[<>]/.test(name)) throw new UserError('Inserisci nome e cognome');
  if (!phoneOK(phone)) throw new UserError('Inserisci un telefono valido');
  if (type === 'delivery' && address.length < 6) throw new UserError('Inserisci l’indirizzo di consegna completo');
  const payment = d.payment === 'card' ? 'card' : 'cash';
  if (payment === 'card' && !c.card_payment_enabled) throw new UserError('Pagamento con carta non disponibile');
  if (!Array.isArray(d.items) || !d.items.length) throw new UserError('Il carrello è vuoto');
  if (d.items.length > 40) throw new UserError('Troppi prodotti nello stesso ordine: chiamaci');
  const lines = d.items.map(x => ({ id: Number(x?.id), qty: Number(x?.qty), notes: clean(x?.notes, 120) }));
  if (lines.some(l => !Number.isInteger(l.id) || l.id < 1 || !Number.isInteger(l.qty) || l.qty < 1 || l.qty > 30)) throw new UserError('Quantità non valida nel carrello');
  return { type, date, time, name, phone, address: type === 'delivery' ? address : '', notes, payment, lines };
}

const code = () => { const a = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; const b = new Uint8Array(5); crypto.getRandomValues(b); return 'TK-' + [...b].map(x => a[x % a.length]).join(''); };
const newToken = () => { const b = new Uint8Array(32); crypto.getRandomValues(b); return b64(b); };

async function createOrder(env, data, c) {
  const slots = await availableSlots(env, c, data.date);
  if (!c.slots.includes(data.time)) throw new UserError('Orario non disponibile');
  if (!slots.includes(data.time)) throw new UserError('Questo orario è appena stato completato, scegline un altro');
  const ids = [...new Set(data.lines.map(l => l.id))];
  const found = (await env.DB.prepare(`SELECT i.id,i.name,i.price_cents FROM menu_items i JOIN menu_categories c ON c.id=i.category_id WHERE i.available=1 AND i.orderable=1 AND i.price_cents>0 AND c.active=1 AND i.id IN (${ids.map(() => '?').join(',')})`).bind(...ids).all()).results;
  const byId = new Map(found.map(i => [i.id, i]));
  const missing = data.lines.find(l => !byId.has(l.id));
  if (missing) throw new UserError('Alcuni prodotti non sono più disponibili: aggiorna il carrello');
  const subtotal = data.lines.reduce((n, l) => n + byId.get(l.id).price_cents * l.qty, 0);
  if (subtotal > 200000) throw new UserError('Per ordini così grandi contattaci direttamente');
  if (data.type === 'delivery' && subtotal < c.delivery_min_cents) throw new UserError(`Ordine minimo per la consegna: ${(c.delivery_min_cents / 100).toFixed(2).replace('.', ',')} €`);
  const fee = data.type === 'delivery' ? c.delivery_fee_cents : 0;
  const id = crypto.randomUUID(), token = newToken(), tokenHash = await hash(token);
  for (let attempt = 0; attempt < 3; attempt++) {
    const orderCode = code();
    const statements = [
      env.DB.prepare(`INSERT INTO orders(id,code,order_type,service_date,service_time,customer_name,phone,address,notes,payment_method,subtotal_cents,delivery_fee_cents,total_cents,track_token_hash)
        SELECT ?,?,?,?,?,?,?,?,?,?,?,?,?,? WHERE (SELECT COUNT(*) FROM orders WHERE service_date=? AND service_time=? AND status NOT IN ('cancelled','rejected')) < ?`)
        .bind(id, orderCode, data.type, data.date, data.time, data.name, data.phone, data.address, data.notes, data.payment, subtotal, fee, subtotal + fee, tokenHash, data.date, data.time, c.slot_capacity),
      ...data.lines.map(l => env.DB.prepare('INSERT INTO order_items(order_id,item_id,name,unit_price_cents,quantity,notes) SELECT ?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM orders WHERE id=?)')
        .bind(id, l.id, byId.get(l.id).name, byId.get(l.id).price_cents, l.qty, l.notes, id))
    ];
    try {
      const results = await env.DB.batch(statements);
      if (!results[0].meta?.changes) throw new UserError('Questo orario è appena stato completato, scegline un altro');
      return { id, code: orderCode, token, subtotal, fee, total: subtotal + fee };
    } catch (e) {
      if (/UNIQUE/i.test(String(e?.message)) && attempt < 2) continue;
      throw e;
    }
  }
}

async function activity(env, id, action, actor, details = {}) {
  try { await env.DB.prepare('INSERT INTO order_activity(order_id,action,actor,details) VALUES(?,?,?,?)').bind(id, action, actor, JSON.stringify(details).slice(0, 1500)).run(); }
  catch (e) { console.warn('Order history unavailable', String(e)); }
}
const itemsFor = async (env, ids) => {
  if (!ids.length) return new Map();
  const rows = (await env.DB.prepare(`SELECT order_id,item_id,name,unit_price_cents,quantity,notes FROM order_items WHERE order_id IN (${ids.map(() => '?').join(',')}) ORDER BY id`).bind(...ids).all()).results;
  const map = new Map(); for (const r of rows) { if (!map.has(r.order_id)) map.set(r.order_id, []); map.get(r.order_id).push(r); } return map;
};
const customerView = (o, items) => ({ code: o.code, type: o.order_type, date: o.service_date, time: o.service_time, name: o.customer_name, phone: o.phone, address: o.address, notes: o.notes, payment: o.payment_method, subtotal_cents: o.subtotal_cents, delivery_fee_cents: o.delivery_fee_cents, total_cents: o.total_cents, status: o.status, created_at: o.created_at, items: items.map(i => ({ name: i.name, qty: i.quantity, unit_price_cents: i.unit_price_cents, notes: i.notes })) });

function validateItem(d) {
  const name = clean(d.name, 120), description = cleanMultiline(d.description, 400), allergens = clean(d.allergens, 120);
  const price = Math.round(Number(d.price_cents));
  const category = Number(d.category_id), position = Number(d.position ?? 0);
  if (name.length < 2 || /[<>]/.test(name)) throw new UserError('Nome del piatto non valido');
  if (/[<>]/.test(description) || /[<>]/.test(allergens)) throw new UserError('Descrizione non valida');
  if (!Number.isInteger(price) || price < 0 || price > 100000) throw new UserError('Prezzo non valido');
  if (!Number.isInteger(category) || category < 1) throw new UserError('Categoria non valida');
  if (!Number.isInteger(position) || position < 0 || position > 9999) throw new UserError('Posizione non valida');
  const tags = (Array.isArray(d.tags) ? d.tags : String(d.tags || '').split(',')).map(t => clean(t, 20).toLowerCase()).filter(t => TAGS.includes(t));
  const image = clean(d.image_url, 300);
  if (!httpsUrl(image) && !/^\/assets\/[\w./-]+$/.test(image)) throw new UserError('Immagine: usa un indirizzo https');
  return { name, description, allergens, price, category, position, tags: [...new Set(tags)].join(','), image, available: d.available === false ? 0 : 1, orderable: d.orderable === false ? 0 : 1 };
}
function validateCategory(d) {
  const name = clean(d.name, 80), description = clean(d.description, 200), section = clean(d.section, 40) || 'Menu', position = Number(d.position ?? 0);
  if (name.length < 2 || [name, description, section].some(x => /[<>]/.test(x))) throw new UserError('Dati categoria non validi');
  if (!Number.isInteger(position) || position < 0 || position > 9999) throw new UserError('Posizione non valida');
  return { name, description, section, position, active: d.active === false ? 0 : 1 };
}
function validateOrderSettings(d) {
  const slots = d.slots;
  if (!Array.isArray(slots) || slots.length < 1 || slots.length > 80 || slots.some(x => !okTime(x)) || new Set(slots).size !== slots.length) throw new UserError('Fasce orarie degli ordini non valide');
  const int = (v, lo, hi, msg) => { const n = Math.round(Number(v)); if (!Number.isInteger(n) || n < lo || n > hi) throw new UserError(msg); return n; };
  const out = {
    ordering_enabled: String(d.ordering_enabled === true), takeaway_enabled: String(d.takeaway_enabled === true), delivery_enabled: String(d.delivery_enabled === true), card_payment_enabled: String(d.card_payment_enabled === true),
    order_slots: JSON.stringify([...slots].sort()),
    order_slot_capacity: String(int(d.slot_capacity, 1, 200, 'Ordini per fascia: valore non valido')),
    order_lead_minutes: String(int(d.lead_minutes, 0, 300, 'Preavviso non valido')),
    order_days_ahead: String(int(d.days_ahead, 0, 14, 'Giorni prenotabili non validi')),
    delivery_fee_cents: String(int(d.delivery_fee_cents, 0, 10000, 'Costo consegna non valido')),
    delivery_min_cents: String(int(d.delivery_min_cents, 0, 50000, 'Ordine minimo non valido')),
    delivery_area: clean(d.delivery_area, 200)
  };
  if (/[<>]/.test(out.delivery_area)) throw new UserError('Zona di consegna non valida');
  const site = d.site || {};
  for (const key of SITE_KEYS) {
    const k = key.slice(5), v = clean(site[k], k === 'hours' ? 240 : 160);
    if (/[<>]/.test(v)) throw new UserError('Dati del locale non validi');
    if (['instagram', 'facebook', 'maps_url'].includes(k) && !httpsUrl(v)) throw new UserError('I link devono iniziare con https://');
    if (['phone', 'whatsapp'].includes(k) && v && !phoneOK(v)) throw new UserError('Telefono del locale non valido');
    if (k === 'email' && v && !/^[^\s@<>]+@[^\s@<>]+\.[a-z]{2,}$/i.test(v)) throw new UserError('Email non valida');
    if (k === 'name' && v.length < 2) throw new UserError('Inserisci il nome del locale');
    out[key] = v;
  }
  return out;
}

/** Handles every menu/order route. Returns null when the path is not ours. */
export async function handleOrders(req, env, ctx, p, h) {
  const method = req.method;
  if (p === '/api/menu' && method === 'GET') return json({ ok: true, categories: await menu(env) }, 200, { 'Cache-Control': 'public, max-age=30' });
  if (p === '/api/order-slots' && method === 'GET') {
    const q = new URL(req.url).searchParams, date = q.get('date') || '';
    if (!okDate(date)) return fail('Data non valida');
    const c = await orderConfig(env);
    const closed = isClosed(c.closures, date);
    return json({ ok: true, date, closed, slots: await availableSlots(env, c, date) });
  }
  if (p === '/api/orders' && method === 'POST') {
    const d = await h.getJSON(req, 16000);
    if (d.company) return json({ ok: true });
    if (d.privacy !== true) return fail('Accetta l’informativa privacy');
    const c = await orderConfig(env);
    if (!c.ordering_enabled) return fail('Gli ordini online sono momentaneamente sospesi. Chiamaci!', 409);
    const ip = req.headers.get('CF-Connecting-IP') || 'unknown';
    if (!await h.rate(env, 'order:' + await h.sha(ip + ':' + today()), 10, 3600)) return fail('Troppi ordini da questo dispositivo. Chiamaci per completare.', 429);
    let data; try { data = validateOrder(d, c); } catch (e) { return fail(e.message); }
    let result; try { result = await createOrder(env, data, c); } catch (e) { if (e instanceof UserError) return fail(e.message, 409); throw e; }
    await activity(env, result.id, 'created', 'customer', { type: data.type, date: data.date, time: data.time, total: result.total });
    ctx.waitUntil(h.sendPush(env));
    return json({ ok: true, code: result.code, total_cents: result.total, track_url: new URL(req.url).origin + '/ordine/#' + result.token }, 201);
  }
  if ((p === '/api/order/lookup' || p === '/api/order/cancel') && method === 'POST') {
    const ip = req.headers.get('CF-Connecting-IP') || 'unknown';
    if (!await h.rate(env, 'track:' + await h.sha(ip), 60, 900)) return fail('Troppe richieste, riprova tra poco', 429);
    const d = await h.getJSON(req);
    if (!okToken(d.token)) return fail('Link non valido o scaduto', 404);
    const o = await env.DB.prepare('SELECT * FROM orders WHERE track_token_hash=?').bind(await hash(d.token)).first();
    if (!o) return fail('Link non valido o scaduto', 404);
    if (p === '/api/order/cancel') {
      if (o.status !== 'pending') return fail('L’ordine è già in lavorazione: per modifiche chiama il ristorante', 409);
      const r = await env.DB.prepare("UPDATE orders SET status='cancelled',revision=revision+1,updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='pending' AND revision=?").bind(o.id, o.revision).run();
      if (!r.meta?.changes) return fail('L’ordine è stato appena aggiornato. Ricarica la pagina.', 409);
      await activity(env, o.id, 'cancelled', 'customer');
      ctx.waitUntil(h.sendPush(env));
      o.status = 'cancelled';
    }
    const items = (await itemsFor(env, [o.id])).get(o.id) || [];
    const c = await orderConfig(env);
    return json({ ok: true, order: customerView(o, items), site: c.site });
  }

  if (!p.startsWith('/api/admin/')) return null;
  if (!['/api/admin/orders', '/api/admin/menu', '/api/admin/order-settings'].some(x => p === x || p.startsWith(x + '/'))) return null;
  if (!await h.authorised(req, env)) return fail('Accesso non autorizzato', 401);

  if (p === '/api/admin/orders' && method === 'GET') {
    const date = new URL(req.url).searchParams.get('date') || today();
    if (!okDate(date)) return fail('Data non valida');
    const orders = (await env.DB.prepare('SELECT * FROM orders WHERE service_date=? ORDER BY service_time,created_at').bind(date).all()).results;
    const items = await itemsFor(env, orders.map(o => o.id));
    const pending = (await env.DB.prepare("SELECT COUNT(*) n, MAX(created_at) last FROM orders WHERE status='pending' AND service_date>=?").bind(today()).first()) || { n: 0 };
    const upcoming = (await env.DB.prepare("SELECT service_date d, COUNT(*) n FROM orders WHERE service_date>=? AND status NOT IN ('cancelled','rejected','completed') GROUP BY service_date ORDER BY service_date LIMIT 15").bind(today()).all()).results;
    return json({ ok: true, date, current_date: today(), orders: orders.map(o => { const { track_token_hash, ...rest } = o; return { ...rest, items: items.get(o.id) || [] }; }), pending_total: pending.n, last_pending: pending.last || null, upcoming, config: publicOrderConfig(await orderConfig(env)) });
  }
  const orderPatch = p.match(/^\/api\/admin\/orders\/([a-f\d-]{36})$/);
  if (orderPatch && method === 'PATCH') {
    const d = await h.getJSON(req);
    const status = clean(d.status, 20);
    if (!ORDER_STATUSES.includes(status)) return fail('Stato non valido');
    const old = await env.DB.prepare('SELECT status,revision,order_type FROM orders WHERE id=?').bind(orderPatch[1]).first();
    if (!old) return fail('Ordine non trovato', 404);
    if (status === 'out_for_delivery' && old.order_type !== 'delivery') return fail('Solo gli ordini a domicilio possono andare in consegna');
    const r = await env.DB.prepare('UPDATE orders SET status=?,revision=revision+1,updated_at=CURRENT_TIMESTAMP WHERE id=? AND revision=?').bind(status, orderPatch[1], old.revision).run();
    if (!r.meta?.changes) return fail('Ordine modificato da un altro dispositivo. Aggiorna e riprova.', 409);
    await activity(env, orderPatch[1], 'status', 'staff', { from: old.status, to: status });
    return json({ ok: true });
  }
  const orderLink = p.match(/^\/api\/admin\/orders\/([a-f\d-]{36})\/link$/);
  if (orderLink && method === 'POST') {
    const token = newToken();
    const r = await env.DB.prepare('UPDATE orders SET track_token_hash=? WHERE id=?').bind(await hash(token), orderLink[1]).run();
    if (!r.meta?.changes) return fail('Ordine non trovato', 404);
    return json({ ok: true, track_url: new URL(req.url).origin + '/ordine/#' + token });
  }

  if (p === '/api/admin/menu' && method === 'GET') return json({ ok: true, categories: await menu(env, true), tags: TAGS });
  if (p === '/api/admin/menu/categories' && method === 'POST') {
    const d = await h.getJSON(req); let c; try { c = validateCategory(d); } catch (e) { return fail(e.message); }
    if (d.id) {
      const r = await env.DB.prepare('UPDATE menu_categories SET name=?,description=?,section=?,position=?,active=? WHERE id=?').bind(c.name, c.description, c.section, c.position, c.active, Number(d.id)).run();
      if (!r.meta?.changes) return fail('Categoria non trovata', 404);
    } else await env.DB.prepare('INSERT INTO menu_categories(name,description,section,position,active) VALUES(?,?,?,COALESCE(NULLIF(?,0),(SELECT COALESCE(MAX(position),0)+1 FROM menu_categories)),?)').bind(c.name, c.description, c.section, c.position, c.active).run();
    return json({ ok: true });
  }
  const catDelete = p.match(/^\/api\/admin\/menu\/categories\/(\d+)$/);
  if (catDelete && method === 'DELETE') {
    const n = await env.DB.prepare('SELECT COUNT(*) n FROM menu_items WHERE category_id=?').bind(Number(catDelete[1])).first();
    if (n?.n) return fail('Sposta o elimina prima i piatti di questa categoria', 409);
    await env.DB.prepare('DELETE FROM menu_categories WHERE id=?').bind(Number(catDelete[1])).run();
    return json({ ok: true });
  }
  if (p === '/api/admin/menu/items' && method === 'POST') {
    const d = await h.getJSON(req); let i; try { i = validateItem(d); } catch (e) { return fail(e.message); }
    const cat = await env.DB.prepare('SELECT id FROM menu_categories WHERE id=?').bind(i.category).first();
    if (!cat) return fail('Categoria non trovata');
    if (d.id) {
      const r = await env.DB.prepare('UPDATE menu_items SET category_id=?,name=?,description=?,price_cents=?,allergens=?,tags=?,image_url=?,available=?,orderable=?,position=?,updated_at=CURRENT_TIMESTAMP WHERE id=?')
        .bind(i.category, i.name, i.description, i.price, i.allergens, i.tags, i.image, i.available, i.orderable, i.position, Number(d.id)).run();
      if (!r.meta?.changes) return fail('Piatto non trovato', 404);
    } else await env.DB.prepare('INSERT INTO menu_items(category_id,name,description,price_cents,allergens,tags,image_url,available,orderable,position) VALUES(?,?,?,?,?,?,?,?,?,COALESCE(NULLIF(?,0),(SELECT COALESCE(MAX(position),0)+1 FROM menu_items WHERE category_id=?)))')
      .bind(i.category, i.name, i.description, i.price, i.allergens, i.tags, i.image, i.available, i.orderable, i.position, i.category).run();
    return json({ ok: true });
  }
  const itemRoute = p.match(/^\/api\/admin\/menu\/items\/(\d+)$/);
  if (itemRoute && method === 'PATCH') {
    const d = await h.getJSON(req);
    if (typeof d.available !== 'boolean') return fail('Valore non valido');
    const r = await env.DB.prepare('UPDATE menu_items SET available=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').bind(d.available ? 1 : 0, Number(itemRoute[1])).run();
    if (!r.meta?.changes) return fail('Piatto non trovato', 404);
    return json({ ok: true });
  }
  if (itemRoute && method === 'DELETE') {
    await env.DB.prepare('DELETE FROM menu_items WHERE id=?').bind(Number(itemRoute[1])).run();
    return json({ ok: true });
  }
  if (p === '/api/admin/order-settings' && method === 'GET') return json({ ok: true, settings: await orderConfig(env) });
  if (p === '/api/admin/order-settings' && method === 'POST') {
    let values; try { values = validateOrderSettings(await h.getJSON(req, 10000)); } catch (e) { return fail(e.message); }
    await env.DB.batch(Object.entries(values).map(([k, v]) => env.DB.prepare('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').bind(k, v)));
    return json({ ok: true, message: 'Impostazioni ordini e dati del locale salvati' });
  }
  return fail('Risorsa non trovata', 404);
}

export const cleanupOrders = env => env.DB.prepare("DELETE FROM orders WHERE service_date < date('now','-90 days')");
