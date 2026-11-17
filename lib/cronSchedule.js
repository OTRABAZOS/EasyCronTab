/**
 * Convierte opciones "humanas" (frecuencia, hora, etc.) en expresión cron
 * y viceversa para mostrar en la UI.
 * Formato cron: minuto hora día-mes mes día-semana (0-7, 0 y 7 = domingo)
 */

const FRECUENCIAS = [
  { value: 'every_n_minutes', label: 'Cada X minutos', need: ['minuteInterval'] },
  { value: 'every_hour', label: 'Cada hora', need: [] },
  { value: 'every_n_hours', label: 'Cada N horas', need: ['hourInterval'] },
  { value: 'daily', label: 'Diario', need: ['hour', 'minute'] },
  { value: 'weekly', label: 'Semanal', need: ['dayOfWeek', 'hour', 'minute'] },
  { value: 'monthly', label: 'Mensual', need: ['dayOfMonth', 'hour', 'minute'] },
  { value: 'at_reboot', label: 'Al iniciar el sistema (@reboot)', need: [] },
  { value: 'custom', label: 'Personalizado (expresión cron)', need: ['customExpression'] }
];

const DIAS_SEMANA = [
  { value: '0', label: 'Domingo' },
  { value: '1', label: 'Lunes' },
  { value: '2', label: 'Martes' },
  { value: '3', label: 'Miércoles' },
  { value: '4', label: 'Jueves' },
  { value: '5', label: 'Viernes' },
  { value: '6', label: 'Sábado' }
];

/**
 * Construye la expresión cron de 5 campos a partir de opciones del formulario.
 * @param {Object} opts
 * @param {string} opts.frequency - every_n_minutes | every_hour | daily | weekly | monthly | custom
 * @param {number} [opts.minuteInterval] - para every_n_minutes (1-59)
 * @param {number} [opts.hour] - 0-23
 * @param {number} [opts.minute] - 0-59
 * @param {string} [opts.dayOfWeek] - 0-6 (domingo=0)
 * @param {number} [opts.dayOfMonth] - 1-31
 * @param {string} [opts.customExpression] - "min hour dom month dow" para custom
 * @returns {string} - Los 5 campos cron, ej. "0 2 * * *" (diario 02:00)
 */
function buildCronExpression(opts) {
  if (!opts || !opts.frequency) return '';
  const f = opts.frequency;

  if (f === 'at_reboot') return '@reboot';

  if (f === 'custom' && opts.customExpression) {
    const parts = String(opts.customExpression).trim().split(/\s+/);
    if (parts.length >= 5) return parts.slice(0, 5).join(' ');
    return '';
  }

  if (f === 'every_n_minutes') {
    const n = Math.max(1, Math.min(59, parseInt(opts.minuteInterval, 10) || 5));
    return `*/${n} * * * *`;
  }

  if (f === 'every_hour') {
    return '0 * * * *';
  }

  if (f === 'every_n_hours') {
    const n = Math.max(1, Math.min(24, parseInt(opts.hourInterval, 10) || 1));
    const min = Math.max(0, Math.min(59, parseInt(opts.minute, 10) || 0));
    return `${min} */${n} * * *`;
  }

  const hour = Math.max(0, Math.min(23, parseInt(opts.hour, 10) || 0));
  const minute = Math.max(0, Math.min(59, parseInt(opts.minute, 10) || 0));
  const m = String(minute);
  const h = String(hour);

  if (f === 'daily') {
    return `${m} ${h} * * *`;
  }

  if (f === 'weekly') {
    const dow = opts.dayOfWeek !== undefined && opts.dayOfWeek !== '' ? String(opts.dayOfWeek) : '0';
    return `${m} ${h} * * ${dow}`;
  }

  if (f === 'monthly') {
    const dom = Math.max(1, Math.min(31, parseInt(opts.dayOfMonth, 10) || 1));
    return `${m} ${h} ${dom} * *`;
  }

  return '';
}

/** Expresiones cron especiales → texto en español */
const CRON_SPECIAL_LABELS = {
  '@reboot': 'Cada vez que se inicia el sistema',
  '@yearly': 'Una vez al año (1 enero 00:00)',
  '@annually': 'Una vez al año (1 enero 00:00)',
  '@monthly': 'Una vez al mes (día 1 a las 00:00)',
  '@weekly': 'Una vez a la semana (domingo 00:00)',
  '@daily': 'Una vez al día (00:00)',
  '@midnight': 'Una vez al día (00:00)',
  '@hourly': 'Cada hora'
};

const DAY_NAMES = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const MONTH_NAMES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const DAY_ALIASES = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };
const MONTH_ALIASES = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };

/**
 * Expande un campo cron a la lista de valores que cubre.
 * Devuelve null si el campo es '*' (todos) o si no se entiende (sintaxis no estándar).
 */
