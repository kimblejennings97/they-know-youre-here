// Keyboard + mouse (pointer lock) and touch controls (virtual joystick, drag-to-look, buttons).
export class Input {
  constructor(canvas, handlers) {
    this.canvas = canvas; this.h = handlers;
    this.keys = new Set(); this.look = { x: 0, y: 0 }; this.move = { x: 0, y: 0 }; this.touchSprint = false; this.sprintToggle = false;
    this.sens = 1;
    this.touch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
    addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.keys.add(e.code);
      if (e.code === 'KeyF') this.h.flash();
      if (e.code === 'KeyE' || e.code === 'Space') this.h.use();
      if (e.code === 'KeyQ') this.h.sense();
      if (e.code === 'KeyP') this.h.pause();
      if (e.code === 'KeyM' || e.code === 'Tab') this.h.map();
      if (['Space', 'ArrowUp', 'ArrowDown', 'Tab'].includes(e.code)) e.preventDefault();
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());
    addEventListener('mousemove', (e) => { if (document.pointerLockElement === canvas) { this.look.x += e.movementX; this.look.y += e.movementY; } });
    canvas.addEventListener('mousedown', (e) => {
      if (document.pointerLockElement !== canvas) { this.h.lockRequest(); return; }
      if (e.button === 2) this.h.flash(); else if (e.button === 0) this.h.use();
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    this.setupTouch();
  }

  lock() { if (!this.touch && this.canvas.requestPointerLock) { try { const p = this.canvas.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch (e) {} } }
  unlock() { if (document.pointerLockElement) document.exitPointerLock(); }

  setupTouch() {
    const ui = document.getElementById('touch');
    if (!this.touch) { ui.remove(); return; }
    ui.hidden = false;
    const zone = document.getElementById('touch-zone'), joy = document.getElementById('joy'), knob = document.getElementById('joy-knob');
    let moveId = null, lookId = null, ox = 0, oy = 0, lx = 0, ly = 0;
    zone.addEventListener('touchstart', (e) => {
      for (const t of e.changedTouches) {
        if (t.clientX < innerWidth * 0.45 && moveId === null) {
          moveId = t.identifier; ox = t.clientX; oy = t.clientY;
          joy.style.left = ox + 'px'; joy.style.top = oy + 'px'; joy.classList.add('on');
        } else if (lookId === null) { lookId = t.identifier; lx = t.clientX; ly = t.clientY; }
      }
      e.preventDefault();
    }, { passive: false });
    zone.addEventListener('touchmove', (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === moveId) {
          let dx = t.clientX - ox, dy = t.clientY - oy; const d = Math.hypot(dx, dy), max = 55;
          if (d > max) { dx *= max / d; dy *= max / d; }
          this.move.x = dx / max; this.move.y = -dy / max; this.touchSprint = d > max * 1.25;
          knob.style.transform = `translate(${dx}px,${dy}px)`;
        } else if (t.identifier === lookId) {
          this.look.x += (t.clientX - lx) * 2.2; this.look.y += (t.clientY - ly) * 2.2; lx = t.clientX; ly = t.clientY;
        }
      }
      e.preventDefault();
    }, { passive: false });
    const end = (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === moveId) { moveId = null; this.move.x = this.move.y = 0; this.touchSprint = false; knob.style.transform = ''; joy.classList.remove('on'); }
        if (t.identifier === lookId) lookId = null;
      }
    };
    zone.addEventListener('touchend', end); zone.addEventListener('touchcancel', end);
    const btn = (id, fn) => document.getElementById(id).addEventListener('touchstart', (e) => { e.preventDefault(); e.stopPropagation(); fn(e.currentTarget); }, { passive: false });
    btn('btn-use', () => this.h.use());
    btn('btn-light', () => this.h.flash());
    btn('btn-sense', () => this.h.sense());
    btn('btn-pause', () => this.h.pause());
    btn('btn-map', () => this.h.map());
    btn('btn-sprint', (el) => { this.sprintToggle = !this.sprintToggle; el.classList.toggle('on', this.sprintToggle); });
  }

  // read and clear accumulated state
  frame() {
    const k = this.keys;
    let mx = this.move.x, my = this.move.y;
    if (k.has('KeyW') || k.has('ArrowUp')) my += 1;
    if (k.has('KeyS') || k.has('ArrowDown')) my -= 1;
    if (k.has('KeyD') || k.has('ArrowRight')) mx += 1;
    if (k.has('KeyA') || k.has('ArrowLeft')) mx -= 1;
    const len = Math.hypot(mx, my); if (len > 1) { mx /= len; my /= len; }
    const out = { mx, my, lx: this.look.x * this.sens, ly: this.look.y * this.sens, sprint: k.has('ShiftLeft') || k.has('ShiftRight') || this.touchSprint || this.sprintToggle };
    this.look.x = this.look.y = 0;
    return out;
  }
}
