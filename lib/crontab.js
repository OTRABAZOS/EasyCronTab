const { execSync, spawnSync } = require('child_process');

/**
 * Lee el crontab del usuario actual.
 * @returns {{ ok: boolean, content: string, error?: string }}
 */
function readCrontab() {
  try {
    const content = execSync('crontab -l', { encoding: 'utf8', maxBuffer: 1024 * 1024 });
    return { ok: true, content: content || '' };
  } catch (err) {
    if (err.status === 1 && err.stderr && /no crontab for/.test(err.stderr)) {
      return { ok: true, content: '' };
    }
    return { ok: false, content: '', error: err.message || String(err.stderr) };
  }
}

/**
 * Guarda el crontab del usuario (reemplaza todo el crontab).
 * @param {string} content - Contenido completo del crontab
 * @returns {{ ok: boolean, error?: string }}
 */
function writeCrontab(content) {
  try {
    const result = spawnSync('crontab', ['-'], {
      input: content || '',
      encoding: 'utf8',
      maxBuffer: 1024 * 1024
    });
    if (result.status !== 0) {
      return { ok: false, error: result.stderr || result.error?.message || 'Error al guardar crontab' };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message || String(err) };
  }
}

/**
 * Parsea las líneas del crontab en entradas con schedule y comando.
 * Cada línea válida (5 campos de tiempo + comando) se devuelve como objeto.
 * @param {string} crontabContent
 * @returns {Array<{ schedule: string, command: string, line: string }>}
 */
function parseCrontabLines(crontabContent) {
  if (!crontabContent || !crontabContent.trim()) return [];
  const lines = crontabContent.split('\n');
  const result = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const parts = trimmed.split(/\s+/);
    if (parts.length >= 2 && parts[0].startsWith('@')) {
      const schedule = parts[0];
      const command = parts.slice(1).join(' ');
      result.push({ schedule, command, line: trimmed });
    } else if (parts.length >= 6) {
      const schedule = parts.slice(0, 5).join(' ');
      const command = parts.slice(5).join(' ');
      result.push({ schedule, command, line: trimmed });
    }
  }
  return result;
}

module.exports = {
  readCrontab,
  writeCrontab,
  parseCrontabLines
};
