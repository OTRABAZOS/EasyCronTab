/**
 * Utilidades para envolver/comprobar comandos con xvfb-run (display virtual).
 * Permite ejecutar navegadores "headed" (Playwright/Puppeteer) en cron sin X real.
 */

const XVFB_PREFIX = "xvfb-run -a sh -c '";

/**
 * Envuelve el comando en `xvfb-run -a sh -c '...'` para que se ejecute con display virtual.
 * Escapa comillas simples dentro del comando para que el shell lo interprete bien.
 * @param {string} rawCommand - Comando sin envolver (ej: "cd /path && npm start")
 * @returns {string} Comando listo para crontab (sin la redirección >> log)
 */
function wrapXvfb(rawCommand) {
  const cmd = (rawCommand || '').trim();
  if (!cmd) return cmd;
  // Escapar comilla simple para sh -c '...': ' -> '\''
  const escaped = cmd.replace(/'/g, "'\\''");
  return XVFB_PREFIX + escaped + "'";
}

/**
 * Comprueba si el comando efectivo está envuelto con xvfb-run y extrae el comando interno.
 * @param {string} effectiveCommand - Comando tal como está en crontab (sin " >> log 2>&1")
 * @returns {{ rawCommand: string, useXvfb: boolean }}
 */
function parseXvfbCommand(effectiveCommand) {
  const cmd = (effectiveCommand || '').trim();
  if (!cmd.startsWith(XVFB_PREFIX) || !cmd.endsWith("'")) {
    return { rawCommand: cmd, useXvfb: false };
  }
  const inner = cmd.slice(XVFB_PREFIX.length, -1);
  const rawCommand = inner.replace(/'\\''/g, "'");
  return { rawCommand, useXvfb: true };
}

module.exports = {
  wrapXvfb,
  parseXvfbCommand
};
