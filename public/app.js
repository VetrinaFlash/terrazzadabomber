/* Terrazza da Bomber — editorial motion + accessible reservation workflow */
const $ = s => document.querySelector(s);
const root = document.documentElement;
const menu = $('#mobileMenu');
const toggle = $('#menuToggle');
const form = $('#bookingForm');
const dateInput = $('#date');
const guestsInput = $('#guests');
const timeInput = $('#time');
const slotsNode = $('#timeSlots');
const bookingMessage = $('#bookingMessage');
let requestSeq = 0;

// Visual fallback until original images are permanently archived in public/assets/img.
// Never retry infinitely if an old image is no longer reachable after a DNS change.
document.querySelectorAll('img[data-fallback]').forEach(img => img.addEventListener('error', function () {
  if (!this.dataset.triedFallback) {
    this.dataset.triedFallback = '1';
    this.src = 'https://terrazzadabomber.it/assets/img/' + encodeURIComponent(this.dataset.fallback);
    return;
  }
  this.style.opacity = '0';
  this.closest('.frame-image, .taste-img, .hero-image-wrap, .booking-visual, .gallery-layout > div')?.classList.add('photo-unavailable');
}));

const pad = n => String(n).padStart(2, '0');
const dateStr = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const today = new Date(); const until = new Date(today); until.setDate(until.getDate() + 90);
dateInput.min = dateStr(today); dateInput.max = dateStr(until); dateInput.value = dateStr(today);
const bookingCalendar=window.TerrazzaCalendar?.mount({container:'#bookingCalendar',input:'#date'});
$('#year').textContent = new Date().getFullYear();

window.addEventListener('load', () => { document.body.classList.add('is-loaded'); setTimeout(() => document.querySelector('.preloader')?.remove(), 1200); });
setTimeout(() => { document.body.classList.add('is-loaded'); }, 1700);

function setMenu(open) { toggle.setAttribute('aria-expanded', String(open)); menu.classList.toggle('active', open); document.body.classList.toggle('menu-open', open); }
toggle.addEventListener('click', () => setMenu(!menu.classList.contains('active')));
menu.querySelectorAll('a').forEach(a => a.addEventListener('click', () => setMenu(false)));
window.addEventListener('keydown', e => { if (e.key === 'Escape') setMenu(false); });

const io = 'IntersectionObserver' in window ? new IntersectionObserver(entries => { entries.forEach(entry => { if (entry.isIntersecting) { entry.target.classList.add('in-view'); io.unobserve(entry.target); } }); }, { threshold: .12, rootMargin: '0px 0px -24px 0px' }) : null;
document.querySelectorAll('.reveal').forEach(el => io ? io.observe(el) : el.classList.add('in-view'));
let raf = false;
window.addEventListener('scroll', () => { if (raf) return; raf = true; requestAnimationFrame(() => { root.classList.toggle('scrolled', window.scrollY > 50); const hero = $('.hero-image'); if (hero && window.scrollY < window.innerHeight * 1.2 && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) hero.style.transform = `translate3d(0,${Math.min(90, window.scrollY * .17)}px,0) scale(1.07)`; raf = false; }); }, { passive: true });

