/* Closure rules are persisted as D1 settings and shared by all booking APIs. */
export const weekdayOf = date => {
  const day = new Date(date + 'T12:00:00Z').getUTCDay(); // 0=Sunday
  return day === 0 ? 7 : day; // 1=Monday, 7=Sunday
};
export const isClosed = (settings, date) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  if ((settings.closed_dates || []).includes(date)) return true;
  if ((settings.closed_weekdays || []).includes(weekdayOf(date))) return true;
  return (settings.closed_periods || []).some(p => date >= p.from && date <= p.to);
};
export const closureLabel = (settings, date) => {
  if ((settings.closed_dates || []).includes(date)) return 'Chiusura straordinaria';
  const p = (settings.closed_periods || []).find(x => date >= x.from && date <= x.to);
  if (p) return p.label || 'Chiusura straordinaria';
  if ((settings.closed_weekdays || []).includes(weekdayOf(date))) return 'Chiusura settimanale';
  return '';
};
const validDate = s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) &&
  !Number.isNaN(Date.parse(s + 'T12:00:00Z')) && new Date(s + 'T12:00:00Z').toISOString().slice(0, 10) === s;
export function validateClosures(input) {
  const dates = input.closed_dates ?? [];
  const weekdays = input.closed_weekdays ?? [];
  const periods = input.closed_periods ?? [];
  if (!Array.isArray(dates) || dates.length > 200 ||
      dates.some(x => !validDate(x)) || new Set(dates).size !== dates.length) throw Error('Controlla le date di chiusura');
  if (!Array.isArray(weekdays) || weekdays.length > 7 ||
      weekdays.some(x => !Number.isInteger(x) || x < 1 || x > 7) ||
      new Set(weekdays).size !== weekdays.length) throw Error('Controlla i giorni settimanali di chiusura');
  if (!Array.isArray(periods) || periods.length > 100) throw Error('Troppi periodi di chiusura');
  const sanitized = periods.map((p,i) => {
    if (!p || typeof p !== 'object' || !validDate(p.from) || !validDate(p.to) ||
        p.from > p.to || (Date.parse(p.to) - Date.parse(p.from))/86400000 > 366)
      throw Error('Periodo di chiusura non valido alla riga ' + (i+1));
    if (typeof p.label !== 'string' || p.label.length > 80 || /[<>]/.test(p.label))
      throw Error('Descrizione del periodo non valida alla riga ' + (i+1));
    return {from:p.from,to:p.to,label:p.label.trim()};
  });
  return {
    closed_dates:[...dates].sort(),
    closed_weekdays:[...weekdays].sort((a,b)=>a-b),
    closed_periods:sanitized.sort((a,b)=>a.from.localeCompare(b.from))
  };
}
