// Monsters: procedural low-poly models, AI state machine and the spawn director.
import * as THREE from 'three';
import { CELL } from './maps.js';
import { tex } from './textures.js';

const lam = (o) => new THREE.MeshLambertMaterial(o);
const basic = (c) => new THREE.MeshBasicMaterial({ color: c });
const R = Math.random;

export const DEFS = {
  counselor: { walk: 1.5, chase: [3.3, 4.2], sight: 20, fov: 115, headY: 2.48, stepLen: 1.3, scareD: 0.8, scareArms: [-1.6, 0.5] },
  grins: { walk: 1.3, chase: [3.2, 4.1], sight: 18, fov: 120, headY: 2.0, stepLen: 0.9, jerky: true, scareD: 1.25, scareArms: [-1.9, 0.6] },
  widow: { walk: 1.25, chase: [3.0, 3.9], sight: 24, fov: 140, headY: 2.82, float: true, teleport: true, scareD: 0.85, scareArms: [-2.6, 0.9] },
};

function limb(parent, x, y, z, w, len, mat, geo = 'box') {
  const p = new THREE.Group(); p.position.set(x, y, z); parent.add(p);
  const m = new THREE.Mesh(geo === 'box' ? new THREE.BoxGeometry(w, len, w) : new THREE.CylinderGeometry(w / 2, w / 2.4, len, 6), mat);
  m.position.y = -len / 2; m.castShadow = true; p.add(m);
  return p;
}

function buildCounselor() {
  const g = new THREE.Group();
  const skin = lam({ map: tex('skin'), color: 0xc8c0b8 }), shirt = lam({ color: 0x4a1010 }), pants = lam({ color: 0x24241c });
  const legL = limb(g, -0.14, 1.3, 0, 0.15, 1.3, pants), legR = limb(g, 0.14, 1.3, 0, 0.15, 1.3, pants);
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.9, 0.26), shirt); torso.position.y = 1.75; torso.castShadow = true; g.add(torso);
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.25, 6), skin); neck.position.y = 2.3; g.add(neck);
  const head = new THREE.Group(); head.position.y = 2.48; g.add(head);
  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8), skin); skull.scale.set(0.95, 1.4, 1); head.add(skull);
  for (const sx of [-0.075, 0.075]) {
    const socket = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), basic(0x000000)); socket.scale.set(1, 1.3, 0.5); socket.position.set(sx, 0.05, 0.17); head.add(socket);
    const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.012, 4, 4), basic(0xffffff)); pupil.position.set(sx, 0.05, 0.2); head.add(pupil);
  }
  const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.17, 0.05), basic(0x0a0000)); mouth.position.set(0, -0.15, 0.17); head.add(mouth);
  const armL = limb(g, -0.31, 2.12, 0, 0.09, 1.5, skin), armR = limb(g, 0.31, 2.12, 0, 0.09, 1.5, skin);
  for (const a of [armL, armR]) for (let i = 0; i < 3; i++) { const f = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.22, 0.02), skin); f.position.set(-0.03 + i * 0.03, -1.6, 0); a.add(f); }
  const whistle = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.04, 0.03), lam({ color: 0xc0a020 })); whistle.position.set(0, 1.95, 0.15); g.add(whistle);
  return { group: g, parts: { legL, legR, armL, armR, head, torso } };
}

