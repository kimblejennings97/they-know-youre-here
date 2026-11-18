// Builds the 3D level from a map grid and answers spatial queries
// (collision, line of sight, pathfinding) for the player and monsters.
import * as THREE from 'three';
import { CELL, FLOOR_CHARS } from './maps.js';
import { tex, screenTex, textTex, rng } from './textures.js';

const DIRS4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const DIRS8 = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
const OPAQUE = new Set(['#', 'T', 'C', 'H', 'h']);

const _q = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3(), _s = new THREE.Vector3();
function mat4(x, y, z, ry = 0, sx = 1, sy = 1, sz = 1, rx = 0) {
  return new THREE.Matrix4().compose(_v.set(x, y, z), _q.setFromEuler(_e.set(rx, ry, 0)), _s.set(sx, sy, sz));
}
const lam = (o) => new THREE.MeshLambertMaterial(o);

export class World {
  constructor(map, scene, seed, quality) {
    this.map = map; this.scene = scene; this.quality = quality;
    this.rows = map.layout; this.w = this.rows[0].length; this.h = this.rows.length;
    this.r = rng(seed);
    this.group = new THREE.Group(); scene.add(this.group);
    this.hideSpots = []; this.monsterSpawns = []; this.floorCells = []; this.flickers = []; this.screens = [];
    this.exitOpen = false; this.indoor = new Set(); this.wallDecals = [];
    this.solids = [];          // round obstacles added by decor: {x, z, r}
    this.reserved = new Set(); // cells decor occupies, so objectives aren't placed there
    this.treePos = [];         // in-map tree trunks (camp), for posters on trunks
    for (let z = 0; z < this.h; z++) for (let x = 0; x < this.w; x++) {
      const c = this.rows[z][x];
      if (c === 'S') this.spawn = { x, z };
      if (c === 'E') this.exit = { x, z };
      if (c === 'M') this.monsterSpawns.push({ x, z });
      if (FLOOR_CHARS.has(c)) this.floorCells.push({ x, z });
    }
    this.build();
  }

  // ---------- queries ----------
  ch(x, z) { return (z >= 0 && z < this.h && x >= 0 && x < this.w) ? this.rows[z][x] : '#'; }
  passable(x, z) { const c = this.ch(x, z); return FLOOR_CHARS.has(c) || (c === 'E' && this.exitOpen); }
  opaque(x, z) { const c = this.ch(x, z); return OPAQUE.has(c) || (c === 'E' && !this.exitOpen); }
  center(x, z) { return { x: (x + 0.5) * CELL, z: (z + 0.5) * CELL }; }
  cellOf(wx, wz) { return [Math.floor(wx / CELL), Math.floor(wz / CELL)]; }
  passableAt(wx, wz) { const [x, z] = this.cellOf(wx, wz); return this.passable(x, z); }

  surfaceAt(wx, wz) {
    const [x, z] = this.cellOf(wx, wz), c = this.ch(x, z), t = this.map.tex;
    if (this.indoor.has(x + ',' + z)) return t.indoor;
    if (c === ',') return t.alt; if (c === '_') return t.open || t.floor;
    return t.floor;
  }

  // circle-vs-grid movement with sliding
  move(p, dx, dz, r) {
    let nx = p.x + dx;
    const z0 = Math.floor((p.z - r) / CELL), z1 = Math.floor((p.z + r) / CELL);
    if (dx > 0) { const cx = Math.floor((nx + r) / CELL); for (let cz = z0; cz <= z1; cz++) if (!this.passable(cx, cz)) nx = Math.min(nx, cx * CELL - r - 1e-3); }
    else if (dx < 0) { const cx = Math.floor((nx - r) / CELL); for (let cz = z0; cz <= z1; cz++) if (!this.passable(cx, cz)) nx = Math.max(nx, (cx + 1) * CELL + r + 1e-3); }
    p.x = nx;
    let nz = p.z + dz;
    const x0 = Math.floor((p.x - r) / CELL), x1 = Math.floor((p.x + r) / CELL);
    if (dz > 0) { const cz = Math.floor((nz + r) / CELL); for (let cx = x0; cx <= x1; cx++) if (!this.passable(cx, cz)) nz = Math.min(nz, cz * CELL - r - 1e-3); }
    else if (dz < 0) { const cz = Math.floor((nz - r) / CELL); for (let cx = x0; cx <= x1; cx++) if (!this.passable(cx, cz)) nz = Math.max(nz, (cz + 1) * CELL + r + 1e-3); }
    p.z = nz;
    for (const s of this.solids) { // push out of round decor obstacles
      const ex = p.x - s.x, ez = p.z - s.z, d = Math.hypot(ex, ez), m = s.r + r;
      if (d < m && d > 1e-4) { p.x = s.x + ex / d * m; p.z = s.z + ez / d * m; }
    }
  }

