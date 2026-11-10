/* Tipiko — menu digitale, carrello, ordini online e prenotazione tavoli */
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const on = (sel, ev, fn) => { const el = document.querySelector(sel); if (el) el.addEventListener(ev, fn); };
const HAS_MENU = !!document.querySelector('#menuBody'), HAS_BOOKING = !!document.querySelector('#bookingForm'), HAS_DRAWER = !!document.querySelector('#orderDrawer');
const root = document.documentElement;
const euro = c => (c / 100).toLocaleString('it-IT', { style: 'currency', currency: 'EUR' });
const esc = v => String(v ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
const pad = n => String(n).padStart(2, '0');
const dateStr = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const weekdayOf = day => { const n = new Date(day + 'T12:00:00Z').getUTCDay(); return n || 7; };
const TAG_LABELS = { vegano: 'Vegano', vegetariano: 'Vegetariano', 'senza-glutine': 'Senza glutine', piccante: 'Piccante', dolce: 'Dolce', novita: 'Novità' };
const store = { get(k) { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch { return null; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} } };
let toastTimer;
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('visible'); clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('visible'), 2600); }
async function getJSON(url, opts = {}) {
  const res = await fetch(url, { cache: 'no-store', ...opts, headers: { ...(opts.body ? { 'Content-Type': 'application/json' } : {}), ...(opts.headers || {}) } });
  let data; try { data = await res.json(); } catch { throw Error('Servizio momentaneamente non raggiungibile'); }
  if (!res.ok || !data.ok) throw Object.assign(Error(data.error || 'Operazione non riuscita'), { status: res.status });
  return data;
}

/* ---------- Immagini con fallback all'originale ---------- */
$$('img[data-fallback]').forEach(img => {
  const fail = () => {
    if (!img.dataset.triedFallback) { img.dataset.triedFallback = '1'; img.src = img.dataset.fallback; return; }
    img.style.visibility = 'hidden'; img.parentElement?.classList.add('photo-missing');
  };
  img.addEventListener('error', fail);
  if (img.complete && img.naturalWidth === 0 && img.src) fail();
});

/* ---------- Navigazione ---------- */
const toggle = $('#menuToggle'), mobileMenu = $('#mobileMenu');
const setMenu = open => { toggle.setAttribute('aria-expanded', String(open)); mobileMenu.classList.toggle('active', open); };
toggle.addEventListener('click', () => setMenu(!mobileMenu.classList.contains('active')));
mobileMenu.querySelectorAll('a').forEach(a => a.addEventListener('click', () => setMenu(false)));
let raf = false;
window.addEventListener('scroll', () => { if (raf) return; raf = true; requestAnimationFrame(() => { root.classList.toggle('scrolled', scrollY > 30); raf = false; }); }, { passive: true });
const io = 'IntersectionObserver' in window ? new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in-view'); io.unobserve(e.target); } }), { threshold: .12 }) : null;
$$('.reveal').forEach(el => io ? io.observe(el) : el.classList.add('in-view'));
$('#year').textContent = new Date().getFullYear();
on('#mapLoad', 'click', () => {
  const f = document.createElement('iframe');
  f.src = 'https://maps.google.com/maps?q=39.1343078,16.079319&z=17&output=embed';
  f.title = 'Mappa: Tipiko Ristorante Pizzeria, Amantea'; f.loading = 'lazy'; f.referrerPolicy = 'no-referrer-when-downgrade';
  $('#mapCard').replaceChildren(f);
});

/* ---------- Stato condiviso ---------- */
let site = {}, ordering = { ordering_enabled: false }, closures = { closed_dates: [], closed_weekdays: [], closed_periods: [] };
let categories = [], itemsById = new Map(), menuLoaded = false;
const isClosedDay = day => closures.closed_dates.includes(day) || closures.closed_weekdays.includes(weekdayOf(day)) || closures.closed_periods.some(p => day >= p.from && day <= p.to);
const phoneDigits = p => { let n = String(p || '').replace(/\D/g, ''); if (n.startsWith('00')) n = n.slice(2); else if (n.length === 10) n = '39' + n; return n; };

