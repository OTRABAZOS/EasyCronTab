const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');

const DEBUG_LOG = '/home/mazingerzot/Documentos/DEV/EasyCronTab/.cursor/debug-dfee4a.log';
function _log(location, message, data, hypothesisId) {
  const line = JSON.stringify({ sessionId: 'dfee4a', location, message, data: data || {}, hypothesisId, timestamp: Date.now() }) + '\n';
  try { fs.appendFileSync(DEBUG_LOG, line); } catch (_) {}
}

// Configuración y datos en carpeta de usuario (igual en desarrollo y app instalada)
process.env.EASYCRONTAB_USER_DATA = app.getPath('userData');

let mainWindow = null;
let server = null;

function createWindow(port) {
  // #region agent log
  _log('electron-main.js:createWindow', 'opening window', { port }, 'E');
  // #endregion
  mainWindow = new BrowserWindow({
    width: 1000,
    height: 780,
    minWidth: 700,
    minHeight: 500,
    title: 'EasyCronTab',
    icon: app.isPackaged
      ? path.join(process.resourcesPath, 'icon.png')
      : path.join(__dirname, 'build', 'icon.png'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  const url = `http://127.0.0.1:${port}`;
  // #region agent log
  _log('electron-main.js:createWindow', 'loadURL', { url, port }, 'E');
  // #endregion
  mainWindow.loadURL(url);
  // Atajo Ctrl+Shift+I para abrir/cerrar DevTools (inspeccionar)
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.control && input.shift && input.key.toLowerCase() === 'i') {
      mainWindow.webContents.toggleDevTools();
      event.preventDefault();
    }
  });
  mainWindow.on('closed', () => {
    mainWindow = null;
    if (server) {
      server.close();
      server = null;
    }
    app.quit();
  });
}

app.whenReady().then(() => {
  // #region agent log
  _log('electron-main.js:whenReady', 'app ready', { userData: process.env.EASYCRONTAB_USER_DATA }, 'A');
  // #endregion
  let startServer;
  try {
    const appModule = require('./app');
    startServer = appModule.startServer;
    // #region agent log
    _log('electron-main.js:whenReady', 'require(app) ok', {}, 'D');
    // #endregion
  } catch (e) {
    // #region agent log
    _log('electron-main.js:whenReady', 'require(app) failed', { error: e.message, code: e.code }, 'D');
    // #endregion
    throw e;
  }
  server = startServer(0);
  // #region agent log
  _log('electron-main.js:whenReady', 'startServer(0) called', { hasServer: !!server }, 'A');
  // #endregion
  server.on('listening', () => {
    const port = server.address().port;
    // #region agent log
    _log('electron-main.js:listening', 'server listening', { port }, 'B');
    // #endregion
    createWindow(port);
  });
  server.on('error', (err) => {
    // #region agent log
    _log('electron-main.js:server', 'server error', { error: err.message }, 'A');
    // #endregion
  });
});

app.on('window-all-closed', () => {
  if (server) {
    server.close();
    server = null;
  }
  app.quit();
});
