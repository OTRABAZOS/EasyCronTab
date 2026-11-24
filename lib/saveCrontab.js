/**
 * Guardado seguro del crontab:
 *  - Comprueba que el crontab no ha cambiado desde que se cargó la página (baseHash).
 *  - Hace copia de seguridad antes de escribir; si la copia falla, no escribe.
 *  - Conserva tal cual comentarios, líneas en blanco, variables de entorno (SHELL=, PATH=, MAILTO=…)
 *    y las tareas que no se han tocado (byte a byte).
 *  - Solo añade «>> log 2>&1» a tareas nuevas que no tengan ya redirección.
 */
const crypto = require('crypto');
const path = require('path');
const {
  readCrontab, writeCrontab, crontabHash, parseCrontabDocument, cleanTitle, titleComment
} = require('./crontab');
const { createBackup } = require('./backups');
const { wrapXvfb, parseXvfbCommand } = require('./xvfb');

const REDIRECT_SUFFIX_RE = /\s*>>\s*(\S+)\s+2>&1\s*$/;

/** Comando sin la redirección final «>> fichero 2>&1». */
function getRawCommandForLog(command) {
  const cmd = (command || '').trim();
  return cmd.replace(REDIRECT_SUFFIX_RE, '').trim() || cmd;
}

/** Ruta del log de una tarea: la explícita del comando o, si no hay, la calculada por hash. */
function getLogPath(schedule, command, logsDir) {
  const cmd = (command || '').trim();
  const explicit = cmd.match(REDIRECT_SUFFIX_RE);
  if (explicit) return explicit[1];
  const rawCmd = getRawCommandForLog(cmd);
  const hash = crypto.createHash('md5').update((schedule || '') + '\n' + rawCmd).digest('hex').slice(0, 12);
  return path.join(logsDir, hash + '.log');
}

/** ¿El comando ya redirige su salida a algún sitio? */
function hasRedirection(command) {
  return />|&>/.test(command || '');
}

/** Descompone el comando de una tarea en lo que ve la interfaz. */
function describeCommand(command) {
  const cmd = (command || '').trim();
  const effective = getRawCommandForLog(cmd);
  const suffix = cmd.startsWith(effective) ? cmd.slice(effective.length) : '';
  const { rawCommand, useXvfb } = parseXvfbCommand(effective);
  return { rawCommand, useXvfb: !!useXvfb, effective, suffix };
}

