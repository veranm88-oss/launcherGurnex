// Точка входа ядра: подготовка версии (Java, файлы, Fabric, моды) и запуск.
const os = require('os');
const path = require('path');
const { installVersion, listInstalled, getManifest } = require('./install');
const { ensureJava } = require('./java');
const { syncMods } = require('./mods');
const { launch } = require('./launch');

const STAGES = {
  meta: ['Данные версии', 3],
  libraries: ['Библиотеки', 17],
  assets: ['Ресурсы игры', 45],
  java: ['Java', 20],
  mods: ['Моды', 15],
};

function defaultRoot() {
  if (process.platform === 'win32') return path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), '.gurnex');
  if (process.platform === 'darwin') return path.join(os.homedir(), 'Library', 'Application Support', 'gurnex');
  return path.join(os.homedir(), '.gurnex');
}

function progressTracker(keys, emit) {
  const total = keys.reduce((s, k) => s + STAGES[k][1], 0);
  const fraction = {};
  let last = 0;
  return (key, value, detail) => {
    fraction[key] = Math.max(0, Math.min(1, value));
    const now = Date.now();
    if (now - last < 120 && value > 0 && value < 1) return;
    last = now;
    const percent = (keys.reduce((s, k) => s + (fraction[k] || 0) * STAGES[k][1], 0) / total) * 100;
    emit({
      stage: STAGES[key][0],
      percent,
      bytes: detail && detail.total ? { done: detail.done, total: detail.total } : null,
    });
  };
}

// syncModsList: null — не трогать моды (просто скачивание), массив — поставить ровно эти моды.
async function prepare({ root, version, fabric = false, mods = null, javaPath = '', onProgress = () => {} }) {
  const gameDir = root;
  const keys = ['meta', 'libraries', 'assets', 'java', ...(mods ? ['mods'] : [])];
  const step = progressTracker(keys, onProgress);

  const install = await installVersion(root, gameDir, version, { fabric, step });
  const java = javaPath || (await ensureJava(root, install.javaComponent, (p) => step('java', p.total ? p.done / p.total : 1, p)));
  step('java', 1);

  let modsResult = null;
  if (mods) {
    const list = install.loader === 'fabric' ? mods : [];
    modsResult = await syncMods(root, gameDir, list, version, (p) => step('mods', p.total ? p.done / p.total : 1, p));
    step('mods', 1);
  }
  return { install, java, gameDir, mods: modsResult };
}

module.exports = { defaultRoot, prepare, launch, listInstalled, getManifest };
