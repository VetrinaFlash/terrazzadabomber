/* Shared, accessible calendar used by booking and self-service pages. */
(() => {
  const pad = n => String(n).padStart(2,'0');
  const iso = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
  const niceMonth = new Intl.DateTimeFormat('it-IT',{month:'long',year:'numeric'});
  const weekdays = ['L','M','M','G','V','S','D'];
  function mount({container,input,onChange=()=>{}}) {
    const root=typeof container==='string'?document.querySelector(container):container;
    const field=typeof input==='string'?document.querySelector(input):input;
    if(!root||!field)return null;
    const min=field.min||iso(new Date());
    const max=field.max||iso(new Date(Date.now()+90*86400000));
    let selection=field.value>=min&&field.value<=max?field.value:min;
    let view=new Date(selection+'T12:00:00');
    view.setDate(1);
    root.setAttribute('role','group');
    root.setAttribute('aria-label','Calendario prenotazioni');
    const render=()=>{
      const year=view.getFullYear(), month=view.getMonth();
      const offset=(new Date(year,month,1).getDay()+6)%7;
      const count=new Date(year,month+1,0).getDate();
      const first=iso(new Date(year,month,1));
      const last=iso(new Date(year,month,count));
      root.innerHTML=`<div class="calendar-nav"><button type="button" data-month="-1" aria-label="Mese precedente" ${first<=min?'disabled':''}>←</button><strong>${niceMonth.format(view)}</strong><button type="button" data-month="1" aria-label="Mese successivo" ${last>=max?'disabled':''}>→</button></div><div class="calendar-grid">${weekdays.map((day,i)=>`<span class="calendar-weekday" aria-label="${['Lunedì','Martedì','Mercoledì','Giovedì','Venerdì','Sabato','Domenica'][i]}">${day}</span>`).join('')}${Array.from({length:offset},()=>'<span aria-hidden="true"></span>').join('')}${Array.from({length:count},(_,i)=>{const date=iso(new Date(year,month,i+1));const disabled=date<min||date>max;return `<button type="button" class="calendar-day ${selection===date?'is-selected':''} ${date===iso(new Date())?'is-today':''}" data-day="${date}" ${disabled?'disabled':''} ${selection===date?'aria-pressed="true"':'aria-pressed="false"'} aria-label="${new Intl.DateTimeFormat('it-IT',{weekday:'long',day:'numeric',month:'long'}).format(new Date(date+'T12:00:00'))}">${i+1}</button>`}).join('')}</div>`;
    };
    const select = date => {
      if(!date||date<min||date>max)return;
      selection=date;field.value=date;
      const chosen=new Date(date+'T12:00:00');view=new Date(chosen.getFullYear(),chosen.getMonth(),1);
      render();field.dispatchEvent(new Event('change',{bubbles:true}));onChange(date);
    };
    root.addEventListener('click',event=>{
      const b=event.target.closest('button');if(!b||b.disabled)return;
      if(b.dataset.day)select(b.dataset.day);
      if(b.dataset.month){
        view=new Date(view.getFullYear(),view.getMonth()+Number(b.dataset.month),1);
        render();
      }
    });
    field.addEventListener('change',()=>{
      if(field.value&&field.value>=min&&field.value<=max&&field.value!==selection){
        selection=field.value;view=new Date(selection+'T12:00:00');view.setDate(1);render();
      }
    });
    render();
    return {select,render};
  }
  window.TerrazzaCalendar={mount};
})();