function buildGrins() {
  const g = new THREE.Group();
  const fur = lam({ map: tex('fabric'), color: 0x8a7a80 }), pale = lam({ color: 0x6a5a50 }), dark = basic(0x050005);
  const legL = limb(g, -0.25, 0.65, 0, 0.3, 0.65, fur, 'cyl'), legR = limb(g, 0.25, 0.65, 0, 0.3, 0.65, fur, 'cyl');
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.62, 10, 8), fur); body.scale.set(1, 1.15, 0.85); body.position.y = 1.15; body.castShadow = true; g.add(body);
  const belly = new THREE.Mesh(new THREE.SphereGeometry(0.42, 10, 8), pale); belly.scale.set(1, 1.1, 0.5); belly.position.set(0, 1.1, 0.33); g.add(belly);
  const armL = limb(g, -0.62, 1.55, 0, 0.22, 0.85, fur, 'cyl'), armR = limb(g, 0.62, 1.55, 0, 0.22, 0.85, fur, 'cyl');
  const head = new THREE.Group(); head.position.y = 2.0; g.add(head);
  const hd = new THREE.Mesh(new THREE.SphereGeometry(0.48, 12, 10), fur); hd.castShadow = true; head.add(hd);
  const muzzle = new THREE.Mesh(new THREE.SphereGeometry(0.28, 10, 8), pale); muzzle.scale.set(1.3, 0.9, 0.8); muzzle.position.set(0, -0.12, 0.34); head.add(muzzle);
  const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.1, 0.08), dark); mouth.position.set(0, -0.2, 0.55); head.add(mouth);
  for (let i = 0; i < 7; i++) { const t = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.07, 0.03), basic(0xe8e0c0)); t.position.set(-0.2 + i * 0.066, -0.17, 0.59); head.add(t); }
  for (const sx of [-0.17, 0.17]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), basic(0xdddddd)); eye.position.set(sx, 0.12, 0.38); head.add(eye);
    const p = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 5), basic(0xff1010)); p.position.set(sx, 0.12, 0.49); head.add(p);
    const ear = new THREE.Mesh(new THREE.SphereGeometry(0.17, 8, 6), fur); ear.scale.z = 0.4; ear.position.set(sx * 2.1, 0.42, 0); head.add(ear);
  }
  const hat = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.42, 8), lam({ color: 0x20a0c0 })); hat.position.set(0.12, 0.6, 0); hat.rotation.z = -0.3; head.add(hat);
  const glow = new THREE.PointLight(0xff2020, 0.6, 3, 2); glow.position.set(0, 0.1, 0.7); head.add(glow);
  return { group: g, parts: { legL, legR, armL, armR, head, torso: body } };
}

function buildWidow() {
  const g = new THREE.Group();
  const cloth = new THREE.MeshLambertMaterial({ color: 0x0c0a0e, side: THREE.DoubleSide });
  const skin = lam({ map: tex('skin'), color: 0xd8d8e0 });
  const dress = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.85, 2.1, 12, 3, true), cloth); dress.position.y = 1.05; dress.castShadow = true; g.add(dress);
  const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.22, 0.6, 8), cloth); torso.position.y = 2.35; g.add(torso);
  const head = new THREE.Group(); head.position.y = 2.82; g.add(head);
  const face = new THREE.Mesh(new THREE.SphereGeometry(0.18, 10, 8), skin); face.scale.set(0.9, 1.25, 0.95); head.add(face);
  for (const sx of [-0.065, 0.065]) {
    const s = new THREE.Mesh(new THREE.SphereGeometry(0.045, 6, 5), basic(0x000000)); s.scale.set(1, 1.3, 0.4); s.position.set(sx, 0.04, 0.15); head.add(s);
    const e = new THREE.Mesh(new THREE.SphereGeometry(0.014, 5, 4), basic(0xe8f0ff)); e.position.set(sx, 0.04, 0.17); head.add(e);
  }
  const mouth = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 5), basic(0x000000)); mouth.scale.set(1, 1.8, 0.5); mouth.position.set(0, -0.12, 0.15); head.add(mouth);
  const veil = new THREE.Mesh(new THREE.CylinderGeometry(0.21, 0.55, 1.2, 12, 1, true), new THREE.MeshLambertMaterial({ color: 0xc8c8d8, transparent: true, opacity: 0.32, side: THREE.DoubleSide, depthWrite: false }));
  veil.position.y = -0.38; head.add(veil);
  const armL = limb(g, -0.24, 2.55, 0, 0.07, 1.35, skin), armR = limb(g, 0.24, 2.55, 0, 0.07, 1.35, skin);
  for (const a of [armL, armR]) for (let i = 0; i < 4; i++) { const f = new THREE.Mesh(new THREE.BoxGeometry(0.015, 0.25, 0.015), skin); f.position.set(-0.03 + i * 0.02, -1.45, 0); f.rotation.x = 0.3; a.add(f); }
  const glow = new THREE.PointLight(0x8090ff, 0.5, 3, 2); glow.position.set(0, 0, 0.5); head.add(glow);
  return { group: g, parts: { legL: null, legR: null, armL, armR, head, torso: dress } };
}