const errText = msg => { bookingMessage.textContent = msg; bookingMessage.className = 'form-message error'; };
function slotMessage(text) { slotsNode.innerHTML = ''; const p = document.createElement('div'); p.className = 'slot-hint'; p.textContent = text; slotsNode.append(p); }
async function loadSlots() {
  const id = ++requestSeq; const date = dateInput.value; const guests = Number(guestsInput.value);
  timeInput.value = ''; bookingMessage.textContent = ''; bookingMessage.className = '';
  if (!date) return slotMessage('Scegli una data per vedere gli orari.');
  slotMessage('Controlliamo la disponibilità…');
  try {
    const res = await fetch(`/api/availability?date=${encodeURIComponent(date)}&guests=${guests}`, { cache: 'no-store' });
    const data = await res.json(); if (id !== requestSeq) return;
    if (!res.ok || !data.ok) throw Error(data.error || 'Impossibile verificare la disponibilità');
    if (!data.slots?.length) return slotMessage('Nessun orario disponibile. Prova un’altra data oppure chiamaci.');
    slotsNode.innerHTML = '';
    for (const time of data.slots) {
      const button = document.createElement('button'); button.type = 'button'; button.className = 'slot'; button.textContent = time; button.setAttribute('aria-pressed', 'false');
      button.addEventListener('click', () => { timeInput.value = time; slotsNode.querySelectorAll('.slot').forEach(b => { b.classList.toggle('selected', b === button); b.setAttribute('aria-pressed', String(b === button)); }); });
      slotsNode.append(button);
    }
  } catch (e) { if (id === requestSeq) slotMessage('La disponibilità non è raggiungibile. Contattaci su WhatsApp.'); }
}
dateInput.addEventListener('change', loadSlots); guestsInput.addEventListener('change', loadSlots);
async function initBooking() {
  try { const res = await fetch('/api/public', { cache: 'no-store' }); const json = await res.json(); if (!json.ok) throw Error('offline');
    bookingCalendar?.setClosures(json,true);
    if (!json.booking_enabled) { $('#bookingUnavailable').hidden = false; form.hidden = true; }
    const max = Math.min(json.max_guests || 8, 12); guestsInput.innerHTML = '';
    for (let n = 1; n <= max; n++) { const option = document.createElement('option'); option.value = n; option.textContent = `${n} ${n === 1 ? 'persona' : 'persone'}`; guestsInput.append(option); }
    guestsInput.value = Math.min(max, 2);
    if (json.booking_enabled) loadSlots();
  } catch { slotMessage('Sistema temporaneamente non disponibile. Puoi prenotare telefonicamente.'); }
}
initBooking();
form.addEventListener('submit', async e => {
  e.preventDefault(); if (!form.reportValidity()) return;
  if (!timeInput.value) return errText('Seleziona un orario tra quelli disponibili.');
  const btn = $('#bookingSubmit'); btn.disabled = true; btn.classList.add('loading'); bookingMessage.textContent = '';
  const fields = new FormData(form); const data = Object.fromEntries(fields.entries()); data.guests = Number(data.guests); data.privacy = fields.has('privacy');
  try {
    const res = await fetch('/api/reservations', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
    const result = await res.json(); if (!res.ok || !result.ok) throw Error(result.error || 'Errore durante la prenotazione');
    const link=result.manage_url||'';
    const share=$('#manageLinkActions');
    if(link){
      share.hidden=false;
      $('#manageBookingLink').href=link;
      $('#shareManageWhatsApp').href='https://api.whatsapp.com/send?text='+encodeURIComponent('Il mio link per gestire la prenotazione da Terrazza da Bomber: '+link);
      $('#copyManageLink').dataset.link=link;
    }else{share.hidden=true;}
    $('#successScreen').hidden = false; document.body.classList.add('modal-open');
    form.reset(); dateInput.value = dateStr(new Date()); guestsInput.value = '2'; loadSlots();
    $('#closeSuccess').focus();
  } catch (err) { const message = err.message || 'Impossibile inviare la richiesta. Riprova.'; if (message.includes('tavoli disponibili')) await loadSlots(); errText(message); }
  finally { btn.disabled = false; btn.classList.remove('loading'); }
});
$('#copyManageLink').addEventListener('click',async()=>{
  const link=$('#copyManageLink').dataset.link;
  if(!link)return;
  try{
    await navigator.clipboard.writeText(link);
    $('#copyManageLink').textContent='✓ Link copiato';
  }catch{
    const prompt=document.createElement('input');prompt.value=link;prompt.readOnly=true;document.body.append(prompt);prompt.select();
    try{document.execCommand('copy');$('#copyManageLink').textContent='✓ Link copiato';}
    catch{$('#copyManageLink').textContent='Apri il link e salvalo';}
    prompt.remove();
  }
});
function closeSuccess() { $('#successScreen').hidden = true; document.body.classList.remove('modal-open'); $('#bookingSubmit').focus(); }
$('#closeSuccess').addEventListener('click', closeSuccess); $('#successOk').addEventListener('click', closeSuccess);
window.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('#successScreen').hidden) closeSuccess(); });
