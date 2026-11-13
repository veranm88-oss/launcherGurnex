// Java из официальных сборок Mojang (та же Java, что ставит обычный лаунчер).
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const { fetchJson, downloadAll } = require('./net');
const { javaPlatformKeys } = require('./platform');

const RUNTIMES_URL =
  'https://launchermeta.mojang.com/v1/products/java-runtime/2ec0cc96c44e5a76b9c8b7c39df7210883d12871/all.json';

function javaBinary(dir) {
  if (process.platform === 'win32') return path.join(dir, 'bin', 'javaw.exe');
  if (process.platform === 'darwin') return path.join(dir, 'jre.bundle', 'Contents', 'Home', 'bin', 'java');
  return path.join(dir, 'bin', 'java');
}

async function exists(p) {
  try {
    await fsp.access(p);
    return true;
  } catch {
    return false;
  }
}

async function ensureJava(root, component = 'jre-legacy', onProgress) {
  const dir = path.join(root, 'runtime', component);
  const marker = path.join(dir, '.gurnex-version');
  const bin = javaBinary(dir);

  let all;
  try {
    all = await fetchJson(RUNTIMES_URL);
  } catch (err) {
    if (await exists(bin)) return bin; // офлайн, но Java уже есть
    throw err;
  }

  let entry = null;
  for (const key of javaPlatformKeys()) {
    entry = all[key] && all[key][component] && all[key][component][0];
    if (entry) break;
  }
  if (!entry) throw new Error(`Java (${component}) недоступна для этой системы`);

  const stamp = `${entry.version.name}:${entry.manifest.sha1}`;
  if ((await exists(bin)) && (await fsp.readFile(marker, 'utf8').catch(() => '')) === stamp) return bin;

  const manifest = await fetchJson(entry.manifest.url);
  const files = [];
  const executables = [];
  const links = [];
  for (const [rel, info] of Object.entries(manifest.files)) {
    const target = path.join(dir, rel);
    if (info.type === 'directory') await fsp.mkdir(target, { recursive: true });
    else if (info.type === 'link') links.push([target, info.target]);
    else if (info.type === 'file') {
      const raw = info.downloads.raw;
      files.push({ url: raw.url, path: target, sha1: raw.sha1, size: raw.size });
      if (info.executable) executables.push(target);
    }
  }

  await downloadAll(files, onProgress);

  if (process.platform !== 'win32') {
    for (const file of executables) await fsp.chmod(file, 0o755);
    for (const [link, target] of links) {
      await fsp.rm(link, { force: true });
      await fsp.mkdir(path.dirname(link), { recursive: true });
      await fsp.symlink(target, link).catch(() => {});
    }
  }
  await fsp.writeFile(marker, stamp);
  return bin;
}

module.exports = { ensureJava };
