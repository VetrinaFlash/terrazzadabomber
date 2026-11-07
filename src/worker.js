/** Terrazza da Bomber — Cloudflare Worker + D1 + static assets. */
const ZONE = 'Europe/Rome';
const ACTIVE = ['pending', 'confirmed', 'seated'];
const STATUSES = [...ACTIVE, 'cancelled', 'no_show'];

const reply = (body, status = 200, headers = {}) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...headers } });
const fail = (msg, status = 400) => reply({ ok: false, error: msg }, status);
const clean = (s, max = 120) => String(s ?? '').trim().slice(0, max);
const okDate = s => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s + 'T12:00:00Z')) && new Date(s + 'T12:00:00Z').toISOString().slice(0, 10) === s;
const okTime = s => /^([01]\d|2[0-3]):[0-5]\d$/.test(s);
const mins = s => Number(s.slice(0, 2)) * 60 + Number(s.slice(3, 5));
const slotEnd = (t, n) => { const m = mins(t) + n; return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`; };
const dayLocal = () => new Intl.DateTimeFormat('en-CA', { timeZone: ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const nowLocal = () => new Intl.DateTimeFormat('en-GB', { timeZone: ZONE, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date());
const betweenDays = d => { const now = Date.parse(dayLocal() + 'T12:00:00Z'); const target = Date.parse(d + 'T12:00:00Z'); return (target - now) / 86400000; };
const b64 = bytes => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
const fromB64 = input => Uint8Array.from(atob(input.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
const utf8 = value => new TextEncoder().encode(value);
const sha = async value => b64(new Uint8Array(await crypto.subtle.digest('SHA-256', utf8(value))));
const equals = (a, b) => { const x = utf8(a), y = utf8(b); let diff = x.length ^ y.length; for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] || 0) ^ (y[i] || 0); return diff === 0; };
const hmacKey = async env => crypto.subtle.importKey('raw', utf8('terrazza/session/v2/' + env.ADMIN_PASSWORD), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
const signed = async (data, env) => { const msg = b64(utf8(JSON.stringify(data))); const sig = b64(new Uint8Array(await crypto.subtle.sign('HMAC', await hmacKey(env), utf8(msg)))); return `${msg}.${sig}`; };
const verify = async (value, env) => { if (!env.ADMIN_PASSWORD || !value || value.length > 1500) return null; const [payload, sig, more] = value.split('.'); if (!payload || !sig || more) return null; try { const valid = await crypto.subtle.verify('HMAC', await hmacKey(env), fromB64(sig), utf8(payload)); if (!valid) return null; const data = JSON.parse(new TextDecoder().decode(fromB64(payload))); return data.role === 'admin' && data.exp > Date.now() ? data : null; } catch { return null; } };
const session = req => (req.headers.get('Cookie') || '').split(';').map(s => s.trim()).find(s => s.startsWith('tdb_session='))?.split('=')[1];
const authorised = async (req, env) => Boolean(await verify(session(req), env));
const secureCookie = (req, value, age) => `tdb_session=${value}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${age}${new URL(req.url).protocol === 'https:' ? '; Secure' : ''}`;
const safeOrigin = req => { const origin = req.headers.get('Origin'); if (origin) return origin === new URL(req.url).origin; const referer = req.headers.get('Referer'); return Boolean(referer && new URL(referer).origin === new URL(req.url).origin); };
const getJSON = async req => { if (Number(req.headers.get('content-length') || 0) > 7000) throw Error('Richiesta troppo grande'); const text = await req.text(); if (text.length > 7000) throw Error('Richiesta troppo grande'); return JSON.parse(text || '{}'); };
const cfg = async env => { const r = await env.DB.prepare('SELECT key, value FROM settings').all(); const data = Object.fromEntries(r.results.map(x => [x.key, x.value])); return { booking_enabled: data.booking_enabled === 'true', slots: JSON.parse(data.booking_slots || '[]'), duration: Number(data.duration_minutes || 120), max_guests: Number(data.max_guests || 8), closed_dates: JSON.parse(data.closed_dates || '[]') }; };
const seats = async (env, date, slot, guests, duration, exclude = '') => {
  const end = slotEnd(slot, duration);
  const r = await env.DB.prepare(`SELECT t.id,t.label,t.capacity FROM dining_tables t WHERE t.active=1 AND t.capacity>=? AND NOT EXISTS (SELECT 1 FROM reservations r WHERE r.table_id=t.id AND r.service_date=? AND r.status IN ('pending','confirmed','seated') AND r.service_time < ? AND (CAST(substr(r.service_time,1,2) AS INTEGER)*60+CAST(substr(r.service_time,4,2) AS INTEGER)+?) > ? AND r.id<>?) ORDER BY t.capacity ASC,t.position ASC`).bind(guests, date, end, duration, mins(slot), exclude).all();
  return r.results;
};
const availability = async (env, date, guests) => {
  const s = await cfg(env);
  if (!s.booking_enabled || s.closed_dates.includes(date) || betweenDays(date) < 0 || betweenDays(date) > 90 || guests > s.max_guests) return { slots: [], enabled: s.booking_enabled, duration: s.duration };
  const available = [];
  for (const time of s.slots) {
    if (date === dayLocal() && mins(time) <= mins(nowLocal()) + 60) continue;
    const tables = await seats(env, date, time, guests, s.duration);
    if (tables.length) available.push(time);
  }
  return { slots: available, enabled: true, duration: s.duration };
};
const rate = async (env, key, maxHits, duration) => {
  const expiry = Math.floor(Date.now() / 1000) + duration;
  await env.DB.prepare(`INSERT INTO request_limits(key,hits,expires_at) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET hits=CASE WHEN expires_at < unixepoch() THEN 1 ELSE hits+1 END, expires_at=CASE WHEN expires_at < unixepoch() THEN excluded.expires_at ELSE expires_at END`).bind(key, expiry).run();
  const row = await env.DB.prepare('SELECT hits FROM request_limits WHERE key=?').bind(key).first();
  return row?.hits <= maxHits;
};
const validateBooking = data => {
  const date = clean(data.date, 10), time = clean(data.time, 5), name = clean(data.name, 70), phone = clean(data.phone, 30), notes = clean(data.notes, 350), guests = Number(data.guests);
  if (!okDate(date) || !okTime(time)) throw Error('Seleziona data e orario validi');
  if (!Number.isInteger(guests) || guests < 1 || guests > 30) throw Error('Numero ospiti non valido');
  if (name.length < 3 || /[<>]/.test(name)) throw Error('Inserisci nome e cognome');
  if (!/^\+?[0-9\s().-]{8,22}$/.test(phone) || phone.replace(/\D/g, '').length < 8) throw Error('Inserisci un telefono valido');
  return { date, time, name, phone, guests, notes };
};
const insertBooking = async (env, data, source = 'website') => {
  const s = await cfg(env);
  if (source === 'website' && (!s.booking_enabled || s.closed_dates.includes(data.date))) throw Error('Prenotazioni non disponibili per questa data');
  if (!s.slots.includes(data.time) && source === 'website') throw Error('Orario non disponibile');
  if (betweenDays(data.date) < 0 || betweenDays(data.date) > 90 || (data.date === dayLocal() && mins(data.time) <= mins(nowLocal()) + 60 && source === 'website')) throw Error('Data o orario non disponibile');
  if (data.guests > (source === 'website' ? s.max_guests : 30)) throw Error('Per gruppi numerosi chiamaci direttamente');
  const id = crypto.randomUUID();
  // Single atomic INSERT SELECT, so concurrent requests cannot claim the same table.
  const result = await env.DB.prepare(`INSERT INTO reservations(id,service_date,service_time,guests,customer_name,phone,notes,table_id,source) SELECT ?,?,?,?,?,?,?,t.id,? FROM dining_tables t WHERE t.active=1 AND t.capacity>=? AND NOT EXISTS (SELECT 1 FROM reservations r WHERE r.table_id=t.id AND r.service_date=? AND r.status IN ('pending','confirmed','seated') AND r.service_time < ? AND (CAST(substr(r.service_time,1,2) AS INTEGER)*60+CAST(substr(r.service_time,4,2) AS INTEGER)+?) > ?) ORDER BY t.capacity ASC,t.position ASC LIMIT 1`).bind(id, data.date, data.time, data.guests, data.name, data.phone, data.notes, source, data.guests, data.date, slotEnd(data.time, s.duration), s.duration, mins(data.time)).run();
  if (!result.meta?.changes) throw Error('Non ci sono tavoli disponibili per questo orario');
  return id;
};

async function sendPush(env) {
  if (!env.VAPID_PRIVATE_JWK || !env.VAPID_PUBLIC_KEY) return;
  let jwk; try { jwk = JSON.parse(env.VAPID_PRIVATE_JWK); } catch { return; }
  const rows = (await env.DB.prepare('SELECT endpoint FROM push_subscriptions').all()).results;
  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const aud = new Map();
  for (const row of rows) {
    try {
      const url = new URL(row.endpoint); if (url.protocol !== 'https:') continue;
      let jwt = aud.get(url.origin);
      if (!jwt) {
        const head = b64(utf8(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
        const payload = b64(utf8(JSON.stringify({ aud: url.origin, exp: Math.floor(Date.now()/1000)+ 3600, sub: 'mailto:bomberspecial95@gmail.com' })));
        const sig = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, utf8(head + '.' + payload)));
        jwt = head + '.' + payload + '.' + b64(sig); aud.set(url.origin, jwt);
      }
      const response = await fetch(row.endpoint, { method: 'POST', headers: { Authorization: `vapid t=${jwt}, k=${env.VAPID_PUBLIC_KEY}`, TTL: '60', 'Content-Length': '0', Urgency: 'high' } });
      if ([404,410].includes(response.status)) await env.DB.prepare('DELETE FROM push_subscriptions WHERE endpoint=?').bind(row.endpoint).run();
    } catch (e) { console.warn('Push delivery failed', String(e)); }
  }
}

async function api(req, env, ctx, p) {
  const method = req.method;
  if (!env.DB) return fail('Database D1 non configurato', 503);
  if (method !== 'GET' && !safeOrigin(req)) return fail('Origine non autorizzata', 403);
  if (p === '/api/health' && method === 'GET') return reply({ ok: true, service: 'Terrazza da Bomber', database: 'connected' });
  if (p === '/api/public' && method === 'GET') { const s = await cfg(env); return reply({ ok: true, booking_enabled: s.booking_enabled, max_guests: s.max_guests, slots: s.slots }); }
  if (p === '/api/availability' && method === 'GET') { const q = new URL(req.url).searchParams; const date = q.get('date') || ''; const guests = Number(q.get('guests') || 2); if (!okDate(date) || !Number.isInteger(guests) || guests < 1 || guests > 30) return fail('Data e ospiti non validi'); return reply({ ok: true, ...await availability(env, date, guests) }); }
  if (p === '/api/reservations' && method === 'POST') {
    const data = await getJSON(req);
    if (data.company) return reply({ ok: true });
    if (data.privacy !== true) return fail('Accetta l’informativa privacy');
    const ip = req.headers.get('CF-Connecting-IP') || 'unknown';
    if (!await rate(env, 'book:' + await sha(ip + ':' + dayLocal()), 7, 3600)) return fail('Troppe richieste. Riprovare più tardi.', 429);
    const id = await insertBooking(env, validateBooking(data));
    ctx.waitUntil(sendPush(env));
    return reply({ ok: true, id, message: 'Richiesta ricevuta. Attendi la conferma del ristorante.' }, 201);
  }
  if (p === '/api/admin/login' && method === 'POST') {
    if (!env.ADMIN_PASSWORD || env.ADMIN_PASSWORD.length < 14) return fail('Password amministratore non configurata correttamente', 503);
    const ip = req.headers.get('CF-Connecting-IP') || 'unknown';
    if (!await rate(env, 'login:' + await sha(ip), 8, 900)) return fail('Troppi tentativi. Riprova fra 15 minuti.', 429);
    const data = await getJSON(req); const guess = clean(data.password, 200);
    if (!equals(await sha(guess), await sha(env.ADMIN_PASSWORD))) return fail('Password non corretta', 401);
    return reply({ ok: true }, 200, { 'Set-Cookie': secureCookie(req, await signed({ role: 'admin', exp: Date.now() + 7 * 86400000 }, env), 604800) });
  }
  if (p === '/api/admin/me' && method === 'GET') return reply({ ok: await authorised(req, env), push_enabled: !!(env.VAPID_PRIVATE_JWK && env.VAPID_PUBLIC_KEY), vapid_public_key: env.VAPID_PUBLIC_KEY || null });
  if (!p.startsWith('/api/admin/')) return fail('Risorsa non trovata', 404);
  if (!await authorised(req, env)) return fail('Accesso non autorizzato', 401);
  if (p === '/api/admin/logout' && method === 'POST') return reply({ ok: true }, 200, { 'Set-Cookie': secureCookie(req, '', 0) });
  if (p === '/api/admin/dashboard' && method === 'GET') {
    const date = new URL(req.url).searchParams.get('date') || dayLocal(); if (!okDate(date)) return fail('Data non valida');
    const bookings = (await env.DB.prepare('SELECT r.*,t.label AS table_label FROM reservations r LEFT JOIN dining_tables t ON t.id=r.table_id WHERE r.service_date=? ORDER BY r.service_time,r.created_at').bind(date).all()).results;
    const tables = (await env.DB.prepare('SELECT * FROM dining_tables ORDER BY position,id').all()).results;
    const counts = (await env.DB.prepare("SELECT status,COUNT(*) count FROM reservations WHERE service_date=? GROUP BY status").bind(date).all()).results;
    return reply({ ok: true, date, bookings, tables, settings: await cfg(env), counts, current_date: dayLocal() });
  }
  if (p === '/api/admin/reservations' && method === 'POST') {
    const data = validateBooking(await getJSON(req));
    const id = await insertBooking(env, data, 'staff'); return reply({ ok: true, id }, 201);
  }
  const edit = p.match(/^\/api\/admin\/reservations\/([a-f\d-]{36})$/);
  if (edit && method === 'PATCH') {
    const input = await getJSON(req), id = edit[1];
    const old = await env.DB.prepare('SELECT * FROM reservations WHERE id=?').bind(id).first(); if (!old) return fail('Prenotazione non trovata', 404);
    const status = clean(input.status ?? old.status, 16);
    if (!STATUSES.includes(status)) return fail('Stato non valido');
    const tableId = input.table_id === undefined ? old.table_id : Number(input.table_id);
    if (!Number.isInteger(tableId) || tableId < 1) return fail('Tavolo non valido');
    if (ACTIVE.includes(status)) {
      const t = await env.DB.prepare('SELECT * FROM dining_tables WHERE id=? AND active=1').bind(tableId).first();
      if (!t || t.capacity < old.guests) return fail('Il tavolo non ha posti sufficienti');
      const s = await cfg(env);
      const free = await seats(env, old.service_date, old.service_time, old.guests, s.duration, id);
      if (!free.some(x => x.id === tableId)) return fail('Tavolo già occupato in questa fascia oraria', 409);
    }
    const updated = await env.DB.prepare(`UPDATE reservations SET status=?,table_id=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(status, tableId, id).run();
    return reply({ ok: !!updated.meta?.changes });
  }
  if (p === '/api/admin/tables' && method === 'POST') {
    const d = await getJSON(req), label = clean(d.label, 35), capacity = Number(d.capacity);
    if (!label || !Number.isInteger(capacity) || capacity < 1 || capacity > 30) return fail('Dati tavolo non validi');
    if (d.id) {
      const active = d.active === false ? 0 : 1;
      const result = await env.DB.prepare('UPDATE dining_tables SET label=?,capacity=?,active=? WHERE id=?').bind(label, capacity, active, Number(d.id)).run();
      if (!result.meta?.changes) return fail('Tavolo non trovato');
    } else await env.DB.prepare('INSERT INTO dining_tables(label,capacity,position) VALUES(?,?,(SELECT COALESCE(MAX(position),0)+1 FROM dining_tables))').bind(label, capacity).run();
    return reply({ ok: true });
  }
  if (p === '/api/admin/settings' && method === 'POST') {
    const d = await getJSON(req), max = Number(d.max_guests), duration = Number(d.duration), slots = d.slots, closed = d.closed_dates;
    if (!Number.isInteger(max) || max < 1 || max > 30 || ![60,90,120,150,180].includes(duration)) return fail('Impostazioni non valide');
    if (!Array.isArray(slots) || slots.length < 1 || slots.length > 20 || slots.some(x => !okTime(x)) || new Set(slots).size !== slots.length) return fail('Fasce orarie non valide');
    if (!Array.isArray(closed) || closed.length > 120 || closed.some(x => !okDate(x))) return fail('Date di chiusura non valide');
    await env.DB.batch([['booking_enabled', String(d.booking_enabled === true)], ['booking_slots', JSON.stringify(slots.sort())], ['duration_minutes', String(duration)], ['max_guests', String(max)], ['closed_dates', JSON.stringify(closed)]].map(([k,v]) => env.DB.prepare('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').bind(k,v)));
    return reply({ ok: true });
  }
  if (p === '/api/admin/push' && method === 'POST') {
    if (!env.VAPID_PUBLIC_KEY) return fail('Push non configurate', 503);
    const d = await getJSON(req); if (typeof d.endpoint !== 'string' || !d.endpoint.startsWith('https://') || d.endpoint.length > 1500 || !d.keys?.p256dh || !d.keys?.auth) return fail('Iscrizione non valida');
    await env.DB.prepare('INSERT INTO push_subscriptions(endpoint,p256dh,auth) VALUES(?,?,?) ON CONFLICT(endpoint) DO UPDATE SET p256dh=excluded.p256dh,auth=excluded.auth').bind(d.endpoint,d.keys.p256dh,d.keys.auth).run();
    return reply({ ok: true });
  }
  if (p === '/api/admin/test-push' && method === 'POST') { ctx.waitUntil(sendPush(env)); return reply({ ok: true, message: 'Invio test avviato' }); }
  return fail('Risorsa non trovata', 404);
}