const SCHEDULE_FIELD_RE = /^[0-9A-Za-z*\/,\-?LW#]+$/;
function validSchedule(schedule) {
  const s = (schedule || '').trim();
  if (/^@(reboot|yearly|annually|monthly|weekly|daily|midnight|hourly)$/i.test(s)) return true;
  const parts = s.split(/\s+/);
  return parts.length === 5 && parts.every(p => SCHEDULE_FIELD_RE.test(p));
}

function validateJob(j, i) {
  const n = i + 1;
  if (!j || typeof j !== 'object') return 'Tarea ' + n + ' no válida';
  const schedule = String(j.schedule || '').trim();
  const command = String(j.command || '').trim();
  if (!validSchedule(schedule)) return 'Tarea ' + n + ': frecuencia no válida (' + schedule + ')';
  if (!command) return 'Tarea ' + n + ': falta el comando';
  if (/[\r\n]/.test(command) || /[\r\n]/.test(schedule)) return 'Tarea ' + n + ': el comando no puede tener saltos de línea';
  return null;
}

/**
 * Construye el nuevo contenido del crontab a partir del actual y de la lista de la interfaz.
 * @param {string} currentContent - crontab actual
 * @param {Array<{origLine?: string, title?: string, schedule: string, command: string, useXvfb?: boolean}>} jobs
 * @param {string} logsDir - carpeta de logs para tareas nuevas
 * @returns {{ ok: boolean, content?: string, error?: string, stats?: object }}
 */
function buildCrontabContent(currentContent, jobs, logsDir) {
  const list = Array.isArray(jobs) ? jobs : [];
  for (let i = 0; i < list.length; i++) {
    const err = validateJob(list[i], i);
    if (err) return { ok: false, error: err };
  }

  // Tareas de la interfaz que vienen de una línea existente, agrupadas por esa línea
  const byLine = new Map();
  const newJobs = [];
  list.forEach(j => {
    const orig = typeof j.origLine === 'string' ? j.origLine.trim() : '';
    if (!orig) { newJobs.push(j); return; }
    if (!byLine.has(orig)) byLine.set(orig, []);
    byLine.get(orig).push(j);
  });

  const items = parseCrontabDocument(currentContent);
  const out = [];
  const stats = { kept: 0, edited: 0, deleted: 0, added: 0, preserved: 0 };

  for (const it of items) {
    if (it.kind === 'other') { out.push(it.raw); stats.preserved++; continue; }
    if (it.kind === 'title') continue; // se reescribe junto con su tarea
    const queue = byLine.get(it.line);
    const j = queue && queue.shift();
    if (!j) { stats.deleted++; continue; }

    const orig = describeCommand(it.command);
    const schedule = String(j.schedule).trim();
    const rawCommand = String(j.command).trim();
    const useXvfb = !!j.useXvfb;
    const title = cleanTitle(j.title);

    if (title) out.push(title === cleanTitle(it.title) && it.titleRaw != null ? it.titleRaw : titleComment(title));

    const unchanged = schedule === it.schedule && rawCommand === orig.rawCommand && useXvfb === orig.useXvfb;
    if (unchanged) {
      out.push(it.raw);
      stats.kept++;
    } else {
      const effective = useXvfb ? wrapXvfb(rawCommand) : rawCommand;
      const suffix = hasRedirection(effective) ? '' : orig.suffix;
      out.push(schedule + ' ' + effective + suffix);
      stats.edited++;
    }
  }

  const unmatched = [...byLine.values()].reduce((n, q) => n + q.length, 0);
  if (unmatched > 0) {
    return { ok: false, conflict: true, error: 'Hay tareas que ya no están en el crontab (¿lo ha cambiado otro proceso?). Recarga la página.' };
  }

  newJobs.forEach(j => {
    const schedule = String(j.schedule).trim();
    const rawCommand = String(j.command).trim();
    const title = cleanTitle(j.title);
    let effective = j.useXvfb ? wrapXvfb(rawCommand) : rawCommand;
    if (!hasRedirection(effective)) {
      effective += ' >> ' + getLogPath(schedule, effective, logsDir) + ' 2>&1';
    }
    if (title) out.push(titleComment(title));
    out.push(schedule + ' ' + effective);
    stats.added++;
  });

  const content = out.join('\n') + (out.length ? '\n' : '');
  return { ok: true, content, stats };
}

/**
 * Guarda la lista de tareas en el crontab con copia previa.
 * @param {{ jobs: Array, baseHash: string, logsDir: string }} opts
 * @returns {{ ok: boolean, status?: number, error?: string, backup?: string, hash?: string, stats?: object }}
 */
function saveJobs({ jobs, baseHash, logsDir }) {
  const current = readCrontab();
  if (!current.ok) return { ok: false, status: 500, error: 'No se pudo leer el crontab: ' + current.error };
  if (!baseHash || baseHash !== crontabHash(current.content)) {
    return { ok: false, status: 409, error: 'El crontab ha cambiado desde que abriste la página. Recarga para ver la versión actual (tus cambios no se han guardado).' };
  }
  const built = buildCrontabContent(current.content, jobs, logsDir);
  if (!built.ok) return { ok: false, status: built.conflict ? 409 : 400, error: built.error };

  const backup = createBackup(current.content);
  if (!backup.ok) return { ok: false, status: 500, error: backup.error + '. No se ha guardado nada.' };

  if (built.content === current.content) {
    return { ok: true, backup: backup.name, hash: crontabHash(current.content), stats: built.stats, unchanged: true };
  }
  const written = writeCrontab(built.content);
  if (!written.ok) return { ok: false, status: 500, error: written.error, backup: backup.name };
  return { ok: true, backup: backup.name, hash: crontabHash(built.content), stats: built.stats };
}

/**
 * Restaura una copia: antes hace copia del crontab actual.
 * @param {string} content - contenido de la copia a restaurar
 */
function restoreContent(content) {
  const current = readCrontab();
  if (!current.ok) return { ok: false, status: 500, error: 'No se pudo leer el crontab: ' + current.error };
  const backup = createBackup(current.content);
  if (!backup.ok) return { ok: false, status: 500, error: backup.error + '. No se ha restaurado nada.' };
  const written = writeCrontab(content);
  if (!written.ok) return { ok: false, status: 500, error: written.error, backup: backup.name };
  return { ok: true, backup: backup.name, hash: crontabHash(content) };
}

module.exports = {
  getRawCommandForLog,
  getLogPath,
  hasRedirection,
  describeCommand,
  validSchedule,
  buildCrontabContent,
  saveJobs,
  restoreContent
};
