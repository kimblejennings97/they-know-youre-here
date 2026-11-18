// Set dressing and ambient life: props on walls and floors, small animals, fireflies, fog,
// dust in the flashlight beam, and the occasional distant "watcher" that isn't really there.
// Everything lives in world.group, so it is cleaned up with the world.
import * as THREE from 'three';
import { CELL } from './maps.js';
import { tex } from './textures.js';
import { buildMonster } from './monsters.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const DIRS4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const lam = (o) => new THREE.MeshLambertMaterial(o);
const basic = (o) => new THREE.MeshBasicMaterial(o);

function canvas(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.magFilter = THREE.NearestFilter;
  return t;
}
let glowT;
const glowTex = () => glowT || (glowT = canvas(32, 32, (g) => {
  const gr = g.createRadialGradient(16, 16, 0, 16, 16, 16); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, 'rgba(255,255,255,0.4)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 32, 32);
}));
const sprite = (color, size, opacity = 1) => {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false }));
  s.scale.setScalar(size); return s;
};
const mesh = (geo, mat, x = 0, y = 0, z = 0, parent) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); if (parent) parent.add(m); return m; };

export class Details {
  constructor(game) {
    this.game = game; const w = this.w = game.world; this.r = w.r; this.map = game.map;
    this.group = new THREE.Group(); w.group.add(this.group);
    this.updaters = []; this.flee = []; this.t = 0;
    this.used = new Set(); this.dyn = new Set(); // dyn: objects that move/animate (never baked)
    this.dust(); this.watcher();
    ({ camp: () => this.camp(), arcade: () => this.arcade(), castle: () => this.castle() })[this.map.id]();
    this.bake();
  }

