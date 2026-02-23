const express = require('express');
const path = require('path');
const config = require('./config');
const { readCrontab, writeCrontab, parseCrontabLines } = require('./lib/crontab');
const { buildSearchIndex, search } = require('./lib/search');
const { cronToHuman, cronToFormOptions, FRECUENCIAS, DIAS_SEMANA } = require('./lib/cronSchedule');
const { getNextRun } = require('./lib/nextRun');
const { commandToDescription } = require('./lib/commandDescribe');
const { getSettings, setReposPath } = require('./lib/settings');
const { listRepos, buildCronCommand } = require('./lib/repos');
const { listDirectory, getBrowseRoot } = require('./lib/browse');

const app = express();
const PORT = config.server.port;

app.use(express.urlencoded({ extended: true }));
app.use(express.json({ limit: '2mb' }));

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));

// Página principal: dashboard con lista de tareas (formulario) y buscador
app.get('/', (req, res) => {
  const crontabResult = readCrontab();
  const tasks = crontabResult.ok ? parseCrontabLines(crontabResult.content) : [];
  const jobs = tasks.map(t => {
    const humanSchedule = cronToHuman(t.schedule);
    const humanCommand = commandToDescription(t.command);
    const { nextRun, nextRunMs } = getNextRun(t.schedule);
    return {
      schedule: t.schedule,
      command: t.command,
      line: t.line,
      humanSchedule,
      humanCommand,
      formOptions: cronToFormOptions(t.schedule),
      nextRun: nextRun || null,
      nextRunMs: nextRunMs != null ? nextRunMs : null
    };
  });
  const settings = getSettings();
  res.render('dashboard', {
    title: 'EasyCronTab',
    crontabError: crontabResult.ok ? null : crontabResult.error,
    jobs,
    FRECUENCIAS,
    DIAS_SEMANA,
    reposPath: settings.reposPath || ''
  });
});

// API jobs: listar (con humanSchedule, formOptions y nextRun)
app.get('/api/jobs', (req, res) => {
  const result = readCrontab();
  if (!result.ok) {
    return res.status(500).json({ ok: false, error: result.error });
  }
  const tasks = parseCrontabLines(result.content);
  const jobs = tasks.map(t => {
    const { nextRun, nextRunMs } = getNextRun(t.schedule);
    return {
      schedule: t.schedule,
      command: t.command,
      humanSchedule: cronToHuman(t.schedule),
      humanCommand: commandToDescription(t.command),
      formOptions: cronToFormOptions(t.schedule),
      nextRun: nextRun || null,
      nextRunMs: nextRunMs != null ? nextRunMs : null
    };
  });
  res.json({ ok: true, jobs });
});

// API jobs: guardar (reemplaza todo el crontab con la lista enviada)
app.post('/api/jobs', (req, res) => {
  const jobs = Array.isArray(req.body.jobs) ? req.body.jobs : [];
  const lines = jobs
    .filter(j => j && (j.schedule || j.command))
    .map(j => (j.schedule ? j.schedule.trim() + ' ' + (j.command || '').trim() : (j.command || '').trim()).trim())
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
