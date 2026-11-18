// Map overlay (M / Tab / MAP button).
// Easy: the whole layout is drawn. Hard: only cells near places you've been.
// In both modes, task stations and hiding spots appear once you've been near them.
import { CELL } from './maps.js';

const REVEAL = 2.3; // cells around the player that count as "seen"

const COLORS = {
  camp: { bg: '#0b0d0a', floor: '#2b3324', alt: '#4a3c2a', wall: '#8a6a44', tree: '#16241a', water: '#1c3448', prop: '#5a4a38', ink: '#e8dcc0' },
  arcade: { bg: '#09060f', floor: '#2a1f3c', alt: '#3a3a40', wall: '#7a5aa8', tree: '#000', water: '#000', prop: '#4a3a68', ink: '#e8dcff' },
  castle: { bg: '#08080a', floor: '#2c2c30', alt: '#4a1c20', open: '#1e2a1c', wall: '#7a7a82', tree: '#000', water: '#000', prop: '#48484e', ink: '#e8e4dc' },
};

export class AutoMap {
  constructor(game) {
    this.game = game; this.open = false;
    this.el = document.getElementById('automap');
    this.cv = document.getElementById('automap-canvas');
    this.ctx = this.cv.getContext('2d');
    this.title = document.getElementById('automap-title');
    this.drawT = 0;
  }

  reset() {
    const w = this.game.world;
    this.seen = new Uint8Array(w.w * w.h);
    this.close();
  }

  toggle() { this.open ? this.close() : this.show(); }
  show() {
    if (this.game.state !== 'playing') return;
    this.open = true; this.el.hidden = false; this.drawT = 0;
    const g = this.game;
    this.title.textContent = `${g.map.name}${g.settings.difficulty === 'hard' ? ' · only where you have been' : ''}`;
    this.draw();
  }
  close() { this.open = false; if (this.el) this.el.hidden = true; }

  // mark cells around the player as visited (called every frame)
  update(dt) {
    const g = this.game, w = g.world, p = g.player.pos;
    const cx = p.x / CELL, cz = p.z / CELL, r = Math.ceil(REVEAL);
    for (let z = Math.floor(cz) - r; z <= Math.floor(cz) + r; z++) for (let x = Math.floor(cx) - r; x <= Math.floor(cx) + r; x++) {
      if (x < 0 || z < 0 || x >= w.w || z >= w.h) continue;
      if (Math.hypot(x + 0.5 - cx, z + 0.5 - cz) <= REVEAL) this.seen[z * w.w + x] = 1;
    }
    if (this.open) { this.drawT -= dt; if (this.drawT <= 0) { this.drawT = 0.1; this.draw(); } }
  }

  isSeen(x, z) { const w = this.game.world; return x >= 0 && z >= 0 && x < w.w && z < w.h && this.seen[z * w.w + x] === 1; }

