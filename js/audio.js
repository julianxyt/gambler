/*
 * Bangor Bonanza sound engine.
 * Every sound is synthesised with the Web Audio API (no downloaded audio).
 * Any sound can be replaced by dropping a file into sounds/custom/ (see README).
 */
const Sound = (() => {
  let ctx = null, master, comp, verb, verbIn, fanfareBus, noiseBuf;
  let enabled = true;
  const custom = {};
  const CUSTOM_NAMES = [
    'click', 'spin_start', 'reel_stop', 'coin_hit', 'anticipation', 'win_small',
    'rollup_tick', 'feature_trigger', 'jackpot', 'big_win_fanfare', 'char_show', 'chest_open'
  ];

  // Major pentatonic (gong scale) - every coin climbs one step.
  const PENT = [0, 2, 4, 7, 9];
  const noteFreq = (base, step) => base * Math.pow(2, (12 * Math.floor(step / 5) + PENT[((step % 5) + 5) % 5]) / 12);
  const NOTES = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  const nf = (n) => { const m = /^([A-G])(#?)(\d)$/.exec(n); return 440 * Math.pow(2, (NOTES[m[1]] + (m[2] ? 1 : 0) + (m[3] - 4) * 12 - 9) / 12); };

  function init() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16; comp.knee.value = 8; comp.ratio.value = 5;
    comp.attack.value = 0.002; comp.release.value = 0.2;
    master = ctx.createGain(); master.gain.value = enabled ? 0.85 : 0;
    master.connect(comp); comp.connect(ctx.destination);

    verb = ctx.createConvolver(); verb.buffer = impulse(3.2, 2.6);
    verbIn = ctx.createGain(); verbIn.gain.value = 1;
    const verbOut = ctx.createGain(); verbOut.gain.value = 0.42;
    verbIn.connect(verb); verb.connect(verbOut); verbOut.connect(master);

    fanfareBus = makeBus();
    loadCustom();
  }

  // A stoppable bus: its dry signal and its reverb send can both be faded out.
  function makeBus() {
    const b = ctx.createGain(); b.connect(master);
    b.verbSend = ctx.createGain(); b.verbSend.connect(verbIn);
    return b;
  }

  function impulse(sec, decay) {
    const len = Math.floor(ctx.sampleRate * sec);
    const b = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = b.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    return b;
  }

  function noise() {
    if (!noiseBuf) {
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
    return s;
  }

  // An output node: dry to `bus`, plus a send into the reverb.
  function out(vol, wet = 0.25, bus = master) {
    const g = ctx.createGain(); g.gain.value = vol;
    g.connect(bus);
    if (wet > 0) {
      const w = ctx.createGain(); w.gain.value = wet;
      g.connect(w); w.connect(bus.verbSend || verbIn);
    }
    return g;
  }

  function envGain(t, a, d, peak = 1, dest) {
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
    g.connect(dest);
    return g;
  }

  function tone(type, f, t, a, d, peak, dest, bendTo) {
    const o = ctx.createOscillator(); o.type = type;
    o.frequency.setValueAtTime(f, t);
    if (bendTo) o.frequency.exponentialRampToValueAtTime(bendTo, t + Math.min(d, 0.25));
    o.connect(envGain(t, a, d, peak, dest));
    o.start(t); o.stop(t + a + d + 0.05);
    return o;
  }

  function noiseHit(t, a, d, peak, dest, filt = 'highpass', freq = 1000, q = 0.7) {
    const n = noise(); const f = ctx.createBiquadFilter();
    f.type = filt; f.frequency.value = freq; f.Q.value = q;
    n.connect(f); f.connect(envGain(t, a, d, peak, dest));
    n.start(t, Math.random()); n.stop(t + a + d + 0.05);
    return f;
  }

  // ---------- Instruments ----------
  function bell(f, t, vol = 0.3, decay = 1.4, bus = master, wet = 0.35) {
    const o = out(vol, wet, bus);
    const parts = [[1, 1, 1], [2.0, .45, .7], [2.76, .35, .5], [4.07, .22, .35], [5.4, .14, .25], [8.9, .06, .12]];
    parts.forEach(([r, a, dm]) => tone('sine', f * r, t, 0.002, decay * dm, a, o));
  }

  function clink(t, vol = 0.18, bus = master) { // metallic coin clink
    const o = out(vol, 0.2, bus);
    [3150, 4720, 6380].forEach((f, i) => tone('sine', f * (0.97 + Math.random() * 0.06), t + i * 0.004, 0.001, 0.12 + i * 0.03, 0.5, o));
    noiseHit(t, 0.001, 0.03, 0.6, o, 'highpass', 6000);
  }

  function gong(t, f = 62, vol = 0.9, bus = master, len = 4.5) {
    const o = out(vol, 0.6, bus);
    const parts = [1, 1.47, 2.09, 2.56, 3.17, 3.98, 5.12, 6.33];
    parts.forEach((r, i) => {
      const osc = ctx.createOscillator(); osc.type = 'sine';
      const fr = f * r * (1 + (Math.random() - 0.5) * 0.01);
      osc.frequency.setValueAtTime(fr * 0.985, t);
      osc.frequency.linearRampToValueAtTime(fr * 1.012, t + 0.9); // the "wah" bloom of a Chinese gong
      const g = ctx.createGain();
      const peak = 0.5 / (1 + i * 0.35);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(peak * 0.6, t + 0.01);
      g.gain.exponentialRampToValueAtTime(peak, t + 0.18 + i * 0.03);
      g.gain.exponentialRampToValueAtTime(0.0001, t + len * (1 - i * 0.07));
      osc.connect(g); g.connect(o); osc.start(t); osc.stop(t + len + 0.1);
    });
    noiseHit(t, 0.002, 0.25, 0.5, o, 'bandpass', 900, 0.6);
    tone('sine', f * 0.5, t, 0.005, 0.6, 0.6, o); // body thump
  }

  function taiko(t, vol = 0.8, f = 58, bus = master) {
    const o = out(vol, 0.2, bus);
    tone('sine', f * 2.4, t, 0.002, 0.45, 1, o, f);
    tone('triangle', f * 3.6, t, 0.002, 0.12, 0.35, o, f * 1.5);
    noiseHit(t, 0.001, 0.07, 0.7, o, 'lowpass', 900);
    noiseHit(t, 0.001, 0.02, 0.4, o, 'bandpass', 2500, 1.2); // skin slap
  }

  function woodblock(t, f = 900, vol = 0.25, bus = master) {
    const o = out(vol, 0.15, bus);
    tone('sine', f, t, 0.001, 0.07, 1, o, f * 0.92);
    tone('sine', f * 2.3, t, 0.001, 0.03, 0.4, o);
    noiseHit(t, 0.001, 0.015, 0.5, o, 'bandpass', f * 3, 2);
  }

  function cymbal(t, vol = 0.35, len = 2.2, bus = master) {
    const o = out(vol, 0.5, bus);
    noiseHit(t, 0.003, len, 0.6, o, 'highpass', 5500);
    noiseHit(t, 0.002, len * 0.5, 0.35, o, 'bandpass', 3200, 0.8);
  }

  function whoosh(t, dur, f0, f1, vol = 0.3, bus = master) {
    const o = out(vol, 0.3, bus);
    const n = noise(); const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 1.4;
    f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(1, t + dur * 0.6);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    n.connect(f); f.connect(g); g.connect(o); n.start(t); n.stop(t + dur + 0.05);
  }

  function pluck(f, t, vol = 0.25, bus = master, len = 1.1) { // guzheng-ish
    const o = out(vol, 0.35, bus);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 2;
    lp.frequency.setValueAtTime(f * 8, t); lp.frequency.exponentialRampToValueAtTime(f * 1.6, t + 0.35);
    lp.connect(envGain(t, 0.002, len, 1, o));
    ['sawtooth', 'triangle'].forEach((ty, i) => {
      const osc = ctx.createOscillator(); osc.type = ty; osc.frequency.setValueAtTime(f * (i ? 2 : 1), t);
      osc.frequency.setValueAtTime(f * (i ? 2 : 1), t + 0.25);
      osc.frequency.linearRampToValueAtTime(f * (i ? 2 : 1) * 1.01, t + 0.5); // slight bend like a pressed string
      osc.connect(lp); osc.start(t); osc.stop(t + len + 0.1);
    });
  }

  function brass(f, t, dur, vol = 0.2, bus = master) {
    const o = out(vol, 0.35, bus);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 1.2;
    lp.frequency.setValueAtTime(f * 1.2, t);
    lp.frequency.exponentialRampToValueAtTime(f * 7, t + 0.06);
    lp.frequency.exponentialRampToValueAtTime(f * 3.5, t + 0.3);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(1, t + 0.035);
    g.gain.exponentialRampToValueAtTime(0.7, t + 0.2);
    g.gain.setValueAtTime(0.7, t + Math.max(0.21, dur - 0.05));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.25);
    lp.connect(g); g.connect(o);
    [-7, 0, 7].forEach((cents) => {
      const osc = ctx.createOscillator(); osc.type = 'sawtooth';
      osc.frequency.value = f; osc.detune.value = cents;
      osc.connect(lp); osc.start(t); osc.stop(t + dur + 0.3);
    });
    const sub = ctx.createOscillator(); sub.type = 'square'; sub.frequency.value = f / 2;
    const sg = ctx.createGain(); sg.gain.value = 0.25; sub.connect(sg); sg.connect(lp);
    sub.start(t); sub.stop(t + dur + 0.3);
  }

  function firecrackers(t, count = 14, spread = 1.2, vol = 0.5, bus = master) {
    const o = out(vol, 0.25, bus);
    for (let i = 0; i < count; i++) {
      const tt = t + Math.random() * spread;
      noiseHit(tt, 0.001, 0.03 + Math.random() * 0.04, 0.4 + Math.random() * 0.6, o, 'highpass', 700 + Math.random() * 1500);
      tone('sine', 180 + Math.random() * 120, tt, 0.001, 0.05, 0.5, o, 60);
    }
  }

  // ---------- Custom file overrides ----------
  // sounds/custom/sounds.json maps a sound name to a file in that folder, e.g.
  // { "coin_hit": "my_coin.mp3", "big_win_fanfare": "fanfare.ogg" }
  async function loadCustom() {
    if (location.protocol === 'file:') return; // fetch is blocked on file://
    let map;
    try {
      const r = await fetch('sounds/custom/sounds.json', { cache: 'no-store' });
      if (!r.ok) return;
      map = await r.json();
    } catch (e) { return; }
    for (const name of CUSTOM_NAMES) {
      if (!map[name]) continue;
      try {
        const r = await fetch('sounds/custom/' + encodeURIComponent(map[name]), { cache: 'no-store' });
        if (r.ok) { custom[name] = await ctx.decodeAudioData(await r.arrayBuffer()); console.info('[sound] custom', name, '->', map[name]); }
      } catch (e) { console.warn('[sound] could not load', map[name], e); }
    }
  }

  const playing = new Set();
  function playCustom(name, { rate = 1, vol = 1, bus = master } = {}) {
    const buf = custom[name];
    if (!buf) return false;
    const s = ctx.createBufferSource(); s.buffer = buf; s.playbackRate.value = rate;
    const g = ctx.createGain(); g.gain.value = vol; s.connect(g); g.connect(bus);
    s.start(); playing.add(s); s.onended = () => playing.delete(s);
    return s;
  }

  const ready = () => ctx && enabled;
  const now = () => ctx.currentTime + 0.01;
  let lastTick = 0;

  // ---------- Public game sounds ----------
  const api = {
    init,
    get enabled() { return enabled; },
    setEnabled(v) {
      enabled = v;
      if (master) master.gain.setTargetAtTime(v ? 0.85 : 0, ctx.currentTime, 0.02);
    },

    click() {
      if (!ready() || playCustom('click', { vol: 0.6 })) return;
      woodblock(now(), 1250, 0.18);
    },

    spinStart() {
      if (!ready() || playCustom('spin_start')) return;
      const t = now();
      whoosh(t, 0.45, 300, 2600, 0.28);
      taiko(t, 0.35, 70);
      woodblock(t + 0.02, 700, 0.15);
    },

    reelTick() { // quiet clatter while reels pass symbols
      if (!ready() || custom.spin_start) return;
      const t = ctx.currentTime;
      if (t - lastTick < 0.05) return;
      lastTick = t;
      woodblock(t, 1900 + Math.random() * 300, 0.035);
    },

    reelStop(i = 0) {
      if (!ready() || playCustom('reel_stop', { rate: 1 + i * 0.02 })) return;
      const t = now();
      taiko(t, 0.75, 52 + i * 3);
      woodblock(t, 420 + i * 25, 0.22);
      noiseHit(t, 0.001, 0.05, 0.25, out(0.4, 0), 'lowpass', 400);
    },

    // A pearl/coin landing. `n` is how many have landed so far: each one climbs the pentatonic scale,
    // so a run of hits plays as a rising melody.
    coinHit(n = 0, heavy = false) {
      if (!ready()) return;
      if (playCustom('coin_hit', { rate: Math.pow(2, (12 * Math.floor(n / 5) + PENT[n % 5]) / 12) })) return;
      const t = now();
      const f = noteFreq(523.25, n);
      bell(f, t, 0.32, 1.6);
      bell(f * 1.5, t + 0.01, 0.12, 0.9);
      clink(t, 0.16);
      taiko(t, heavy ? 0.9 : 0.5, 48);
      whoosh(t - 0.005, 0.18, 4000, 900, 0.12);
      if (heavy) { gong(t, 74, 0.45, master, 2.5); }
    },

    anticipation(dur = 1.6) {
      if (!ready() || playCustom('anticipation')) return;
      const t = now();
      // accelerating taiko roll
      let tt = 0, gap = 0.2;
      while (tt < dur) { taiko(t + tt, 0.25 + 0.5 * (tt / dur), 55); tt += gap; gap = Math.max(0.055, gap * 0.86); }
      whoosh(t, dur, 300, 5000, 0.25);
      // rising shimmer
      for (let i = 0; i < 8; i++) bell(noteFreq(784, i), t + (i / 8) * dur, 0.06, 0.6);
    },

    winSmall(ratio = 1) {
      if (!ready() || playCustom('win_small')) return;
      const t = now();
      const n = ratio >= 5 ? 7 : ratio >= 2 ? 5 : 3;
      for (let i = 0; i < n; i++) pluck(noteFreq(392, i + 2), t + i * 0.085, 0.24);
      bell(noteFreq(784, n), t + n * 0.085, 0.18, 1.4);
      clink(t + n * 0.085, 0.14);
      if (ratio >= 5) { taiko(t, 0.6, 55); cymbal(t + n * 0.085, 0.15, 1.2); }
    },

    // Character showcase: whoosh in, rising sparkle chimes, a taiko hit.
    charShow(k = 3) {
      if (!ready() || playCustom('char_show')) return;
      const t = now();
      whoosh(t, 0.35, 500, 3400, 0.26);
      taiko(t + 0.14, 0.7, 60);
      cymbal(t + 0.14, 0.12, 1.4);
      for (let i = 0; i < 4; i++) pluck(noteFreq(523.25, i * 2), t + 0.16 + i * 0.11, 0.2);
      for (let i = 0; i < 5 + k; i++) bell(noteFreq(880, i), t + 0.2 + i * 0.075, 0.11, 1.0);
      for (let i = 0; i < 10; i++) tone('sine', 2400 + Math.random() * 3000, t + 0.35 + Math.random() * 1.1, 0.002, 0.12, 0.04, out(1, 0.5));
      if (k >= 5) gong(t + 0.14, 70, 0.5, master, 2.5);
    },

    // A free-spins scatter landing: bright rising chime, higher for each one.
    scatterLand(n = 0) {
      if (!ready()) return;
      const t = now();
      bell(noteFreq(659.25, n * 2), t, 0.22, 1.6);
      bell(noteFreq(659.25, n * 2 + 2), t + 0.07, 0.14, 1.2);
      whoosh(t, 0.25, 1200, 5000, 0.1);
      if (n >= 2) gong(t, 80, 0.4, master, 2);
    },

    // Gamble card flip.
    cardFlip() {
      if (!ready()) return;
      const t = now();
      whoosh(t, 0.18, 2500, 600, 0.18);
      woodblock(t + 0.16, 1500, 0.14);
    },

    gambleLose() {
      if (!ready()) return;
      const t = now();
      tone('triangle', 330, t, 0.01, 0.25, 0.14, out(0.8, 0.2), 220);
      tone('triangle', 247, t + 0.22, 0.01, 0.45, 0.14, out(0.8, 0.25), 150);
    },

    // Chest rattling before it opens.
    chestShake() {
      if (!ready()) return;
      const t = now();
      taiko(t, 0.6, 50);
      for (let i = 0; i < 9; i++) woodblock(t + 0.65 + i * 0.065, 300 + (i % 2) * 90, 0.16);
      noiseHit(t + 0.65, 0.01, 0.6, 0.12, out(0.6, 0.1), 'bandpass', 900, 2);
    },

    // Lid bursts open: thump, creak, bright coin spray and a shimmer.
    chestOpen(tier = 0) {
      if (!ready() || playCustom('chest_open')) return;
      const t = now();
      taiko(t, 1, 46);
      whoosh(t, 0.5, 300, 3800, 0.3);
      tone('sawtooth', 140, t, 0.01, 0.25, 0.06, out(0.5, 0.2), 90);
      for (let i = 0; i < 14; i++) clink(t + 0.05 + Math.random() * 0.6, 0.1);
      for (let i = 0; i < 8; i++) bell(noteFreq(784, i), t + 0.08 + i * 0.06, 0.1, 1.2);
      if (tier) { gong(t, 66, 0.55, master, 3); cymbal(t, 0.25, 2); }
    },

    // Small sparkle when character symbols light up on a win.
    sparkle() {
      if (!ready()) return;
      const t = now();
      for (let i = 0; i < 4; i++) bell(noteFreq(1318.5, i * 2), t + i * 0.05, 0.05, 0.6);
    },

    rollupTick(i = 0) {
      if (!ready()) return;
      if (playCustom('rollup_tick', { vol: 0.5 })) return;
      const t = ctx.currentTime;
      if (t - lastTick < 0.045) return;
      lastTick = t;
      tone('sine', noteFreq(1568, i % 10), t, 0.001, 0.07, 0.07, out(1, 0.1));
      tone('sine', 5200 + Math.random() * 600, t, 0.001, 0.025, 0.03, out(1, 0));
    },

    featureTrigger() {
      if (!ready() || playCustom('feature_trigger')) return;
      const t = now();
      gong(t, 58, 1.0);
      cymbal(t, 0.3, 2.5);
      [0, 0.18, 0.36, 0.72, 0.9, 1.08, 1.26, 1.44].forEach((d, i) => taiko(t + d, i % 3 === 0 ? 1 : 0.6, 50));
      brass(nf('G3'), t + 0.36, 0.3, 0.16); brass(nf('D4'), t + 0.36, 0.3, 0.14);
      brass(nf('C4'), t + 0.72, 0.3, 0.16); brass(nf('G4'), t + 0.72, 0.3, 0.14);
      brass(nf('D4'), t + 1.08, 0.8, 0.18); brass(nf('A4'), t + 1.08, 0.8, 0.14); brass(nf('D5'), t + 1.08, 0.8, 0.1);
      firecrackers(t + 1.2, 18, 1.0, 0.4);
      for (let i = 0; i < 10; i++) bell(noteFreq(659, i), t + 1.1 + i * 0.06, 0.07, 0.8);
    },

    respinStart() {
      if (!ready()) return;
      const t = now();
      whoosh(t, 0.3, 600, 3000, 0.18);
      woodblock(t, 1000, 0.15);
    },

    respinReset() {
      if (!ready()) return;
      const t = now();
      [0, 0.07, 0.14].forEach((d, i) => woodblock(t + d, 900 + i * 220, 0.22));
      bell(noteFreq(1046, 4), t + 0.2, 0.12, 0.8);
    },

    blankLand() {
      if (!ready()) return;
      woodblock(now(), 320, 0.06);
    },

    collect(n = 0) { // tallying pearls at the end of the feature, rising
      if (!ready()) return;
      if (playCustom('coin_hit', { rate: Math.pow(2, (12 * Math.floor(n / 5) + PENT[n % 5]) / 12), vol: 0.8 })) return;
      const t = now();
      bell(noteFreq(659.25, n), t, 0.26, 1.0);
      clink(t, 0.18);
      clink(t + 0.05, 0.1);
    },

    jackpot() {
      if (!ready() || playCustom('jackpot')) return;
      const t = now();
      gong(t, 52, 1.0, master, 5);
      cymbal(t, 0.4, 3);
      [0, 0.12, 0.24].forEach((d) => taiko(t + d, 1, 46));
      for (let i = 0; i < 15; i++) bell(noteFreq(523.25, i), t + 0.1 + i * 0.045, 0.1, 1.2);
      firecrackers(t + 0.3, 24, 1.6, 0.45);
    },

    // The only fanfare. Played by the win screen and nowhere else.
    // tier: 1 big, 2 mega, 3 epic. Returns length in seconds.
    bigWinFanfare(tier = 1) {
      if (!ready()) return 4;
      const c = playCustom('big_win_fanfare', { bus: fanfareBus });
      if (c) return c.buffer.duration;

      const B = fanfareBus, t0 = now(), e = 0.19; // e = one eighth note
      const T = (s) => t0 + 0.25 + s * e;
      gong(t0, 55, 1.0, B, 5);
      cymbal(t0, 0.4, 2.8, B);
      taiko(t0, 1, 46, B);

      // Melody in G major pentatonic: [step, note, length in eighths]
      const phrase = [
        [0, 'G4', 2], [2, 'A4', 1], [3, 'B4', 1], [4, 'D5', 2], [6, 'B4', 1], [7, 'D5', 1],
        [8, 'E5', 3], [11, 'D5', 1], [12, 'E5', 1], [13, 'G5', 1], [14, 'A5', 2],
        [16, 'G5', 2], [18, 'E5', 1], [19, 'D5', 1], [20, 'E5', 2], [22, 'G5', 2],
      ];
      const ending = [[24, 'A5', 1], [25, 'B5', 1], [26, 'D6', 6]];
      const passes = tier >= 3 ? 2 : 1;
      const len = 24 * passes;
      for (let p = 0; p < passes; p++) {
        const off = p * 24;
        phrase.forEach(([s, n, d]) => {
          brass(nf(n), T(s + off), d * e * 0.92, 0.17, B);
          if (tier >= 2) brass(nf(n) / 2, T(s + off), d * e * 0.92, 0.08, B);
          if (p === 1) bell(nf(n) * 2, T(s + off), 0.05, 0.6, B);
        });
        // chord stabs on the downbeats
        [[0, ['G3', 'D4', 'G4']], [8, ['C4', 'E4', 'G4']], [16, ['D4', 'A4', 'D5']]].forEach(([s, ch]) =>
          ch.forEach((n) => brass(nf(n), T(s + off), e * 1.6, 0.07, B)));
        // taiko groove
        for (let s = 0; s < 24; s += 2) taiko(T(s + off), s % 8 === 0 ? 1 : 0.55, s % 8 === 0 ? 44 : 56, B);
        [5, 13, 21].forEach((s) => taiko(T(s + off), 0.45, 60, B));
        for (let s = 0; s < 24; s += 1) woodblock(T(s + off), s % 2 ? 1500 : 1100, 0.07, B);
        cymbal(T(off + 8), 0.18, 1.4, B); cymbal(T(off + 16), 0.18, 1.4, B);
      }
      // big ending
      ending.forEach(([s, n, d]) => { brass(nf(n) / (tier >= 2 ? 1 : 2), T(len + s - 24), d * e, 0.2, B); });
      const endT = T(len + 2);
      ['G3', 'D4', 'G4', 'B4', 'D5'].forEach((n) => brass(nf(n), endT, e * 7, 0.09, B));
      gong(endT, 50, 1.0, B, 6);
      cymbal(endT, 0.45, 3.5, B);
      [0, 0.1, 0.2, 0.3].forEach((d) => taiko(endT + d, 1, 44, B));
      firecrackers(endT, 16 + tier * 14, 1.5 + tier * 0.6, 0.5, B);
      for (let i = 0; i < 12 + tier * 4; i++) bell(noteFreq(784, i), endT + 0.05 + i * 0.05, 0.07, 1.4, B);
      // coin shower sparkles across the whole fanfare
      const total = (endT - t0) + 2.5;
      for (let x = 0.3; x < total - 1; x += 0.11 + Math.random() * 0.12) clink(t0 + x, 0.05 + Math.random() * 0.05, B);
      return total;
    },

    stopFanfare() {
      if (!ctx) return;
      const t = ctx.currentTime;
      const old = fanfareBus;
      [old.gain, old.verbSend.gain].forEach((p) => {
        p.cancelScheduledValues(t); p.setValueAtTime(p.value, t); p.linearRampToValueAtTime(0, t + 0.35);
      });
      playing.forEach((s) => { try { s.stop(t + 0.4); } catch (e) { } });
      // Fresh bus so the next fanfare isn't muted by notes still scheduled on the old one.
      fanfareBus = makeBus();
      setTimeout(() => { old.disconnect(); old.verbSend.disconnect(); }, 12000);
    },
  };
  return api;
})();
