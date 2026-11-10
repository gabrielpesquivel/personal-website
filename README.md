# Gabriel Esquivel — Personal Website

Personal site of Gabriel Esquivel, Co-founder at [Bootink](https://bootink.com). A single-page React app drawn as a side-scrolling neon city (inspired by Roku City): each section of the portfolio is a building on one street, and the blog opens as a newspaper on top of it.

## Stack

- React 18 (Create React App), plain JavaScript and CSS
- react-router-dom for the `/blog` overlay
- react-icons
- Node 24.x

## Development

```bash
npm ci                          # install dependencies
npm start                       # dev server at http://localhost:3000
npm test -- --watchAll=false    # run the tests once
npm run build                   # production build into build/ (not committed)
```

## Structure

```
src/
  data/content.js      # all copy and data: profile, about, experience, skills, contact, blog posts
  components/City.js   # the city scene and every building in it
  components/cityNav.js  # event bridge between the navbar and the city
  components/Navbar.js
  components/Newspaper.js  # the /blog overlay
  components/Images/
  styles/              # one CSS file per component
```

To change content, edit `src/data/content.js`. Add an experience entry to the `experience` array (`look` picks the tower style, `face` should match the logo's background); add a blog post to `blogPosts`.