  // Merge every static, opaque prop mesh into one mesh per material: hundreds of small pieces -> a few draw calls.
  bake() {
    this.group.updateMatrixWorld(true);
    const buckets = new Map();
    const visit = (o) => {
      if (this.dyn.has(o)) return;
      for (const ch of [...o.children]) visit(ch);
      if (!o.isMesh || o.isInstancedMesh || o.material.transparent || Array.isArray(o.material)) return;
      const m = o.material, key = [m.type, m.color && m.color.getHex(), m.map && m.map.uuid, m.side, m.flatShading].join('|');
      if (!buckets.has(key)) buckets.set(key, { mat: m, items: [] });
      buckets.get(key).items.push(o);
    };
    visit(this.group);
    for (const { mat, items } of buckets.values()) {
      if (items.length < 2) continue;
      const geos = items.map(o => { let g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone(); g.applyMatrix4(o.matrixWorld);
        for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k); return g; });
      const merged = mergeGeometries(geos); if (!merged) continue;
      for (const o of items) o.parent.remove(o);
      const mm = new THREE.Mesh(merged, mat); mm.castShadow = mm.receiveShadow = true; this.group.add(mm);
    }
  }

  update(dt, t) { this.t = t; for (const u of this.updaters) u(dt, t); }

  // ---------- placement helpers ----------
  shuffle(a) { const r = this.r; for (let i = a.length - 1; i > 0; i--) { const j = (r() * (i + 1)) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; }
  key(x, z) { return x + ',' + z; }
  markerFree(c) { const ch = this.w.ch(c.x, c.z); return ch === '.' || ch === ',' || ch === '_'; }
  nearSpecial(c, d = 2) { const w = this.w; return [w.spawn, w.exit].some(p => Math.abs(p.x - c.x) <= d && Math.abs(p.z - c.z) <= d); }
  // floor cells next to a wall, as {x, z, dx, dz} pointing at the wall
  wallSpots(filter = () => true, wallChars = '#') {
    const out = [];
    for (const c of this.w.floorCells) for (const [dx, dz] of DIRS4) if (wallChars.includes(this.w.ch(c.x + dx, c.z + dz)) && filter(c)) out.push({ x: c.x, z: c.z, dx, dz });
    return this.shuffle(out);
  }
  takeWall(filter, wallChars) {
    const s = this.wallSpots((c) => filter(c), wallChars).find(s => !this.used.has(this.key(s.x, s.z) + s.dx + s.dz));
    if (s) this.used.add(this.key(s.x, s.z) + s.dx + s.dz);
    return s;
  }
  onWall(obj, s, y, inset = 0.03) {
    obj.position.set((s.x + 0.5 + s.dx * (0.5 - inset / CELL)) * CELL, y, (s.z + 0.5 + s.dz * (0.5 - inset / CELL)) * CELL);
    obj.rotation.y = Math.atan2(-s.dx, -s.dz);
    this.group.add(obj); return obj;
  }
  // open cell (all 8 neighbours walkable) for something you can bump into; reserves it from objectives
  takeOpen(filter = () => true) {
    const w = this.w;
    const ok = (c) => this.markerFree(c) && !this.nearSpecial(c) && !w.reserved.has(this.key(c.x, c.z)) && filter(c) &&
      [-1, 0, 1].every(dz => [-1, 0, 1].every(dx => w.passable(c.x + dx, c.z + dz)));
    const c = this.shuffle(w.floorCells.slice()).find(ok);
    if (c) w.reserved.add(this.key(c.x, c.z));
    return c;
  }
  center(c, jitter = 0) { const r = this.r; return { x: (c.x + 0.5 + (r() - 0.5) * jitter) * CELL, z: (c.z + 0.5 + (r() - 0.5) * jitter) * CELL }; }
  solid(x, z, r) { this.w.solids.push({ x, z, r }); }
  spatial(x, z) {
    const p = this.game.player, d = Math.hypot(x - p.pos.x, z - p.pos.z);
    const ang = Math.atan2(x - p.pos.x, z - p.pos.z);
    return { d, vol: Math.pow(Math.max(0, 1 - d / 30), 2), pan: Math.max(-1, Math.min(1, Math.sin(ang - p.yaw))) };
  }
  // is the player looking at a point (within `deg` of the view centre)?
  looking(x, z, deg) {
    const p = this.game.player, a = Math.atan2(x - p.pos.x, z - p.pos.z), f = p.yaw + Math.PI;
    return Math.abs(Math.atan2(Math.sin(a - f), Math.cos(a - f))) < deg * Math.PI / 180;
  }
  nearestMonster(x, z) {
    let d = 1e9; for (const m of this.game.director?.monsters || []) d = Math.min(d, Math.hypot(m.pos.x - x, m.pos.z - z)); return d;
  }
  poster(text, w, h, opts = {}) {
    const t = canvas(opts.px || 128, Math.round((opts.px || 128) * h / w), (g, cw, ch) => {
      g.fillStyle = opts.bg || '#e8e0c8'; g.fillRect(0, 0, cw, ch);
      if (opts.draw) opts.draw(g, cw, ch);
      g.fillStyle = opts.color || '#200'; g.textAlign = 'center'; g.textBaseline = 'middle';
      const lines = text.split('\n');
      lines.forEach((l, i) => { g.font = `bold ${opts.size || 16}px ${opts.font || 'monospace'}`; g.fillText(l, cw / 2, (opts.top ?? ch * 0.18) + i * (opts.size || 16) * 1.25); });
      if (opts.stain) for (let i = 0; i < 6; i++) { g.fillStyle = 'rgba(60,40,10,0.18)'; g.beginPath(); g.arc(Math.random() * cw, Math.random() * ch, 4 + Math.random() * 14, 0, 7); g.fill(); }
    });
    return new THREE.Mesh(new THREE.PlaneGeometry(w, h), lam({ map: t, side: THREE.DoubleSide }));
  }

  // ---------- shared ----------
  // dust motes drifting around the player, brighter in the flashlight
  dust() {
    const N = 70, pos = new Float32Array(N * 3), r = this.r;
    for (let i = 0; i < N; i++) { pos[i * 3] = (r() - 0.5) * 8; pos[i * 3 + 1] = r() * 3; pos[i * 3 + 2] = (r() - 0.5) * 8; }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({ size: 0.014, color: 0xfff4dd, transparent: true, opacity: 0.3, depthWrite: false, blending: THREE.AdditiveBlending });
    const pts = new THREE.Points(geo, mat); pts.frustumCulled = false; this.group.add(pts);
    this.updaters.push((dt, t) => {
      const p = this.game.player; pts.position.set(p.pos.x, 0, p.pos.z);
      for (let i = 0; i < N; i++) {
        pos[i * 3] += Math.sin(t * 0.3 + i) * dt * 0.05; pos[i * 3 + 1] += Math.sin(t * 0.2 + i * 1.7) * dt * 0.03;
        if (pos[i * 3 + 1] > 3) pos[i * 3 + 1] = 0; if (pos[i * 3 + 1] < 0) pos[i * 3 + 1] = 3;
      }
      geo.attributes.position.needsUpdate = true;
      mat.opacity += ((p.flashOn ? 0.3 : 0.03) - mat.opacity) * Math.min(1, dt * 4);
    });
  }

  // a still, distant silhouette of the map's monster that vanishes when you look at it or get close.
  // Harmless; only happens before the objectives are half done and when no real monster is near.
  watcher() {
    const b = buildMonster(this.map.monster), m = b.group; m.visible = false; this.group.add(m); this.dyn.add(m);
    let next = 45 + this.r() * 40, shown = 0, stare = 0;
    this.updaters.push((dt, t) => {
      const g = this.game, p = g.player, w = this.w;
      if (m.visible) {
        shown += dt; const d = Math.hypot(m.position.x - p.pos.x, m.position.z - p.pos.z);
        stare = this.looking(m.position.x, m.position.z, 10) ? stare + dt : 0;
        m.rotation.y = Math.atan2(p.pos.x - m.position.x, p.pos.z - m.position.z);
        if (stare > 0.7 || d < 11 || shown > 7 || p.hidden) {
          m.visible = false; next = 70 + this.r() * 70;
          if (stare > 0.7) { const s = this.spatial(m.position.x, m.position.z); g.audio.whisper(s.pan, 0.8); }
        }
        return;
      }
      next -= dt;
      if (next > 0 || g.state !== 'playing' || g.progress > 0.5 || p.hidden) return;
      if (this.nearestMonster(p.pos.x, p.pos.z) < 20) { next = 15; return; }
      // a spot 16-26 m away, in line of sight, near the edge of the view
      const cand = w.floorCells.filter(c => {
        const q = w.center(c.x, c.z), d = Math.hypot(q.x - p.pos.x, q.z - p.pos.z);
        return d > 16 && d < 26 && this.looking(q.x, q.z, 55) && !this.looking(q.x, q.z, 18) && w.los(p.pos.x, p.pos.z, q.x, q.z);
      });
      if (!cand.length) { next = 10; return; }
      const c = cand[(this.r() * cand.length) | 0], q = w.center(c.x, c.z);
      m.position.set(q.x, b.parts.legL ? 0 : 0.2, q.z); m.visible = true; shown = 0; stare = 0;
    });
  }

  // ---------- creatures ----------
  // perching crow: watches you, flaps off cawing when you get close, comes back later somewhere else
  crows(spots) {
    const black = lam({ color: 0x0c0c10 });
    const make = () => {
      const g = new THREE.Group();
      const body = mesh(new THREE.SphereGeometry(0.14, 7, 5), black, 0, 0.14, 0, g); body.scale.set(0.8, 0.8, 1.5);
      const head = new THREE.Group(); head.position.set(0, 0.25, 0.17); g.add(head);
      mesh(new THREE.SphereGeometry(0.08, 6, 5), black, 0, 0, 0, head);
      const beak = mesh(new THREE.ConeGeometry(0.025, 0.1, 4), lam({ color: 0x222018 }), 0, -0.01, 0.1, head); beak.rotation.x = Math.PI / 2;
      for (const sx of [-0.04, 0.04]) { const e = sprite(0xffcc66, 0.035, 0.6); e.position.set(sx, 0.02, 0.06); head.add(e); }
      const tail = mesh(new THREE.BoxGeometry(0.1, 0.02, 0.18), black, 0, 0.16, -0.24, g); tail.rotation.x = 0.3;
      const wings = [-1, 1].map(s => { const p = new THREE.Group(); p.position.set(s * 0.09, 0.2, 0); g.add(p); const wm = mesh(new THREE.BoxGeometry(0.32, 0.015, 0.2), black, s * 0.16, 0, 0, p); wm.scale.z = 1; return p; });
      return { g, head, wings };
    };
    const birds = spots.map((s) => {
      const b = make(); b.g.position.set(s.x, s.y, s.z); b.home = s; b.state = 'perch'; b.cool = 0; b.vel = new THREE.Vector3();
      b.g.rotation.y = this.r() * 6.3; this.group.add(b.g); this.dyn.add(b.g); return b;
    });
    this.updaters.push((dt, t) => {
      const p = this.game.player;
      for (const b of birds) {
        const s = this.spatial(b.g.position.x, b.g.position.z);
        if (b.state === 'perch') {
          // turn the head to watch you
          if (s.d < 16) { const want = Math.atan2(p.pos.x - b.g.position.x, p.pos.z - b.g.position.z) - b.g.rotation.y; b.head.rotation.y += (Math.atan2(Math.sin(want), Math.cos(want)) * 0.8 - b.head.rotation.y) * Math.min(1, dt * 3); }
          else b.head.rotation.y = Math.sin(t * 0.7 + b.home.x) * 0.6;
          b.wings.forEach((w, i) => w.rotation.z = (i ? -1 : 1) * 0.1);
          if (s.d < 4.5 || (p.noise > 10 && s.d < 9)) {
            b.state = 'fly'; b.cool = 3;
            b.vel.set(b.g.position.x - p.pos.x, 0, b.g.position.z - p.pos.z).normalize().multiplyScalar(5); b.vel.y = 3;
            b.g.rotation.y = Math.atan2(b.vel.x, b.vel.z); this.game.audio.caw(s.vol, s.pan); this.game.audio.flutter(s.vol, s.pan);
          }
        } else if (b.state === 'fly') {
          b.cool -= dt; b.g.position.addScaledVector(b.vel, dt); b.vel.y += dt * 0.6;
          b.wings.forEach((w, i) => w.rotation.z = (i ? -1 : 1) * Math.sin(t * 28) * 0.9);
          if (b.cool <= 0) { b.state = 'gone'; b.g.visible = false; b.cool = 25 + this.r() * 30; }
        } else {
          b.cool -= dt;
          if (b.cool <= 0) { // come back to a perch the player can't see right now
            const home = spots[(this.r() * spots.length) | 0];
            const sh = this.spatial(home.x, home.z);
            if (sh.d > 10) { b.home = home; b.g.position.set(home.x, home.y, home.z); b.g.visible = true; b.state = 'perch'; } else b.cool = 5;
          }
        }
      }
    });
  }

  // rat: sniffs along the walls, bolts when you come near
  rats(n) {
    const fur = lam({ color: 0x3a3430 }), pink = lam({ color: 0x8a5a5a });
    const spots = this.wallSpots(c => this.markerFree(c));
    const rats = [];
    for (let i = 0; i < n && i < spots.length; i++) {
      const g = new THREE.Group();
      const body = mesh(new THREE.SphereGeometry(0.09, 7, 5), fur, 0, 0.07, 0, g); body.scale.set(0.8, 0.7, 1.6);
      mesh(new THREE.SphereGeometry(0.05, 6, 5), fur, 0, 0.08, 0.15, g);
      const tail = mesh(new THREE.CylinderGeometry(0.008, 0.004, 0.3, 4), pink, 0, 0.04, -0.27, g); tail.rotation.x = Math.PI / 2 - 0.2;
      for (const sx of [-0.02, 0.02]) { const e = sprite(0xff3030, 0.025, 0.7); e.position.set(sx, 0.1, 0.19); g.add(e); }
      const s = spots[i], q = this.wallPos(s, 0.35);
      g.position.set(q.x, 0, q.z); g.rotation.y = Math.atan2(s.dz, -s.dx);
      this.group.add(g); this.dyn.add(g); rats.push({ g, target: null, wait: this.r() * 3, speed: 0 });
    }
    this.updaters.push((dt, t) => {
      for (const r of rats) {
        const s = this.spatial(r.g.position.x, r.g.position.z);
        if (!r.target && s.d < 4) { // run to another wall spot
          const sp = spots.find(c => { const q = this.wallPos(c, 0.35); return Math.hypot(q.x - r.g.position.x, q.z - r.g.position.z) > 6 && this.w.walkClear(r.g.position.x, r.g.position.z, q.x, q.z, 0.1); });
          if (sp) { r.target = this.wallPos(sp, 0.35); r.speed = 4.5; this.game.audio.squeak(s.vol, s.pan); }
        }
        if (r.target) {
          const dx = r.target.x - r.g.position.x, dz = r.target.z - r.g.position.z, d = Math.hypot(dx, dz);
          if (d < 0.1) { r.target = null; continue; }
          const st = Math.min(d, r.speed * dt); r.g.position.x += dx / d * st; r.g.position.z += dz / d * st;
          r.g.rotation.y = Math.atan2(dx, dz); r.g.position.y = Math.abs(Math.sin(t * 40)) * 0.02;
        } else {
          r.wait -= dt; r.g.rotation.y += Math.sin(t * 3 + r.g.position.x) * dt * 0.8; // sniffing about
          if (r.wait < 0 && this.r() < 0.003) this.game.audio.squeak(s.vol * 0.5, s.pan);
        }
      }
    });
  }
  wallPos(s, off) { return { x: (s.x + 0.5) * CELL + s.dx * (CELL / 2 - off), z: (s.z + 0.5) * CELL + s.dz * (CELL / 2 - off) }; }

  // bats flitting around a point
  bats(centers, n) {
    const mat = lam({ color: 0x141014, side: THREE.DoubleSide });
    const wingGeo = new THREE.BufferGeometry(); wingGeo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0.28, 0.04, 0.08, 0.22, 0, -0.12], 3)); wingGeo.computeVertexNormals();
    const bats = [];
    for (let i = 0; i < n; i++) {
      const g = new THREE.Group(); mesh(new THREE.SphereGeometry(0.05, 5, 4), mat, 0, 0, 0, g);
      const wl = new THREE.Mesh(wingGeo, mat), wr = new THREE.Mesh(wingGeo, mat); wr.scale.x = -1; g.add(wl, wr);
      this.group.add(g); this.dyn.add(g);
      bats.push({ g, wl, wr, c: centers[i % centers.length], ph: this.r() * 10, rad: 1.5 + this.r() * 2.5, h: 0 });
    }
    let fl = 4;
    this.updaters.push((dt, t) => {
      for (const b of bats) {
        const a = t * (1.6 + (b.ph % 1)) + b.ph;
        b.g.position.set(b.c.x + Math.cos(a) * b.rad + Math.sin(a * 2.7) * 0.6, b.c.y + Math.sin(a * 1.3) * 0.7, b.c.z + Math.sin(a) * b.rad);
        b.g.rotation.y = -a; const f = Math.sin(t * 34 + b.ph) * 0.9; b.wl.rotation.z = f; b.wr.rotation.z = -f;
      }
      fl -= dt; if (fl < 0) { fl = 5 + this.r() * 8; const b = bats[(this.r() * bats.length) | 0]; if (b) { const s = this.spatial(b.g.position.x, b.g.position.z); this.game.audio.flutter(s.vol * 0.7, s.pan); } }
    });
  }

  // glowing points that drift and blink; they go dark when a monster is near
  fireflies(n, cells, color, ySpan = [0.4, 2.4]) {
    const pos = new Float32Array(n * 3), col = new Float32Array(n * 3), base = [], r = this.r, cc = new THREE.Color(color);
    for (let i = 0; i < n; i++) {
      const c = cells[(r() * cells.length) | 0];
      base.push({ x: (c.x + r()) * CELL, y: ySpan[0] + r() * (ySpan[1] - ySpan[0]), z: (c.z + r()) * CELL, ph: r() * 20, rate: 0.6 + r() * 1.4, dark: 1 });
    }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const mat = new THREE.PointsMaterial({ size: 0.16, map: glowTex(), vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    const pts = new THREE.Points(geo, mat); pts.frustumCulled = false; this.group.add(pts);
    let k = 0;
    this.updaters.push((dt, t) => {
      k++;
      for (let i = 0; i < n; i++) {
        const b = base[i];
        if (k % 15 === i % 15) b.dark = this.nearestMonster(b.x, b.z) < 12 ? 0 : 1; // check monsters a few at a time
        pos[i * 3] = b.x + Math.sin(t * 0.4 + b.ph) * 0.8; pos[i * 3 + 1] = b.y + Math.sin(t * 0.6 + b.ph * 2) * 0.3; pos[i * 3 + 2] = b.z + Math.cos(t * 0.35 + b.ph) * 0.8;
        const v = Math.pow(Math.max(0, Math.sin(t * b.rate + b.ph)), 4) * b.dark;
        col[i * 3] = cc.r * v; col[i * 3 + 1] = cc.g * v; col[i * 3 + 2] = cc.b * v;
      }
      geo.attributes.position.needsUpdate = true; geo.attributes.color.needsUpdate = true;
    });
  }

  // low drifting fog sheets
  groundFog(color, opacity, size, center) {
    const t = canvas(128, 128, (g) => {
      for (let i = 0; i < 40; i++) {
        const x = Math.random() * 128, y = Math.random() * 128, r = 10 + Math.random() * 30;
        const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, 'rgba(255,255,255,0.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
      }
    });
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(size / 24, size / 24); t.magFilter = THREE.LinearFilter;
    [0.35, 0.9].forEach((y, i) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size).rotateX(-Math.PI / 2),
        lam({ map: i ? t : t.clone(), color, transparent: true, opacity: opacity * (i ? 0.6 : 1), depthWrite: false })); // lit, so the beam catches it
      m.position.set(center.x, y, center.z); m.renderOrder = 2; this.group.add(m);
      const tx = m.material.map; if (i) tx.repeat.set(size / 30, size / 30);
      this.updaters.push((dt, tt) => { tx.offset.x = tt * (i ? -0.004 : 0.006); tx.offset.y = tt * 0.003; });
    });
  }

  // ======================================================================
  camp() {
    const w = this.w, R = this.r, H = this.map.wallH;
    const outdoorCells = w.floorCells.filter(c => !w.indoor.has(this.key(c.x, c.z)));
    const wood = lam({ map: tex('wood') }), dark = lam({ color: 0x22201c });

    this.groundFog(0xa8b4c0, 0.22, w.w * CELL + 40, { x: w.w * CELL / 2, z: w.h * CELL / 2 });
    this.fireflies(70, outdoorCells, 0xd8ff70);

    // missing posters on tree trunks that face a path
    const trunkSpots = this.shuffle(w.treePos.filter(t => DIRS4.some(([dx, dz]) => w.passable(t.x + dx, t.z + dz))));
    trunkSpots.slice(0, 8).forEach((tp, i) => {
      const [dx, dz] = DIRS4.find(([dx, dz]) => w.passable(tp.x + dx, tp.z + dz));
      const p = this.poster(i % 3 === 2 ? 'HAVE YOU\nSEEN ME?' : 'MISSING', 0.5, 0.65, { size: 15, stain: true, top: 14,
        draw: (g, cw, ch) => { g.fillStyle = '#9a9488'; g.fillRect(cw * 0.25, ch * 0.32, cw * 0.5, ch * 0.4); g.fillStyle = '#2a2824'; g.beginPath(); g.ellipse(cw / 2, ch * 0.48, cw * 0.13, ch * 0.11, 0, 0, 7); g.fill(); g.fillRect(cw * 0.33, ch * 0.58, cw * 0.34, ch * 0.14); g.fillStyle = '#200'; g.font = 'bold 9px monospace'; g.textAlign = 'center'; g.fillText(['AGE 11', 'AGE 9', 'CABIN 4', 'AGE 12'][i % 4], cw / 2, ch * 0.86); } });
      p.position.set(tp.wx + dx * 0.34, 1.6, tp.wz + dz * 0.34); p.rotation.y = Math.atan2(dx, dz); p.rotation.z = (R() - 0.5) * 0.15; this.group.add(p);
    });

    // crows on cabin roof ridges and on the ground
    const perches = [];
    for (const c of w.cabins || []) {
      const alongX = (c.x1 - c.x0) >= (c.z1 - c.z0);
      for (let k = 0; k < 2; k++) {
        const f = 0.25 + R() * 0.5;
        perches.push(alongX ? { x: (c.x0 + (c.x1 - c.x0 + 1) * f) * CELL, y: H + 1.6, z: (c.z0 + c.z1 + 1) / 2 * CELL } : { x: (c.x0 + c.x1 + 1) / 2 * CELL, y: H + 1.6, z: (c.z0 + (c.z1 - c.z0 + 1) * f) * CELL });
      }
    }
    this.shuffle(outdoorCells.slice()).slice(0, 5).forEach(c => { const q = this.center(c, 0.6); perches.push({ x: q.x, y: 0, z: q.z }); });
    this.crows(perches.slice(0, 9));

    // deer at the treeline with eyeshine, bolts when you come close
    this.deer();

    // lamps: bats and moths
    const lamps = []; for (let z = 0; z < w.h; z++) for (let x = 0; x < w.w; x++) if (w.ch(x, z) === 'L') { const q = w.center(x, z); lamps.push({ x: q.x, y: 4.2, z: q.z }); }
    if (lamps.length) { this.bats(lamps, 4); lamps.forEach(l => this.fireflies(10, [{ x: l.x / CELL - 0.5, z: l.z / CELL - 0.5 }], 0xffe0b0, [2.9, 3.8])); }

    // tents (you bump into these), one collapsed
    for (let i = 0; i < 3; i++) {
      const c = this.takeOpen(c => !w.indoor.has(this.key(c.x, c.z))); if (!c) break;
      const q = this.center(c, 0.3), g = new THREE.Group();
      // A-frame tent: an extruded triangle with a stained canvas texture and a dark opening
      const hue = [30, 110, 8][i];
      const clothTex = canvas(64, 64, (c2) => { c2.fillStyle = `hsl(${hue},22%,15%)`; c2.fillRect(0, 0, 64, 64); for (let k = 0; k < 64; k += 4) { c2.fillStyle = 'rgba(0,0,0,0.12)'; c2.fillRect(0, k, 64, 1); } for (let k = 0; k < 7; k++) { c2.fillStyle = 'rgba(40,30,10,0.3)'; c2.beginPath(); c2.arc(Math.random() * 64, Math.random() * 64, 3 + Math.random() * 10, 0, 7); c2.fill(); } });
      clothTex.wrapS = clothTex.wrapT = THREE.RepeatWrapping;
      const shape = new THREE.Shape(); shape.moveTo(-1.1, 0); shape.lineTo(1.1, 0); shape.lineTo(0, 1.35); shape.closePath();
      const tgeo = new THREE.ExtrudeGeometry(shape, { depth: 2.3, bevelEnabled: false }); tgeo.translate(0, 0, -1.15);
      const tent = mesh(tgeo, lam({ map: clothTex, side: THREE.DoubleSide }), 0, 0, 0, g);
      if (i === 2) { tent.scale.y = 0.3; tent.rotation.z = 0.2; }
      else { const door = new THREE.Shape(); door.moveTo(-0.4, 0); door.lineTo(0.4, 0); door.lineTo(0, 0.95); door.closePath(); mesh(new THREE.ShapeGeometry(door), basic({ color: 0x030303 }), 0, 0.01, 1.16, g); }
      mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.4, 4), wood, 0, 1.45, 1.15, g);
      g.position.set(q.x, 0, q.z); g.rotation.y = R() * 6.3; this.group.add(g); this.solid(q.x, q.z, 1.0);
      // a lantern left by the tent, flickering
      const lan = mesh(new THREE.CylinderGeometry(0.08, 0.1, 0.22, 6), basic({ color: 0xffc070 }), q.x + 1.3, 0.11, q.z + 0.3);
      this.group.add(lan); this.dyn.add(lan); const ls = sprite(0xffb050, 0.9, 0.5); ls.position.set(q.x + 1.3, 0.2, q.z + 0.3); this.group.add(ls);
      this.updaters.push((dt, t) => { const k = Math.sin(t * 9 + i) * Math.sin(t * 23 + i * 3) > 0.7 ? 0.15 : 1; ls.material.opacity = 0.5 * k; lan.material.color.setRGB(0.3 + 0.7 * k, (0.3 + 0.7 * k) * 0.72, (0.3 + 0.7 * k) * 0.4); });
    }

    // flagpole with a tattered flag near the start
    {
      const c = this.takeOpen(c => Math.hypot(c.x - w.spawn.x, c.z - w.spawn.z) < 7 && !w.indoor.has(this.key(c.x, c.z)));
      if (c) {
        const q = this.center(c, 0.4);
        mesh(new THREE.CylinderGeometry(0.05, 0.07, 7, 6), lam({ map: tex('metal'), color: 0x4a4a48 }), q.x, 3.5, q.z, this.group); this.solid(q.x, q.z, 0.15);
        const geo = new THREE.PlaneGeometry(1.6, 1, 12, 6), flag = mesh(geo, lam({ color: 0x7a1a14, side: THREE.DoubleSide }), q.x + 0.82, 6.3, q.z, this.group);
        const base = geo.attributes.position.array.slice(); this.dyn.add(flag);
        this.updaters.push((dt, t) => {
          const a = geo.attributes.position.array;
          for (let i = 0; i < a.length; i += 3) { const u = (base[i] + 0.8) / 1.6; a[i + 2] = Math.sin(t * 3 + u * 5) * 0.15 * u; a[i + 1] = base[i + 1] - u * u * 0.25; }
          geo.attributes.position.needsUpdate = true;
        });
      }
    }

    // tire swing on a tree, swinging slowly by itself
    {
      const c = this.takeOpen(c => !w.indoor.has(this.key(c.x, c.z)));
      if (c) {
        const q = this.center(c, 0.2), g = new THREE.Group(); g.position.set(q.x, 0, q.z); this.group.add(g);
        mesh(new THREE.CylinderGeometry(0.3, 0.4, 5, 7), lam({ map: tex('bark') }), 0, 2.5, 0, g);
        const branch = mesh(new THREE.CylinderGeometry(0.1, 0.14, 2.4, 5), lam({ map: tex('bark') }), 1.1, 4.4, 0, g); branch.rotation.z = Math.PI / 2 - 0.2;
        mesh(new THREE.ConeGeometry(1.6, 3, 7), lam({ map: tex('leaves', 2, 2), flatShading: true }), 0, 5.6, 0, g);
        const sw = new THREE.Group(); sw.position.set(1.9, 4.5, 0); g.add(sw); this.dyn.add(sw);
        mesh(new THREE.CylinderGeometry(0.015, 0.015, 3.2, 3), lam({ color: 0x8a7a5a }), 0, -1.6, 0, sw);
        const tire = mesh(new THREE.TorusGeometry(0.32, 0.12, 6, 12), dark, 0, -3.3, 0, sw); tire.rotation.x = Math.PI / 2 - 0.2;
        this.solid(q.x, q.z, 0.45);
        this.updaters.push((dt, t) => { sw.rotation.x = Math.sin(t * 1.3) * 0.18; sw.rotation.z = Math.sin(t * 0.7) * 0.05; });
      }
    }

    // direction signs on posts
    const signs = [['CABINS', 'MESS HALL'], ['LAKE', 'NO LIFEGUARD'], ['EXIT', 'GATE ↑']];
    signs.forEach(([a, b]) => {
      const c = this.takeOpen(c => !w.indoor.has(this.key(c.x, c.z)) && w.ch(c.x, c.z) === ','); if (!c) return;
      const q = this.center(c, 0.5), g = new THREE.Group(); g.position.set(q.x, 0, q.z); g.rotation.y = R() * 6.3; this.group.add(g);
      mesh(new THREE.BoxGeometry(0.1, 2, 0.1), wood, 0, 1, 0, g); this.solid(q.x, q.z, 0.15);
      [a, b].forEach((txt, k) => {
        const s = this.poster(txt, 1.1, 0.25, { bg: '#5a4028', color: '#d8c8a0', size: 11, top: 10, px: 128 });
        s.position.set(0.45, 1.7 - k * 0.35, 0.06); s.rotation.z = (k ? -0.08 : 0.06); g.add(s);
      });
    });

    // empty canoe drifting on the lake
    const water = []; for (let z = 0; z < w.h; z++) for (let x = 0; x < w.w; x++) if (w.ch(x, z) === 'W') water.push({ x, z });
    if (water.length) {
      const mx = water.reduce((a, c) => a + c.x, 0) / water.length, mz = water.reduce((a, c) => a + c.z, 0) / water.length;
      const g = new THREE.Group(), hull = mesh(new THREE.CylinderGeometry(0.4, 0.4, 3.2, 10, 1, true, 0, Math.PI), lam({ color: 0x6a3a1a, side: THREE.DoubleSide }), 0, 0, 0, g);
      hull.rotation.set(Math.PI / 2, 0, Math.PI); hull.scale.set(1, 1, 0.55);
      const paddle = mesh(new THREE.BoxGeometry(0.06, 0.02, 1.4), wood, 0.2, 0.05, 0.3, g); paddle.rotation.y = 0.4;
      this.group.add(g); this.dyn.add(g);
      const cx = (mx + 0.5) * CELL, cz = (mz + 0.5) * CELL;
      this.updaters.push((dt, t) => { g.position.set(cx + Math.sin(t * 0.05) * 2.5, -0.15 + Math.sin(t * 0.9) * 0.03, cz + Math.cos(t * 0.04) * 1.5); g.rotation.y = t * 0.03; g.rotation.z = Math.sin(t * 0.8) * 0.04; });
      // frogs croak when you're near the water
      let fr = 3;
      this.updaters.push((dt) => { fr -= dt; if (fr < 0) { fr = 1.5 + R() * 4; const s = this.spatial(cx + (R() - 0.5) * 12, cz + (R() - 0.5) * 8); if (this.nearestMonster(cx, cz) > 15) this.game.audio.croak(s.vol, s.pan); } });
      // DO NOT SWIM sign at the shore
      const shore = this.takeWall(c => true, 'W');
      if (shore) { const sg = new THREE.Group(); mesh(new THREE.BoxGeometry(0.08, 1.6, 0.08), wood, 0, 0.8, 0, sg); const s = this.poster('DO NOT\nSWIM', 0.8, 0.5, { bg: '#d8d0b8', color: '#7a0a0a', size: 14, top: 18, stain: true }); s.position.set(0, 1.5, 0.05); sg.add(s); this.onWall(sg, shore, 0, 0.3); }
    }

    // things left behind on the ground
    const left = [];
    for (let i = 0; i < 14; i++) {
      const c = outdoorCells[(R() * outdoorCells.length) | 0], q = this.center(c, 0.8), k = i % 4;
      let m;
      if (k === 0) { m = mesh(new THREE.SphereGeometry(0.25, 8, 6), lam({ color: [0x233448, 0x4a2422, 0x2a3a24][i % 3] }), q.x, 0.13, q.z); m.scale.set(1, 0.55, 0.75); m.rotation.y = R() * 6; }
      else if (k === 1) { m = mesh(new THREE.BoxGeometry(0.12, 0.08, 0.28), lam({ color: 0xc8c0b0 }), q.x, 0.04, q.z); m.rotation.y = R() * 6; }
      else if (k === 2) { m = mesh(new THREE.PlaneGeometry(0.22, 0.28), lam({ color: 0xe8e0d0, side: THREE.DoubleSide }), q.x, 0.02, q.z); m.rotation.set(-Math.PI / 2, 0, R() * 6); }
      else { m = mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.3, 6), lam({ color: 0x3a3a3a }), q.x, 0.05, q.z); m.rotation.set(Math.PI / 2, 0, R() * 6); if (i === 3) left.push(m); }
      this.group.add(m);
    }
    // a dropped flashlight that still flickers
    if (left[0]) {
      const f = left[0], sp = sprite(0xfff0c0, 1.2, 0.6); sp.position.copy(f.position).add(new THREE.Vector3(0, 0.05, 0.2)); this.group.add(sp);
      this.updaters.push((dt, t) => { sp.material.opacity = Math.sin(t * 17) * Math.sin(t * 5.3) > 0.2 ? 0.6 : 0.05; });
    }

    // camp ambience: owls in the trees
    let owl = 12 + R() * 10;
    this.updaters.push((dt) => { owl -= dt; if (owl < 0) { owl = 22 + R() * 30; this.game.audio.owl(); } });
  }

  deer() {
    const w = this.w, R = this.r;
    const edge = w.floorCells.filter(c => (c.x <= 1 || c.z <= 1 || c.x >= w.w - 2 || c.z >= w.h - 2) && this.markerFree(c));
    if (!edge.length) return;
    const brown = lam({ color: 0x2a2018 }), g = new THREE.Group();
    const body = mesh(new THREE.BoxGeometry(0.4, 0.45, 1.1), brown, 0, 1.0, 0, g);
    const neck = mesh(new THREE.BoxGeometry(0.16, 0.6, 0.16), brown, 0, 1.4, 0.48, g); neck.rotation.x = -0.4;
    const head = new THREE.Group(); head.position.set(0, 1.72, 0.62); g.add(head);
    mesh(new THREE.BoxGeometry(0.18, 0.18, 0.34), brown, 0, 0, 0.08, head);
    for (const sx of [-1, 1]) {
      const a = mesh(new THREE.CylinderGeometry(0.015, 0.02, 0.5, 3), brown, sx * 0.1, 0.3, -0.02, head); a.rotation.z = -sx * 0.4;
      const a2 = mesh(new THREE.CylinderGeometry(0.012, 0.015, 0.25, 3), brown, sx * 0.25, 0.42, -0.02, head); a2.rotation.z = -sx * 1.1;
      const eye = sprite(0xd8ffe8, 0.12, 0); eye.position.set(sx * 0.07, 0.04, 0.2); head.add(eye); (head.eyes = head.eyes || []).push(eye);
    }
    for (const [lx, lz] of [[-0.14, 0.4], [0.14, 0.4], [-0.14, -0.4], [0.14, -0.4]]) mesh(new THREE.CylinderGeometry(0.035, 0.03, 0.8, 4), brown, lx, 0.4, lz, g);
    g.visible = false; this.group.add(g); this.dyn.add(g);
    let state = 'away', timer = 20 + R() * 20, vel = new THREE.Vector3();
    this.updaters.push((dt, t) => {
      const p = this.game.player;
      if (state === 'away') {
        timer -= dt; if (timer > 0) return;
        const c = edge[(R() * edge.length) | 0], q = w.center(c.x, c.z);
        const d = Math.hypot(q.x - p.pos.x, q.z - p.pos.z);
        if (d < 16 || d > 32) { timer = 3; return; }
        g.position.set(q.x, 0, q.z); g.visible = true; state = 'watch'; timer = 25;
      } else if (state === 'watch') {
        const s = this.spatial(g.position.x, g.position.z);
        g.rotation.y = Math.atan2(p.pos.x - g.position.x, p.pos.z - g.position.z);
        // eyeshine only when your flashlight is on it
        const lit = p.flashOn && this.looking(g.position.x, g.position.z, 22) && s.d < 34;
        head.eyes.forEach(e => e.material.opacity += ((lit ? 0.95 : 0) - e.material.opacity) * Math.min(1, dt * 6));
        head.rotation.y = Math.sin(t * 0.5) * 0.15;
        timer -= dt;
        if (s.d < 11 || timer < 0 || p.noise > 10 && s.d < 18) {
          state = 'run'; timer = 2.2; vel.set(g.position.x - p.pos.x, 0, g.position.z - p.pos.z).normalize().multiplyScalar(9);
          g.rotation.y = Math.atan2(vel.x, vel.z); head.eyes.forEach(e => e.material.opacity = 0);
          this.game.audio.burst(500, 1, 0.3, 0.12 * s.vol, { pan: s.pan, wet: 0.4, type: 'lowpass' });
        }
      } else {
        timer -= dt; g.position.addScaledVector(vel, dt); g.position.y = Math.abs(Math.sin(t * 14)) * 0.25;
        if (timer < 0) { g.visible = false; state = 'away'; timer = 45 + R() * 45; }
      }
    });
  }

  // ======================================================================
  arcade() {
    const w = this.w, R = this.r, H = this.map.wallH;
    this.rats(5);

    // neon signs on the walls
    const neon = [['PIXEL PALACE', '#ff3cd2'], ['PRIZES', '#3cf0ff'], ['GAME ON', '#ffe23c'], ['HIGH SCORES', '#7cff5a'], ['NO REFUNDS', '#ff5a3c'], ['PARTY ROOM', '#ff3cd2']];
    neon.forEach(([txt, col], i) => {
      const s = this.takeWall(c => this.markerFree(c)); if (!s) return;
      const dead = R() < 0.5 ? (R() * txt.length) | 0 : -1;
      const t = canvas(256, 64, (g) => {
        g.font = 'bold 34px monospace'; g.textAlign = 'center'; g.textBaseline = 'middle';
        const x0 = 128 - g.measureText(txt).width / 2;
        [...txt].forEach((ch, k) => {
          const x = x0 + g.measureText(txt.slice(0, k)).width + g.measureText(ch).width / 2;
          g.shadowColor = col; g.shadowBlur = k === dead ? 0 : 14; g.fillStyle = k === dead ? '#2a1a2a' : col; g.fillText(ch, x, 34);
        });
      });
      const m = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 0.65), basic({ map: t, transparent: true, depthWrite: false }));
      this.onWall(m, s, 2.7, 0.05);
      const glow = sprite(new THREE.Color(col).getHex(), 3, 0.18); glow.scale.set(3.4, 1.2, 1); glow.position.copy(m.position).addScaledVector(new THREE.Vector3(-s.dx, 0, -s.dz), 0.1); this.group.add(glow);
      const flick = R() < 0.5;
      this.updaters.push((dt, tt) => { if (!flick) return; const on = Math.sin(tt * 2.3 + i) * Math.sin(tt * 7.1 + i * 2) > -0.6; m.material.opacity = on ? 1 : 0.15; glow.material.opacity = on ? 0.18 : 0.02; });
    });

    // fluorescent tubes on the ceiling; a few flicker
    const tubes = this.shuffle(w.floorCells.filter(c => (c.x + c.z) % 3 === 0)).slice(0, 70);
    const tubeMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.14, 0.05, 2.0), basic({ color: 0xffffff }), tubes.length);
    const mm = new THREE.Matrix4(), col = new THREE.Color();
    tubes.forEach((c, i) => { mm.makeTranslation((c.x + 0.5) * CELL, H - 0.03, (c.z + 0.5) * CELL); tubeMesh.setMatrixAt(i, mm); const dead = R() < 0.35; tubeMesh.setColorAt(i, col.setRGB(dead ? 0.12 : 0.85, dead ? 0.12 : 0.9, dead ? 0.13 : 0.95)); });
    tubeMesh.frustumCulled = false; this.group.add(tubeMesh);
    const flickers = tubes.map((c, i) => i).filter(() => R() < 0.12);
    this.updaters.push((dt, t) => {
      for (const i of flickers) { const on = Math.sin(t * 31 + i) * Math.sin(t * 3.7 + i * 5) > 0.1; tubeMesh.setColorAt(i, col.setRGB(on ? 0.85 : 0.1, on ? 0.9 : 0.1, on ? 0.95 : 0.12)); }
      tubeMesh.instanceColor.needsUpdate = true;
    });

    // party room: bunting, a birthday banner and a cake
    const tables = []; for (let z = 0; z < w.h; z++) for (let x = 0; x < w.w; x++) if (w.ch(x, z) === 'K') tables.push({ x, z });
    const party = tables.filter(c => c.z < 5);
    if (party.length) {
      const px = party.reduce((a, c) => a + c.x, 0) / party.length, pz = party.reduce((a, c) => a + c.z, 0) / party.length;
      const ban = this.takeWall(c => c.z < 6 && c.x < 8);
      if (ban) this.onWall(this.poster('HAPPY 7TH BIRTHDAY\nTIMMY', 2.6, 0.7, { bg: '#2a4a8a', color: '#ffd84a', size: 20, top: 22, px: 256, stain: true }), ban, 2.6, 0.04);
      const cols = [0xd03a3a, 0x3a9ad0, 0xe0c030, 0x3ac05a];
      for (let k = 0; k < 2; k++) for (let i = 0; i < 14; i++) {
        const f = mesh(new THREE.ConeGeometry(0.12, 0.3, 3), lam({ color: cols[i % 4], side: THREE.DoubleSide }), (px - 1.6 + i * 0.3 + 0.5) * CELL / CELL * CELL / 1, 0, 0);
        const u = i / 13; f.position.set((px + 0.5) * CELL - 2.2 + u * 4.4, H - 0.35 - Math.sin(u * Math.PI) * 0.4, (pz + 0.5) * CELL + (k ? 1 : -1)); f.rotation.x = Math.PI; this.group.add(f);
      }
      const t0 = party[0], top = 1.5, cx = (t0.x + 0.5) * CELL, cz = (t0.z + 0.5) * CELL;
      mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.22, 12), lam({ color: 0xe8d8d0 }), cx, top + 0.11, cz, this.group);
      mesh(new THREE.CylinderGeometry(0.31, 0.31, 0.05, 12), lam({ color: 0xd04a8a }), cx, top + 0.2, cz, this.group);
      for (let i = 0; i < 7; i++) { const a = i / 7 * 6.28; mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.1, 4), lam({ color: 0x3a9ad0 }), cx + Math.cos(a) * 0.18, top + 0.28, cz + Math.sin(a) * 0.18, this.group); }
      party.slice(1).forEach(c => { for (let i = 0; i < 2; i++) { const hat = mesh(new THREE.ConeGeometry(0.1, 0.26, 8), lam({ color: cols[(c.x + i) % 4] }), (c.x + 0.3 + R() * 0.4) * CELL, top + 0.13, (c.z + 0.3 + R() * 0.4) * CELL, this.group); if (R() < 0.5) { hat.rotation.z = Math.PI / 2; hat.position.y = top + 0.1; } } });
    }

    // the mascot's spare head, sitting on the prize counter, watching
    const counter = tables.filter(c => c.z >= 5 && c.z < 12);
    if (counter.length) {
      const c = counter[(counter.length / 2) | 0], g = new THREE.Group(); g.position.set((c.x + 0.5) * CELL, 1.5, (c.z + 0.5) * CELL); this.group.add(g); this.dyn.add(g);
      const fur = lam({ map: tex('fabric'), color: 0x8a7a80 });
      mesh(new THREE.SphereGeometry(0.45, 12, 10), fur, 0, 0.45, 0, g);
      for (const sx of [-1, 1]) { const ear = mesh(new THREE.SphereGeometry(0.16, 8, 6), fur, sx * 0.33, 0.85, 0, g); ear.scale.z = 0.4; const e = mesh(new THREE.SphereGeometry(0.1, 8, 6), basic({ color: 0xcccccc }), sx * 0.16, 0.55, 0.36, g); mesh(new THREE.SphereGeometry(0.035, 6, 5), basic({ color: 0x110000 }), sx * 0.16, 0.55, 0.45, g); }
      mesh(new THREE.BoxGeometry(0.45, 0.08, 0.06), basic({ color: 0x050005 }), 0, 0.28, 0.42, g);
      this.updaters.push(() => { // always turned toward you, just a little
        const p = this.game.player; const want = Math.atan2(p.pos.x - g.position.x, p.pos.z - g.position.z);
        if (!this.looking(g.position.x, g.position.z, 35)) g.rotation.y = want; // only moves when you're not looking
      });
    }

    // a TV on the wall playing static (and, rarely, something else)
    {
      const s = this.takeWall(c => c.z > 13); if (s) {
        const tvg = new THREE.Group();
        mesh(new THREE.BoxGeometry(1.1, 0.8, 0.5), lam({ color: 0x1a1a1a }), 0, 0, -0.25, tvg);
        const c = document.createElement('canvas'); c.width = 64; c.height = 48; const g = c.getContext('2d'), img = g.createImageData(64, 48);
        const tt = new THREE.CanvasTexture(c); tt.magFilter = THREE.NearestFilter; tt.colorSpace = THREE.SRGBColorSpace;
        const scr = mesh(new THREE.PlaneGeometry(0.9, 0.62), basic({ map: tt }), 0, 0, 0.01, tvg); this.dyn.add(scr);
        const glow = sprite(0xa0b0ff, 1.8, 0.12); glow.position.z = 0.3; tvg.add(glow);
        this.onWall(tvg, s, 2.4, 0.55);
        let k = 0, face = 0;
        this.updaters.push((dt) => {
          if (++k % 3) return;
          if (face <= 0 && R() < 0.002) face = 0.35;
          if (face > 0) {
            face -= dt * 3; g.fillStyle = '#000'; g.fillRect(0, 0, 64, 48); g.fillStyle = '#ddd'; g.beginPath(); g.arc(32, 24, 16, 0, 7); g.fill();
            g.fillStyle = '#000'; g.fillRect(24, 18, 5, 5); g.fillRect(35, 18, 5, 5); g.fillRect(22, 30, 20, 3);
          } else {
            const d = img.data; for (let i = 0; i < d.length; i += 4) { const v = Math.random() * 200; d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255; }
            g.putImageData(img, 0, 0);
          }
          tt.needsUpdate = true;
        });
      }
    }

    // a coin-op rocking horse that rocks on its own now and then
    {
      const c = this.takeOpen(); if (c) {
        const q = this.center(c, 0.3), g = new THREE.Group(); g.position.set(q.x, 0, q.z); g.rotation.y = R() * 6.3; this.group.add(g);
        mesh(new THREE.CylinderGeometry(0.55, 0.6, 0.15, 12), lam({ color: 0x3a3a50 }), 0, 0.07, 0, g);
        const horse = new THREE.Group(); horse.position.y = 0.6; g.add(horse); this.dyn.add(horse);
        const paint = lam({ color: 0x6e6050 });
        mesh(new THREE.BoxGeometry(0.4, 0.4, 1.0), paint, 0, 0.25, 0, horse);
        const hd = mesh(new THREE.BoxGeometry(0.25, 0.5, 0.3), paint, 0, 0.6, 0.5, horse); hd.rotation.x = 0.4;
        mesh(new THREE.BoxGeometry(0.06, 0.4, 0.5), lam({ color: 0x5a1a1a }), 0, 0.55, 0.15, horse);
        for (const sx of [-0.06, 0.06]) mesh(new THREE.SphereGeometry(0.03, 5, 4), basic({ color: 0x000000 }), sx + Math.sign(sx) * 0.07, 0.75, 0.66, horse);
        mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.6, 6), lam({ map: tex('metal'), color: 0x555555 }), 0, -0.3, 0, horse);
        this.solid(q.x, q.z, 0.7);
        let rock = 0, wait = 30 + R() * 30;
        this.updaters.push((dt, t) => {
          wait -= dt;
          if (wait < 0 && rock <= 0) { const s = this.spatial(q.x, q.z); if (s.d > 6 && s.d < 25) { rock = 2.2; this.game.audio.musicBox(s.vol, s.pan); } wait = 45 + R() * 45; }
          if (rock > 0) { rock -= dt; horse.rotation.x = Math.sin(t * 5) * 0.25 * Math.min(1, rock); } else horse.rotation.x *= 0.95;
        });
      }
    }

    // wet floor signs
    for (let i = 0; i < 2; i++) {
      const c = this.takeOpen(); if (!c) break;
      const q = this.center(c, 0.5), g = new THREE.Group(); g.position.set(q.x, 0, q.z); g.rotation.y = R() * 6.3; this.group.add(g);
      const y = lam({ color: 0xe8c020, side: THREE.DoubleSide });
      for (const s of [-1, 1]) { const p = mesh(new THREE.PlaneGeometry(0.45, 0.7), y, 0, 0.33, s * 0.12, g); p.rotation.x = s * 0.35; }
      this.solid(q.x, q.z, 0.3);
    }

    // tickets and tokens dropped everywhere
    const N = 90, inst = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.2, 0.06).rotateX(-Math.PI / 2), lam({ color: 0xe0b030, side: THREE.DoubleSide }), N);
    for (let i = 0; i < N; i++) { const c = w.floorCells[(R() * w.floorCells.length) | 0]; mm.compose(new THREE.Vector3((c.x + R()) * CELL, 0.01, (c.z + R()) * CELL), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, R() * 6.3, 0)), new THREE.Vector3(1, 1, 1)); inst.setMatrixAt(i, mm); inst.setColorAt(i, col.setHSL(R() < 0.5 ? 0.12 : 0.95, 0.7, 0.5)); }
    inst.frustumCulled = false; this.group.add(inst);
  }

  // ======================================================================
  castle() {
    const w = this.w, R = this.r, H = this.map.wallH;
    const stone = lam({ map: tex('stoneBrick') }), iron = lam({ color: 0x2a2826 }), metal = lam({ map: tex('metal'), color: 0x9a9a9e });
    const flameMat = () => basic({ color: 0xff9a30 });
    const hall = (c) => c.z >= 8 && c.z <= 13;
    const dungeon = (c) => c.z >= 15 && c.x <= 8;
    const court = (c) => w.ch(c.x, c.z) === '_';

    // suits of armor along the great hall. Their heads turn to follow you when you aren't looking.
    for (let i = 0; i < 6; i++) {
      const s = this.takeWall(c => hall(c) && this.markerFree(c)); if (!s) break;
      const g = new THREE.Group(); this.onWall(g, s, 0, 0.7);
      mesh(new THREE.BoxGeometry(0.7, 0.2, 0.5), stone, 0, 0.1, 0, g);
      for (const sx of [-0.12, 0.12]) mesh(new THREE.CylinderGeometry(0.08, 0.07, 0.85, 6), metal, sx, 0.62, 0, g);
      mesh(new THREE.CylinderGeometry(0.24, 0.2, 0.7, 8), metal, 0, 1.4, 0, g);
      for (const sx of [-0.32, 0.32]) mesh(new THREE.CylinderGeometry(0.06, 0.05, 0.7, 6), metal, sx, 1.35, 0, g);
      const head = new THREE.Group(); head.position.y = 1.95; g.add(head); this.dyn.add(head);
      mesh(new THREE.CylinderGeometry(0.13, 0.15, 0.32, 8), metal, 0, 0, 0, head);
      mesh(new THREE.BoxGeometry(0.2, 0.03, 0.02), basic({ color: 0x000000 }), 0, 0.03, 0.14, head);
      const spear = mesh(new THREE.CylinderGeometry(0.015, 0.015, 2.6, 4), iron, 0.38, 1.3, 0.05, g);
      mesh(new THREE.ConeGeometry(0.04, 0.2, 4), metal, 0.38, 2.7, 0.05, g);
      const wp = g.position.clone(); this.solid(wp.x, wp.z, 0.45);
      this.updaters.push((dt) => {
        if (this.looking(wp.x, wp.z, 40)) return;
        const p = this.game.player, want = Math.atan2(p.pos.x - wp.x, p.pos.z - wp.z) - g.rotation.y;
        const d = Math.atan2(Math.sin(want), Math.cos(want)); head.rotation.y = Math.max(-1.2, Math.min(1.2, d));
      });
    }

    // candle sconces on the walls
    const flames = [];
    for (let i = 0; i < 16; i++) {
      const s = this.takeWall(c => !court(c) && this.markerFree(c)); if (!s) break;
      const g = new THREE.Group();
      mesh(new THREE.BoxGeometry(0.08, 0.3, 0.06), iron, 0, 0, 0.03, g);
      mesh(new THREE.CylinderGeometry(0.1, 0.06, 0.05, 8), iron, 0, -0.1, 0.16, g);
      mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.2, 6), lam({ color: 0xd8d0b8 }), 0, 0.02, 0.16, g);
      const f = mesh(new THREE.ConeGeometry(0.025, 0.08, 5), flameMat(), 0, 0.16, 0.16, g);
      const gl = sprite(0xff8a30, 0.9, 0.5); gl.position.set(0, 0.17, 0.18); g.add(gl);
      this.onWall(g, s, 2.0, 0.02); this.dyn.add(f); flames.push({ f, gl, ph: R() * 10 });
    }

    // chandelier swaying over the great hall
    {
      const hc = w.floorCells.filter(c => hall(c) && w.ch(c.x, c.z) === ',');
      if (hc.length) {
        const cx = hc.reduce((a, c) => a + c.x + 0.5, 0) / hc.length * CELL, cz = hc.reduce((a, c) => a + c.z + 0.5, 0) / hc.length * CELL;
        const pivot = new THREE.Group(); pivot.position.set(cx, H, cz); this.group.add(pivot); this.dyn.add(pivot);
        mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.4, 4), iron, 0, -0.7, 0, pivot);
        const ring = mesh(new THREE.TorusGeometry(0.9, 0.05, 6, 18), iron, 0, -1.45, 0, pivot); ring.rotation.x = Math.PI / 2;
        for (let i = 0; i < 8; i++) {
          const a = i / 8 * 6.28, x = Math.cos(a) * 0.9, z = Math.sin(a) * 0.9;
          mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.16, 5), lam({ color: 0xd8d0b8 }), x, -1.35, z, pivot);
          const f = mesh(new THREE.ConeGeometry(0.022, 0.07, 5), flameMat(), x, -1.24, z, pivot);
          const gl = sprite(0xff9a40, 0.45, 0.5); gl.position.set(x, -1.23, z); pivot.add(gl); flames.push({ f, gl, ph: R() * 10 });
        }
        this.updaters.push((dt, t) => { pivot.rotation.z = Math.sin(t * 0.6) * 0.05; pivot.rotation.x = Math.sin(t * 0.43) * 0.04; });
      }
    }
    this.updaters.push((dt, t) => { for (const f of flames) { const k = 0.8 + 0.25 * Math.sin(t * 13 + f.ph) * Math.sin(t * 7 + f.ph); f.f.scale.y = k; f.gl.material.opacity = 0.35 + 0.2 * k; } });

    // cobwebs in room corners, up by the ceiling
    const webTex = canvas(64, 64, (g) => {
      g.strokeStyle = 'rgba(230,230,230,0.55)'; g.lineWidth = 1;
      for (let i = 0; i < 7; i++) { const a = i / 6 * Math.PI / 2; g.beginPath(); g.moveTo(0, 0); g.lineTo(Math.cos(a) * 64, Math.sin(a) * 64); g.stroke(); }
      for (let r = 10; r < 64; r += 9) { g.beginPath(); for (let i = 0; i <= 6; i++) { const a = i / 6 * Math.PI / 2, rr = r + (i % 2) * 3; i ? g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr) : g.moveTo(Math.cos(a) * rr, Math.sin(a) * rr); } g.stroke(); }
    });
    let webs = 0;
    for (const c of this.shuffle(w.floorCells.slice())) {
      if (webs >= 14 || court(c)) continue;
      for (const [dx, dz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
        if (w.ch(c.x + dx, c.z) === '#' && w.ch(c.x, c.z + dz) === '#') {
          const web = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 1.4), basic({ map: webTex, transparent: true, side: THREE.DoubleSide, depthWrite: false }));
          web.position.set((c.x + 0.5 + dx * 0.42) * CELL, H - 0.55, (c.z + 0.5 + dz * 0.42) * CELL);
          web.rotation.y = Math.atan2(-dx, -dz) + Math.PI / 4 * 0; web.lookAt(web.position.x - dx, H - 0.2, web.position.z - dz);
          this.group.add(web); webs++; break;
        }
      }
    }

    // dungeon: hanging chains, bones, old blood
    const dcells = w.floorCells.filter(dungeon);
    const chains = [];
    for (let i = 0; i < 5 && dcells.length; i++) {
      const c = dcells[(R() * dcells.length) | 0], q = this.center(c, 0.8), pv = new THREE.Group(); pv.position.set(q.x, H, q.z); this.group.add(pv); this.dyn.add(pv);
      const len = 1.5 + R() * 1.5;
      for (let k = 0; k < len / 0.12; k++) { const l = mesh(new THREE.TorusGeometry(0.05, 0.012, 4, 8), iron, 0, -0.06 - k * 0.12, 0, pv); l.rotation.y = k % 2 ? Math.PI / 2 : 0; }
      if (R() < 0.5) { const sh = mesh(new THREE.TorusGeometry(0.1, 0.02, 4, 10), iron, 0, -len - 0.1, 0, pv); }
      chains.push({ pv, ph: R() * 10 });
    }
    this.updaters.push((dt, t) => { for (const c of chains) { c.pv.rotation.x = Math.sin(t * 0.8 + c.ph) * 0.06; c.pv.rotation.z = Math.cos(t * 0.6 + c.ph) * 0.05; } });
    const boneMat = lam({ color: 0xd8d4c0, flatShading: true });
    for (let i = 0; i < 6 && dcells.length; i++) {
      const c = dcells[(R() * dcells.length) | 0], q = this.center(c, 0.9), g = new THREE.Group(); g.position.set(q.x, 0, q.z); g.rotation.y = R() * 6.3; this.group.add(g);
      const skull = mesh(new THREE.SphereGeometry(0.11, 7, 6), boneMat, 0, 0.1, 0, g); skull.scale.set(0.9, 0.85, 1.1);
      for (const sx of [-0.04, 0.04]) mesh(new THREE.SphereGeometry(0.025, 4, 4), basic({ color: 0x000000 }), sx, 0.12, 0.1, g);
      for (let k = 0; k < 3; k++) { const b = mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.35, 4), boneMat, (R() - 0.5) * 0.5, 0.03, (R() - 0.5) * 0.5, g); b.rotation.set(Math.PI / 2, 0, R() * 6); }
    }
    const blood = canvas(64, 64, (g) => { g.fillStyle = 'rgba(70,4,4,0.85)'; g.beginPath(); g.arc(32, 32, 18, 0, 7); g.fill(); for (let i = 0; i < 9; i++) { g.beginPath(); g.arc(32 + (Math.random() - 0.5) * 50, 32 + (Math.random() - 0.5) * 50, 2 + Math.random() * 6, 0, 7); g.fill(); } });
    for (let i = 0; i < 7; i++) {
      const pool = i < 4 ? dcells : w.floorCells; if (!pool.length) continue;
      const c = pool[(R() * pool.length) | 0], q = this.center(c, 0.8);
      const m = new THREE.Mesh(new THREE.PlaneGeometry(1 + R(), 1 + R()).rotateX(-Math.PI / 2), basic({ map: blood, transparent: true, depthWrite: false }));
      m.position.set(q.x, 0.015, q.z); m.rotation.y = R() * 6; this.group.add(m);
    }
    this.rats(3);

    // courtyard: moon, stars, bats, crows on the wall tops, a dead tree
    const cc = w.floorCells.filter(court);
    if (cc.length) {
      const cx = cc.reduce((a, c) => a + c.x + 0.5, 0) / cc.length * CELL, cz = cc.reduce((a, c) => a + c.z + 0.5, 0) / cc.length * CELL;
      const moon = sprite(0xdde4ff, 9, 0.9); moon.material.blending = THREE.NormalBlending; moon.material.fog = false; moon.position.set(cx + 6, 26, cz + 14); this.group.add(moon);
      const halo = sprite(0x8090c0, 26, 0.25); halo.material.fog = false; halo.position.copy(moon.position); this.group.add(halo);
      const N = 120, sp = new Float32Array(N * 3); for (let i = 0; i < N; i++) { sp[i * 3] = cx + (R() - 0.5) * 80; sp[i * 3 + 1] = 22 + R() * 10; sp[i * 3 + 2] = cz + (R() - 0.5) * 80; }
      const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(sp, 3));
      const stars = new THREE.Points(sg, new THREE.PointsMaterial({ size: 0.12, color: 0xcfd8ff, fog: false, transparent: true, opacity: 0.8 })); this.group.add(stars);
      this.bats([{ x: cx, y: H + 2.5, z: cz }], 4);
      const perches = this.wallSpots(court).slice(0, 6).map(s => ({ x: (s.x + 0.5 + s.dx * 0.5) * CELL, y: H, z: (s.z + 0.5 + s.dz * 0.5) * CELL }));
      if (perches.length) this.crows(perches.slice(0, 4));
      const c = this.takeOpen(court);
      if (c) {
        const q = this.center(c, 0.4), g = new THREE.Group(); g.position.set(q.x, 0, q.z); this.group.add(g);
        const bark = lam({ map: tex('bark'), color: 0x777070 });
        mesh(new THREE.CylinderGeometry(0.18, 0.32, 3.2, 6), bark, 0, 1.6, 0, g);
        for (let k = 0; k < 6; k++) { const br = mesh(new THREE.CylinderGeometry(0.03, 0.09, 1.6, 4), bark, 0, 2.6 + k * 0.15, 0, g); br.rotation.set((R() - 0.5) * 2, k, 0.9 + R() * 0.5); br.position.x = Math.cos(k) * 0.4; br.position.z = Math.sin(k) * 0.4; }
        this.solid(q.x, q.z, 0.4);
      }
      this.groundFog(0x9aa4b4, 0.2, 40, { x: cx, z: cz });
      let caw = 15; this.updaters.push((dt) => { caw -= dt; if (caw < 0) { caw = 18 + R() * 25; const s = this.spatial(cx, cz); this.game.audio.caw(s.vol * 0.6, s.pan); } });
    }

    // a coffin in the chapel
    {
      const c = this.takeOpen(c => c.x >= 23 && c.z <= 6); if (c) {
        const q = this.center(c, 0.2), g = new THREE.Group(); g.position.set(q.x, 0, q.z); g.rotation.y = R() < 0.5 ? 0 : Math.PI / 2; this.group.add(g);
        const wood = lam({ map: tex('wood'), color: 0x4a2a1a });
        mesh(new THREE.BoxGeometry(0.75, 0.5, 2.0), wood, 0, 0.45, 0, g); mesh(new THREE.BoxGeometry(0.8, 0.2, 0.8), stone, 0, 0.1, 0.55, g); mesh(new THREE.BoxGeometry(0.8, 0.2, 0.8), stone, 0, 0.1, -0.55, g);
        const lid = mesh(new THREE.BoxGeometry(0.8, 0.08, 2.05), wood, 0, 0.74, 0, g); lid.rotation.y = 0.12; lid.position.x = 0.12; // ajar
        this.solid(q.x, q.z, 0.9);
      }
    }

    // tapestries
    for (let i = 0; i < 5; i++) {
      const s = this.takeWall(c => !court(c) && this.markerFree(c)); if (!s) break;
      const hue = [0, 220, 30, 280, 120][i];
      const t = canvas(48, 128, (g) => {
        g.fillStyle = `hsl(${hue},40%,14%)`; g.fillRect(0, 0, 48, 128);
        g.strokeStyle = `hsl(${hue},40%,35%)`; g.lineWidth = 3; g.strokeRect(4, 4, 40, 116);
        g.fillStyle = `hsl(40,50%,40%)`; g.beginPath(); g.arc(24, 44, 10, 0, 7); g.fill();
        g.fillStyle = '#000'; g.fillRect(19, 40, 3, 4); g.fillRect(26, 40, 3, 4);
        for (let y = 70; y < 118; y += 8) { g.fillStyle = `hsl(${hue},40%,${22 + (y % 16)}%)`; g.fillRect(8, y, 32, 4); }
      });
      const m = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 2.9, 1, 8), lam({ map: t, side: THREE.DoubleSide }));
      this.onWall(m, s, 2.7, 0.06);
    }
  }
}
