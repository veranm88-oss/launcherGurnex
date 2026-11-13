// Сеть: JSON-запросы и загрузка файлов с проверкой SHA-1, повторами и параллельностью.
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const crypto = require('crypto');
const { Readable, Transform } = require('stream');
const { pipeline } = require('stream/promises');

const USER_AGENT = 'Gurnex-Launcher/0.2.0 (github.com/veranm88-oss/launcherGurnex)';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function request(url, tries = 4) {
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
      if (!res.ok) {
        const err = new Error(`HTTP ${res.status}: ${url}`);
        // 4xx (кроме 429) повторять бессмысленно.
        err.fatal = res.status >= 400 && res.status < 500 && res.status !== 429;
        throw err;
      }
      return res;
    } catch (err) {
      if (err.fatal || attempt >= tries - 1) throw err;
      await sleep(600 * 2 ** attempt);
    }
  }
}

async function fetchJson(url) {
  return (await request(url)).json();
}

async function sha1File(file) {
  const hash = crypto.createHash('sha1');
  await pipeline(fs.createReadStream(file), hash);
  return hash.digest('hex');
}

async function isValid(file, { size, sha1 } = {}, strict = false) {
  try {
    const st = await fsp.stat(file);
    if (!st.isFile()) return false;
    if (size != null && st.size !== size) return false;
    if (sha1 && (strict || size == null)) return (await sha1File(file)) === sha1;
    return true;
  } catch {
    return false;
  }
}

async function download(url, dest, { sha1, size } = {}, onBytes) {
  await fsp.mkdir(path.dirname(dest), { recursive: true });
  const tmp = `${dest}.${process.pid}.part`;
  for (let attempt = 0; ; attempt++) {
    let received = 0;
    try {
      const res = await request(url);
      const hash = crypto.createHash('sha1');
      const meter = new Transform({
        transform(chunk, _enc, cb) {
          hash.update(chunk);
          received += chunk.length;
          if (onBytes) onBytes(chunk.length);
          cb(null, chunk);
        },
      });
      await pipeline(Readable.fromWeb(res.body), meter, fs.createWriteStream(tmp));
      const digest = hash.digest('hex');
      if (sha1 && digest !== sha1) throw new Error(`Неверная контрольная сумма: ${path.basename(dest)}`);
      await fsp.rename(tmp, dest);
      return;
    } catch (err) {
      if (onBytes && received) onBytes(-received);
      await fsp.rm(tmp, { force: true });
      if (err.fatal || attempt >= 3) throw err;
      await sleep(700 * 2 ** attempt);
    }
  }
}

async function runPool(items, limit, worker) {
  let index = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (index < items.length) {
      const i = index++;
      await worker(items[i], i);
    }
  });
  await Promise.all(runners);
}

// Скачивает список файлов, пропуская уже скачанные. Прогресс — по байтам.
async function downloadAll(files, onProgress, limit = 16) {
  const missing = [];
  await runPool(files, 32, async (f) => {
    if (!(await isValid(f.path, f))) missing.push(f);
  });
  const total = missing.reduce((s, f) => s + (f.size || 0), 0);
  let done = 0;
  let count = 0;
  const report = () => onProgress && onProgress({ done, total, count, files: missing.length });
  report();
  await runPool(missing, limit, async (f) => {
    await download(f.url, f.path, f, (n) => {
      done += n;
      report();
    });
    count++;
    report();
  });
  return missing.length;
}

module.exports = { USER_AGENT, fetchJson, download, downloadAll, isValid, runPool };