function expandField(field, lo, hi, aliases) {
  if (field === '*' || field === '?') return null;
  const values = new Set();
  const toNum = (x) => {
    const k = String(x).toLowerCase();
    if (aliases && aliases[k] != null) return aliases[k];
    return /^\d+$/.test(k) ? parseInt(k, 10) : NaN;
  };
  for (const part of field.split(',')) {
    const m = part.match(/^([^/]+)(?:\/(\d+))?$/);
    if (!m) return undefined;
    const step = m[2] ? parseInt(m[2], 10) : 1;
    if (!step) return undefined;
    let start, end;
    if (m[1] === '*') { start = lo; end = hi; }
    else if (m[1].includes('-')) {
      const [a, b] = m[1].split('-');
      start = toNum(a); end = toNum(b);
    } else {
      start = toNum(m[1]); end = m[2] ? hi : start;
    }
    if (isNaN(start) || isNaN(end) || start < lo || end > hi || start > end) return undefined;
    for (let v = start; v <= end; v += step) values.add(v);
  }
  return [...values].sort((a, b) => a - b);
}

function joinList(items) {
  if (items.length <= 1) return items.join('');
  return items.slice(0, -1).join(', ') + ' y ' + items[items.length - 1];
}
function isContiguous(v) { return v.every((x, i) => i === 0 || x === v[i - 1] + 1); }
/** Paso constante de una progresión (≥2 elementos), o 0 si no lo es. */
function stepOf(v) {
  if (v.length < 2) return 0;
  const s = v[1] - v[0];
  return v.every((x, i) => i === 0 || x - v[i - 1] === s) ? s : 0;
}
const pad = (x) => String(x).padStart(2, '0');
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

/** Parte de la hora. Devuelve { text, at } (at=true → «a las …», encaja tras el día) o null. */
function describeTime(minF, hourF) {
  const M = expandField(minF, 0, 59);
  const H = expandField(hourF, 0, 23);
  if (M === undefined || H === undefined) return null;

  const hoursRange = () => {
    if (!H) return '';
    if (H.length === 1) return ' entre las ' + pad(H[0]) + ':00 y las ' + pad(H[0]) + ':59';
    if (isContiguous(H)) return ' entre las ' + pad(H[0]) + ':00 y las ' + pad(H[H.length - 1]) + ':59';
    return ' en las horas ' + joinList(H.map(String));
  };

  // Pocas ejecuciones concretas (0,30 9 → 09:00 y 09:30)
  if (M && H && H.length * M.length <= 4) {
    const times = [];
    H.forEach(h => M.forEach(m => times.push(pad(h) + ':' + pad(m))));
    return { text: 'a las ' + joinList(times), at: true };
  }

  // Cada minuto / cada N minutos
  if (!M) return { text: 'Cada minuto' + hoursRange(), at: false };
  const mStep = stepOf(M);
  if (M[0] === 0 && mStep > 1 && M.length === Math.ceil(60 / mStep)) {
    return { text: 'Cada ' + mStep + ' minutos' + hoursRange(), at: false };
  }

  // Minutos concretos, todas las horas
  if (!H) {
    if (M.length === 1) return { text: M[0] === 0 ? 'Cada hora' : 'Cada hora al minuto ' + M[0], at: false };
    return { text: 'Cada hora a los minutos ' + joinList(M.map(String)), at: false };
  }

  // Cada N horas (*/N)
  const hStep = stepOf(H);
  if (H[0] === 0 && hStep > 1 && H.length === Math.ceil(24 / hStep) && M.length === 1) {
    return { text: 'Cada ' + hStep + ' horas' + (M[0] ? ' al minuto ' + M[0] : ''), at: false };
  }

  // Pocas horas concretas → enumerarlas
  if (H.length * M.length <= 6) {
    const times = [];
    H.forEach(h => M.forEach(m => times.push(pad(h) + ':' + pad(m))));
    return { text: 'a las ' + joinList(times), at: true };
  }

  // Un minuto fijo en un rango de horas (8-22, 8-20/2…)
  if (M.length === 1) {
    const first = pad(H[0]) + ':' + pad(M[0]);
    const last = pad(H[H.length - 1]) + ':' + pad(M[0]);
    if (isContiguous(H)) return { text: 'Cada hora de ' + first + ' a ' + last, at: false };
    if (hStep > 1) return { text: 'Cada ' + hStep + ' horas de ' + first + ' a ' + last, at: false };
  }
  return null;
}

