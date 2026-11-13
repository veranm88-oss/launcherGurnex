const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');
const core = require('./core');

// Фоновая мелодия должна стартовать сразу, без клика пользователя.
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

let win = null;
let game = null;
const tasks = new Map();

function send(channel, payload) {
  if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
}

function createWindow() {
  win = new BrowserWindow({
    width: 1200,
    height: 740,
    minWidth: 1000,
    minHeight: 640,
    frame: false,
    show: false,
    backgroundColor: '#26282d',
    title: 'Gurnex',
    icon: path.join(__dirname, 'build', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.loadFile(path.join(__dirname, 'src', 'index.html'));
  win.once('ready-to-show', () => win.show());
  // Внешние ссылки открываем в браузере, а не в окне лаунчера.
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

ipcMain.on('win:minimize', () => win && win.minimize());
ipcMain.on('win:maximize', () => win && (win.isMaximized() ? win.unmaximize() : win.maximize()));
ipcMain.on('win:close', () => win && win.close());

ipcMain.handle('gx:info', () => ({
  defaultRoot: core.defaultRoot(),
  platform: process.platform,
  version: app.getVersion(),
}));

ipcMain.handle('gx:installed', (_e, root) => core.listInstalled(root || core.defaultRoot()));

// Одна задача на версию: повторный клик присоединяется к уже идущей загрузке.
function runTask(key, version, fn) {
  if (tasks.has(key)) return tasks.get(key);
  const promise = fn((p) => send('gx:progress', { version, ...p })).finally(() => tasks.delete(key));
  tasks.set(key, promise);
  return promise;
}

ipcMain.handle('gx:install', async (_e, { root, version }) => {
  root = root || core.defaultRoot();
  await runTask(`install:${version}`, version, (onProgress) => core.prepare({ root, version, onProgress }));
  return core.listInstalled(root);
});

ipcMain.handle('gx:launch', async (_e, opts) => {
  if (game) throw new Error('Игра уже запущена');
  const root = opts.root || core.defaultRoot();
  const prep = await runTask(`launch:${opts.version}`, opts.version, (onProgress) =>
    core.prepare({
      root,
      version: opts.version,
      fabric: opts.mods.length > 0,
      mods: opts.mods,
      javaPath: opts.javaPath,
      onProgress,
    })
  );

  const run = core.launch(root, prep.gameDir, prep.install, prep.java, opts);
  const startedAt = Date.now();
  game = run.child;
  await new Promise((resolve, reject) => {
    run.child.once('spawn', resolve);
    run.child.once('error', (err) => {
      game = null;
      reject(new Error(`Не удалось запустить Java: ${err.message}`));
    });
  });
  if (opts.hideLauncher && win) win.hide();

  run.child.on('close', (code) => {
    game = null;
    if (win && !win.isVisible()) win.show();
    send('gx:game-exit', { code, seconds: Math.round((Date.now() - startedAt) / 1000), tail: run.tail.slice(-12), logFile: run.logFile });
  });

  return {
    loader: prep.install.loader,
    mods: prep.mods,
    installed: await core.listInstalled(root),
  };
});

ipcMain.handle('gx:pickDir', async (_e, current) => {
  const res = await dialog.showOpenDialog(win, {
    title: 'Папка для Minecraft',
    defaultPath: current || core.defaultRoot(),
    properties: ['openDirectory', 'createDirectory'],
  });
  return res.canceled ? null : res.filePaths[0];
});

ipcMain.handle('gx:open', async (_e, target) => {
  fs.mkdirSync(target, { recursive: true });
  return shell.openPath(target);
});

// Свой трек копируем в данные приложения, чтобы он остался после перезапуска.
ipcMain.handle('gx:saveTrack', async (_e, source) => {
  const dir = path.join(app.getPath('userData'), 'music');
  fs.mkdirSync(dir, { recursive: true });
  for (const f of fs.readdirSync(dir)) fs.rmSync(path.join(dir, f), { force: true });
  const dest = path.join(dir, 'custom' + path.extname(source).toLowerCase());
  fs.copyFileSync(source, dest);
  return pathToFileURL(dest).href;
});

app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());
