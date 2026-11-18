// They Know You're Here — game controller: menu, game loop, HUD, catch / win / lose.
import * as THREE from 'three';
import { MAPS, CELL } from './maps.js';
import { World } from './world.js';
import { Player } from './player.js';
import { Director, DEFS } from './monsters.js';
import { Objectives } from './objectives.js';
import { AudioEngine } from './audio.js';
import { Input } from './input.js';
import * as store from './storage.js';
import { AutoMap } from './automap.js';

const $ = (id) => document.getElementById(id);
const LENGTHS = [5, 15, 30];
const params = new URLSearchParams(location.search);
const TEST = params.get('test'); // ?test=camp  -> starts straight into a map (for automated screenshots)

const ART = {
  camp: 'radial-gradient(circle at 90% 16%, rgba(220,220,200,0.30) 0 5%, transparent 6%), linear-gradient(to top, #0a1208 0%, #0d1a14 40%, #0a0f1c 100%)',
  arcade: 'repeating-linear-gradient(90deg, rgba(160,60,255,0.18) 0 2px, transparent 2px 26px), linear-gradient(to top, #12062a, #1a0a24 50%, #07040c)',
  castle: 'radial-gradient(circle at 50% 120%, rgba(255,120,40,0.35), transparent 55%), linear-gradient(to top, #120c0a, #0c0c12)',
};

