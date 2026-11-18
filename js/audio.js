// Fully synthesized audio (Web Audio API): ambience, footsteps, heartbeat,
// monster voices, stingers and the jump scare. No sound files.

const R = Math.random;

export class AudioEngine {
  constructor() { this.ctx = null; this.amb = []; this.timers = {}; this.calm = 1; this.heart = 0; this.breath = 0; this.theme = null; this.volume = 0.8; }

  init() {
    if (this.ctx) { if (this.ctx.state !== 'running') this.ctx.resume(); return; }
    const ctx = this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.out = ctx.createGain(); this.out.gain.value = this.volume;
    const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 6;
    this.out.connect(comp); comp.connect(ctx.destination);
    this.master = ctx.createGain(); this.master.connect(this.out);
    this.reverb = ctx.createConvolver(); this.rvGain = ctx.createGain(); this.rvGain.gain.value = 0.6;
    this.reverb.connect(this.rvGain); this.rvGain.connect(this.master);
    this.setReverb(2.5, 3);
    const len = ctx.sampleRate * 2, buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = R() * 2 - 1;
    this.noiseBuf = buf;
    const curve = new Float32Array(1024);
    for (let i = 0; i < 1024; i++) { const x = i / 512 - 1; curve[i] = Math.tanh(x * 6); }
    this.distCurve = curve;
  }

  setVolume(v) { this.volume = v; if (this.out) this.out.gain.value = v; }

