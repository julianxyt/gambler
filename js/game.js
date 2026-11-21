(() => {
  'use strict';

  // ---------- Config ----------
  // Pays are multiples of the total bet, per way (243 ways).
  // Tuned with a simulation (scratchpad): about 1 paying spin in 9, Hold & Spin about 1 in 75,
  // free spins about 1 in 100. The girls are not line symbols: they are the Hold & Spin cash coins.
  const PAYS = {
    seven: [2, 6, 20], diamond: [1.6, 4, 15], star: [1.2, 3, 10], bar: [1, 3, 8],
    melon: [0.8, 2, 6], grapes: [0.8, 2, 6], cherry: [0.6, 1.5, 5],
    A: [0.5, 1.2, 4], K: [0.4, 1, 3], Q: [0.4, 1, 3], J: [0.3, 0.8, 2.5],
  };
  const NAMES = { seven: '7', diamond: 'Diamond', star: 'Star', bar: 'BAR', melon: 'Watermelon', grapes: 'Grapes', cherry: 'Cherry', A: 'A', K: 'K', Q: 'Q', J: 'J' };
  const WEIGHTS = { seven: 6, diamond: 7, star: 7, bar: 8, melon: 8, grapes: 8, cherry: 8, A: 8, K: 8, Q: 8, J: 8, wild: 2.3, orb: 15, scatter: 6 }; // wild 2.3: ~1 spin in 7 pays
  const FS_WEIGHTS = { ...WEIGHTS, wild: 11 }; // extra wilds during free spins so the feature rarely pays nothing
  const GIRLS = ['kgirl', 'abg', 'pomw', 'pomb'];
  const FS_COUNT = 8, FS_MULT = 2;   // free spins
  // The rigged feature (Hold & Spin with the headphones, then the reveal) always lands on paid spin
  // 14, 15 or 16, picked at random. Before that the game plays normally (features can land by chance).
  const RIG_SPIN = 14 + Math.floor(Math.random() * 3);
  const QUIET_SPINS = 0;
  const JP = { MINI: 10, MINOR: 25, MAJOR: 150, GRAND: 1000 }; // x bet
  const BETS = [0.5, 1, 2, 3, 5, 10, 20, 50];
  const ORB_MULTS = [[1, 20], [2, 18], [3, 14], [4, 10], [5, 9], [8, 6], [10, 4], [15, 2], [20, 1]];
  const TRIGGER = 6, RESPIN_ODDS = 0.11, START_CREDIT = 1000;

  // ---------- State ----------
  const $ = (id) => document.getElementById(id);
  const S = {
    credit: load('fp_credit', START_CREDIT), betIdx: load('fp_bet', 1),
    grid: null, busy: false, auto: false, turbo: load('fp_turbo', false), feature: false,
    spins: 0, rig: false, rigDone: false, revealPending: false, fs: null, roundWin: 0, lastWin: 0, forced: null,
  };
  const bet = () => BETS[S.betIdx];
  function load(k, d) { try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch (e) { return d; } }
  function save() { try { localStorage.setItem('fp_credit', JSON.stringify(S.credit)); localStorage.setItem('fp_bet', JSON.stringify(S.betIdx)); localStorage.setItem('fp_turbo', JSON.stringify(S.turbo)); } catch (e) { } }
  const fmt = (v) => '$' + (Math.round(v * 100) / 100).toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const sleep = (ms) => new Promise((r) => setTimeout(r, S.turbo ? ms * 0.6 : ms));

  // ---------- Random ----------
  function weighted(pairs) {
    let tot = 0; for (const [, w] of pairs) tot += w;
    let r = Math.random() * tot;
    for (const [v, w] of pairs) { if ((r -= w) < 0) return v; }
    return pairs[pairs.length - 1][0];
  }
  function pickSym(reel) {
    const pairs = Object.entries(S.fs ? FS_WEIGHTS : WEIGHTS).filter(([s]) => (s !== 'wild' || (reel >= 1 && reel <= 3)) && (s !== 'scatter' || reel % 2 === 0));
    return weighted(pairs);
  }
  const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const girl = () => GIRLS[(Math.random() * GIRLS.length) | 0];
  function makeOrb(inFeature) { return Object.assign(rollOrb(inFeature), { g: girl() }); }
  function rollOrb(inFeature) {
    const r = Math.random();
    if (r < 0.03) return { s: 'orb', jp: 'MINOR' };
    if (r < 0.09) return { s: 'orb', jp: 'MINI' };
    return { s: 'orb', v: weighted(ORB_MULTS) * bet() };
  }
  // MAJOR is the headphones: a prize, not cash. It only ever lands in the rigged feature.
  const MAJOR_PRIZE = 'HEADPHONES';
  const orbValue = (c) => (c.jp === 'MAJOR' ? 0 : c.jp ? JP[c.jp] * bet() : c.v);
  function makeCell(reel) { const s = pickSym(reel); return s === 'orb' ? makeOrb(false) : { s }; }
  function makeGrid() { return [0, 1, 2, 3, 4].map((r) => [0, 1, 2].map(() => makeCell(r))); }

  // ---------- Rendering ----------
  const reelsEl = $('reels');
  const reels = [];
  function symHTML(c) {
    if (!c || c.s === 'empty') return '<div class="sym empty"></div>';
    if (c.s === 'orb') {
      const label = c.jp || fmt(c.v).replace('.00', '');
      return `<div class="sym orb"><svg viewBox="0 0 100 100"><use href="#sym-${c.g || 'kgirl'}"/></svg><span class="orb-val ${c.jp || ''}">${label}</span></div>`;
    }
    return `<div class="sym s-${c.s}"><svg viewBox="0 0 100 100"><use href="#sym-${c.s}"/></svg></div>`;
  }
  const cellHTML = (c) => `<div class="cell">${symHTML(c)}</div>`;
  const padCell = (r) => { const s = pickSym(r); return cellHTML({ s: s === 'orb' ? 'A' : s }); };
  function buildReels() {
    reelsEl.innerHTML = '';
    for (let r = 0; r < 5; r++) {
      const reel = document.createElement('div'); reel.className = 'reel';
      const strip = document.createElement('div'); strip.className = 'strip';
      reel.appendChild(strip); reelsEl.appendChild(reel);
      reels.push({ el: reel, strip });
    }
  }
  function renderReel(r, cells) {
    reels[r].strip.style.transform = 'translateY(0)';
    reels[r].strip.innerHTML = padCell(r) + cells.map(cellHTML).join('');
  }
  const symEl = (r, row) => reels[r].strip.children[row + 1].firstElementChild;

  function sizeCells() {
    const root = document.documentElement;
    const vw = Math.min(root.clientWidth || innerWidth, screen.width || innerWidth, 980);
    const cur = parseFloat(getComputedStyle(reelsEl).gridTemplateColumns) || 120; // resolved px of one column
    const cab = document.querySelector('.cabinet').getBoundingClientRect().width;
    const appPad = parseFloat(getComputedStyle($('app')).paddingLeft) * 2;
    const chrome = cab - 5 * cur + 24 + appPad; // 24 = gold rings drawn with box-shadow
    const byWidth = (vw - chrome) / 5;
    const byHeight = (innerHeight - 400) / 3;
    const cell = Math.max(44, Math.min(140, byWidth, Math.max(byHeight, 64)));
    root.style.setProperty('--cell', Math.floor(cell) + 'px');
  }
  const cellH = () => reels[0].el.clientHeight / 3;

  function updateUI() {
    $('credit').textContent = fmt(S.credit);
    $('bet').textContent = fmt(bet());
    document.querySelectorAll('.jp-val').forEach((el) => { el.textContent = el.dataset.jp === 'MAJOR' ? '??' : fmt(JP[el.dataset.jp] * bet()); });
    const lock = S.busy || S.feature;
    $('betUp').disabled = lock || S.betIdx >= BETS.length - 1;
    $('betDown').disabled = lock || S.betIdx <= 0;
    $('btnTurbo').classList.toggle('on', S.turbo);
    $('btnAuto').classList.toggle('on', S.auto);
    $('btnSpin').classList.toggle('auto', S.auto);
    $('btnSound').classList.toggle('on', Sound.enabled);
    $('btnSpin').disabled = (S.busy && !S.auto) || S.feature;
    $('btnGamble').disabled = S.busy || S.auto || !(S.lastWin > 0);
    $('btnGamble').classList.toggle('ready', !$('btnGamble').disabled);
    save();
  }
  function message(t, big) { const m = $('message'); m.textContent = t; m.classList.toggle('big', !!big); }
  function setWin(v) { $('win').textContent = fmt(v); }

  // ---------- Reel spin ----------
  // Strip layout (top -> bottom): pad, final x3, filler xN, current x3. We scroll from "current" up to "final".
  function spinReel(r, final, duration) {
    return new Promise((res) => {
      const { el, strip } = reels[r];
      const h = cellH();
      const n = Math.max(8, Math.round(duration / (S.turbo ? 38 : 50)));
      const cur = S.grid ? S.grid[r] : final;
      const filler = Array.from({ length: n }, () => makeCell(r));
      strip.innerHTML = padCell(r) + [...final, ...filler, ...cur].map(cellHTML).join('');
      const start = -(n + 3) * h;
      strip.style.transform = `translateY(${start}px)`;
      el.classList.add('spinning'); el.classList.remove('land');
      const t0 = performance.now();
      let lastIdx = 0;
      const ease = (p) => 1 - Math.pow(1 - p, 2.6);
      function frame(now) {
        const p = Math.min(1, (now - t0) / duration);
        const y = start * (1 - ease(p));
        strip.style.transform = `translateY(${y}px)`;
        const idx = Math.floor(-y / h);
        if (idx !== lastIdx) { lastIdx = idx; Sound.reelTick(); }
        if (p > 0.88) el.classList.remove('spinning');
        if (p < 1) { requestAnimationFrame(frame); return; }
        renderReel(r, final);
        void el.offsetWidth; el.classList.add('land');
        res();
      }
      requestAnimationFrame(frame);
    });
  }

  // ---------- Wins ----------
  function evaluate(grid) {
    const wins = [];
    for (const sym of Object.keys(PAYS)) {
      let ways = 1, k = 0; const cells = [];
      for (let r = 0; r < 5; r++) {
        const hits = [];
        grid[r].forEach((c, row) => { if (c.s === sym || (c.s === 'wild' && r > 0)) hits.push(row); });
        if (!hits.length) break;
        if (r === 0 && !grid[0].some((c) => c.s === sym)) break;
        ways *= hits.length; k++;
        hits.forEach((row) => cells.push([r, row]));
      }
      if (k >= 3) wins.push({ sym, k, ways, amount: PAYS[sym][k - 3] * ways * bet(), cells });
    }
    return wins;
  }

  // ---------- Character animations ----------
  const CHARS = ['kgirl', 'abg', 'pomw', 'pomb'];
  const SHORT = { kgirl: 'CUTIE & BROWN POM', abg: 'BADDIE & BROWN POM', pomw: 'CUTIE & WHITE POM', pomb: 'BADDIE & WHITE POM' };
  const fxEl = $('fx');
  let fxTimer = null;
  const FX_GLYPHS = ['\u2665', '\u2665', '\u2726', '\u2727', '\u2764'];
  const FX_COLORS = ['#ff5f9e', '#ff8fc0', '#ffe066', '#fff', '#c58cff'];
  function burstAt(el, n = 6) {
    const fr = fxEl.getBoundingClientRect(), b = el.getBoundingClientRect();
    for (let i = 0; i < n; i++) {
      const p = document.createElement('span');
      p.className = 'fx-p';
      p.textContent = FX_GLYPHS[(Math.random() * FX_GLYPHS.length) | 0];
      p.style.left = (b.left - fr.left + b.width * (0.2 + Math.random() * 0.6)) + 'px';
      p.style.top = (b.top - fr.top + b.height * (0.35 + Math.random() * 0.4)) + 'px';
      p.style.setProperty('--dx', ((Math.random() - 0.5) * 70).toFixed(0) + 'px');
      p.style.setProperty('--rot', ((Math.random() - 0.5) * 60).toFixed(0) + 'deg');
      p.style.animationDelay = (Math.random() * 0.35).toFixed(2) + 's';
      p.style.color = FX_COLORS[(Math.random() * FX_COLORS.length) | 0];
      fxEl.appendChild(p);
      setTimeout(() => p.remove(), 1800);
    }
  }
  function charFx(els) {
    if (!els.length) return;
    Sound.sparkle();
    const go = () => els.forEach((e) => burstAt(e, 4));
    go(); fxTimer = setInterval(go, 1300);
  }

  // Full-reel showcase: a portrait zooms out of the reels with rays and a heart burst. Tap to skip.
  function charShowcase({ pic, line1, line2, big }) {
    return new Promise((res) => {
      const el = $('showcase'), img = $('scPic');
      img.src = `img/icons/${pic}.png`;
      $('scKind').textContent = line1;
      $('scName').textContent = line2;
      el.className = 'showcase' + (big ? ' k5' : ''); el.hidden = false;
      Sound.charShow(big ? 5 : 3);
      const t1 = setTimeout(() => burstAt(img, 18), 250), t2 = setTimeout(() => burstAt(img, 14), 950);
      let done = false, t3 = 0;
      const end = () => {
        if (done) return; done = true;
        clearTimeout(t1); clearTimeout(t2); clearTimeout(t3);
        el.classList.add('out');
        setTimeout(() => { el.hidden = true; el.className = 'showcase'; res(); }, 280);
      };
      t3 = setTimeout(end, S.turbo ? 1300 : 2300);
      el.onclick = end;
    });
  }

  function clearWins() {
    clearInterval(fxTimer); fxTimer = null;
    reelsEl.classList.remove('has-win');
    reelsEl.querySelectorAll('.sym.win').forEach((e) => e.classList.remove('win', 'char'));
  }
  function showWins(wins) {
    reelsEl.classList.add('has-win');
    const chars = new Set();
    wins.forEach((w) => w.cells.forEach(([r, row]) => {
      const e = symEl(r, row); e.classList.add('win');
      if (CHARS.includes(w.sym) && e.classList.contains('s-' + w.sym)) { e.classList.add('char'); chars.add(e); }
    }));
    charFx([...chars]);
  }

  function rollup(el, from, to, ms) {
    return new Promise((res) => {
      const t0 = performance.now(); let i = 0, skip = false;
      const stop = () => { skip = true; };
      el._skip = stop;
      function f(now) {
        const p = skip ? 1 : Math.min(1, (now - t0) / ms);
        el.textContent = fmt(from + (to - from) * p);
        if (p < 1) { Sound.rollupTick(i++); requestAnimationFrame(f); } else { el._skip = null; res(); }
      }
      requestAnimationFrame(f);
    });
  }

  async function payWin(total, title, opts = {}) {
    const ratio = total / bet();
    title = title || (ratio >= 100 ? 'EPIC WIN' : ratio >= 40 ? 'MEGA WIN' : ratio >= 15 ? 'BIG WIN' : ratio >= 5 ? 'GREAT WIN' : 'WIN');
    await bigWin(total, title, ratio, opts);
    S.credit += total; S.roundWin += total; setWin(S.roundWin); updateUI();
  }

  // ---------- Win screen (the only place the fanfare plays) ----------
  const coinRain = (() => {
    const cv = $('coinRain'), g = cv.getContext('2d');
    let parts = [], running = false, rate = 0;
    function resize() { cv.width = innerWidth * devicePixelRatio; cv.height = innerHeight * devicePixelRatio; }
    function spawn() {
      const s = (14 + Math.random() * 16) * devicePixelRatio;
      parts.push({ x: Math.random() * cv.width, y: -s * 2, vx: (Math.random() - 0.5) * 2, vy: 2 + Math.random() * 5, r: s, a: Math.random() * 6, va: 0.08 + Math.random() * 0.2 });
    }
    function draw(p) {
      const sx = Math.cos(p.a);
      g.save(); g.translate(p.x, p.y); g.scale(Math.abs(sx) < 0.08 ? 0.08 : sx, 1);
      const gr = g.createRadialGradient(-p.r * 0.3, -p.r * 0.3, p.r * 0.1, 0, 0, p.r);
      gr.addColorStop(0, '#fff6c4'); gr.addColorStop(0.5, '#ffd54a'); gr.addColorStop(1, '#8a5506');
      g.fillStyle = gr; g.beginPath(); g.arc(0, 0, p.r, 0, Math.PI * 2); g.fill();
      g.strokeStyle = '#7a4a08'; g.lineWidth = p.r * 0.12; g.stroke();
      g.fillStyle = '#7a1a08'; const q = p.r * 0.28; g.fillRect(-q, -q, q * 2, q * 2);
      g.restore();
    }
    function tick() {
      if (!running && !parts.length) return;
      g.clearRect(0, 0, cv.width, cv.height);
      if (running) for (let i = 0; i < rate; i++) if (Math.random() < 0.5) spawn();
      parts = parts.filter((p) => p.y < cv.height + 60);
      for (const p of parts) { p.vy += 0.15; p.x += p.vx; p.y += p.vy; p.a += p.va; draw(p); }
      requestAnimationFrame(tick);
    }
    addEventListener('resize', resize);
    return {
      start(level) { resize(); rate = 1 + level * 2; if (!running) { running = true; requestAnimationFrame(tick); } },
      stop() { running = false; },
      clear() { running = false; parts = []; g.clearRect(0, 0, cv.width, cv.height); },
    };
  })();

  // Chest win screen: the chest drops in, rattles, bursts open, and the prize rises out of it,
  // growing slowly while it counts up. Then it breathes (gentle zoom in/out) until tapped.
  // Tap during the rise to skip to the end; tap while breathing to collect.
  function chestCoins(n) {
    const box = $('chestCoins');
    for (let i = 0; i < n; i++) {
      const c = document.createElement('i');
      const ang = (-90 + (Math.random() - 0.5) * 110) * Math.PI / 180, dist = 120 + Math.random() * 220;
      c.style.setProperty('--x', (Math.cos(ang) * dist).toFixed(0) + 'px');
      c.style.setProperty('--y', (Math.sin(ang) * dist).toFixed(0) + 'px');
      c.style.setProperty('--r', ((Math.random() - 0.5) * 900).toFixed(0) + 'deg');
      c.style.animationDelay = (Math.random() * 0.25).toFixed(2) + 's';
      box.appendChild(c);
      setTimeout(() => c.remove(), 1800);
    }
  }
  function bigWin(total, title, ratio, opts = {}) {
    return new Promise((res) => {
      const ov = $('bigwin'), stage = $('chestStage'), amt = $('bigwinAmount');
      const tier = opts.perfume ? 3 : /HOLD|FREE|FULL/.test(title) ? Math.max(1, ratio >= 100 ? 3 : ratio >= 40 ? 2 : 1)
        : ratio >= 100 ? 3 : ratio >= 40 ? 2 : ratio >= 15 ? 1 : 0;
      $('bigwinTitle').textContent = title;
      amt.textContent = fmt(0);
      $('chestCoins').innerHTML = '';
      stage.className = 'chest-stage t' + tier + (opts.perfume ? ' perfume reeling' : '');
      // Prize chests (perfume, headphones) show a picture instead of cash.
      if (opts.perfume) $('prizeImg').src = opts.prize || 'img/prize/reveal.png';
      ov.hidden = false;
      void stage.offsetWidth;
      stage.classList.add('drop');
      Sound.duckMusic(true);
      Sound.chestShake();

      const fast = S.turbo ? 0.6 : 1;
      const riseMs = (opts.perfume ? 4000 : tier ? 3000 : 2200) * fast;
      let phase = 'intro', closed = false, autoT = 0;
      const timers = [];
      const later = (ms, f) => timers.push(setTimeout(f, ms * fast));

      later(650, () => stage.classList.add('shake'));
      later(1250, () => open());
      function open() {
        if (phase !== 'intro') return;
        phase = 'rise';
        stage.classList.remove('shake'); stage.classList.add('open', 'rise');
        Sound.chestOpen(tier);
        chestCoins(tier ? 26 : 14);
        if (tier) { coinRain.start(tier); Sound.bigWinFanfare(tier); } else Sound.winSmall(ratio);
        if (opts.perfume) reel.run(riseMs).then(breathe);
        else rollup(amt, 0, total, riseMs).then(breathe);
      }
      // Prize chests: the prize rises as a dark glowing silhouette, trembling harder and harder,
      // then flashes into full colour and only then does its name appear.
      const reel = {
        stop: false,
        async run(ms) {
          const box = $('prizeReel');
          box.classList.remove('lit'); box.style.setProperty('--p', 0);
          Sound.anticipation(ms / 1000);
          const t0 = performance.now();
          while (!this.stop && performance.now() - t0 < ms) {
            box.style.setProperty('--p', ((performance.now() - t0) / ms).toFixed(3));
            await sleep(50);
          }
          box.style.setProperty('--p', 1);
          box.classList.add('lit');
          Sound.jackpot();
          stage.classList.remove('reeling');
          await sleep(600);
        },
      };
      function breathe() {
        if (phase === 'breathe' || closed) return;
        phase = 'breathe';
        amt.textContent = fmt(total);
        stage.classList.add('breathe');
        coinRain.stop();
        if (S.auto) autoT = setTimeout(close, 2500);
      }
      function close() {
        if (closed) return; closed = true; reel.stop = true;
        timers.forEach(clearTimeout); clearTimeout(autoT);
        ov.removeEventListener('click', onClick);
        Sound.stopFanfare(); Sound.duckMusic(false); coinRain.clear(); ov.hidden = true;
        stage.className = 'chest-stage';
        message(opts.prize ? `YOU WON THE ${title}!` : opts.perfume ? 'ENJOY!' : title + ' ' + fmt(total), true);
        res();
      }
      function onClick() {
        if (phase === 'intro') { timers.forEach(clearTimeout); open(); return; }
        if (phase === 'rise' && opts.perfume) { reel.stop = true; stage.classList.add('skip'); return; }
        if (phase === 'rise') { if (amt._skip) amt._skip(); stage.classList.add('skip'); breathe(); return; }
        close();
      }
      ov.addEventListener('click', onClick);
    });
  }

  function banner(title, sub, ms) {
    $('bannerTitle').textContent = title; $('bannerSub').textContent = sub || '';
    const b = $('banner'); b.hidden = false;
    const inner = b.firstElementChild; inner.style.animation = 'none'; void inner.offsetWidth; inner.style.animation = '';
    return sleep(ms).then(() => { b.hidden = true; });
  }

  // ---------- Base spin ----------
  async function spin() {
    if (S.busy || S.feature) return;
    Sound.init();
    if (S.credit < bet()) {
      message(S.credit < BETS[0] ? 'OUT OF CREDIT - TAP CREDIT TO REFILL' : 'LOWER YOUR BET');
      S.auto = false; updateUI(); return;
    }
    S.busy = true; S.credit -= bet(); S.roundWin = 0; S.lastWin = 0; setWin(0); clearWins(); updateUI();
    S.spins++;
    let forced = S.forced; S.forced = null;
    if (!forced && (S.forceRig || (S.spins === RIG_SPIN && !S.rigDone))) { S.forceRig = false; forced = rigGrid(); S.rig = true; S.auto = false; }
    if (!forced && S.spins <= QUIET_SPINS) forced = quietGrid();

    const res = await playReels(forced, false);
    await settle(res, false);
    if (res.scatters >= 3) { await sleep(400); await freeSpins(); }

    S.lastWin = S.roundWin;
    S.busy = false; updateUI();
    // After the rigged feature: a headphones gamble he can't lose; the perfume surprise follows it.
    if (S.revealPending) {
      S.busy = true; S.auto = false; updateUI();
      await sleep(600);
      await say('BUT DO YOU WANT TO DOUBLE IT AND GIVE IT TO THE NEXT PERSON?', 2600);
      prizeGambleOpen();
      return;
    }
    if (S.auto) setTimeout(() => { if (S.auto) spin(); }, S.lastWin > 0 ? 900 : 400);
  }

  // Spin all five reels to `forced` (or a random grid). Returns what landed.
  async function playReels(forced, free) {
    message(free ? 'FREE SPIN...' : S.spins % 2 ? 'WISHING FOR GOOD FORTUNE...' : 'WISHING FOR HINGE BADDIES...');
    Sound.spinStart();
    const grid = forced || makeGrid();
    const base = S.turbo ? 380 : 750, step = S.turbo ? 110 : 210, anticMs = S.turbo ? 900 : 1700;
    const orbsBefore = (r) => grid.slice(0, r).flat().filter((c) => c.s === 'orb').length;
    const scatBefore = (r) => grid.slice(0, r).flat().filter((c) => c.s === 'scatter').length;
    const antic = [0, 1, 2, 3, 4].map((r) => (r >= 3 && orbsBefore(r) >= TRIGGER - 3 + (r - 3)) || (r === 4 && scatBefore(4) >= 2));
    let extra = 0, landed = 0, scat = 0;
    const jobs = grid.map((cells, r) => {
      if (antic[r]) extra += anticMs;
      const dur = base + r * step + extra;
      return spinReel(r, cells, dur).then(() => {
        Sound.reelStop(r);
        reels[r].el.classList.remove('antic');
        cells.forEach((c, row) => {
          if (c.s === 'scatter') { const n = scat++; setTimeout(() => { Sound.scatterLand(n); symEl(r, row).classList.add('pop'); }, 40 + row * 30); }
          if (c.s !== 'orb') return;
          const n = landed++;
          setTimeout(() => { Sound.coinHit(n, !!c.jp); symEl(r, row).classList.add('pop'); }, 40 + row * 30);
        });
        if (antic[r + 1]) { reels[r + 1].el.classList.add('antic'); Sound.anticipation(anticMs / 1000); }
      });
    });
    await Promise.all(jobs);
    S.grid = grid;
    await sleep(250);
    return { grid, landed, scatters: scat };
  }

  // Pay line wins (doubled in free spins) and start Hold & Spin if enough girls landed.
  async function settle({ grid, landed, scatters }, free) {
    const wins = evaluate(grid);
    if (free) wins.forEach((w) => { w.amount *= FS_MULT; });
    const total = wins.reduce((a, w) => a + w.amount, 0);
    if (total > 0) {
      showWins(wins);
      if (free) {
        Sound.winSmall(total / bet());
        const from = S.fs.total; S.fs.total += total; fsHud();
        message(`WIN ${fmt(total)} (x${FS_MULT})`, true);
        await rollup($('win'), from, S.fs.total, Math.min(1600, 400 + (total / bet()) * 120));
      } else {
        await payWin(total);
      }
    } else if (!free) {
      message(landed >= 3 ? `${landed} BADDIES - ${TRIGGER} TRIGGER HOLD & SPIN` : scatters === 2 ? '2 FREE SPINS SYMBOLS - SO CLOSE!' : 'SPIN AGAIN');
    }
    if (landed >= TRIGGER) { await sleep(500); clearWins(); await holdAndSpin(grid); }
  }

  // Early spins: a normal random grid, but capped below the Hold & Spin and free spins triggers.
  function quietGrid() {
    const g = makeGrid();
    const filler = () => ({ s: ['J', 'Q', 'K', 'A', 'cherry', 'grapes'][(Math.random() * 6) | 0] });
    const cells = shuffle(g.flatMap((col, r) => col.map((c, row) => [r, row])));
    let orbs = 0, scat = 0;
    for (const [r, row] of cells) {
      const c = g[r][row];
      if (c.s === 'orb' && ++orbs >= TRIGGER) g[r][row] = filler();
      if (c.s === 'scatter' && ++scat >= 3) g[r][row] = filler();
    }
    return g;
  }

  // The rigged spin: exactly six baddies, no free spins symbols.
  function rigGrid() {
    const g = makeGrid().map((col) => col.map((c) => (c.s === 'orb' || c.s === 'scatter' ? { s: ['J', 'Q', 'K', 'cherry'][(Math.random() * 4) | 0] } : c)));
    shuffle([...Array(15).keys()]).slice(0, TRIGGER).forEach((i) => { g[Math.floor(i / 3)][i % 3] = makeOrb(false); });
    return g;
  }

  // ---------- Free spins ----------
  function fsHud() { if (S.fs) $('fsLeft').textContent = S.fs.left; }
  async function freeSpins() {
    clearWins();
    S.fs = { left: FS_COUNT, total: 0 };
    Sound.featureTrigger();
    await banner('FREE SPINS', `${FS_COUNT} FREE SPINS - ALL WINS x${FS_MULT}`, 2600);
    $('app').classList.add('freespins'); fsHud(); setWin(0);
    while (S.fs.left > 0) {
      S.fs.left--; fsHud(); clearWins();
      const res = await playReels(null, true);
      await settle(res, true);
      if (res.scatters >= 3) {
        S.fs.left += FS_COUNT; fsHud(); Sound.featureTrigger();
        await banner('RETRIGGER', `+${FS_COUNT} FREE SPINS`, 1800);
      }
      await sleep(S.fs.left ? 650 : 900);
    }
    $('app').classList.remove('freespins');
    const total = S.fs.total; S.fs = null; clearWins();
    if (total > 0) await payWin(total, 'FREE SPINS WIN');
    else message('FREE SPINS OVER');
  }

  // ---------- Hold & Spin ----------
  async function holdAndSpin(grid) {
    S.feature = true; clearWins(); updateUI();
    const app = $('app'); const hud = $('respinHud');
    const girlsIn = grid.flat().filter((c) => c.s === 'orb');
    await charShowcase({ pic: girlsIn[(Math.random() * girlsIn.length) | 0].g, line1: `${girlsIn.length} BADDIES!`, line2: 'HOLD & SPIN', big: true });
    Sound.featureTrigger();
    await banner('HOLD & SPIN', '3 RESPINS - EVERY NEW BADDIE RESETS TO 3', 2600);
    app.classList.add('feature');

    const cells = [];
    for (let r = 0; r < 5; r++) for (let row = 0; row < 3; row++) cells.push({ r, row, orb: grid[r][row].s === 'orb' ? grid[r][row] : null });
    for (let r = 0; r < 5; r++) renderReel(r, [0, 1, 2].map((row) => grid[r][row].s === 'orb' ? grid[r][row] : { s: 'empty' }));

    let respins = 3, locked = cells.filter((c) => c.orb).length, majorLanded = false;
    const lights = () => hud.querySelectorAll('i').forEach((el, i) => el.classList.toggle('on', i < respins));
    lights();
    message('BADDIES LOCK IN PLACE');
    await sleep(900);
    message('TAP EMPTY SPOTS TO BOOST THEM');

    // Tap an empty spot to boost it (up to 3 taps): it glows and is more likely to land a baddie.
    const holderOf = (c) => reels[c.r].strip.children[c.row + 1];
    const onTap = (e) => {
      const el = e.target.closest('.cell'); if (!el) return;
      const c = cells.find((x) => holderOf(x) === el);
      if (!c || c.orb || (c.boost || 0) >= 3) return;
      c.boost = (c.boost || 0) + 1;
      el.classList.add('boost'); el.dataset.boost = c.boost;
      Sound.sparkle(); burstAt(el, 3);
    };
    reelsEl.addEventListener('click', onTap);

    while (respins > 0 && locked < 15) {
      respins--; lights();
      Sound.respinStart();
      const empties = cells.filter((c) => !c.orb);
      // Rigged run: normal odds (plus taps), but the MAJOR (headphones) is guaranteed. It may come early
      // by chance, and if it still hasn't landed by the last respin (or the last spot), it lands then,
      // on the spot he boosted most.
      const majorNow = S.rig && !majorLanded && (respins === 0 || empties.length <= 1 || Math.random() < 0.15);
      const majorCell = majorNow ? empties.slice().sort((a, b) => (b.boost || 0) - (a.boost || 0) || Math.random() - 0.5)[0] : null;
      let gotNew = false;
      // Slower than the base game: each empty spot keeps streaking for a while, and they settle one by one.
      const order = shuffle(empties.slice());
      await Promise.all(empties.map((c) => spinCell(c, (S.turbo ? 700 : 1500) + order.indexOf(c) * (S.turbo ? 120 : 260),
        c === majorCell ? 'MAJOR' : undefined).then((orb) => {
        if (!orb) return;
        c.orb = orb; gotNew = true;
        Sound.coinHit(locked, !!orb.jp); locked++;
        if (orb.jp === 'MAJOR') { majorLanded = true; flashJackpot('MAJOR'); message(`MAJOR - ${MAJOR_PRIZE}!`, true); }
        else message(`${locked} BADDIES`);
      })));
      if (gotNew && locked < 15) {
        // A new baddie doesn't always give the full 3 back: sometimes it's a full reset, otherwise just +1.
        respins = Math.random() < 0.3 ? 3 : Math.min(3, respins + 1); lights(); Sound.respinReset();
        hud.classList.remove('reset'); void hud.offsetWidth; hud.classList.add('reset');
      }
      await sleep(1000);
    }

    // Collect
    await sleep(400);
    message('COLLECTING...');
    let total = 0; setWin(0);
    for (let i = 0; i < cells.length; i++) {
      const c = cells[i]; if (!c.orb) continue;
      const el = symEl(c.r, c.row);
      el.classList.add('collect');
      const v = orbValue(c.orb);
      if (c.orb.jp) { Sound.jackpot(); flashJackpot(c.orb.jp); } else Sound.collect(i);
      const from = total; total += v;
      if (c.orb.jp === 'MAJOR') {
        await banner('MAJOR PRIZE', '', 1800);
        await bigWin(0, MAJOR_PRIZE, 0, { perfume: true, prize: 'img/prize/headphones.svg' });
      }
      else await rollup($('win'), from, total, c.orb.jp ? 900 : 220);
      el.classList.add('collected');
      await sleep(c.orb.jp ? 700 : 90);
    }
    if (S.rig) { S.rig = false; S.rigDone = true; S.revealPending = true; }

    await payWin(total, locked >= 15 ? 'FULL BOARD WIN' : 'HOLD & SPIN WIN');
    app.classList.remove('feature');
    reelsEl.removeEventListener('click', onTap);
    reelsEl.querySelectorAll('.cell.boost').forEach((el) => { el.classList.remove('boost'); delete el.dataset.boost; });
    S.feature = false;
    S.grid = grid;
    for (let r = 0; r < 5; r++) renderReel(r, grid[r]);
    updateUI();
  }

  function flashJackpot(name) {
    const el = document.querySelector(`.jp-${name.toLowerCase()}`);
    if (!el) return;
    el.classList.remove('hit'); void el.offsetWidth; el.classList.add('hit');
  }

  // One empty spot during Hold & Spin. Every so often symbols streak down through it like a reel
  // (sometimes one, sometimes a few in a row), then a baddie slides in and settles, or it stays empty.
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  function streak(holder, sym, dur, frames) {
    const f = document.createElement('div');
    f.className = 'cell-fly'; f.innerHTML = symHTML(sym);
    holder.appendChild(f);
    return f.animate(frames || [{ transform: 'translateY(-110%)' }, { transform: 'translateY(110%)' }],
      { duration: dur, easing: frames ? 'cubic-bezier(.2,.9,.3,1.2)' : 'linear' }).finished.then(() => f);
  }
  async function spinCell(c, ms, force) {
    const holder = reels[c.r].strip.children[c.row + 1];
    const k = S.turbo ? 0.6 : 1;
    holder.classList.add('cell-spin');
    const t0 = performance.now();
    let passes = 0;
    while (passes === 0 || performance.now() - t0 < ms) {
      await wait((90 + Math.random() * 420) * k);                 // sporadic gap
      const burst = Math.random() < 0.4 ? 2 + ((Math.random() * 3) | 0) : 1; // sometimes a few in a row
      for (let b = 0; b < burst; b++) {
        const sym = makeOrb(true); // only baddies streak through; the gaps between are the "nothing"
        if (b === 0) Sound.reelTick();
        (await streak(holder, sym, (110 + Math.random() * 80) * k)).remove();
      }
      passes++;
    }
    // Decided at the end, so taps made while it was streaking still count.
    const odds = Math.min(0.2, RESPIN_ODDS + 0.03 * (c.boost || 0));
    const hit = force === undefined ? Math.random() < odds : !!force;
    const land = force === 'MAJOR' ? { s: 'orb', jp: 'MAJOR', g: girl() } : hit ? makeOrb(true) : null;
    if (land) {
      holder.classList.remove('boost'); delete holder.dataset.boost;
      // the real one drops in, overshoots a touch and settles
      const f = await streak(holder, land, 320 * k, [
        { transform: 'translateY(-110%)', filter: 'blur(2px)' },
        { transform: 'translateY(6%)', filter: 'blur(0)', offset: 0.75 },
        { transform: 'translateY(0)', filter: 'blur(0)' },
      ]);
      f.remove();
      holder.innerHTML = symHTML(land);
      holder.firstElementChild.classList.add('pop');
    } else {
      Sound.blankLand();
    }
    holder.classList.remove('cell-spin');
    return land;
  }

  // ---------- Gamble ----------
  // Pick the next card: colour pays x2, suit pays x4. Half gamble banks half the win and risks the rest.
  const SUITS = [{ s: '\u2665', c: 'red' }, { s: '\u2666', c: 'red' }, { s: '\u2663', c: 'black' }, { s: '\u2660', c: 'black' }];
  const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
  const GB = { amt: 0, busy: false, hover: 'colour', hist: [] };
  // Seed the history so the first gamble shows a believable past run of cards.
  GB.hist = Array.from({ length: 8 }, () => SUITS[Math.floor(Math.random() * 4)]);
  const cents = (v) => Math.round(v * 100) / 100;
  const credits = (v) => Math.round(v * 100).toLocaleString('en-AU');

  function gambleOpen(prompt) {
    if (S.busy || S.auto || !(S.lastWin > 0)) return;
    Sound.click();
    Object.assign(GB, { amt: S.lastWin, busy: false, hover: 'colour' });
    S.credit -= GB.amt; S.lastWin = 0; S.busy = true; updateUI();
    $('gCard').classList.remove('flip', 'won', 'lost');
    $('gamble').hidden = false;
    gambleUI(prompt || 'PICK RED OR BLACK (x2), OR A SUIT (x4)');
  }
  // The headphones gamble: same screen, but it counts headphones and every pick wins.
  function prizeGambleOpen() {
    Object.assign(GB, { amt: 1, prize: true, busy: false, hover: 'colour' });
    S.busy = true; updateUI();
    $('gCard').classList.remove('flip', 'won', 'lost');
    $('gamble').hidden = false;
    gambleUI('DOUBLE THE HEADPHONES AS MANY TIMES AS YOU LIKE');
  }
  const gVal = (v) => (GB.prize ? `${v.toLocaleString('en-AU')}<small>${v === 1 ? 'HEADPHONE' : 'HEADPHONES'}</small>` : fmt(v));
  function gambleUI(msg) {
    const suit = GB.hover === 'suit';
    $('gmCredit').textContent = fmt(S.credit);
    $('gmBet').textContent = fmt(bet());
    $('gmWin').innerHTML = gVal(GB.amt);
    $('gLeftLbl').textContent = suit ? 'SUIT GAMBLE' : 'COLOUR GAMBLE';
    $('gRightLbl').textContent = suit ? 'TO WIN (x4)' : 'TO WIN (x2)';
    $('gAmt').innerHTML = gVal(GB.amt);
    $('gToWin').innerHTML = gVal(GB.amt * (suit ? 4 : 2));
    if (msg != null) $('gMsg').textContent = msg;
    const off = GB.busy || GB.amt <= 0;
    document.querySelectorAll('.g-pick').forEach((b) => { b.disabled = off; });
    $('gCollect').disabled = GB.busy;
    $('gHist').innerHTML = GB.hist.map((h) => `<span class="${h.c}">${h.s}</span>`).join('');
  }
  async function gamblePick(pick) {
    if (GB.busy || GB.amt <= 0) return;
    GB.busy = true;
    const isSuit = pick.length === 1;
    GB.hover = isSuit ? 'suit' : 'colour';
    const st = GB.amt;
    gambleUI('');
    // In the headphones gamble the card always matches his pick.
    const fit = GB.prize ? SUITS.filter((x) => (isSuit ? x.s === pick : x.c === pick)) : SUITS;
    const card = fit[(Math.random() * fit.length) | 0], rank = RANKS[(Math.random() * 13) | 0];
    const face = $('gFace');
    face.className = 'g-face ' + card.c;
    face.innerHTML = `<span class="g-rank">${rank}<i>${card.s}</i></span><span class="g-big">${card.s}</span><span class="g-rank b">${rank}<i>${card.s}</i></span>`;
    const cardEl = $('gCard');
    cardEl.classList.remove('flip', 'won', 'lost'); void cardEl.offsetWidth;
    Sound.cardFlip(); cardEl.classList.add('flip');
    await sleep(700);
    GB.hist.unshift(card); GB.hist = GB.hist.slice(0, 8);
    const won = isSuit ? pick === card.s : pick === card.c;
    if (won) {
      GB.amt = GB.prize ? st * (isSuit ? 4 : 2) : cents(st * (isSuit ? 4 : 2));
      cardEl.classList.add('won'); Sound.winSmall(isSuit ? 8 : 3);
      gambleUI(GB.prize ? `${GB.amt.toLocaleString('en-AU')} HEADPHONES! DOUBLE AGAIN OR TAKE WIN` : `WIN ${fmt(GB.amt)} - GAMBLE AGAIN OR TAKE WIN`);
    } else {
      GB.amt = 0;
      cardEl.classList.add('lost'); Sound.gambleLose();
      gambleUI('NO LUCK THIS TIME');
    }
    await sleep(1100);
    GB.busy = false;
    if (!won) { await sleep(300); gambleClose(); return; }
    cardEl.classList.remove('flip', 'won');
    gambleUI();
  }
  function gambleClose() {
    if (GB.busy) return;
    $('gamble').hidden = true;
    if (GB.prize) {
      const n = GB.amt; GB.prize = false; GB.amt = 0;
      message(`${n.toLocaleString('en-AU')} HEADPHONES FOR THE NEXT PERSON!`, true); Sound.coinHit(6);
      S.busy = false; updateUI();
      if (S.revealPending) reveal();
      return;
    }
    const total = GB.amt;
    S.credit += total; setWin(total);
    message(total > 0 ? 'GAMBLE COLLECTED ' + fmt(total) : 'GAMBLE LOST', total > 0);
    if (total > 0) Sound.coinHit(6);
    GB.amt = 0; S.busy = false; updateUI();
    if (S.revealPending) reveal();
  }

  // ---------- The surprise ----------
  // A full-screen line typed out letter by letter. Advances by itself, or on tap.
  function say(text, holdMs, big) {
    return new Promise((res) => {
      const ov = $('transmute'), el = $('tmText');
      el.textContent = ''; el.className = 'tm-text' + (big ? ' big' : '');
      ov.hidden = false; ov.classList.remove('out');
      Sound.mystery(big);
      let i = 0, done = false;
      const iv = setInterval(() => { el.textContent = text.slice(0, ++i); if (i >= text.length) { clearInterval(iv); later = setTimeout(end, holdMs); } }, 55);
      let later = 0;
      function end() {
        if (done) return; done = true;
        clearInterval(iv); clearTimeout(later); el.textContent = text;
        ov.removeEventListener('click', end);
        ov.classList.add('out');
        setTimeout(() => { ov.hidden = true; res(); }, 450);
      }
      ov.addEventListener('click', end);
    });
  }
  // Roll a meter's money down to nothing.
  // After the final gamble (won, lost or collected): a surprise mystery GRAND jackpot, which is the
  // Le Labo. Whatever money he has is kept.
  async function reveal() {
    S.revealPending = false; S.busy = true; S.auto = false; updateUI();
    Sound.duckMusic(true);
    await sleep(500);
    await say('BUT WAIT...', 1800, true);
    await say('YOU SMELL SOMETHING ELSE COMING...', 1800);
    await mysteryRoll(S.turbo ? 2600 : 4500);
    await bigWin(0, 'LE LABO PERFUME', 0, { perfume: true });
    S.busy = false; updateUI();
  }

  // The MYSTERY GRAND plaque: glyphs scramble, a drum roll builds, the plaque shakes harder and glows
  // brighter, then a white flash and a gong.
  function mysteryRoll(ms) {
    return new Promise((res) => {
      const ov = $('mystery'), g = $('myGlyphs');
      const glyphs = ['?', '?', '★', '♦', '✦', '♥', '$'];
      ov.className = 'overlay mystery'; ov.style.setProperty('--p', '0'); ov.hidden = false;
      Sound.mystery(true);
      setTimeout(() => Sound.anticipation(ms / 1000 - 0.6), 600);
      const t0 = performance.now();
      const iv = setInterval(() => {
        const p = Math.min(1, (performance.now() - t0) / ms);
        g.textContent = Array.from({ length: 5 }, () => glyphs[(Math.random() * glyphs.length) | 0]).join('');
        ov.style.setProperty('--p', p.toFixed(2));
        if (p >= 1) {
          clearInterval(iv);
          g.textContent = '?????';
          ov.classList.add('flash'); Sound.jackpot();
          setTimeout(() => { ov.hidden = true; ov.className = 'overlay mystery'; res(); }, 1000);
        }
      }, 70);
    });
  }

  // ---------- Paytable ----------
  function buildPaytable() {
    $('ptGrid').innerHTML = Object.keys(PAYS).map((s) =>
      `<div class="pt-item"><svg viewBox="0 0 100 100"><use href="#sym-${s}"/></svg><div class="pt-pays">` +
      PAYS[s].map((p, i) => `<b>${i + 3}×</b> ${fmt(p * bet())}`).join('<br>') + '</div></div>').join('') +
      `<div class="pt-item"><svg viewBox="0 0 100 100"><use href="#sym-wild"/></svg><div class="pt-pays"><b>WILD</b><br>Reels 2-4, substitutes for all except baddies and free spins</div></div>` +
      `<div class="pt-item"><svg viewBox="0 0 100 100"><use href="#sym-kgirl"/></svg><div class="pt-pays"><b>BADDIES</b><br>6+ start Hold &amp; Spin</div></div>` +
      `<div class="pt-item"><svg viewBox="0 0 100 100"><use href="#sym-scatter"/></svg><div class="pt-pays"><b>FREE SPINS</b><br>3 on reels 1, 3, 5 = ${FS_COUNT} free spins, wins x${FS_MULT}</div></div>`;
  }

  // ---------- Wiring ----------
  function bind() {
    $('btnSpin').addEventListener('click', () => {
      Sound.init();
      if (S.auto) { S.auto = false; updateUI(); return; }
      spin();
    });
    $('betUp').addEventListener('click', () => { Sound.init(); Sound.click(); S.betIdx = Math.min(BETS.length - 1, S.betIdx + 1); updateUI(); });
    $('betDown').addEventListener('click', () => { Sound.init(); Sound.click(); S.betIdx = Math.max(0, S.betIdx - 1); updateUI(); });
    $('btnTurbo').addEventListener('click', () => { Sound.init(); Sound.click(); S.turbo = !S.turbo; updateUI(); });
    $('btnAuto').addEventListener('click', () => { Sound.init(); Sound.click(); S.auto = !S.auto; updateUI(); if (S.auto && !S.busy) spin(); });
    $('btnSound').addEventListener('click', () => { Sound.init(); Sound.setEnabled(!Sound.enabled); Sound.click(); updateUI(); });
    $('ptClose').addEventListener('click', () => { Sound.click(); $('paytable').hidden = true; });
    $('btnGamble').addEventListener('click', () => { Sound.init(); gambleOpen(); });
    document.querySelectorAll('.g-pick').forEach((b) => {
      b.addEventListener('click', () => gamblePick(b.dataset.pick));
      const hov = () => { if (GB.busy) return; GB.hover = b.classList.contains('suit') ? 'suit' : 'colour'; gambleUI(null); };
      b.addEventListener('mouseenter', hov); b.addEventListener('focus', hov);
    });
    $('gCollect').addEventListener('click', () => { Sound.click(); gambleClose(); });
    $('credit').parentElement.addEventListener('click', () => {
      if (S.credit < BETS[0] && !S.busy) { S.credit = START_CREDIT; Sound.init(); Sound.coinHit(4); message('CREDIT REFILLED (PLAY MONEY)'); updateUI(); }
    });
    addEventListener('keydown', (e) => {
      if (e.code !== 'Space' && e.code !== 'Enter') return;
      e.preventDefault();
      if (!$('bigwin').hidden) { $('bigwin').click(); return; }
      if (!$('paytable').hidden || !$('gamble').hidden) return;
      spin();
    });
    addEventListener('resize', sizeCells);

    // Secret test backdoor: tap the MINI plaque 5 times in a row (each within 2 s of the last).
    // The plaque pulses once to confirm, and the next spin is the rigged feature -> gamble -> reveal.
    let miniTaps = 0, miniLast = 0;
    document.querySelector('.jp-mini').addEventListener('click', () => {
      const t = performance.now();
      miniTaps = t - miniLast < 2000 ? miniTaps + 1 : 1; miniLast = t;
      if (miniTaps >= 5 && !S.busy && !S.feature) { miniTaps = 0; S.forceRig = true; flashJackpot('MINI'); }
    });
  }

  sizeCells();
  buildReels();
  S.grid = makeGrid();
  for (let r = 0; r < 5; r++) renderReel(r, S.grid[r]);
  bind();
  setWin(0);
  updateUI();
  // Debug hook for testing: window.__fp.forceFeature()
  // window.__fp.forceChar('abg', 5) makes the next spin land that character on the first k reels.
  window.__fp = { S, bigWin, prizeGambleOpen, forceFS: () => { S.forced = [0, 1, 2, 3, 4].map((r) => [{ s: 'Q' }, { s: r % 2 === 0 ? 'scatter' : 'K' }, { s: 'J' }]); spin(); }, forceChar: (sym, k = 5) => { const g = [0, 1, 2, 3, 4].map((r) => [{ s: 'Q' }, { s: r < k ? sym : 'J' }, { s: 'K' }]); S.forced = g; spin(); }, forceFeature: () => { if (!S.busy) { S.busy = true; const g = makeGrid(); let n = 0; g.flat().forEach((c, i) => { if (n < 6 && i % 2 === 0) { Object.assign(c, makeOrb(false)); n++; } }); S.grid = g; for (let r = 0; r < 5; r++) renderReel(r, g[r]); holdAndSpin(g).then(() => { S.busy = false; updateUI(); }); } } };
})();
