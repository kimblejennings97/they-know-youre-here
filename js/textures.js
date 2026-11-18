// Procedurally drawn, low-res "PS1 style" textures. No image files needed.
import * as THREE from 'three';

export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function canvasTex(size, draw, seed = 1) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  draw(g, size, rng(seed));
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.anisotropy = 2;
  return t;
}

const hex = (r, g, b) => `rgb(${r|0},${g|0},${b|0})`;

function speckle(g, s, r, base, vary, n, px = 2) {
  for (let i = 0; i < n; i++) {
    const k = (r() - 0.5) * vary;
    g.fillStyle = hex(base[0] + k, base[1] + k, base[2] + k);
    g.fillRect((r() * s) | 0, (r() * s) | 0, px, px);
  }
}

const DRAW = {
  grass(g, s, r) {
    g.fillStyle = '#1d2716'; g.fillRect(0, 0, s, s);
    speckle(g, s, r, [32, 44, 24], 30, 1400);
    for (let i = 0; i < 260; i++) {
      g.fillStyle = r() < 0.5 ? '#2b3a1f' : '#141c0f';
      const x = r() * s, y = r() * s; g.fillRect(x, y, 1, 3 + r() * 3);
    }
  },
  dirt(g, s, r) {
    g.fillStyle = '#3a2d20'; g.fillRect(0, 0, s, s);
    speckle(g, s, r, [62, 48, 34], 36, 1600);
    for (let i = 0; i < 40; i++) { g.fillStyle = '#5a5048'; g.fillRect(r() * s, r() * s, 3, 2); }
  },
  wood(g, s, r) {
    const ph = s / 8;
    for (let i = 0; i < 8; i++) {
      const k = r() * 18;
      g.fillStyle = hex(68 + k, 48 + k * 0.7, 32 + k * 0.4); g.fillRect(0, i * ph, s, ph);
      for (let j = 0; j < 30; j++) { g.fillStyle = 'rgba(20,10,5,0.35)'; g.fillRect(r() * s, i * ph + r() * ph, 6 + r() * 20, 1); }
      g.fillStyle = '#1c120a'; g.fillRect(0, i * ph + ph - 2, s, 2);
      g.fillRect((r() * s) | 0, i * ph, 2, ph);
    }
    for (let i = 0; i < 12; i++) { g.fillStyle = 'rgba(10,20,10,0.25)'; g.fillRect(r() * s, r() * s, 10 + r() * 20, 6 + r() * 14); }
  },
  woodFloor(g, s, r) {
    const pw = s / 6;
    for (let i = 0; i < 6; i++) {
      const k = r() * 14;
      g.fillStyle = hex(58 + k, 40 + k, 26 + k * 0.5); g.fillRect(i * pw, 0, pw, s);
      g.fillStyle = '#1a1008'; g.fillRect(i * pw, 0, 2, s); g.fillRect(i * pw, (r() * s) | 0, pw, 2);
    }
    speckle(g, s, r, [40, 30, 20], 20, 500);
  },
  roof(g, s, r) {
    g.fillStyle = '#231a16'; g.fillRect(0, 0, s, s);
    for (let y = 0; y < s; y += 8) for (let x = (y / 8) % 2 * 8; x < s; x += 16) {
      const k = r() * 20; g.fillStyle = hex(40 + k, 32 + k, 30 + k); g.fillRect(x, y, 15, 7);
    }
  },
  bark(g, s, r) {
    g.fillStyle = '#2a2018'; g.fillRect(0, 0, s, s);
    for (let i = 0; i < 90; i++) { g.fillStyle = r() < 0.5 ? '#1a130d' : '#3a2e22'; g.fillRect(r() * s, r() * s, 2, 10 + r() * 30); }
  },
  leaves(g, s, r) {
    g.fillStyle = '#101a10'; g.fillRect(0, 0, s, s);
    speckle(g, s, r, [22, 40, 22], 26, 1600, 3);
  },
  water(g, s, r) {
    g.fillStyle = '#060d14'; g.fillRect(0, 0, s, s);
    for (let i = 0; i < 80; i++) { g.fillStyle = 'rgba(60,90,120,0.25)'; g.fillRect(r() * s, r() * s, 8 + r() * 24, 1); }
  },
  carpet(g, s, r) {
    g.fillStyle = '#0d0818'; g.fillRect(0, 0, s, s);
    const cols = ['#7a2bd0', '#14b8c8', '#e0c020', '#d02a7a', '#2a50e0'];
    for (let i = 0; i < 34; i++) {
      g.strokeStyle = cols[(r() * cols.length) | 0]; g.lineWidth = 2;
      const x = r() * s, y = r() * s;
      g.beginPath();
      if (r() < 0.5) { g.moveTo(x, y); g.lineTo(x + 8, y - 8); g.lineTo(x + 16, y); }
      else { g.moveTo(x, y); for (let k = 0; k < 4; k++) g.lineTo(x + k * 5, y + (k % 2 ? 5 : -5)); }
      g.stroke();
    }
    speckle(g, s, r, [20, 14, 28], 10, 600);
    for (let i = 0; i < 6; i++) { g.fillStyle = 'rgba(0,0,0,0.35)'; g.beginPath(); g.arc(r() * s, r() * s, 6 + r() * 14, 0, 7); g.fill(); }
  },
  tile(g, s, r) {
    const t = s / 4;
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
      const k = r() * 20; const dark = (x + y) % 2;
      g.fillStyle = dark ? hex(40 + k, 46 + k, 44 + k) : hex(130 + k, 132 + k, 120 + k);
      g.fillRect(x * t, y * t, t, t);
    }
    g.fillStyle = '#1a1a18'; for (let i = 0; i <= 4; i++) { g.fillRect(i * t - 1, 0, 2, s); g.fillRect(0, i * t - 1, s, 2); }
    for (let i = 0; i < 10; i++) { g.fillStyle = 'rgba(40,30,10,0.3)'; g.beginPath(); g.arc(r() * s, r() * s, 4 + r() * 12, 0, 7); g.fill(); }
  },
  arcadeWall(g, s, r) {
    g.fillStyle = '#1a1028'; g.fillRect(0, 0, s, s);
    speckle(g, s, r, [30, 20, 44], 14, 800);
    g.fillStyle = '#3a1a5a'; g.fillRect(0, s * 0.62, s, 6);
    g.fillStyle = '#0fa0b0'; g.fillRect(0, s * 0.62 + 8, s, 3);
    g.fillStyle = '#0c0814'; g.fillRect(0, s * 0.8, s, s * 0.2);
    for (let i = 0; i < 4; i++) { g.fillStyle = 'rgba(0,0,0,0.4)'; g.fillRect(r() * s, 0, 2 + r() * 6, s * (0.3 + r() * 0.6)); }
  },
  ceilingTile(g, s, r) {
    g.fillStyle = '#4a4848'; g.fillRect(0, 0, s, s);
    speckle(g, s, r, [70, 68, 66], 16, 900);
    g.fillStyle = '#1e1e1e'; g.fillRect(0, 0, s, 3); g.fillRect(0, 0, 3, s); g.fillRect(0, s / 2, s, 3); g.fillRect(s / 2, 0, 3, s);
    for (let i = 0; i < 3; i++) { g.fillStyle = 'rgba(90,70,30,0.35)'; g.beginPath(); g.arc(r() * s, r() * s, 6 + r() * 16, 0, 7); g.fill(); }
  },
  stoneBrick(g, s, r) {
    g.fillStyle = '#18181a'; g.fillRect(0, 0, s, s);
    const bh = s / 8, bw = s / 4;
    for (let y = 0; y < 8; y++) for (let x = -1; x < 5; x++) {
      const k = r() * 26; const ox = (y % 2) * bw / 2;
      g.fillStyle = hex(60 + k, 60 + k, 64 + k); g.fillRect(x * bw + ox + 1, y * bh + 1, bw - 3, bh - 3);
    }
    speckle(g, s, r, [50, 50, 54], 30, 900);
    for (let i = 0; i < 10; i++) { g.fillStyle = 'rgba(20,40,20,0.35)'; g.fillRect(r() * s, r() * s, 4 + r() * 10, 10 + r() * 30); }
  },
  stoneFloor(g, s, r) {
    g.fillStyle = '#141416'; g.fillRect(0, 0, s, s);
    const t = s / 3;
    for (let y = 0; y < 3; y++) for (let x = 0; x < 3; x++) {
      const k = r() * 20; g.fillStyle = hex(48 + k, 47 + k, 50 + k); g.fillRect(x * t + 2, y * t + 2, t - 4, t - 4);
    }
    speckle(g, s, r, [44, 44, 46], 26, 1100);
  },
  redCarpet(g, s, r) {
    g.fillStyle = '#3a0a0e'; g.fillRect(0, 0, s, s);
    speckle(g, s, r, [64, 14, 18], 20, 1000);
    g.fillStyle = '#7a5a1a'; g.fillRect(0, 0, 4, s); g.fillRect(s - 4, 0, 4, s);
    for (let y = 8; y < s; y += 24) { g.fillStyle = '#5a1418'; g.fillRect(s / 2 - 6, y, 12, 12); }
  },
  stoneCeiling(g, s, r) {
    g.fillStyle = '#121214'; g.fillRect(0, 0, s, s);
    speckle(g, s, r, [30, 30, 32], 16, 1200);
    g.fillStyle = '#1e140c'; g.fillRect(0, s / 2 - 6, s, 12);
  },
  metal(g, s, r) {
    g.fillStyle = '#4a5050'; g.fillRect(0, 0, s, s);
    for (let i = 0; i < 120; i++) { g.fillStyle = 'rgba(200,200,200,0.08)'; g.fillRect(r() * s, r() * s, 10 + r() * 30, 1); }
    for (let i = 0; i < 8; i++) { g.fillStyle = 'rgba(90,50,20,0.35)'; g.beginPath(); g.arc(r() * s, r() * s, 3 + r() * 10, 0, 7); g.fill(); }
  },
  locker(g, s, r) {
    g.fillStyle = '#3a4a5a'; g.fillRect(0, 0, s, s);
    g.fillStyle = '#1a2028'; for (let i = 0; i < 6; i++) g.fillRect(s * 0.25, s * 0.1 + i * 7, s * 0.5, 3);
    g.fillRect(s * 0.75, s * 0.5, 6, 14);
    for (let i = 0; i < 10; i++) { g.fillStyle = 'rgba(100,60,20,0.3)'; g.fillRect(r() * s, r() * s, 6, 6); }
  },
  fabric(g, s, r) {
    g.fillStyle = '#4a2a52'; g.fillRect(0, 0, s, s);
    speckle(g, s, r, [80, 46, 88], 40, 2000, 2);
    for (let i = 0; i < 18; i++) { g.fillStyle = 'rgba(30,18,8,0.45)'; g.beginPath(); g.arc(r() * s, r() * s, 3 + r() * 12, 0, 7); g.fill(); }
    for (let i = 0; i < 8; i++) { g.fillStyle = 'rgba(90,10,10,0.5)'; g.fillRect(r() * s, r() * s, 2 + r() * 4, 6 + r() * 16); }
  },
  skin(g, s, r) {
    g.fillStyle = '#b8b0a4'; g.fillRect(0, 0, s, s);
    speckle(g, s, r, [170, 160, 150], 40, 900);
    for (let i = 0; i < 14; i++) { g.strokeStyle = 'rgba(80,30,40,0.4)'; g.beginPath(); g.moveTo(r() * s, r() * s); g.lineTo(r() * s, r() * s); g.stroke(); }
  },
  glow(g, s) {
    const gr = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(255,255,255,0.45)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, s, s);
  },
};

