// Сборка аргументов и запуск игры (офлайн-аккаунт).
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');
const { isAllowed, osName } = require('./platform');

// Тот же UUID, который сервер выдаёт офлайн-игроку с этим ником.
function offlineUuid(name) {
  const md5 = crypto.createHash('md5').update(`OfflinePlayer:${name}`).digest();
  md5[6] = (md5[6] & 0x0f) | 0x30;
  md5[8] = (md5[8] & 0x3f) | 0x80;
  return md5.toString('hex');
}

function resolveArgs(list, features) {
  const out = [];
  for (const arg of list || []) {
    if (typeof arg === 'string') out.push(arg);
    else if (isAllowed(arg.rules, features)) out.push(...[].concat(arg.value));
  }
  return out;
}

function buildArgs(root, gameDir, install, opts) {
  const { version, classpath, nativesDir, loggingArg } = install;
  const custom = !opts.fullscreen && opts.width && opts.height;
  const features = { has_custom_resolution: !!custom, is_demo_user: false };
  const assetsRoot = path.join(root, 'assets');
  const idx = version.assetIndex || {};
  const gameAssets = idx.id === 'legacy' || idx.id === 'pre-1.6' ? path.join(assetsRoot, 'virtual', idx.id) : assetsRoot;

  const vars = {
    auth_player_name: opts.nickname,
    version_name: version.id,
    game_directory: gameDir,
    assets_root: assetsRoot,
    game_assets: gameAssets,
    assets_index_name: idx.id || version.assets,
    auth_uuid: offlineUuid(opts.nickname),
    auth_access_token: '0',
    auth_session: '0',
    auth_xuid: '0',
    clientid: '0',
    user_type: 'legacy',
    user_properties: '{}',
    version_type: 'Gurnex',
    natives_directory: nativesDir,
    launcher_name: 'Gurnex',
    launcher_version: '0.2.0',
    classpath: classpath.join(path.delimiter),
    classpath_separator: path.delimiter,
    library_directory: path.join(root, 'libraries'),
    resolution_width: String(opts.width || 854),
    resolution_height: String(opts.height || 480),
  };
  const sub = (s) => s.replace(/\$\{([^}]+)\}/g, (m, key) => (key in vars ? vars[key] : m));

  let jvm;
  let game;
  if (version.arguments && version.arguments.jvm) {
    jvm = resolveArgs(version.arguments.jvm, features);
  } else {
    jvm = ['-Djava.library.path=${natives_directory}', '-cp', '${classpath}'];
    if (osName() === 'osx') jvm.unshift('-XstartOnFirstThread');
    if (osName() === 'windows') jvm.unshift('-XX:HeapDumpPath=MojangTricksIntelDriversForPerformance_javaw.exe_minecraft.exe.heapdump');
  }
  if (version.arguments && version.arguments.game) {
    game = resolveArgs(version.arguments.game, features);
  } else {
    game = (version.minecraftArguments || '').split(' ').filter(Boolean);
    if (custom) game.push('--width', '${resolution_width}', '--height', '${resolution_height}');
  }
  if (opts.fullscreen) game.push('--fullscreen');

  const memory = [`-Xmx${opts.ram || 4}G`, '-Xms512M', '-XX:+UseG1GC', '-XX:MaxGCPauseMillis=50'];
  return [...memory, ...(loggingArg ? [loggingArg] : []), ...jvm.map(sub), version.mainClass, ...game.map(sub)];
}

function launch(root, gameDir, install, javaPath, opts) {
  const args = buildArgs(root, gameDir, install, opts);
  const logDir = path.join(root, 'logs');
  fs.mkdirSync(logDir, { recursive: true });
  const logFile = path.join(logDir, 'last-launch.log');
  const log = fs.createWriteStream(logFile);
  log.write(`> ${javaPath} ${args.map((a) => (a.length > 300 ? a.slice(0, 300) + '…' : a)).join(' ')}\n\n`);

  const child = spawn(javaPath, args, { cwd: gameDir, windowsHide: true });
  const tail = [];
  const keep = (chunk) => {
    log.write(chunk);
    tail.push(...chunk.toString().split(/\r?\n/).filter(Boolean));
    if (tail.length > 40) tail.splice(0, tail.length - 40);
  };
  child.stdout.on('data', keep);
  child.stderr.on('data', keep);
  child.on('close', () => log.end());
  return { child, logFile, tail };
}

module.exports = { buildArgs, launch, offlineUuid };