const BUILD = { counselor: buildCounselor, grins: buildGrins, widow: buildWidow };

// faint glowing eyes so you can track them in the dark (and through locker slats)
const EYES = { counselor: [0.075, 0.05, 0.2, 0xffffff, 0.35], grins: [0.17, 0.12, 0.5, 0xff2020, 0.6], widow: [0.065, 0.04, 0.18, 0x9fb0ff, 0.45] };
let eyeTex;
function addEyeGlow(kind, head) {
  if (!eyeTex) {
    const c = document.createElement('canvas'); c.width = c.height = 32; const g = c.getContext('2d');
    const gr = g.createRadialGradient(16, 16, 0, 16, 16, 16); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.3, 'rgba(255,255,255,0.5)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 32, 32); eyeTex = new THREE.CanvasTexture(c);
  }
  const [x, y, z, color, size] = EYES[kind];
  for (const sx of [-x, x]) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: eyeTex, color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, opacity: 0.8 }));
    s.position.set(sx, y, z + 0.02); s.scale.setScalar(size * 0.5); head.add(s);
  }
}

export class Monster {
  constructor(game, kind, cell) {
    this.game = game; this.world = game.world; this.kind = kind; this.def = DEFS[kind];
    const b = BUILD[kind](); this.mesh = b.group; this.parts = b.parts;
    addEyeGlow(kind, b.parts.head);
    game.scene.add(this.mesh);
    const c = this.world.center(cell.x, cell.z);
    this.pos = new THREE.Vector3(c.x, 0, c.z);
    this.yaw = R() * 6.28; this.state = 'wander'; this.path = null; this.alert = 0;
    this.lastSeen = -99; this.lastKnown = null; this.timer = 0; this.repath = 0; this.phase = R() * 10;
    this.stepAcc = 0; this.stuckT = 0; this.lastPos = this.pos.clone(); this.unseenT = 0; this.pause = 0;
    this.voice = game.audio.voice(kind);
    this.mesh.position.copy(this.pos);
  }

  get hard() { return this.game.settings.difficulty === 'hard'; }
  get chaseSpeed() { return this.def.chase[this.hard ? 1 : 0] * (1 + this.game.progress * 0.1); }

  dispose() { this.game.scene.remove(this.mesh); this.game.audio.stopVoice(this.voice); }

  setPath(cx, cz) {
    const [sx, sz] = this.world.cellOf(this.pos.x, this.pos.z);
    this.path = this.world.path(sx, sz, cx, cz);
    return !!this.path;
  }