  setReverb(sec, decay) {
    const ctx = this.ctx, len = (ctx.sampleRate * sec) | 0, buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) { const d = buf.getChannelData(c); for (let i = 0; i < len; i++) d[i] = (R() * 2 - 1) * Math.pow(1 - i / len, decay); }
    this.reverb.buffer = buf;
  }

  get t() { return this.ctx.currentTime; }

  noise(loop = true) { const s = this.ctx.createBufferSource(); s.buffer = this.noiseBuf; s.loop = loop; return s; }
  osc(type, freq) { const o = this.ctx.createOscillator(); o.type = type; o.frequency.value = freq; return o; }
  gain(v = 0) { const g = this.ctx.createGain(); g.gain.value = v; return g; }
  filter(type, f, q = 1) { const b = this.ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; return b; }
  pan(p = 0) { const s = this.ctx.createStereoPanner ? this.ctx.createStereoPanner() : this.gain(1); if (s.pan) s.pan.value = p; return s; }

  // route a node to master with optional reverb send
  route(node, wet = 0.3, p = 0) {
    const pn = this.pan(p); node.connect(pn); pn.connect(this.master);
    if (wet > 0) { const s = this.gain(wet); pn.connect(s); s.connect(this.reverb); }
    return pn;
  }

  env(g, t, a, peak, d, hold = 0) {
    g.gain.cancelScheduledValues(t); g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t + a);
    g.gain.setValueAtTime(Math.max(peak, 0.0002), t + a + hold);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + hold + d);
  }

  // one-shot helpers
  tone(type, f, dur, vol, { at = 0, wet = 0.3, pan = 0, f2 = null, a = 0.005, filt = null } = {}) {
    if (!this.ctx) return;
    const t = this.t + at, o = this.osc(type, f), g = this.gain();
    if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur);
    let n = o; if (filt) { const fl = this.filter('lowpass', filt); o.connect(fl); n = fl; }
    n.connect(g); this.route(g, wet, pan); this.env(g, t, a, vol, dur);
    o.start(t); o.stop(t + a + dur + 0.05);
  }
  burst(f, q, dur, vol, { at = 0, wet = 0.2, pan = 0, type = 'bandpass', a = 0.003, f2 = null } = {}) {
    if (!this.ctx) return;
    const t = this.t + at, s = this.noise(false), fl = this.filter(type, f, q), g = this.gain();
    if (f2) fl.frequency.exponentialRampToValueAtTime(f2, t + dur);
    s.connect(fl); fl.connect(g); this.route(g, wet, pan); this.env(g, t, a, vol, dur);
    s.start(t, R() * 1.5); s.stop(t + a + dur + 0.05);
  }

  // ---------- ambience ----------
  startAmbience(theme) {
    this.stopAmbience(); this.theme = theme;
    const keep = (...n) => this.amb.push(...n);
    const lfo = (f, depth, target) => { const o = this.osc('sine', f), g = this.gain(depth); o.connect(g); g.connect(target); o.start(); keep(o); return o; };
    if (theme === 'camp') {
      this.setReverb(1.6, 4);
      const w = this.noise(), bp = this.filter('bandpass', 380, 0.8), g = this.gain(0.18);
      w.connect(bp); bp.connect(g); this.route(g, 0.2); w.start(); lfo(0.07, 220, bp.frequency); lfo(0.11, 0.08, g.gain); keep(w);
      const d1 = this.osc('sine', 55), d2 = this.osc('sine', 55.35), dg = this.gain(0.045);
      d1.connect(dg); d2.connect(dg); this.route(dg, 0.1); d1.start(); d2.start(); keep(d1, d2);
    } else if (theme === 'arcade') {
      this.setReverb(2.2, 3);
      const h = this.osc('sawtooth', 60), lp = this.filter('lowpass', 180), hg = this.gain(0.05);
      h.connect(lp); lp.connect(hg); this.route(hg, 0.05); h.start(); keep(h);
      const h2 = this.osc('sine', 120), hg2 = this.gain(0.025); h2.connect(hg2); this.route(hg2, 0); h2.start(); keep(h2);
      const b = this.noise(), bp = this.filter('bandpass', 3200, 10), bg = this.gain(0.012);
      b.connect(bp); bp.connect(bg); this.route(bg, 0); b.start(); lfo(7, 0.008, bg.gain); keep(b);
      const d = this.osc('sine', 46), dg = this.gain(0.04); d.connect(dg); this.route(dg, 0.2); d.start(); keep(d);
    } else {
      this.setReverb(4.5, 2.2);
      for (const f of [41, 41.6, 82.4]) { const o = this.osc('sine', f), g = this.gain(0.035); o.connect(g); this.route(g, 0.3); o.start(); keep(o); }
      const w = this.noise(), bp = this.filter('bandpass', 650, 7), g = this.gain(0.09);
      w.connect(bp); bp.connect(g); this.route(g, 0.5); w.start(); lfo(0.05, 300, bp.frequency); lfo(0.09, 0.06, g.gain); keep(w);
    }
    this.timers = { stinger: 14 + R() * 20, cricket: 0, tune: 20 + R() * 15, bell: 30 + R() * 30, heart: 0, breath: 0 };
  }

  stopAmbience() {
    for (const n of this.amb) { try { n.stop(); } catch (e) {} }
    this.amb = [];
  }

  // called every frame
  tick(dt) {
    if (!this.ctx || !this.theme) return;
    const T = this.timers;
    T.stinger -= dt;
    if (T.stinger <= 0) { this.stinger(); T.stinger = 18 + R() * 32; }
    if (this.theme === 'camp') {
      T.cricket -= dt;
      if (T.cricket <= 0) {
        T.cricket = 0.35 + R() * 0.5;
        if (this.calm > 0.05) {
          const p = R() * 2 - 1, f = 4200 + R() * 600;
          for (let i = 0; i < 3; i++) this.tone('sine', f, 0.03, 0.02 * this.calm, { at: i * 0.05, pan: p, wet: 0.1 });
        }
      }
    }
    if (this.theme === 'arcade') { T.tune -= dt; if (T.tune <= 0) { this.creepyTune(); T.tune = 30 + R() * 30; } }
    if (this.theme === 'castle') { T.bell -= dt; if (T.bell <= 0) { this.bell(); T.bell = 40 + R() * 40; } }
    // heartbeat
    if (this.heart > 0.05) {
      T.heart -= dt;
      if (T.heart <= 0) {
        T.heart = 1.05 - this.heart * 0.6;
        const v = 0.15 + this.heart * 0.5;
        this.tone('sine', 62, 0.14, v, { f2: 38, wet: 0 });
        this.tone('sine', 58, 0.12, v * 0.7, { at: 0.17, f2: 36, wet: 0 });
      }
    }
    if (this.breath > 0.2) {
      T.breath -= dt;
      if (T.breath <= 0) { T.breath = 0.9 - this.breath * 0.3; this.burst(900, 0.8, 0.35, 0.05 * this.breath, { a: 0.12, wet: 0 }); this.burst(700, 0.8, 0.4, 0.04 * this.breath, { at: 0.45, a: 0.1, wet: 0 }); }
    }
  }

  stinger() {
    const p = R() * 1.6 - 0.8, k = (R() * 6) | 0;
    if (k === 0) { for (let i = 0; i < 3; i++) this.burst(180, 1.5, 0.12, 0.25, { at: i * 0.32 + R() * 0.05, pan: p, wet: 0.7, type: 'lowpass' }); }
    else if (k === 1) { // creak
      const t = this.t, o = this.osc('sawtooth', 70), bp = this.filter('bandpass', 900, 12), g = this.gain();
      o.frequency.linearRampToValueAtTime(95, t + 0.6); o.frequency.linearRampToValueAtTime(60, t + 1.3);
      o.connect(bp); bp.connect(g); this.route(g, 0.6, p); this.env(g, t, 0.2, 0.12, 1.1); o.start(t); o.stop(t + 1.5);
    } else if (k === 2) { // whisper
      for (let i = 0; i < 5; i++) this.burst(2200 + R() * 1500, 4, 0.12 + R() * 0.1, 0.07, { at: i * 0.16, pan: p, wet: 0.8, a: 0.03 });
    } else if (k === 3) { // distant scream
      this.tone('sawtooth', 900, 1.4, 0.03, { f2: 500, pan: p, wet: 1, filt: 1800, a: 0.2 });
    } else if (k === 4) { // twig / snap
      this.burst(2500, 1, 0.04, 0.3, { pan: p, wet: 0.5 }); this.burst(1600, 1, 0.05, 0.2, { at: 0.07, pan: p, wet: 0.5 });
    } else { // low swell
      this.tone('sawtooth', 40, 3, 0.06, { a: 1.5, filt: 200, wet: 0.6, f2: 44 });
    }
  }

  creepyTune() {
    const notes = [523, 659, 587, 523, 440, 494, 392, 415], p = R() * 1.4 - 0.7;
    notes.forEach((f, i) => this.tone('square', f * 0.98, 0.35, 0.025, { at: i * 0.42 + R() * 0.05, pan: p, wet: 0.8, filt: 1400, f2: f * 0.93 }));
  }
  bell() {
    const p = R() * 1.2 - 0.6;
    for (const [m, v] of [[1, 0.06], [2.4, 0.03], [3.9, 0.02], [0.5, 0.04]]) this.tone('sine', 110 * m, 5, v, { pan: p, wet: 0.9, a: 0.01 });
  }

  // ---------- one-shots ----------
  footstep(surface, sprint) {
    const f = { grass: 700, dirt: 500, woodFloor: 350, carpet: 260, tile: 1500, stoneFloor: 1100, redCarpet: 300 }[surface] || 600;
    const v = sprint ? 0.32 : 0.18;
    this.burst(f * (0.85 + R() * 0.3), 1.2, 0.09, v, { wet: 0.15, type: surface === 'tile' || surface === 'stoneFloor' ? 'bandpass' : 'lowpass' });
    this.tone('sine', 80, 0.06, v * 0.5, { wet: 0, f2: 50 });
  }
  monsterStep(vol, pan, kind) {
    if (vol < 0.01) return;
    if (kind === 'grins') { this.burst(300, 2, 0.12, vol * 0.6, { pan, wet: 0.3, type: 'lowpass' }); this.tone('square', 1800, 0.03, vol * 0.08, { pan, wet: 0.2 }); }
    else this.burst(260, 1.5, 0.14, vol * 0.55, { pan, wet: 0.3, type: 'lowpass' });
  }
  click() { this.tone('square', 2400, 0.015, 0.08, { wet: 0 }); this.tone('square', 1200, 0.015, 0.05, { at: 0.03, wet: 0 }); }
  pickup() { this.tone('sine', 880, 0.5, 0.12, { wet: 0.5 }); this.tone('sine', 1320, 0.6, 0.08, { at: 0.12, wet: 0.5 }); }
  stepDone() { [440, 554, 659].forEach((f, i) => this.tone('triangle', f, 0.7, 0.1, { at: i * 0.1, wet: 0.5 })); }
  objectiveDone() {
    [392, 466, 587, 698].forEach((f, i) => this.tone('triangle', f, 1.2, 0.11, { at: i * 0.14, wet: 0.6 }));
    this.tone('sine', 98, 2, 0.15, { wet: 0.6 });
  }
  denied() { this.tone('square', 140, 0.15, 0.06, { wet: 0, filt: 800 }); this.tone('square', 110, 0.2, 0.06, { at: 0.16, wet: 0, filt: 800 }); }
  lowBattery() { this.tone('square', 1600, 0.06, 0.04, { wet: 0 }); this.tone('square', 1600, 0.06, 0.04, { at: 0.12, wet: 0 }); }
  hide() { this.burst(1200, 3, 0.25, 0.12, { wet: 0.2, a: 0.05, f2: 500 }); }
  unlock() {
    this.tone('sine', 55, 4, 0.3, { wet: 0.8, f2: 50 });
    [220, 261, 311, 370].forEach((f, i) => this.tone('sawtooth', f, 2.5, 0.04, { at: i * 0.05, filt: 900, wet: 0.8 }));
  }
  spotted() {
    const t = this.t;
    [55, 58.3, 82.4].forEach(f => this.tone('sawtooth', f, 1.4, 0.13, { filt: 600, wet: 0.5, a: 0.01 }));
    this.tone('sawtooth', 1900, 0.7, 0.05, { f2: 1700, filt: 4000, wet: 0.6, a: 0.02 });
    this.tone('sawtooth', 1960, 0.7, 0.05, { f2: 1650, filt: 4000, wet: 0.6, a: 0.02 });
  }
  scare() {
    if (!this.ctx) return;
    const t = this.t;
    const ws = this.ctx.createWaveShaper(); ws.curve = this.distCurve;
    const g = this.gain(); ws.connect(g); this.route(g, 0.4); this.env(g, t, 0.005, 0.9, 1.4, 0.2);
    for (const f of [420, 433, 610, 870]) { const o = this.osc('sawtooth', f); o.frequency.exponentialRampToValueAtTime(f * 0.45, t + 1.6); o.connect(ws); o.start(t); o.stop(t + 1.8); }
    const n = this.noise(false), hp = this.filter('highpass', 900); n.connect(hp); hp.connect(ws); n.start(t); n.stop(t + 1.8);
    this.tone('sine', 50, 1.8, 0.8, { f2: 30, wet: 0.3 });
  }
  gameOver() { this.tone('sine', 40, 5, 0.4, { wet: 0.9, f2: 25 }); this.tone('sawtooth', 80, 4, 0.05, { filt: 300, wet: 0.9, f2: 60 }); }
  win() { [262, 330, 392, 523].forEach((f, i) => this.tone('triangle', f, 3, 0.08, { at: i * 0.25, wet: 0.7 })); }

  // ---------- continuous monster voice ----------
  voice(kind) {
    if (!this.ctx) return null;
    const out = this.gain(0), pn = this.pan(0), send = this.gain(0.35);
    out.connect(pn); pn.connect(this.master); pn.connect(send); send.connect(this.reverb);
    const nodes = [];
    const v = { out, pn, kind, nodes, intensity: 0, timer: 1 + R() * 2 };
    if (kind === 'counselor') {
      const n = this.noise(), bp = this.filter('bandpass', 520, 2.2), amp = this.gain(0.4);
      const l = this.osc('sine', 0.38), lg = this.gain(0.4); l.connect(lg); lg.connect(amp.gain);
      n.connect(bp); bp.connect(amp); amp.connect(out);
      const gr = this.osc('sawtooth', 68), lp = this.filter('lowpass', 260), gg = this.gain(0.25);
      gr.connect(lp); lp.connect(gg); gg.connect(out);
      n.start(); l.start(); gr.start(); nodes.push(n, l, gr);
      v.lfo = l; v.growl = gg;
    } else if (kind === 'grins') {
      const s = this.osc('sawtooth', 150), bp = this.filter('bandpass', 900, 3), amp = this.gain(0.15);
      const l = this.osc('square', 3), lg = this.gain(0.15); l.connect(lg); lg.connect(amp.gain);
      s.connect(bp); bp.connect(amp); amp.connect(out);
      s.start(); l.start(); nodes.push(s, l); v.lfo = l; v.servo = s;
    } else {
      const o = this.osc('sine', 210), o2 = this.osc('triangle', 316), vib = this.osc('sine', 5), vg = this.gain(7);
      const glide = this.osc('sine', 0.09), gl = this.gain(45);
      vib.connect(vg); vg.connect(o.frequency); vg.connect(o2.frequency); glide.connect(gl); gl.connect(o.frequency); gl.connect(o2.frequency);
      const bp = this.filter('bandpass', 800, 1.5), g2 = this.gain(0.35), og2 = this.gain(0.25);
      o.connect(bp); o2.connect(og2); og2.connect(bp); bp.connect(g2); g2.connect(out);
      const sob = this.osc('sine', 0.6), sg = this.gain(0.2); sob.connect(sg); sg.connect(g2.gain);
      [o, o2, vib, glide, sob].forEach(x => { x.start(); nodes.push(x); });
      v.o = o; v.o2 = o2;
    }
    return v;
  }

  updateVoice(v, vol, pan, chasing, dt) {
    if (!v) return;
    const t = this.t;
    v.out.gain.setTargetAtTime(vol * (chasing ? 1 : 0.7), t, 0.1);
    if (v.pn.pan) v.pn.pan.setTargetAtTime(pan, t, 0.1);
    if (v.kind === 'counselor') { v.lfo.frequency.setTargetAtTime(chasing ? 1.4 : 0.38, t, 0.3); v.growl.gain.setTargetAtTime(chasing ? 0.6 : 0.2, t, 0.3); }
    if (v.kind === 'grins') {
      v.lfo.frequency.setTargetAtTime(chasing ? 7 : 3, t, 0.3);
      v.timer -= dt;
      if (v.timer <= 0 && vol > 0.02) { // music-box chime from the costume
        v.timer = chasing ? 0.25 : 0.7 + R() * 0.5;
        const notes = [1047, 1175, 1319, 1568, 1397, 1175];
        this.tone('sine', notes[(R() * notes.length) | 0], 0.4, vol * 0.12, { pan, wet: 0.5 });
      }
    }
    if (v.kind === 'widow') { v.o.frequency.setTargetAtTime(chasing ? 300 : 210, t, 0.5); v.o2.frequency.setTargetAtTime(chasing ? 440 : 316, t, 0.5); }
  }

  stopVoice(v) {
    if (!v) return;
    v.out.gain.setTargetAtTime(0, this.t, 0.05);
    setTimeout(() => { v.nodes.forEach(n => { try { n.stop(); } catch (e) {} }); v.out.disconnect(); }, 300);
  }
}
