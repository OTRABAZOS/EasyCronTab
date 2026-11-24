const fs = require('fs');
const { spawn } = require('child_process');
const express = require('express');
const path = require('path');
const session = require('express-session');
const MySQLStore = require('express-mysql-session')(session);
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
require('dotenv').config();
const config = require('./config');
const { readCrontab, parseCrontabLines, crontabHash } = require('./lib/crontab');
const { getRawCommandForLog, getLogPath: getLogPathIn, describeCommand, saveJobs, restoreContent } = require('./lib/saveCrontab');
const backups = require('./lib/backups');
const { buildSearchIndex, search } = require('./lib/search');
const { cronToHuman, cronToFormOptions, FRECUENCIAS, DIAS_SEMANA } = require('./lib/cronSchedule');
const { getNextRun, getRunsForDay } = require('./lib/nextRun');
const { commandToDescription } = require('./lib/commandDescribe');
const { getSettings, setReposPath, getLogsPath } = require('./lib/settings');
const { listRepos, buildCronCommand } = require('./lib/repos');
const { listDirectory, getBrowseRoot } = require('./lib/browse');
const pm2 = require('./lib/pm2');
const { wrapXvfb } = require('./lib/xvfb');
const { findUser, hasAccess, requireAuth } = require('./lib/auth');

const pkg = require('./package.json');
const appVersion = pkg.version || '0.0.0';
const appDescription = pkg.description || '';
const appRepo = 'https://github.com/OTRABAZOS/EasyCronTab';

const app = express();
const PORT = config.server.port;

// Seguridad
app.use(helmet({ contentSecurityPolicy: false }));
app.set('trust proxy', 1);

// Sesiones con MySQL store
const sessionStore = new MySQLStore({
  host: process.env.AUTH_DB_HOST || 'db1.bwai.cc',
  user: process.env.AUTH_DB_USER,
  password: process.env.AUTH_DB_PASSWORD,
  database: process.env.AUTH_DB_NAME || 'brandwaiapp',
  createDatabaseTable: true,
  schema: { tableName: 'sessions_easycrontab' },
  expiration: 8 * 60 * 60 * 1000, // 8 horas
  checkExpirationInterval: 15 * 60 * 1000,
});

app.use(session({
  secret: process.env.SESSION_SECRET,
  store: sessionStore,
  resave: false,
  saveUninitialized: false,
  rolling: true,
  cookie: {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    maxAge: 8 * 60 * 60 * 1000,
  },
}));

// Rate limit en login: 10 intentos / 15 min
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: 'Demasiados intentos. Espera 15 minutos.',
});

app.use(express.urlencoded({ extended: true }));
app.use(express.json({ limit: '2mb' }));

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));
// lib/cronSchedule.js también se usa en el navegador (cronToHuman al editar una tarea)
const cronScheduleSource = fs.readFileSync(path.join(__dirname, 'lib', 'cronSchedule.js'), 'utf8');
app.get('/js/cronSchedule.js', (req, res) => {
  res.type('application/javascript').send('(function () { var module;\n' + cronScheduleSource + '\n})();\n');
});

// Login routes
app.get('/login', (req, res) => {
  if (req.session.user) return res.redirect('/');
  res.render('login', { error: null });
});

app.post('/login', loginLimiter, async (req, res) => {
  const { email, password } = req.body;
  try {
    const user = await findUser(email, password);
    if (!user || !hasAccess(user.role)) {
      return res.render('login', { error: 'Credenciales incorrectas o sin acceso.' });
    }
    req.session.regenerate((err) => {
      if (err) return res.render('login', { error: 'Error de sesión.' });
      req.session.user = { email: user.email, role: user.role };
      res.redirect('/');
    });
  } catch (e) {
    console.error('Auth error:', e.message);
    res.render('login', { error: 'Error interno. Inténtalo de nuevo.' });
  }
});

app.post('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/login'));
});

