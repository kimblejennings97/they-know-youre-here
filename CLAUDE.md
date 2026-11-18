# They Know You're Here

First-person browser horror game. Static files with no build step. Hosted on GitHub Pages from `main` (repo `kimblejennings97/they-know-youre-here`), so **every push to main goes live**.

## Layout
- `js/maps.js`: map grids + per-map theme (textures, monster, finds/tasks, hide types). Legend is at the top of the file. **Run `node tools/validate-maps.mjs` after editing a layout** (it checks rectangular rows, reachability, hide spots and the exit).
- `js/world.js`: builds the level from the grid (instanced walls/floors, props, hide spots, exit, decor) plus collision, LOS and pathfinding.
- `js/monsters.js`: monster models, `DEFS` (speeds, sight, scare framing), AI state machine (wander/investigate/chase/search/grab), and the spawn `Director` (spawn rate scales with progress and difficulty).
- `js/objectives.js`: objective generation (counts per length: 3/5/8), item/station models, interaction rules (a "use" step needs every earlier step done).
- `js/player.js`: movement, stamina, flashlight + battery, hiding. `js/input.js`: keyboard/mouse pointer lock + touch controls.
- `js/automap.js`: map overlay (M/Tab/MAP button). Easy shows the full layout and all hiding spots. Hard shows only cells within ~2.3 cells of where the player has been. Task stations show only once visited, in both modes. The game keeps running while it's open.
- `js/audio.js`: all sound synthesized with Web Audio. `js/textures.js`: procedural canvas textures.
- `js/main.js`: menu, game loop, HUD, catch/jump scare, win/lose, eye adaptation. `js/storage.js`: settings + records in localStorage.

## Testing
`node tools/serve.mjs` then open `http://localhost:8123/?test=camp` (skips the menu, no pointer lock). `window.game` is exposed for scripted tests.
Headless Chrome needs `--use-angle=swiftshader --enable-unsafe-swiftshader` for WebGL.
