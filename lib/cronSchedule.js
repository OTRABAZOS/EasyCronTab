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

/**
 * Intenta describir una expresión cron en texto legible (español).
 * @param {string} schedule - Los 5 campos (min hora día-mes mes día-semana) o @reboot, @yearly, etc.
 * @returns {string}
 */
function cronToHuman(schedule) {
  if (!schedule || typeof schedule !== 'string') return schedule || '';
  const s = schedule.trim().toLowerCase();
  if (CRON_SPECIAL_LABELS[s]) return CRON_SPECIAL_LABELS[s];

  const parts = schedule.trim().split(/\s+/);
  if (parts.length < 5) return schedule;

  const [min, hour, dom, month, dow] = parts;

  // Cada N minutos
  if (min.startsWith('*/') && hour === '*' && dom === '*' && month === '*' && dow === '*') {
    const n = min.slice(2);
    if (/^\d+$/.test(n)) return 'Cada ' + n + ' minuto' + (n === '1' ? '' : 's');
  }

  // Cada hora (minuto 0)
  if (min === '0' && hour === '*' && dom === '*' && month === '*' && dow === '*') {
    return 'Cada hora';
  }

  // Cada N horas (minuto X, hora */N)
  if (hour.startsWith('*/') && dom === '*' && month === '*' && dow === '*' && /^\d+$/.test(min)) {
    const n = hour.slice(2);
    if (/^\d+$/.test(n)) {
      const minNum = parseInt(min, 10);
      if (minNum === 0) return 'Cada ' + n + ' hora' + (n === '1' ? '' : 's');
      return 'Cada ' + n + ' hora' + (n === '1' ? '' : 's') + ' al minuto ' + minNum;
    }
  }

  const pad = (x) => String(x).padStart(2, '0');

  // Diario a las HH:MM (solo si hour y min son números, no * ni */N)
  if (dom === '*' && month === '*' && dow === '*' && !hour.includes('*') && !min.includes('*')) {
    return 'Diario a las ' + pad(hour) + ':' + pad(min);
  }

  // Semanal: día a las HH:MM
  if (dom === '*' && month === '*') {
    const dayNames = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
    const dayNum = String(dow).includes(',') ? String(dow).split(',')[0] : dow;
    const d = parseInt(dayNum, 10);
    const dayLabel = !isNaN(d) && d >= 0 && d <= 6 ? dayNames[d] : 'día ' + dow;
    return 'Semanal (' + dayLabel + ') a las ' + pad(hour) + ':' + pad(min);
  }

  // Mensual: día N a las HH:MM
  if (month === '*' && dow === '*') {
    return 'Mensual (día ' + dom + ') a las ' + pad(hour) + ':' + pad(min);
  }

  return schedule;
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

  const [min, hour, dom, month, dow] = parts;

  if (min.startsWith('*/') && hour === '*' && dom === '*' && month === '*' && dow === '*') {
    const n = min.slice(2);
    return { frequency: 'every_n_minutes', minuteInterval: parseInt(n, 10) || 5 };
  }
  if (min === '0' && hour === '*' && dom === '*' && month === '*' && dow === '*') {
    return { frequency: 'every_hour' };
  }
  if (hour.startsWith('*/') && dom === '*' && month === '*' && dow === '*' && /^\d+$/.test(min)) {
    const n = hour.slice(2);
    if (/^\d+$/.test(n)) {
      return {
        frequency: 'every_n_hours',
        hourInterval: Math.max(1, Math.min(24, parseInt(n, 10) || 1)),
        minute: Math.max(0, Math.min(59, parseInt(min, 10) || 0))
      };
    }
  }
  if (dom === '*' && month === '*' && dow === '*') {
    return {
      frequency: 'daily',
      hour: parseInt(hour, 10) || 0,
      minute: parseInt(min, 10) || 0
    };
  }
  if (dom === '*' && month === '*') {
    return {
      frequency: 'weekly',
      dayOfWeek: dow.split(',')[0] || '0',
      hour: parseInt(hour, 10) || 0,
      minute: parseInt(min, 10) || 0
    };
  }
  if (month === '*' && dow === '*') {
    return {
      frequency: 'monthly',
      dayOfMonth: parseInt(dom, 10) || 1,
      hour: parseInt(hour, 10) || 0,
      minute: parseInt(min, 10) || 0
    };
  }
  return { frequency: 'custom', customExpression: parts.slice(0, 5).join(' ') };
}

module.exports = {
  FRECUENCIAS,
  DIAS_SEMANA,
  buildCronExpression,
  cronToHuman,
  cronToFormOptions
};
