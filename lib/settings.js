const fs = require('fs');
const path = require('path');

const DATA_DIR = process.env.EASYCRONTAB_USER_DATA || path.join(__dirname, '..', 'data');
const SETTINGS_DIR = DATA_DIR;
const SETTINGS_FILE = path.join(SETTINGS_DIR, 'settings.json');

// #region agent log
function _debugLog(location, message, data, hypothesisId) {
  const payload = JSON.stringify({ sessionId: 'dfee4a', location, message, data: data || {}, hypothesisId, timestamp: Date.now() }) + '\n';
  try { fs.appendFileSync('/home/mazingerzot/Documentos/DEV/EasyCronTab/.cursor/debug-dfee4a.log', payload); } catch (_) {}
}
// #endregion

const DEFAULTS = {
  reposPath: process.env.REPOS_PATH || ''
};

function ensureDir(dir) {
  try {
    fs.mkdirSync(dir, { recursive: true });
  } catch (e) {
    // ignore if exists
  }
}

function getSettings() {
  try {
    const raw = fs.readFileSync(SETTINGS_FILE, 'utf8');
    const data = JSON.parse(raw);
    // #region agent log
    _debugLog('settings.js:getSettings', 'read ok', { settingsPath: SETTINGS_FILE, reposPath: (data && data.reposPath) || '' }, 'B');
    // #endregion
    return { ...DEFAULTS, ...data };
  } catch (e) {
    // #region agent log
    _debugLog('settings.js:getSettings', 'read error', { settingsPath: SETTINGS_FILE, error: e.message, code: e.code }, 'C');
    // #endregion
    return { ...DEFAULTS };
  }
}

function setSettings(updates) {
  ensureDir(SETTINGS_DIR);
  const current = getSettings();
  const next = { ...current, ...updates };
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(next, null, 2), 'utf8');
  return next;
}

module.exports = {
  getSettings,
  setSettings,
  getReposPath: () => getSettings().reposPath,
  setReposPath: (reposPath) => {
    const p = typeof reposPath === 'string' ? reposPath.trim() : '';
    // #region agent log
    _debugLog('settings.js:setReposPath', 'write', { settingsPath: SETTINGS_FILE, reposPath: p, len: p.length }, 'A');
    // #endregion
    setSettings({ reposPath: p });
    return p;
  }
};
