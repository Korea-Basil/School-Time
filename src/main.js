const { app, BrowserWindow, ipcMain, session } = require('electron');
const path = require('node:path');
const { ComciganProvider } = require('./services/comcigan-provider');

const provider = new ComciganProvider();

function createWindow() {
  const window = new BrowserWindow({
    width: 1040,
    height: 760,
    minWidth: 760,
    minHeight: 580,
    backgroundColor: '#f8fafc',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true
    }
  });
  window.removeMenu();
  window.loadFile(path.join(__dirname, 'renderer', 'index.html'));
}

app.whenReady().then(() => {
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({ responseHeaders: { ...details.responseHeaders, 'Content-Security-Policy': ["default-src 'self'; style-src 'self'; script-src 'self'; img-src 'self' data:"] } });
  });

  ipcMain.handle('schooltime:search-schools', (_event, query) => provider.searchSchools(query));
  ipcMain.handle('schooltime:get-timetable', (_event, selection) => provider.getTimetable(selection));
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
