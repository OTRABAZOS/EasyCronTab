// Tests sin riesgo: nunca tocan el crontab real (usan test/fixtures/fake-crontab.sh y carpetas temporales).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'easycrontab-test-'));
process.env.EASYCRONTAB_CRONTAB_BIN = path.join(__dirname, 'fixtures', 'fake-crontab.sh');
process.env.FAKE_CRONTAB_FILE = path.join(tmp, 'crontab.txt');
process.env.EASYCRONTAB_BACKUPS_DIR = path.join(tmp, 'backups');

const { parseCrontabLines, parseCrontabDocument, readCrontab, crontabHash } = require('../lib/crontab');
const { buildCrontabContent, saveJobs, restoreContent, describeCommand } = require('../lib/saveCrontab');
const backups = require('../lib/backups');
const { cronToHuman, cronToFormOptions } = require('../lib/cronSchedule');

const LOGS = '/var/tmp/ecl';

const SAMPLE = [
  'SHELL=/bin/bash',
  'PATH=/usr/local/bin:/usr/bin:/bin',
  'MAILTO=""',
  '',
  '# --- Argos ---',
  '# título: Repaso horario',
  '13 8-22 * * * cd /srv/argos && claude -p "$(cat repaso.txt)"  --flag >> /logs/repaso.log 2>&1',
  '# título: Vigía de WhatsApp',
  '*/5 * * * * /usr/bin/python3 /srv/argos/vigia_whatsapp.py >> /logs/vigia.log 2>&1',
  '8 8-22 * * * /srv/argos/sync_memoria.sh',
  '# comentario suelto que no es título',
  '',
  '# 0 3 * * * tarea desactivada',
  '0 19 * * * /srv/argos/aviso_gerard.py vispera --enviar > /dev/null',
  ''
].join('\n');

/** Lo que manda la interfaz si no se toca nada (igual que taskToJob en app.js). */
function asLoaded(content) {
  return parseCrontabLines(content).map(t => {
    const d = describeCommand(t.command);
    return { origLine: t.line, title: t.title, schedule: t.schedule, command: d.rawCommand, useXvfb: d.useXvfb };
  });
}

test('parseCrontabLines: títulos, entorno y comandos exactos', () => {
  const tasks = parseCrontabLines(SAMPLE);
  assert.equal(tasks.length, 4);
  assert.equal(tasks[0].title, 'Repaso horario');
  assert.equal(tasks[0].schedule, '13 8-22 * * *');
  assert.ok(tasks[0].command.includes('"$(cat repaso.txt)"  --flag'), 'no colapsa espacios del comando');
  assert.equal(tasks[1].title, 'Vigía de WhatsApp');
  assert.equal(tasks[2].title, '', 'un título solo vale para la tarea inmediatamente debajo');
  assert.equal(tasks[3].title, '');
  const kinds = parseCrontabDocument(SAMPLE).map(i => i.kind);
  assert.equal(kinds.filter(k => k === 'title').length, 2);
});

test('parseCrontabLines: variable de entorno con espacios no es una tarea', () => {
  assert.equal(parseCrontabLines('FOO=a b c d e f g\n').length, 0);
  assert.equal(parseCrontabLines('# título: huérfano\n\n0 1 * * * x\n')[0].title, '');
});

test('guardar sin cambios devuelve el crontab idéntico (byte a byte)', () => {
  const r = buildCrontabContent(SAMPLE, asLoaded(SAMPLE), LOGS);
  assert.ok(r.ok, r.error);
  assert.equal(r.content, SAMPLE);
  assert.equal(r.stats.kept, 4);
});

test('no añade log a tareas existentes (sync_memoria.sh, > /dev/null)', () => {
  const r = buildCrontabContent(SAMPLE, asLoaded(SAMPLE), LOGS);
  assert.ok(r.content.includes('\n8 8-22 * * * /srv/argos/sync_memoria.sh\n'));
  assert.ok(r.content.includes('--enviar > /dev/null\n'));
  assert.ok(!r.content.includes(LOGS));
});

test('editar una tarea conserva entorno, comentarios, su log y el resto de líneas', () => {
  const jobs = asLoaded(SAMPLE);
  jobs[1].schedule = '*/10 * * * *';
  jobs[1].title = 'Vigía WhatsApp (cada 10)';
  const r = buildCrontabContent(SAMPLE, jobs, LOGS);
  assert.ok(r.ok, r.error);
  const lines = r.content.split('\n');
  assert.deepEqual(lines.slice(0, 5), SAMPLE.split('\n').slice(0, 5));
  assert.ok(r.content.includes('# título: Vigía WhatsApp (cada 10)\n*/10 * * * * /usr/bin/python3 /srv/argos/vigia_whatsapp.py >> /logs/vigia.log 2>&1\n'));
  assert.ok(!r.content.includes('# título: Vigía de WhatsApp'));
  assert.ok(r.content.includes('# 0 3 * * * tarea desactivada'));
  assert.equal(r.stats.edited, 1);
  assert.equal(r.stats.kept, 3);
});