  los(ax, az, bx, bz) {
    const dx = bx - ax, dz = bz - az, d = Math.hypot(dx, dz), n = Math.ceil(d / 0.4);
    for (let i = 1; i < n; i++) {
      const [x, z] = this.cellOf(ax + dx * i / n, az + dz * i / n);
      if (this.opaque(x, z)) return false;
    }
    return true;
  }

  walkClear(ax, az, bx, bz, r = 0.45) {
    const dx = bx - ax, dz = bz - az, d = Math.hypot(dx, dz) || 1, n = Math.ceil(d / 0.4), px = -dz / d * r, pz = dx / d * r;
    for (let i = 1; i <= n; i++) {
      const x = ax + dx * i / n, z = az + dz * i / n;
      if (!this.passableAt(x, z) || !this.passableAt(x + px, z + pz) || !this.passableAt(x - px, z - pz)) return false;
    }
    return true;
  }

  neighbors(x, z) {
    const out = [];
    for (const [dx, dz] of DIRS8) {
      const nx = x + dx, nz = z + dz;
      if (!this.passable(nx, nz)) continue;
      if (dx && dz && (!this.passable(x + dx, z) || !this.passable(x, z + dz))) continue;
      out.push([nx, nz, dx && dz ? 1.414 : 1]);
    }
    return out;
  }

  // Dijkstra-lite (grid is tiny) from start to goal; returns list of [x,z] cells excluding start
  path(sx, sz, gx, gz) {
    if (!this.passable(gx, gz)) return null;
    const W = this.w, N = W * this.h, dist = new Float32Array(N).fill(Infinity), prev = new Int32Array(N).fill(-1);
    const open = [[sx, sz]]; dist[sz * W + sx] = 0;
    while (open.length) {
      let bi = 0; for (let i = 1; i < open.length; i++) if (dist[open[i][1] * W + open[i][0]] < dist[open[bi][1] * W + open[bi][0]]) bi = i;
      const [x, z] = open.splice(bi, 1)[0], k = z * W + x;
      if (x === gx && z === gz) break;
      for (const [nx, nz, c] of this.neighbors(x, z)) {
        const nk = nz * W + nx, nd = dist[k] + c;
        if (nd < dist[nk]) { if (dist[nk] === Infinity) open.push([nx, nz]); dist[nk] = nd; prev[nk] = k; }
      }
    }
    const gk = gz * W + gx; if (prev[gk] < 0 && !(sx === gx && sz === gz)) return null;
    const out = []; let k = gk;
    while (k >= 0 && k !== sz * W + sx) { out.push([k % W, (k / W) | 0]); k = prev[k]; }
    return out.reverse();
  }

  randomFloor(filter) {
    for (let i = 0; i < 200; i++) { const c = this.floorCells[(this.r() * this.floorCells.length) | 0]; if (!filter || filter(c)) return c; }
    return this.floorCells[0];
  }

  // which neighbouring cell is open (used to orient things placed against walls)
  openDir(x, z) {
    let best = null, bestN = -1;
    for (const [dx, dz] of DIRS4) if (this.passable(x + dx, z + dz)) {
      let n = 0; for (const [ex, ez] of DIRS4) if (this.passable(x + dx + ex, z + dz + ez)) n++;
      if (n > bestN) { bestN = n; best = [dx, dz]; }
    }
    return best || [0, 1];
  }
  wallDirs(x, z) { return DIRS4.filter(([dx, dz]) => this.ch(x + dx, z + dz) === '#' || this.ch(x + dx, z + dz) === 'T'); }

