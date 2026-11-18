// Objective generation (find-N quests + multi-step tasks), item models and placement.
import * as THREE from 'three';
import { CELL } from './maps.js';
import { tex } from './textures.js';

const PICK = {
  tag: ['box', [0.25, 0.16, 0.03], 0xd8c070], page: ['box', [0.28, 0.36, 0.01], 0xe8e0c8], photo: ['box', [0.26, 0.3, 0.01], 0xf4f4f0],
  badge: ['cyl', [0.12, 0.03], 0x3aa04a], fuse: ['cyl', [0.05, 0.22], 0xc8c8c8], battery: ['cyl', [0.07, 0.24], 0x30a030],
  gascan: ['box', [0.3, 0.38, 0.18], 0xb02020], matches: ['box', [0.16, 0.04, 0.1], 0xd04020], rope: ['torus', [0.15, 0.04], 0xa08050],
  ticket: ['box', [0.3, 0.12, 0.01], 0xf0c020], token: ['cyl', [0.1, 0.025], 0xd0a030], tape: ['box', [0.3, 0.18, 0.04], 0x202020],
  plush: ['sphere', [0.18], 0x8a4a9a], keycard: ['box', [0.2, 0.13, 0.01], 0x3070d0], screwdriver: ['cyl', [0.03, 0.35], 0xd04040],
  goldtoken: ['cyl', [0.13, 0.03], 0xffd040], wrench: ['box', [0.06, 0.4, 0.03], 0x9a9a9a], rune: ['ico', [0.15], 0x6070c0],
  candle: ['cyl', [0.05, 0.3], 0x2a2a2a], portrait: ['box', [0.3, 0.3, 0.01], 0x9a7050], bone: ['cyl', [0.025, 0.22], 0xe8e4d0],
  silverkey: ['box', [0.06, 0.25, 0.02], 0xd0d8e0], holywater: ['sphere', [0.12], 0x80c0ff], chalice: ['cyl', [0.1, 0.25], 0xc8c8c8],
  crank: ['box', [0.4, 0.06, 0.06], 0x6a6a6a], lens: ['torus', [0.1, 0.025], 0xc0a040], cell: ['cyl', [0.06, 0.2], 0xffd020],
};
const STATION = {
  fusebox: [0.7, 0.9, 0.25, 0x5a6060, 1.3], breaker: [0.7, 1.4, 0.4, 0x6a5020, 0.7], radio: [0.9, 0.55, 0.45, 0x3a3a2a, 0.28],
  terminal: [0.9, 1.3, 0.6, 0x202830, 0.65], panel: [1.0, 1.0, 0.2, 0x403050, 0.6], speaker: [1.0, 1.6, 0.7, 0x151515, 0.8],
  chest: [1.1, 0.7, 0.7, 0x3a3a40, 0.35], seal: [1.2, 1.6, 0.4, 0x707078, 0.8], altar: [1.8, 1.0, 1.0, 0x505058, 0.5],
  lectern: [0.6, 1.2, 0.5, 0x4a3020, 0.6], winch: [1.0, 1.0, 0.8, 0x3a3030, 0.5], bell: [0.9, 2.6, 0.3, 0x4a3020, 1.3],
  firepit: [1.4, 0.3, 1.4, 0x3a3634, 0.15], cursedcab: [1.2, 2.1, 0.9, 0x200000, 1.05],
};

let glowTex;
function glowSprite(color, scale) {
  glowTex = glowTex || tex('glow');
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false }));
  s.scale.setScalar(scale); return s;
}

export function buildPickup(key, dim) {
  const [shape, a, color] = PICK[key] || PICK.tag;
  const geo = shape === 'box' ? new THREE.BoxGeometry(...a) : shape === 'cyl' ? new THREE.CylinderGeometry(a[0], a[0], a[1], 10)
    : shape === 'torus' ? new THREE.TorusGeometry(a[0], a[1], 6, 12) : shape === 'ico' ? new THREE.IcosahedronGeometry(a[0], 0) : new THREE.SphereGeometry(a[0], 10, 8);
  const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color, emissive: new THREE.Color(color).multiplyScalar(dim ? 0.15 : 0.3) }));
  if (shape === 'box' && a[2] < 0.05) mesh.rotation.x = -0.5;
  const g = new THREE.Group(); g.add(mesh);
  const glow = glowSprite(0xffe0a0, dim ? 0.7 : 1.0); g.add(glow);
  return { group: g, mesh, glow };
}

