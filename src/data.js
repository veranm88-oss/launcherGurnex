// Встроенные моды и запасной список версий (если нет интернета).
// slug — адрес мода на modrinth.com (если не указан, совпадает с id).
window.GURNEX_MODS = [
  { id: 'sodium', name: 'Sodium', cat: 'perf', desc: 'Новый движок рендеринга — FPS в 2–3 раза выше.', author: 'CaffeineMC', color: ['#34d399', '#059669'], on: true },
  { id: 'lithium', name: 'Lithium', cat: 'perf', desc: 'Оптимизация физики, ИИ мобов и тиков мира.', author: 'CaffeineMC', color: ['#60a5fa', '#2563eb'], on: true },
  { id: 'ferritecore', slug: 'ferrite-core', name: 'FerriteCore', cat: 'perf', desc: 'Заметно снижает потребление оперативной памяти.', author: 'malte0811', color: ['#f97316', '#c2410c'], on: true },
  { id: 'entityculling', name: 'Entity Culling', cat: 'perf', desc: 'Не рисует то, что скрыто за стенами.', author: 'tr7zw', color: ['#a3a3a3', '#525252'], on: false },
  { id: 'iris', name: 'Iris Shaders', cat: 'graphics', desc: 'Шейдеры в связке с Sodium. Красиво и быстро.', author: 'IrisShaders', color: ['#c084fc', '#7c3aed'], on: false },
  { id: 'continuity', name: 'Continuity', cat: 'graphics', desc: 'Соединённые текстуры стекла и книжных полок.', author: 'PepperCode1', color: ['#38bdf8', '#0284c7'], on: false },
  { id: 'lambdynamiclights', name: 'LambDynamicLights', cat: 'graphics', desc: 'Факел в руке освещает всё вокруг.', author: 'LambdAurora', color: ['#fbbf24', '#d97706'], on: false },
  { id: 'zoomify', name: 'Zoomify', cat: 'ui', desc: 'Плавное приближение камеры, как в OptiFine.', author: 'isXander', color: ['#f472b6', '#db2777'], on: true },
  { id: 'xaerominimap', slug: 'xaeros-minimap', name: "Xaero's Minimap", cat: 'ui', desc: 'Миникарта с метками и путевыми точками.', author: 'xaero96', color: ['#4ade80', '#16a34a'], on: false },
  { id: 'jei', name: 'Just Enough Items', cat: 'ui', desc: 'Рецепты и использование любого предмета.', author: 'mezz', color: ['#facc15', '#ca8a04'], on: false },
  { id: 'appleskin', name: 'AppleSkin', cat: 'ui', desc: 'Показывает сытость и насыщение еды на HUD.', author: 'squeek502', color: ['#f87171', '#dc2626'], on: true },
  { id: 'modmenu', name: 'Mod Menu', cat: 'ui', desc: 'Удобное меню со списком модов в игре.', author: 'TerraformersMC', color: ['#94a3b8', '#475569'], on: true },
];

window.GURNEX_FALLBACK_VERSIONS = [
  '1.21.4', '1.21.3', '1.21.1', '1.21', '1.20.6', '1.20.4', '1.20.1', '1.19.4', '1.19.2', '1.18.2',
  '1.17.1', '1.16.5', '1.15.2', '1.14.4', '1.12.2', '1.8.9', '1.7.10',
].map((id) => ({ id, type: 'release', releaseTime: null }));
