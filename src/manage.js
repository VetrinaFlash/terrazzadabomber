/** Secure self-service booking management for Cloudflare Workers + D1. */
const safe = (v, n = 120) => String(v ?? '').trim().slice(0, n);
const dateOK = d => /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(Date.parse(d + 'T12:00:00Z')) && new Date(d + 'T12:00:00Z').toISOString().slice(0, 10) === d;
const timeOK = s => /^([01]\d|2[0-3]):[0-5]\d$/.test(s);
const min = s => Number(s.slice(0,2))*60 + Number(s.slice(3,5));
const dayItaly = () => new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Rome',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const clockItaly = () => new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Rome',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date());
const daysFromToday = d => (Date.parse(d+'T12:00:00Z')-Date.parse(dayItaly()+'T12:00:00Z'))/86400000;
const b64 = bytes => btoa(String.fromCharCode(...bytes)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
const hash = async token => b64(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token))));
const json = (data,status=200) => new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff'}});
const error = (message,status=400) => json({ok:false,error:message},status);
const publicRecord = b => ({
  date:b.service_date,time:b.service_time,guests:b.guests,name:b.customer_name,
  phone:b.phone,notes:b.notes,status:b.status,revision:b.revision,
  table:b.status==='confirmed' || b.status==='seated' ? b.table_label||null : null
});
const acceptableToken = t => typeof t==='string' && /^[A-Za-z0-9_-]{43}$/.test(t);

export async function issueLink(env, reservationId, origin) {
  const bytes=new Uint8Array(32);crypto.getRandomValues(bytes);
  const token=b64(bytes);
  const result=await env.DB.prepare('UPDATE reservations SET manage_token_hash=? WHERE id=?')
    .bind(await hash(token),reservationId).run();
  if(!result.meta?.changes)return null;
  return origin+'/gestisci/#'+token;
}
export async function audit(env, id, action, actor, details={}) {
  try {
    await env.DB.prepare('INSERT INTO booking_activity(reservation_id,action,actor,details) VALUES(?,?,?,?)')
      .bind(id,action,actor,JSON.stringify(details).slice(0,2000)).run();
  } catch(e){console.warn('Booking history unavailable',String(e));}
}
export async function customerAction(request,env,ctx,path,helpers){
  if(!['/api/manage/lookup','/api/manage/update','/api/manage/cancel'].includes(path)||request.method!=='POST')return error('Risorsa non trovata',404);
  const ip=request.headers.get('CF-Connecting-IP')||'unknown';
  if(!await helpers.rate(env,'manage:'+await helpers.sha(ip),30,900))return error('Troppe richieste, riprova tra poco',429);
  const payload=await helpers.getJSON(request);
  if(!acceptableToken(payload.token))return error('Link non valido o scaduto',404);
  const tokenHash=await hash(payload.token);
  const booking=await env.DB.prepare('SELECT r.*,t.label AS table_label FROM reservations r LEFT JOIN dining_tables t ON t.id=r.table_id WHERE r.manage_token_hash=?').bind(tokenHash).first();
  if(!booking)return error('Link non valido o scaduto',404);
  if(path==='/api/manage/lookup')return json({ok:true,booking:publicRecord(booking)});
  if(!['pending','confirmed'].includes(booking.status))return error('Questa prenotazione non può più essere modificata',409);
  if(path==='/api/manage/cancel'){
    const result=await env.DB.prepare("UPDATE reservations SET status='cancelled',table_id=NULL,revision=revision+1,updated_at=CURRENT_TIMESTAMP WHERE id=? AND revision=? AND status IN ('pending','confirmed')")
      .bind(booking.id,booking.revision).run();
    if(!result.meta?.changes)return error('La richiesta è stata già aggiornata. Ricarica la pagina.',409);
    await audit(env,booking.id,'cancelled','customer',{before:booking.status,date:booking.service_date,time:booking.service_time});
    ctx.waitUntil(helpers.sendPush(env));
    return json({ok:true,message:'Prenotazione annullata'});
  }
  const date=safe(payload.date,10),time=safe(payload.time,5),guests=Number(payload.guests);
  if(!dateOK(date)||!timeOK(time)||!Number.isInteger(guests)||guests<1||guests>30)return error('Inserisci data, ora e ospiti validi');
  const settings=await helpers.cfg(env);
  if(!settings.booking_enabled)return error('Le modifiche online sono temporaneamente sospese. Contatta il ristorante.',409);
  if(guests>settings.max_guests)return error('Per gruppi numerosi contatta il ristorante');
  if(!settings.slots.includes(time)||settings.closed_dates.includes(date))return error('Orario o data non disponibili',409);
  if(daysFromToday(date)<0||daysFromToday(date)>90||(date===dayItaly()&&min(time)<=min(clockItaly())+60))return error('Questa data o questo orario non è più prenotabile',409);
  if(date===booking.service_date && time===booking.service_time && guests===booking.guests)return json({ok:true,booking:publicRecord(booking),message:'Non hai effettuato modifiche'});
  // A change must be reconfirmed by staff. Never reserve an example table silently.
  const result=await env.DB.prepare("UPDATE reservations SET service_date=?,service_time=?,guests=?,status='pending',table_id=NULL,revision=revision+1,updated_at=CURRENT_TIMESTAMP WHERE id=? AND revision=? AND status IN ('pending','confirmed')")
    .bind(date,time,guests,booking.id,booking.revision).run();
  if(!result.meta?.changes)return error('La richiesta è stata aggiornata da un altro dispositivo. Ricarica la pagina.',409);
  await audit(env,booking.id,'rescheduled','customer',{from:{date:booking.service_date,time:booking.service_time,guests:booking.guests},to:{date,time,guests}});
  ctx.waitUntil(helpers.sendPush(env));
  const changed=await env.DB.prepare('SELECT r.*,t.label AS table_label FROM reservations r LEFT JOIN dining_tables t ON t.id=r.table_id WHERE r.id=?').bind(booking.id).first();
  return json({ok:true,booking:publicRecord(changed),message:'Modifica inviata. Il ristorante confermerà la nuova disponibilità.'});
}

