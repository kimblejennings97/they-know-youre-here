# They Know You're Here

First-person browser horror game. Static files with no build step. Hosted on GitHub Pages from `main` (repo `kimblejennings97/they-know-youre-here`), so **every push to main goes live**.

## Layout
- `js/maps.js`: map grids + per-map theme (textures, monster, finds/tasks, hide types). Legend is at the top of the file. **Run `node tools/validate-maps.mjs` after editing a layout** (it checks rectangular rows, reachability, hide spots and the exit).
- `js/world.js`: builds the level from the grid (instanced walls/floors, props, hide spots, exit, decor) plus collision, LOS and pathfinding.
- `js/monsters.js`: monster models, `DEFS` (speeds, sight, scare framing), AI state machine (wander/investigate/chase/search/grab), and the spawn `Director` (spawn rate scales with progress and difficulty).
- `js/objectives.js`: objective generation (counts per length: 3/5/8), item/station models, interaction rules (a "use" step needs every earlier step done).
- `js/player.js`: movement, stamina, flashlight + battery, hiding. `js/input.js`: keyboard/mouse pointer lock + touch controls.
- Icons: art is `tools/icon.html`; `node tools/make-icons.mjs` renders `img/apple-touch-icon.png` (180), `icon-192/512.png`, `favicon-32.png` (needs playwright-core + Chrome). `manifest.webmanifest` + apple meta tags in `index.html` make Home Screen launches full screen.
- `js/automap.js`: map overlay (M/Tab/MAP button). Easy shows the full layout and all hiding spots. Hard shows only cells within ~2.3 cells of where the player has been. Task stations show only once visited, in both modes. The game keeps running while it's open.
- `js/details.js`: set dressing and ambient life, built after the player and before objectives. Includes wall posters/neon/tapestries, props, crows/rats/bats/deer/fireflies, ground fog, dust motes, and the harmless distant "watcher" silhouette. Static meshes are merged per material in `bake()`; anything that moves must be added to `this.dyn` or it gets baked in place. Props you can bump into register `world.solids` (circles) and `world.reserved` cells (objectives skip them); only place those via `takeOpen()` (all 8 neighbours walkable) so paths stay clear.
- Difficulty ramp: `Monster.threat` (0 at start → 1 at ~85% progress or once the exit opens) scales chase/walk speed, sight range, FOV, alert rate, hearing and give-up time. Full-strength values equal the original tuning.
- `js/audio.js`: all sound synthesized with Web Audio. `js/textures.js`: procedural canvas textures.
- `js/main.js`: menu, game loop, HUD, catch/jump scare, win/lose, eye adaptation. `js/storage.js`: settings + records in localStorage.

## Testing
`node tools/serve.mjs` then open `http://localhost:8123/?test=camp` (skips the menu, no pointer lock). `window.game` is exposed for scripted tests.
Headless Chrome needs `--use-angle=swiftshader --enable-unsafe-swiftshader` for WebGL.
