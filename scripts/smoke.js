// Проверка ядра без интерфейса: node scripts/smoke.js <версия> [папка] [моды через запятую]
const path = require('path');
const os = require('os');
const core = require('../core');

(async () => {
  const version = process.argv[2] || '1.21.4';
  const root = process.argv[3] || path.join(os.tmpdir(), 'gurnex-smoke');
  const mods = process.argv[4] ? process.argv[4].split(',') : null;
  const t0 = Date.now();
  let lastStage = '';
  const prep = await core.prepare({
    root,
    version,
    fabric: !!mods,
    mods,
    onProgress: (p) => {
      if (p.stage !== lastStage) console.log(`[${p.percent.toFixed(0).padStart(3)}%] ${p.stage}`);
      lastStage = p.stage;
    },
  });
  console.log(`prepared in ${((Date.now() - t0) / 1000).toFixed(1)}s loader=${prep.install.loader} java=${prep.java}`);
  if (prep.mods) console.log('mods:', prep.mods);

  const run = core.launch(root, prep.gameDir, prep.install, prep.java, { nickname: 'Gurnex', ram: 2, width: 854, height: 480 });
  const limit = Number(process.env.SMOKE_SECONDS || 60) * 1000;
  const timer = setTimeout(() => run.child.kill(), limit);
  run.child.on('error', (e) => console.log('spawn error', e.message));
  run.child.on('close', (code, signal) => {
    clearTimeout(timer);
    console.log(`game exited code=${code} signal=${signal} log=${run.logFile}`);
    console.log(run.tail.slice(-15).join('\n'));
  });
})().catch((e) => {
  console.error('FAILED', e);
  process.exit(1);
});
