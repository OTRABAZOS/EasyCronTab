const crypto = require('crypto');
const fs = require('fs');
const { spawn } = require('child_process');
const express = require('express');
const path = require('path');
const config = require('./config');
const { readCrontab, writeCrontab, parseCrontabLines } = require('./lib/crontab');
const { buildSearchIndex, search } = require('./lib/search');
const { cronToHuman, cronToFormOptions, FRECUENCIAS, DIAS_SEMANA } = require('./lib/cronSchedule');
const { getNextRun, getRunsForDay } = require('./lib/nextRun');
const { commandToDescription } = require('./lib/commandDescribe');
const { getSettings, setReposPath, getLogsPath } = require('./lib/settings');
const { listRepos, buildCronCommand } = require('./lib/repos');
const { listDirectory, getBrowseRoot } = require('./lib/browse');
const pm2 = require('./lib/pm2');
const { wrapXvfb, parseXvfbCommand } = require('./lib/xvfb');

const pkg = require('./package.json');
const appVersion = pkg.version || '0.0.0';
const appDescription = pkg.description || '';
const appRepo = 'https://github.com/OTRABAZOS/EasyCronTab';

const app = express();
const PORT = config.server.port;

app.use(express.urlencoded({ extended: true }));
app.use(express.json({ limit: '2mb' }));

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));

// Normaliza tarea del crontab a job con comando "raw" y flag useXvfb
function taskToJob(t) {
  const effectiveCommand = getRawCommandForLog(t.command);
  const { rawCommand, useXvfb } = parseXvfbCommand(effectiveCommand);
  const logPath = getLogPath(t.schedule, effectiveCommand);
  const { nextRun, nextRunMs } = getNextRun(t.schedule);
  return {
    schedule: t.schedule,
    command: rawCommand,
    useXvfb: !!useXvfb,
    line: t.line,
    humanSchedule: cronToHuman(t.schedule),
    humanCommand: commandToDescription(rawCommand),
    formOptions: cronToFormOptions(t.schedule),
    nextRun: nextRun || null,
    nextRunMs: nextRunMs != null ? nextRunMs : null,
    logStatus: getLogStatus(logPath),
    logPath
  };
}

// Página principal: dashboard con lista de tareas (formulario) y buscador
app.get('/', (req, res) => {
  const crontabResult = readCrontab();
  const tasks = crontabResult.ok ? parseCrontabLines(crontabResult.content) : [];
  const jobs = tasks.map(t => {
    const j = taskToJob(t);
    return { ...j, line: t.line };
  });
  const settings = getSettings();
  res.render('dashboard', {
    title: 'EasyCronTab',
    crontabError: crontabResult.ok ? null : crontabResult.error,
    jobs,
    FRECUENCIAS,
    DIAS_SEMANA,
    reposPath: settings.reposPath || '',
    appVersion,
    appDescription,
    appRepo
  });
});

// API jobs: listar (con humanSchedule, formOptions, nextRun, useXvfb)
app.get('/api/jobs', (req, res) => {
  const result = readCrontab();
  if (!result.ok) {
    return res.status(500).json({ ok: false, error: result.error });
  }
  const tasks = parseCrontabLines(result.content);
  const jobs = tasks.map(t => {
    const j = taskToJob(t);
    return { schedule: j.schedule, command: j.command, useXvfb: j.useXvfb, humanSchedule: j.humanSchedule, humanCommand: j.humanCommand, formOptions: j.formOptions, nextRun: j.nextRun, nextRunMs: j.nextRunMs, logStatus: j.logStatus, logPath: j.logPath };
  });
  res.json({ ok: true, jobs });
});

// API jobs: contenido del log de una tarea (body: schedule, command, useXvfb?)
app.post('/api/jobs/log', (req, res) => {
  const { schedule, command, useXvfb } = req.body || {};
  if (!schedule || !command) {
    return res.status(400).json({ ok: false, error: 'Faltan schedule o command' });
  }
  const effectiveCommand = useXvfb ? wrapXvfb(command) : command;
  const logPath = getLogPath(schedule, effectiveCommand);
  try {
    if (!fs.existsSync(logPath)) {
      return res.json({ ok: true, content: '(El archivo de log aún no existe o la tarea no se ha ejecutado.)', path: logPath });
    }
    const stat = fs.statSync(logPath);
    const content = fs.readFileSync(logPath, 'utf8');
    const maxLen = 300 * 1024;
    const out = content.length > maxLen ? content.slice(-maxLen) : content;
    res.json({
      ok: true,
      content: out,
      path: logPath,
      truncated: content.length > maxLen,
      logUpdatedAt: stat.mtime ? stat.mtime.getTime() : null
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message || String(e) });
  }
});

