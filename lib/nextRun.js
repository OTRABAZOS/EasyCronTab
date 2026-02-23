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

module.exports = { getNextRun };
