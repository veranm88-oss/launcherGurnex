// Фоновая музыка Gurnex.
// Встроенная тема — оригинальная тихая медленная блюзовая мелодия в настроении
// «Me and the Devil», синтезированная на лету (струнный звук по алгоритму Карплуса — Стронга).
// Если положить свой файл в src/assets/music/theme.mp3 (или выбрать в настройках),
// будет играть он.
(function () {
  const BPM = 62;
  const BEAT = 60 / BPM;
  const SW = 2 / 3; // шаффл: вторая восьмая в триоли
  const LOOP_BEATS = 48; // 12 тактов

  const E2 = 40, A2 = 45, B2 = 47;

  function buildSong() {
    const ev = [];
    const roots = [E2, E2, E2, E2, A2, A2, E2, E2, B2, A2, E2, B2];

    // Ритм-гитара: тихий буги-шаффл на басовых струнах.
    roots.forEach((r, bar) => {
      for (let b = 0; b < 4; b++) {
        const t = bar * 4 + b;
        if (bar === 11 && b >= 2) continue; // место под оборот
        ev.push({ t, m: r, v: 0.32, pan: -0.25 });
        ev.push({ t, m: r + 7, v: 0.16, pan: -0.25 });
        ev.push({ t: t + SW, m: r, v: 0.2, pan: -0.25 });
        ev.push({ t: t + SW, m: r + (b % 2 ? 9 : 7), v: 0.12, pan: -0.25 });
      }
    });

    // Мелодия: E-минорная пентатоника с «блюзовой» нотой.
    const lead = [
      [0, [[0, 76, 0.5], [SW, 74], [1, 71], [2, 74], [2 + SW, 71], [3, 69]]],
      [1, [[0, 67, 0.45], [1 + SW, 64]]],
      [2, [[0, 79, 0.45], [SW, 76], [1, 74], [1 + SW, 76], [2, 71]]],
      [3, [[0, 64, 0.4], [2 + SW, 67], [3, 69]]],
      [4, [[0, 72, 0.5], [SW, 69], [1, 67], [2, 69]]],
      [5, [[SW, 72], [1, 69], [2, 64]]],
      [6, [[0, 71, 0.5], [SW, 70], [1, 69], [1 + SW, 67], [2, 64]]],
      [7, [[2, 59], [2 + SW, 62], [3, 64]]],
      [8, [[0, 75, 0.45], [SW, 74], [1, 71], [2, 69]]],
      [9, [[0, 69], [SW, 72], [1, 69], [2, 67]]],
      [10, [[0, 64], [SW, 67], [1, 69], [1 + SW, 70], [2, 71]]],
      [11, [[0, 76], [0, 74, 0.3], [1, 76], [1, 73, 0.3], [2, 76], [2, 72, 0.3], [3, 71], [3, 63, 0.3], [3, 59, 0.3]]],
    ];
    lead.forEach(([bar, notes]) => {
      notes.forEach(([b, m, v]) => ev.push({ t: bar * 4 + b, m, v: v ?? 0.38, pan: 0.2, lead: true }));
    });

    ev.sort((a, b) => a.t - b.t);
    return { events: ev, roots };
  }

  class GurnexMusic {
    constructor(audioEl) {
      this.audio = audioEl;
      this.ctx = null;
      this.volume = 0.3;
      this.playing = false;
      this.customUrl = null;
      this.customName = null;
      this.song = buildSong();
      this.cache = new Map();
      this.timer = null;
      this.mediaNode = null;
    }

    _init() {
      if (this.ctx) return;
      const AC = window.AudioContext || window.webkitAudioContext;
      const ctx = (this.ctx = new AC());

      this.master = ctx.createGain();
      this.master.gain.value = 0;

      const tone = ctx.createBiquadFilter();
      tone.type = 'lowpass';
      tone.frequency.value = 2600;
      tone.Q.value = 0.4;

      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -20;
      comp.ratio.value = 3;

      this.bus = ctx.createGain();
      const dry = ctx.createGain();
      dry.gain.value = 0.8;
      const verb = ctx.createConvolver();
      verb.buffer = this._impulse(3.2, 2.4);
      const wet = ctx.createGain();
      wet.gain.value = 0.42;

      this.bus.connect(tone);
      tone.connect(dry).connect(this.master);
      tone.connect(verb).connect(wet).connect(this.master);
      this.master.connect(comp).connect(ctx.destination);

      this._crackle();
    }

    _impulse(seconds, decay) {
      const ctx = this.ctx;
      const len = Math.floor(ctx.sampleRate * seconds);
      const buf = ctx.createBuffer(2, len, ctx.sampleRate);
      for (let c = 0; c < 2; c++) {
        const d = buf.getChannelData(c);
        for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
      }
      return buf;
    }

    // Тихий треск пластинки — атмосфера старой записи.
    _crackle() {
      const ctx = this.ctx;
      const len = ctx.sampleRate * 4;
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) {
        d[i] = (Math.random() * 2 - 1) * 0.012 + (Math.random() < 0.0004 ? (Math.random() * 2 - 1) * 0.5 : 0);
      }
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 1200;
      const g = ctx.createGain();
      g.gain.value = 0.18;
      src.connect(hp).connect(g).connect(this.master);
      src.start();
    }

    // Звук щипковой струны (Карплус — Стронг), кешируется по ноте.
    _pluck(midi) {
      if (this.cache.has(midi)) return this.cache.get(midi);
      const ctx = this.ctx;
      const sr = ctx.sampleRate;
      const freq = 440 * Math.pow(2, (midi - 69) / 12);
      const len = Math.floor(sr * 3.2);
      const buf = ctx.createBuffer(1, len, sr);
      const out = buf.getChannelData(0);
      const n = Math.max(2, Math.round(sr / freq));
      const line = new Float32Array(n);
      for (let i = 0; i < n; i++) line[i] = Math.random() * 2 - 1;
      for (let pass = 0; pass < 2; pass++) {
        for (let i = 1; i < n; i++) line[i] = (line[i] + line[i - 1]) * 0.5;
      }
      const damp = midi < 52 ? 0.994 : 0.997;
      let idx = 0;
      for (let i = 0; i < len; i++) {
        const cur = line[idx];
        const nxt = line[(idx + 1) % n];
        line[idx] = (cur + nxt) * 0.5 * damp;
        out[i] = cur * Math.min(1, (len - i) / (sr * 0.3));
        idx = (idx + 1) % n;
      }
      this.cache.set(midi, buf);
      return buf;
    }

    _note(ev, when) {
      const ctx = this.ctx;
      const src = ctx.createBufferSource();
      src.buffer = this._pluck(ev.m);
      const g = ctx.createGain();
      g.gain.value = ev.v * (0.85 + Math.random() * 0.3);
      const p = ctx.createStereoPanner();
      p.pan.value = ev.pan;
      src.connect(g).connect(p).connect(this.bus);
      src.start(when);
      src.stop(when + 3.2);
    }

    _pad(root, when) {
      const ctx = this.ctx;
      const dur = 4 * BEAT;
      [root + 12, root + 19].forEach((m, i) => {
        const o = ctx.createOscillator();
        o.type = 'sine';
        o.frequency.value = 440 * Math.pow(2, (m - 69) / 12);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0, when);
        g.gain.linearRampToValueAtTime(i ? 0.018 : 0.028, when + dur * 0.4);
        g.gain.linearRampToValueAtTime(0, when + dur + 0.6);
        o.connect(g).connect(this.bus);
        o.start(when);
        o.stop(when + dur + 0.7);
      });
    }

    _tick() {
      const ctx = this.ctx;
      const horizon = ctx.currentTime + 1.5;
      const { events, roots } = this.song;
      for (;;) {
        const ev = events[this.idx];
        const when = this.loopStart + (this.loop * LOOP_BEATS + ev.t) * BEAT;
        if (when > horizon) break;
        if (when >= ctx.currentTime - 0.05) {
          const human = ev.lead ? (Math.random() - 0.5) * 0.03 : 0;
          this._note(ev, Math.max(ctx.currentTime, when + human));
          if (Number.isInteger(ev.t) && ev.t % 4 === 0 && !ev.lead && ev.m === roots[ev.t / 4]) {
            this._pad(roots[ev.t / 4], when);
          }
        }
        this.idx++;
        if (this.idx >= events.length) {
          this.idx = 0;
          this.loop++;
        }
      }
    }

    _gainTarget() {
      // Нелинейная кривая: на малых значениях громкость меняется мягче.
      return Math.pow(this.volume, 1.6) * 0.9;
    }

    async play() {
      this._init();
      if (this.ctx.state !== 'running') await this.ctx.resume();
      if (this.ctx.state !== 'running') return false;
      this.playing = true;
      const now = this.ctx.currentTime;
      this.master.gain.cancelScheduledValues(now);
      this.master.gain.setTargetAtTime(this._gainTarget(), now, 0.8);

      if (this.customUrl) {
        this._stopSequencer();
        this._attachMedia();
        if (this.audio.src !== this.customUrl) this.audio.src = this.customUrl;
        try { await this.audio.play(); } catch (e) { return false; }
      } else if (!this.timer) {
        this.audio.pause();
        this.loopStart = this.ctx.currentTime + 0.15;
        this.loop = 0;
        this.idx = 0;
        this._tick();
        this.timer = setInterval(() => this._tick(), 120);
      }
      return true;
    }

    stop() {
      this.playing = false;
      if (!this.ctx) return;
      const now = this.ctx.currentTime;
      this.master.gain.cancelScheduledValues(now);
      this.master.gain.setTargetAtTime(0, now, 0.25);
      clearTimeout(this._stopT);
      this._stopT = setTimeout(() => {
        if (this.playing) return;
        this._stopSequencer();
        this.audio.pause();
        this.ctx.suspend();
      }, 1200);
    }

    _stopSequencer() {
      clearInterval(this.timer);
      this.timer = null;
    }

    _attachMedia() {
      if (this.mediaNode) return;
      this.mediaNode = this.ctx.createMediaElementSource(this.audio);
      this.mediaNode.connect(this.master);
    }

    setVolume(v) {
      this.volume = Math.max(0, Math.min(1, v));
      if (this.ctx && this.playing) {
        this.master.gain.setTargetAtTime(this._gainTarget(), this.ctx.currentTime, 0.1);
      }
    }

    async setCustomTrack(url, name) {
      this.customUrl = url;
      this.customName = name;
      if (this.playing) {
        this._stopSequencer();
        await this.play();
      }
    }

    // Ищет src/assets/music/theme.mp3 — если файл есть, играет его вместо встроенной темы.
    detectBundledTrack() {
      return new Promise((resolve) => {
        const probe = new Audio();
        const done = (ok) => {
          probe.removeAttribute('src');
          resolve(ok);
        };
        probe.addEventListener('loadedmetadata', () => done(true), { once: true });
        probe.addEventListener('error', () => done(false), { once: true });
        probe.preload = 'metadata';
        probe.src = 'assets/music/theme.mp3';
      });
    }
  }

  window.GurnexMusic = GurnexMusic;
})();
