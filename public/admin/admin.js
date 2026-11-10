const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const fmt = new Intl.DateTimeFormat('it-IT',{weekday:'long',day:'numeric',month:'long',year:'numeric'});
const dateLocal = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
const parseDay = d => new Date(`${d}T12:00:00`);
const esc = v => String(v ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
let dashboard = null, selectedDate = dateLocal(new Date()), activeFilter='all', activeTab='orders', toastTimer;
let settingsDirty=false, closedPeriods=[];
function toast(s, error=false){const t=$('#toast');t.textContent=s;t.className=(error?'error ':'')+'visible';clearTimeout(toastTimer);toastTimer=setTimeout(()=>t.className='',4200);}
async function api(path,opts={}){const r=await fetch('/api'+path,{credentials:'same-origin',cache:'no-store',...opts,headers:{...(opts.body?{'Content-Type':'application/json'}:{}),...opts.headers}});let j;try{j=await r.json();}catch{throw Error('Risposta del server non valida');}if(!r.ok||!j.ok){if(r.status===401&&path!='/admin/login')setLogin();throw Error(j.error||'Operazione non riuscita');}return j;}
const post=(p,data)=>api(p,{method:'POST',body:JSON.stringify(data)});
function setLogin(){dashboard=null;$('#loginView').hidden=false;$('#dashboardView').hidden=true;}
function setAdmin(){ $('#loginView').hidden=true;$('#dashboardView').hidden=false;$('#openAdd').hidden=activeTab!=='reservations';document.dispatchEvent(new CustomEvent('admin:ready')); }
async function checkSession(){try{const r=await api('/admin/me');if(r.ok){setAdmin();await refresh();}else setLogin();}catch{setLogin();}}
$('#loginForm').addEventListener('submit',async e=>{e.preventDefault();const btn=$('#loginSubmit');btn.disabled=true;$('#loginError').textContent='';try{await post('/admin/login',{password:$('#password').value});$('#password').value='';setAdmin();await refresh();}catch(e){$('#loginError').textContent=e.message;}finally{btn.disabled=false;}});
$('#logout').addEventListener('click',async()=>{try{await api('/admin/logout',{method:'POST'});}catch{}setLogin();});
function changeTab(tab){activeTab=tab;$$('.nav-tab').forEach(b=>b.classList.toggle('active',b.dataset.tab===tab));$$('.tab-panel').forEach(el=>el.hidden=el.id!=='tab'+tab[0].toUpperCase()+tab.slice(1));$('#tabTitle').textContent=({orders:'Ordini online',reservations:'Prenotazioni',menu:'Menu',tables:'Tavoli & fasce',settings:'Orari tavoli e chiusure',ordersettings:'Ordini & dati del locale'})[tab];$('#openAdd').hidden=tab!=='reservations';document.dispatchEvent(new CustomEvent('admin:tab',{detail:tab}));if(dashboard){if(tab==='tables')renderTables();if(tab==='settings'&&!settingsDirty)renderSettings();}}
$$('.nav-tab').forEach(btn=>btn.addEventListener('click',()=>changeTab(btn.dataset.tab)));
$('#selectedDate').value=selectedDate;$('#todayLabel').textContent=fmt.format(new Date());
$('#selectedDate').addEventListener('change',()=>{selectedDate=$('#selectedDate').value;refresh();});
function shiftDate(n){const d=parseDay(selectedDate);d.setDate(d.getDate()+n);selectedDate=dateLocal(d);$('#selectedDate').value=selectedDate;refresh();}
$('#prevDate').addEventListener('click',()=>shiftDate(-1));$('#nextDate').addEventListener('click',()=>shiftDate(1));$('#todayBtn').addEventListener('click',()=>{selectedDate=dateLocal(new Date());$('#selectedDate').value=selectedDate;refresh();});
$$('#statusFilters button').forEach(b=>b.addEventListener('click',()=>{activeFilter=b.dataset.status;$$('#statusFilters button').forEach(x=>x.classList.toggle('active',x===b));renderBookings();}));
async function refresh(){try{const d=await api('/admin/dashboard?date='+encodeURIComponent(selectedDate));dashboard=d;renderBookings();if(activeTab==='tables')renderTables();if(activeTab==='settings'&&!settingsDirty)renderSettings();if(activeTab==='reservations'){if(calendarMonth!==selectedDate.slice(0,7))calendarMonth=selectedDate.slice(0,7);loadAdminCalendar();}}catch(e){toast(e.message,true);}}
function badge(status){return {pending:'Da confermare',confirmed:'Confermata',seated:'Al tavolo',cancelled:'Annullata',no_show:'No show'}[status]||status;}
function cleanPhone(phone){let n=String(phone).replace(/\D/g,'');if(n.startsWith('00'))n=n.slice(2);else if(n.length===10)n='39'+n;return n;}
function whatsapp(r){const day=new Intl.DateTimeFormat('it-IT',{day:'numeric',month:'long'}).format(parseDay(r.service_date));const phrase=r.status==='confirmed' || r.status==='seated' ? 'Ti confermiamo la prenotazione' : 'Abbiamo ricevuto la tua richiesta di prenotazione, presto ti daremo conferma';const msg=`Ciao ${r.customer_name}! ${phrase} da Tipiko per ${r.guests} ${r.guests===1?'persona':'persone'}, ${day} alle ${r.service_time}. Ci trovi in Via S. Bernardino 1, Amantea. A presto!`;return `https://wa.me/${cleanPhone(r.phone)}?text=${encodeURIComponent(msg)}`;}
function renderBookings(){if(!dashboard)return;const r=dashboard.bookings;const active=r.filter(x=>!['cancelled','no_show'].includes(x.status));const counts={pending:active.filter(x=>x.status==='pending').length,confirmed:active.filter(x=>x.status==='confirmed').length,seated:active.filter(x=>x.status==='seated').length};const stats=[active.length,counts.pending,counts.confirmed+counts.seated,active.reduce((n,x)=>n+x.guests,0)];$$('#stats strong').forEach((e,i)=>e.textContent=stats[i]);$('#countBadge').textContent=r.length;const selected=activeFilter==='all'?r:r.filter(x=>x.status===activeFilter);const node=$('#bookingList');if(!selected.length){node.innerHTML='<div class="empty-state"><div><strong>Nessuna prenotazione</strong>Niente in agenda con questi filtri.<br>Una buona serata inizia da qui.</div></div>';return;}
node.innerHTML=selected.map(x=>`<article class="booking-row ${['cancelled','no_show'].includes(x.status)?'is-muted':''}"><div class="booking-time">${esc(x.service_time)}</div><div class="booking-guest"><strong>${esc(x.customer_name)}</strong><small>${x.guests} ${x.guests===1?'persona':'persone'} · ${esc(x.source==='staff'?'Inserita dallo staff':'Dal sito web')}</small><a href="tel:${esc(cleanPhone(x.phone))}">${esc(x.phone)}</a></div><div class="booking-meta"><strong>${esc(x.table_label||'Tavolo non assegnato')}</strong><small>${esc(x.notes?'Note presenti':'Nessuna nota')}</small></div><div class="booking-status"><span class="pill ${esc(x.status)}">${esc(badge(x.status))}</span></div><div class="booking-actions"><button type="button" class="edit-action" data-edit="${x.id}">✎ Modifica</button>${x.status==='pending'&&!x.table_id?`<label class="assignment-label">ASSEGNA TAVOLO<select class="assign-table" data-assign="${x.id}"><option value="">Scegli tavolo</option>${dashboard.tables.filter(t=>t.active&&t.capacity>=x.guests).map(t=>`<option value="${t.id}">${esc(t.label)} · ${t.capacity} posti</option>`).join('')}</select></label>`:''}${x.status==='pending'?`<button class="confirm-action" data-id="${x.id}">✓ Conferma</button>`:''}${['pending','confirmed'].includes(x.status)?`<a class="wa-action" href="${esc(whatsapp(x))}" data-wa="${x.id}" target="_blank" rel="noopener">WhatsApp ↗</a>`:''}${x.status==='confirmed'?`<button data-id="${x.id}" data-status="seated">Al tavolo</button>`:''}${!['cancelled','no_show'].includes(x.status)?`<button class="cancel-action" data-id="${x.id}" data-status="cancelled">Annulla</button>`:''}${x.status==='cancelled'?`<button data-id="${x.id}" data-status="pending">Ripristina</button>`:''}</div>${x.notes?`<div class="booking-notes">✎ ${esc(x.notes)}</div>`:''}</article>`).join('');
node.querySelectorAll('button[data-status]').forEach(b=>b.addEventListener('click',()=>updateStatus(b.dataset.id,b.dataset.status)));
node.querySelectorAll('.confirm-action').forEach(b=>b.addEventListener('click',()=>{const select=node.querySelector('select[data-assign="'+b.dataset.id+'"]');if(select&&!select.value){toast('Scegli prima un tavolo reale. Se non c’è, aggiungilo in Tavoli & fasce.',true);return;}updateStatus(b.dataset.id,'confirmed',select?Number(select.value):undefined);}));
node.querySelectorAll('.edit-action').forEach(b=>b.addEventListener('click',()=>openEdit(b.dataset.edit)));
}
async function updateStatus(id,status,tableId){try{await api('/admin/reservations/'+id,{method:'PATCH',body:JSON.stringify({status,...(tableId===undefined?{}:{table_id:tableId})})});toast('Prenotazione aggiornata');await refresh();}catch(e){toast(e.message,true);}}
function slots(){return dashboard?.settings.slots||['19:00','19:30','20:00','20:30','21:00','21:30','22:00'];}
function renderTables(){if(!dashboard)return;const old=$('#tableTime').value;const select=$('#tableTime');select.innerHTML=slots().map(s=>`<option value="${esc(s)}">${esc(s)}</option>`).join('');select.value=slots().includes(old)?old:slots()[0];const minute=t=>Number(t.slice(0,2))*60+Number(t.slice(3,5));const start=minute(select.value||'20:00'),end=start+dashboard.settings.duration;
$('#tableBoard').innerHTML=dashboard.tables.map(t=>{const r=dashboard.bookings.find(r=>r.table_id===t.id&&['pending','confirmed','seated'].includes(r.status)&&minute(r.service_time)<end&&minute(r.service_time)+dashboard.settings.duration>start);const status=!t.active?'disabled':r?'busy':'free';return `<div class="table-tile ${status}"><div class="table-tile-head"><strong>${esc(t.label)}</strong><span>${t.capacity} posti</span></div><div class="table-tile-body">${r?esc(r.customer_name):status==='disabled'?'Non disponibile':'Pronto ad accogliere'}</div><div class="table-tile-footer"><span>${r?esc(r.service_time):status==='free'?'Libero':'Disattivato'}</span><i class="dot ${status}"></i></div></div>`}).join('');
$('#tableConfig').innerHTML=dashboard.tables.map(t=>`<form class="table-config-item" data-id="${t.id}"><label>NOME<input name="label" value="${esc(t.label)}" maxlength="35" required></label><label>POSTI<input name="capacity" type="number" min="1" max="30" value="${t.capacity}" required></label><label>ATTIVO<select name="active"><option value="true" ${t.active?'selected':''}>Sì</option><option value="false" ${!t.active?'selected':''}>No</option></select></label><button type="submit" class="outline">Salva</button></form>`).join('');
$$('.table-config-item').forEach(f=>f.addEventListener('submit',async e=>{e.preventDefault();const d=Object.fromEntries(new FormData(f));try{await post('/admin/tables',{id:Number(f.dataset.id),label:d.label,capacity:Number(d.capacity),active:d.active==='true'});toast('Tavolo aggiornato');await refresh();}catch(err){toast(err.message,true);}}));
}
$('#tableTime').addEventListener('change',renderTables);
$('#addTableForm').addEventListener('submit',async e=>{e.preventDefault();const d=Object.fromEntries(new FormData(e.currentTarget));try{await post('/admin/tables',{label:d.label,capacity:Number(d.capacity)});e.currentTarget.reset();toast('Tavolo aggiunto');await refresh();}catch(err){toast(err.message,true);}});

const parseClosedDates=()=>$('#closedDates').value.split(/[\n,\s]+/).map(d=>d.trim()).filter(Boolean);
const isDateString=d=>/^\d{4}-\d{2}-\d{2}$/.test(d)&&!Number.isNaN(Date.parse(d+'T12:00:00Z'))&&new Date(d+'T12:00:00Z').toISOString().slice(0,10)===d;
const markSettingsDirty=()=>{settingsDirty=true;};
function renderClosedDates(){
  const dates=[...new Set(parseClosedDates())].sort();
  $('#closedDateChips').innerHTML=dates.map(d=>'<span class="closed-date-chip">'+esc(d)+' <button type="button" data-remove-date="'+esc(d)+'" aria-label="Rimuovi la chiusura '+esc(d)+'">×</button></span>').join('');
}
function renderClosedRanges(){
  const node=$('#closureRangeList');
  if(!closedPeriods.length){node.innerHTML='<p class="closure-no-ranges">Nessun periodo di chiusura inserito.</p>';return;}
  node.innerHTML=closedPeriods.map((p,i)=>'<div class="closure-range-item"><span><strong>'+esc(p.from)+' — '+esc(p.to)+'</strong><small>'+esc(p.label||'Chiusura programmata')+'</small></span><button type="button" data-remove-period="'+i+'" aria-label="Rimuovi il periodo">Rimuovi ×</button></div>').join('');
}
function renderSettings(){
  if(!dashboard || settingsDirty)return;
  const s=dashboard.settings;
  $('#bookingEnabled').checked=s.booking_enabled;
  $('#bookingMode').value=s.mode||'request';
  $('#maxGuests').value=s.max_guests;
  $('#duration').value=s.duration;
  $('#bookingSlots').value=s.slots.join('\n');
  $('#closedDates').value=s.closed_dates.join('\n');
  const closedDays=s.closed_weekdays||[];
  $$('#closedWeekdays input[type="checkbox"]').forEach(c=>c.checked=closedDays.includes(Number(c.value)));
  closedPeriods=(s.closed_periods||[]).map(p=>({from:p.from,to:p.to,label:p.label||''}));
  renderClosedDates();renderClosedRanges();
}
$('#settingsForm').addEventListener('input',e=>{
  markSettingsDirty();
  if(e.target.id==='closedDates')renderClosedDates();
});
$('#settingsForm').addEventListener('change',markSettingsDirty);
$('#closedDateChips').addEventListener('click',e=>{
  const b=e.target.closest('button[data-remove-date]');if(!b)return;
  $('#closedDates').value=parseClosedDates().filter(d=>d!==b.dataset.removeDate).join('\n');
  markSettingsDirty();renderClosedDates();
});
$('#addClosedDate').addEventListener('click',()=>{
  const d=$('#closedQuickDate').value;
  if(!isDateString(d))return toast('Scegli una data valida per la chiusura',true);
  $('#closedDates').value=[...new Set([...parseClosedDates(),d])].sort().join('\n');
  $('#closedQuickDate').value='';
  markSettingsDirty();renderClosedDates();
  toast('Giorno aggiunto: premi Salva impostazioni per renderlo effettivo.');
});
$('#addClosureRange').addEventListener('click',()=>{
  const from=$('#closureStart').value,to=$('#closureEnd').value,label=$('#closureLabel').value.trim();
  if(!isDateString(from)||!isDateString(to)||from>to)return toast('Inserisci un intervallo di date valido',true);
  if((Date.parse(to)-Date.parse(from))/86400000>366)return toast('Un periodo di chiusura non può superare 366 giorni',true);
  if(closedPeriods.length>=100)return toast('Troppi periodi di chiusura',true);
  if(closedPeriods.some(p=>p.from===from&&p.to===to))return toast('Questo intervallo è già presente',true);
  closedPeriods.push({from,to,label:label.slice(0,80).replace(/[<>]/g,'')});
  closedPeriods.sort((a,b)=>a.from.localeCompare(b.from));
  $('#closureStart').value='';$('#closureEnd').value='';$('#closureLabel').value='';
  markSettingsDirty();renderClosedRanges();
  toast('Periodo aggiunto: premi Salva impostazioni.');
});
$('#closureRangeList').addEventListener('click',e=>{
  const b=e.target.closest('button[data-remove-period]');if(!b)return;
  const index=Number(b.dataset.removePeriod);
  if(!Number.isInteger(index)||index<0||index>=closedPeriods.length)return;
  closedPeriods.splice(index,1);markSettingsDirty();renderClosedRanges();
});
$('#settingsForm').addEventListener('submit',async e=>{
  e.preventDefault();
  const dates=parseClosedDates();
  if(dates.some(d=>!isDateString(d)))return toast('Controlla le date di chiusura: usa YYYY-MM-DD',true);
  const d={
    booking_enabled:$('#bookingEnabled').checked,
    booking_mode:$('#bookingMode').value,
    max_guests:Number($('#maxGuests').value),
    duration:Number($('#duration').value),
    slots:$('#bookingSlots').value.split(/[\n,]+/).map(x=>x.trim()).filter(Boolean),
    closed_dates:[...new Set(dates)],
    closed_weekdays:$$('#closedWeekdays input:checked').map(x=>Number(x.value)),
    closed_periods:closedPeriods.map(x=>({...x}))
  };
  try{
    const res=await post('/admin/settings',d);
    settingsDirty=false;
    toast(res.message||'Impostazioni e chiusure salvate');
    await refresh();
    if(activeTab==='settings')renderSettings();
  }catch(err){toast(err.message,true);}
});
$('#openAdd').addEventListener('click',()=>{$('#addModal').hidden=false;document.querySelector('#manualForm [name="date"]').value=selectedDate;document.querySelector('#manualForm [name="name"]').focus();});
function closeModal(){$('#addModal').hidden=true;}$('#closeAdd').addEventListener('click',closeModal);$('#addModal').addEventListener('click',e=>{if(e.target.id==='addModal')closeModal();});window.addEventListener('keydown',e=>{if(e.key==='Escape')closeModal();});
$('#manualForm').addEventListener('submit',async e=>{e.preventDefault();const d=Object.fromEntries(new FormData(e.currentTarget));d.guests=Number(d.guests);try{await post('/admin/reservations',d);toast('Prenotazione inserita');closeModal();e.currentTarget.reset();await refresh();}catch(err){toast(err.message,true);}});
const b64bytes=s=>{const str=atob(s.replace(/-/g,'+').replace(/_/g,'/'));return Uint8Array.from(str,c=>c.charCodeAt(0));};
$('#enablePush').addEventListener('click',async()=>{const btn=$('#enablePush');btn.disabled=true;try{if(!('serviceWorker'in navigator)||!('PushManager'in window)||!('Notification'in window)||!window.isSecureContext)throw Error('Notifiche push non supportate in questo browser');const me=await api('/admin/me');if(!me.push_enabled||!me.vapid_public_key)throw Error('Notifiche push non configurate sul server');const permission=await Notification.requestPermission();if(permission!=='granted')throw Error('Permesso notifiche non concesso');const reg=await navigator.serviceWorker.register('/sw.js',{scope:'/admin/'});await navigator.serviceWorker.ready;let sub=await reg.pushManager.getSubscription();if(sub&&sub.options.applicationServerKey&&btoa(String.fromCharCode(...new Uint8Array(sub.options.applicationServerKey))).replace(/=+$/,'').replace(/\+/g,'-').replace(/\//g,'_')!==me.vapid_public_key){await sub.unsubscribe();sub=null;}if(!sub)sub=await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:b64bytes(me.vapid_public_key)});await post('/admin/push',sub.toJSON());toast('Notifiche attivate su questo dispositivo');btn.innerHTML='✓ Notifiche attive';}catch(e){toast(e.message,true);}finally{btn.disabled=false;}});
if('serviceWorker'in navigator)navigator.serviceWorker.addEventListener('message',e=>{if(e.data?.type==='BOOKING_PUSH'){refresh();document.dispatchEvent(new CustomEvent('admin:push'));}});
setInterval(()=>{if(dashboard&&!document.hidden)refresh();},30000);

/* Full booking-management workflow: month calendar, edit form, audit trail, customer links. */
let calendarMonth=selectedDate.slice(0,7),calendarSeq=0,editing=null;
const monthFormat=new Intl.DateTimeFormat('it-IT',{month:'long',year:'numeric'});
function nextCalendarMonth(delta){
  const [y,m]=calendarMonth.split('-').map(Number);
  const next=new Date(y,m-1+delta,1);
  calendarMonth=dateLocal(next).slice(0,7);
  loadAdminCalendar();
}
$('#monthPrev').addEventListener('click',()=>nextCalendarMonth(-1));
$('#monthNext').addEventListener('click',()=>nextCalendarMonth(1));
async function loadAdminCalendar(){
  const seq=++calendarSeq;
  const node=$('#adminCalendar');
  try{
    const data=await api('/admin/calendar?month='+encodeURIComponent(calendarMonth));
    if(seq!==calendarSeq)return;
    const [y,m]=calendarMonth.split('-').map(Number);
    const first=new Date(y,m-1,1);
    const days=new Date(y,m,0).getDate();
    const offset=(first.getDay()+6)%7;
    const countMap=new Map(data.days.map(d=>[d.date,d]));
    const closures=data.closures||dashboard?.settings||{};
    const daysClosed=new Set(closures.closed_weekdays||[]);
    const datesClosed=new Set(closures.closed_dates||[]);
    const periodsClosed=closures.closed_periods||[];
    function closedReason(date){
      if(datesClosed.has(date))return 'Chiusura straordinaria';
      const period=periodsClosed.find(p=>date>=p.from&&date<=p.to);
      if(period)return period.label||'Chiusura programmata';
      const d=new Date(date+'T12:00:00').getDay()||7;
      return daysClosed.has(d)?'Chiusura settimanale':'';
    }
    $('#monthTitle').textContent=monthFormat.format(first);
    const header=['L','M','M','G','V','S','D'].map((day,i)=>'<span class="month-weekday" aria-label="'+['Lunedì','Martedì','Mercoledì','Giovedì','Venerdì','Sabato','Domenica'][i]+'">'+day+'</span>').join('');
    node.innerHTML=header+Array.from({length:offset},()=>'<span aria-hidden="true"></span>').join('')+
      Array.from({length:days},(_,i)=>{const day=dateLocal(new Date(y,m-1,i+1));const counts=countMap.get(day)||{total:0,pending:0,covers:0};const closed=closedReason(day);return '<button type="button" data-day="'+day+'" title="'+esc(closed||'')+'" class="month-day '+(day===selectedDate?'active ':'')+(closed?'is-closed':'')+'"><span class="day-number">'+(i+1)+'</span>'+(closed?'<span class="month-closed">CHIUSO</span>':'')+(counts.total?'<span class="month-count">'+counts.total+' pren.</span><small>'+(closed?'Da verificare · ':'')+counts.pending+' attesa</small>':(!closed?'<small class="empty-day">—</small>':''))+'</button>'}).join('');
    node.querySelectorAll('button[data-day]').forEach(b=>b.addEventListener('click',()=>{
      selectedDate=b.dataset.day;$('#selectedDate').value=selectedDate;refresh();
    }));
  }catch(e){if(seq===calendarSeq)node.textContent='Calendario temporaneamente non disponibile: '+e.message;}
}
function closeEdit(){
  $('#editModal').hidden=true;document.body.classList.remove('edit-open');editing=null;
}
function openEdit(id){
  const row=dashboard?.bookings.find(b=>b.id===id);
  if(!row)return toast('Prenotazione non trovata',true);
  editing=row;
  const form=$('#editForm');
  for(const [key,val] of Object.entries({date:row.service_date,time:row.service_time,guests:row.guests,name:row.customer_name,phone:row.phone,notes:row.notes||'',status:row.status})){
    if(form.elements.namedItem(key))form.elements.namedItem(key).value=val;
  }
  const tables=dashboard.tables.filter(t=>t.active||t.id===row.table_id);
  $('#editTable').innerHTML='<option value="">Non assegnato</option>'+tables.map(t=>'<option value="'+t.id+'">'+esc(t.label)+' · '+t.capacity+' posti'+(!t.active?' (disattivo)':'')+'</option>').join('');
  $('#editTable').value=row.table_id==null?'':String(row.table_id);
  $('#editModal').hidden=false;document.body.classList.add('edit-open');
  $('#editHistory').textContent='Caricamento cronologia…';
  api('/admin/reservations/'+id+'/history').then(r=>{
    if(!editing||editing.id!==id)return;
    if(!r.items.length){$('#editHistory').textContent='Nessuna modifica registrata.';return;}
    const actions={created:'Richiesta creata',updated:'Modificata dallo staff',rescheduled:'Modificata dal cliente',cancelled:'Annullata dal cliente',link_created:'Nuovo link generato'};
    $('#editHistory').innerHTML=r.items.map(item=>'<div class="history-item"><strong>'+esc(actions[item.action]||item.action)+'</strong><small>'+esc(item.created_at)+' · '+esc(item.actor==='customer'?'Cliente':'Staff')+'</small></div>').join('');
  }).catch(()=>{$('#editHistory').textContent='Cronologia non disponibile';});
  form.elements.namedItem('date').focus();
}
$('#closeEdit').addEventListener('click',closeEdit);
$('#editModal').addEventListener('click',e=>{if(e.target.id==='editModal')closeEdit();});
window.addEventListener('keydown',e=>{if(e.key==='Escape'&&!$('#editModal').hidden)closeEdit();});
$('#editForm').addEventListener('submit',async e=>{
  e.preventDefault();if(!editing)return;
  const submit=$('#editSave');
  const data=Object.fromEntries(new FormData(e.currentTarget));
  data.guests=Number(data.guests);
  data.table_id=data.table_id?Number(data.table_id):null;
  submit.disabled=true;
  try{
    const updated=await api('/admin/reservations/'+editing.id,{method:'PATCH',body:JSON.stringify(data)});
    const id=editing.id;
    toast('Prenotazione aggiornata. Puoi avvisare il cliente su WhatsApp.');
    if(updated.booking){
      // Keep the latest values even if the booking moved to another day and is
      // no longer included in the currently selected agenda.
      editing={
        ...editing,
        service_date:updated.booking.date,
        service_time:updated.booking.time,
        guests:updated.booking.guests,
        customer_name:updated.booking.name,
        phone:updated.booking.phone,
        notes:updated.booking.notes,
        status:updated.booking.status,
        table_id:updated.booking.table_id
      };
    }
    await refresh();
    const fresh=dashboard?.bookings.find(x=>x.id===id);
    if(fresh)editing=fresh;
    $('#editHistory').textContent='Modifica salvata. Riapri la scheda per vedere la cronologia.';
  }catch(err){toast(err.message,true);}
  finally{submit.disabled=false;}
});
function waUrl(record,text){
  return 'https://wa.me/'+cleanPhone(record.phone)+'?text='+encodeURIComponent(text);
}
function updateText(record,link=''){
  const day=new Intl.DateTimeFormat('it-IT',{weekday:'long',day:'numeric',month:'long'}).format(parseDay(record.service_date));
  const status=record.status==='confirmed'?'confermata':record.status==='cancelled'?'annullata':record.status==='pending'?'in attesa di conferma':record.status==='seated'?'in corso':'aggiornata';
  return 'Ciao '+record.customer_name+'! La tua prenotazione da Tipiko è '+status+'. Riepilogo: '+day+' alle '+record.service_time+', '+record.guests+' '+(record.guests===1?'persona':'persone')+'. '+(link?'Puoi modificarla o cancellarla da qui: '+link+' ':'')+'A presto!';
}
$('#sendUpdateWa').addEventListener('click',()=>{
  if(!editing)return;
  window.open(waUrl(editing,updateText(editing)),'_blank','noopener');
});
async function manageLink(){
  if(!editing)throw Error('Apri una prenotazione');
  const result=await post('/admin/reservations/'+editing.id+'/link',{});
  return result.manage_url;
}
$('#sendManageWa').addEventListener('click',async()=>{
  if(!editing)return;
  const popup=window.open('about:blank','_blank');
  const record=editing;
  try{
    const link=await manageLink();
    const url=waUrl(record,updateText(record,link));
    if(popup)popup.location.href=url;else window.location.assign(url);
    toast('WhatsApp pronto. Premi Invia per consegnare il link; il precedente link è stato sostituito.');
  }catch(e){if(popup)popup.close();toast(e.message,true);}
});
$('#copyManageAdmin').addEventListener('click',async()=>{
  try{
    const link=await manageLink();
    await navigator.clipboard.writeText(link);
    toast('Link personale copiato. Il precedente, se presente, è stato disattivato.');
  }catch(e){toast(e.message,true);}
});

checkSession();
