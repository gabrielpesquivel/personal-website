# Gabriel Esquivel — Personal Website

Personal site of Gabriel Esquivel, Co-Founder & COO at [BootInk](https://3d.bootink.com). Single-page React app with an animated header, experience carousel, projects, and contact links.

## Stack

- React 18 (Create React App)
- [motion](https://motion.dev) for animations
- react-spring-3d-carousel for the experience section
- Deployed to GitHub Pages via `gh-pages`

## Development

```bash
npm ci        # install dependencies
npm start     # dev server at http://localhost:3000
```

## Deployment

```bash
npm run deploy   # builds and pushes to the gh-pages branch
```

## Structure

```
src/
  components/   # one component per section (Header, About, Experience, Projects, Contact, ...)
  components/Images/
  styles/       # one CSS file per component
```

To add an experience entry, append to the `experiences` array in `src/components/Experience.js` (set `darkLogo: true` for light-colored logos). Projects live in the `projects` array in `src/components/Projects.js`.