  draw() {
    const g = this.game, w = g.world, ctx = this.ctx, C = COLORS[g.map.id] || COLORS.camp;
    const full = g.settings.difficulty === 'easy';
    // size the canvas to fit the screen
    // on touch screens leave room for the buttons on the right
    const maxW = g.input.touch ? innerWidth - 2 * Math.min(230, innerWidth * 0.26) : innerWidth * 0.92, maxH = innerHeight * 0.78;
    const cs = Math.max(6, Math.floor(Math.min(maxW / w.w, maxH / w.h)));
    const dpr = Math.min(2, devicePixelRatio || 1);
    const W = w.w * cs, H = w.h * cs;
    if (this.cv.width !== W * dpr || this.cv.height !== H * dpr) {
      this.cv.width = W * dpr; this.cv.height = H * dpr; this.cv.style.width = W + 'px'; this.cv.style.height = H + 'px';
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = C.bg; ctx.fillRect(0, 0, W, H);

    const shown = (x, z) => full || this.isSeen(x, z) || (w.ch(x, z) === '#' || w.ch(x, z) === 'T') && this.nearSeen(x, z);
    for (let z = 0; z < w.h; z++) for (let x = 0; x < w.w; x++) {
      if (!shown(x, z)) continue;
      const c = w.ch(x, z);
      let col = C.floor;
      if (c === '#') col = C.wall; else if (c === 'T') col = C.tree; else if (c === 'W') col = C.water;
      else if (c === ',') col = C.alt; else if (c === '_') col = C.open || C.floor;
      else if (c === 'C' || c === 'K' || c === 'L') col = C.prop;
      ctx.fillStyle = col; ctx.fillRect(x * cs, z * cs, cs, cs);
      if (c === 'T') { ctx.fillStyle = '#2a4a30'; ctx.beginPath(); ctx.arc((x + 0.5) * cs, (z + 0.5) * cs, cs * 0.32, 0, 7); ctx.fill(); }
      if (c === 'L') { ctx.fillStyle = '#ffc070'; ctx.beginPath(); ctx.arc((x + 0.5) * cs, (z + 0.5) * cs, cs * 0.18, 0, 7); ctx.fill(); }
    }
    // faint grid
    ctx.strokeStyle = 'rgba(255,255,255,0.035)'; ctx.lineWidth = 1;
    for (let x = 0; x <= w.w; x++) { ctx.beginPath(); ctx.moveTo(x * cs + 0.5, 0); ctx.lineTo(x * cs + 0.5, H); ctx.stroke(); }
    for (let z = 0; z <= w.h; z++) { ctx.beginPath(); ctx.moveTo(0, z * cs + 0.5); ctx.lineTo(W, z * cs + 0.5); ctx.stroke(); }

    // hiding spots you've been near
    for (const h of w.hideSpots) {
      if (!full && !this.nearSeen(h.x, h.z)) continue;
      ctx.fillStyle = '#5fb0a0'; const s = cs * 0.5;
      ctx.fillRect((h.x + 0.5) * cs - s / 2, (h.z + 0.5) * cs - s / 2, s, s);
    }
    // task stations you've been near (fuse box, altar, ...)
    for (const it of g.objectives.items) {
      if (it.kind !== 'station') continue;
      const [x, z] = w.cellOf(it.pos.x, it.pos.z);
      if (!this.isSeen(x, z)) continue;
      const done = it.obj.steps[it.step].done;
      this.diamond((it.pos.x / CELL) * cs, (it.pos.z / CELL) * cs, cs * 0.38, done ? '#3ad070' : '#ffb030');
    }
    // exit
    const e = w.exit;
    if (full || this.nearSeen(e.x, e.z)) {
      ctx.fillStyle = w.exitOpen ? '#3ad070' : '#c02030';
      ctx.fillRect(e.x * cs + 1, e.z * cs + 1, cs - 2, cs - 2);
      ctx.fillStyle = '#fff'; ctx.font = `bold ${Math.max(8, cs * 0.5)}px monospace`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('EXIT', (e.x + 0.5) * cs, (e.z + 0.5) * cs + (e.z === 0 ? cs : -cs));
    }
    // player arrow
    const p = g.player, px = p.pos.x / CELL * cs, pz = p.pos.z / CELL * cs;
    const fx = -Math.sin(p.yaw), fz = -Math.cos(p.yaw), rx = -fz, rz = fx, L = cs * 0.75;
    ctx.fillStyle = '#ffffff'; ctx.strokeStyle = '#000'; ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(px + fx * L, pz + fz * L);
    ctx.lineTo(px - fx * L * 0.6 + rx * L * 0.55, pz - fz * L * 0.6 + rz * L * 0.55);
    ctx.lineTo(px - fx * L * 0.3, pz - fz * L * 0.3);
    ctx.lineTo(px - fx * L * 0.6 - rx * L * 0.55, pz - fz * L * 0.6 - rz * L * 0.55);
    ctx.closePath(); ctx.stroke(); ctx.fill();
  }

  nearSeen(x, z) {
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) if (this.isSeen(x + dx, z + dz)) return true;
    return false;
  }

  diamond(x, y, r, col) {
    const c = this.ctx; c.fillStyle = col; c.strokeStyle = '#000'; c.lineWidth = 1.5;
    c.beginPath(); c.moveTo(x, y - r); c.lineTo(x + r, y); c.lineTo(x, y + r); c.lineTo(x - r, y); c.closePath(); c.fill(); c.stroke();
  }
}