/** Parte del día. Devuelve '' si es todos los días, el texto, o null si no se sabe describir. */
function describeDays(domF, monthF, dowF) {
  const D = expandField(domF, 1, 31);
  const Mo = expandField(monthF, 1, 12, MONTH_ALIASES);
  let W = expandField(dowF, 0, 7, DAY_ALIASES);
  if (D === undefined || Mo === undefined || W === undefined) return null;
  if (W) W = [...new Set(W.map(d => (d === 7 ? 0 : d)))].sort((a, b) => a - b);
  if (W && W.length === 7) W = null;
  if (D && W) return null; // cron usa «o» entre día del mes y día de la semana: mejor mostrar la expresión

  const monthsText = Mo ? joinList(Mo.map(m => MONTH_NAMES[m - 1])) : '';

  if (W) {
    let days;
    const key = W.join(',');
    if (key === '1,2,3,4,5') days = 'lunes a viernes';
    else if (key === '0,6') days = 'sábados y domingos';
    else if (W.length === 1) days = 'cada ' + DAY_NAMES[W[0]];
    else if (isContiguous(W) && W.length >= 3) days = DAY_NAMES[W[0]] + ' a ' + DAY_NAMES[W[W.length - 1]];
    else days = joinList(W.map(d => DAY_NAMES[d]));
    return days + (Mo ? ' de ' + monthsText : '');
  }
  if (D) {
    let days;
    if (D.length === 1) days = 'el día ' + D[0];
    else if (isContiguous(D) && D.length >= 3) days = 'del día ' + D[0] + ' al ' + D[D.length - 1];
    else days = 'los días ' + joinList(D.map(String));
    return days + (Mo ? ' de ' + monthsText : ' de cada mes');
  }
  if (Mo) return 'en ' + monthsText;
  return '';
}

/**
 * Describe una expresión cron en texto legible (español).
 * Ej.: «31 7 * * 1-5» → «Lunes a viernes a las 07:31»; «13 8-22 * * *» → «Cada hora de 08:13 a 22:13».
 * @param {string} schedule - Los 5 campos (min hora día-mes mes día-semana) o @reboot, @yearly, etc.
 * @returns {string}
 */
function cronToHuman(schedule) {
  if (!schedule || typeof schedule !== 'string') return schedule || '';
  const s = schedule.trim().toLowerCase();
  if (CRON_SPECIAL_LABELS[s]) return CRON_SPECIAL_LABELS[s];

  const parts = schedule.trim().split(/\s+/);
  if (parts.length !== 5) return schedule;
  const [min, hour, dom, month, dow] = parts;

  const time = describeTime(min, hour);
  const days = describeDays(dom, month, dow);
  if (!time || days === null) return schedule;

  if (days === '') return time.at ? 'Diario ' + time.text : time.text;
  if (time.at) return cap(days) + ' ' + time.text;
  return time.text + ', ' + days;
}

/**
 * Intenta inferir opciones del formulario desde una expresión cron (para editar).
 * @param {string} schedule
 * @returns {Object} { frequency, minuteInterval?, hour?, minute?, dayOfWeek?, dayOfMonth?, customExpression? }
 */
function cronToFormOptions(schedule) {
  if (!schedule || typeof schedule !== 'string') return { frequency: 'daily', hour: 0, minute: 0 };
  const s = schedule.trim().toLowerCase();
  if (s === '@reboot') return { frequency: 'at_reboot' };
  const parts = schedule.trim().split(/\s+/);
  if (parts.length < 5) return { frequency: 'custom', customExpression: schedule };

  // Solo se usa un formulario sencillo si representa EXACTAMENTE la expresión;
  // si no (rangos, listas, pasos…), se edita como expresión personalizada para no cambiarla sin querer.
  const [min, hour, dom, month, dow] = parts;
  const num = (x, lo, hi) => /^\d+$/.test(x) && +x >= lo && +x <= hi;
  const custom = { frequency: 'custom', customExpression: parts.slice(0, 5).join(' ') };

  if (/^\*\/\d+$/.test(min) && hour === '*' && dom === '*' && month === '*' && dow === '*' && num(min.slice(2), 1, 59)) {
    return { frequency: 'every_n_minutes', minuteInterval: parseInt(min.slice(2), 10) };
  }
  if (min === '0' && hour === '*' && dom === '*' && month === '*' && dow === '*') {
    return { frequency: 'every_hour' };
  }
  if (/^\*\/\d+$/.test(hour) && num(hour.slice(2), 1, 24) && dom === '*' && month === '*' && dow === '*' && num(min, 0, 59)) {
    return { frequency: 'every_n_hours', hourInterval: parseInt(hour.slice(2), 10), minute: parseInt(min, 10) };
  }
  if (!num(min, 0, 59) || !num(hour, 0, 23) || month !== '*') return custom;
  const hm = { hour: parseInt(hour, 10), minute: parseInt(min, 10) };
  if (dom === '*' && dow === '*') return { frequency: 'daily', ...hm };
  if (dom === '*' && num(dow, 0, 6)) return { frequency: 'weekly', dayOfWeek: dow, ...hm };
  if (dow === '*' && num(dom, 1, 31)) return { frequency: 'monthly', dayOfMonth: parseInt(dom, 10), ...hm };
  return custom;
}

const api = {
  FRECUENCIAS,
  DIAS_SEMANA,
  buildCronExpression,
  cronToHuman,
  cronToFormOptions
};

// Se usa en Node y también en el navegador (servido en /js/cronSchedule.js)
if (typeof module !== 'undefined' && module.exports) module.exports = api;
else if (typeof window !== 'undefined') window.CronSchedule = api;
