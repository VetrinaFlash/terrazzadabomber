/* Tipiko — pagina di stato dell'ordine (link personale con token nell'hash, mai inviato nei log). */
const $ = s => document.querySelector(s);
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const euro = c => (c / 100).toLocaleString('it-IT', { style: 'currency', currency: 'EUR' });
const token = decodeURIComponent(location.hash.slice(1));
document.querySelectorAll('img[data-fallback]').forEach(img => img.addEventListener('error', () => { if (!img.dataset.t) { img.dataset.t = 1; img.src = img.dataset.fallback; } }));
const STEPS = { takeaway: [['pending', 'Ricevuto'], ['confirmed', 'Confermato'], ['preparing', 'In preparazione'], ['ready', 'Pronto da ritirare']], delivery: [['pending', 'Ricevuto'], ['confirmed', 'Confermato'], ['preparing', 'In preparazione'], ['out_for_delivery', 'In consegna']] };
const MESSAGES = {
  pending: ['In attesa di conferma: il ristorante sta controllando il tuo ordine.', ''],
  confirmed: ['Ordine confermato! Lo prepariamo per l’orario scelto.', 'good'],
  preparing: ['Il tuo ordine è in preparazione 🔥', 'good'],
  ready: ['Il tuo ordine è pronto: ti aspettiamo al locale!', 'good'],
  out_for_delivery: ['Il tuo ordine è in viaggio verso di te 🛵', 'good'],
  completed: ['Ordine completato. Grazie e buon appetito!', 'good'],
  cancelled: ['Ordine annullato.', 'bad'],
  rejected: ['Purtroppo non possiamo accettare questo ordine. Chiamaci per alternative.', 'bad']
};
let timer;
async function call(path) {
  const r = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token }), cache: 'no-store' });
  const j = await r.json().catch(() => ({ ok: false, error: 'Servizio non raggiungibile' }));
  if (!r.ok || !j.ok) throw Object.assign(Error(j.error || 'Errore'), { status: r.status });
  return j;
}
function render({ order: o, site }) {
  const tel = 'tel:+' + String(site.phone || '').replace(/\D/g, '').replace(/^(?!39)(\d{10})$/, '39$1');
  if (site.phone) document.querySelectorAll('[data-tel]').forEach(a => a.href = tel);
  const wa = String(site.whatsapp || site.phone || '').replace(/\D/g, '');
  if (wa) document.querySelectorAll('[data-wa]').forEach(a => a.href = 'https://wa.me/' + (wa.length === 10 ? '39' + wa : wa) + '?text=' + encodeURIComponent('Ciao! Scrivo per l’ordine ' + o.code));
  $('#trackLoading').hidden = true; $('#trackOrder').hidden = false;
  const delivery = o.type === 'delivery';
  $('#trackType').textContent = delivery ? 'Consegna a domicilio' : 'Asporto';
  $('#trackCode').textContent = o.code;
  const day = new Intl.DateTimeFormat('it-IT', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(o.date + 'T12:00:00'));
  $('#trackWhen').textContent = (delivery ? 'Consegna ' : 'Ritiro ') + day + ' alle ' + o.time;
  const steps = STEPS[o.type]; const idx = o.status === 'completed' ? steps.length : steps.findIndex(s => s[0] === o.status);
  $('#progress').hidden = ['cancelled', 'rejected'].includes(o.status);
  $('#progress').innerHTML = steps.map((s, i) => `<li class="${i < idx ? 'done' : i === idx ? 'current' : ''}">${s[1]}</li>`).join('');
  const [msg, cls] = MESSAGES[o.status] || ['', ''];
  $('#trackStatus').textContent = msg; $('#trackStatus').className = 'track-status ' + cls;
  $('#trackItems').innerHTML = o.items.map(i => `<li><span>${i.qty} × ${esc(i.name)}${i.notes ? `<small>${esc(i.notes)}</small>` : ''}</span><strong>${euro(i.unit_price_cents * i.qty)}</strong></li>`).join('');
  $('#trackTotals').innerHTML = `<div><span>Subtotale</span><span>${euro(o.subtotal_cents)}</span></div>${delivery ? `<div><span>Consegna</span><span>${o.delivery_fee_cents ? euro(o.delivery_fee_cents) : 'Gratis'}</span></div>` : ''}<div class="grand"><span>Totale</span><span>${euro(o.total_cents)}</span></div>`;
  const rows = [['Nome', o.name], ['Telefono', o.phone], ...(delivery ? [['Indirizzo', o.address]] : [['Ritiro', [site.address, site.city].filter(Boolean).join(', ')]]), ['Pagamento', o.payment === 'card' ? 'Carta / Bancomat' : 'Contanti'], ...(o.notes ? [['Note', o.notes]] : [])];
  $('#trackData').innerHTML = rows.map(([k, v]) => `<div><dt>${k}</dt><dd>${esc(v)}</dd></div>`).join('');
  $('#cancelOrder').hidden = o.status !== 'pending';
  clearTimeout(timer);
  if (!['completed', 'cancelled', 'rejected'].includes(o.status)) timer = setTimeout(load, 20000);
}
function showError(text) { $('#trackLoading').hidden = true; $('#trackOrder').hidden = true; $('#trackError').hidden = false; if (text) $('#trackErrorText').textContent = text; }
async function load() {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return showError();
  try { render(await call('/api/order/lookup')); }
  catch (e) { if (e.status === 404) showError(); else { clearTimeout(timer); timer = setTimeout(load, 30000); } }
}
$('#cancelOrder').addEventListener('click', async () => {
  if (!confirm('Vuoi davvero annullare l’ordine?')) return;
  const b = $('#cancelOrder'); b.disabled = true;
  try { render(await call('/api/order/cancel')); }
  catch (e) { const t = $('#toast'); t.textContent = e.message; t.classList.add('visible'); setTimeout(() => t.classList.remove('visible'), 3500); load(); }
  finally { b.disabled = false; }
});
document.addEventListener('visibilitychange', () => { if (!document.hidden) load(); });
load();
