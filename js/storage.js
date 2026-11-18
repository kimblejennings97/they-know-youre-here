// Settings and best times / high scores, kept in localStorage.
const SKEY = 'tkyh-settings-v1', RKEY = 'tkyh-records-v1';
const DEFAULTS = { map: 'camp', difficulty: 'easy', length: 15, battery: true, quality: 'retro', sens: 1, volume: 0.8, bright: 1.25 };

function read(k) { try { return JSON.parse(localStorage.getItem(k)) || null; } catch (e) { return null; } }
function write(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }

export function loadSettings() { return { ...DEFAULTS, ...(read(SKEY) || {}) }; }
export function saveSettings(s) { write(SKEY, s); }

export function loadRecords() { return read(RKEY) || {}; }

export function runKey(s) { return `${s.difficulty}-${s.length}`; }

export function score({ time, lives, settings }) {
  const base = { 5: 1000, 15: 3000, 30: 6000 }[settings.length];
  const target = settings.length * 60;
  const raw = base + Math.max(0, target * 1.5 - time) * 3 + (settings.difficulty === 'easy' ? lives * 250 : 0);
  return Math.round(raw * (settings.difficulty === 'hard' ? 2 : 1) * (settings.battery ? 1.25 : 1));
}

export function recordRun(mapId, settings, time, pts) {
  const all = loadRecords(), r = all[mapId] || (all[mapId] = { highScore: 0, best: {} });
  const k = runKey(settings), newBest = !(r.best[k] <= time), newHigh = pts > r.highScore;
  if (newBest) r.best[k] = time;
  if (newHigh) r.highScore = pts;
  r.escapes = (r.escapes || 0) + 1;
  write(RKEY, all);
  return { newBest, newHigh };
}

export function fmtTime(sec) {
  if (sec == null || !isFinite(sec)) return '--:--';
  const m = Math.floor(sec / 60), s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}
