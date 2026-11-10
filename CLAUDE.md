# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm ci           # install (Node 24.x, pinned in package.json "engines")
npm start        # CRA dev server at http://localhost:3000
npm run build    # production build into build/
npm test         # Jest via react-scripts (watch mode); `npm test -- --watchAll=false` for one run
npm test -- --watchAll=false -t "name"   # single test by name
```

Linting is CRA's built-in ESLint (`react-app` config); it runs during `npm start` / `npm run build`. There is no separate lint script.

Notes:
- `build/` is gitignored; never commit it.
- Deployment: recent commits target Vercel (`.vercel` is gitignored; Node 24 is required because Vercel dropped Node 20). A legacy `deploy` script still pushes `build/` to the `gh-pages` branch.
- The tests mock `window.matchMedia` (jsdom lacks it; the city reads `prefers-reduced-motion`).

## Architecture

Create React App, React 18, plain JavaScript, plain CSS (one stylesheet per component in `src/styles/`). No TypeScript, no state library.

The whole site is a single side-scrolling, auto-driving neon city ("Inspired by Roku City"). Each portfolio section is a building or landmark on one street.

### Shell (`src/App.js`)

`Navbar`, `City` and `Chatbot` are always mounted. The only route distinction is `/blog`, which renders `Newspaper` as an overlay on top of the city. `Chatbot` only injects the IBM watsonx Assistant web-chat script.

### Content (`src/data/content.js`)

All copy and data live here: `profile`, `about`, `experience`, `theater`, `skills`, `contact`, `blogPosts`. Fields on these objects drive visuals as well as text (for example `experience[].look` selects the tower architecture, `face` is the billboard background, `lights` the lit-window ratio). To change site content, edit this file rather than the components.

### City (`src/components/City.js` + `src/styles/City.css`)

One large file holding the scene and every sub-component (`Building`, `Spot`, `Skyline`, `Car`, `Metro`, `HobbyHall`, `Street`, ...).

- **Units**: layout is authored in `u`, where `1u = 1%` of viewport height. JS converts with `px(n)`; CSS uses the `--u` custom property set on `.city`. Keep new geometry in `u`.
- **Street loop**: the street is `TRACK_U` (672u) long and `<Street>` is rendered twice back to back. The second copy sits inside `GhostCtx` (`aria-hidden`, out of tab order). The offset wraps at one street length, so the loop is seamless. `TRACK_U` must stay a multiple of 8 so lane dashes line up.
- **Animation**: a single `requestAnimationFrame` loop mutates refs (`txRef`, `glideRef`) and writes `transform` straight to the layer DOM nodes in `paint()`. Street position is deliberately not React state. The mid and far skylines move at `MID_FACTOR` / `FAR_FACTOR` and repeat at the matching scaled period. Traffic cars are also positioned imperatively inside that loop. `prefers-reduced-motion` is honoured.
- **Positions**: `TARGETS` maps nav ids to street x-positions (in `u`); `DISTRICTS` maps x-ranges to the nav section to highlight. Moving a building means updating both.
- **Interaction**: `Spot` is the interactive wrapper for a landmark (hover, tap, keyboard focus). It opens the floating `.city-card`, whose content comes from `CardBody` and which is re-positioned every frame so it rides along with its building. Hover only counts after real pointer movement, because buildings slide under a still cursor.
- **Determinism**: procedural details (windows, skylines) use the seeded `mulberry32` PRNG so both street copies and re-renders match. Do not use `Math.random()` for anything drawn in `Street`.
- **Accessibility/SEO**: a `.sr-only` block at the end of the city repeats the content as plain text.

### Navbar ↔ City bridge (`src/components/cityNav.js`)

The two components communicate through `window` CustomEvents, not props or context:

- `goToCityTarget(id)` dispatches `city:goto`; the city glides to `TARGETS[id]`.
- The city calls `announceDistrict(navId)` every frame; `city:district` fires on change and the navbar highlights that stop. `getCurrentDistrict()` serves late subscribers.
- When navigating back from `/blog`, the target is passed as router state (`location.state.goto`) and consumed by `City`.
