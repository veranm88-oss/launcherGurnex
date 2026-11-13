const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');

// Фоновая мелодия должна стартовать сразу, без клика пользователя.
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 740,
    minWidth: 1000,
    minHeight: 640,
    frame: false,
    show: false,
    backgroundColor: '#f3f4f6',
    title: 'Gurnex',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.loadFile(path.join(__dirname, 'src', 'index.html'));
  win.once('ready-to-show', () => win.show());

  ipcMain.on('win:minimize', () => win.minimize());
  ipcMain.on('win:maximize', () => (win.isMaximized() ? win.unmaximize() : win.maximize()));
  ipcMain.on('win:close', () => win.close());
}

app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());
