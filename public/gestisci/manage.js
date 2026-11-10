(() => {
  const $ = id => document.getElementById(id);
  const token = decodeURIComponent(location.hash.replace(/^#/, '').replace(/^token=/, ''));
  let booking=null;
  let time='';
  let calendarPicker=null;
  const msg=(text,type='')=>{const n=$('message');n.textContent=text;n.className=type;};
  const pad=x=>String(x).padStart(2,'0');
  const italyDay=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Rome',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  const today=italyDay();
  const max=(()=>{const d=new Date(today+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+90);return d.toISOString().slice(0,10);})();
  const dateInput=$('manageDate'), guestsInput=$('manageGuests');
  dateInput.min=today;dateInput.max=max;
  function statusName(s){return ({pending:'Da confermare',confirmed:'Confermata',seated:'Cliente al tavolo',cancelled:'Annullata',no_show:'Non presentato'})[s]||s;}
  async function api(path,data){
    const response=await fetch('/api/manage/'+path,{method:'POST',cache:'no-store',credentials:'omit',headers:{'Content-Type':'application/json'},body:JSON.stringify({token,...data})});
    let result;try{result=await response.json();}catch{throw Error('Risposta del server non valida');}
    if(!response.ok||!result.ok)throw Error(result.error||'Operazione non riuscita');
    return result;
  }
  function selectSlot(value){
    time=value;
    $('manageTime').value=value;
    document.querySelectorAll('#manageSlots button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.time===value)));
  }
  let seq=0;
  async function loadSlots(){
    const id=++seq; const node=$('manageSlots');
    node.textContent='Verifico gli orari disponibili…';
    try{
      const url='/api/availability?date='+encodeURIComponent(dateInput.value)+'&guests='+encodeURIComponent(guestsInput.value);
      const response=await fetch(url,{cache:'no-store'});
      const data=await response.json();
      if(id!==seq)return;
      if(!response.ok||!data.ok)throw Error(data.error||'Disponibilità non raggiungibile');
      const slots=data.slots||[];
      node.replaceChildren();
      if(!slots.length){node.innerHTML='<div class="slot-help">Non ci sono orari selezionabili per questa data. Prova un altro giorno.</div>';selectSlot('');return;}
      for(const s of slots){
        const button=document.createElement('button');button.type='button';button.dataset.time=s;button.textContent=s;button.setAttribute('aria-pressed','false');
        button.addEventListener('click',()=>selectSlot(s));node.append(button);
      }
      const preferred=slots.includes(time)?time:(slots.includes(booking?.time)&&dateInput.value===booking.date?booking.time:'');
      selectSlot(preferred);
    }catch(e){if(id===seq){node.textContent=e.message;selectSlot('');}}
  }
  function render(){
    if(!booking)return;
    $('bookingName').textContent=booking.name;
    $('bookingStatus').textContent=statusName(booking.status);
    dateInput.value=booking.date;
    guestsInput.value=String(booking.guests);
    time=booking.time;
    const active=['pending','confirmed'].includes(booking.status);
    $('bookingNotice').textContent=booking.status==='confirmed'?'La prenotazione è confermata. Qualsiasi modifica deve essere riconfermata dal ristorante.':booking.status==='pending'?'La richiesta è stata ricevuta. Il ristorante deve ancora confermare il tavolo.':'Questa prenotazione non può più essere modificata.';
    $('editForm').hidden=!active;
    $('cancelBooking').hidden=!active;
    $('addCalendar').hidden=booking.status!=='confirmed';
    $('bookingPanel').hidden=false;
    $('invalidLink').hidden=true;
    $('manageDate').min=today;
    $('manageDate').max=max;
    if(active){
      if(!calendarPicker)calendarPicker=window.TerrazzaCalendar.mount({container:'#manageCalendar',input:'#manageDate'});
      else dateInput.dispatchEvent(new Event('change',{bubbles:true}));
      loadSlots();
    }else{$('manageCalendar').hidden=true;}
    msg('');
  }
  $('editForm').addEventListener('submit',async e=>{
    e.preventDefault();
    const btn=$('saveChanges');
    if(!dateInput.reportValidity()||!guestsInput.reportValidity())return;
    if(!time){msg('Seleziona uno degli orari disponibili.', 'error');return;}
    btn.disabled=true;
    msg('Sto salvando la modifica…');
    try{
      const r=await api('update',{date:dateInput.value,time,guests:Number(guestsInput.value)});
      booking=r.booking; render();msg(r.message,'ok');
    }catch(e){msg(e.message,'error');}
    finally{btn.disabled=false;}
  });
  $('cancelBooking').addEventListener('click',async()=>{
    if(!window.confirm('Vuoi davvero annullare la prenotazione? Questa operazione non può essere annullata dal link.'))return;
    $('cancelBooking').disabled=true;
    try{
      const r=await api('cancel',{});
      booking.status='cancelled';booking.revision++;
      render();msg(r.message,'ok');
    }catch(e){msg(e.message,'error');$('cancelBooking').disabled=false;}
  });
  $('addCalendar').addEventListener('click',()=>{
    if(!booking||booking.status!=='confirmed')return;
    const stamp=booking.date.replace(/-/g,'')+'T'+booking.time.replace(':','')+'00';
    const stampEnd=new Date(booking.date+'T'+booking.time+':00');
    stampEnd.setMinutes(stampEnd.getMinutes()+120);
    const end=pad(stampEnd.getFullYear())+pad(stampEnd.getMonth()+1)+pad(stampEnd.getDate())+'T'+pad(stampEnd.getHours())+pad(stampEnd.getMinutes())+'00';
    const ics=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Tipiko Ristorante Pizzeria//Prenotazioni//IT','BEGIN:VEVENT',
      'UID:'+crypto.randomUUID()+'@tipiko-amantea',
      'DTSTAMP:'+new Date().toISOString().replace(/[-:]/g,'').replace(/\.\d{3}/,''),
      'DTSTART;TZID=Europe/Rome:'+stamp,
      'DTEND;TZID=Europe/Rome:'+end,
      'SUMMARY:Tavolo da Tipiko',
      'LOCATION:Via S. Bernardino 1\\, 87032 Amantea (CS)',
      'DESCRIPTION:Prenotazione confermata per '+booking.guests+' persone',
      'END:VEVENT','END:VCALENDAR'].join('\r\n');
    const url=URL.createObjectURL(new Blob([ics],{type:'text/calendar;charset=utf-8'}));
    const a=document.createElement('a');a.href=url;a.download='tipiko-prenotazione.ics';document.body.append(a);a.click();a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
  });
  dateInput.addEventListener('change',loadSlots);
  guestsInput.addEventListener('change',loadSlots);
  (async()=>{
    if(!/^[A-Za-z0-9_-]{43}$/.test(token)){
      $('invalidLink').hidden=false;msg('Questo link personale non è valido.','error');return;
    }
    try{
      const r=await api('lookup',{});
      booking=r.booking;
      const maxGuests=Math.max(booking.guests,12);
      for(let n=1;n<=maxGuests;n++){
        const o=document.createElement('option');o.value=n;o.textContent=n+(n===1?' persona':' persone');guestsInput.append(o);
      }
      render();
      try {
        const r=await fetch('/api/public',{cache:'no-store'});
        const settings=await r.json();
        if(settings.ok && calendarPicker)calendarPicker.setClosures(settings,false);
      } catch { /* Server continues to enforce all closures even when dates cannot be shown. */ }
    }catch(e){$('invalidLink').hidden=false;msg(e.message,'error');}
  })();
})();
