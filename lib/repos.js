const fs = require('fs');
const path = require('path');
const { getReposPath } = require('./settings');

/**
 * Lista directorios en basePath que contienen package.json y devuelve
 * nombre, path absoluto y scripts (npm run X / npm start).
 * @param {string} basePath - Ruta absoluta a la carpeta de repos
 * @returns {{ ok: boolean, repos?: Array<{ name: string, path: string, scripts: Array<{ name: string, command: string }> }>, error?: string }}
 */
function listRepos(basePath) {
  const reposPath = basePath || getReposPath();
  // #region agent log
  const _pl = JSON.stringify({ sessionId: 'dfee4a', location: 'repos.js:listRepos', message: 'reposPath value', data: { reposPath: reposPath || '', len: (reposPath || '').length, isEmpty: !reposPath || !reposPath.trim() }, hypothesisId: 'E', timestamp: Date.now() }) + '\n';
  try { fs.appendFileSync('/home/mazingerzot/Documentos/DEV/EasyCronTab/.cursor/debug-dfee4a.log', _pl); } catch (_) {}
  // #endregion
  if (!reposPath || !reposPath.trim()) {
    return { ok: false, error: 'No se ha configurado la carpeta de repositorios' };
  }

  let resolvedPath;
  try {
    resolvedPath = path.resolve(reposPath);
  } catch (e) {
    return { ok: false, error: 'Ruta no válida' };
  }

  let entries;
  try {
    entries = fs.readdirSync(resolvedPath, { withFileTypes: true });
  } catch (e) {
    if (e.code === 'ENOENT') return { ok: false, error: 'La carpeta no existe' };
    if (e.code === 'ENOTDIR') return { ok: false, error: 'La ruta no es una carpeta' };
    return { ok: false, error: e.message || 'Error al leer la carpeta' };
  }

  const repos = [];
  for (const dirent of entries) {
    if (!dirent.isDirectory()) continue;
    const dirPath = path.join(resolvedPath, dirent.name);
    const pkgPath = path.join(dirPath, 'package.json');
    let pkg;
    try {
      pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    } catch (e) {
      continue; // sin package.json o JSON inválido
    }
    const scripts = pkg.scripts && typeof pkg.scripts === 'object' ? pkg.scripts : {};
    const scriptList = Object.entries(scripts)
      .filter(([, cmd]) => typeof cmd === 'string' && cmd.trim())
      .map(([name, cmd]) => ({
        name,
        command: name === 'start' ? 'npm start' : `npm run ${name}`
      }));
    if (scriptList.length) {
      repos.push({
        name: dirent.name,
        path: dirPath,
        scripts: scriptList
      });
    }
  }

  return { ok: true, repos };
}

/**
 * Genera el comando para crontab: cd /path && npm run scriptName (o npm start).
 */
function buildCronCommand(repoPath, scriptName) {
  const dir = path.resolve(repoPath);
  const run = scriptName === 'start' ? 'npm start' : `npm run ${scriptName}`;
  return `cd ${dir} && ${run}`;
}

module.exports = {
  listRepos,
  buildCronCommand
};
