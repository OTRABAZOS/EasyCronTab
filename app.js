const express = require('express');
const path = require('path');
const config = require('./config');
const { readCrontab, writeCrontab, parseCrontabLines } = require('./lib/crontab');
const { buildSearchIndex, search } = require('./lib/search');
const { cronToHuman, cronToFormOptions, FRECUENCIAS, DIAS_SEMANA } = require('./lib/cronSchedule');
const { getNextRun } = require('./lib/nextRun');
const { commandToDescription } = require('./lib/commandDescribe');

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
  res.render('dashboard', {
    title: 'EasyCronTab',
    crontabError: crontabResult.ok ? null : crontabResult.error,
    jobs,
    FRECUENCIAS,
    DIAS_SEMANA
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

// API búsqueda: devuelve tareas que coinciden con la consulta
app.get('/api/search', (req, res) => {
  const q = (req.query.q || '').trim();
  const crontabResult = readCrontab();
  const tasks = crontabResult.ok ? parseCrontabLines(crontabResult.content) : [];
  const index = buildSearchIndex(tasks);
  const results = search(index, q, 30);
  res.json({ ok: true, results, total: tasks.length });
});

const server = app.listen(PORT, () => {
  console.log(`EasyCronTab en http://localhost:${PORT}`);
});

server.on('error', (err) => {
  console.error('Error al arrancar el servidor:', err.message);
  process.exitCode = 1;
});
