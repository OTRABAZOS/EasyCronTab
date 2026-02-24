const fs = require('fs');
const path = require('path');
const os = require('os');

const ROOT = path.resolve(os.homedir());

/**
 * Comprueba que dir esté dentro del directorio permitido (home del usuario).
 */
function isUnderRoot(dir) {
  const resolved = path.resolve(dir);
  return resolved === ROOT || resolved.startsWith(ROOT + path.sep);
}

/**
 * Lista subdirectorios de la ruta indicada. Solo se permite navegar bajo el home del usuario.
 * @param {string} dirPath - Ruta a listar (vacía o no enviada = home)
 * @returns {{ ok: boolean, currentPath?: string, parentPath?: string|null, directories?: Array<{ name: string, path: string }>, error?: string }}
 */
function listDirectory(dirPath) {
  const base = (dirPath && String(dirPath).trim()) || ROOT;
  let resolved;
  try {
    resolved = path.resolve(base);
  } catch (e) {
    return { ok: false, error: 'Ruta no válida' };
  }

  if (!isUnderRoot(resolved)) {
    return { ok: false, error: 'Solo se puede navegar dentro de tu carpeta de usuario' };
  }

  let entries;
  try {
    entries = fs.readdirSync(resolved, { withFileTypes: true });
  } catch (e) {
    if (e.code === 'ENOENT') return { ok: false, error: 'La carpeta no existe' };
    if (e.code === 'ENOTDIR') return { ok: false, error: 'No es una carpeta' };
    return { ok: false, error: e.message || 'Error al leer la carpeta' };
  }

  const directories = entries
    .filter((d) => d.isDirectory() && !d.name.startsWith('.'))
    .map((d) => ({
      name: d.name,
      path: path.join(resolved, d.name)
    }))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));

  const parentPath = resolved === ROOT ? null : path.dirname(resolved);

  return {
    ok: true,
    currentPath: resolved,
    parentPath,
    directories,
    rootPath: ROOT
  };
}

module.exports = {
  listDirectory,
  getBrowseRoot: () => ROOT
};
