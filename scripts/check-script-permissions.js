#!/usr/bin/env node
/**
 * Comprueba qué scripts referenciados en el crontab no tienen permiso de ejecución.
 * Uso: node scripts/check-script-permissions.js
 */
const path = require('path');
const fs = require('fs');
const { readCrontab, parseCrontabLines } = require('../lib/crontab');

function getRawCommand(command) {
  return (command || '').replace(/\s*>>\s*[^\s]+\s+2>&1\s*$/, '').trim();
}

const result = readCrontab();
if (!result.ok) {
  console.error('No se pudo leer el crontab:', result.error);
  process.exit(1);
}

const tasks = parseCrontabLines(result.content);
const noExec = [];
const checked = new Set();

for (const task of tasks) {
  const cmd = getRawCommand(task.command);
  const cdMatch = cmd.match(/cd\s+(\/[^\s&'"]+)/);
  const scriptMatch = cmd.match(/\.\/([^\s&'"]+)/);
  if (!cdMatch || !scriptMatch) continue;

  const cwd = cdMatch[1].trim();
  const scriptRel = scriptMatch[1].trim();
  const fullPath = path.join(cwd, scriptRel);

  if (checked.has(fullPath)) continue;
  checked.add(fullPath);

  if (!fs.existsSync(fullPath)) {
    noExec.push({ path: fullPath, reason: 'no existe' });
    continue;
  }
  try {
    fs.accessSync(fullPath, fs.constants.X_OK);
  } catch (_) {
    noExec.push({ path: fullPath, reason: 'sin permiso de ejecución' });
  }
}

if (noExec.length === 0) {
  console.log('Todos los scripts referenciados en el crontab tienen permiso de ejecución (o no se encontraron scripts ./...).');
  process.exit(0);
}

console.log('Scripts que pueden dar "Permission denied":\n');
noExec.forEach(({ path: p, reason }) => console.log('  -', p, `(${reason})`));
console.log('\nPara dar permiso de ejecución: chmod +x <ruta>');
process.exit(1);