// API jobs: forzar ejecución ahora (body: schedule, command, useXvfb?). Ejecuta en segundo plano y escribe en el mismo log.
app.post('/api/jobs/run-now', (req, res) => {
  const { schedule, command, useXvfb } = req.body || {};
  if (!schedule || !command) {
    return res.status(400).json({ ok: false, error: 'Faltan schedule o command' });
  }
  const effectiveCommand = useXvfb ? wrapXvfb(command) : command;
  const result = readCrontab();
  if (!result.ok) {
    return res.status(500).json({ ok: false, error: result.error });
  }
  const tasks = parseCrontabLines(result.content);
  const exists = tasks.some(t => (t.schedule || '').trim() === (schedule || '').trim() && getRawCommandForLog(t.command) === effectiveCommand);
  if (!exists) {
    return res.status(400).json({ ok: false, error: 'La tarea no está en el crontab actual' });
  }
  const logDir = getLogsPath();
  const fullCommand = effectiveCommand + ' >> ' + getLogPath(schedule, effectiveCommand) + ' 2>&1';
  try {
    fs.mkdirSync(logDir, { recursive: true });
  } catch (e) {
    return res.status(500).json({ ok: false, error: 'No se pudo crear la carpeta de logs: ' + (e.message || String(e)) });
  }
  try {
    const env = { ...process.env };
    if (!env.DISPLAY) env.DISPLAY = ':0';
    spawn('sh', ['-c', fullCommand], { detached: true, stdio: 'ignore', env }).unref();
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message || String(e) });
  }
  res.json({ ok: true, message: 'Ejecución lanzada. Abre "Ver log" en unos segundos para ver la salida.' });
});

// API jobs: vista día — ejecuciones por franjas de 15 min para una fecha
app.get('/api/jobs/day', (req, res) => {
  const result = readCrontab();
  if (!result.ok) {
    return res.status(500).json({ ok: false, error: result.error });
  }
  const tasks = parseCrontabLines(result.content);
  let dateStr = typeof req.query.date === 'string' ? req.query.date.trim() : '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    const today = new Date();
    dateStr = today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0') + '-' + String(today.getDate()).padStart(2, '0');
  }
  const [y, m, d] = dateStr.split('-').map(Number);
  const startOfDay = new Date(y, m - 1, d, 0, 0, 0, 0);
  const endOfDay = new Date(y, m - 1, d, 23, 59, 59, 999);

  const jobsWithRuns = tasks.map(t => {
    const j = taskToJob(t);
    return { ...j, runs: getRunsForDay(t.schedule, dateStr) };
  });

  const slotCount = 96;
  const slots = [];
  for (let i = 0; i < slotCount; i++) {
    const minutesFromMidnight = i * 15;
    const h = Math.floor(minutesFromMidnight / 60);
    const min = minutesFromMidnight % 60;
    const timeLabel = String(h).padStart(2, '0') + ':' + String(min).padStart(2, '0');
    slots.push({ time: timeLabel, minutesFromMidnight, jobs: [] });
  }

  jobsWithRuns.forEach(({ schedule, command, useXvfb, humanSchedule, humanCommand, runs }) => {
    runs.forEach(run => {
      const runDate = run instanceof Date ? run : new Date(run);
      if (runDate.getTime() < startOfDay.getTime() || runDate.getTime() > endOfDay.getTime()) return;
      const minutesFromMidnight = runDate.getHours() * 60 + runDate.getMinutes() + runDate.getSeconds() / 60;
      const slotIndex = Math.min(Math.floor(minutesFromMidnight / 15), slotCount - 1);
      if (slotIndex >= 0 && slotIndex < slotCount) {
        const runTime = String(runDate.getHours()).padStart(2, '0') + ':' + String(runDate.getMinutes()).padStart(2, '0');
        slots[slotIndex].jobs.push({ schedule, command, useXvfb, humanSchedule, humanCommand, runTime });
      }
    });
  });

  res.json({ ok: true, date: dateStr, slots });
});

// Comando sin redirección a log (para calcular el mismo hash al guardar y al leer)
function getRawCommandForLog(command) {
  const cmd = (command || '').trim();
  return cmd.replace(/\s*>>\s*[^\s]+\s+2>&1\s*$/, '').trim() || cmd;
}

function getLogPath(schedule, command) {
  const rawCmd = getRawCommandForLog(command || '');
  const hash = crypto.createHash('md5').update((schedule || '') + '\n' + rawCmd).digest('hex').slice(0, 12);
  return path.join(getLogsPath(), hash + '.log');
}

