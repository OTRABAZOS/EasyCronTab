const crypto = require('crypto');
const { spawnSync } = require('child_process');

/**
 * Binario de crontab. Se puede sustituir por uno falso (tests / pruebas sin riesgo)
 * con la variable de entorno EASYCRONTAB_CRONTAB_BIN.
 */
function crontabBin() {
  return process.env.EASYCRONTAB_CRONTAB_BIN || 'crontab';
}

/**
 * Lee el crontab del usuario actual.
 * @returns {{ ok: boolean, content: string, error?: string }}
 */
function readCrontab() {
  try {
    const result = spawnSync(crontabBin(), ['-l'], { encoding: 'utf8', maxBuffer: 1024 * 1024 });
    if (result.error) return { ok: false, content: '', error: result.error.message };
    if (result.status === 0) return { ok: true, content: result.stdout || '' };
    if (/no crontab for/i.test(result.stderr || '')) return { ok: true, content: '' };
    return { ok: false, content: '', error: (result.stderr || '').trim() || 'crontab -l terminó con código ' + result.status };
  } catch (err) {
    return { ok: false, content: '', error: err.message || String(err) };
  }
}

/**
 * Guarda el crontab del usuario (reemplaza todo el crontab).
 * Usar siempre a través de lib/saveCrontab.js, que hace la copia antes.
 * @param {string} content - Contenido completo del crontab
 * @returns {{ ok: boolean, error?: string }}
 */
function writeCrontab(content) {
  try {
    const result = spawnSync(crontabBin(), ['-'], {
      input: content || '',
      encoding: 'utf8',
      maxBuffer: 1024 * 1024
    });
    if (result.error) return { ok: false, error: result.error.message };
    if (result.status !== 0) {
      return { ok: false, error: result.stderr || 'Error al guardar crontab' };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message || String(err) };
  }
}

/** Huella del contenido del crontab, para detectar cambios entre leer y guardar. */
function crontabHash(content) {
  return crypto.createHash('sha256').update(content || '').digest('hex').slice(0, 16);
}

const TITLE_RE = /^#\s*t[ií]tulo\s*:\s*(.*?)\s*$/i;
const ENV_RE = /^[A-Za-z_][A-Za-z0-9_]*\s*=/;
const SPECIAL_RE = /^(@\S+)\s+(.+)$/;
const FIVE_FIELDS_RE = /^(\S+)\s+(\S+)\s+(\S+)\s+(\S+)\s+(\S+)\s+(.+)$/;

/** Intenta leer una línea como tarea. Devuelve { schedule, command } o null. */
function parseJobLine(trimmed) {
  if (!trimmed || trimmed.startsWith('#') || ENV_RE.test(trimmed)) return null;
  let m = trimmed.match(SPECIAL_RE);
  if (m) return { schedule: m[1], command: m[2] };
  m = trimmed.match(FIVE_FIELDS_RE);
  if (m) return { schedule: m.slice(1, 6).join(' '), command: m[6] };
  return null;
}

/** Limpia un título para guardarlo en una sola línea de comentario. */
function cleanTitle(title) {
  return String(title || '').replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function titleComment(title) {
  return '# título: ' + cleanTitle(title);
}

/**
 * Parsea el crontab completo conservando todas las líneas, en orden.
 * Cada elemento es:
 *  - { kind: 'title', raw, title }  comentario «# título: …» justo encima de una tarea
 *  - { kind: 'job', raw, line, schedule, command, title, titleRaw }
 *  - { kind: 'other', raw }         comentarios, líneas en blanco, variables de entorno, etc.
 * @param {string} content
 */
function parseCrontabDocument(content) {
  const text = (content || '').replace(/\r\n/g, '\n');
  const lines = text.split('\n');
  if (lines.length && lines[lines.length - 1] === '') lines.pop();
  const items = [];
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const trimmed = raw.trim();
    const job = parseJobLine(trimmed);
    if (job) {
      const prev = items[items.length - 1];
      let title = '';
      let titleRaw = null;
      if (prev && prev.kind === 'title') {
        title = prev.title;
        titleRaw = prev.raw;
      }
      items.push({ kind: 'job', raw, line: trimmed, schedule: job.schedule, command: job.command, title, titleRaw });
      continue;
    }
    const tm = trimmed.match(TITLE_RE);
    const next = lines[i + 1] != null ? parseJobLine(lines[i + 1].trim()) : null;
    if (tm && next) {
      items.push({ kind: 'title', raw, title: tm[1] });
    } else {
      items.push({ kind: 'other', raw });
    }
  }
  return items;
}

/**
 * Parsea las líneas del crontab en tareas (sin comentarios ni variables de entorno).
 * Si la línea anterior es «# título: …», se asocia como title.
 * @param {string} crontabContent
 * @returns {Array<{ schedule: string, command: string, line: string, title: string }>}
 */
function parseCrontabLines(crontabContent) {
  return parseCrontabDocument(crontabContent)
    .filter(it => it.kind === 'job')
    .map(it => ({ schedule: it.schedule, command: it.command, line: it.line, title: it.title }));
}

module.exports = {
  readCrontab,
  writeCrontab,
  crontabHash,
  parseCrontabLines,
  parseCrontabDocument,
  parseJobLine,
  cleanTitle,
  titleComment
};