export function buildStation(key) {
  const [w, h, d, color, cy] = STATION[key] || STATION.panel;
  const g = new THREE.Group();
  const mat = new THREE.MeshLambertMaterial({ color, map: key === 'altar' || key === 'seal' ? tex('stoneBrick') : key === 'lectern' || key === 'bell' ? tex('wood') : tex('metal') });
  const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); body.position.y = cy; body.castShadow = body.receiveShadow = true; g.add(body);
  if (key === 'bell') {
    const b = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.4, 0.5, 10, 1, true), new THREE.MeshLambertMaterial({ color: 0x8a6a2a, side: THREE.DoubleSide }));
    b.position.set(0, 2.3, 0.4); g.add(b);
  }
  if (key === 'firepit') {
    for (let i = 0; i < 8; i++) { const s = new THREE.Mesh(new THREE.DodecahedronGeometry(0.2, 0), new THREE.MeshLambertMaterial({ color: 0x555555 })); const a = i / 8 * 6.28; s.position.set(Math.cos(a) * 0.65, 0.15, Math.sin(a) * 0.65); g.add(s); }
    body.visible = false;
  }
  if (key === 'cursedcab') {
    const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.7), new THREE.MeshBasicMaterial({ color: 0x800000 })); scr.position.set(0, 1.5, d / 2 + 0.01); g.add(scr);
  }
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 5), new THREE.MeshBasicMaterial({ color: 0xffaa20 }));
  lamp.position.set(w / 2 - 0.12, cy + h / 2 - 0.12, d / 2 + 0.03); g.add(lamp);
  const glow = glowSprite(0xffaa40, 0.6); glow.position.copy(lamp.position); g.add(glow);
  return { group: g, lamp, glow, depth: d };
}

