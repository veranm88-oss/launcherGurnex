// Установка версий Minecraft: JSON версии, клиент, библиотеки, нативные файлы, ассеты, Fabric.
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const AdmZip = require('adm-zip');
const { fetchJson, download, downloadAll, isValid } = require('./net');
const { osName, archBits, isAllowed } = require('./platform');

const MANIFEST_URL = 'https://piston-meta.mojang.com/mc/game/version_manifest_v2.json';
const FABRIC_META = 'https://meta.fabricmc.net/v2';
const LIBRARIES_URL = 'https://libraries.minecraft.net/';
const RESOURCES_URL = 'https://resources.download.minecraft.net/';

let manifestCache = null;
async function getManifest() {
  if (manifestCache && Date.now() - manifestCache.at < 10 * 60 * 1000) return manifestCache.data;
  const data = await fetchJson(MANIFEST_URL);
  manifestCache = { at: Date.now(), data };
  return data;
}

const versionDir = (root, id) => path.join(root, 'versions', id);
const versionJsonPath = (root, id) => path.join(versionDir(root, id), `${id}.json`);

async function readJson(file) {
  return JSON.parse(await fsp.readFile(file, 'utf8'));
}

// JSON ванильной версии: с диска или с серверов Mojang.
async function loadVanillaJson(root, id) {
  const file = versionJsonPath(root, id);
  let entry = null;
  try {
    entry = (await getManifest()).versions.find((v) => v.id === id);
  } catch (err) {
    if (await isValid(file)) return readJson(file);
    throw err;
  }
  if (!entry) {
    if (await isValid(file)) return readJson(file);
    throw new Error(`Версия ${id} не найдена`);
  }
  if (!(await isValid(file, { sha1: entry.sha1 }, true))) await download(entry.url, file, { sha1: entry.sha1 });
  return readJson(file);
}

// Профиль Fabric для версии игры. null — если Fabric эту версию не поддерживает.
async function loadFabricJson(root, gameVersion) {
  const loaders = await fetchJson(`${FABRIC_META}/versions/loader/${encodeURIComponent(gameVersion)}`);
  if (!Array.isArray(loaders) || !loaders.length) return null;
  const loader = (loaders.find((l) => l.loader.stable) || loaders[0]).loader.version;
  const profile = await fetchJson(
    `${FABRIC_META}/versions/loader/${encodeURIComponent(gameVersion)}/${encodeURIComponent(loader)}/profile/json`
  );
  const file = versionJsonPath(root, profile.id);
  await fsp.mkdir(path.dirname(file), { recursive: true });
  await fsp.writeFile(file, JSON.stringify(profile, null, 2));
  return profile;
}

function libKey(name) {
  const [coords] = name.split('@');
  const [group, artifact, , classifier] = coords.split(':');
  return `${group}:${artifact}${classifier ? ':' + classifier : ''}`;
}

// Fabric-профиль наследует ванильную версию: дочерние библиотеки важнее родительских.
function mergeVersions(parent, child) {
  const seen = new Set();
  const libraries = [];
  for (const lib of [...(child.libraries || []), ...(parent.libraries || [])]) {
    const key = libKey(lib.name);
    if (seen.has(key)) continue;
    seen.add(key);
    libraries.push(lib);
  }
  const merged = { ...parent, ...child, libraries, inheritsFrom: undefined };
  merged.id = child.id;
  merged.jar = parent.jar || parent.id;
  merged.downloads = parent.downloads;
  merged.assetIndex = parent.assetIndex;
  merged.assets = parent.assets;
  merged.javaVersion = child.javaVersion || parent.javaVersion;
  merged.logging = parent.logging;
  if (parent.arguments || child.arguments) {
    merged.arguments = {
      game: [...((parent.arguments || {}).game || []), ...((child.arguments || {}).game || [])],
      jvm: [...((parent.arguments || {}).jvm || []), ...((child.arguments || {}).jvm || [])],
    };
  }
  if (!child.minecraftArguments && parent.minecraftArguments) merged.minecraftArguments = parent.minecraftArguments;
  return merged;
}

function mavenPath(name) {
  const [coords, ext = 'jar'] = name.split('@');
  const [group, artifact, version, classifier] = coords.split(':');
  return [...group.split('.'), artifact, version, `${artifact}-${version}${classifier ? '-' + classifier : ''}.${ext}`].join('/');
}

function collectLibraries(root, version) {
  const libDir = path.join(root, 'libraries');
  const downloads = [];
  const classpath = [];
  const natives = [];
  const os = osName();

  for (const lib of version.libraries || []) {
    if (!isAllowed(lib.rules)) continue;
    const d = lib.downloads;

    if (d && d.artifact) {
      const rel = d.artifact.path || mavenPath(lib.name);
      const file = path.join(libDir, rel);
      if (d.artifact.url) downloads.push({ url: d.artifact.url, path: file, sha1: d.artifact.sha1, size: d.artifact.size });
      classpath.push(file);
    } else if (!d && lib.name) {
      const rel = mavenPath(lib.name);
      const file = path.join(libDir, rel);
      const base = (lib.url || LIBRARIES_URL).replace(/\/?$/, '/');
      downloads.push({ url: base + rel, path: file, sha1: lib.sha1, size: lib.size });
      classpath.push(file);
    }

    // Старые версии (до 1.19): нативные библиотеки в classifiers, их нужно распаковать.
    const nativeKey = lib.natives && lib.natives[os];
    if (nativeKey && d && d.classifiers) {
      const n = d.classifiers[nativeKey.replace('${arch}', archBits())];
      if (n) {
        const file = path.join(libDir, n.path);
        downloads.push({ url: n.url, path: file, sha1: n.sha1, size: n.size });
        natives.push({ file, exclude: (lib.extract && lib.extract.exclude) || [] });
      }
    }
  }
  return { downloads, classpath, natives };
}