function getLogStatus(logPath) {
  try {
    if (!fs.existsSync(logPath)) return 'unknown';
    const stat = fs.statSync(logPath);
    if (stat.size === 0) return 'unknown';
    const buf = Buffer.alloc(Math.min(stat.size, 4096));
    const fd = fs.openSync(logPath, 'r');
    fs.readSync(fd, buf, 0, buf.length, stat.size - buf.length);
    fs.closeSync(fd);
    const tail = buf.toString('utf8');
    if (/error|failed|exception|fail\s|EADDRINUSE|ECONNREFUSED|ENOENT|exit\s+code\s+[1-9]|SyntaxError|ReferenceError/i.test(tail)) return 'failed';
    return 'ok';
  } catch (e) {
    return 'unknown';
  }
}

// Añade redirección a log (>> ... 2>&1) si el comando no la tiene
function ensureLogRedirection(command, schedule, logDir) {
  const cmd = (command || '').trim();
  if (!cmd) return cmd;
  if (/2>&1\s*$/.test(cmd)) return cmd;
  const rawCmd = getRawCommandForLog(cmd);
  const hash = crypto.createHash('md5').update((schedule || '') + '\n' + rawCmd).digest('hex').slice(0, 12);
  const logFile = path.join(logDir, hash + '.log');
  return cmd + ' >> ' + logFile + ' 2>&1';
}

// API jobs: guardar (reemplaza todo el crontab con la lista enviada)
app.post('/api/jobs', (req, res) => {
  const jobs = Array.isArray(req.body.jobs) ? req.body.jobs : [];
  const logDir = getLogsPath();
  try {
    fs.mkdirSync(logDir, { recursive: true });
  } catch (e) {
    return res.status(500).json({ ok: false, error: 'No se pudo crear la carpeta de logs: ' + (e.message || e.code) });
  }
  const lines = jobs
    .filter(j => j && (j.schedule || j.command))
    .map(j => {
      const schedule = (j.schedule || '').trim();
      const rawCommand = (j.command || '').trim();
      const effectiveCommand = j.useXvfb ? wrapXvfb(rawCommand) : rawCommand;
      const command = ensureLogRedirection(effectiveCommand, schedule, logDir);
      return schedule ? schedule + ' ' + command : command;
    })
    .filter(Boolean);
  const content = lines.join('\n') + (lines.length ? '\n' : '');
  const result = writeCrontab(content);
  if (!result.ok) {
    return res.status(500).json({ ok: false, error: result.error });
  }
  res.json({ ok: true });
});

// API configuración: carpeta de repositorios
app.get('/api/settings', (req, res) => {
  res.json({ ok: true, ...getSettings() });
});

app.post('/api/settings', (req, res) => {
  const reposPath = typeof req.body.reposPath === 'string' ? req.body.reposPath.trim() : '';
  // #region agent log
  const fs = require('fs');
  const pl = JSON.stringify({ sessionId: 'dfee4a', location: 'app.js:POST /api/settings', message: 'body', data: { bodyKeys: Object.keys(req.body || {}), reposPath, reposPathLen: reposPath.length }, hypothesisId: 'A', timestamp: Date.now() }) + '\n';
  try { fs.appendFileSync('/home/mazingerzot/Documentos/DEV/EasyCronTab/.cursor/debug-dfee4a.log', pl); } catch (_) {}
  // #endregion
  setReposPath(reposPath);
  res.json({ ok: true, reposPath: getSettings().reposPath });
});

// API explorar carpetas (solo bajo el home del usuario)
app.get('/api/browse', (req, res) => {
  const dirPath = req.query.path || '';
  const result = listDirectory(dirPath);
  if (!result.ok) {
    return res.status(400).json({ ok: false, error: result.error });
  }
  res.json({ ok: true, ...result });
});

// API repos: listar repos con sus scripts (npm start, npm run X). Opcional: ?path= para usar la ruta del cliente
app.get('/api/repos', (req, res) => {
  const clientPath = typeof req.query.path === 'string' ? req.query.path.trim() : '';
  const currentPath = getSettings().reposPath;
  // #region agent log
  const fs = require('fs');
  const pl = JSON.stringify({ sessionId: 'dfee4a', location: 'app.js:GET /api/repos', message: 'getReposPath before listRepos', data: { reposPath: currentPath, len: (currentPath || '').length }, hypothesisId: 'B', timestamp: Date.now() }) + '\n';
  try { fs.appendFileSync('/home/mazingerzot/Documentos/DEV/EasyCronTab/.cursor/debug-dfee4a.log', pl); } catch (_) {}
  // #endregion
  const pathToUse = clientPath || currentPath || '';
  const result = listRepos(pathToUse || undefined);
  if (!result.ok) {
    return res.status(400).json({ ok: false, error: result.error });
  }
  res.json({ ok: true, repos: result.repos });
});

