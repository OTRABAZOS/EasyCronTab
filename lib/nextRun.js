const { CronExpressionParser } = require('cron-parser');

/**
 * Obtiene la próxima fecha de ejecución para una expresión cron de 5 campos.
 * @param {string} schedule - "min hour dom month dow"
 * @returns {{ nextRun: string | null, nextRunMs: number | null }} - ISO string y timestamp, o null si falla
 */
function getNextRun(schedule) {
  if (!schedule || typeof schedule !== 'string') return { nextRun: null, nextRunMs: null };
  try {
    const expr = CronExpressionParser.parse(schedule.trim());
    const next = expr.next();
    const date = next.toDate ? next.toDate() : next;
    const iso = date.toISOString ? date.toISOString() : String(date);
    return { nextRun: iso, nextRunMs: date.getTime ? date.getTime() : null };
  } catch (e) {
    return { nextRun: null, nextRunMs: null };
  }
}

/**
 * Obtiene todas las ejecuciones de una expresión cron en un día dado (hora local).
 * @param {string} schedule - "min hour dom month dow"
 * @param {Date|string} day - Fecha del día (objeto Date o string YYYY-MM-DD)
 * @returns {Date[]} - Array de fechas (hora local) en que se ejecuta ese día
 */
function getRunsForDay(schedule, day) {
  if (!schedule || typeof schedule !== 'string') return [];
  let startOfDay;
  let endOfDay;
  if (day instanceof Date) {
    startOfDay = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 0, 0, 0, 0);
    endOfDay = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 23, 59, 59, 999);
  } else if (typeof day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(day.trim())) {
    const [y, m, d] = day.trim().split('-').map(Number);
    startOfDay = new Date(y, m - 1, d, 0, 0, 0, 0);
    endOfDay = new Date(y, m - 1, d, 23, 59, 59, 999);
  } else {
    return [];
  }
  try {
    const expr = CronExpressionParser.parse(schedule.trim(), { currentDate: startOfDay });
    const runs = [];
    const limit = 1000;
    while (runs.length < limit) {
      const next = expr.next();
      const date = next.toDate ? next.toDate() : next;
      if (date.getTime() > endOfDay.getTime()) break;
      runs.push(date);
    }
    return runs;
  } catch (e) {
    return [];
  }
}

module.exports = { getNextRun, getRunsForDay };