class Game {
  constructor() {
    this.settings = store.loadSettings();
    if (!MAPS.find(m => m.id === this.settings.map)) this.settings.map = 'camp';
    this.canvas = $('game');
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: false, powerPreference: 'high-performance' });
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.camera = new THREE.PerspectiveCamera(72, innerWidth / innerHeight, 0.05, 140);
    this.audio = new AudioEngine();
    this.state = 'menu'; this.time = 0; this.clock = new THREE.Clock();
    this.input = new Input(this.canvas, {
      flash: () => { if (this.state === 'playing') this.player.toggleFlash(); },
      use: () => this.use(),
      sense: () => this.sense(),
      map: () => { if (this.state === 'playing') this.automap.toggle(); },
      pause: () => { if (this.state === 'playing') this.pause(); else if (this.state === 'paused') this.resume(); },
      lockRequest: () => { if (this.state === 'playing' || this.state === 'ready') this.input.lock(); },
    });
    if (this.input.touch) document.body.classList.add('touch');
    this.automap = new AutoMap(this);
    document.addEventListener('pointerlockchange', () => {
      const locked = document.pointerLockElement === this.canvas;
      if (locked && (this.state === 'ready' || this.state === 'paused')) this.setPlaying();
      else if (!locked && this.state === 'playing') this.pause();
    });
    document.addEventListener('pointerlockerror', () => { if (this.state === 'ready') $('clicktoplay').hidden = false; });
    $('clicktoplay').addEventListener('click', () => this.input.lock());
    document.addEventListener('visibilitychange', () => { if (document.hidden && this.state === 'playing') this.pause(); });
    addEventListener('resize', () => this.resize());
    this.setupMenu();
    this.resize();
    this.renderer.setAnimationLoop(() => this.frame());
    if (TEST) { this.settings.map = TEST; this.start(); }
  }

  // ---------------- menu ----------------
  setupMenu() {
    const s = this.settings, maps = $('maps');
    maps.innerHTML = '';
    for (const m of MAPS) {
      const b = document.createElement('button');
      b.className = 'mapcard'; b.dataset.id = m.id; b.style.setProperty('--art', ART[m.id]);
      b.innerHTML = `<h3>${m.name}</h3><p>${m.tagline}</p><div class="mon">Hunted by ${m.monsterName}</div><div class="rec"></div>`;
      b.onclick = () => { s.map = m.id; this.refreshMenu(); };
      maps.appendChild(b);
    }
    const seg = (id, get, set) => { for (const b of $(id).children) b.onclick = () => { set(b.dataset.v); this.refreshMenu(); }; };
    seg('diff', () => s.difficulty, v => s.difficulty = v);
    seg('batt', () => s.battery, v => s.battery = v === 'on');
    seg('qual', () => s.quality, v => s.quality = v);
    $('len').oninput = () => { s.length = LENGTHS[+$('len').value]; this.refreshMenu(); };
    $('start').onclick = () => this.start();
    $('how-btn').onclick = () => { $('how').hidden = false; };
    $('how').querySelector('.close').onclick = () => { $('how').hidden = true; };
    $('resume').onclick = () => this.resume();
    $('quit').onclick = () => this.toMenu();
    $('retry').onclick = () => this.start();
    $('tomenu').onclick = () => this.toMenu();
    $('sens').value = s.sens; $('vol').value = s.volume;
    $('sens').oninput = () => { s.sens = +$('sens').value; this.input.sens = s.sens; store.saveSettings(s); };
    $('vol').oninput = () => { s.volume = +$('vol').value; this.audio.setVolume(s.volume); store.saveSettings(s); };
    $('bright').value = s.bright;
    $('bright').oninput = () => { s.bright = +$('bright').value; this.renderer.toneMappingExposure = s.bright; store.saveSettings(s); };
    this.renderer.toneMappingExposure = s.bright;
    // beam width: same setting from the menu card and the pause screen, applied live
    const beams = document.querySelectorAll('input.beam');
    beams.forEach(el => {
      el.value = s.beam;
      el.oninput = () => {
        s.beam = +el.value; beams.forEach(o => { o.value = s.beam; });
        if (this.player) this.player.flash.angle = s.beam;
        store.saveSettings(s);
      };
    });
    this.input.sens = s.sens;
    this.refreshMenu();
  }

  refreshMenu() {
    const s = this.settings, rec = store.loadRecords(), key = store.runKey(s);
    for (const b of $('maps').children) {
      b.classList.toggle('sel', b.dataset.id === s.map);
      const r = rec[b.dataset.id];
      const best = r && r.best[key];
      b.querySelector('.rec').textContent = `Best (${s.difficulty}, ${s.length} min): ${store.fmtTime(best)}  ·  High score: ${r ? r.highScore : 0}`;
    }
    const mark = (id, v) => { for (const b of $(id).children) b.classList.toggle('on', b.dataset.v === v); };
    mark('diff', s.difficulty); mark('batt', s.battery ? 'on' : 'off'); mark('qual', s.quality);
    $('len').value = LENGTHS.indexOf(s.length);
    $('len-val').textContent = `· ~${s.length} min`;
    $('diff-note').textContent = s.difficulty === 'easy' ? '3 lives. Progress is kept when caught. Simpler tasks.' : 'One life. Faster, sharper monsters. Multi-step tasks.';
    const n = { 5: 3, 15: 5, 30: 8 }[s.length];
    $('len-note').textContent = `${n} objectives`;
    store.saveSettings(s);
  }

  // ---------------- run lifecycle ----------------
  start() {
    this.audio.init(); this.audio.setVolume(this.settings.volume);
    this.cleanup();
    const s = this.settings, map = this.map = MAPS.find(m => m.id === s.map);
    const scene = this.scene = new THREE.Scene();
    scene.background = new THREE.Color(map.fog);
    scene.fog = new THREE.FogExp2(map.fog, map.fogDensity);
    this.hemi = new THREE.HemisphereLight(map.hemi[0], map.hemi[1], map.hemi[2]); scene.add(this.hemi);
    this.adapt = 1;
    scene.add(this.camera);
    this.renderer.shadowMap.enabled = s.quality === 'high';
    this.world = new World(map, scene, (Math.random() * 1e9) | 0, s.quality);
    this.player = new Player(this, this.camera);
    this.time = 0; this.progress = 0; this.escaping = false; this.invulnerable = false; this.invulnT = 0;
    this.lives = s.difficulty === 'easy' ? 3 : 1; this.senseCd = 0; this.senseT = 0; this.lastSting = -99; this.hudT = 0;
    this.objectives = new Objectives(this);
    this.director = new Director(this);
    this.automap.reset();
    this.audio.startAmbience(map.id);
    if (this.audio.ctx && this.audio.ctx.state === 'suspended') this.audio.ctx.resume();
    ['menu', 'end', 'pause', 'how', 'clicktoplay'].forEach(id => $(id).hidden = true);
    $('hud').hidden = false; $('fade').classList.remove('on');
    $('bar-batt').style.display = s.battery ? '' : 'none';
    this.resize();
    this.showIntro();
    this.renderHUD(true);
    if (this.input.touch || TEST) this.setPlaying();
    else { this.state = 'ready'; this.input.lock(); }
  }

  setPlaying() {
    this.state = 'playing'; this.clock.getDelta();
    $('pause').hidden = true; $('clicktoplay').hidden = true;
    if (this.audio.ctx) this.audio.ctx.resume();
  }

  pause() {
    if (this.state !== 'playing') return;
    this.state = 'paused'; $('pause').hidden = false; this.automap.close();
    this.input.unlock();
    if (this.audio.ctx) this.audio.ctx.suspend();
  }
  resume() {
    if (this.state !== 'paused') return;
    if (this.input.touch) this.setPlaying(); else this.input.lock();
  }

  cleanup() {
    if (this.director) this.director.dispose();
    if (this.world) this.world.dispose();
    if (this.player) { this.camera.remove(this.player.flash, this.player.flash.target, this.player.spill); }
    this.audio.stopAmbience();
    this.director = this.world = this.player = this.objectives = null;
    $('toasts').innerHTML = '';
  }

  toMenu() {
    this.cleanup(); this.state = 'menu'; this.input.unlock();
    ['hud', 'end', 'pause', 'clicktoplay'].forEach(id => $(id).hidden = true);
    $('menu').hidden = false; $('fade').classList.remove('on');
    this.refreshMenu();
  }

  showIntro() {
    const m = this.map, el = $('intro');
    el.innerHTML = `<h2>${m.name}</h2><p>Complete every objective, then escape through the ${m.exitLabel}.</p><p class="m">${m.monsterName.toUpperCase()} IS HERE</p>`;
    el.classList.add('on'); clearTimeout(this.introTO);
    this.introTO = setTimeout(() => el.classList.remove('on'), 4200);
  }

  toast(text, big = false) {
    const d = document.createElement('div'); d.textContent = text; if (big) d.className = 'big';
    const box = $('toasts'); box.appendChild(d); while (box.children.length > 3) box.firstChild.remove();
    setTimeout(() => d.remove(), 3300);
  }

  // ---------------- events from systems ----------------
  onProgress() {
    this.progress = this.objectives.doneUnits / this.objectives.total;
    this.director.hurry();
    this.renderHUD(true);
    if (this.objectives.allDone && !this.escaping) {
      this.escaping = true; this.world.openExit(); this.audio.unlock();
      setTimeout(() => this.toast(`The ${this.map.exitLabel} is open. RUN.`, true), 900);
      this.director.timer = 0;
      // everything knows where you are now
      for (const m of this.director.monsters) if (m.state !== 'chase') { m.state = 'investigate'; m.lastKnown = this.player.pos.clone(); m.path = null; }
    }
  }

  onSpotted(m) {
    if (this.time - this.lastSting > 7) { this.audio.spotted(); this.lastSting = this.time; }
  }

  makeNoise(pos, radius) {
    for (const m of this.director.monsters) {
      if (m.state === 'chase' || m.state === 'grab') continue;
      if (m.pos.distanceTo(pos) < radius) { m.state = 'investigate'; m.lastKnown = pos.clone(); m.path = null; }
    }
  }

  use() {
    if (this.state !== 'playing') return;
    const p = this.player;
    if (p.hidden) { p.unhide(); return; }
    const f = this.focus; if (!f) return;
    if (f.hide) { p.hide(f.hide); for (const m of this.director.monsters) m.onPlayerHid(f.hide); }
    else this.objectives.interact(f.item);
  }

  sense() {
    if (this.state !== 'playing') return;
    if (this.senseCd > 0) { this.toast('You need to calm down first...'); return; }
    const t = this.objectives.nearestTarget(this.player.pos);
    if (!t) return;
    this.senseTarget = t; this.senseT = 4; this.senseCd = this.settings.difficulty === 'hard' ? 45 : 20; this.senseMax = this.senseCd;
    this.audio.stinger && this.audio.burst(2600, 4, 0.5, 0.06, { wet: 0.8, a: 0.15 });
  }

  caught(monster, pulled) {
    if (this.state !== 'playing') return;
    this.state = 'caught'; this.scareT = 0; this.scareM = monster;
    const p = this.player;
    if (p.hidden) { p.pos.copy(p.hideSpot.out); p.hidden = false; p.hideSpot = null; }
    p.flashOn = true; p.flash.intensity = 40;
    this.audio.scare();
    const fl = $('flashfx'); fl.style.transition = 'none'; fl.style.opacity = '0.9';
    requestAnimationFrame(() => { fl.style.transition = 'opacity 1.4s'; fl.style.opacity = '0'; });
    this.automap.close();
    $('hideview').className = ''; $('prompt').className = ''; $('hud').hidden = true; $('intro').classList.remove('on');
    if (!this.scareLight) { this.scareLight = new THREE.PointLight(0xffd0c0, 6, 4, 1.5); }
    this.scene.add(this.scareLight);
  }

  updateScare(dt) {
    this.scareT += dt;
    const m = this.scareM, p = this.player, cam = this.camera, t = this.scareT;
    const fx = -Math.sin(p.yaw), fz = -Math.cos(p.yaw);
    const def = DEFS[m.kind], near = def.scareD;
    const d = t < 0.18 ? near + 1.2 - t / 0.18 * 1.2 : near + Math.sin(t * 40) * 0.02;
    m.mesh.position.set(p.pos.x + fx * d, 1.62 - def.headY + 0.05, p.pos.z + fz * d);
    m.mesh.rotation.set(0, Math.atan2(-fx, -fz), 0);
    const [ax, az] = def.scareArms;
    m.parts.armL.rotation.x = ax; m.parts.armR.rotation.x = ax + 0.1; m.parts.armL.rotation.z = -az; m.parts.armR.rotation.z = az;
    m.parts.head.rotation.z = Math.sin(t * 30) * 0.15;
    const sh = Math.max(0, 1 - t / 1.5) * 0.05;
    cam.position.set(p.pos.x + (Math.random() - 0.5) * sh, 1.62 + (Math.random() - 0.5) * sh, p.pos.z);
    cam.rotation.set(-0.02 + (Math.random() - 0.5) * sh, p.yaw, (Math.random() - 0.5) * sh * 2);
    this.scareLight.position.set(p.pos.x + fx * 0.3, 1.5, p.pos.z + fz * 0.3);
    if (t > 1.5 && !$('fade').classList.contains('on')) $('fade').classList.add('on');
    if (t > 2.3) this.afterCatch();
  }

  afterCatch() {
    this.scene.remove(this.scareLight);
    this.lives--;
    const m = this.scareM; m.parts.armL.rotation.z = m.parts.armR.rotation.z = 0;
    if (this.settings.difficulty === 'hard' || this.lives <= 0) return this.end(false);
    this.player.respawn(); this.director.scatter();
    // the one that caught you goes far away
    m.state = 'wander'; m.path = null;
    this.invulnerable = true; this.invulnT = 4;
    this.state = 'playing'; $('fade').classList.remove('on'); $('hud').hidden = false;
    this.renderHUD(true);
    setTimeout(() => this.toast(this.lives === 1 ? 'Last chance.' : `${this.lives} lives left`, true), 500);
  }

  end(won) {
    this.state = won ? 'win' : 'over'; this.input.unlock(); this.automap.close();
    const s = this.settings, o = this.objectives;
    let html = `<div>Time: ${store.fmtTime(this.time)}</div><div>Objectives: ${o.list.filter(x => x.done).length} / ${o.list.length}</div>`;
    if (won) {
      const pts = store.score({ time: this.time, lives: this.lives, settings: s });
      const r = store.recordRun(this.map.id, s, this.time, pts);
      html += `<div>Score: <b>${pts}</b>${r.newHigh ? ' <span class="new">NEW HIGH SCORE</span>' : ''}</div>`;
      if (r.newBest) html += `<div class="new">New best time for ${s.difficulty}, ${s.length} min</div>`;
      $('end-title').textContent = 'You escaped';
      $('end-sub').textContent = `${this.map.monsterName} will be waiting for the next one.`;
      this.audio.win();
    } else {
      $('end-title').textContent = 'They found you';
      $('end-sub').textContent = `${this.map.monsterName} got you in ${this.map.name}.`;
      this.audio.gameOver();
    }
    this.audio.stopAmbience();
    this.director.dispose();
    $('end-stats').innerHTML = html;
    $('end').hidden = false; $('hud').hidden = true;
    setTimeout(() => $('fade').classList.remove('on'), 50);
  }

  // ---------------- per-frame ----------------
  frame() {
    const dt = Math.min(0.05, this.clock.getDelta());
    if (this.state === 'playing') this.update(dt);
    else if (this.state === 'caught') { this.updateScare(dt); this.world.update(dt, this.time); }
    if (this.world) this.renderer.render(this.scene, this.camera);
  }

  update(dt) {
    this.time += dt;
    const p = this.player, inp = this.input.frame();
    p.update(dt, inp);
    // eyes adjust to the dark when the flashlight is off; snap back when it's on
    const want = p.flashOn ? 1 : p.hidden ? 3.2 : 2.6;
    this.adapt += (want - this.adapt) * Math.min(1, dt * (want > this.adapt ? 0.45 : 4));
    this.hemi.intensity = this.map.hemi[2] * this.adapt;
    if (this.invulnerable) { this.invulnT -= dt; if (this.invulnT <= 0) this.invulnerable = false; }
    this.world.update(dt, this.time);
    this.automap.update(dt);
    this.objectives.update(dt, this.time);
    this.director.update(dt, this.time);
    if (this.state !== 'playing') return; // caught during monster update
    this.audio.tick(dt);
    this.findFocus();
    // escaped?
    if (this.escaping) { const [cx, cz] = this.world.cellOf(p.pos.x, p.pos.z); if (cx === this.world.exit.x && cz === this.world.exit.z) return this.end(true); }
    // threat level -> heartbeat, crickets, red vignette
    let threat = 0, near = 99;
    for (const m of this.director.monsters) {
      const d = m.pos.distanceTo(p.pos); near = Math.min(near, d);
      const k = Math.max(0, 1 - d / 22) * (m.state === 'chase' || m.state === 'grab' ? 1 : 0.55);
      threat = Math.max(threat, k);
    }
    this.audio.heart = threat; this.audio.calm = Math.min(1, Math.max(0, (near - 8) / 20));
    $('danger').style.opacity = (threat > 0.45 ? (threat - 0.45) * 1.6 : 0).toFixed(2);
    this.senseCd = Math.max(0, this.senseCd - dt); this.senseT = Math.max(0, this.senseT - dt);
    this.renderHUD();
  }

  findFocus() {
    const p = this.player; this.focus = null;
    if (p.hidden) { this.setPrompt(`${this.input.touch ? 'USE' : '[E]'}: climb out of the ${p.hideSpot.label}`); return; }
    const fx = -Math.sin(p.yaw), fz = -Math.cos(p.yaw);
    let best = null, bs = Infinity;
    const consider = (x, z, reach, obj) => {
      const dx = x - p.pos.x, dz = z - p.pos.z, d = Math.hypot(dx, dz);
      if (d > reach) return;
      const dot = d < 0.01 ? 1 : (dx * fx + dz * fz) / d;
      if (dot < 0.5 && d > 1.1) return;
      const sc = d - dot * 1.5; if (sc < bs) { bs = sc; best = obj; }
    };
    for (const it of this.objectives.items) if (this.objectives.available(it)) consider(it.pos.x, it.pos.z, it.kind === 'station' ? 2.6 : 2.2, { item: it });
    for (const h of this.world.hideSpots) { const c = this.world.center(h.x, h.z); consider(c.x, c.z, 2.9, { hide: h }); }
    this.focus = best;
    const key = this.input.touch ? 'USE' : '[E]';
    if (!best) return this.setPrompt('');
    if (best.hide) return this.setPrompt(`${key}: hide in the ${best.hide.label}`);
    const it = best.item;
    if (it.battery) return this.setPrompt(`${key}: take flashlight battery`);
    if (it.kind === 'pickup') return this.setPrompt(`${key}: pick up ${it.label}`);
    if (!this.objectives.ready(it)) return this.setPrompt(`${it.label}: something is missing`, true);
    this.setPrompt(`${key}: ${it.label}`);
  }

  setPrompt(text, dim = false) {
    if (text === this.lastPrompt) return; this.lastPrompt = text;
    const el = $('prompt'); el.textContent = text; el.className = text ? (dim ? 'on no' : 'on') : '';
    const u = document.getElementById('btn-use'); if (u) u.classList.toggle('ready', !!text);
  }

  renderHUD(force = false) {
    const p = this.player, s = this.settings;
    // fast-changing bits every frame
    $('bar-stam').firstElementChild.style.width = p.stamina + '%';
    $('bar-stam').classList.toggle('low', p.exhausted);
    if (s.battery) { $('bar-batt').firstElementChild.style.width = p.battery + '%'; $('bar-batt').classList.toggle('low', p.battery < 20); }
    $('bar-sense').firstElementChild.style.width = (this.senseCd > 0 ? 100 - this.senseCd / this.senseMax * 100 : 100) + '%';
    $('hideview').className = p.hidden ? ({ bush: 'bush', locker: 'slats', wardrobe: 'slats' }[p.hideSpot.type] || 'hole') : '';
    const ar = $('arrow');
    if (this.senseT > 0 && this.senseTarget) {
      const t = this.senseTarget, ang = Math.atan2(t.pos.x - p.pos.x, t.pos.z - p.pos.z), rel = ang - (p.yaw + Math.PI);
      ar.classList.add('on'); ar.style.transform = `rotate(${-rel}rad)`;
    } else ar.classList.remove('on');
    this.hudT -= 1; if (!force && this.hudT > 0) return; this.hudT = 10;
    $('timer').textContent = store.fmtTime(this.time);
    $('lives').innerHTML = s.difficulty === 'easy' ? [0, 1, 2].map(i => `<span class="${i < this.lives ? '' : 'lost'}">♥</span>`).join('') : '<span title="One life">HARD</span>';
    const o = this.objectives;
    const compact = innerHeight < 520;
    let html = `<h4>OBJECTIVES ${o.list.filter(x => x.done).length}/${o.list.length}</h4>`;
    for (const x of o.list) {
      if (compact && x.done) continue;
      if (compact) html += `<div class="o">${x.kind === 'find' ? `${cap(x.noun)} <small class="in">${o.currentHint(x)}</small>` : `${o.currentHint(x)}`}</div>`;
      else html += `<div class="o ${x.done ? 'done' : ''}">${x.title}${x.done ? '' : `<small>${o.currentHint(x)}</small>`}</div>`;
    }
    if (this.escaping) html += `<div class="o esc">Escape through the ${this.map.exitLabel}!</div>`;
    if (html !== this.lastObjHtml) { $('objectives').innerHTML = html; this.lastObjHtml = html; }
  }

  resize() {
    const s = this.settings, w = innerWidth, h = innerHeight;
    const pr = s.quality === 'retro' ? Math.max(0.3, Math.min(1, 460 / h)) : Math.min(devicePixelRatio || 1, 1.5);
    this.renderer.setPixelRatio(pr);
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h; this.camera.fov = w < h ? 85 : 72; this.camera.updateProjectionMatrix();
  }
}

const cap = (s) => s[0].toUpperCase() + s.slice(1);

window.game = new Game();
