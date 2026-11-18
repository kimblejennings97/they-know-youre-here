// First-person player: movement, stamina, flashlight + battery, hiding.
import * as THREE from 'three';

export class Player {
  constructor(game, camera) {
    this.game = game; this.cam = camera;
    camera.rotation.order = 'YXZ';
    this.pos = new THREE.Vector3(); this.yaw = 0; this.pitch = 0;
    this.stamina = 100; this.exhausted = false; this.staminaDelay = 0;
    this.battery = 100; this.flashOn = true; this.hidden = false; this.hideSpot = null;
    this.noise = 0; this.bob = 0; this.stepAcc = 0; this.eye = 1.62; this.lowBeep = 0;

    const q = game.settings.quality === 'high';
    // angle (half-width of the cone, radians) comes from the "beam width" setting
    const fl = this.flash = new THREE.SpotLight(0xfff0d8, 55, 34, game.settings.beam, 0.45, 1.1);
    fl.position.set(0.2, -0.15, 0.1);
    fl.target.position.set(0, -0.35, -6);
    fl.castShadow = q;
    if (q) { fl.shadow.mapSize.set(1024, 1024); fl.shadow.camera.near = 0.3; fl.shadow.camera.far = 34; fl.shadow.bias = -0.0005; }
    camera.add(fl); camera.add(fl.target);
    this.spill = new THREE.PointLight(0xfff0d8, 1.2, 6, 1.5); camera.add(this.spill);
    this.respawn();
  }

  respawn() {
    const w = this.game.world, c = w.center(w.spawn.x, w.spawn.z);
    // face away from the exit, into the level
    const dx = w.spawn.x - w.exit.x, dz = w.spawn.z - w.exit.z;
    this.pos.set(c.x, 0, c.z); this.yaw = Math.atan2(dx, dz) + Math.PI; this.pitch = 0;
    this.hidden = false; this.hideSpot = null; this.stamina = 100; this.exhausted = false;
  }

  get hard() { return this.game.settings.difficulty === 'hard'; }

  toggleFlash() {
    if (this.hidden) return;
    if (!this.flashOn && this.game.settings.battery && this.battery <= 0) { this.game.audio.denied(); this.game.toast('The batteries are dead'); return; }
    this.flashOn = !this.flashOn; this.game.audio.click();
  }
  addBattery() { this.battery = Math.min(100, this.battery + 50); }

  hide(spot) {
    this.hidden = true; this.hideSpot = spot; this.wasFlash = this.flashOn; this.flashOn = false;
    this.pos.copy(spot.pos); this.yaw = spot.ang + Math.PI; this.hideYaw = this.yaw; this.pitch = 0;
    this.game.audio.hide();
  }
  unhide() {
    const s = this.hideSpot; this.hidden = false; this.hideSpot = null;
    this.pos.set(s.out.x, 0, s.out.z); this.flashOn = this.wasFlash && !(this.game.settings.battery && this.battery <= 0);
    this.game.audio.hide();
  }

  update(dt, inp) {
    const g = this.game, w = g.world, s = g.settings;
    // look
    this.yaw -= inp.lx * 0.0022; this.pitch -= inp.ly * 0.0022;
    this.pitch = Math.max(-1.35, Math.min(1.35, this.pitch));
    if (this.hidden) {
      let d = this.yaw - this.hideYaw; d = Math.atan2(Math.sin(d), Math.cos(d));
      this.yaw = this.hideYaw + Math.max(-0.9, Math.min(0.9, d)); this.pitch = Math.max(-0.5, Math.min(0.5, this.pitch));
    }

    // move
    let moving = false, sprinting = false;
    if (!this.hidden) {
      const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw), rx = Math.cos(this.yaw), rz = -Math.sin(this.yaw);
      let mx = fx * inp.my + rx * inp.mx, mz = fz * inp.my + rz * inp.mx;
      const len = Math.hypot(mx, mz);
      if (len > 0.05) {
        moving = true;
        sprinting = inp.sprint && !this.exhausted && this.stamina > 0 && inp.my > 0.3;
        const sp = (sprinting ? 5.6 : 3.3) * Math.min(1, len);
        mx /= len; mz /= len;
        const before = this.pos.clone();
        w.move(this.pos, mx * sp * dt, mz * sp * dt, 0.35);
        const moved = this.pos.distanceTo(before);
        this.bob += moved * 2.2;
        this.stepAcc += moved;
        if (this.stepAcc > (sprinting ? 2.0 : 1.6)) { this.stepAcc = 0; g.audio.footstep(w.surfaceAt(this.pos.x, this.pos.z), sprinting); }
      }
    }
    // stamina
    if (sprinting) { this.stamina -= dt * 21; this.staminaDelay = 0.9; if (this.stamina <= 0) { this.stamina = 0; this.exhausted = true; } }
    else { this.staminaDelay -= dt; if (this.staminaDelay <= 0) this.stamina = Math.min(100, this.stamina + dt * 13); }
    if (this.exhausted && this.stamina > 35) this.exhausted = false;
    g.audio.breath = this.exhausted ? 1 : Math.max(0, (50 - this.stamina) / 50) * (sprinting ? 1 : 0.6);

    this.noise = this.hidden ? 0 : sprinting ? 15 : moving ? (this.hard ? 6 : 4.5) : 0;

    // battery
    if (s.battery && this.flashOn) {
      this.battery -= dt * (this.hard ? 100 / 110 : 100 / 160);
      if (this.battery <= 0) { this.battery = 0; this.flashOn = false; g.audio.click(); g.toast('Your flashlight died. Find batteries.'); }
      if (this.battery < 15) { this.lowBeep -= dt; if (this.lowBeep <= 0) { this.lowBeep = 6; g.audio.lowBattery(); } }
    }
    let inten = this.flashOn ? 55 : 0;
    if (this.flashOn && s.battery && this.battery < 20) { const t = g.time; inten *= (0.5 + this.battery / 40) * (Math.sin(t * 31) * Math.sin(t * 7) > 0.6 ? 0.15 : 1); }
    this.flash.intensity = inten;
    this.spill.intensity = this.flashOn ? 1.2 : 0;

    // camera
    const eye = this.hidden ? this.hideSpot.eye : this.eye;
    const bobY = moving ? Math.sin(this.bob * 2) * (sprinting ? 0.07 : 0.04) : 0;
    this.cam.position.set(this.pos.x, eye + bobY, this.pos.z);
    this.cam.rotation.set(this.pitch, this.yaw, moving ? Math.sin(this.bob) * 0.008 : 0);
  }
}
