/**
 * Genera una descripción en lenguaje natural (español) del comando de una tarea cron.
 * Usa heurísticas: cd + script, nohup, redirecciones a log, etc.
 */

/**
 * Extrae el nombre del proyecto/carpeta de un path como /home/user/proyectos/mi_proyecto/...
 * @param {string} path
 * @returns {string}
 */
function projectNameFromPath(path) {
  if (!path || typeof path !== 'string') return '';
  const normalized = path.replace(/\/$/, '');
  const segments = normalized.split('/').filter(Boolean);
  return segments.length > 0 ? segments[segments.length - 1] : '';
}

/**
 * Describe en una frase corta qué hace el comando.
 * @param {string} command
 * @returns {string}
 */
function commandToDescription(command) {
  if (!command || typeof command !== 'string') return '';
  const c = command.trim();
  if (!c) return '';

  const parts = [];
  let project = '';
  let script = '';
  let logFile = '';

  // Redirección a log: >> archivo 2>&1 o > archivo
  const logMatch = c.match(/>>?\s*([^\s&|]+)(?:\s+2>&1)?/);
  if (logMatch) logFile = logMatch[1].trim();

  // cd /ruta/al/proyecto (también dentro de comillas en bash -c '...')
  const cdMatch = c.match(/cd\s+([^\s&|;'"]+)|cd\s+['"]([^'"]+)['"]/);
  if (cdMatch) {
    project = projectNameFromPath((cdMatch[1] || cdMatch[2] || '').trim());
  }
  // Proyecto por path tipo /home/.../nombre_proyecto
  if (!project && /\/home\/[^/]+\/[^/]+\/[^/]+/.test(c)) {
    const pathMatch = c.match(/(\/home\/[^\s&|;'"]+(?:\/[a-zA-Z0-9_.-]+))/);
    if (pathMatch) project = projectNameFromPath(pathMatch[1]);
  }

  // ./script.sh o ./scripts/nombre.sh o npm run X
  const scriptMatch = c.match(/(?:\.\/)(?:scripts\/)?([^\s&|'"]+\.(?:sh|py|js))|npm\s+run\s+(\S+)/);
  if (scriptMatch) {
    script = (scriptMatch[1] || scriptMatch[2] || '').trim();
  }
  // nohup ./start-all.sh o nohup npm run start-all
  if (!script) {
    const nohupMatch = c.match(/nohup\s+(?:\.\/)?([^\s&|'"]+\.(?:sh|py|js))|nohup\s+npm\s+run\s+(\S+)/);
    if (nohupMatch) script = (nohupMatch[1] || nohupMatch[2] || '').trim();
  }
  // run-pipeline.sh, start-all.sh como nombre reconocible
  if (!script && /run-pipeline|start-all|start_all/.test(c)) {
    const m = c.match(/(run-pipeline|start-all|start_all)(?:\.sh)?/);
    if (m) script = m[1] + (m[0].includes('.sh') ? '.sh' : '');
  }

  if (project && script) {
    const scriptLabel = script.replace(/\.(sh|py|js)$/, '').replace(/-/g, ' ');
    if (/nohup|&$/.test(c)) {
      parts.push('Arranca en segundo plano el proyecto "' + project + '"');
    } else {
      parts.push('Ejecuta ' + scriptLabel + ' en el proyecto "' + project + '"');
    }
  } else if (project) {
    parts.push('Ejecuta tareas del proyecto "' + project + '"');
  } else if (script) {
    parts.push('Ejecuta el script ' + script);
  } else {
    // Fallback: primera parte del comando (hasta el primer espacio significativo)
    const first = c.replace(/\s*[&|].*$/, '').trim().split(/\s+/)[0];
    if (first) parts.push('Ejecuta: ' + first);
  }

  if (logFile) {
    const logName = logFile.split('/').pop() || logFile;
    parts.push('y guarda la salida en ' + logName);
  }

  return parts.join(' ') + (parts.length ? '.' : '');
}

module.exports = { commandToDescription, projectNameFromPath };
