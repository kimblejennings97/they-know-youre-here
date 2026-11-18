# They Know You're Here

A first-person browser horror game. Pick a place, find what was lost, hide from what hunts you, and escape.

**Play:** https://kimblejennings97.github.io/they-know-youre-here/

## Maps
| Map | Monster | Hiding spots |
| --- | --- | --- |
| Camp Blackwater: an abandoned summer camp | The Counselor | bushes, trash cans |
| Pixel Palace: a dead 90s arcade | Mr. Grins | trash cans, lockers |
| Ravenmoor Keep: a haunted castle | The Widow | wardrobes, barrels |

## How it plays
- Objectives are randomized every run: **find-N** quests plus **multi-step tasks** (find the fuse, install it, throw the breaker).
- Monsters spawn more often as you make progress. Finish everything and the exit opens, and then they all come.
- Your **flashlight** makes you visible from far away. Turn it off and your eyes slowly adjust. **Sprinting** is loud.
- **Hide** in bushes, lockers, trash cans, wardrobes and barrels. If a monster sees you climb in, it pulls you out.
- **Sense** (Q) points toward the nearest objective, with a cooldown.
- **Easy:** 3 lives, and progress is kept when you're caught. **Hard:** one life, faster monsters, more multi-step tasks.
- Game length: 5, 15 or 30 minutes (sets the number of objectives). Optional flashlight battery drain.
- Best times and high scores are saved in your browser.

Controls: WASD, mouse, Shift sprint, F/right-click light, E/left-click interact, Q sense, Esc pause. On touch screens you get a joystick, drag-to-look and buttons.

## Tech
Plain HTML/CSS/JS ES modules, with no build step. [three.js](https://threejs.org) 0.160 loads from a CDN. Every texture is drawn procedurally on canvas and every sound is synthesized with Web Audio, so there are no asset files.

```
node tools/serve.mjs          # local server on http://localhost:8123
node tools/validate-maps.mjs  # checks every map layout is walkable
```
Add `?test=camp` (or `arcade`, `castle`) to the URL to skip the menu.
