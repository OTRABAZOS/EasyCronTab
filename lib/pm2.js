/**
 * Wrapper de la API programática de PM2 para listar, arrancar, parar, reiniciar y eliminar procesos.
 * Requiere que PM2 esté instalado (npm install pm2) y que el daemon esté en marcha o se arranque al conectar.
 */
const pm2 = require('pm2');

function connect() {
  return new Promise((resolve, reject) => {
    pm2.connect((err) => {
      if (err) return reject(err);
      resolve();
    });
  });
}

function disconnect() {
  pm2.disconnect();
}

/**
 * Lista todos los procesos gestionados por PM2.
 * @returns {Promise<Array<{ id: number, name: string, status: string, pid: number, uptime: number|null, cwd: string }>>}
 */
function list() {
  return connect()
    .then(() => new Promise((resolve, reject) => {
      pm2.list((err, list) => {
        disconnect();
        if (err) return reject(err);
        const items = (list || []).map(proc => ({
          id: proc.pm_id,
          name: proc.name || proc.pm2_env?.name || String(proc.pm_id),
          status: proc.pm2_env?.status || 'unknown',
          pid: proc.pid || null,
          uptime: proc.pm2_env?.pm_uptime ? Date.now() - proc.pm2_env.pm_uptime : null,
          cwd: proc.pm2_env?.cwd || ''
        }));
        resolve(items);
      });
    }))
    .catch(err => {
      disconnect();
      throw err;
    });
}

/**
 * Arranca un proceso con PM2.
 * @param {Object} opts - { name, cwd?, script, args? }
 *   script puede ser "npm" y args "run start-all", o script "node" y args "server.js", etc.
 * @returns {Promise<void>}
 */
function start(opts) {
  const name = typeof opts.name === 'string' ? opts.name.trim() : null;
  if (!name) return Promise.reject(new Error('Falta el nombre del proceso'));
  const cwd = typeof opts.cwd === 'string' ? opts.cwd.trim() || undefined : undefined;
  let script = opts.script;
  let args = opts.args;
  if (typeof script !== 'string' || !script.trim()) {
    return Promise.reject(new Error('Falta el script (ej: npm o node)'));
  }
  script = script.trim();
  if (Array.isArray(args)) {
    args = args.filter(Boolean).map(String);
  } else if (typeof args === 'string' && args.trim()) {
    args = args.trim().split(/\s+/);
  } else {
    args = [];
  }
  const startOpts = { name, script, args: args.length ? args : undefined, cwd };
  return connect()
    .then(() => new Promise((resolve, reject) => {
      pm2.start(startOpts, (err) => {
        disconnect();
        if (err) return reject(err);
        resolve();
      });
    }))
    .catch(err => {
      disconnect();
      throw err;
    });
}

/**
 * Para un proceso por nombre o id.
 * @param {{ name?: string, id?: number }} opts
 */
function stop(opts) {
  const id = resolveId(opts);
  if (id == null) return Promise.reject(new Error('Indica name o id del proceso'));
  return connect()
    .then(() => new Promise((resolve, reject) => {
      pm2.stop(id, (err) => {
        disconnect();
        if (err) return reject(err);
        resolve();
      });
    }))
    .catch(err => {
      disconnect();
      throw err;
    });
}

/**
 * Reinicia un proceso por nombre o id.
 */
function restart(opts) {
  const id = resolveId(opts);
  if (id == null) return Promise.reject(new Error('Indica name o id del proceso'));
  return connect()
    .then(() => new Promise((resolve, reject) => {
      pm2.restart(id, (err) => {
        disconnect();
        if (err) return reject(err);
        resolve();
      });
    }))
    .catch(err => {
      disconnect();
      throw err;
    });
}

/**
 * Elimina un proceso de la lista de PM2 (lo para si estaba corriendo).
 */
function deleteProcess(opts) {
  const id = resolveId(opts);
  if (id == null) return Promise.reject(new Error('Indica name o id del proceso'));
  return connect()
    .then(() => new Promise((resolve, reject) => {
      pm2.delete(id, (err) => {
        disconnect();
        if (err) return reject(err);
        resolve();
      });
    }))
    .catch(err => {
      disconnect();
      throw err;
    });
}

function resolveId(opts) {
  if (opts == null) return null;
  if (typeof opts.id === 'number' && !Number.isNaN(opts.id)) return opts.id;
  if (typeof opts.name === 'string' && opts.name.trim()) return opts.name.trim();
  return null;
}

module.exports = {
  list,
  start,
  stop,
  restart,
  delete: deleteProcess
};