/** Atomic conditional admin update, prevents overlapping table assignments. */
export async function adminEdit(env,id,input,helpers){
  const old=await env.DB.prepare('SELECT * FROM reservations WHERE id=?').bind(id).first();
  if(!old)return {ok:false,status:404,error:'Prenotazione non trovata'};
  const status=safe(input.status??old.status,16);
  if(!['pending','confirmed','seated','cancelled','no_show'].includes(status))return {ok:false,error:'Stato non valido'};
  const date=safe(input.date??old.service_date,10),time=safe(input.time??old.service_time,5);
  const guests=Number(input.guests??old.guests);
  const name=safe(input.name??old.customer_name,70);
  const phone=safe(input.phone??old.phone,30);
  const notes=safe(input.notes??old.notes,350);
  if(!dateOK(date)||!timeOK(time)||!Number.isInteger(guests)||guests<1||guests>30)return {ok:false,error:'Data, ora o numero di ospiti non validi'};
  if(name.length<3||/[<>]/.test(name)||!/^\+?[0-9\s().-]{8,22}$/.test(phone))return {ok:false,error:'Nome o telefono non valido'};
  let table = input.table_id===undefined ? old.table_id : input.table_id;
  table=table===null||table===''?null:Number(table);
  if(table!==null && (!Number.isInteger(table)||table<1))return {ok:false,error:'Tavolo non valido'};
  // Moving a booking releases the old table unless explicitly selected again.
  const dateOrGroupChanged=date!==old.service_date||time!==old.service_time||guests!==old.guests;
  if(dateOrGroupChanged && input.table_id===undefined){table=null;}
  if((status==='confirmed'||status==='seated')&&table===null)return {ok:false,error:'Assegna un tavolo reale prima di confermare'};
  const duration=(await helpers.cfg(env)).duration;
  const end=min(time)+duration;
  const update=await env.DB.prepare(`UPDATE reservations SET status=?,table_id=?,service_date=?,service_time=?,guests=?,customer_name=?,phone=?,notes=?,revision=revision+1,updated_at=CURRENT_TIMESTAMP
     WHERE id=? AND revision=? AND (
       ? IS NULL OR ? NOT IN ('pending','confirmed','seated') OR EXISTS (
         SELECT 1 FROM dining_tables t WHERE t.id=? AND t.active=1 AND t.capacity>=?
         AND NOT EXISTS (
           SELECT 1 FROM reservations r WHERE r.table_id=t.id AND r.id<>? AND r.service_date=?
             AND r.status IN ('pending','confirmed','seated')
             AND (CAST(substr(r.service_time,1,2) AS INTEGER)*60+CAST(substr(r.service_time,4,2) AS INTEGER)) < ?
             AND (CAST(substr(r.service_time,1,2) AS INTEGER)*60+CAST(substr(r.service_time,4,2) AS INTEGER)+?) > ?
         )
       )
     )`)
    .bind(status,table,date,time,guests,name,phone,notes,id,old.revision,
      table,status,table,guests,id,date,end,duration,min(time)).run();
  if(!update.meta?.changes)return {ok:false,status:409,error:'Tavolo occupato o prenotazione modificata da un altro dispositivo. Aggiorna e riprova.'};
  await audit(env,id,'updated','staff',{before:{date:old.service_date,time:old.service_time,guests:old.guests,status:old.status,table_id:old.table_id},after:{date,time,guests,status,table_id:table}});
  return {ok:true,changed:dateOrGroupChanged,booking:{id,date,time,guests,name,phone,notes,status,table_id:table}};
}