  moveToward(tx, tz, speed, dt) {
    const dx = tx - this.pos.x, dz = tz - this.pos.z, d = Math.hypot(dx, dz);
    if (d < 1e-3) return 0;
    const step = Math.min(d, speed * dt);
    this.world.move(this.pos, dx / d * step, dz / d * step, 0.4);
    const want = Math.atan2(dx, dz); let diff = want - this.yaw;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff)); this.yaw += diff * Math.min(1, dt * 8);
    return d;
  }

  followPath(speed, dt) {
    const p = this.path; if (!p || !p.length) return true;
    while (p.length > 1) { const n = this.world.center(p[1][0], p[1][1]); if (this.world.walkClear(this.pos.x, this.pos.z, n.x, n.z)) p.shift(); else break; }
    const c = this.world.center(p[0][0], p[0][1]);
    const d = this.moveToward(c.x, c.z, speed, dt);
    if (d < 0.35) p.shift();
    return !p.length;
  }

  pickWander() {
    const pl = this.game.player.pos, bias = this.hard ? 0.45 : 0.25;
    const near = R() < bias;
    const c = this.world.randomFloor(c => {
      const w = this.world.center(c.x, c.z), d = Math.hypot(w.x - pl.x, w.z - pl.z);
      return near ? d < 16 : true;
    });
    this.setPath(c.x, c.z);
  }

  startChase() {
    if (this.state !== 'chase') this.game.onSpotted(this);
    this.state = 'chase'; this.repath = 0;
  }

  onPlayerHid(spot) {
    const recently = this.game.time - this.lastSeen < 1.0;
    const d = this.pos.distanceTo(spot.pos);
    if ((this.state === 'chase' || this.alert > 0.6) && recently && d < 8) { this.state = 'grab'; this.grabSpot = spot; this.setPath(spot.x, spot.z) || this.setPathNear(spot); }
  }
  setPathNear(spot) { const [x, z] = this.world.cellOf(spot.out.x, spot.out.z); this.setPath(x, z); }

  update(dt, t) {
    const g = this.game, p = g.player, w = this.world, def = this.def;
    const dx = p.pos.x - this.pos.x, dz = p.pos.z - this.pos.z, dist = Math.hypot(dx, dz);

    // --- perception ---
    let sees = false;
    if (!p.hidden && !g.invulnerable) {
      const range = (p.flashOn ? def.sight : def.sight * 0.45) * (this.hard ? 1.15 : 1);
      if (dist < range) {
        let diff = Math.atan2(dx, dz) - this.yaw; diff = Math.abs(Math.atan2(Math.sin(diff), Math.cos(diff)));
        if ((dist < 3.5 || diff < def.fov * Math.PI / 360) && w.los(this.pos.x, this.pos.z, p.pos.x, p.pos.z)) sees = true;
      }
    }
    if (sees) {
      this.alert += dt * (dist < 7 ? 3.5 : 1.3) * (this.hard ? 1.6 : 1);
      this.lastSeen = t; this.lastKnown = p.pos.clone();
      if (this.alert >= 1) this.startChase();
      else if (this.state === 'wander') { this.state = 'investigate'; this.timer = 0; this.path = null; }
    } else {
      this.alert = Math.max(0, this.alert - dt * 0.25);
      if (!p.hidden && p.noise > 0 && dist < p.noise && (this.state === 'wander' || this.state === 'search')) {
        this.state = 'investigate'; this.lastKnown = p.pos.clone(); this.path = null;
      }
    }

    // --- behaviour ---
    let speed = def.walk, moving = true;
    if (this.state === 'chase') {
      speed = this.chaseSpeed;
      if (sees && w.walkClear(this.pos.x, this.pos.z, p.pos.x, p.pos.z)) { this.moveToward(p.pos.x, p.pos.z, speed, dt); this.path = null; }
      else {
        this.repath -= dt;
        if (this.repath <= 0 || !this.path || !this.path.length) {
          this.repath = 0.4;
          const tgt = this.lastKnown || p.pos; const [cx, cz] = w.cellOf(tgt.x, tgt.z); this.setPath(cx, cz);
        }
        if (this.followPath(speed, dt) && !sees) this.beginSearch();
      }
      if (t - this.lastSeen > (this.hard ? 6 : 4)) this.beginSearch();
    } else if (this.state === 'grab') {
      speed = this.chaseSpeed;
      const s = this.grabSpot;
      if (!p.hidden || p.hideSpot !== s) { this.beginSearch(); }
      else if (this.pos.distanceTo(s.pos) < 2.2 || this.followPath(speed, dt)) { g.caught(this, true); return; }
    } else if (this.state === 'investigate') {
      speed = def.walk * 1.5;
      if (!this.path) { const tgt = this.lastKnown || p.pos; const [cx, cz] = w.cellOf(tgt.x, tgt.z); if (!this.setPath(cx, cz)) this.beginSearch(); }
      if (sees) { // turn to face what it sees
        const want = Math.atan2(dx, dz); let diff = want - this.yaw; diff = Math.atan2(Math.sin(diff), Math.cos(diff)); this.yaw += diff * Math.min(1, dt * 3);
        moving = false;
      } else if (this.followPath(speed, dt)) this.beginSearch();
    } else if (this.state === 'search') {
      speed = def.walk * 1.2;
      this.timer -= dt;
      if (this.pause > 0) { this.pause -= dt; moving = false; this.yaw += dt * 1.2 * Math.sin(t * 0.7 + this.phase); }
      else if (!this.path || this.followPath(speed, dt)) {
        this.pause = 0.6 + R() * 1.5;
        const base = this.lastKnown || this.pos, [bx, bz] = w.cellOf(base.x, base.z);
        const c = w.randomFloor(c => Math.abs(c.x - bx) <= 3 && Math.abs(c.z - bz) <= 3);
        this.setPath(c.x, c.z);
      }
      if (this.timer <= 0) { this.state = 'wander'; this.path = null; }
    } else { // wander
      if (this.pause > 0) { this.pause -= dt; moving = false; this.yaw += dt * 0.6 * Math.sin(t * 0.5 + this.phase); }
      else if (!this.path || this.followPath(speed, dt)) { this.pause = 1 + R() * 2.5; this.pickWander(); }
      // the Widow drifts between rooms when nobody is watching
      if (def.teleport) {
        const visible = dist < 30 && w.los(this.pos.x, this.pos.z, p.pos.x, p.pos.z);
        this.unseenT = visible ? 0 : this.unseenT + dt;
        if (this.unseenT > 25 && dist > 22) this.teleportNear();
      }
    }

    // grins moves in unsettling bursts
    let sf = 1;
    if (def.jerky && moving) { const k = Math.sin(t * 4.5 + this.phase); sf = k > 0 ? 1.7 : 0.25; }
    // speed burst is applied by scaling the step we already took: cheap approximation via extra move
    if (def.jerky && moving && sf > 1 && this.path && this.path.length) this.followPath(speed * (sf - 1), dt);

    // stuck detection
    const moved = this.pos.distanceTo(this.lastPos);
    if (moving && moved < speed * dt * 0.1) { this.stuckT += dt; if (this.stuckT > 1.2) { this.stuckT = 0; this.path = null; if (this.state === 'wander') this.pickWander(); } }
    else this.stuckT = 0;
    this.lastPos.copy(this.pos);

    // catch
    if (!p.hidden && !g.invulnerable && dist < 1.25 && this.state !== 'grab') { g.caught(this, false); return; }

    this.animate(dt, t, moved / Math.max(dt, 1e-3), this.state === 'chase' || this.state === 'grab');
    this.audio(dt, dist, moved);
  }

  beginSearch() {
    this.state = 'search'; this.timer = 8 + R() * 5; this.path = null; this.pause = 0;
    const p = this.game.player;
    // on hard, it may check a hiding spot near where it lost you
    if (this.hard && p.hidden && this.lastKnown && p.hideSpot.pos.distanceTo(this.lastKnown) < 7 && R() < 0.35) {
      this.state = 'grab'; this.grabSpot = p.hideSpot; this.setPath(p.hideSpot.x, p.hideSpot.z) || this.setPathNear(p.hideSpot);
    }
  }

  teleportNear() {
    const p = this.game.player.pos, w = this.world;
    const c = w.randomFloor(c => { const q = w.center(c.x, c.z), d = Math.hypot(q.x - p.x, q.z - p.z); return d > 12 && d < 22 && !w.los(q.x, q.z, p.x, p.z); });
    const q = w.center(c.x, c.z); this.pos.set(q.x, 0, q.z); this.lastPos.copy(this.pos); this.path = null; this.unseenT = 0;
  }

  animate(dt, t, spd, chasing) {
    const P = this.parts, def = this.def;
    this.phase += dt * spd * 2.2;
    const sw = Math.sin(this.phase) * Math.min(1, spd / 2) * 0.7;
    if (P.legL) { P.legL.rotation.x = sw; P.legR.rotation.x = -sw; }
    if (chasing) { P.armL.rotation.x = -1.3 + sw * 0.2; P.armR.rotation.x = -1.4 - sw * 0.2; }
    else { P.armL.rotation.x = -sw * 0.6; P.armR.rotation.x = sw * 0.6; }
    let y = 0;
    if (def.float) { y = 0.25 + Math.sin(t * 1.6 + this.phase * 0.1) * 0.12; P.torso.rotation.z = Math.sin(t * 1.1) * 0.04; }
    else y = Math.abs(Math.sin(this.phase)) * 0.05;
    if (this.kind === 'counselor') { P.head.rotation.z = Math.sin(t * 0.7) * 0.25 + (chasing ? Math.sin(t * 17) * 0.08 : 0); P.torso.rotation.x = chasing ? 0.25 : 0.1; }
    if (this.kind === 'grins') { P.torso.rotation.z = Math.sin(this.phase) * 0.12; P.head.rotation.z = Math.sin(t * 9) > 0.96 ? 0.5 : Math.sin(t * 0.8) * 0.12; P.head.rotation.y = Math.sin(t * 0.37) * 0.4; }
    if (this.kind === 'widow') P.head.rotation.z = Math.sin(t * 0.5) * 0.35;
    this.mesh.position.set(this.pos.x, y, this.pos.z);
    this.mesh.rotation.y = this.yaw;
  }

  audio(dt, dist, moved) {
    const g = this.game, cam = g.player;
    const occl = g.world.los(this.pos.x, this.pos.z, cam.pos.x, cam.pos.z) ? 1 : 0.45;
    const vol = Math.pow(Math.max(0, 1 - dist / 30), 2) * occl;
    const ang = Math.atan2(this.pos.x - cam.pos.x, this.pos.z - cam.pos.z);
    const pan = Math.max(-1, Math.min(1, Math.sin(ang - cam.yaw)));
    this.vol = vol;
    g.audio.updateVoice(this.voice, vol, pan, this.state === 'chase', dt);
    if (this.def.stepLen) { this.stepAcc += moved; if (this.stepAcc > this.def.stepLen) { this.stepAcc = 0; g.audio.monsterStep(vol, pan, this.kind); } }
  }
}

