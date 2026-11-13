(function () {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // ---------- Хранилище ----------
  const store = {
    get(key, fallback) {
      try {
        const v = localStorage.getItem('gurnex.' + key);
        return v == null ? fallback : JSON.parse(v);
      } catch {
        return fallback;
      }
    },
    set(key, value) {
      localStorage.setItem('gurnex.' + key, JSON.stringify(value));
    },
  };

  const defaults = {
    nickname: 'Player',
    ram: 4,
    width: 1280,
    height: 720,
    fullscreen: false,
    closeOnLaunch: false,
    javaPath: '',
    theme: 'light',
    animations: true,
    music: true,
    volume: 30,
    version: null,
  };

  const state = {
    settings: { ...defaults, ...store.get('settings', {}) },
    installed: new Set(store.get('installed', [])),
    mods: store.get('mods', null) || Object.fromEntries(GURNEX_MODS.map((m) => [m.id, m.on])),
    versions: [],
    latest: null,
    filter: 'release',
    query: '',
    modCat: 'all',
    downloads: new Map(), // id -> { p, stage, promise }
    playState: 'idle',
  };

  const saveSettings = () => store.set('settings', state.settings);
  const saveInstalled = () => store.set('installed', [...state.installed]);

  // ---------- Тосты ----------
  function toast(text) {
    const el = document.createElement('div');
    el.className = 'toast';
    el.innerHTML = '<span class="t-dot"></span><span></span>';
    el.lastChild.textContent = text;
    $('#toasts').appendChild(el);
    setTimeout(() => {
      el.classList.add('out');
      el.addEventListener('animationend', () => el.remove(), { once: true });
    }, 3200);
  }

  // ---------- Ripple ----------
  function ripple(e) {
    const btn = e.currentTarget;
    const rect = btn.getBoundingClientRect();
    const size = Math.max(rect.width, rect.height);
    const span = document.createElement('span');
    span.className = 'ripple';
    span.style.width = span.style.height = size + 'px';
    span.style.left = e.clientX - rect.left - size / 2 + 'px';
    span.style.top = e.clientY - rect.top - size / 2 + 'px';
    btn.appendChild(span);
    span.addEventListener('animationend', () => span.remove());
  }

  // ---------- Сегменты с плавным индикатором ----------
  function moveSegIndicator(seg) {
    const active = seg.querySelector('.seg.active');
    const ind = seg.querySelector('.seg-indicator');
    if (!active || !ind) return;
    ind.style.width = active.offsetWidth + 'px';
    ind.style.transform = `translateX(${active.offsetLeft}px)`;
  }

  // ---------- Навигация ----------
  function moveNavIndicator() {
    const active = $('.nav-item.active');
    $('#navIndicator').style.transform = `translateY(${active.offsetTop}px)`;
  }

  function go(view) {
    $$('.nav-item').forEach((b) => b.classList.toggle('active', b.dataset.view === view));
    $$('.view').forEach((v) => v.classList.toggle('active', v.dataset.view === view));
    moveNavIndicator();
    closePicker();
    if (view === 'versions') {
      renderVersions();
      requestAnimationFrame(() => moveSegIndicator($('#versionFilter')));
    }
    if (view === 'settings') requestAnimationFrame(() => moveSegIndicator($('#themeSeg')));
  }

  $$('.nav-item').forEach((b) => b.addEventListener('click', () => go(b.dataset.view)));
  $$('[data-go]').forEach((b) => b.addEventListener('click', () => go(b.dataset.go)));

  // ---------- Окно ----------
  if (window.gurnex && window.gurnex.isDesktop) {
    $$('[data-win]').forEach((b) => b.addEventListener('click', () => window.gurnex[b.dataset.win]()));
  } else {
    $('#winControls').style.display = 'none';
  }

  // ---------- Тема ----------
  function applyTheme() {
    document.body.dataset.theme = state.settings.theme;
    $$('#themeSeg .seg').forEach((b) => b.classList.toggle('active', b.dataset.themeValue === state.settings.theme));
    moveSegIndicator($('#themeSeg'));
  }
  function setTheme(t) {
    state.settings.theme = t;
    saveSettings();
    applyTheme();
  }
  $('#themeQuick').addEventListener('click', () => setTheme(state.settings.theme === 'light' ? 'gray' : 'light'));
  $$('#themeSeg .seg').forEach((b) => b.addEventListener('click', () => setTheme(b.dataset.themeValue)));

  // ---------- Кубик с пиксельными текстурами ----------
  function pixelTexture(kind) {
    const c = document.createElement('canvas');
    c.width = c.height = 16;
    const g = c.getContext('2d');
    let seed = kind.length * 977;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const grass = ['#5fa03a', '#6cb043', '#58963a', '#79bf4c', '#4f8a33'];
    const dirt = ['#866043', '#79553a', '#96704f', '#6b4a32', '#8d6747'];
    for (let y = 0; y < 16; y++) {
      for (let x = 0; x < 16; x++) {
        let pal = dirt;
        if (kind === 'top') pal = grass;
        if (kind === 'side') {
          const edge = 3 + Math.floor(rnd() * 2.2);
          pal = y < edge ? grass : dirt;
        }
        g.fillStyle = pal[Math.floor(rnd() * pal.length)];
        g.fillRect(x, y, 1, 1);
      }
    }
    return c.toDataURL();
  }
  const tex = { top: pixelTexture('top'), side: pixelTexture('side'), bottom: pixelTexture('bottom') };
  $$('.face').forEach((f) => {
    const kind = f.classList.contains('top') ? 'top' : f.classList.contains('bottom') ? 'bottom' : 'side';
    f.style.backgroundImage = `url(${tex[kind]})`;
  });

  // ---------- Профиль ----------
  function applyProfile() {
    const nick = state.settings.nickname || 'Player';
    $('#heroNick').textContent = nick;
    $('#profileName').textContent = nick;
    $('#avatar').textContent = nick[0].toUpperCase();
    $('#chipRam').textContent = state.settings.ram + ' ГБ';
  }

  // ---------- Версии ----------
  const typeLabel = { release: 'Релиз', snapshot: 'Снапшот', old_beta: 'Бета', old_alpha: 'Альфа' };

  async function loadVersions() {
    try {
      const res = await fetch('https://piston-meta.mojang.com/mc/game/version_manifest_v2.json');
      if (!res.ok) throw new Error(res.status);
      const data = await res.json();
      state.versions = data.versions;
      state.latest = data.latest;
      $('#versionsMeta').textContent = `Последний релиз — ${data.latest.release}, снапшот — ${data.latest.snapshot}. Всего ${data.versions.length} версий.`;
    } catch (e) {
      state.versions = GURNEX_FALLBACK_VERSIONS;
      state.latest = { release: GURNEX_FALLBACK_VERSIONS[0].id };
      $('#versionsMeta').textContent = 'Нет связи с серверами Mojang — показан базовый список.';
    }
    if (!state.settings.version) {
      state.settings.version = state.latest.release;
      saveSettings();
    }
    renderPicker();
    renderVersions();
    updatePlayUI();
  }

  function filteredVersions() {
    const q = state.query.trim().toLowerCase();
    return state.versions.filter((v) => {
      if (q && !v.id.toLowerCase().includes(q)) return false;
      switch (state.filter) {
        case 'release': return v.type === 'release';
        case 'snapshot': return v.type === 'snapshot';
        case 'old': return v.type === 'old_alpha' || v.type === 'old_beta';
        case 'installed': return state.installed.has(v.id);
        default: return true;
      }
    });
  }

  const formatDate = (iso) =>
    iso ? new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' }) : '';

  function iconClass(type) {
    return type === 'release' ? 'release' : type === 'snapshot' ? 'snapshot' : 'old';
  }

  function shortId(id) {
    const m = id.match(/^(\d+\.\d+)/);
    return m ? m[1] : id.slice(0, 4);
  }

  const LIMIT = 60;
  let shown = LIMIT;

  function renderVersions() {
    const list = $('#versionList');
    const items = filteredVersions();
    if (!items.length) {
      list.innerHTML = `<div class="empty">${state.filter === 'installed' ? 'Пока ничего не установлено. Скачай версию во вкладке «Релизы».' : 'Ничего не найдено'}</div>`;
      return;
    }
    list.innerHTML = '';
    items.slice(0, shown).forEach((v, i) => {
      const row = document.createElement('div');
      row.className = 'version-row';
      row.dataset.id = v.id;
      row.style.animationDelay = Math.min(i, 14) * 0.03 + 's';
      row.innerHTML = `
        <div class="v-icon ${iconClass(v.type)}">${shortId(v.id)}</div>
        <div>
          <div class="v-name"></div>
          <div class="v-meta">${typeLabel[v.type] || v.type}${v.releaseTime ? ' · ' + formatDate(v.releaseTime) : ''}</div>
        </div>
        <div class="v-progress"><div class="progress"><div class="progress-bar"></div></div><small></small></div>
        <div class="v-action"></div>`;
      row.querySelector('.v-name').textContent = v.id;
      list.appendChild(row);
      updateVersionRow(v.id);
    });
    if (items.length > shown) {
      const more = document.createElement('button');
      more.className = 'btn ghost';
      more.style.margin = '6px auto 0';
      more.textContent = `Показать ещё (${items.length - shown})`;
      more.addEventListener('click', () => {
        shown += LIMIT;
        renderVersions();
      });
      list.appendChild(more);
    }
  }

  function updateVersionRow(id) {
    const row = $(`.version-row[data-id="${CSS.escape(id)}"]`);
    if (!row) return;
    const dl = state.downloads.get(id);
    const action = row.querySelector('.v-action');
    row.classList.toggle('downloading', !!dl);
    if (dl) {
      row.querySelector('.v-progress .progress-bar').style.width = dl.p + '%';
      row.querySelector('.v-progress small').textContent = `${dl.stage} · ${Math.floor(dl.p)}%`;
      action.innerHTML = '<button class="btn ghost" disabled>Загрузка…</button>';
      return;
    }
    if (state.installed.has(id)) {
      const selected = state.settings.version === id;
      action.innerHTML = `<button class="btn ${selected ? 'installed' : 'ghost'}">${
        selected ? '<svg viewBox="0 0 24 24"><path d="m5 12.5 4.5 4.5L19 7"/></svg>Выбрана' : 'Выбрать'
      }</button>`;
      action.firstChild.addEventListener('click', () => selectVersion(id, true));
    } else {
      action.innerHTML = '<button class="btn primary"><svg viewBox="0 0 24 24"><path d="M12 4v11m0 0-4.5-4.5M12 15l4.5-4.5M5 20h14"/></svg>Скачать</button>';
      action.firstChild.addEventListener('click', () => downloadVersion(id).then(() => toast(`Minecraft ${id} установлен`)));
    }
  }

  $$('#versionFilter .seg').forEach((b) =>
    b.addEventListener('click', () => {
      $$('#versionFilter .seg').forEach((x) => x.classList.toggle('active', x === b));
      moveSegIndicator($('#versionFilter'));
      state.filter = b.dataset.filter;
      shown = LIMIT;
      renderVersions();
    })
  );
  $('#versionSearch').addEventListener('input', (e) => {
    state.query = e.target.value;
    shown = LIMIT;
    renderVersions();
  });

  // Загрузка версии. Пока демонстрационная: этапы и прогресс имитируются.
  function downloadVersion(id) {
    if (state.downloads.has(id)) return state.downloads.get(id).promise;
    const stages = [
      [18, 'Манифест версии'],
      [45, 'Библиотеки'],
      [85, 'Ассеты и звуки'],
      [100, 'Клиент'],
    ];
    const dl = { p: 0, stage: stages[0][1] };
    dl.promise = new Promise((resolve) => {
      const timer = setInterval(() => {
        dl.p = Math.min(100, dl.p + Math.random() * 3.2 + 0.6);
        dl.stage = stages.find((s) => dl.p <= s[0])?.[1] || 'Готово';
        updateVersionRow(id);
        updateHomeProgress();
        if (dl.p >= 100) {
          clearInterval(timer);
          state.downloads.delete(id);
          state.installed.add(id);
          saveInstalled();
          updateVersionRow(id);
          renderPicker();
          updatePlayUI();
          resolve();
        }
      }, 70);
    });
    state.downloads.set(id, dl);
    updateVersionRow(id);
    updatePlayUI();
    return dl.promise;
  }

  // ---------- Выбор версии на главной ----------
  const picker = $('#picker');
  function closePicker() {
    picker.classList.remove('open');
  }
  $('#pickerBtn').addEventListener('click', (e) => {
    e.stopPropagation();
    picker.classList.toggle('open');
  });
  document.addEventListener('click', (e) => {
    if (!picker.contains(e.target)) closePicker();
  });

  function selectVersion(id, silent) {
    state.settings.version = id;
    saveSettings();
    renderPicker();
    updatePlayUI();
    $$('.version-row').forEach((r) => updateVersionRow(r.dataset.id));
    if (!silent) closePicker();
  }

  function renderPicker() {
    const menu = $('#pickerMenu');
    const current = state.settings.version;
    $('#pickerValue').textContent = current || '—';
    const installed = state.versions.filter((v) => state.installed.has(v.id));
    const popular = state.versions
      .filter((v) => v.type === 'release' && !state.installed.has(v.id))
      .slice(0, 6);
    const item = (v, tag) =>
      `<button class="picker-item ${v.id === current ? 'selected' : ''}" data-id="${v.id}"><span>${v.id}</span><span class="tag">${tag}</span></button>`;
    menu.innerHTML =
      (installed.length ? '<div class="picker-group">Установленные</div>' + installed.map((v) => item(v, '✓')).join('') : '') +
      '<div class="picker-group">Последние релизы</div>' +
      popular.map((v) => item(v, 'скачать')).join('') +
      '<button class="picker-item more" data-more>Все версии →</button>';
    $$('.picker-item[data-id]', menu).forEach((b) => b.addEventListener('click', () => selectVersion(b.dataset.id)));
    $('[data-more]', menu).addEventListener('click', () => go('versions'));
  }

  // ---------- Кнопка «Играть» ----------
  const playBtn = $('#playBtn');

  function updateHomeProgress() {
    const dl = state.downloads.get(state.settings.version);
    if (!dl) return;
    playBtn.style.setProperty('--p', dl.p + '%');
    $('#homeProgress').style.width = dl.p + '%';
    $('#statusText').textContent = `${dl.stage} · ${Math.floor(dl.p)}%`;
    $('#playText').textContent = Math.floor(dl.p) + '%';
  }

  function updatePlayUI() {
    const v = state.settings.version;
    const dl = state.downloads.get(v);
    const status = $('#playStatus');
    playBtn.classList.toggle('busy', !!dl || state.playState === 'launching');
    playBtn.classList.toggle('running', state.playState === 'running');

    if (state.playState === 'launching') {
      $('#playText').textContent = 'Запуск…';
      $('#eyebrowText').textContent = 'Запускаем игру';
      return;
    }
    if (state.playState === 'running') {
      $('#playText').textContent = 'В игре';
      $('#eyebrowText').textContent = `Minecraft ${v} запущен`;
      status.classList.remove('show');
      return;
    }
    if (dl) {
      status.classList.add('show');
      $('#eyebrowText').textContent = `Скачиваем ${v}`;
      updateHomeProgress();
      return;
    }
    playBtn.style.setProperty('--p', '0%');
    status.classList.remove('show');
    const installed = state.installed.has(v);
    $('#playText').textContent = installed ? 'Играть' : 'Скачать и играть';
    $('#eyebrowText').textContent = installed ? 'Готов к запуску' : `Версия ${v || ''} не установлена`;
  }

  playBtn.addEventListener('click', async (e) => {
    ripple(e);
    const v = state.settings.version;
    if (!v || state.playState !== 'idle' || state.downloads.has(v)) return;
    if (!state.installed.has(v)) await downloadVersion(v);

    state.playState = 'launching';
    $('#playStatus').classList.add('show');
    $('#homeProgress').style.width = '100%';
    $('#statusText').textContent = `Java · ${state.settings.ram} ГБ · модов: ${enabledMods()}`;
    updatePlayUI();
    await sleep(1800);

    state.playState = 'running';
    updatePlayUI();
    toast(`Minecraft ${v} запущен как ${state.settings.nickname}`);
    await sleep(4000);
    state.playState = 'idle';
    updatePlayUI();
  });

  // ---------- Моды ----------
  const catLabel = { perf: 'Производительность', graphics: 'Графика', ui: 'Интерфейс' };
  const enabledMods = () => GURNEX_MODS.filter((m) => state.mods[m.id]).length;

  function updateModCounters() {
    const on = enabledMods();
    $('#modsOn').textContent = on;
    $('#modsTotal').textContent = GURNEX_MODS.length;
    $('#modsBadge').textContent = on;
    $('#chipMods').textContent = on;
  }

  function renderMods() {
    const grid = $('#modsGrid');
    grid.innerHTML = '';
    GURNEX_MODS.filter((m) => state.modCat === 'all' || m.cat === state.modCat).forEach((m, i) => {
      const card = document.createElement('div');
      card.className = 'mod-card' + (state.mods[m.id] ? ' on' : '');
      card.style.animationDelay = i * 0.04 + 's';
      card.innerHTML = `
        <div class="mod-top">
          <div class="mod-icon" style="background:linear-gradient(135deg,${m.color[0]},${m.color[1]})">${m.name[0]}</div>
          <div><div class="mod-name">${m.name}</div><div class="mod-author">${m.author}</div></div>
          <label class="switch"><input type="checkbox" ${state.mods[m.id] ? 'checked' : ''} /><span></span></label>
        </div>
        <p class="mod-desc">${m.desc}</p>
        <div class="mod-tags"><span class="tag-pill">${catLabel[m.cat]}</span><span class="tag-pill">Fabric</span></div>`;
      card.querySelector('input').addEventListener('change', (e) => {
        state.mods[m.id] = e.target.checked;
        store.set('mods', state.mods);
        card.classList.toggle('on', e.target.checked);
        updateModCounters();
      });
      grid.appendChild(card);
    });
  }

  $$('#modFilter .pill').forEach((b) =>
    b.addEventListener('click', () => {
      $$('#modFilter .pill').forEach((x) => x.classList.toggle('active', x === b));
      state.modCat = b.dataset.cat;
      renderMods();
    })
  );

  // ---------- Музыка ----------
  const music = new GurnexMusic($('#customAudio'));
  const musicCard = $('#musicCard');

  function paintRange(input) {
    const min = +input.min || 0;
    const max = +input.max || 100;
    input.style.setProperty('--fill', ((input.value - min) / (max - min)) * 100 + '%');
  }

  function applyMusicUI() {
    musicCard.classList.toggle('off', !state.settings.music || !music.playing);
    $('#setMusic').checked = state.settings.music;
    $('#musicVolume').value = $('#setVolume').value = state.settings.volume;
    $('#volValue').textContent = state.settings.volume + '%';
    paintRange($('#musicVolume'));
    paintRange($('#setVolume'));
    $('#musicSub').textContent = !state.settings.music
      ? 'выключена'
      : music.playing
        ? music.customName || 'фоновая мелодия'
        : 'нажми, чтобы включить';
  }

  async function setMusic(on) {
    state.settings.music = on;
    saveSettings();
    if (on) await music.play();
    else music.stop();
    applyMusicUI();
  }

  function setVolume(v) {
    state.settings.volume = +v;
    saveSettings();
    music.setVolume(state.settings.volume / 100);
    applyMusicUI();
  }

  $('#musicToggle').addEventListener('click', () => setMusic(!(state.settings.music && music.playing)));
  $('#setMusic').addEventListener('change', (e) => setMusic(e.target.checked));
  $('#musicVolume').addEventListener('input', (e) => setVolume(e.target.value));
  $('#setVolume').addEventListener('input', (e) => setVolume(e.target.value));
  $('#customTrack').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    $('#customTrackName').textContent = file.name;
    await music.setCustomTrack(URL.createObjectURL(file), file.name.replace(/\.[^.]+$/, ''));
    if (!music.playing) await setMusic(true);
    applyMusicUI();
    toast('Трек заменён: ' + file.name);
  });

  // Браузер не даёт играть звук до первого действия пользователя —
  // запускаем музыку по первому клику, если она включена.
  async function tryAutoplay() {
    if (!state.settings.music || music.playing) return;
    await music.play();
    applyMusicUI();
  }
  ['pointerdown', 'keydown'].forEach((evt) =>
    document.addEventListener(evt, tryAutoplay, { once: true, capture: true })
  );

  // ---------- Настройки ----------
  function bindSettings() {
    const s = state.settings;
    const nick = $('#setNick');
    nick.value = s.nickname;
    nick.addEventListener('input', () => {
      s.nickname = nick.value.replace(/[^A-Za-z0-9_]/g, '').slice(0, 16) || 'Player';
      if (nick.value !== nick.value.replace(/[^A-Za-z0-9_]/g, '')) nick.value = nick.value.replace(/[^A-Za-z0-9_]/g, '');
      saveSettings();
      applyProfile();
    });

    const ram = $('#setRam');
    ram.value = s.ram;
    paintRange(ram);
    $('#ramValue').textContent = s.ram + ' ГБ';
    ram.addEventListener('input', () => {
      s.ram = +ram.value;
      $('#ramValue').textContent = s.ram + ' ГБ';
      paintRange(ram);
      saveSettings();
      applyProfile();
    });

    [['#setWidth', 'width'], ['#setHeight', 'height'], ['#setJava', 'javaPath']].forEach(([sel, key]) => {
      const el = $(sel);
      el.value = s[key];
      el.addEventListener('change', () => {
        s[key] = el.type === 'number' ? +el.value || defaults[key] : el.value;
        saveSettings();
      });
    });

    [['#setFullscreen', 'fullscreen'], ['#setClose', 'closeOnLaunch']].forEach(([sel, key]) => {
      const el = $(sel);
      el.checked = s[key];
      el.addEventListener('change', () => {
        s[key] = el.checked;
        saveSettings();
      });
    });

    const anim = $('#setAnim');
    anim.checked = s.animations;
    document.body.classList.toggle('no-anim', !s.animations);
    anim.addEventListener('change', () => {
      s.animations = anim.checked;
      document.body.classList.toggle('no-anim', !s.animations);
      saveSettings();
    });
  }

  // ---------- Старт ----------
  async function init() {
    applyTheme();
    applyProfile();
    bindSettings();
    updateModCounters();
    renderMods();
    music.setVolume(state.settings.volume / 100);
    applyMusicUI();
    requestAnimationFrame(moveNavIndicator);
    window.addEventListener('resize', () => {
      moveNavIndicator();
      $$('.segmented').forEach(moveSegIndicator);
    });

    if (await music.detectBundledTrack()) {
      await music.setCustomTrack(new URL('assets/music/theme.mp3', location.href).href, 'Me and the Devil');
    }
    // В Electron автозапуск разрешён, в браузере сработает после первого клика.
    if (state.settings.music) {
      await music.play().catch(() => {});
      applyMusicUI();
    }
    loadVersions();
  }

  init();
})();