  // ---------- build ----------
  build() {
    const m = this.map, H = m.wallH, g = this.group, R = this.r;
    const inst = (geo, mat, list, cast = true, recv = true) => {
      if (!list.length) return null;
      const im = new THREE.InstancedMesh(geo, mat, list.length);
      list.forEach((t, i) => im.setMatrixAt(i, t));
      im.castShadow = cast; im.receiveShadow = recv; im.frustumCulled = false; g.add(im); return im;
    };

    // camp cabins: bounding boxes of wall components -> roofs + wooden floors
    const cabins = [];
    if (m.cabinRoofs) {
      const seen = new Set();
      for (let z = 0; z < this.h; z++) for (let x = 0; x < this.w; x++) {
        if (this.ch(x, z) !== '#' || seen.has(x + ',' + z)) continue;
        let x0 = x, x1 = x, z0 = z, z1 = z; const q = [[x, z]]; seen.add(x + ',' + z);
        while (q.length) {
          const [cx, cz] = q.pop(); x0 = Math.min(x0, cx); x1 = Math.max(x1, cx); z0 = Math.min(z0, cz); z1 = Math.max(z1, cz);
          for (const [dx, dz] of DIRS4) { const k = (cx + dx) + ',' + (cz + dz); if (!seen.has(k) && this.ch(cx + dx, cz + dz) === '#') { seen.add(k); q.push([cx + dx, cz + dz]); } }
        }
        cabins.push({ x0, x1, z0, z1 }); this.cabins = cabins;
        for (let cz = z0; cz <= z1; cz++) for (let cx = x0; cx <= x1; cx++) this.indoor.add(cx + ',' + cz);
      }
    }

    // floors
    const floorGeo = new THREE.PlaneGeometry(CELL, CELL).rotateX(-Math.PI / 2);
    const floors = {};
    const addFloor = (key, x, z, y = 0) => { (floors[key] = floors[key] || []).push(mat4((x + 0.5) * CELL, y, (z + 0.5) * CELL)); };
    const water = [];
    for (let z = 0; z < this.h; z++) for (let x = 0; x < this.w; x++) {
      const c = this.ch(x, z);
      if (c === '#' && !m.outdoor) continue;
      if (c === 'W') { water.push(mat4((x + 0.5) * CELL, -0.3, (z + 0.5) * CELL)); addFloor('dirt', x, z, -0.6); continue; }
      let key = m.tex.floor;
      if (this.indoor.has(x + ',' + z)) key = m.tex.indoor;
      else if (c === ',') key = m.tex.alt;
      else if (c === '_') key = m.tex.open;
      addFloor(key, x, z);
    }
    for (const k in floors) inst(floorGeo, lam({ map: tex(k) }), floors[k], false, true);
    if (water.length) {
      this.waterTex = tex('water', 1, 1);
      inst(floorGeo, lam({ map: this.waterTex, color: 0x8899aa, emissive: 0x050a10 }), water, false, true);
    }
    if (m.outdoor) { // ground beyond the fence line
      const big = new THREE.Mesh(new THREE.PlaneGeometry(400, 400).rotateX(-Math.PI / 2), lam({ map: tex('grass', 133, 133) }));
      big.position.set(this.w * CELL / 2, -0.02, this.h * CELL / 2); big.receiveShadow = true; g.add(big);
    }

    // walls
    const walls = [];
    for (let z = 0; z < this.h; z++) for (let x = 0; x < this.w; x++) if (this.ch(x, z) === '#') walls.push(mat4((x + 0.5) * CELL, H / 2, (z + 0.5) * CELL));
    inst(new THREE.BoxGeometry(CELL, H, CELL), lam({ map: tex(m.tex.wall, 1, H / CELL) }), walls);

    // ceiling
    if (!m.outdoor) {
      const ceil = [], cg = new THREE.PlaneGeometry(CELL, CELL).rotateX(Math.PI / 2);
      for (let z = 0; z < this.h; z++) for (let x = 0; x < this.w; x++) { const c = this.ch(x, z); if (c !== '#' && c !== '_') ceil.push(mat4((x + 0.5) * CELL, H, (z + 0.5) * CELL)); }
      inst(cg, lam({ map: tex(m.tex.ceiling) }), ceil, false, true);
    }
    for (const c of cabins) this.addRoof(c, H);

    // trees (inside the map plus a ring outside the fence)
    if (m.outdoor) {
      const trunks = [], leafA = [], leafB = [];
      const tree = (wx, wz) => {
        const s = 0.8 + R() * 0.6, ry = R() * 6.3;
        trunks.push(mat4(wx, 2 * s, wz, ry, s, s, s)); leafA.push(mat4(wx, 3.6 * s, wz, ry, s, s, s)); leafB.push(mat4(wx, 5.3 * s, wz, ry + 1, s, s, s));
      };
      for (let z = 0; z < this.h; z++) for (let x = 0; x < this.w; x++) if (this.ch(x, z) === 'T') {
        const tx = (x + 0.5 + (R() - 0.5) * 0.4) * CELL, tz = (z + 0.5 + (R() - 0.5) * 0.4) * CELL;
        tree(tx, tz); this.treePos.push({ x, z, wx: tx, wz: tz });
      }
      for (let z = -6; z < this.h + 6; z++) for (let x = -6; x < this.w + 6; x++) {
        if (x >= 0 && x < this.w && z >= 0 && z < this.h) continue;
        if (R() < 0.55) tree((x + R()) * CELL, (z + R()) * CELL);
      }
      inst(new THREE.CylinderGeometry(0.22, 0.35, 4, 6), lam({ map: tex('bark', 1, 2) }), trunks);
      const leafMat = lam({ map: tex('leaves', 2, 2), flatShading: true });
      inst(new THREE.ConeGeometry(1.7, 3.6, 7), leafMat, leafA);
      inst(new THREE.ConeGeometry(1.2, 3.0, 7), leafMat, leafB);
    }

    // props, hiding spots, lights
    for (let z = 0; z < this.h; z++) for (let x = 0; x < this.w; x++) {
      const c = this.ch(x, z), wx = (x + 0.5) * CELL, wz = (z + 0.5) * CELL;
      if (c === 'C' || c === 'K' || c === 'L') this.addProp(m.prop[c], x, z, wx, wz);
      if (c === 'H' || c === 'h') this.addHide(m.hide[c], x, z, wx, wz);
    }
    this.addExit();
    this.addDecor();
  }