export class Director {
  constructor(game) {
    this.game = game; this.monsters = [];
    const lenF = { 5: 0.55, 15: 1, 30: 1.3 }[game.settings.length];
    this.timer = (game.settings.difficulty === 'hard' ? 22 : 45) * lenF;
  }
  get hard() { return this.game.settings.difficulty === 'hard'; }
  desired() {
    const p = this.game.progress;
    let n = this.hard ? 1 + Math.floor(p * 3.5) : 1 + Math.floor(p * 2.2);
    if (this.game.settings.length === 30 && p > 0.5) n++;
    if (this.game.escaping) n++;
    return n;
  }
  interval() { const p = this.game.progress; return this.hard ? 30 - 18 * p : 48 - 26 * p; }
  hurry() { this.timer = Math.min(this.timer, 4 + R() * 4); }
  update(dt, t) {
    this.timer -= dt;
    if (this.timer <= 0 && this.monsters.length < this.desired()) { this.spawn(); this.timer = this.interval(); }
    for (const m of this.monsters) m.update(dt, t);
  }
  spawn() {
    const g = this.game, w = g.world, p = g.player.pos;
    const ok = (c, min) => { const q = w.center(c.x, c.z), d = Math.hypot(q.x - p.x, q.z - p.z); return d > min && !(d < 30 && w.los(q.x, q.z, p.x, p.z)); };
    let cands = w.monsterSpawns.filter(c => ok(c, 20));
    if (!cands.length) cands = w.floorCells.filter(c => ok(c, 18));
    if (!cands.length) cands = w.floorCells.filter(c => ok(c, 10));
    if (!cands.length) return;
    const c = cands[(R() * cands.length) | 0];
    this.monsters.push(new Monster(g, g.map.monster, c));
  }
  // after a catch on easy: push every monster away from the start
  scatter() {
    const g = this.game, w = g.world, s = w.center(w.spawn.x, w.spawn.z);
    for (const m of this.monsters) {
      m.state = 'wander'; m.path = null; m.alert = 0;
      if (Math.hypot(m.pos.x - s.x, m.pos.z - s.z) < 25) {
        const c = w.randomFloor(c => { const q = w.center(c.x, c.z); return Math.hypot(q.x - s.x, q.z - s.z) > 28; });
        const q = w.center(c.x, c.z); m.pos.set(q.x, 0, q.z); m.lastPos.copy(m.pos);
      }
    }
    this.timer = Math.max(this.timer, 12);
  }
  dispose() { this.monsters.forEach(m => m.dispose()); this.monsters = []; }
}