export default {
  async scheduled(event, env) {
    if (!env.DB) return;
    await env.DB.batch([env.DB.prepare("DELETE FROM reservations WHERE service_date < date('now','-90 days')"), env.DB.prepare("DELETE FROM request_limits WHERE expires_at < unixepoch()")]);
  },
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    if (url.pathname === '/admin') return Response.redirect(url.origin + '/admin/', 308);
    if (url.pathname.startsWith('/api/')) {
      try { return await api(req, env, ctx, url.pathname.replace(/\/$/, '')); }
      catch (err) { console.error('API', err); return fail(err instanceof SyntaxError ? 'Dati non validi' : (['Richiesta troppo grande','Seleziona data e orario validi','Numero ospiti non valido','Inserisci nome e cognome','Inserisci un telefono valido','Prenotazioni non disponibili per questa data','Orario non disponibile','Data o orario non disponibile','Per gruppi numerosi chiamaci direttamente','Non ci sono tavoli disponibili per questo orario'].includes(err.message) ? err.message : 'Operazione non riuscita. Riprova.'), err.message === 'Non ci sono tavoli disponibili per questo orario' ? 409 : 400); }
    }
    if (url.pathname.startsWith('/admin/')) {
      const res = await env.ASSETS.fetch(req);
      const headers = new Headers(res.headers); headers.set('Cache-Control', 'no-store'); headers.set('X-Robots-Tag', 'noindex, nofollow');
      return new Response(res.body, { status: res.status, headers });
    }
    return env.ASSETS.fetch(req);
  }
};
