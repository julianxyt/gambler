(() => {
  'use strict';

  // ---------- Config ----------
  // Pays are multiples of the total bet, per way (243 ways).
  const PAYS = {
    ingot: [0.3, 1, 4], lantern: [0.2, 0.6, 2], koi: [0.16, 0.4, 1.5], cracker: [0.12, 0.3, 1],
    A: [0.08, 0.2, 0.6], K: [0.06, 0.15, 0.5], Q: [0.06, 0.15, 0.5], J: [0.04, 0.1, 0.4], T: [0.04, 0.1, 0.4],
  };
  const NAMES = { ingot: 'Gold Ingot', lantern: 'Lantern', koi: 'Koi', cracker: 'Firecrackers', A: 'A', K: 'K', Q: 'Q', J: 'J', T: '10' };
  const WEIGHTS = { ingot: 3, lantern: 4, koi: 5, cracker: 6, A: 8, K: 9, Q: 9, J: 10, T: 10, wild: 2, orb: 12 };
  const JP = { MINI: 10, MINOR: 25, MAJOR: 150, GRAND: 1000 }; // x bet
  const BETS = [0.5, 1, 2, 3, 5, 10, 20, 50];
  const ORB_MULTS = [[1, 20], [2, 18], [3, 14], [4, 10], [5, 9], [8, 6], [10, 4], [15, 2], [20, 1]];
  const TRIGGER = 6, RESPIN_ODDS = 0.11, START_CREDIT = 1000;

  // ---------- State ----------
  const $ = (id) => document.getElementById(id);
  const S = {
    credit: load('fp_credit', START_CREDIT), betIdx: load('fp_bet', 1),
    grid: null, busy: false, auto: false, turbo: load('fp_turbo', false), feature: false,
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
    const pairs = Object.entries(WEIGHTS).filter(([s]) => s !== 'wild' || (reel >= 1 && reel <= 3));
    return weighted(pairs);
  }
  function makeOrb(inFeature) {
    const r = Math.random();
    if (inFeature && r < 0.008) return { s: 'orb', jp: 'MAJOR' };
    if (r < 0.03) return { s: 'orb', jp: 'MINOR' };
    if (r < 0.09) return { s: 'orb', jp: 'MINI' };
    return { s: 'orb', v: weighted(ORB_MULTS) * bet() };
  }
  const orbValue = (c) => (c.jp ? JP[c.jp] * bet() : c.v);
  function makeCell(reel) { const s = pickSym(reel); return s === 'orb' ? makeOrb(false) : { s }; }
  function makeGrid() { return [0, 1, 2, 3, 4].map((r) => [0, 1, 2].map(() => makeCell(r))); }

  // ---------- Rendering ----------
  const reelsEl = $('reels');
  const reels = [];
  function symHTML(c) {
    if (!c || c.s === 'empty') return '<div class="sym empty"></div>';
    if (c.s === 'orb') {
      const label = c.jp || fmt(c.v).replace('.00', '');
      return `<div class="sym orb"><svg viewBox="0 0 100 100"><use href="#sym-orb"/></svg><span class="orb-val ${c.jp || ''}">${label}</span></div>`;
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
    document.querySelectorAll('.jp-val').forEach((el) => { el.textContent = fmt(JP[el.dataset.jp] * bet()); });
    const lock = S.busy || S.feature;
    $('betUp').disabled = lock || S.betIdx >= BETS.length - 1;
    $('betDown').disabled = lock || S.betIdx <= 0;
    $('btnTurbo').classList.toggle('on', S.turbo);
    $('btnAuto').classList.toggle('on', S.auto);
    $('btnSpin').classList.toggle('auto', S.auto);
    $('btnSound').classList.toggle('on', Sound.enabled);
    $('btnSpin').disabled = (S.busy && !S.auto) || S.feature;
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

  function clearWins() {
    reelsEl.classList.remove('has-win');
    reelsEl.querySelectorAll('.sym.win').forEach((e) => e.classList.remove('win'));
  }
  function showWins(wins) {
    reelsEl.classList.add('has-win');
    wins.forEach((w) => w.cells.forEach(([r, row]) => symEl(r, row).classList.add('win')));
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

  async function payWin(total, title) {
    const ratio = total / bet();
    if (title || ratio >= 15) {
      await bigWin(total, title || (ratio >= 100 ? 'EPIC WIN' : ratio >= 40 ? 'MEGA WIN' : 'BIG WIN'), ratio);
    } else {
      Sound.winSmall(ratio);
      message('WIN ' + fmt(total), true);
      await rollup($('win'), 0, total, Math.min(2200, 350 + ratio * 250));
    }
    S.credit += total; setWin(total); updateUI();
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

  function bigWin(total, title, ratio) {
    return new Promise((res) => {
      const ov = $('bigwin');
      const tier = ratio >= 100 ? 3 : ratio >= 40 ? 2 : 1;
      $('bigwinTitle').textContent = title;
      $('bigwinAmount').textContent = fmt(0);
      ov.classList.remove('done'); ov.hidden = false;
      coinRain.start(tier);
      const fanfareLen = Sound.bigWinFanfare(tier);
      let finished = false, closed = false;
      const rollMs = Math.max(2500, (fanfareLen - 1.8) * 1000);
      rollup($('bigwinAmount'), 0, total, rollMs).then(() => {
        finished = true; ov.classList.add('done'); coinRain.stop();
        if (S.auto) setTimeout(close, 2500);
      });
      function close() {
        if (closed) return; closed = true;
        ov.removeEventListener('click', onClick);
        Sound.stopFanfare(); coinRain.clear(); ov.hidden = true;
        message(title + ' ' + fmt(total), true);
        res();
      }
      function onClick() {
        if (!finished) { const el = $('bigwinAmount'); if (el._skip) el._skip(); return; }
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
    S.busy = true; S.credit -= bet(); setWin(0); clearWins(); updateUI();
    message('GOOD FORTUNE...');
    Sound.spinStart();

    const grid = makeGrid();
    const base = S.turbo ? 380 : 750, step = S.turbo ? 110 : 210, anticMs = S.turbo ? 900 : 1700;
    const orbsBefore = (r) => grid.slice(0, r).flat().filter((c) => c.s === 'orb').length;
    const antic = [0, 1, 2, 3, 4].map((r) => r >= 3 && orbsBefore(r) >= TRIGGER - 3 + (r - 3));
    let extra = 0, landed = 0;
    const jobs = grid.map((cells, r) => {
      if (antic[r]) extra += anticMs;
      const dur = base + r * step + extra;
      return spinReel(r, cells, dur).then(() => {
        Sound.reelStop(r);
        reels[r].el.classList.remove('antic');
        cells.forEach((c, row) => {
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

    const wins = evaluate(grid);
    const total = wins.reduce((a, w) => a + w.amount, 0);
    if (total > 0) { showWins(wins); await payWin(total); }
    else message(landed >= 3 ? `${landed} PEARLS - ${TRIGGER} TRIGGER HOLD & SPIN` : 'SPIN AGAIN');

    if (landed >= TRIGGER) { await sleep(500); clearWins(); await holdAndSpin(grid); }

    S.busy = false; updateUI();
    if (S.auto) setTimeout(() => { if (S.auto) spin(); }, total > 0 ? 900 : 400);
  }

  // ---------- Hold & Spin ----------
  async function holdAndSpin(grid) {
    S.feature = true; clearWins(); updateUI();
    const app = $('app'); const hud = $('respinHud');
    Sound.featureTrigger();
    await banner('HOLD & SPIN', '3 RESPINS - EVERY NEW PEARL RESETS TO 3', 2600);
    app.classList.add('feature');

    const cells = [];
    for (let r = 0; r < 5; r++) for (let row = 0; row < 3; row++) cells.push({ r, row, orb: grid[r][row].s === 'orb' ? grid[r][row] : null });
    for (let r = 0; r < 5; r++) renderReel(r, [0, 1, 2].map((row) => grid[r][row].s === 'orb' ? grid[r][row] : { s: 'empty' }));

    let respins = 3, locked = cells.filter((c) => c.orb).length;
    const lights = () => hud.querySelectorAll('i').forEach((el, i) => el.classList.toggle('on', i < respins));
    lights();
    message('PEARLS LOCK IN PLACE');
    await sleep(700);

    while (respins > 0 && locked < 15) {
      respins--; lights();
      Sound.respinStart();
      const empties = cells.filter((c) => !c.orb);
      let gotNew = false;
      await Promise.all(empties.map((c, i) => spinCell(c, 450 + i * (S.turbo ? 45 : 90)).then((orb) => {
        if (!orb) return;
        c.orb = orb; gotNew = true;
        Sound.coinHit(locked, !!orb.jp); locked++;
        message(`${locked} PEARLS`);
      })));
      if (gotNew && locked < 15) {
        respins = 3; lights(); Sound.respinReset();
        hud.classList.remove('reset'); void hud.offsetWidth; hud.classList.add('reset');
      }
      await sleep(600);
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
      await rollup($('win'), from, total, c.orb.jp ? 900 : 220);
      el.classList.add('collected');
      await sleep(c.orb.jp ? 700 : 90);
    }
    if (locked >= 15) {
      Sound.jackpot(); flashJackpot('GRAND');
      await banner('GRAND JACKPOT', fmt(JP.GRAND * bet()), 2400);
      total += JP.GRAND * bet();
    }

    await payWin(total, locked >= 15 ? 'GRAND WIN' : 'HOLD & SPIN WIN');
    app.classList.remove('feature');
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

  // One empty spot flickers then lands as a pearl or stays empty.
  function spinCell(c, ms) {
    return new Promise((res) => {
      const holder = reels[c.r].strip.children[c.row + 1];
      const t0 = performance.now();
      const land = Math.random() < RESPIN_ODDS ? makeOrb(true) : null;
      const iv = setInterval(() => {
        const fake = Math.random() < 0.45 ? makeOrb(true) : { s: 'empty' };
        holder.innerHTML = symHTML(fake);
        holder.firstElementChild.classList.add('flicker');
        if (performance.now() - t0 >= ms) {
          clearInterval(iv);
          holder.innerHTML = symHTML(land || { s: 'empty' });
          if (land) holder.firstElementChild.classList.add('pop');
          else Sound.blankLand();
          res(land);
        }
      }, 70);
    });
  }

  // ---------- Paytable ----------
  function buildPaytable() {
    $('ptGrid').innerHTML = Object.keys(PAYS).map((s) =>
      `<div class="pt-item"><svg viewBox="0 0 100 100"><use href="#sym-${s}"/></svg><div class="pt-pays">` +
      PAYS[s].map((p, i) => `<b>${i + 3}×</b> ${fmt(p * bet())}`).join('<br>') + '</div></div>').join('') +
      `<div class="pt-item"><svg viewBox="0 0 100 100"><use href="#sym-wild"/></svg><div class="pt-pays"><b>WILD</b><br>Reels 2-4, substitutes for all except pearls</div></div>` +
      `<div class="pt-item"><svg viewBox="0 0 100 100"><use href="#sym-orb"/></svg><div class="pt-pays"><b>FIRE PEARL</b><br>6+ start Hold &amp; Spin</div></div>`;
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
    $('btnInfo').addEventListener('click', () => { Sound.init(); Sound.click(); buildPaytable(); $('paytable').hidden = false; });
    $('ptClose').addEventListener('click', () => { Sound.click(); $('paytable').hidden = true; });
    $('credit').parentElement.addEventListener('click', () => {
      if (S.credit < BETS[0] && !S.busy) { S.credit = START_CREDIT; Sound.init(); Sound.coinHit(4); message('CREDIT REFILLED (PLAY MONEY)'); updateUI(); }
    });
    addEventListener('keydown', (e) => {
      if (e.code !== 'Space' && e.code !== 'Enter') return;
      e.preventDefault();
      if (!$('bigwin').hidden) { $('bigwin').click(); return; }
      if (!$('paytable').hidden) return;
      spin();
    });
    addEventListener('resize', sizeCells);
  }

  sizeCells();
  buildReels();
  S.grid = makeGrid();
  for (let r = 0; r < 5; r++) renderReel(r, S.grid[r]);
  bind();
  setWin(0);
  updateUI();
  // Debug hook for testing: window.__fp.forceFeature()
  window.__fp = { S, forceFeature: () => { if (!S.busy) { S.busy = true; const g = makeGrid(); let n = 0; g.flat().forEach((c, i) => { if (n < 6 && i % 2 === 0) { Object.assign(c, makeOrb(false)); n++; } }); S.grid = g; for (let r = 0; r < 5; r++) renderReel(r, g[r]); holdAndSpin(g).then(() => { S.busy = false; updateUI(); }); } } };
})();