function applySite() {
  $$('[data-site]').forEach(el => { const v = site[el.dataset.site]; if (v) el.textContent = v; });
  $$('[data-site-wrap]').forEach(el => { el.hidden = !site[el.dataset.siteWrap]; });
  const hrefs = { tel: site.phone && 'tel:+' + phoneDigits(site.phone), wa: (site.whatsapp || site.phone) && 'https://wa.me/' + phoneDigits(site.whatsapp || site.phone), mail: site.email && 'mailto:' + site.email, maps: site.maps_url, instagram: site.instagram, facebook: site.facebook };
  $$('[data-site-href]').forEach(el => { const v = hrefs[el.dataset.siteHref]; if (v) el.href = v; else if (['instagram', 'facebook'].includes(el.dataset.siteHref)) el.hidden = true; });
  const today = dateStr(new Date());
  const status = $('#openStatus');
  if (!status) return;
  if (isClosedDay(today)) { status.querySelector('i').className = 'status-dot closed'; status.querySelector('span').textContent = 'Oggi siamo chiusi · ' + (site.hours || ''); }
  else { status.querySelector('i').className = 'status-dot open'; status.querySelector('span').textContent = 'Oggi aperti · ' + (site.hours || '').replace(/\s*·?\s*Chiuso[^·]*$/i, ''); }
}

