// Checks every map: rectangular rows, one S and one E, all floor cells reachable,
// every hiding spot and the exit reachable from an adjacent floor cell.
// Run: node tools/validate-maps.mjs
import { MAPS, FLOOR_CHARS } from '../js/maps.js';

let ok = true;
for (const m of MAPS) {
  const rows = m.layout;
  const w = rows[0].length, h = rows.length;
  const errs = [];
  rows.forEach((r, i) => { if (r.length !== w) errs.push(`row ${i} has length ${r.length}, expected ${w}`); });
  const at = (x, z) => (rows[z] && rows[z][x]) || '#';
  let S = null, E = null;
  const floors = [], hides = [];
  for (let z = 0; z < h; z++) for (let x = 0; x < rows[z].length; x++) {
    const c = rows[z][x];
    if (c === 'S') S = [x, z];
    if (c === 'E') { if (E) errs.push('multiple E'); E = [x, z]; }
    if (FLOOR_CHARS.has(c)) floors.push([x, z]);
    if (c === 'H' || c === 'h') hides.push([x, z]);
  }
  if (!S) errs.push('no S'); if (!E) errs.push('no E');
  if (S) {
    const seen = new Set([S.join()]); const q = [S];
    while (q.length) {
      const [x, z] = q.shift();
      for (const [dx, dz] of [[1,0],[-1,0],[0,1],[0,-1]]) {
        const nx = x + dx, nz = z + dz, k = nx + ',' + nz;
        if (!seen.has(k) && FLOOR_CHARS.has(at(nx, nz))) { seen.add(k); q.push([nx, nz]); }
      }
    }
    const unreached = floors.filter(f => !seen.has(f.join()));
    if (unreached.length) errs.push(`unreachable floor: ${unreached.map(f => f.join(':')).join(' ')}`);
    const adj = ([x, z]) => [[1,0],[-1,0],[0,1],[0,-1]].some(([dx, dz]) => seen.has((x+dx)+','+(z+dz)));
    hides.filter(p => !adj(p)).forEach(p => errs.push(`hide spot ${p} not reachable`));
    if (E && !adj(E)) errs.push('exit not reachable');
    console.log(`${m.id}: ${w}x${h}, ${floors.length} floor cells, ${hides.length} hide spots, ${(m.layout.join('').match(/L/g)||[]).length} lights`);
  }
  if (errs.length) { ok = false; console.log('  ERRORS:\n  ' + errs.join('\n  ')); }
}
process.exit(ok ? 0 : 1);