// API helper: comando para crontab dado repo path y script name
app.get('/api/repos/command', (req, res) => {
  const repoPath = req.query.repoPath;
  const scriptName = req.query.scriptName;
  if (!repoPath || !scriptName) {
    return res.status(400).json({ ok: false, error: 'Faltan repoPath o scriptName' });
  }
  const command = buildCronCommand(repoPath, scriptName);
  res.json({ ok: true, command });
});

// API PM2: listar procesos
app.get('/api/pm2/list', (req, res) => {
  pm2.list()
    .then(list => res.json({ ok: true, list }))
    .catch(err => res.status(500).json({ ok: false, error: err.message || String(err) }));
});

// API PM2: arrancar proceso (body: name, cwd?, script, args?)
app.post('/api/pm2/start', (req, res) => {
  const { name, cwd, script, args } = req.body || {};
  pm2.start({ name, cwd, script, args })
    .then(() => res.json({ ok: true }))
    .catch(err => res.status(400).json({ ok: false, error: err.message || String(err) }));
});

// API PM2: parar proceso (body: name o id)
app.post('/api/pm2/stop', (req, res) => {
  const { name, id } = req.body || {};
  pm2.stop({ name, id })
    .then(() => res.json({ ok: true }))
    .catch(err => res.status(400).json({ ok: false, error: err.message || String(err) }));
});

// API PM2: reiniciar proceso (body: name o id)
app.post('/api/pm2/restart', (req, res) => {
  const { name, id } = req.body || {};
  pm2.restart({ name, id })
    .then(() => res.json({ ok: true }))
    .catch(err => res.status(400).json({ ok: false, error: err.message || String(err) }));
});

// API PM2: eliminar proceso (body: name o id)
app.post('/api/pm2/delete', (req, res) => {
  const { name, id } = req.body || {};
  pm2.delete({ name, id })
    .then(() => res.json({ ok: true }))
    .catch(err => res.status(400).json({ ok: false, error: err.message || String(err) }));
});

// API PM2: guardar lista de procesos (pm2 save) para que persistan al reiniciar
app.post('/api/pm2/save', (req, res) => {
  pm2.save()
    .then(() => res.json({ ok: true }))
    .catch(err => res.status(500).json({ ok: false, error: err.message || String(err) }));
});

// API PM2: contenido del log de un proceso (body: name). Lee ~/.pm2/logs/<name>-out.log y -error.log
// PM2 guarda los logs con el nombre normalizado (guiones bajos → guiones), p. ej. mochi-chatbot-trawlingweb-wikibot-out.log
app.post('/api/pm2/log', (req, res) => {
  const name = (req.body && req.body.name) ? String(req.body.name).trim() : '';
  if (!name || /[^a-zA-Z0-9_.-]/.test(name)) {
    return res.status(400).json({ ok: false, error: 'Nombre de proceso no válido' });
  }
  const home = process.env.HOME || process.env.USERPROFILE || '/tmp';
  const logDir = path.join(home, '.pm2', 'logs');
  const logName = name.replace(/_/g, '-'); // mismo criterio que PM2 para el nombre del archivo
  const basePath = path.join(logDir, logName);
  const outPath = basePath + '-out.log';
  const errPath = basePath + '-error.log';
  const maxLen = 200 * 1024; // 200 KB por archivo
  try {
    let out = '';
    let err = '';
    if (fs.existsSync(outPath)) {
      const c = fs.readFileSync(outPath, 'utf8');
      out = c.length > maxLen ? c.slice(-maxLen) : c;
    }
    if (fs.existsSync(errPath)) {
      const c = fs.readFileSync(errPath, 'utf8');
      err = c.length > maxLen ? c.slice(-maxLen) : c;
    }
    const parts = [];
    if (out) parts.push('=== stdout ===\n' + out);
    if (err) parts.push('=== stderr ===\n' + err);
    const content = parts.length ? parts.join('\n\n') : '(No hay logs aún para este proceso.)';
    res.json({ ok: true, content, path: logDir });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message || String(e) });
  }
});

// API búsqueda: devuelve tareas que coinciden con la consulta
app.get('/api/search', (req, res) => {
  const q = (req.query.q || '').trim();
  const crontabResult = readCrontab();
  const tasks = crontabResult.ok ? parseCrontabLines(crontabResult.content) : [];
  const index = buildSearchIndex(tasks);
  const results = search(index, q, 30);
  res.json({ ok: true, results, total: tasks.length });
});

function startServer(port) {
  const http = require('http');
  const server = http.createServer(app);
  const listenPort = port != null ? port : PORT;
  server.listen(listenPort, () => {
    console.log(`EasyCronTab en http://localhost:${server.address().port}`);
  });
  server.on('error', (err) => {
    console.error('Error al arrancar el servidor:', err.message);
    process.exitCode = 1;
  });
  return server;
}

if (require.main === module) {
  startServer(PORT);
}
module.exports = { app, startServer };