function shuffle(a, r) { for (let i = a.length - 1; i > 0; i--) { const j = (r() * (i + 1)) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; }

export class Objectives {
  constructor(game) {
    this.game = game; this.list = []; this.items = []; this.batteries = [];
    this.generate();
  }

  generate() {
    const g = this.game, { map, world } = g, s = g.settings, r = world.r, hard = s.difficulty === 'hard';
    const N = { 5: 3, 15: 5, 30: 8 }[s.length], per = { 5: 3, 15: 5, 30: 6 }[s.length];
    const finds = shuffle(map.finds.slice(), r), tasks = shuffle(map.tasks.slice(), r);
    if (!hard) tasks.sort((a, b) => a.steps.length - b.steps.length);
    let nT = Math.min(tasks.length, hard ? Math.ceil(N / 2) : Math.floor(N / 3));
    const nF = Math.min(finds.length, N - nT); nT = Math.min(tasks.length, N - nF);

    // candidate cells: floor cells away from the start, spaced apart
    const sp = world.spawn, used = [];
    const all = shuffle(world.floorCells.filter(c => Math.max(Math.abs(c.x - sp.x), Math.abs(c.z - sp.z)) > 2 && world.ch(c.x, c.z) !== 'M' && !world.reserved.has(c.x + ',' + c.z)), r);
    const far = (c, min) => used.every(u => Math.max(Math.abs(u.x - c.x), Math.abs(u.z - c.z)) >= min);
    const take = (pred, minSpace = 2) => {
      for (const sp2 of [minSpace, 1, 0]) { const i = all.findIndex(c => pred(c) && far(c, sp2)); if (i >= 0) { const c = all.splice(i, 1)[0]; used.push(c); return c; } }
      return world.floorCells[(r() * world.floorCells.length) | 0];
    };
    const wallSide = (c) => world.wallDirs(c.x, c.z)[0];

    const placePickup = (key, extra) => {
      const c = take(() => true);
      const ctr = world.center(c.x, c.z);
      const b = buildPickup(key, hard);
      const pos = new THREE.Vector3(ctr.x + (r() - 0.5) * 1.2, 0.35, ctr.z + (r() - 0.5) * 1.2);
      b.group.position.copy(pos); world.group.add(b.group);
      const it = { kind: 'pickup', key, pos, ...b, phase: r() * 6, ...extra };
      this.items.push(it); return it;
    };
    const placeStation = (key, extra, awayFrom) => {
      const c = take(c => !!wallSide(c) && (!awayFrom || Math.hypot(c.x - awayFrom.x, c.z - awayFrom.z) > 7));
      const ctr = world.center(c.x, c.z), dir = wallSide(c) || [0, -1];
      const b = buildStation(key);
      const off = CELL / 2 - b.depth / 2 - 0.1;
      const pos = new THREE.Vector3(ctr.x + dir[0] * off, 0, ctr.z + dir[1] * off);
      b.group.position.copy(pos); b.group.rotation.y = Math.atan2(-dir[0], -dir[1]); world.group.add(b.group);
      const it = { kind: 'station', key, pos, cell: c, ...b, ...extra };
      it.usePos = new THREE.Vector3(pos.x, 1, pos.z);
      this.items.push(it); return it;
    };

    for (let i = 0; i < nF; i++) {
      const f = finds[i];
      const o = { kind: 'find', title: f.title, noun: f.noun, total: per, count: 0, done: false };
      for (let k = 0; k < per; k++) placePickup(f.item, { obj: o, label: f.noun.replace(/s$/, '') });
      this.list.push(o);
    }
    for (let i = 0; i < nT; i++) {
      const t = tasks[i];
      const o = { kind: 'task', title: t.title, steps: t.steps.map(s => ({ ...s, done: false })), done: false };
      let prev = null;
      o.steps.forEach((st, si) => {
        const extra = { obj: o, step: si, label: st.label };
        const it = st.type === 'pickup' ? placePickup(st.item, extra) : placeStation(st.item, extra, prev);
        st.item3d = it;
        const [px, pz] = world.cellOf(it.pos.x, it.pos.z); prev = it.cell || { x: px, z: pz };
      });
      this.list.push(o);
    }
    if (s.battery) {
      const nb = { 5: 3, 15: 5, 30: 8 }[s.length] + (hard ? 0 : 2);
      for (let i = 0; i < nb; i++) placePickup('cell', { battery: true, label: 'flashlight battery' });
    }
    this.total = this.list.reduce((a, o) => a + (o.kind === 'find' ? o.total : o.steps.length), 0);
  }

  get doneUnits() { return this.list.reduce((a, o) => a + (o.kind === 'find' ? o.count : o.steps.filter(s => s.done).length), 0); }
  get allDone() { return this.list.every(o => o.done); }

  available(it) {
    if (it.taken) return false;
    if (it.battery) return true;
    const o = it.obj; if (o.done) return false;
    if (o.kind === 'find') return true;
    const st = o.steps[it.step]; if (st.done) return false;
    return true;
  }
  // a "use" step needs every earlier step done; pickups can be grabbed in any order
  ready(it) {
    if (it.kind !== 'station') return true;
    const o = it.obj; return o.steps.slice(0, it.step).every(s => s.done);
  }

  currentHint(o) {
    if (o.kind === 'find') return `${o.count}/${o.total}`;
    const st = o.steps.find(s => !s.done); return st ? st.hint : '';
  }

  interact(it) {
    const g = this.game;
    if (it.battery) { it.taken = true; it.group.visible = false; g.player.addBattery(); g.audio.pickup(); g.toast('Battery +50%'); return; }
    if (!this.ready(it)) {
      const need = it.obj.steps.slice(0, it.step).find(s => !s.done);
      g.audio.denied(); g.toast(`You need: ${need.label}`); return;
    }
    const o = it.obj;
    if (o.kind === 'find') {
      o.count++; it.taken = true; it.group.visible = false; g.audio.pickup();
      g.toast(`${cap(o.noun)} ${o.count}/${o.total}`);
      if (o.count >= o.total) this.complete(o);
    } else {
      const st = o.steps[it.step]; st.done = true;
      if (it.kind === 'pickup') { it.taken = true; it.group.visible = false; g.audio.pickup(); g.toast(`Picked up: ${st.label}`); }
      else { it.lamp.material.color.set(0x30ff60); it.glow.material.color.set(0x30ff60); g.audio.stepDone(); g.toast(`${st.label}: done`); g.makeNoise(it.pos, 18); }
      if (o.steps.every(s => s.done)) this.complete(o);
    }
    g.onProgress();
  }

  complete(o) {
    o.done = true; this.game.audio.objectiveDone();
    setTimeout(() => this.game.toast(`Objective complete: ${o.title}`), 700);
  }

  // nearest thing worth walking to (for the "sense" ability)
  nearestTarget(p) {
    let best = null, bd = Infinity;
    for (const it of this.items) {
      if (it.battery || !this.available(it) || !this.ready(it)) continue;
      const d = Math.hypot(it.pos.x - p.x, it.pos.z - p.z); if (d < bd) { bd = d; best = it; }
    }
    return best;
  }

  update(dt, t) {
    for (const it of this.items) {
      if (it.taken) continue;
      if (it.kind === 'pickup') { it.mesh.rotation.y += dt * 1.2; it.mesh.position.y = Math.sin(t * 2 + it.phase) * 0.06; it.glow.material.opacity = 0.3 + 0.2 * Math.sin(t * 3 + it.phase); }
      else if (!it.obj.steps[it.step].done) {
        const on = this.ready(it) && Math.sin(t * 4) > 0;
        it.lamp.material.color.set(on ? 0xffaa20 : 0x402000); it.glow.visible = on;
      }
    }
  }
}

const cap = (s) => s[0].toUpperCase() + s.slice(1);