test('cambiar solo el título no toca la línea de la tarea', () => {
  const jobs = asLoaded(SAMPLE);
  jobs[2].title = 'Sincronizar memoria';
  const r = buildCrontabContent(SAMPLE, jobs, LOGS);
  assert.ok(r.content.includes('# título: Sincronizar memoria\n8 8-22 * * * /srv/argos/sync_memoria.sh\n'));
  assert.equal(r.stats.kept, 4);
});

test('eliminar una tarea quita también su título y nada más', () => {
  const jobs = asLoaded(SAMPLE).filter(j => !j.command.includes('vigia'));
  const r = buildCrontabContent(SAMPLE, jobs, LOGS);
  assert.ok(!r.content.includes('vigia'));
  assert.ok(!r.content.includes('Vigía'));
  assert.equal(r.content.split('\n').length, SAMPLE.split('\n').length - 2);
  assert.equal(r.stats.deleted, 1);
});

test('tarea nueva: título + log solo si no tiene redirección', () => {
  const jobs = asLoaded(SAMPLE);
  jobs.push({ title: 'Aviso nuevo', schedule: '0 9 * * 1-5', command: '/srv/aviso.sh' });
  jobs.push({ title: '', schedule: '0 10 * * *', command: '/srv/otro.sh > /tmp/otro.log 2>&1' });
  const r = buildCrontabContent(SAMPLE, jobs, LOGS);
  assert.ok(r.ok, r.error);
  assert.match(r.content, /# título: Aviso nuevo\n0 9 \* \* 1-5 \/srv\/aviso\.sh >> \/var\/tmp\/ecl\/[0-9a-f]{12}\.log 2>&1\n/);
  assert.ok(r.content.endsWith('0 10 * * * /srv/otro.sh > /tmp/otro.log 2>&1\n'));
  assert.ok(r.content.startsWith(SAMPLE));
});

test('rechaza saltos de línea y frecuencias inválidas', () => {
  const bad1 = buildCrontabContent('', [{ schedule: '* * * * *', command: 'a\n* * * * * rm -rf ~' }], LOGS);
  assert.equal(bad1.ok, false);
  const bad2 = buildCrontabContent('', [{ schedule: '* * *', command: 'x' }], LOGS);
  assert.equal(bad2.ok, false);
});

test('tareas duplicadas se conservan las dos', () => {
  const dup = '0 1 * * * /x.sh\n0 1 * * * /x.sh\n';
  const r = buildCrontabContent(dup, asLoaded(dup), LOGS);
  assert.equal(r.content, dup);
});

test('xvfb: editar conserva el envoltorio y el log', () => {
  const content = "0 2 * * * xvfb-run -a sh -c 'cd /a && npm start' >> /logs/a.log 2>&1\n";
  const jobs = asLoaded(content);
  assert.equal(jobs[0].useXvfb, true);
  assert.equal(jobs[0].command, 'cd /a && npm start');
  jobs[0].schedule = '0 3 * * *';
  const r = buildCrontabContent(content, jobs, LOGS);
  assert.equal(r.content, "0 3 * * * xvfb-run -a sh -c 'cd /a && npm start' >> /logs/a.log 2>&1\n");
});

function resetFake(content) {
  fs.rmSync(process.env.EASYCRONTAB_BACKUPS_DIR, { recursive: true, force: true });
  if (content == null) fs.rmSync(process.env.FAKE_CRONTAB_FILE, { force: true });
  else fs.writeFileSync(process.env.FAKE_CRONTAB_FILE, content);
}

test('saveJobs: copia antes de guardar, con el contenido anterior', () => {
  resetFake(SAMPLE);
  const jobs = asLoaded(SAMPLE).slice(1);
  const r = saveJobs({ jobs, baseHash: crontabHash(SAMPLE), logsDir: LOGS });
  assert.ok(r.ok, r.error);
  assert.match(r.backup, /^crontab_\d{8}-\d{6}\.txt$/);
  const saved = backups.readBackup(r.backup);
  assert.equal(saved.content, SAMPLE);
  assert.ok(!readCrontab().content.includes('repaso'));
  assert.ok(readCrontab().content.startsWith('SHELL=/bin/bash\n'));
});

test('saveJobs: si el crontab cambió desde que se cargó, no guarda (409)', () => {
  resetFake(SAMPLE);
  const r = saveJobs({ jobs: [], baseHash: crontabHash('otro contenido'), logsDir: LOGS });
  assert.equal(r.ok, false);
  assert.equal(r.status, 409);
  assert.equal(readCrontab().content, SAMPLE);
  const r2 = saveJobs({ jobs: [], logsDir: LOGS });
  assert.equal(r2.status, 409, 'sin baseHash tampoco guarda');
});

test('saveJobs: si la copia falla, no se guarda nada', () => {
  resetFake(SAMPLE);
  const prev = process.env.EASYCRONTAB_BACKUPS_DIR;
  const blocker = path.join(tmp, 'soy-un-fichero');
  fs.writeFileSync(blocker, 'x');
  process.env.EASYCRONTAB_BACKUPS_DIR = path.join(blocker, 'backups');
  try {
    const r = saveJobs({ jobs: [], baseHash: crontabHash(SAMPLE), logsDir: LOGS });
    assert.equal(r.ok, false);
    assert.match(r.error, /No se ha guardado nada/);
    assert.equal(readCrontab().content, SAMPLE);
  } finally {
    process.env.EASYCRONTAB_BACKUPS_DIR = prev;
  }
});

test('saveJobs funciona sin crontab previo', () => {
  resetFake(null);
  assert.deepEqual(readCrontab(), { ok: true, content: '' });
  const r = saveJobs({ jobs: [{ title: 'Hola', schedule: '0 1 * * *', command: '/x.sh > /dev/null' }], baseHash: crontabHash(''), logsDir: LOGS });
  assert.ok(r.ok, r.error);
  assert.equal(readCrontab().content, '# título: Hola\n0 1 * * * /x.sh > /dev/null\n');
});

test('backups: reutiliza la última si es igual y conserva solo 30', () => {
  resetFake(SAMPLE);
  const a = backups.createBackup('uno');
  const b = backups.createBackup('uno');
  assert.equal(b.reused, true);
  assert.equal(a.name, b.name);
  for (let i = 0; i < 35; i++) assert.ok(backups.createBackup('v' + i).ok);
  const list = backups.listBackups();
  assert.equal(list.length, backups.MAX_BACKUPS);
  assert.equal(backups.readBackup(list[0].name).content, 'v34', 'la primera de la lista es la más reciente');
  assert.equal(backups.readBackup('../../etc/passwd').ok, false);
});

test('restaurar: copia el actual y escribe la copia', () => {
  resetFake('0 1 * * * /viejo.sh\n');
  const old = backups.createBackup(readCrontab().content);
  fs.writeFileSync(process.env.FAKE_CRONTAB_FILE, '0 2 * * * /nuevo.sh\n');
  const r = restoreContent(backups.readBackup(old.name).content);
  assert.ok(r.ok, r.error);
  assert.equal(readCrontab().content, '0 1 * * * /viejo.sh\n');
  assert.equal(backups.readBackup(r.backup).content, '0 2 * * * /nuevo.sh\n');
});

test('cronToHuman: rangos, listas y pasos', () => {
  const cases = {
    '31 7 * * 1-5': 'Lunes a viernes a las 07:31',
    '13 8-22 * * *': 'Cada hora de 08:13 a 22:13',
    '*/5 * * * *': 'Cada 5 minutos',
    '0 19 * * *': 'Diario a las 19:00',
    '0 13 * * 1,3,5': 'Lunes, miércoles y viernes a las 13:00',
    '0 9,13,19 * * *': 'Diario a las 09:00, 13:00 y 19:00',
    '0 9 * * 1': 'Cada lunes a las 09:00',
    '0 0 * * 6,0': 'Sábados y domingos a las 00:00',
    '0 2 1,15 * *': 'Los días 1 y 15 de cada mes a las 02:00',
    '*/5 8-22 * * 1-5': 'Cada 5 minutos entre las 08:00 y las 22:59, lunes a viernes',
    '0 */2 * * *': 'Cada 2 horas',
    '0 8-20/2 * * *': 'Cada 2 horas de 08:00 a 20:00',
    '0 * * * *': 'Cada hora',
    '@reboot': 'Cada vez que se inicia el sistema'
  };
  for (const [expr, human] of Object.entries(cases)) assert.equal(cronToHuman(expr), human, expr);
});

test('cronToFormOptions: rangos y listas se editan como expresión, sin cambiarlos', () => {
  assert.deepEqual(cronToFormOptions('13 8-22 * * *'), { frequency: 'custom', customExpression: '13 8-22 * * *' });
  assert.deepEqual(cronToFormOptions('31 7 * * 1-5'), { frequency: 'custom', customExpression: '31 7 * * 1-5' });
  assert.equal(cronToFormOptions('0 19 * * *').frequency, 'daily');
  assert.equal(cronToFormOptions('*/5 * * * *').frequency, 'every_n_minutes');
  assert.equal(cronToFormOptions('0 9 * * 1').frequency, 'weekly');
});

test.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