// Normaliza tarea del crontab a job con comando "raw" y flag useXvfb
function taskToJob(t) {
  const { rawCommand, useXvfb, effective } = describeCommand(t.command);
  const logPath = getLogPath(t.schedule, t.command);
  const { nextRun, nextRunMs } = getNextRun(t.schedule);
  return {
    title: t.title || '',
    schedule: t.schedule,
    command: rawCommand,
    useXvfb: !!useXvfb,
    line: t.line,
    origLine: t.line,
    humanSchedule: cronToHuman(t.schedule),
    humanCommand: commandToDescription(rawCommand),
    formOptions: cronToFormOptions(t.schedule),
    nextRun: nextRun || null,
    nextRunMs: nextRunMs != null ? nextRunMs : null,
    logStatus: getLogStatus(logPath),
    logPath,
    effectiveCommand: effective
  };
}

// Todas las rutas siguientes requieren autenticación
app.use(requireAuth);

// Página principal: dashboard con lista de tareas (formulario) y buscador
app.get('/', (req, res) => {
  const crontabResult = readCrontab();
  const tasks = crontabResult.ok ? parseCrontabLines(crontabResult.content) : [];
  const jobs = tasks.map(taskToJob);
  const settings = getSettings();
  res.render('dashboard', {
    title: 'EasyCronTab',
    crontabError: crontabResult.ok ? null : crontabResult.error,
    jobs,
    crontabHash: crontabResult.ok ? crontabHash(crontabResult.content) : '',
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
  const jobs = tasks.map(taskToJob);
  res.json({ ok: true, jobs, crontabHash: crontabHash(result.content) });
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

function getLogPath(schedule, command) {
  return getLogPathIn(schedule, command, getLogsPath());
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
    if (/\b(?<!no\s+)(error|errore)s?\b(?!\s*[:=]*\s*0)|failed|exception|fail\s|EADDRINUSE|ECONNREFUSED|ENOENT|exit\s+code\s+[1-9]|SyntaxError|ReferenceError/i.test(tail)) return 'failed';
    return 'ok';
  } catch (e) {
    return 'unknown';
  }
}

// API jobs: guardar. Hace copia antes, conserva comentarios/entorno y no toca las tareas sin cambios.
// body: { jobs: [{ origLine?, title?, schedule, command, useXvfb? }], baseHash }
app.post('/api/jobs', (req, res) => {
  const jobs = Array.isArray(req.body.jobs) ? req.body.jobs : [];
  const logsDir = getLogsPath();
  try {
    fs.mkdirSync(logsDir, { recursive: true });
  } catch (e) {
    return res.status(500).json({ ok: false, error: 'No se pudo crear la carpeta de logs: ' + (e.message || e.code) });
  }
  const result = saveJobs({ jobs, baseHash: req.body.baseHash, logsDir });
  if (!result.ok) return res.status(result.status || 500).json(result);
  res.json(result);
});

// API copias: hacer copia del crontab actual (paso «Preparando copia…» de la interfaz)
app.post('/api/backups', (req, res) => {
  const current = readCrontab();
  if (!current.ok) return res.status(500).json({ ok: false, error: 'No se pudo leer el crontab: ' + current.error });
  const result = backups.createBackup(current.content);
  if (!result.ok) return res.status(500).json(result);
  res.json(result);
});

// API copias: listar
app.get('/api/backups', (req, res) => {
  res.json({ ok: true, dir: backups.getBackupsDir(), max: backups.MAX_BACKUPS, backups: backups.listBackups() });
});

// API copias: ver contenido de una copia
app.get('/api/backups/:name', (req, res) => {
  const result = backups.readBackup(req.params.name);
  if (!result.ok) return res.status(404).json(result);
  res.json(result);
});

// API copias: restaurar (antes hace copia del crontab actual)
app.post('/api/backups/restore', (req, res) => {
  const name = req.body && req.body.name;
  const b = backups.readBackup(name);
  if (!b.ok) return res.status(400).json(b);
  const result = restoreContent(b.content);
  if (!result.ok) return res.status(result.status || 500).json(result);
  res.json({ ...result, restored: name });
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
  try { fs.appendFileSync('/home/mazingerzot/Documentos/DEV/EasyCronTab/.cursor/debug-dfee4a.log', pl); } catch (_) { }
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
  try { fs.appendFileSync('/home/mazingerzot/Documentos/DEV/EasyCronTab/.cursor/debug-dfee4a.log', pl); } catch (_) { }
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
  server.listen(listenPort, process.env.HOST || '127.0.0.1', () => {
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