const cache = new Map();
export function tex(name, rx = 1, ry = 1) {
  const key = `${name}:${rx}:${ry}`;
  if (cache.has(key)) return cache.get(key);
  let base = cache.get(name + ':base');
  if (!base) { base = canvasTex(name === 'glow' ? 64 : 128, DRAW[name], name.length * 977); cache.set(name + ':base', base); }
  const t = base.clone(); t.needsUpdate = true; t.repeat.set(rx, ry);
  cache.set(key, t);
  return t;
}

export function screenTex(seed) {
  const r = rng(seed);
  const hue = (r() * 360) | 0;
  return canvasTex(32, (g, s) => {
    g.fillStyle = `hsl(${hue},70%,12%)`; g.fillRect(0, 0, s, s);
    for (let i = 0; i < 26; i++) { g.fillStyle = `hsl(${(hue + r() * 120) | 0},90%,${40 + r() * 30}%)`; g.fillRect((r() * 8 | 0) * 4, (r() * 8 | 0) * 4, 4, 4); }
    g.fillStyle = 'rgba(0,0,0,0.35)'; for (let y = 0; y < s; y += 2) g.fillRect(0, y, s, 1);
  }, seed);
}

export function textTex(text, opts = {}) {
  const w = opts.w || 256, h = opts.h || 64;
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d');
  g.fillStyle = opts.bg || 'rgba(0,0,0,0)'; g.fillRect(0, 0, w, h);
  g.font = opts.font || 'bold 40px monospace'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillStyle = opts.color || '#fff'; g.fillText(text, w / 2, h / 2);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.magFilter = THREE.NearestFilter;
  return t;
}