/* ---------- Menu ---------- */
let activeSection = '', searchTerm = '';
function renderMenuNav() {
  const sections = [...new Set(categories.map(c => c.section))];
  if (!sections.includes(activeSection)) activeSection = sections[0] || '';
  $('#sectionTabs').innerHTML = sections.map(s => `<button type="button" role="tab" class="section-tab" aria-selected="${s === activeSection && !searchTerm}" data-section="${esc(s)}">${esc(s)}</button>`).join('');
  const cats = searchTerm ? [] : categories.filter(c => c.section === activeSection);
  $('#categoryChips').innerHTML = cats.map(c => `<button type="button" class="chip" data-cat="${c.id}">${esc(c.name)}</button>`).join('');
  $('#categoryChips').hidden = !cats.length;
}
function highlight(text) {
  const safe = esc(text); if (!searchTerm) return safe;
  const q = esc(searchTerm).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return safe.replace(new RegExp('(' + q + ')', 'ig'), '<mark>$1</mark>');
}
function itemHTML(i, cat) {
  const canOrder = ordering.ordering_enabled && i.orderable;
  const qty = cart.filter(l => l.id === i.id).reduce((n, l) => n + l.qty, 0);
  const tags = i.tags.length ? `<div class="tags">${i.tags.map(t => `<span class="tag ${esc(t)}">${esc(TAG_LABELS[t] || t)}</span>`).join('')}</div>` : '';
  const side = i.price_cents > 0 ? `<span class="price">${euro(i.price_cents)}</span>` : '';
  const action = canOrder ? `<button type="button" class="add-btn" data-add="${i.id}" aria-label="Aggiungi ${esc(i.name)} al carrello">+</button>${qty ? `<span class="in-cart">${qty} nel carrello</span>` : ''}` : (ordering.ordering_enabled && i.price_cents > 0 ? '<span class="table-only">Solo al tavolo</span>' : '');
  return `<article class="menu-item ${canOrder ? 'can-order' : ''}" data-item="${i.id}" ${canOrder ? 'tabindex="0"' : ''}>
    <div class="menu-item-text"><h4>${highlight(i.name)}</h4>${i.description ? `<p>${highlight(i.description)}</p>` : ''}${tags}${searchTerm ? `<p><small>${esc(cat.section)} · ${esc(cat.name)}</small></p>` : ''}</div>
    <div class="menu-item-side">${side}${action}</div></article>`;
}
function renderMenu() {
  if (!menuLoaded) return;
  renderMenuNav();
  const body = $('#menuBody');
  const q = searchTerm.toLowerCase();
  const shown = searchTerm
    ? categories.map(c => ({ ...c, items: c.items.filter(i => (i.name + ' ' + i.description).toLowerCase().includes(q)) })).filter(c => c.items.length)
    : categories.filter(c => c.section === activeSection);
  if (!shown.length) { body.innerHTML = `<div class="menu-empty">Nessun piatto trovato per «${esc(searchTerm)}».</div>`; return; }
  body.innerHTML = shown.map(c => `<section class="menu-category" id="cat-${c.id}"><h3>${esc(c.name)}${searchTerm ? `<small>${esc(c.section)}</small>` : ''}</h3>${c.description ? `<p>${esc(c.description)}</p>` : ''}<div class="menu-items">${c.items.map(i => itemHTML(i, c)).join('')}</div></section>`).join('');
}
on('#sectionTabs', 'click', e => {
  const b = e.target.closest('[data-section]'); if (!b) return;
  activeSection = b.dataset.section; searchTerm = ''; $('#menuSearch').value = '';
  renderMenu(); $('#menu').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
});
on('#categoryChips', 'click', e => {
  const b = e.target.closest('[data-cat]'); if (!b) return;
  const target = document.getElementById('cat-' + b.dataset.cat);
  const offset = $('.site-header').offsetHeight + $('#menuNav').offsetHeight + 8;
  window.scrollTo({ top: target.getBoundingClientRect().top + scrollY - offset, behavior: 'smooth' });
});
let searchTimer;
on('#menuSearch', 'input', e => { clearTimeout(searchTimer); searchTimer = setTimeout(() => { searchTerm = e.target.value.trim().slice(0, 40); renderMenu(); }, 120); });
const chipObserver = 'IntersectionObserver' in window ? new IntersectionObserver(entries => {
  entries.forEach(en => { if (en.isIntersecting) { const id = en.target.id.slice(4); $$('#categoryChips .chip').forEach(c => { const on = c.dataset.cat === id; c.classList.toggle('active', on); if (on) c.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' }); }); } });
}, { rootMargin: '-45% 0px -50% 0px' }) : null;
HAS_MENU && new MutationObserver(() => { chipObserver && $$('.menu-category').forEach(s => chipObserver.observe(s)); }).observe($('#menuBody'), { childList: true });
on('#menuBody', 'click', e => {
  const add = e.target.closest('[data-add]');
  const card = e.target.closest('.menu-item.can-order');
  if (add) { e.stopPropagation(); quickAdd(Number(add.dataset.add)); return; }
  if (card) openItem(Number(card.dataset.item));
});
on('#menuBody', 'keydown', e => { const card = e.target.closest('.menu-item.can-order'); if (card && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); openItem(Number(card.dataset.item)); } });

async function loadMenu() {
  try {
    const data = await getJSON('/api/menu');
    categories = data.categories; itemsById = new Map(categories.flatMap(c => c.items.map(i => [i.id, { ...i, category: c.name }])));
    menuLoaded = true; syncCart(); renderMenu();
  } catch { $('#menuBody').innerHTML = '<div class="menu-empty">Il menu non è raggiungibile in questo momento. Riprova tra poco o chiamaci.</div>'; }
}

/* ---------- Scheda piatto ---------- */
let modalItem = null, modalQty = 1, lastFocus = null;
function openModal(el) { lastFocus = document.activeElement; el.hidden = false; document.body.classList.add('lock'); el.querySelector('button, input, a')?.focus(); }
function closeModal(el) { el.hidden = true; if ($$('.modal:not([hidden])').length === 0 && (!HAS_DRAWER || $('#orderDrawer').hidden)) document.body.classList.remove('lock'); lastFocus?.focus?.(); }
$$('.modal').forEach(m => { m.addEventListener('click', e => { if (e.target === m || e.target.closest('[data-close]')) closeModal(m); }); });
function openItem(id) {
  const i = itemsById.get(id); if (!i) return;
  modalItem = i; modalQty = 1;
  $('#itemModalCategory').textContent = i.category; $('#itemModalTitle').textContent = i.name; $('#itemModalDesc').textContent = i.description || '';
  $('#itemModalTags').innerHTML = i.tags.map(t => `<span class="tag ${esc(t)}">${esc(TAG_LABELS[t] || t)}</span>`).join('');
  $('#itemModalNotes').value = ''; updateItemModal(); openModal($('#itemModal'));
}
const updateItemModal = () => { $('#itemQty').textContent = modalQty; $('#itemModalPrice').textContent = euro(modalItem.price_cents * modalQty); };
on('#itemMinus', 'click', () => { modalQty = Math.max(1, modalQty - 1); updateItemModal(); });
on('#itemPlus', 'click', () => { modalQty = Math.min(30, modalQty + 1); updateItemModal(); });
on('#itemAdd', 'click', () => { addToCart(modalItem.id, modalQty, $('#itemModalNotes').value.trim().slice(0, 120)); closeModal($('#itemModal')); });

/* ---------- Carrello ---------- */
let cart = (store.get('tipiko_cart_v1') || []).filter(l => l && Number.isInteger(l.id) && Number.isInteger(l.qty));
const lineKey = (id, notes) => id + '|' + (notes || '');
function syncCart() {
  cart = cart.map(l => { const i = itemsById.get(l.id); return i && i.orderable ? { ...l, name: i.name, price: i.price_cents } : null; }).filter(Boolean);
  saveCart();
}
function saveCart() { store.set('tipiko_cart_v1', cart); updateCartUI(); }
const subtotal = () => cart.reduce((n, l) => n + l.price * l.qty, 0);
const count = () => cart.reduce((n, l) => n + l.qty, 0);
function addToCart(id, qty = 1, notes = '') {
  const i = itemsById.get(id); if (!i || !i.orderable || !ordering.ordering_enabled) return;
  const key = lineKey(id, notes); const line = cart.find(l => lineKey(l.id, l.notes) === key);
  if (line) line.qty = Math.min(30, line.qty + qty); else cart.push({ id, qty, notes, name: i.name, price: i.price_cents });
  saveCart(); renderMenu();
  const b = $('#cartButton'); b.classList.remove('bump'); void b.offsetWidth; b.classList.add('bump');
  toast(`${qty > 1 ? qty + ' × ' : ''}${i.name} aggiunto`);
}
const quickAdd = id => addToCart(id, 1, '');
function updateCartUI() {
  const n = count(), total = subtotal(), has = n > 0 && ordering.ordering_enabled;
  $('#cartCount').textContent = n; $('#cartButton').hidden = !has;
  if (!HAS_DRAWER) { $('#cartButton').hidden = n === 0; return; }
  $('#cartBarCount').textContent = n; $('#cartBarTotal').textContent = euro(total);
  $('#cartBar').hidden = !has || !$('#orderDrawer').hidden; document.body.classList.toggle('has-cart', has);
  if (!$('#orderDrawer').hidden) renderDrawer();
}

/* ---------- Drawer ordine ---------- */
let step = 'cart', orderDay = '', orderTime = '';
function openDrawer() { lastFocus = document.activeElement; step = 'cart'; $('#orderDrawer').hidden = false; $('#drawerBackdrop').hidden = false; document.body.classList.add('lock'); $('#cartBar').hidden = true; renderDrawer(); $('#drawerClose').focus(); }
function closeDrawer() { $('#orderDrawer').hidden = true; $('#drawerBackdrop').hidden = true; document.body.classList.remove('lock'); updateCartUI(); lastFocus?.focus?.(); }
on('#cartBar', 'click', openDrawer); on('#cartButton', 'click', () => HAS_DRAWER ? openDrawer() : location.assign('/menu/#carrello'));
on('#drawerClose', 'click', closeDrawer); on('#drawerBackdrop', 'click', closeDrawer);
on('#drawerBack', 'click', () => { step = 'cart'; renderDrawer(); });
window.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  const open = $$('.modal:not([hidden])').pop(); if (open) return closeModal(open);
  if (HAS_DRAWER && !$('#orderDrawer').hidden) closeDrawer(); setMenu(false);
});
const orderType = () => $('#checkoutForm').elements.type.value;
function renderDrawer() {
  const isCart = step === 'cart';
  $('#stepCart').hidden = !isCart; $('#checkoutForm').hidden = isCart; $('#drawerBack').hidden = isCart;
  $('#drawerTitle').textContent = isCart ? 'Il tuo ordine' : 'Completa l’ordine';
  $$('[data-step-dot]').forEach(s => s.classList.toggle('active', s.dataset.stepDot === step || (step === 'checkout' && s.dataset.stepDot === 'cart')));
  $('#cartList').innerHTML = cart.map((l, idx) => `<div class="cart-line"><strong>${esc(l.name)}</strong><span class="line-total">${euro(l.price * l.qty)}</span><small>${euro(l.price)} cad.${l.notes ? ' · ' + esc(l.notes) : ''}</small><div class="stepper"><button type="button" data-dec="${idx}" aria-label="Diminuisci ${esc(l.name)}">${l.qty === 1 ? '🗑' : '−'}</button><output>${l.qty}</output><button type="button" data-inc="${idx}" aria-label="Aumenta ${esc(l.name)}">+</button></div></div>`).join('');
  const sub = subtotal(), delivery = !isCart && orderType() === 'delivery';
  const fee = delivery ? ordering.delivery_fee_cents : 0;
  const rows = [`<div><span>Subtotale</span><span>${euro(sub)}</span></div>`];
  if (delivery) rows.push(`<div><span>Consegna</span><span>${fee ? euro(fee) : 'Gratis'}</span></div>`);
  const belowMin = delivery && sub < ordering.delivery_min_cents;
  if (belowMin) rows.push(`<div class="warn">Ordine minimo per la consegna: ${euro(ordering.delivery_min_cents)}</div>`);
  rows.push(`<div class="grand"><span>Totale</span><span>${euro(sub + fee)}</span></div>`);
  $('#totals').innerHTML = cart.length ? rows.join('') : '';
  const btn = $('#drawerPrimary');
  btn.disabled = !cart.length || belowMin;
  btn.textContent = isCart ? `Continua · ${euro(sub)}` : `Invia ordine · ${euro(sub + fee)}`;
}
on('#cartList', 'click', e => {
  const inc = e.target.closest('[data-inc]'), dec = e.target.closest('[data-dec]');
  if (inc) { const l = cart[Number(inc.dataset.inc)]; l.qty = Math.min(30, l.qty + 1); }
  if (dec) { const i = Number(dec.dataset.dec); cart[i].qty -= 1; if (cart[i].qty < 1) cart.splice(i, 1); }
  if (inc || dec) { saveCart(); renderMenu(); }
});
on('#drawerPrimary', 'click', () => {
  if (step === 'cart') { step = 'checkout'; renderDrawer(); setupCheckout(); $('.drawer-body').scrollTop = 0; return; }
  submitOrder();
});

function setupCheckout() {
  const f = $('#checkoutForm');
  $('#deliveryOption').hidden = !ordering.delivery_enabled;
  f.elements.type[0].parentElement.hidden = !ordering.takeaway_enabled;
  if (!ordering.takeaway_enabled) f.elements.type.value = 'delivery';
  if (!ordering.delivery_enabled) f.elements.type.value = 'takeaway';
  $('#cardOption').hidden = !ordering.card_payment_enabled;
  if (!ordering.card_payment_enabled) f.elements.payment.value = 'cash';
  $('#deliveryFeeLabel').textContent = ordering.delivery_fee_cents ? 'A domicilio · ' + euro(ordering.delivery_fee_cents) : 'A domicilio · gratis';
  $('#deliveryAreaHelp').textContent = ordering.delivery_area ? 'Consegniamo a: ' + ordering.delivery_area : '';
  const saved = store.get('tipiko_customer') || {};
  for (const k of ['name', 'phone', 'address']) if (!f.elements[k].value && saved[k]) f.elements[k].value = saved[k];
  updateTypeUI(); renderDays();
}
function updateTypeUI() {
  const delivery = orderType() === 'delivery';
  $('#addressField').hidden = !delivery; $('#checkoutForm').elements.address.required = delivery;
  $('#orderTimeLabel').textContent = delivery ? 'Orario di consegna (indicativo)' : 'Orario di ritiro';
  renderDrawer();
}
on('#orderType', 'change', updateTypeUI);
function renderDays() {
  const today = new Date(), days = [];
  for (let n = 0; n <= (ordering.days_ahead ?? 2); n++) days.push(dateStr(addDays(today, n)));
  const fmt = new Intl.DateTimeFormat('it-IT', { weekday: 'short', day: 'numeric', month: 'short' });
  const firstOpen = days.find(d => !isClosedDay(d));
  if (!days.includes(orderDay) || isClosedDay(orderDay)) orderDay = firstOpen || '';
  $('#orderDays').innerHTML = days.map((d, i) => `<button type="button" class="day-chip ${d === orderDay ? 'selected' : ''}" data-day="${d}" ${isClosedDay(d) ? 'disabled title="Chiuso"' : ''}><b>${i === 0 ? 'Oggi' : i === 1 ? 'Domani' : fmt.format(new Date(d + 'T12:00:00')).split(' ')[0]}</b><small>${isClosedDay(d) ? 'chiuso' : fmt.format(new Date(d + 'T12:00:00')).replace(/^\S+\s/, '')}</small></button>`).join('');
  loadOrderSlots();
}
on('#orderDays', 'click', e => { const b = e.target.closest('[data-day]'); if (!b || b.disabled) return; orderDay = b.dataset.day; $$('#orderDays .day-chip').forEach(x => x.classList.toggle('selected', x === b)); loadOrderSlots(); });
let slotSeq = 0;
async function loadOrderSlots() {
  const node = $('#orderSlots'), id = ++slotSeq; orderTime = '';
  if (!orderDay) { node.innerHTML = '<div class="slot-hint">Nei prossimi giorni siamo chiusi. Chiamaci per informazioni.</div>'; return; }
  node.innerHTML = '<div class="slot-hint">Controlliamo gli orari disponibili…</div>';
  try {
    const data = await getJSON('/api/order-slots?date=' + orderDay); if (id !== slotSeq) return;
    if (!data.slots.length) { node.innerHTML = `<div class="slot-hint">${data.closed ? 'Questo giorno siamo chiusi.' : 'Nessun orario ancora disponibile per questo giorno. Prova il giorno successivo o chiamaci.'}</div>`; return; }
    const lunch = data.slots.filter(t => t < '17:00'), dinner = data.slots.filter(t => t >= '17:00');
    const group = (label, list) => list.length ? `<div class="slot-group">${label}</div>` + list.map(t => `<button type="button" class="slot" data-time="${t}" aria-pressed="false">${t}</button>`).join('') : '';
    node.innerHTML = group('Pranzo', lunch) + group('Cena', dinner);
  } catch { if (id === slotSeq) node.innerHTML = '<div class="slot-hint">Orari non raggiungibili. Riprova o chiamaci.</div>'; }
}
on('#orderSlots', 'click', e => { const b = e.target.closest('[data-time]'); if (!b) return; orderTime = b.dataset.time; $$('#orderSlots .slot').forEach(x => { x.classList.toggle('selected', x === b); x.setAttribute('aria-pressed', String(x === b)); }); });
const checkoutError = msg => { const m = $('#checkoutMessage'); m.textContent = msg; m.className = 'form-message error'; m.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); };
async function submitOrder() {
  const f = $('#checkoutForm'); $('#checkoutMessage').textContent = ''; $('#checkoutMessage').className = '';
  if (!orderDay || !orderTime) return checkoutError('Scegli giorno e orario.');
  const d = Object.fromEntries(new FormData(f));
  if ((d.name || '').trim().length < 3) return checkoutError('Inserisci nome e cognome.');
  if ((d.phone || '').replace(/\D/g, '').length < 8) return checkoutError('Inserisci un numero di telefono valido.');
  if (d.type === 'delivery' && (d.address || '').trim().length < 6) return checkoutError('Inserisci l’indirizzo di consegna completo.');
  if (!f.elements.privacy.checked) return checkoutError('Per inviare l’ordine accetta l’informativa privacy.');
  const btn = $('#drawerPrimary'); btn.disabled = true; btn.classList.add('loading');
  try {
    const res = await getJSON('/api/orders', { method: 'POST', body: JSON.stringify({ ...d, date: orderDay, time: orderTime, privacy: true, items: cart.map(l => ({ id: l.id, qty: l.qty, notes: l.notes })) }) });
    store.set('tipiko_customer', { name: d.name, phone: d.phone, address: d.address || '' });
    cart = []; saveCart(); renderMenu(); closeDrawer(); f.elements.notes.value = ''; f.elements.privacy.checked = false;
    $('#orderCode').textContent = res.code;
    $('#orderSuccessText').textContent = `${d.type === 'delivery' ? 'Consegna' : 'Ritiro'} ${orderDay === dateStr(new Date()) ? 'oggi' : 'il ' + new Intl.DateTimeFormat('it-IT', { day: 'numeric', month: 'long' }).format(new Date(orderDay + 'T12:00:00'))} alle ${orderTime} · Totale ${euro(res.total_cents)}. Lo staff conferma a breve: segui lo stato dal link.`;
    $('#orderTrackLink').href = res.track_url; $('#copyTrackLink').dataset.link = res.track_url;
    $('#shareTrackWa').href = 'https://api.whatsapp.com/send?text=' + encodeURIComponent('Il mio ordine Tipiko ' + res.code + ': ' + res.track_url);
    store.set('tipiko_last_order', res.track_url);
    openModal($('#orderSuccess'));
  } catch (e) {
    checkoutError(e.message);
    if (e.status === 409) { loadOrderSlots(); loadMenu(); }
  } finally { btn.classList.remove('loading'); renderDrawer(); }
}
async function copy(btn) {
  const link = btn.dataset.link; if (!link) return;
  try { await navigator.clipboard.writeText(link); btn.textContent = '✓ Copiato'; } catch { prompt('Copia il link', link); }
}
on('#copyTrackLink', 'click', e => copy(e.currentTarget));

/* ---------- Prenotazione tavolo ---------- */
const form = $('#bookingForm'), dateInput = $('#date'), guestsInput = $('#guests'), timeInput = $('#time'), slotsNode = $('#timeSlots'), bookingMessage = $('#bookingMessage');
let requestSeq = 0;
const today = new Date(), until = addDays(today, 90);
if (HAS_BOOKING) { dateInput.min = dateStr(today); dateInput.max = dateStr(until); dateInput.value = dateStr(today); }
const bookingCalendar = HAS_BOOKING ? window.TerrazzaCalendar?.mount({ container: '#bookingCalendar', input: '#date' }) : null;
const errText = msg => { bookingMessage.textContent = msg; bookingMessage.className = 'form-message error'; };
function slotMessage(text) { slotsNode.innerHTML = ''; const p = document.createElement('div'); p.className = 'slot-hint'; p.textContent = text; slotsNode.append(p); }
async function loadSlots() {
  const id = ++requestSeq; const date = dateInput.value; const guests = Number(guestsInput.value);
  timeInput.value = ''; bookingMessage.textContent = ''; bookingMessage.className = '';
  if (!date) return slotMessage('Scegli una data per vedere gli orari.');
  slotMessage('Controlliamo la disponibilità…');
  try {
    const data = await getJSON(`/api/availability?date=${encodeURIComponent(date)}&guests=${guests}`); if (id !== requestSeq) return;
    if (!data.slots?.length) return slotMessage('Nessun orario disponibile. Prova un’altra data oppure chiamaci.');
    slotsNode.innerHTML = '';
    for (const time of data.slots) {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'slot'; b.textContent = time; b.setAttribute('aria-pressed', 'false');
      b.addEventListener('click', () => { timeInput.value = time; slotsNode.querySelectorAll('.slot').forEach(x => { x.classList.toggle('selected', x === b); x.setAttribute('aria-pressed', String(x === b)); }); });
      slotsNode.append(b);
    }
  } catch { if (id === requestSeq) slotMessage('Disponibilità non raggiungibile. Contattaci su WhatsApp.'); }
}
if (HAS_BOOKING) { dateInput.addEventListener('change', loadSlots); guestsInput.addEventListener('change', loadSlots); }
form?.addEventListener('submit', async e => {
  e.preventDefault(); if (!form.reportValidity()) return;
  if (!timeInput.value) return errText('Seleziona un orario tra quelli disponibili.');
  const btn = $('#bookingSubmit'); btn.disabled = true; btn.classList.add('loading'); bookingMessage.textContent = '';
  const fields = new FormData(form); const data = Object.fromEntries(fields.entries()); data.guests = Number(data.guests); data.privacy = fields.has('privacy');
  try {
    const result = await getJSON('/api/reservations', { method: 'POST', body: JSON.stringify(data) });
    const link = result.manage_url || '';
    $('#manageLinkActions').hidden = !link;
    if (link) { $('#manageBookingLink').href = link; $('#copyManageLink').dataset.link = link; $('#shareManageWhatsApp').href = 'https://api.whatsapp.com/send?text=' + encodeURIComponent('La mia prenotazione da Tipiko: ' + link); }
    openModal($('#successScreen'));
    form.reset(); dateInput.value = dateStr(new Date()); guestsInput.value = '2'; bookingCalendar?.render(); loadSlots();
  } catch (err) { if ((err.message || '').includes('tavoli disponibili')) await loadSlots(); errText(err.message || 'Impossibile inviare la richiesta. Riprova.'); }
  finally { btn.disabled = false; btn.classList.remove('loading'); }
});
on('#copyManageLink', 'click', e => copy(e.currentTarget));
on('#closeSuccess', 'click', () => closeModal($('#successScreen')));
on('#successOk', 'click', () => closeModal($('#successScreen')));

/* ---------- Avvio ---------- */
async function init() {
  try {
    const json = await getJSON('/api/public');
    site = json.site || {}; ordering = json.ordering || { ordering_enabled: false };
    closures = { closed_dates: json.closed_dates || [], closed_weekdays: json.closed_weekdays || [], closed_periods: json.closed_periods || [] };
    applySite();
    if ($('#orderingOff')) $('#orderingOff').hidden = ordering.ordering_enabled;
    if ($('#serviceDelivery')) $('#serviceDelivery').hidden = !ordering.delivery_enabled;
    $$('[data-delivery-info]').forEach(el => el.textContent = (ordering.delivery_area || 'Ad Amantea e dintorni') + (ordering.delivery_fee_cents ? ' · ' + euro(ordering.delivery_fee_cents) : ''));
    if (!ordering.ordering_enabled) { if ($('#menuIntro')) $('#menuIntro').textContent = 'Il menu completo con i prezzi aggiornati.'; $$('.header-cta, .hero-actions .btn-wine').forEach(a => a.textContent = 'Scopri il menu'); }
    bookingCalendar?.setClosures(json, true);
    if (HAS_BOOKING) {
    if (!json.booking_enabled) { $('#bookingUnavailable').hidden = false; form.hidden = true; }
    const max = Math.min(json.max_guests || 8, 20); guestsInput.innerHTML = '';
    for (let n = 1; n <= max; n++) { const o = document.createElement('option'); o.value = n; o.textContent = `${n} ${n === 1 ? 'persona' : 'persone'}`; guestsInput.append(o); }
    guestsInput.value = Math.min(max, 2);
    if (json.booking_enabled) loadSlots();
    }
  } catch { if (HAS_BOOKING) slotMessage('Sistema momentaneamente non disponibile: puoi prenotare telefonicamente.'); }
  if (HAS_MENU) await loadMenu();
  updateCartUI();
  if (HAS_DRAWER && location.hash === '#carrello' && count() > 0) openDrawer();
}
init();
