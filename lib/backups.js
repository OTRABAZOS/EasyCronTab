/**
 * Copias de seguridad del crontab antes de cada escritura.
 * Carpeta: ~/.config/easycrontab/backups (o EASYCRONTAB_BACKUPS_DIR).
 * Nombre: crontab_AAAAMMDD-hhmmss.txt. Se conservan las últimas MAX_BACKUPS.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { parseCrontabLines } = require('./crontab');

const MAX_BACKUPS = 30;
const NAME_RE = /^crontab_\d{8}-\d{6}(-\d+)?\.txt$/;

function getBackupsDir() {
  return process.env.EASYCRONTAB_BACKUPS_DIR || path.join(os.homedir(), '.config', 'easycrontab', 'backups');
}

function stamp(d) {
  const p = (n) => String(n).padStart(2, '0');
  return d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '-' + p(d.getHours()) + p(d.getMinutes()) + p(d.getSeconds());
}

function isValidName(name) {
  return typeof name === 'string' && NAME_RE.test(name);
}

/** Nombres de copia, del más reciente al más antiguo. */
function listNames() {
  const dir = getBackupsDir();
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter(isValidName).sort((a, b) => sortKey(b).localeCompare(sortKey(a)));
}

/** crontab_20261117-100000-2.txt → "20261117-100000-0002" (para ordenar copias del mismo segundo) */
function sortKey(name) {
  const m = name.match(/^crontab_(\d{8}-\d{6})(?:-(\d+))?\.txt$/);
  return m[1] + '-' + String(m[2] || 1).padStart(4, '0');
}

function prune() {
  listNames().slice(MAX_BACKUPS).forEach(name => {
    try { fs.unlinkSync(path.join(getBackupsDir(), name)); } catch (_) { /* ignorar */ }
  });
}

/**
 * Guarda una copia del contenido dado. Si es idéntico a la última copia, la reutiliza.
 * La copia se verifica leyéndola de nuevo; si algo falla devuelve ok:false.
 * @param {string} content
 * @returns {{ ok: boolean, name?: string, reused?: boolean, error?: string }}
 */
function createBackup(content) {
  const text = content || '';
  try {
    const dir = getBackupsDir();
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    const latest = listNames()[0];
    if (latest && fs.readFileSync(path.join(dir, latest), 'utf8') === text) {
      return { ok: true, name: latest, reused: true };
    }
    const base = 'crontab_' + stamp(new Date());
    // Varias copias en el mismo segundo: sufijo -2, -3… siempre mayor que el último usado
    const sameSecond = listNames().filter(n => n.startsWith(base));
    const maxSuffix = sameSecond.reduce((m, n) => Math.max(m, parseInt(sortKey(n).slice(-4), 10)), 0);
    let name = maxSuffix ? base + '-' + (maxSuffix + 1) + '.txt' : base + '.txt';
    for (let i = maxSuffix + 2; fs.existsSync(path.join(dir, name)); i++) name = base + '-' + i + '.txt';
    const file = path.join(dir, name);
    const tmp = file + '.tmp';
    fs.writeFileSync(tmp, text, { encoding: 'utf8', mode: 0o600 });
    fs.renameSync(tmp, file);
    if (fs.readFileSync(file, 'utf8') !== text) {
      return { ok: false, error: 'La copia escrita no coincide con el crontab' };
    }
    prune();
    return { ok: true, name, reused: false };
  } catch (e) {
    return { ok: false, error: 'No se pudo hacer la copia: ' + (e.message || String(e)) };
  }
}

/** Lista de copias con fecha, tamaño y número de tareas. */
function listBackups() {
  const dir = getBackupsDir();
  return listNames().map(name => {
    const file = path.join(dir, name);
    let size = 0, mtimeMs = null, jobs = 0;
    try {
      const st = fs.statSync(file);
      size = st.size;
      mtimeMs = st.mtimeMs;
      jobs = parseCrontabLines(fs.readFileSync(file, 'utf8')).length;
    } catch (_) { /* ignorar */ }
    return { name, size, mtimeMs, jobs };
  });
}

/** @returns {{ ok: boolean, content?: string, error?: string }} */
function readBackup(name) {
  if (!isValidName(name)) return { ok: false, error: 'Nombre de copia no válido' };
  const file = path.join(getBackupsDir(), name);
  if (!fs.existsSync(file)) return { ok: false, error: 'La copia no existe' };
  return { ok: true, content: fs.readFileSync(file, 'utf8') };
}

module.exports = { MAX_BACKUPS, getBackupsDir, createBackup, listBackups, readBackup, isValidName };