async function extractNatives(natives, dir) {
  await fsp.rm(dir, { recursive: true, force: true });
  await fsp.mkdir(dir, { recursive: true });
  for (const { file, exclude } of natives) {
    const zip = new AdmZip(file);
    for (const entry of zip.getEntries()) {
      if (entry.isDirectory || exclude.some((ex) => entry.entryName.startsWith(ex))) continue;
      zip.extractEntryTo(entry, dir, true, true);
    }
  }
}

async function installAssets(root, version, gameDir, onProgress) {
  const idx = version.assetIndex;
  if (!idx) return;
  const assetsDir = path.join(root, 'assets');
  const indexFile = path.join(assetsDir, 'indexes', `${idx.id}.json`);
  if (!(await isValid(indexFile, idx))) await download(idx.url, indexFile, idx);
  const index = await readJson(indexFile);

  const files = Object.values(index.objects).map(({ hash, size }) => ({
    url: `${RESOURCES_URL}${hash.slice(0, 2)}/${hash}`,
    path: path.join(assetsDir, 'objects', hash.slice(0, 2), hash),
    sha1: hash,
    size,
  }));
  // Одинаковые файлы под разными именами скачиваем один раз.
  const unique = [...new Map(files.map((f) => [f.path, f])).values()];
  await downloadAll(unique, onProgress, 24);

  // Совсем старые версии ищут звуки по именам, а не по хешам.
  if (index.map_to_resources || index.virtual) {
    const target = index.map_to_resources ? path.join(gameDir, 'resources') : path.join(assetsDir, 'virtual', idx.id);
    for (const [name, { hash, size }] of Object.entries(index.objects)) {
      const dest = path.join(target, name);
      if (await isValid(dest, { size })) continue;
      await fsp.mkdir(path.dirname(dest), { recursive: true });
      await fsp.copyFile(path.join(assetsDir, 'objects', hash.slice(0, 2), hash), dest);
    }
  }
}

async function installLogging(root, version) {
  const cfg = version.logging && version.logging.client;
  if (!cfg || !cfg.file) return null;
  const file = path.join(root, 'assets', 'log_configs', cfg.file.id);
  if (!(await isValid(file, cfg.file))) await download(cfg.file.url, file, cfg.file);
  return cfg.argument.replace('${path}', file);
}

// Полная установка. step(name, fraction) сообщает прогресс по этапам.
async function installVersion(root, gameDir, versionId, { fabric = false, step = () => {} } = {}) {
  step('meta', 0);
  const vanilla = await loadVanillaJson(root, versionId);
  let version = vanilla;
  let loader = 'vanilla';
  if (fabric) {
    let profile = null;
    try {
      profile = await loadFabricJson(root, versionId);
    } catch (err) {
      profile = null;
    }
    if (profile) {
      version = mergeVersions(vanilla, profile);
      loader = 'fabric';
    }
  }
  step('meta', 1);

  const jarId = vanilla.id;
  const clientJar = path.join(versionDir(root, jarId), `${jarId}.jar`);
  const client = vanilla.downloads && vanilla.downloads.client;
  const libs = collectLibraries(root, version);
  const files = [...libs.downloads];
  if (client) files.push({ url: client.url, path: clientJar, sha1: client.sha1, size: client.size });
  await downloadAll(files, (p) => step('libraries', p.total ? p.done / p.total : 1, p));

  await installAssets(root, version, gameDir, (p) => step('assets', p.total ? p.done / p.total : 1, p));
  const loggingArg = await installLogging(root, version);

  const nativesDir = path.join(versionDir(root, jarId), 'natives');
  if (libs.natives.length) await extractNatives(libs.natives, nativesDir);
  else await fsp.mkdir(nativesDir, { recursive: true });

  return {
    version,
    loader,
    classpath: [...libs.classpath, clientJar],
    nativesDir,
    loggingArg,
    javaComponent: (version.javaVersion && version.javaVersion.component) || 'jre-legacy',
  };
}

// Какие ванильные версии уже скачаны полностью (есть JSON и клиент).
async function listInstalled(root) {
  const dir = path.join(root, 'versions');
  let names = [];
  try {
    names = await fsp.readdir(dir);
  } catch {
    return [];
  }
  const result = [];
  for (const id of names) {
    try {
      const json = await readJson(versionJsonPath(root, id));
      if (json.inheritsFrom) continue;
      if (await isValid(path.join(dir, id, `${id}.jar`))) result.push(id);
    } catch {}
  }
  return result;
}

module.exports = { getManifest, installVersion, listInstalled, mergeVersions, mavenPath };