  addRoof(c, H) {
    const x0 = c.x0 * CELL - 0.4, x1 = (c.x1 + 1) * CELL + 0.4, z0 = c.z0 * CELL - 0.4, z1 = (c.z1 + 1) * CELL + 0.4;
    const alongX = (x1 - x0) >= (z1 - z0), rise = 1.6, y = H;
    const geo = new THREE.BufferGeometry(), v = [];
    const tri = (a, b, cc) => v.push(...a, ...b, ...cc);
    if (alongX) {
      const zm = (z0 + z1) / 2, A = [x0, y, z0], B = [x1, y, z0], C = [x1, y + rise, zm], D = [x0, y + rise, zm], E = [x0, y, z1], F = [x1, y, z1];
      tri(A, C, B); tri(A, D, C); tri(E, F, C); tri(E, C, D); tri(A, E, D); tri(B, C, F); tri(A, B, F); tri(A, F, E);
    } else {
      const xm = (x0 + x1) / 2, A = [x0, y, z0], B = [x0, y, z1], C = [xm, y + rise, z1], D = [xm, y + rise, z0], E = [x1, y, z0], F = [x1, y, z1];
      tri(A, B, C); tri(A, C, D); tri(E, D, C); tri(E, C, F); tri(A, D, E); tri(B, F, C); tri(A, E, F); tri(A, F, B);
    }
    geo.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
    const uv = []; for (let i = 0; i < v.length; i += 3) uv.push(v[i] / 3, (v[i + 1] + v[i + 2]) / 3);
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, lam({ map: tex(this.map.tex.roof), side: THREE.DoubleSide }));
    mesh.castShadow = true; this.group.add(mesh);
  }

  facingAngle(x, z) { const [dx, dz] = this.openDir(x, z); return Math.atan2(dx, dz); }

  pointLight(wx, y, wz, color, intensity, dist, flicker = 0.15) {
    const l = new THREE.PointLight(color, intensity, dist, 1.2);
    l.position.set(wx, y, wz); this.group.add(l);
    this.flickers.push({ l, base: intensity, f: flicker, ph: this.r() * 100 });
    return l;
  }

  addProp(kind, x, z, wx, wz) {
    const g = new THREE.Group(), R = this.r, ang = this.facingAngle(x, z);
    g.position.set(wx, 0, wz);
    const box = (w, h, d, mat, px = 0, py = h / 2, pz = 0) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); b.position.set(px, py, pz); b.castShadow = b.receiveShadow = true; g.add(b); return b; };
    const wood = lam({ map: tex('wood') });
    if (kind === 'crate') {
      g.rotation.y = R() * 6.3;
      box(1.5, 1.2, 1.5, wood); if (R() < 0.5) { const t = box(1.1, 0.9, 1.1, wood, 0.1, 1.65); t.rotation.y = 0.6; }
      if (R() < 0.5) box(1.2, 0.8, 1.2, wood, 0.9, 0.4, 0.9);
    } else if (kind === 'picnic') {
      g.rotation.y = R() < 0.5 ? 0 : Math.PI / 2;
      box(2.6, 0.1, 1.1, wood, 0, 0.8); box(2.6, 0.08, 0.35, wood, 0, 0.45, 0.85); box(2.6, 0.08, 0.35, wood, 0, 0.45, -0.85);
      for (const sx of [-1.1, 1.1]) box(0.1, 0.8, 1.9, wood, sx, 0.4);
    } else if (kind === 'lamppost') {
      box(0.12, 3.4, 0.12, lam({ color: 0x222222 }), 0, 1.7);
      const lampMat = new THREE.MeshBasicMaterial({ color: 0xffd090 });
      box(0.35, 0.35, 0.35, lampMat, 0, 3.4);
      this.pointLight(wx, 3.2, wz, this.map.lightColor, 14, 16, 0.5);
      this.flickers[this.flickers.length - 1].mat = lampMat;
    } else if (kind === 'cabinet') {
      g.rotation.y = ang;
      const hue = R(); const body = lam({ color: new THREE.Color().setHSL(hue, 0.5, 0.18) });
      box(1.2, 2.1, 0.9, body); box(1.2, 0.15, 0.5, body, 0, 1.05, 0.55);
      const dead = R() < 0.25;
      const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.7), new THREE.MeshBasicMaterial({ map: dead ? null : screenTex((R() * 1e6) | 0), color: dead ? 0x050505 : 0xffffff }));
      scr.position.set(0, 1.55, 0.46); scr.rotation.x = -0.2; g.add(scr);
      const mq = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.28), new THREE.MeshBasicMaterial({ color: new THREE.Color().setHSL(hue, 0.9, dead ? 0.08 : 0.5) }));
      mq.position.set(0, 2.0, 0.46); g.add(mq);
      if (!dead) this.screens.push({ mat: scr.material, ph: R() * 100, rate: 0.5 + R() * 3 });
    } else if (kind === 'counter') {
      box(CELL, 1.0, 1.4, lam({ color: 0x2a1a3a }));
      const glass = new THREE.Mesh(new THREE.BoxGeometry(CELL - 0.1, 0.5, 1.3), new THREE.MeshLambertMaterial({ color: 0x88ccff, transparent: true, opacity: 0.25 }));
      glass.position.y = 1.25; g.add(glass);
      for (let i = 0; i < 3; i++) box(0.3, 0.3, 0.3, lam({ color: new THREE.Color().setHSL(R(), 0.6, 0.4) }), (R() - 0.5) * 2.4, 1.15, (R() - 0.5) * 0.8);
    } else if (kind === 'claw') {
      g.rotation.y = ang;
      box(1.7, 1.0, 1.7, lam({ color: 0x401060 }));
      const glass = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.3, 1.6), new THREE.MeshLambertMaterial({ color: 0xffaaff, transparent: true, opacity: 0.18, emissive: 0x200020 }));
      glass.position.y = 1.65; g.add(glass);
      const top = new THREE.MeshBasicMaterial({ color: 0xff40d0 }); box(1.75, 0.3, 1.75, top, 0, 2.45);
      for (let i = 0; i < 6; i++) { const p = new THREE.Mesh(new THREE.SphereGeometry(0.18, 6, 5), lam({ color: new THREE.Color().setHSL(R(), 0.6, 0.45) })); p.position.set((R() - 0.5) * 1.1, 1.15, (R() - 0.5) * 1.1); g.add(p); }
      this.pointLight(wx, 2.3, wz, this.map.lightColor, 10, 13, 0.35);
      this.flickers[this.flickers.length - 1].mat = top;
    } else if (kind === 'pillar') {
      const st = lam({ map: tex('stoneBrick', 1, 2) });
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.6, this.map.wallH, 8), st); p.position.y = this.map.wallH / 2; p.castShadow = p.receiveShadow = true; g.add(p);
      box(1.5, 0.4, 1.5, st); box(1.5, 0.4, 1.5, st, 0, this.map.wallH - 0.2);
    } else if (kind === 'table') {
      const dw = lam({ map: tex('wood'), color: 0x775544 });
      box(1.6, 0.12, CELL - 0.2, dw, 0, 0.9); for (const sx of [-0.65, 0.65]) for (const sz of [-1.2, 1.2]) box(0.12, 0.9, 0.12, dw, sx, 0.45, sz);
      for (let i = 0; i < 3; i++) box(0.12, 0.2 + R() * 0.3, 0.12, lam({ color: 0xccccbb }), (R() - 0.5), 1.05, (R() - 0.5) * 2);
    } else if (kind === 'brazier') {
      const iron = lam({ color: 0x2a2624 });
      box(0.2, 1.1, 0.2, iron, 0, 0.55);
      const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.3, 0.4, 8), iron); bowl.position.y = 1.3; g.add(bowl);
      const fireMat = new THREE.MeshBasicMaterial({ color: 0xff7a20 });
      const fire = new THREE.Mesh(new THREE.ConeGeometry(0.4, 0.9, 6), fireMat); fire.position.y = 1.85; g.add(fire);
      this.pointLight(wx, 2.2, wz, this.map.lightColor, 16, 16, 0.35);
      const fl = this.flickers[this.flickers.length - 1]; fl.mat = fireMat; fl.mesh = fire;
    }
    this.group.add(g);
  }

  addHide(type, x, z, wx, wz) {
    const g = new THREE.Group(), R = this.r, ang = this.facingAngle(x, z);
    g.position.set(wx, 0, wz); g.rotation.y = ang;
    const add = (mesh, px = 0, py = 0, pz = 0) => { mesh.position.set(px, py, pz); mesh.castShadow = mesh.receiveShadow = true; g.add(mesh); return mesh; };
    let eye = 1.0, label = type;
    if (type === 'bush') {
      const mat = lam({ map: tex('leaves'), color: 0x88aa88, flatShading: true });
      for (let i = 0; i < 5; i++) add(new THREE.Mesh(new THREE.IcosahedronGeometry(0.75 + R() * 0.45, 0), mat), (R() - 0.5) * 1.3, 0.6 + R() * 0.5, (R() - 0.5) * 1.3);
      eye = 0.9; label = 'bush';
    } else if (type === 'trashcan' || type === 'barrel') {
      const isB = type === 'barrel';
      const mat = isB ? lam({ map: tex('wood'), color: 0x886655 }) : lam({ map: tex('metal') });
      add(new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.55, 1.35, 10), mat), 0, 0.675);
      add(new THREE.Mesh(new THREE.CylinderGeometry(isB ? 0.62 : 0.66, 0.66, 0.08, 10), isB ? lam({ color: 0x222222 }) : mat), 0, 1.38);
      if (isB) for (const y of [0.3, 1.05]) add(new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.62, 0.06, 10), lam({ color: 0x222222 })), 0, y);
      eye = 1.0; label = isB ? 'barrel' : 'trash can';
    } else if (type === 'locker' || type === 'wardrobe') {
      const isW = type === 'wardrobe';
      const mat = isW ? lam({ map: tex('wood'), color: 0x664433 }) : lam({ map: tex('locker') });
      const w = isW ? 1.6 : 1.0, h = isW ? 2.7 : 2.2, d = isW ? 1.0 : 0.8;
      add(new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat), 0, h / 2, -(CELL / 2 - d / 2 - 0.05));
      eye = 1.55; label = type;
    }
    this.group.add(g);
    const [dx, dz] = this.openDir(x, z);
    const back = (type === 'locker' || type === 'wardrobe') ? -(CELL / 2 - 0.5) : 0;
    this.hideSpots.push({ x, z, type, label, eye, ang, mesh: g, pos: new THREE.Vector3(wx + Math.sin(ang) * back, 0, wz + Math.cos(ang) * back),
      out: new THREE.Vector3(wx + dx * CELL * 0.75, 0, wz + dz * CELL * 0.75) });
  }

  addExit() {
    const e = this.exit, m = this.map, [dx, dz] = this.openDir(e.x, e.z);
    const wx = (e.x + 0.5) * CELL, wz = (e.z + 0.5) * CELL, ang = Math.atan2(dx, dz);
    const g = new THREE.Group(); g.position.set(wx, 0, wz); g.rotation.y = ang; this.group.add(g);
    const fz = CELL * 0.35; // door plane, toward the open side
    // the light beyond
    const beyond = new THREE.Mesh(new THREE.PlaneGeometry(CELL, m.wallH), new THREE.MeshBasicMaterial({ color: 0x0a0c10 }));
    beyond.position.set(0, m.wallH / 2, -CELL * 0.45); g.add(beyond); this.exitBeyond = beyond;
    const doorGroup = new THREE.Group(); g.add(doorGroup); this.exitDoor = doorGroup;
    const box = (w, h, d, mat, x, y, z, parent = g) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); b.position.set(x, y, z); b.castShadow = true; parent.add(b); return b; };
    if (m.id === 'camp') {
      const wood = lam({ map: tex('wood') });
      box(0.35, 4, 0.35, wood, -CELL / 2 + 0.2, 2, fz); box(0.35, 4, 0.35, wood, CELL / 2 - 0.2, 2, fz);
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(CELL, 0.7), new THREE.MeshLambertMaterial({ map: textTex('CAMP BLACKWATER', { bg: '#3a2a1a', color: '#d8c8a0', font: 'bold 30px serif', w: 512, h: 64 }) }));
      sign.position.set(0, 3.6, fz + 0.2); g.add(sign);
      const back = sign.clone(); back.rotation.y = Math.PI; back.position.z = fz + 0.15; g.add(back);
      for (let i = 0; i < 5; i++) box(0.12, 2.2, 0.12, lam({ color: 0x333333 }), -1.1 + i * 0.55, 1.1, fz, doorGroup);
      box(2.6, 0.12, 0.12, lam({ color: 0x333333 }), 0, 1.9, fz, doorGroup); box(2.6, 0.12, 0.12, lam({ color: 0x333333 }), 0, 0.4, fz, doorGroup);
    } else {
      const doorMat = m.id === 'arcade' ? new THREE.MeshLambertMaterial({ color: 0x223344, transparent: true, opacity: 0.6 }) : lam({ map: tex('wood'), color: 0x553322 });
      box(CELL, m.wallH, 0.3, doorMat, 0, m.wallH / 2, fz - 0.2, doorGroup);
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.4), new THREE.MeshBasicMaterial({ map: textTex('EXIT', { bg: '#200', color: '#f22', w: 128, h: 48 }) }));
      sign.position.set(0, Math.min(m.wallH - 0.4, 3), fz + 0.05); g.add(sign);
    }
    this.exitGroup = g;
  }

  openExit() {
    this.exitOpen = true;
    this.exitDoor.visible = false;
    this.exitBeyond.material.color.set(0xcfd8e0);
    const c = this.center(this.exit.x, this.exit.z);
    this.pointLight(c.x, 2, c.z, 0xbfd0ff, 20, 18, 0.05);
  }

  addDecor() {
    const m = this.map, R = this.r, g = this.group;
    // wall posters / portraits on walls next to floor cells
    const posters = {
      camp: [['MISSING', '#e8e0c8', '#300'], ['LIGHTS OUT 9PM', '#c8b890', '#222'], ['DO NOT SWIM', '#c8b890', '#600'], ['MISSING', '#e8e0c8', '#300']],
      arcade: [['GAME OVER', '#100820', '#f2f'], ['INSERT COIN', '#100820', '#ff2'], ['HAPPY 7TH TIMMY', '#204', '#6ff'], ['PLAY WITH ME', '#200', '#f44']],
      castle: [['', '#2a1810', '#000'], ['', '#1a1010', '#000']],
    }[m.id];
    const spots = [];
    for (const c of this.floorCells) for (const [dx, dz] of this.wallDirs(c.x, c.z)) if (this.ch(c.x + dx, c.z + dz) === '#') spots.push([c, dx, dz]);
    const n = Math.min(14, spots.length);
    for (let i = 0; i < n; i++) {
      const [c, dx, dz] = spots.splice((R() * spots.length) | 0, 1)[0];
      const [text, bg, fg] = posters[(R() * posters.length) | 0];
      let mesh;
      if (m.id === 'castle') {
        mesh = new THREE.Group();
        const frame = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.4, 0.08), lam({ color: 0x5a4020 }));
        const art = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 1.2), lam({ map: portraitTex((R() * 1e6) | 0) }));
        art.position.z = 0.05; mesh.add(frame, art);
        if (R() < 0.5) { const ban = new THREE.Mesh(new THREE.PlaneGeometry(1, 2.6), lam({ color: 0x5a0a10, side: THREE.DoubleSide })); ban.position.set(0, 0, 0); mesh = ban; }
      } else {
        mesh = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 1.05), lam({ map: textTex(text, { bg, color: fg, w: 128, h: 168, font: `bold ${text.length > 9 ? 14 : 22}px monospace` }) }));
      }
      const wx = (c.x + 0.5 + dx * 0.49) * CELL, wz = (c.z + 0.5 + dz * 0.49) * CELL;
      mesh.position.set(wx, m.id === 'castle' ? 2.4 : 1.7, wz); mesh.rotation.y = Math.atan2(-dx, -dz) + (R() - 0.5) * 0.1;
      g.add(mesh);
    }
    // small floor clutter (no collision)
    const clutter = [], clutterGeo = m.id === 'camp' ? new THREE.DodecahedronGeometry(0.25, 0) : m.id === 'arcade' ? new THREE.SphereGeometry(0.18, 6, 4) : new THREE.IcosahedronGeometry(0.16, 0);
    const cm = m.id === 'camp' ? lam({ color: 0x555550, flatShading: true }) : m.id === 'arcade' ? lam({ color: 0xaa2244 }) : lam({ color: 0xbbb8a8, flatShading: true });
    for (let i = 0; i < 60; i++) { const c = this.randomFloor(); clutter.push(mat4((c.x + R()) * CELL, 0.08, (c.z + R()) * CELL, R() * 6, 1, 0.5 + R() * 0.6, 1)); }
    const im = new THREE.InstancedMesh(clutterGeo, cm, clutter.length); clutter.forEach((t, i) => im.setMatrixAt(i, t)); im.frustumCulled = false; g.add(im);
    if (m.id === 'arcade') { // floating party balloons
      for (let i = 0; i < 10; i++) {
        const c = this.randomFloor(), b = new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 6), lam({ color: new THREE.Color().setHSL(R(), 0.7, 0.4) }));
        b.scale.y = 1.2; b.position.set((c.x + 0.5) * CELL, m.wallH - 0.4, (c.z + 0.5) * CELL); g.add(b);
        this.flickers.push({ bob: b, ph: R() * 10 });
      }
    }
  }

  update(dt, t) {
    for (const f of this.flickers) {
      if (f.bob) { f.bob.position.y += Math.sin(t * 0.7 + f.ph) * 0.002; continue; }
      const n = Math.sin(t * 13 + f.ph) * Math.sin(t * 7.3 + f.ph * 2);
      let k = 1 - f.f * (0.5 + 0.5 * n);
      if (f.f > 0.3 && Math.sin(t * 0.9 + f.ph) > 0.97) k = 0.05; // occasional near blackout
      f.l.intensity = f.base * k;
      if (f.mat) f.mat.color.setScalar(0.4 + 0.6 * k).multiply(new THREE.Color(this.map.lightColor)).addScalar(0.1);
      if (f.mesh) f.mesh.scale.y = 0.8 + 0.4 * k;
    }
    for (const s of this.screens) { const v = Math.sin(t * s.rate + s.ph) > 0.92 ? 0.2 : 1; s.mat.color.setScalar(v); }
    if (this.waterTex) this.waterTex.offset.x = t * 0.01;
  }

  dispose() {
    this.scene.remove(this.group);
    this.group.traverse(o => { if (o.geometry) o.geometry.dispose(); });
  }
}

function portraitTex(seed) {
  const c = document.createElement('canvas'); c.width = 48; c.height = 64; const g = c.getContext('2d'); const r = rng(seed);
  g.fillStyle = `hsl(${(r() * 40) | 0},30%,12%)`; g.fillRect(0, 0, 48, 64);
  g.fillStyle = '#2a2420'; g.fillRect(8, 34, 32, 30);
  g.fillStyle = '#8a7a6a'; g.beginPath(); g.ellipse(24, 24, 10, 13, 0, 0, 7); g.fill();
  g.fillStyle = '#000'; g.fillRect(17, 21, 5, 3); g.fillRect(26, 21, 5, 3);
  if (r() < 0.5) { g.fillStyle = 'rgba(0,0,0,0.9)'; g.fillRect(14, 18, 20, 8); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.magFilter = THREE.NearestFilter; return t;
}
