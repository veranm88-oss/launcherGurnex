// Моды с Modrinth: подбор версии под игру, обязательные зависимости, синхронизация папки mods.
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const { fetchJson, downloadAll } = require('./net');

const API = 'https://api.modrinth.com/v2';
const MANAGED_FILE = '.gurnex-managed.json';

async function bestVersion(project, gameVersion) {
  const q = new URLSearchParams({
    loaders: JSON.stringify(['fabric']),
    game_versions: JSON.stringify([gameVersion]),
  });
  const list = await fetchJson(`${API}/project/${encodeURIComponent(project)}/version?${q}`);
  return list.find((v) => v.version_type === 'release') || list[0] || null;
}

// Возвращает файлы для скачивания и моды, которых нет под эту версию игры.
async function resolveMods(slugs, gameVersion) {
  const seen = new Set();
  const files = [];
  const missing = [];
  let queue = slugs.map((id) => ({ id, requested: true }));

  while (queue.length) {
    const batch = queue.filter((q) => !seen.has(q.id));
    queue = [];
    batch.forEach((q) => seen.add(q.id));
    const results = await Promise.all(
      batch.map(async (q) => ({ q, v: await bestVersion(q.id, gameVersion).catch((e) => (e.fatal ? null : Promise.reject(e))) }))
    );
    for (const { q, v } of results) {
      if (!v) {
        if (q.requested) missing.push(q.id);
        continue;
      }
      if (files.some((f) => f.project === v.project_id)) continue;
      seen.add(v.project_id);
      const file = v.files.find((f) => f.primary) || v.files[0];
      files.push({ project: v.project_id, slug: q.id, name: file.filename, url: file.url, sha1: file.hashes.sha1, size: file.size });
      for (const dep of v.dependencies || []) {
        if (dep.dependency_type === 'required' && dep.project_id && !seen.has(dep.project_id)) {
          queue.push({ id: dep.project_id, requested: false });
        }
      }
    }
  }
  return { files, missing };
}

// Ставит в gameDir/mods ровно нужные моды. Свои моды пользователя не трогает.
async function syncMods(root, gameDir, slugs, gameVersion, onProgress) {
  const modsDir = path.join(gameDir, 'mods');
  const cacheDir = path.join(root, 'cache', 'mods');
  const managedPath = path.join(modsDir, MANAGED_FILE);
  await fsp.mkdir(modsDir, { recursive: true });
  const previous = JSON.parse(await fsp.readFile(managedPath, 'utf8').catch(() => '[]'));

  let resolved = { files: [], missing: [] };
  if (slugs.length) resolved = await resolveMods(slugs, gameVersion);

  const files = resolved.files.map((f) => ({ ...f, path: path.join(cacheDir, f.name) }));
  await downloadAll(files, onProgress, 8);

  const wanted = new Set(files.map((f) => f.name));
  for (const name of previous) {
    if (!wanted.has(name)) await fsp.rm(path.join(modsDir, name), { force: true });
  }
  for (const f of files) {
    await fsp.copyFile(f.path, path.join(modsDir, f.name));
  }
  await fsp.writeFile(managedPath, JSON.stringify([...wanted], null, 2));
  return { installed: files.map((f) => f.slug), missing: resolved.missing };
}

module.exports = { resolveMods, syncMods };
