/* Accessible calendar shared by public booking and self-service pages. */
(() => {
  const pad=n=>String(n).padStart(2,'0');
  const iso=d=>`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
  const weekdays=['L','M','M','G','V','S','D'];
  const weekdayNames=['Lunedì','Martedì','Mercoledì','Giovedì','Venerdì','Sabato','Domenica'];
  const format=new Intl.DateTimeFormat('it-IT',{month:'long',year:'numeric'});
  const formatDay=new Intl.DateTimeFormat('it-IT',{weekday:'long',day:'numeric',month:'long'});
  const weekdayOf=day=>{const n=new Date(day+'T12:00:00Z').getUTCDay();return n||7;};
  function mount({container,input,onChange=()=>{}}){
    const root=typeof container==='string'?document.querySelector(container):container;
    const field=typeof input==='string'?document.querySelector(input):input;
    if(!root||!field)return null;
    const min=field.min||iso(new Date());
    const max=field.max||iso(new Date(Date.now()+90*86400000));
    let selection=field.value>=min&&field.value<=max?field.value:min;
    let view=new Date(selection+'T12:00:00');view.setDate(1);
    let closure={closed_dates:[],closed_weekdays:[],closed_periods:[]};
    root.setAttribute('role','group');root.setAttribute('aria-label','Calendario per scegliere il giorno della prenotazione');
    const isClosed=day=>(closure.closed_dates||[]).includes(day)||
      (closure.closed_weekdays||[]).includes(weekdayOf(day))||
      (closure.closed_periods||[]).some(p=>day>=p.from&&day<=p.to);
    const render=()=>{
      const year=view.getFullYear(),month=view.getMonth();
      const first=iso(new Date(year,month,1));
      const last=iso(new Date(year,month+1,0));
      const offset=(new Date(year,month,1).getDay()+6)%7;
      const count=new Date(year,month+1,0).getDate();
      root.innerHTML=`<div class="calendar-nav"><button type="button" data-month="-1" aria-label="Mese precedente" ${first<=min?'disabled':''}>←</button><strong>${format.format(view)}</strong><button type="button" data-month="1" aria-label="Mese successivo" ${last>=max?'disabled':''}>→</button></div><div class="calendar-grid">${weekdays.map((d,i)=>`<span class="calendar-weekday" aria-label="${weekdayNames[i]}">${d}</span>`).join('')}${Array.from({length:offset},()=>'<span aria-hidden="true"></span>').join('')}${Array.from({length:count},(_,i)=>{
        const day=iso(new Date(year,month,i+1));
        const closed=isClosed(day),disabled=day<min||day>max||closed;
        const desc=formatDay.format(new Date(day+'T12:00:00'));
        return `<button type="button" class="calendar-day ${day===selection?'is-selected ':''}${day===iso(new Date())?'is-today ':''}${closed?'is-closed':''}" data-day="${day}" ${disabled?'disabled':''} aria-pressed="${day===selection}" aria-label="${desc}${closed?', ristorante chiuso':''}" title="${closed?'Ristorante chiuso':''}">${i+1}</button>`;
      }).join('')}</div>`;
    };
    const select=day=>{
      if(!day||day<min||day>max||isClosed(day))return false;
      selection=day;field.value=day;const d=new Date(day+'T12:00:00');view=new Date(d.getFullYear(),d.getMonth(),1);
      render();field.dispatchEvent(new Event('change',{bubbles:true}));onChange(day);return true;
    };
    root.addEventListener('click',event=>{
      const button=event.target.closest('button');
      if(!button||button.disabled)return;
      if(button.dataset.day)select(button.dataset.day);
      if(button.dataset.month){
        view=new Date(view.getFullYear(),view.getMonth()+Number(button.dataset.month),1);render();
      }
    });
    field.addEventListener('change',()=>{
      if(field.value && field.value>=min && field.value<=max && !isClosed(field.value) && field.value!==selection){
        selection=field.value;view=new Date(selection+'T12:00:00');view.setDate(1);render();
      } else if(isClosed(field.value)){
        field.value=selection;
        render();
      }
    });
    const setClosures=(data,autoSelectOpen=false)=>{
      closure={
        closed_dates:Array.isArray(data?.closed_dates)?data.closed_dates:[],
        closed_weekdays:Array.isArray(data?.closed_weekdays)?data.closed_weekdays:[],
        closed_periods:Array.isArray(data?.closed_periods)?data.closed_periods:[]
      };
      if(autoSelectOpen && isClosed(selection)){
        for(let date=new Date(min+'T12:00:00');iso(date)<=max;date.setDate(date.getDate()+1)){
          if(!isClosed(iso(date))){selection=iso(date);field.value=selection;view=new Date(date.getFullYear(),date.getMonth(),1);field.dispatchEvent(new Event('change',{bubbles:true}));break;}
        }
      }
      render();
    };
    render();
    return {select,render,setClosures,isClosed};
  }
  window.TerrazzaCalendar={mount};
})();
