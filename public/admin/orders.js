/* Tipiko — gestionale: ordini online, menu e impostazioni del locale. Usa api(), toast(), esc() di admin.js */
(() => {
  const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
  const euro = c => (c / 100).toLocaleString('it-IT', { style: 'currency', currency: 'EUR' });
  const dateLocal = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const dayFmt = new Intl.DateTimeFormat('it-IT', { weekday: 'short', day: 'numeric', month: 'short' });
  const post = (p, d, method = 'POST') => api(p, { method, body: JSON.stringify(d) });
  const STATUS = { pending: 'Da confermare', confirmed: 'Confermato', preparing: 'In preparazione', ready: 'Pronto', out_for_delivery: 'In consegna', completed: 'Completato', cancelled: 'Annullato', rejected: 'Rifiutato' };
  const NEXT = { pending: ['confirmed', '✓ Conferma'], confirmed: ['preparing', '🔥 In preparazione'], preparing: [null, null], ready: ['completed', '✓ Ritirato'], out_for_delivery: ['completed', '✓ Consegnato'] };
  const TAG_LABELS = { vegano: 'Vegano', vegetariano: 'Vegetariano', 'senza-glutine': 'Senza glutine', piccante: 'Piccante', dolce: 'Dolce', novita: 'Novità' };
  const phone = p => { let n = String(p).replace(/\D/g, ''); if (n.startsWith('00')) n = n.slice(2); else if (n.length === 10) n = '39' + n; return n; };

  let day = dateLocal(new Date()), data = null, filter = 'open', timer = null, knownPending = null, tab = 'orders', ready = false;

  /* ---------- Ordini ---------- */
  $('#ordersDate').value = day;
  const setDay = d => { day = d; $('#ordersDate').value = d; loadOrders(); };
  $('#ordersDate').addEventListener('change', () => setDay($('#ordersDate').value || dateLocal(new Date())));
  const shift = n => { const d = new Date(day + 'T12:00:00'); d.setDate(d.getDate() + n); setDay(dateLocal(d)); };
  $('#ordersPrev').addEventListener('click', () => shift(-1)); $('#ordersNext').addEventListener('click', () => shift(1));
  $('#ordersToday').addEventListener('click', () => setDay(dateLocal(new Date())));
  $$('#orderFilters .filter').forEach(b => b.addEventListener('click', () => { filter = b.dataset.f; $$('#orderFilters .filter').forEach(x => x.classList.toggle('active', x === b)); renderOrders(); }));
  $('#ordersAlertGo').addEventListener('click', () => { if (typeof changeTab === 'function') changeTab('orders'); const first = data?.upcoming?.[0]; filter = 'pending'; $$('#orderFilters .filter').forEach(x => x.classList.toggle('active', x.dataset.f === 'pending')); setDay(day === dateLocal(new Date()) || !first ? day : first.d); });

  function beep() {
    if (!$('#orderSound').checked) return;
    try { const ctx = new (window.AudioContext || window.webkitAudioContext)(); [0, .22, .44].forEach((t, i) => { const o = ctx.createOscillator(), g = ctx.createGain(); o.frequency.value = [880, 1175, 1568][i]; o.connect(g); g.connect(ctx.destination); g.gain.setValueAtTime(.0001, ctx.currentTime + t); g.gain.exponentialRampToValueAtTime(.3, ctx.currentTime + t + .02); g.gain.exponentialRampToValueAtTime(.0001, ctx.currentTime + t + .2); o.start(ctx.currentTime + t); o.stop(ctx.currentTime + t + .22); }); } catch {}
  }
  async function loadOrders(silent = false) {
    clearTimeout(timer);
    if ($('#dashboardView').hidden) { ready = false; return; }
    try {
      data = await api('/admin/orders?date=' + encodeURIComponent(day));
      if (knownPending !== null && data.pending_total > knownPending) { beep(); toast('🛵 Nuovo ordine ricevuto!'); if (document.hidden) document.title = '(' + data.pending_total + ') Nuovo ordine · Tipiko'; }
      knownPending = data.pending_total;
      renderOrders();
    } catch (e) { if (!silent) toast(e.message, true); }
    timer = setTimeout(() => loadOrders(true), 20000);
  }
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { document.title = 'Gestionale · Tipiko Ristorante Pizzeria'; if (ready) loadOrders(true); } });
  document.addEventListener('admin:push', () => loadOrders(true));

  const isDone = o => ['completed', 'cancelled', 'rejected'].includes(o.status);
  function renderOrders() {
    if (!data) return;
    const all = data.orders, live = all.filter(o => !['cancelled', 'rejected'].includes(o.status));
    const stats = [live.length, all.filter(o => o.status === 'pending').length, all.filter(o => ['confirmed', 'preparing', 'ready', 'out_for_delivery'].includes(o.status)).length, euro(live.reduce((n, o) => n + o.total_cents, 0))];
    $$('#orderStats strong').forEach((el, i) => el.textContent = stats[i]);
    $('#orderCountBadge').textContent = all.length;
    const badge = $('#ordersBadge'); badge.hidden = !data.pending_total; badge.textContent = data.pending_total;
    $('#ordersAlert').hidden = !data.pending_total; $('#ordersAlertText').textContent = data.pending_total === 1 ? '1 ordine da confermare' : data.pending_total + ' ordini da confermare';
    $('#ordersUpcoming').innerHTML = (data.upcoming || []).length ? '<span class="tiny-title">PROSSIMI GIORNI</span>' + data.upcoming.map(u => `<button type="button" class="upcoming-day ${u.d === day ? 'active' : ''}" data-day="${u.d}">${u.d === data.current_date ? 'Oggi' : esc(dayFmt.format(new Date(u.d + 'T12:00:00')))} <b>${u.n}</b></button>`).join('') : '';
    const list = all.filter(o => ({ open: !isDone(o), pending: o.status === 'pending', takeaway: o.order_type === 'takeaway' && !isDone(o), delivery: o.order_type === 'delivery' && !isDone(o), done: o.status === 'completed', cancelled: ['cancelled', 'rejected'].includes(o.status), all: true })[filter]);
    const node = $('#orderList');
    if (!list.length) { node.innerHTML = `<div class="empty-state"><div><strong>Nessun ordine</strong>${filter === 'open' ? 'Niente da gestire per questo giorno.' : 'Nessun ordine con questo filtro.'}</div></div>`; return; }
    node.innerHTML = list.map(o => {
      const delivery = o.order_type === 'delivery';
      const [nextStatus, nextLabel] = NEXT[o.status] || [];
      const readyBtn = o.status === 'preparing' ? `<button type="button" class="confirm-action" data-status="${delivery ? 'out_for_delivery' : 'ready'}" data-id="${o.id}">${delivery ? '🛵 In consegna' : '✓ Pronto'}</button>` : '';
      return `<article class="order-card status-${o.status} ${isDone(o) ? 'is-muted' : ''}">
        <header><div class="order-time"><strong>${esc(o.service_time)}</strong><span class="type ${o.order_type}">${delivery ? '🛵 Consegna' : '🥡 Asporto'}</span></div>
        <div class="order-who"><strong>${esc(o.customer_name)}</strong><a href="tel:+${phone(o.phone)}">${esc(o.phone)}</a>${delivery ? `<a class="addr" href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(o.address)}" target="_blank" rel="noopener">📍 ${esc(o.address)}</a>` : ''}</div>
        <div class="order-meta"><span class="pill ${o.status}">${STATUS[o.status]}</span><small>${esc(o.code)} · ${o.payment_method === 'card' ? 'Carta' : 'Contanti'}</small><strong class="order-total">${euro(o.total_cents)}</strong></div></header>
        <ul class="order-items">${o.items.map(i => `<li><b>${i.quantity}×</b> ${esc(i.name)}${i.notes ? ` <em>— ${esc(i.notes)}</em>` : ''}<span>${euro(i.unit_price_cents * i.quantity)}</span></li>`).join('')}${o.delivery_fee_cents ? `<li class="fee">Consegna<span>${euro(o.delivery_fee_cents)}</span></li>` : ''}</ul>
        ${o.notes ? `<p class="order-notes">✎ ${esc(o.notes)}</p>` : ''}
        <footer class="booking-actions">
          ${nextStatus ? `<button type="button" class="confirm-action" data-status="${nextStatus}" data-id="${o.id}">${nextLabel}</button>` : ''}${readyBtn}
          ${!isDone(o) ? `<a class="wa-action" href="#" data-wa="${o.id}">WhatsApp ↗</a>` : ''}
          <button type="button" data-print="${o.id}">🖨 Comanda</button>
          ${o.status === 'pending' ? `<button type="button" class="cancel-action" data-status="rejected" data-id="${o.id}">Rifiuta</button>` : ''}
          ${!isDone(o) && o.status !== 'pending' ? `<button type="button" class="cancel-action" data-status="cancelled" data-id="${o.id}">Annulla</button>` : ''}
          ${['cancelled', 'rejected', 'completed'].includes(o.status) ? `<button type="button" data-status="confirmed" data-id="${o.id}">Ripristina</button>` : ''}
        </footer></article>`;
    }).join('');
  }
  $('#ordersUpcoming').addEventListener('click', e => { const b = e.target.closest('[data-day]'); if (b) setDay(b.dataset.day); });
  $('#orderList').addEventListener('click', async e => {
    const st = e.target.closest('[data-status]'), wa = e.target.closest('[data-wa]'), pr = e.target.closest('[data-print]');
    if (st) {
      const s = st.dataset.status;
      if (['rejected', 'cancelled'].includes(s) && !confirm(s === 'rejected' ? 'Rifiutare questo ordine? Ricordati di avvisare il cliente.' : 'Annullare questo ordine?')) return;
      st.disabled = true;
      try { await post('/admin/orders/' + st.dataset.id, { status: s }, 'PATCH'); toast('Ordine aggiornato: ' + STATUS[s] + (['confirmed', 'rejected', 'out_for_delivery', 'ready'].includes(s) ? '. Puoi avvisare il cliente su WhatsApp.' : '')); await loadOrders(true); }
      catch (err) { toast(err.message, true); st.disabled = false; }
    }
    if (wa) { e.preventDefault(); sendWhatsApp(data.orders.find(o => o.id === wa.dataset.wa)); }
    if (pr) printOrders([data.orders.find(o => o.id === pr.dataset.print)]);
  });
  async function sendWhatsApp(o) {
    if (!o) return;
    const popup = window.open('about:blank', '_blank');
    let link = '';
    try { link = (await post('/admin/orders/' + o.id + '/link', {})).track_url; } catch {}
    const when = (o.service_date === data.current_date ? 'oggi' : new Intl.DateTimeFormat('it-IT', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(o.service_date + 'T12:00:00'))) + ' alle ' + o.service_time;
    const delivery = o.order_type === 'delivery';
    const text = {
      pending: `Ciao ${o.customer_name}! Abbiamo ricevuto il tuo ordine ${o.code} da Tipiko, a breve te lo confermiamo.`,
      confirmed: `Ciao ${o.customer_name}! Il tuo ordine ${o.code} da Tipiko è confermato ✅ ${delivery ? 'Consegna' : 'Ritiro'} ${when}. Totale ${euro(o.total_cents)}.`,
      preparing: `Ciao ${o.customer_name}! Il tuo ordine ${o.code} è in preparazione 🔥 ${delivery ? 'Consegna' : 'Ritiro'} ${when}.`,
      ready: `Ciao ${o.customer_name}! Il tuo ordine ${o.code} è pronto: ti aspettiamo da Tipiko, Via S. Bernardino 1 🍕`,
      out_for_delivery: `Ciao ${o.customer_name}! Il tuo ordine ${o.code} è partito ed è in arrivo 🛵 Totale da pagare ${euro(o.total_cents)}.`
    }[o.status] || `Ciao ${o.customer_name}, ti scriviamo per il tuo ordine ${o.code} da Tipiko.`;
    const url = 'https://wa.me/' + phone(o.phone) + '?text=' + encodeURIComponent(text + (link ? '\nSegui l’ordine: ' + link : ''));
    if (popup) popup.location.href = url; else location.assign(url);
  }
  function printOrders(list) {
    list = list.filter(Boolean); if (!list.length) return toast('Nessun ordine da stampare', true);
    $('#printArea').innerHTML = list.map(o => `<section class="ticket"><h1>TIPIKO</h1><p class="big">${o.order_type === 'delivery' ? 'CONSEGNA' : 'ASPORTO'} · ${esc(o.service_time)}</p><p>${esc(o.code)} · ${esc(new Intl.DateTimeFormat('it-IT', { day: '2-digit', month: '2-digit' }).format(new Date(o.service_date + 'T12:00:00')))}</p><hr><p><b>${esc(o.customer_name)}</b><br>${esc(o.phone)}${o.address ? '<br>' + esc(o.address) : ''}</p><hr><table>${o.items.map(i => `<tr><td class="q">${i.quantity}×</td><td>${esc(i.name)}${i.notes ? `<br><i>${esc(i.notes)}</i>` : ''}</td><td class="p">${euro(i.unit_price_cents * i.quantity)}</td></tr>`).join('')}${o.delivery_fee_cents ? `<tr><td></td><td>Consegna</td><td class="p">${euro(o.delivery_fee_cents)}</td></tr>` : ''}</table><hr><p class="big">TOTALE ${euro(o.total_cents)}</p><p>Pagamento: ${o.payment_method === 'card' ? 'CARTA' : 'CONTANTI'}</p>${o.notes ? `<hr><p><b>NOTE:</b> ${esc(o.notes)}</p>` : ''}</section>`).join('');
    window.print();
  }
  $('#printDay').addEventListener('click', () => printOrders((data?.orders || []).filter(o => !['cancelled', 'rejected'].includes(o.status))));

  /* ---------- Menu ---------- */
  let menu = [], tags = [], menuSection = '', menuSearch = '', editingItem = null, editingCat = null;
  async function loadMenu() {
    try { const r = await api('/admin/menu'); menu = r.categories; tags = r.tags; renderMenu(); }
    catch (e) { toast(e.message, true); }
  }
  function renderMenu() {
    const sections = [...new Set(menu.map(c => c.section))];
    if (!sections.includes(menuSection)) menuSection = sections[0] || '';
    $('#menuAdminSections').innerHTML = sections.map(s => `<button type="button" class="filter ${s === menuSection && !menuSearch ? 'active' : ''}" data-section="${esc(s)}">${esc(s)} <b>${menu.filter(c => c.section === s).reduce((n, c) => n + c.items.length, 0)}</b></button>`).join('');
    const q = menuSearch.toLowerCase();
    const cats = menuSearch ? menu.map(c => ({ ...c, items: c.items.filter(i => (i.name + ' ' + i.description).toLowerCase().includes(q)) })).filter(c => c.items.length) : menu.filter(c => c.section === menuSection);
    $('#menuAdmin').innerHTML = cats.length ? cats.map(c => `<section class="menu-admin-cat ${c.active ? '' : 'is-muted'}"><div class="menu-admin-cat-head"><div><h3>${esc(c.name)} ${c.active ? '' : '<span class="pill cancelled">Nascosta</span>'}</h3>${c.description ? `<small>${esc(c.description)}</small>` : ''}</div><div><button type="button" class="outline small" data-edit-cat="${c.id}">Modifica</button><button type="button" class="outline small" data-new-in="${c.id}">+ Piatto</button></div></div>
      ${c.items.map(i => `<div class="menu-admin-item ${i.available ? '' : 'is-off'}"><div class="mai-text"><strong>${esc(i.name)}</strong>${i.description ? `<small>${esc(i.description)}</small>` : ''}<span class="mai-tags">${i.price_cents === 0 ? '<span class="pill pending">Prezzo da inserire</span>' : ''}${!i.orderable && i.price_cents > 0 ? '<span class="pill">Solo al tavolo</span>' : ''}${i.tags.map(t => `<span class="pill">${esc(TAG_LABELS[t] || t)}</span>`).join('')}</span></div>
        <strong class="mai-price">${i.price_cents ? euro(i.price_cents) : '—'}</strong>
        <label class="switch" title="${i.available ? 'Disponibile' : 'Esaurito / nascosto'}"><input type="checkbox" data-toggle="${i.id}" ${i.available ? 'checked' : ''} aria-label="Disponibile: ${esc(i.name)}"><span></span></label>
        <button type="button" class="edit-action" data-edit-item="${i.id}">✎</button></div>`).join('') || '<p class="small-help">Nessun piatto in questa categoria.</p>'}</section>`).join('') : '<div class="empty-state">Nessun risultato.</div>';
    $('#sectionList').innerHTML = sections.map(s => `<option value="${esc(s)}">`).join('');
  }
  $('#menuAdminSections').addEventListener('click', e => { const b = e.target.closest('[data-section]'); if (!b) return; menuSection = b.dataset.section; menuSearch = ''; $('#menuAdminSearch').value = ''; renderMenu(); });
  $('#menuAdminSearch').addEventListener('input', e => { menuSearch = e.target.value.trim(); renderMenu(); });
  $('#menuAdmin').addEventListener('change', async e => {
    const t = e.target.closest('[data-toggle]'); if (!t) return;
    t.disabled = true;
    try { await post('/admin/menu/items/' + t.dataset.toggle, { available: t.checked }, 'PATCH'); toast(t.checked ? 'Piatto di nuovo disponibile' : 'Piatto nascosto dal sito'); await loadMenu(); }
    catch (err) { toast(err.message, true); t.checked = !t.checked; t.disabled = false; }
  });
  $('#menuAdmin').addEventListener('click', e => {
    const ei = e.target.closest('[data-edit-item]'), ec = e.target.closest('[data-edit-cat]'), ni = e.target.closest('[data-new-in]');
    if (ei) openItem(menu.flatMap(c => c.items).find(i => i.id === Number(ei.dataset.editItem)));
    if (ec) openCategory(menu.find(c => c.id === Number(ec.dataset.editCat)));
    if (ni) openItem(null, Number(ni.dataset.newIn));
  });
  $('#newItem').addEventListener('click', () => openItem(null, menu.find(c => c.section === menuSection)?.id));
  $('#newCategory').addEventListener('click', () => openCategory(null));
  const showModal = id => { $(id).hidden = false; document.body.classList.add('edit-open'); $(id).querySelector('input')?.focus(); };
  const hideModal = el => { el.hidden = true; document.body.classList.remove('edit-open'); };
  $$('[data-close-modal]').forEach(b => b.addEventListener('click', () => hideModal(b.closest('.modal-backdrop'))));
  ['#itemModal', '#categoryModal'].forEach(id => $(id).addEventListener('click', e => { if (e.target.id === id.slice(1)) hideModal(e.target); }));
  window.addEventListener('keydown', e => { if (e.key === 'Escape') ['#itemModal', '#categoryModal'].forEach(id => { if (!$(id).hidden) hideModal($(id)); }); });
  function openItem(item, catId) {
    editingItem = item; const f = $('#itemForm');
    $('#itemModalTitle').textContent = item ? 'Modifica piatto' : 'Nuovo piatto';
    $('#itemCategory').innerHTML = menu.map(c => `<option value="${c.id}">${esc(c.section)} · ${esc(c.name)}</option>`).join('');
    f.elements.name.value = item?.name || ''; f.elements.description.value = item?.description || '';
    f.elements.price.value = item ? (item.price_cents / 100).toFixed(2) : ''; f.elements.category_id.value = item?.category_id || catId || menu[0]?.id;
    f.elements.position.value = item?.position ?? ''; f.elements.allergens.value = item?.allergens || '';
    f.elements.available.checked = item ? item.available : true; f.elements.orderable.checked = item ? (item.orderable || item.price_cents === 0) : true;
    $('#itemTags').innerHTML = '<legend>ETICHETTE</legend>' + tags.map(t => `<label class="check"><input type="checkbox" value="${t}" ${item?.tags.includes(t) ? 'checked' : ''}> ${TAG_LABELS[t] || t}</label>`).join('');
    $('#deleteItem').hidden = !item; showModal('#itemModal');
  }
  $('#itemForm').addEventListener('submit', async e => {
    e.preventDefault(); const f = e.currentTarget, btn = f.querySelector('button[type=submit]'); btn.disabled = true;
    const body = { id: editingItem?.id, name: f.elements.name.value, description: f.elements.description.value, price_cents: Math.round(Number(String(f.elements.price.value).replace(',', '.')) * 100), category_id: Number(f.elements.category_id.value), position: Number(f.elements.position.value || 0), allergens: f.elements.allergens.value, available: f.elements.available.checked, orderable: f.elements.orderable.checked, tags: $$('#itemTags input:checked').map(x => x.value) };
    try { await post('/admin/menu/items', body); hideModal($('#itemModal')); toast('Piatto salvato: è già online'); await loadMenu(); }
    catch (err) { toast(err.message, true); } finally { btn.disabled = false; }
  });
  $('#deleteItem').addEventListener('click', async () => {
    if (!editingItem || !confirm('Eliminare definitivamente "' + editingItem.name + '"? Per nasconderlo temporaneamente usa l’interruttore.')) return;
    try { await api('/admin/menu/items/' + editingItem.id, { method: 'DELETE' }); hideModal($('#itemModal')); toast('Piatto eliminato'); await loadMenu(); } catch (err) { toast(err.message, true); }
  });
  function openCategory(cat) {
    editingCat = cat; const f = $('#categoryForm');
    $('#categoryModalTitle').textContent = cat ? 'Modifica categoria' : 'Nuova categoria';
    f.elements.name.value = cat?.name || ''; f.elements.description.value = cat?.description || ''; f.elements.section.value = cat?.section || menuSection;
    f.elements.position.value = cat?.position ?? ''; f.elements.active.checked = cat ? cat.active : true;
    $('#deleteCategory').hidden = !cat; showModal('#categoryModal');
  }
  $('#categoryForm').addEventListener('submit', async e => {
    e.preventDefault(); const f = e.currentTarget;
    try { await post('/admin/menu/categories', { id: editingCat?.id, name: f.elements.name.value, description: f.elements.description.value, section: f.elements.section.value, position: Number(f.elements.position.value || 0), active: f.elements.active.checked }); menuSection = f.elements.section.value.trim(); hideModal($('#categoryModal')); toast('Categoria salvata'); await loadMenu(); }
    catch (err) { toast(err.message, true); }
  });
  $('#deleteCategory').addEventListener('click', async () => {
    if (!editingCat || !confirm('Eliminare la categoria "' + editingCat.name + '"?')) return;
    try { await api('/admin/menu/categories/' + editingCat.id, { method: 'DELETE' }); hideModal($('#categoryModal')); toast('Categoria eliminata'); await loadMenu(); } catch (err) { toast(err.message, true); }
  });

  /* ---------- Impostazioni ordini e locale ---------- */
  const SITE_FIELDS = { name: 'siteName', tagline: 'siteTagline', address: 'siteAddress', city: 'siteCity', phone: 'sitePhone', whatsapp: 'siteWhatsapp', email: 'siteEmail', maps_url: 'siteMaps', instagram: 'siteInstagram', facebook: 'siteFacebook', hours: 'siteHours' };
  let settingsDirty = false;
  async function loadSettings() {
    if (settingsDirty) return;
    try {
      const s = (await api('/admin/order-settings')).settings;
      $('#osEnabled').checked = s.ordering_enabled; $('#osTakeaway').checked = s.takeaway_enabled; $('#osDelivery').checked = s.delivery_enabled; $('#osCard').checked = s.card_payment_enabled;
      $('#osFee').value = (s.delivery_fee_cents / 100).toFixed(2); $('#osMin').value = (s.delivery_min_cents / 100).toFixed(2);
      $('#osCapacity').value = s.slot_capacity; $('#osLead').value = s.lead_minutes; $('#osDays').value = s.days_ahead; $('#osArea').value = s.delivery_area; $('#osSlots').value = s.slots.join('\n');
      for (const [k, id] of Object.entries(SITE_FIELDS)) $('#' + id).value = s.site[k] || '';
    } catch (e) { toast(e.message, true); }
  }
  $('#orderSettingsForm').addEventListener('input', () => settingsDirty = true);
  $('#orderSettingsForm').addEventListener('submit', async e => {
    e.preventDefault(); const btn = e.currentTarget.querySelector('button[type=submit]'); btn.disabled = true;
    const cents = v => Math.round(Number(String(v || 0).replace(',', '.')) * 100);
    const body = { ordering_enabled: $('#osEnabled').checked, takeaway_enabled: $('#osTakeaway').checked, delivery_enabled: $('#osDelivery').checked, card_payment_enabled: $('#osCard').checked, delivery_fee_cents: cents($('#osFee').value), delivery_min_cents: cents($('#osMin').value), slot_capacity: Number($('#osCapacity').value), lead_minutes: Number($('#osLead').value), days_ahead: Number($('#osDays').value), delivery_area: $('#osArea').value, slots: [...new Set($('#osSlots').value.split(/[\n,\s]+/).map(x => x.trim()).filter(Boolean).map(x => /^\d:\d\d$/.test(x) ? '0' + x : x))], site: Object.fromEntries(Object.entries(SITE_FIELDS).map(([k, id]) => [k, $('#' + id).value.trim()])) };
    if (body.ordering_enabled && !body.takeaway_enabled && !body.delivery_enabled) { btn.disabled = false; return toast('Attiva almeno asporto o consegna', true); }
    try { const r = await post('/admin/order-settings', body); settingsDirty = false; toast(r.message); await loadSettings(); loadOrders(true); }
    catch (err) { toast(err.message, true); } finally { btn.disabled = false; }
  });

  /* ---------- Collegamento con admin.js ---------- */
  document.addEventListener('admin:ready', () => { ready = true; loadOrders(); if (tab === 'menu') loadMenu(); if (tab === 'ordersettings') loadSettings(); });
  document.addEventListener('admin:tab', e => { tab = e.detail; if (!ready) return; if (tab === 'orders') loadOrders(true); if (tab === 'menu') loadMenu(); if (tab === 'ordersettings') loadSettings(); });
})();
