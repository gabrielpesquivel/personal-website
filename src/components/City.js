import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { FaEnvelope, FaGithub, FaLinkedin } from 'react-icons/fa';
import { SiLeetcode } from 'react-icons/si';
import '../styles/City.css';
import { about, blogPosts, contact, experience, profile, skills, theater } from '../data/content';
import { announceDistrict, CITY_GOTO_EVENT } from './cityNav';

/*
 * Layout is authored in "u" units: 1u = 1% of the viewport height.
 * Everything is converted to px at runtime so the city scales with the screen.
 */
const TRACK_U = 672; // multiple of 8 so the lane dashes line up across the loop
const GROUND_U = 14;
const THANKS_U = 654; // send-off sign; overhangs the end of the street by 16u
const HOME_U = 16; // home view starts just past that overhang

// Where each nav target sits along the street (centre x, in u). Home puts the street start at the left edge.
const TARGETS = {
  home: null,
  about: 152,
  experience: { left: 179 }, // land at the start of the avenue, Bootink first
  skills: 448,
  blog: 500,
  contact: 550,
};

// the jobs in the order they happened, for the cinema's signs
const CAREER = [...experience].reverse();

const DISTRICTS = [
  { name: 'Downtown', to: 176, nav: 'about' },
  { name: 'Career Ave', to: 408, nav: 'experience' },
  { name: 'Skill St', to: 480, nav: 'skills' },
  { name: 'Broadcast Hill', to: Infinity, nav: 'contact' },
];

const EXP_HEIGHTS = [60, 55, 50, 46, 42];
const EXP_COLORS = ['#36196e', '#3b1f73', '#33196a', '#40237a', '#2e1862'];

const SPEED_U = 7; // cruising speed, street units per second
// scroll speed choices offered in the top-right control, as multiples of the cruising speed
const SPEEDS = [
  { value: 0, label: '❚❚', name: 'Paused' },
  { value: 0.5, label: '0.5×', name: 'Half speed' },
  { value: 1, label: '1×', name: 'Normal speed' },
  { value: 2, label: '2×', name: 'Double speed' },
];
const SPEED_KEY = 'city-speed';
const MID_FACTOR = 0.45; // parallax speeds; each background layer repeats so the loop is seamless
const FAR_FACTOR = 0.18;

const CityCtx = createContext(null);
// true inside the duplicate street that trails the real one (keeps it out of the tab order)
const GhostCtx = createContext(false);

function mulberry32(seed) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/* ---------- small building blocks ---------- */

function Windows({ cols, rows, seed, lit = 0.45, warm = '#ffd77a' }) {
  const rects = useMemo(() => {
    const rnd = mulberry32(seed);
    const out = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const on = rnd() < lit;
        if (on) rnd(); // keep the old draw so the lit/unlit pattern stays the same
        out.push(
          <rect
            key={`${r}-${c}`}
            x={c + 0.25}
            y={r + 0.3}
            width={0.5}
            height={0.45}
            fill={on ? warm : '#1a0d36'}
            opacity={on ? 0.55 + rnd() * 0.45 : 0.9}
          />
        );
      }
    }
    return out;
  }, [cols, rows, seed, lit, warm]);
  return (
    <svg className="windows" viewBox={`0 0 ${cols} ${rows}`} preserveAspectRatio="none" aria-hidden="true">
      {rects}
    </svg>
  );
}

function Building({ x, w, h, base = GROUND_U, color = '#34196a', seed = 1, lit, className = '', children, windows = true, z }) {
  const { u } = useContext(CityCtx);
  return (
    <div
      className={`bldg ${className}`}
      style={{ left: x * u, width: w * u, height: h * u, bottom: base * u, background: color, zIndex: z }}
    >
      {windows && (
        <div className="bldg-windows">
          <Windows cols={Math.max(2, Math.round(w / 4))} rows={Math.max(2, Math.round(h / 5))} seed={seed} lit={lit} />
        </div>
      )}
      {children}
    </div>
  );
}

// `quiet` spots do their thing on click only: no card on hover or focus
function Spot({ id, at, label, className = '', style, onActivate, quiet, children }) {
  const ctx = useContext(CityCtx);
  const ghost = useContext(GhostCtx);
  const active = ctx.activeId === id;
  const activate = (el) => (onActivate ? onActivate() : ctx.toggle(id, el));
  return (
    <div
      className={`spot ${active ? 'is-active' : ''} ${className}`}
      style={style}
      role="button"
      tabIndex={ghost ? -1 : 0}
      aria-label={label}
      aria-expanded={onActivate ? undefined : active}
      onPointerEnter={(e) => !quiet && e.pointerType === 'mouse' && ctx.mouseMoved() && ctx.open(id, e.currentTarget, 'hover')}
      onPointerMove={(e) => !quiet && e.pointerType === 'mouse' && !active && ctx.open(id, e.currentTarget, 'hover')}
      onPointerLeave={(e) => !quiet && e.pointerType === 'mouse' && ctx.scheduleClose()}
      onFocus={(e) => {
        ctx.reveal(at);
        if (!quiet) ctx.open(id, e.currentTarget, 'focus');
      }}
      onBlur={(e) => !e.currentTarget.contains(e.relatedTarget) && ctx.scheduleClose()}
      onClick={(e) => activate(e.currentTarget)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          activate(e.currentTarget);
        } else if (e.key === 'Escape') {
          ctx.close();
        }
      }}
    >
      {children}
    </div>
  );
}

function StreetSign({ x, text }) {
  const { u } = useContext(CityCtx);
  return (
    <div className="street-sign" style={{ left: x * u, bottom: GROUND_U * u }} aria-hidden="true">
      <div className="street-sign-plate">{text}</div>
      <div className="street-sign-pole" />
    </div>
  );
}

function StreetLamp({ x }) {
  const { u } = useContext(CityCtx);
  return (
    <div className="lamp" style={{ left: x * u, bottom: GROUND_U * u }} aria-hidden="true">
      <div className="lamp-head" />
      <div className="lamp-pole" />
    </div>
  );
}

/* ---------- background layers ---------- */

const ROOF_GLOWS = ['#ff4fd8', '#4fe3ff', '#ffe14f', '#8dff6b'];
// where the harbour opens up in the far skyline (in far-layer units), and which rooftops carry an easter egg
const FAR_GAP = [56, 116];
// a break in the mid skyline too, so the harbour behind it gets its moment
const MID_GAP = [150, 212];
const FAR_EGGS = { 1: 'needle' };
const MID_EGGS = { 9: 'party' };

// Sydney on the horizon: the harbour bridge and the opera house fill a gap in the far skyline
function Harbour() {
  return (
    <svg className="harbour-svg" viewBox="0 0 600 260" preserveAspectRatio="none">
      {/* water, with the city glow on it */}
      <rect x="0" y="232" width="600" height="28" className="harbour-water" />
      <path d="M20,240 h60 M130,246 h90 M260,239 h70 M370,247 h80 M480,241 h70 M60,253 h50 M300,254 h110" className="harbour-glint" />
      <g className="harbour-ink">
        {/* opera house sails */}
        <path d="M468,232 Q470,196 500,178 Q498,208 506,232 Z M496,232 Q500,186 536,164 Q532,204 540,232 Z M530,232 Q536,196 566,180 Q562,210 570,232 Z" />
        <rect x="456" y="228" width="124" height="6" />
        {/* bridge: stone pylons, deck, and the arch */}
        <rect x="22" y="150" width="20" height="84" />
        <rect x="398" y="150" width="20" height="84" />
        <rect x="18" y="144" width="28" height="8" />
        <rect x="394" y="144" width="28" height="8" />
        <rect x="0" y="186" width="440" height="7" />
        <path d="M42,186 Q220,-20 398,186 L386,186 Q220,22 54,186 Z" />
        <path d="M80,186 V154 M110,186 V128 M140,186 V106 M170,186 V90 M200,186 V82 M220,186 V80 M240,186 V82 M270,186 V90 M300,186 V106 M330,186 V128 M360,186 V154" className="harbour-line" />
        <path d="M0,193 V232 M90,193 V232 M350,193 V232 M440,193 V232" className="harbour-line thick" />
      </g>
      {/* lamps along the deck and a beacon on the crown */}
      {[30, 70, 110, 150, 190, 230, 270, 310, 350, 390, 430].map((x) => (
        <circle key={x} cx={x} cy="184" r="1.8" fill="#ffe7a8" />
      ))}
      <circle className="harbour-beacon" cx="220" cy="76" r="3" fill="#ff3b5c" />
    </svg>
  );
}

function Skyline({ seed, period, copies, minW, maxW, minH, maxH, className, neon = 0.14, gap, harbour, props }) {
  const { u } = useContext(CityCtx);
  const blocks = useMemo(() => {
    const rnd = mulberry32(seed);
    const out = [];
    let x = 0;
    while (x < period - minW) {
      if (gap && x >= gap[0] - minW && x < gap[1]) {
        x = gap[1];
        continue;
      }
      let w = Math.min(minW + rnd() * (maxW - minW), period - x);
      if (gap && x < gap[0] && x + w > gap[0]) w = gap[0] - x;
      const h = minH + rnd() * (maxH - minH);
      // art-deco tops: stepped setbacks, a stepped crown with a needle, or a pyramid
      const roll = rnd();
      const crown = w > minW * 1.15 ? (roll < 0.22 ? 'step' : roll < 0.36 ? 'deco' : roll < 0.44 ? 'pyramid' : null) : null;
      const spire = !crown && rnd() < 0.18;
      const dome = !crown && !spire && rnd() < 0.08;
      const tank = !crown && !spire && !dome && rnd() < 0.25;
      const fins = rnd() < 0.3;
      const glow = rnd() < neon ? ROOF_GLOWS[Math.floor(rnd() * ROOF_GLOWS.length)] : null;
      out.push({ x, w, h, crown, spire, dome, tank, fins, glow, tankAt: 15 + rnd() * 45 });
      x += w + rnd() * 3;
    }
    // easter eggs sit on fixed rooftops so they come round once a loop
    Object.entries(props || {}).forEach(([i, kind]) => {
      const b = out[i];
      if (b) Object.assign(b, { prop: kind, crown: null, spire: false, dome: false, tank: false });
    });
    return out;
  }, [seed, period, minW, maxW, minH, maxH, neon, gap, props]);
  return (
    <div className={`skyline ${className}`} aria-hidden="true">
      {Array.from({ length: copies }, (_, k) => (
        <React.Fragment key={k}>
          {gap && harbour && (
            <div className="harbour" style={{ left: (gap[0] + k * period) * u, width: (gap[1] - gap[0]) * u }}>
              <Harbour />
            </div>
          )}
          {blocks.map((b, i) => (
            <div
              key={i}
              className={`sky-bldg ${b.spire ? 'spire' : ''} ${b.dome ? 'dome' : ''} ${b.fins ? 'fins' : ''} ${b.crown ? `crown-${b.crown}` : ''}`}
              style={{ left: (b.x + k * period) * u, width: b.w * u, height: b.h * u, '--c': b.glow || '#ff4fd8' }}
            >
              {b.tank && <span className="tank" style={{ left: `${b.tankAt}%` }} />}
              {b.glow && <span className="roof-glow" />}
              {b.crown && b.crown !== 'pyramid' && <><span className="crown c1" /><span className="crown c2" /></>}
              {b.crown === 'deco' && <span className="crown needle" />}
              {b.crown === 'pyramid' && <span className="crown pyr" />}
              {b.prop === 'needle' && (
                // Sydney Tower
                <svg className="egg egg-needle" viewBox="0 0 30 120" preserveAspectRatio="none">
                  <path className="egg-ink" d="M13.6,120 L14.2,34 L15.8,34 L16.4,120 Z M14.5,34 V2 h1 V34 Z M6,34 Q6,24 15,22 Q24,24 24,34 L21,40 H9 Z" />
                  <path d="M7,30 H23" stroke="#ffe7a8" strokeWidth="1.2" />
                  <circle className="harbour-beacon" cx="15" cy="2" r="1.6" fill="#ff3b5c" />
                </svg>
              )}
              {b.prop === 'party' && (
                // rooftop party at the apartments: lights, music, nobody about
                <svg className="egg egg-party" viewBox="0 0 140 60">
                  {/* light beams off the mirror ball */}
                  <g className="party-beams">
                    <path d="M70,20 L24,60 H40 Z" fill="#ff4fd8" opacity="0.28" />
                    <path d="M70,20 L62,60 H78 Z" fill="#4fe3ff" opacity="0.24" />
                    <path d="M70,20 L100,60 H116 Z" fill="#ffe14f" opacity="0.24" />
                  </g>
                  {/* festoon lights between two poles */}
                  <path d="M6,60 V10 M134,60 V10" stroke="#8d89a0" strokeWidth="1.4" />
                  <path d="M6,11 Q38,24 70,13 Q102,24 134,11" fill="none" stroke="#3a3350" strokeWidth="0.7" />
                  {[[16, 15.4, '#ff4fd8'], [28, 18.2, '#4fe3ff'], [40, 19, '#ffe14f'], [52, 17.4, '#8dff6b'], [88, 17.4, '#ff4fd8'], [100, 19, '#4fe3ff'], [112, 18.2, '#ffe14f'], [124, 15.4, '#8dff6b']].map(([x, y, c], i) => (
                    <circle key={x} className={`party-bulb ${i % 2 ? 'is-odd' : ''}`} cx={x} cy={y} r="2" fill={c} />
                  ))}
                  {/* mirror ball */}
                  <path d="M70,13 V16" stroke="#8d89a0" strokeWidth="0.8" />
                  <circle cx="70" cy="21" r="5" fill="#d8d5e4" />
                  <path d="M65,21 H75 M66,18 H74 M66,24 H74 M70,16 V26 M67.4,16.6 V25.4 M72.6,16.6 V25.4" stroke="#8d89a0" strokeWidth="0.5" />
                  <circle className="party-glint" cx="68" cy="19" r="1.2" fill="#fff" />
                  {/* speakers and a DJ desk with a level meter */}
                  <rect x="34" y="40" width="12" height="20" rx="1" fill="#17151f" />
                  <circle cx="40" cy="46" r="2.6" fill="#3a3350" /><circle cx="40" cy="54" r="3.6" fill="#3a3350" />
                  <rect x="94" y="40" width="12" height="20" rx="1" fill="#17151f" />
                  <circle cx="100" cy="46" r="2.6" fill="#3a3350" /><circle cx="100" cy="54" r="3.6" fill="#3a3350" />
                  <rect x="50" y="44" width="40" height="16" rx="1.4" fill="#1a1433" stroke="#ff4fd8" strokeWidth="1" />
                  {[54, 60, 66, 72, 78, 84].map((x, i) => (
                    <rect key={x} className="party-bar" x={x} y="48" width="3.6" height="10" fill={i % 2 ? '#4fe3ff' : '#ff4fd8'} style={{ animationDelay: `${-i * 0.13}s` }} />
                  ))}
                  {/* balloons tied to the pole, a table under an umbrella */}
                  <g className="party-balloons">
                    <path d="M6,40 L11,28 M6,40 L17,31 M6,40 L20,38" stroke="#d8d5e4" strokeWidth="0.4" fill="none" />
                    <ellipse cx="11" cy="24" rx="3.6" ry="4.4" fill="#ff4fd8" />
                    <ellipse cx="18.6" cy="27.4" rx="3.4" ry="4.2" fill="#4fe3ff" />
                    <ellipse cx="22.4" cy="35" rx="3.2" ry="4" fill="#ffe14f" />
                  </g>
                  <path d="M120,60 V38" stroke="#d8d5e4" strokeWidth="1" />
                  <path d="M108,40 Q120,26 132,40 Z" fill="#ff7ab8" />
                  <rect x="113" y="50" width="14" height="1.6" fill="#f2f0fa" />
                </svg>
              )}
            </div>
          ))}
        </React.Fragment>
      ))}
    </div>
  );
}

// elevated monorail gliding through the mid-ground
function Monorail({ period, copies }) {
  const { u } = useContext(CityCtx);
  return (
    <div className="monorail" aria-hidden="true">
      {Array.from({ length: copies }, (_, k) => (
        <svg key={k} className="monorail-train" viewBox="0 0 300 26" style={{ left: k * period * u, '--span': `${period * u}px` }}>
          <path d="M6,20 Q0,20 4,12 L14,4 Q17,2 22,2 H278 Q283,2 286,4 L296,12 Q300,20 294,20 Z" fill="#f2f0fa" />
          <path d="M4,14 H296" stroke="#ff4fd8" strokeWidth="2.4" />
          <path d="M18,5 H92 V11 H12 Z M104,5 H196 V11 H104 Z M208,5 H282 L288,11 H208 Z" fill="#1a1433" />
          <path d="M26,5 V11 M44,5 V11 M62,5 V11 M80,5 V11 M122,5 V11 M140,5 V11 M158,5 V11 M176,5 V11 M226,5 V11 M244,5 V11 M262,5 V11" stroke="#ffe7a8" strokeWidth="6" opacity="0.75" />
          <path d="M98,2 V20 M202,2 V20" stroke="#8d89a0" strokeWidth="1" />
          <rect x="40" y="20" width="24" height="5" fill="#2a2638" />
          <rect x="236" y="20" width="24" height="5" fill="#2a2638" />
        </svg>
      ))}
    </div>
  );
}

// planes, a visitor, and the odd shooting star
function SkyLife() {
  return (
    <div className="sky-life" aria-hidden="true">
      <div className="clouds"><span /><span /><span /><span /></div>
      <span className="shooting-star" />
      <div className="plane"><i /><b /></div>
      <svg className="ufo" viewBox="0 0 60 60">
        <path className="ufo-beam" d="M22,22 L8,60 H52 L38,22 Z" fill="#8dff6b" />
        <ellipse cx="30" cy="20" rx="26" ry="6" fill="#2a2638" stroke="#b9a4ff" strokeWidth="1" />
        <path d="M18,17 Q30,2 42,17 Z" fill="#4fe3ff" opacity="0.8" />
        <circle className="ufo-light" cx="12" cy="20" r="1.6" fill="#ffe14f" />
        <circle className="ufo-light l2" cx="24" cy="23" r="1.6" fill="#ff4fd8" />
        <circle className="ufo-light" cx="36" cy="23" r="1.6" fill="#ffe14f" />
        <circle className="ufo-light l2" cx="48" cy="20" r="1.6" fill="#ff4fd8" />
      </svg>
    </div>
  );
}

function Stars() {
  const stars = useMemo(() => {
    const rnd = mulberry32(42);
    return Array.from({ length: 90 }, (_, i) => ({
      key: i,
      left: `${rnd() * 100}%`,
      top: `${rnd() * 55}%`,
      size: rnd() < 0.85 ? 2 : 3,
      delay: `${rnd() * 4}s`,
    }));
  }, []);
  return (
    <div className="stars" aria-hidden="true">
      {stars.map((s) => (
        <span key={s.key} style={{ left: s.left, top: s.top, width: s.size, height: s.size, animationDelay: s.delay }} />
      ))}
    </div>
  );
}

/* ---------- info cards ---------- */

function CardBody({ id, onNavigate }) {
  if (id === 'welcome') {
    return (
      <>
        <p className="card-kicker">Welcome to</p>
        <h3>{profile.name}</h3>
        <p>{profile.title} · {profile.location}</p>
        <p className="card-hint">Sit back and cruise the city. Hover any lit sign or building to learn more.</p>
      </>
    );
  }
  if (id.startsWith('skill-')) {
    const level = Number(id.slice(6));
    const cat = skills[level];
    return (
      <>
        <p className="card-kicker">Skill Institute · Level {level + 1}</p>
        <h3>{cat.category}</h3>
        <div className="card-tags" style={{ '--tag': cat.color }}>{cat.items.map((t) => <span key={t}>{t}</span>)}</div>
      </>
    );
  }
  return null;
}

/* ---------- news building ---------- */

const shortTitle = (t) => t.replace(/^Blog Post \d+:\s*/, '');
const headlineCrawl = blogPosts.map((p) => shortTitle(p.title).toUpperCase()).join('  ◆  ') + '  ◆  ';

// today's front page, pinned up in the display window and changing every few seconds
function FrontPage() {
  const [i, setI] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setI((n) => (n + 1) % blogPosts.length), 4500);
    return () => clearInterval(id);
  }, []);
  const post = blogPosts[i];
  return (
    <div className="front-page" aria-hidden="true">
      <span className="fp-mast">The Daily Blog</span>
      <span className="fp-date">{post.date}</span>
      <p key={post.id} className="fp-headline">{shortTitle(post.title)}</p>
      <span className="fp-lines" />
    </div>
  );
}

// a real clock on the facade, started at the visitor's local time
function NewsClock() {
  const [start] = useState(() => {
    const now = new Date();
    const m = now.getMinutes() + now.getSeconds() / 60;
    return { min: m * 6, hour: ((now.getHours() % 12) + m / 60) * 30 };
  });
  return (
    <div className="news-clock" aria-hidden="true">
      <span className="hand hour" style={{ '--start': `${start.hour}deg` }} />
      <span className="hand minute" style={{ '--start': `${start.min}deg` }} />
      <span className="pin" />
    </div>
  );
}


/* ---------- traffic: side-profile vehicles, drawn 204 wide with the road at y = 59 ---------- */

// Every vehicle shares one schema so a single renderer can draw them all:
//   body/glass/pillar  outline paths       wheels  [rear x, front x]      head  [x, y, w, h] of the headlamp
//   doors [x, x]       shut lines          belt    y of the shoulder crease
//   driver/mirror/tail [x, y] anchors      rear    x of the back bumper
//   fixed              a paint job that always goes with this body
//   weight             how often it turns up in traffic
const ARCH = 'A14,14 0 0 0';
const BOOTINK_LOGO = experience.find((job) => job.id === 'bootink').image;
const CAR_BODIES = {
  // boxy GT coupe with a tall wing and quad round tail lights
  gt: {
    weight: 3,
    body: `M28,47 L28,33 Q28,30 33,30 L58,29 L72,16 Q74,14 79,14 L116,14 Q121,14 124,17 L138,29 L168,31 Q176,32 177,38 L177,47 Q177,49 174,49 L160,49 ${ARCH} 132,49 L72,49 ${ARCH} 44,49 L31,49 Q28,49 28,47 Z`,
    glass: 'M70,29 L77,17 L116,17 L132,29 Z',
    pillar: 'M96,17 h3.4 v12 h-3.4 Z',
    doors: [76, 124],
    wheels: [58, 146],
    head: [166, 33, 10, 3],
    belt: 31,
    driver: [110, 23.5],
    mirror: [131, 28.4],
    tail: [30.5, 37],
    rear: 28,
    extras: (paint) => (
      <g>
        <rect x="33" y="21" width="2.4" height="9" style={{ fill: paint }} />
        <rect x="46" y="21" width="2.4" height="8.6" style={{ fill: paint }} />
        <path d="M25,19 L54,18 L54,21.4 L27,22.4 Z" style={{ fill: paint }} />
        <path d="M25,19 L54,18 L54,21.4 L27,22.4 Z" fill="#000" opacity="0.25" />
        <path d="M142,33.6 l5,-2.6 M146,34.4 l5,-2.6 M150,35.2 l5,-2.6" stroke="rgba(0,0,0,0.45)" strokeWidth="1.1" />
        <circle cx="30.5" cy="34.4" r="2" className="tail" />
        <circle cx="30.5" cy="39.6" r="2" className="tail" />
      </g>
    ),
  },
  // curvy grand tourer with a bubble roof and a tall rear wing
  tourer: {
    weight: 3,
    body: `M30,47 Q26,43 28,38 Q30,33 42,31 L64,29 Q74,16 92,15 Q108,14 118,18 L134,29 Q156,31 170,34 Q177,36 177,41 L176,47 Q175,49 171,49 L160,49 ${ARCH} 132,49 L72,49 ${ARCH} 44,49 L33,49 Q30,49 30,47 Z`,
    glass: 'M69,29 Q77,18 92,17 Q106,16 115,20 L129,29 Z',
    pillar: 'M100,16.6 h3.2 l1.6,12.4 h-3.2 Z',
    doors: [78, 126],
    wheels: [58, 146],
    head: [167, 35, 9, 2.8],
    belt: 32,
    driver: [111, 24],
    mirror: [127, 28.2],
    tail: [30, 36],
    rear: 29,
    extras: (paint) => (
      <g>
        {/* swept upright, then the wing blade across the top of it */}
        <path d="M36,21 L45,20.4 Q49,24 52,29.6 L43,30.4 Q39,26 36,21 Z" style={{ fill: paint }} />
        <path d="M36,21 L45,20.4 Q49,24 52,29.6 L43,30.4 Q39,26 36,21 Z" fill="#000" opacity="0.32" />
        <path d="M28,19 Q42,17.4 56,19 Q57.4,20 55.6,21 Q42,20 29.4,21.6 Q27.4,20.6 28,19 Z" style={{ fill: paint }} />
        <path d="M28.6,19.1 Q42,17.7 55.4,19.1" fill="none" stroke="#fff" strokeOpacity="0.45" strokeWidth="0.6" />
        <rect x="27" y="34.6" width="6" height="3" rx="1.5" className="tail" />
      </g>
    ),
  },
  // boxy off-roader: tall flat roof, upright screen, roof rails, spare wheel on the back
  gwagon: {
    weight: 2,
    body: `M30,47 L30,10 Q30,6 34,6 L128,6 Q132,6 133,9 L137,25 L170,27 Q175,28 175,33 L175,47 Q175,49 171,49 L160,49 ${ARCH} 132,49 L72,49 ${ARCH} 44,49 L34,49 Q30,49 30,47 Z`,
    glass: 'M35,10 H66 V24 H35 Z M72,10 H98 V24 H72 Z M104,10 H127.6 L131,24 H104 Z',
    pillar: 'M66,10 H72 V24 H66 Z',
    doors: [69, 101],
    wheels: [58, 146],
    head: [170, 29, 4, 4.6],
    belt: 27,
    driver: [116, 17],
    mirror: [134, 23.4],
    tail: [31.4, 29],
    rear: 30,
    extras: (paint) => (
      <g>
        <path d="M36,3.6 H126 M42,3.6 V6 M82,3.6 V6 M120,3.6 V6" style={{ stroke: paint }} strokeWidth="1.4" fill="none" />
        <path d="M36,3.6 H126" stroke="#000" strokeOpacity="0.25" strokeWidth="1.4" />
        <circle cx="27.6" cy="30" r="7.4" fill="#0b0814" />
        <circle cx="27.6" cy="30" r="3.8" style={{ fill: paint }} />
        <rect x="76" y="47.6" width="52" height="1.6" rx="0.6" fill="#2a2638" />
        <rect x="30.2" y="25" width="2.2" height="6.4" rx="0.8" className="tail" />
        <circle cx="173" cy="32" r="2.4" fill="#fff6d5" />
      </g>
    ),
  },
  // short, tall hot hatch with a roof spoiler
  hatch: {
    weight: 3,
    body: `M44,47 L44,24 Q44,16 52,15.6 L100,15 Q105,15 109,18 L126,29 L154,32 Q161,33 162,38 L162,47 Q162,49 159,49 L152,49 ${ARCH} 124,49 L84,49 ${ARCH} 56,49 L47,49 Q44,49 44,47 Z`,
    glass: 'M49,27 L51,18.4 Q52,17.4 55,17.4 L100,17 Q104,17 107,19.6 L120,29 L49,29 Z',
    pillar: 'M88,17 h3.4 v12 h-3.4 Z',
    doors: [84, 116],
    wheels: [70, 138],
    head: [154, 33.6, 7, 2.8],
    belt: 31.4,
    driver: [98, 24],
    mirror: [118, 28.4],
    tail: [45, 31],
    rear: 44,
    extras: (paint) => (
      <g>
        <path d="M40,15.6 L62,14.6 L62,17 L43,18.4 Z" style={{ fill: paint }} />
        <path d="M40,15.6 L62,14.6 L62,17 L43,18.4 Z" fill="#000" opacity="0.25" />
        <rect x="43.6" y="28" width="2.8" height="6.6" rx="1" className="tail" />
      </g>
    ),
  },
  // city cab: the coupe's shell without the wing, roof light on, checker band down the side
  taxi: {
    weight: 2,
    fixed: { paint: '#ffd21f', glow: '#ffe14f' },
    body: `M28,47 L28,33 Q28,30 33,30 L58,29 L72,16 Q74,14 79,14 L116,14 Q121,14 124,17 L138,29 L168,31 Q176,32 177,38 L177,47 Q177,49 174,49 L160,49 ${ARCH} 132,49 L72,49 ${ARCH} 44,49 L31,49 Q28,49 28,47 Z`,
    glass: 'M70,29 L77,17 L116,17 L132,29 Z',
    pillar: 'M96,17 h3.4 v12 h-3.4 Z',
    doors: [76, 124],
    wheels: [58, 146],
    head: [166, 33, 10, 3],
    belt: 31,
    driver: [110, 23.5],
    mirror: [131, 28.4],
    tail: [30.5, 37],
    rear: 28,
    extras: () => (
      <g>
        <rect className="taxi-light" x="88" y="8.6" width="20" height="5.6" rx="1.4" fill="#fff6c8" stroke="#17151f" strokeWidth="0.6" />
        <text className="car-text" x="98" y="13" textAnchor="middle" fontFamily="Arial, Helvetica, sans-serif" fontWeight="700" fontSize="4.4" fill="#17151f">TAXI</text>
        <path d="M44,38 H170" stroke="#17151f" strokeWidth="3.4" strokeDasharray="3.4 3.4" />
        <path d="M47.4,41.4 H170" stroke="#17151f" strokeWidth="3.4" strokeDasharray="3.4 3.4" />
        <rect x="27" y="34.6" width="6" height="3.4" rx="1.4" className="tail" />
      </g>
    ),
  },
  // ute with a couple of crates in the tray
  pickup: {
    weight: 2,
    body: `M22,47 L22,30 Q22,28 25,28 L84,28 L86,16 Q87,13 91,13 L124,13 Q128,13 131,16 L143,28 L174,30 Q183,31 184,37 L184,47 Q184,49 181,49 L170,49 ${ARCH} 142,49 L68,49 ${ARCH} 40,49 L25,49 Q22,49 22,47 Z`,
    glass: 'M90,28 L91.4,17 Q92,16 94,16 L123,16 Q126,16 128,18 L137,28 Z',
    pillar: 'M108,16 h3.2 v12 h-3.2 Z',
    doors: [88, 132],
    wheels: [54, 156],
    head: [175, 32, 8, 3],
    belt: 30.4,
    driver: [119, 23],
    mirror: [137, 27.4],
    tail: [23.4, 34],
    rear: 24,
    extras: () => (
      <g>
        <rect x="34" y="20" width="15" height="8" fill="#a8703f" stroke="#6b4329" strokeWidth="0.6" />
        <rect x="51" y="16.6" width="17" height="11.4" fill="#c98a4a" stroke="#6b4329" strokeWidth="0.6" />
        <path d="M51,22 H68 M59.5,16.6 V28 M34,24 H49" stroke="#6b4329" strokeWidth="0.5" />
        <path d="M26,28 V46" stroke="rgba(0,0,0,0.3)" strokeWidth="0.8" />
        <rect x="22.2" y="31" width="2.4" height="6" rx="0.8" className="tail" />
      </g>
    ),
  },
  // Bootink delivery van: plain white, logo on the side. A rare sight.
  van: {
    weight: 0.3,
    fixed: { paint: '#f7f5f2', glow: '#4fe3ff' },
    plain: true,
    body: `M22,47 L22,10 Q22,6 26,6 L134,6 Q139,6 142,10 L154,26 L176,29 Q183,30 184,36 L184,47 Q184,49 181,49 L170,49 ${ARCH} 142,49 L68,49 ${ARCH} 40,49 L25,49 Q22,49 22,47 Z`,
    glass: 'M128,11 H134 Q137,11 139,14 L148,26 H128 Z',
    doors: [124, 150],
    wheels: [54, 156],
    head: [176, 31, 7, 3],
    belt: 28,
    driver: [137, 20],
    mirror: [150, 24.6],
    tail: [23.4, 32],
    rear: 24,
    extras: () => (
      <g>
        {/* the real logo as a decal on the cargo side; multiply lets a white backing vanish into the paint */}
        <image className="car-text van-logo" href={BOOTINK_LOGO} x="30" y="11" width="86" height="20" preserveAspectRatio="xMidYMid meet" />
        <path d="M124,10 V46" stroke="rgba(0,0,0,0.22)" strokeWidth="0.8" />
        <rect x="22.2" y="28" width="2.4" height="8" rx="0.8" className="tail" />
      </g>
    ),
  },
  // route 400 city bus
  bus: {
    weight: 1,
    fixed: { paint: '#efe6ff', glow: '#4fe3ff' },
    plain: true,
    body: `M8,47 L8,8 Q8,3 13,3 L186,3 Q194,3 196,10 L198,30 L198,47 Q198,49 195,49 L176,49 ${ARCH} 148,49 L64,49 ${ARCH} 36,49 L11,49 Q8,49 8,47 Z`,
    glass: 'M14,10 H40 V25 H14 Z M44,10 H70 V25 H44 Z M74,10 H100 V25 H74 Z M104,10 H130 V25 H104 Z M134,10 H160 V25 H134 Z M168,10 H190.4 L194,25 H168 Z',
    doors: [132, 164],
    wheels: [50, 162],
    head: [192, 36, 5, 4],
    belt: 27.4,
    driver: [179, 17.6],
    mirror: [197, 21],
    tail: [9.4, 34],
    rear: 10,
    extras: () => (
      <g>
        <rect x="150" y="4.4" width="40" height="4.4" rx="0.8" fill="#0a0416" />
        <text className="car-text" x="170" y="8" textAnchor="middle" fontFamily="'VT323', ui-monospace, monospace" fontSize="4.6" fill="#ffb02e">400 CAREER AVE</text>
        <path d="M134,27.4 V46 M148,27.4 V46 M162,27.4 V46" stroke="rgba(0,0,0,0.3)" strokeWidth="0.7" />
        <rect x="8.2" y="30" width="2.4" height="8" rx="0.8" className="tail" />
      </g>
    ),
  },
};

const SPOKES = [0, 72, 144, 216, 288];

function Wheel({ cx, scale = 0.85 }) {
  // the tyre always touches the road at y = 59, whatever its size
  return (
    <g className="wheel" transform={`translate(${cx} ${59 - 13 * scale}) scale(${scale})`}>
      <circle r="13" fill="#0b0814" />
      <circle r="11.7" fill="none" stroke="#262038" strokeWidth="0.9" />
      <circle r="9.4" fill="#0f0c18" />
      {/* brake disc and a caliper in the car's glow colour; these stay still while the rim spins */}
      <circle r="6.8" fill="#5d596c" stroke="#8d89a0" strokeWidth="0.5" />
      <path d="M2.4,-7 A7.4,7.4 0 0 1 7.3,-1.4 L4.9,-0.8 A5,5 0 0 0 1.7,-4.6 Z" style={{ fill: 'var(--glow)' }} />
      <g className="rim">
        <circle r="9.2" fill="none" stroke="#e8e5f2" strokeWidth="1.3" />
        {SPOKES.map((a) => (
          <path key={a} d="M-1.7,-1.6 L-1,-8.7 L1,-8.7 L1.7,-1.6 Z" fill="#d8d5e4" transform={`rotate(${a})`} />
        ))}
        <circle r="2.6" fill="#a8a4ba" />
        <circle r="1.1" fill="#2a2638" />
      </g>
      <path d="M-10.6,-7.4 A13,13 0 0 1 3,-12.6" fill="none" stroke="rgba(255,255,255,0.22)" strokeWidth="0.9" strokeLinecap="round" />
    </g>
  );
}

// paint jobs the traffic draws from each time a car rolls back into view
const CAR_PAINTS = [
  // synthwave paint to match the street: pinks, violets, cyans and midnight blues
  { paint: '#ff4fd8', glow: '#4fe3ff' },
  { paint: '#7a3cff', glow: '#ff4fd8' },
  { paint: '#27c2d8', glow: '#ff4fd8' },
  { paint: '#140c33', glow: '#ff4fd8', dark: true },
  { paint: '#efe6ff', glow: '#ff4fd8' },
  { paint: '#ff7ab8', glow: '#ffe14f' },
  { paint: '#3a1f9e', glow: '#4fe3ff' },
  { paint: '#b98cff', glow: '#4fe3ff' },
  { paint: '#1d2a7a', glow: '#4fe3ff' },
  { paint: '#ffb07a', glow: '#ffe14f' },
  { paint: '#0d1030', glow: '#4fe3ff', dark: true },
];
const CAR_TYPES = Object.keys(CAR_BODIES);
const CAR_WEIGHT_SUM = CAR_TYPES.reduce((sum, t) => sum + CAR_BODIES[t].weight, 0);

function pickCarType() {
  let roll = Math.random() * CAR_WEIGHT_SUM;
  return CAR_TYPES.find((t) => (roll -= CAR_BODIES[t].weight) < 0) || CAR_TYPES[0];
}

function dressCar(el) {
  const type = pickCarType();
  const p = CAR_BODIES[type].fixed || CAR_PAINTS[Math.floor(Math.random() * CAR_PAINTS.length)];
  el.dataset.body = type;
  // each slot carries every body; show the one that was picked
  el.querySelectorAll('.car-body').forEach((g) => {
    g.style.display = g.dataset.type === type ? 'inline' : 'none';
  });
  el.style.setProperty('--paint', p.paint);
  el.style.setProperty('--glow', p.glow);
  // dark paint gets tinted glass and a faint rim so it still reads on the road
  el.style.setProperty('--glass', p.dark ? '#050309' : '#1a1433');
  el.style.setProperty('--glare', p.dark ? '0.25' : '1');
  el.style.setProperty('--rim', p.dark ? 'rgba(190, 170, 255, 0.35)' : 'none');
}

function Car({ className }) {
  return (
    <div className={`car ${className}`} data-body="gt">
      <svg viewBox="0 0 204 62" aria-hidden="true">
        {Object.entries(CAR_BODIES).map(([type, b]) => {
          const [hx, hy, hw, hh] = b.head;
          const [w1, w2] = b.wheels;
          const [d1, d2] = b.doors;
          const [dx, dy] = b.driver;
          const [mx, my] = b.mirror;
          const [tx, ty] = b.tail;
          const ws = b.wheelScale || 0.85;
          const mid = (w1 + w2) / 2;
          return (
            <g key={type} className="car-body" data-type={type}>
              {/* wet road: the car, its lamps and its underglow smeared on the tarmac */}
              <g className="car-reflect">
                <ellipse cx={mid} cy="64" rx={(w2 - w1) / 2 + 26} ry="3.4" style={{ fill: 'var(--paint)' }} opacity="0.2" />
                <ellipse className="underglow" cx={mid} cy="61" rx={(w2 - w1) / 2 + 30} ry="4.4" style={{ fill: 'var(--glow)' }} />
                <ellipse cx={hx + hw + 26} cy="63" rx="34" ry="3.6" fill="url(#car-halo)" opacity="0.7" />
                <ellipse cx={tx - 6} cy="63.4" rx="13" ry="2.4" fill="url(#car-tailglow)" />
              </g>
              {/* soft throw of the headlamps, and the red smear the tail lamps leave behind */}
              <ellipse className="beam" cx={hx + hw + 30} cy={hy + hh / 2 + 3} rx="38" ry="10" fill="url(#car-beam)" />
              <ellipse cx={tx - 12} cy={ty} rx="16" ry="3.4" fill="url(#car-tailglow)" opacity="0.8" />
              <g className="chassis">
                {/* exhaust */}
                <circle className="puff" cx={b.rear - 2} cy="47" r="1.8" />
                <circle className="puff puff-b" cx={b.rear - 2} cy="47" r="1.8" />
                <rect x={b.rear - 2.5} y="46" width="5" height="1.8" rx="0.9" fill="#c9c6d6" />
                {/* dark wheel wells behind the arches */}
                <circle cx={w1} cy={59 - 13 * ws} r={16.5 * ws} fill="#07050d" />
                <circle cx={w2} cy={59 - 13 * ws} r={16.5 * ws} fill="#07050d" />
                <path d={b.body} style={{ fill: 'var(--paint)' }} />
                <path d={b.body} fill="url(#car-shade)" style={{ stroke: 'var(--rim)' }} strokeWidth="0.8" />
                <clipPath id={`clip-${type}`}><path d={b.body} /></clipPath>
                <g clipPath={`url(#clip-${type})`}>
                  {/* gloss: a bright band under the shoulder crease, then the flank falling into shadow */}
                  <rect x="0" y={b.belt} width="204" height="0.9" fill="#fff" opacity="0.4" />
                  <rect x="0" y={b.belt + 0.9} width="204" height="4.2" fill="url(#car-gloss)" />
                  <rect x="0" y="42.4" width="204" height="10" fill="#000" opacity="0.3" />
                </g>
                <path d={b.body} fill="none" stroke="url(#car-edge)" strokeWidth="1.1" />
                <path d={b.glass} style={{ fill: 'var(--glass)' }} />
                {/* cabin: dash glow, seats and the driver */}
                <clipPath id={`glass-${type}`}><path d={b.glass} /></clipPath>
                <g clipPath={`url(#glass-${type})`}>
                  <ellipse cx={dx + 16} cy={dy + 5} rx="14" ry="6" style={{ fill: 'var(--glow)' }} opacity="0.3" />
                  <rect x={dx - 9} y={dy - 4} width="3.4" height="14" rx="1.5" fill="#05030a" opacity="0.8" />
                  <circle cx={dx} cy={dy - 1.4} r="3.1" fill="#05030a" opacity="0.85" />
                  <path d={`M${dx - 4.5},${dy + 9} Q${dx - 4.5},${dy + 2.2} ${dx},${dy + 2.2} Q${dx + 4.5},${dy + 2.2} ${dx + 5},${dy + 9} Z`} fill="#05030a" opacity="0.85" />
                  <path d={`M${dx + 9},${dy + 6} l4,-4.6`} stroke="#05030a" strokeWidth="1.3" strokeLinecap="round" opacity="0.85" />
                </g>
                <path d={b.glass} fill="url(#car-glass)" style={{ opacity: 'var(--glare)' }} />
                <path d={b.glass} fill="none" stroke="rgba(225,230,255,0.45)" strokeWidth="0.6" />
                {b.pillar && <path d={b.pillar} style={{ fill: 'var(--paint)' }} />}
                {!b.plain && (
                  <>
                    <path d={`M${d1},${b.belt} L${d1},46 M${d2},${b.belt} L${d2},46`} stroke="rgba(0,0,0,0.35)" strokeWidth="0.8" />
                    <rect x={d2 - 13} y={b.belt + 3} width="6.4" height="1.5" rx="0.75" fill="rgba(235,235,250,0.55)" />
                    <rect x={d2 - 13} y={b.belt + 4} width="6.4" height="0.6" rx="0.3" fill="rgba(0,0,0,0.45)" />
                  </>
                )}
                {(mx > 0) && (
                  <>
                    <path d={`M${mx},${my} l-5,-0.4 q-1.5,-2.4 1.5,-2.8 l3.2,0.4 Z`} style={{ fill: 'var(--paint)' }} />
                    <path d={`M${mx},${my} l-5,-0.4 q-1.5,-2.4 1.5,-2.8 l3.2,0.4 Z`} fill="#000" opacity="0.3" />
                  </>
                )}
                {b.extras('var(--paint)')}
                {/* lamps: warm halo up front with a white DRL, red glow at the back, amber side marker */}
                <circle cx={hx + hw - 1} cy={hy + hh / 2} r="9" fill="url(#car-halo)" />
                <rect x={hx} y={hy} width={hw} height={hh} rx="1" fill="#fff6d5" />
                <rect x={hx} y={hy + hh + 0.8} width={hw * 0.7} height="0.8" rx="0.4" fill="#fff" opacity="0.9" />
                <rect x={hx - 7} y={hy + hh + 2.4} width="3" height="1.3" rx="0.6" fill="#ffb02e" />
                <circle cx={tx} cy={ty} r="8" fill="url(#car-tailglow)" />
              </g>
              <Wheel cx={w1} scale={ws} />
              <Wheel cx={w2} scale={ws} />
            </g>
          );
        })}
      </svg>
    </div>
  );
}

/* ---------- Career Ave tower details ---------- */

// [x, drip length, ink colour]: purple ink running off the roof
const INK_DRIPS = [
  [2.5, 3.2, '#7b2ff7'],
  [6, 5.4, '#7b2ff7'],
  [9.5, 2.2, '#7b2ff7'],
  [14, 6.6, '#7b2ff7'],
  [18.5, 3.4, '#7b2ff7'],
  [23, 4.8, '#7b2ff7'],
  [27, 2.6, '#7b2ff7'],
  [31, 5.8, '#7b2ff7'],
];

function InkDrips() {
  // each ink owns a stretch of the roofline, split halfway between neighbouring drips
  return (
    <svg className="ink-drips" viewBox="0 0 34 9" preserveAspectRatio="none" aria-hidden="true">
      {INK_DRIPS.map(([x, len, color], i) => {
        const x0 = i === 0 ? 0 : (INK_DRIPS[i - 1][0] + x) / 2;
        const x1 = i === INK_DRIPS.length - 1 ? 34 : (x + INK_DRIPS[i + 1][0]) / 2;
        const d = `M${x0},0 H${x1} V1.4 H${x + 0.7} V${1.4 + len} a0.7,0.7 0 0 1 -1.4,0 V1.4 H${x0} Z`;
        return (
          <g key={x}>
            <path d={d} fill={color} />
            <path d={`M${x - 0.35},1.8 V${1.2 + len}`} stroke="rgba(255,255,255,0.35)" strokeWidth="0.22" strokeLinecap="round" />
          </g>
        );
      })}
      <path d="M0,0.4 H34" stroke="rgba(255,255,255,0.25)" strokeWidth="0.3" />
    </svg>
  );
}

function SideLadder({ h }) {
  const rungs = [];
  for (let y = 1.2; y < h; y += 2.2) rungs.push(<line key={y} x1="0.5" y1={y} x2="2.9" y2={y} />);
  return (
    <svg className="side-ladder" viewBox={`0 0 3.4 ${h}`} style={{ height: `calc(var(--u) * ${h})` }} aria-hidden="true">
      <g stroke="#ffcf6a" strokeWidth="0.35" strokeLinecap="round">
        <line x1="0.5" y1="0" x2="0.5" y2={h} />
        <line x1="2.9" y1="0" x2="2.9" y2={h} />
        {rungs}
      </g>
    </svg>
  );
}

/* ---------- The Gabriel: posters, marquee, premiere ---------- */

function PosterArt({ kind }) {
  if (kind === 'rocket') {
    return (
      <svg className="poster-art" viewBox="0 0 40 20" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
        <rect width="40" height="20" fill="#2a0f3a" />
        {[[4, 3], [9, 7], [31, 4], [36, 9], [27, 2], [13, 2]].map(([cx, cy]) => <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="0.35" fill="#fff" />)}
        <circle cx="16" cy="16" r="2.6" fill="#c9bde6" opacity="0.5" />
        <circle cx="24" cy="16.5" r="2.2" fill="#c9bde6" opacity="0.45" />
        <rect x="12" y="15.5" width="16" height="4.5" fill="#3a2470" />
        <path d="M12,15.5 L20,12.8 L28,15.5 Z" fill="#4a2f8c" />
        <path d="M14,20 V17 H26 V20" fill="none" stroke="#1d1240" strokeWidth="0.4" />
        <path d="M19,11 L20,14.5 L21,11 Z" fill="#ffb02e" />
        <path d="M20,1.5 C22.4,4 22.4,8 21.4,11 L18.6,11 C17.6,8 17.6,4 20,1.5 Z" fill="#f4f1ff" />
        <path d="M18.6,9 L17.2,11.4 L18.8,11 Z M21.4,9 L22.8,11.4 L21.2,11 Z" fill="#ff4fd8" />
        <circle cx="20" cy="5.6" r="0.9" fill="#4fe3ff" />
      </svg>
    );
  }
  return (
    <svg className="poster-art" viewBox="0 0 40 20" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <rect width="40" height="20" fill="#0d1640" />
      <circle cx="33" cy="4.5" r="2" fill="#fff6d8" opacity="0.9" />
      <g fill="#1f2d66">
        <rect x="2" y="10" width="6" height="10" />
        <rect x="9" y="6" width="7" height="14" />
        <rect x="17" y="9" width="5" height="11" />
        <rect x="23" y="3" width="7" height="17" />
        <rect x="31" y="11" width="7" height="9" />
      </g>
      <g fill="#ffd77a" opacity="0.35">
        <rect x="10.5" y="8" width="1.2" height="1.2" />
        <rect x="13" y="12" width="1.2" height="1.2" />
        <rect x="3.5" y="13" width="1.2" height="1.2" />
        <rect x="33" y="14" width="1.2" height="1.2" />
      </g>
      <rect className="lone-window" x="25.5" y="6.5" width="1.8" height="1.8" fill="#ffe14f" />
    </svg>
  );
}

// the marquee letterboard flips between a few lines
function MarqueeBoard() {
  const [i, setI] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setI((n) => (n + 1) % theater.marquee.length), 4200);
    return () => clearInterval(id);
  }, []);
  const line = theater.marquee[i];
  return (
    <div className="marquee-board">
      <div key={i} className="marquee-line">
        <small>{line.small}</small>
        <strong>{line.big}</strong>
        <span>{line.sub}</span>
      </div>
    </div>
  );
}

// velvet rope between two brass stanchions
function VelvetRope({ x1, x2 }) {
  const { u } = useContext(CityCtx);
  return (
    <div className="velvet-rope" style={{ left: x1 * u, width: (x2 - x1) * u, bottom: (GROUND_U - 2.4) * u }} aria-hidden="true">
      <span className="stanchion" />
      <span className="rope" />
      <span className="stanchion" />
    </div>
  );
}

/* ---------- Gabidon FM contact icons ---------- */

const CONTACT_ICONS = { Email: FaEnvelope, LinkedIn: FaLinkedin, GitHub: FaGithub, Leetcode: SiLeetcode };

// the ways to reach me burst out of the observation deck when the tower is hovered or tapped
function ContactBurst() {
  const ctx = useContext(CityCtx);
  const ghost = useContext(GhostCtx);
  const open = ctx.activeId === 'contact';
  return (
    <div className={`fm-burst ${open ? 'is-open' : ''}`}>
      {contact.map((c, i) => {
        const Icon = CONTACT_ICONS[c.label];
        const angle = (-160 + (i * 140) / (contact.length - 1)) * (Math.PI / 180);
        return (
          <a
            key={c.label}
            href={c.href}
            target="_blank"
            rel="noopener noreferrer"
            className="fm-icon"
            aria-label={`${c.label}: ${c.value}`}
            tabIndex={open && !ghost ? 0 : -1}
            style={{ '--dx': Math.cos(angle).toFixed(3), '--dy': Math.sin(angle).toFixed(3), '--i': i }}
            onClick={(e) => e.stopPropagation()}
          >
            <Icon aria-hidden="true" />
            <span className="fm-icon-label">{c.label}</span>
          </a>
        );
      })}
    </div>
  );
}

/* ---------- Bootink: still being built ---------- */

function Construction() {
  // drawn in tenths of a u; the tower is 340 wide and its roof is at y = 320
  return (
    <svg className="construction" viewBox="0 0 440 920" aria-hidden="true">
      {/* builder's hoist up the side of the tower: lattice mast tied back to the wall, cage riding it */}
      <g className="crane" fill="none" stroke="#ffd21f" strokeWidth="3" strokeLinejoin="round">
        <path d="M352,920 V296 M368,920 V296 M346,296 H374" />
        <path d="M352,900 L368,870 L352,840 L368,810 L352,780 L368,750 L352,720 L368,690 L352,660 L368,630 L352,600 L368,570 L352,540 L368,510 L352,480 L368,450 L352,420 L368,390 L352,360 L368,330 L352,300" strokeWidth="1.6" />
        <path d="M340,360 H352 M340,500 H352 M340,640 H352 M340,780 H352" strokeWidth="2" />
      </g>
      <circle className="crane-beacon" cx="360" cy="290" r="4" fill="#ff3b5c" />
      {/* the cage, carrying drums of ink up to the roof and back */}
      <g className="crane-load">
        <rect x="342" y="856" width="36" height="40" fill="#1a1433" opacity="0.55" />
        <rect x="342" y="856" width="36" height="40" fill="none" stroke="#ffd21f" strokeWidth="2.4" />
        <path d="M342,872 H378 M354,856 V896 M366,856 V896" stroke="#ffd21f" strokeWidth="1" />
        <rect x="346" y="880" width="9" height="14" rx="2" fill="#ff9a4f" />
        <rect x="356" y="880" width="9" height="14" rx="2" fill="#7a3cff" />
        <rect x="366" y="880" width="9" height="14" rx="2" fill="#ff4fd8" />
        <circle className="site-lamp" cx="360" cy="852" r="3" fill="#ffb02e" />
      </g>

      {/* swing stage hanging off the roof */}
      <path d="M52,320 V596 M148,320 V596" stroke="#d8d5e4" strokeWidth="1.2" />
      <g className="swing-stage">
        <rect x="44" y="620" width="112" height="7" fill="#ffd21f" />
        <path d="M46,598 H154 M46,609 H154" stroke="#ffd21f" strokeWidth="2.4" />
        <path d="M46,598 V620 M82,598 V620 M118,598 V620 M154,598 V620" stroke="#ffd21f" strokeWidth="2.4" />
        <rect x="60" y="608" width="10" height="12" rx="1.5" fill="#7a3cff" />
        <rect x="74" y="610" width="9" height="10" rx="1.5" fill="#ff4fd8" />
        <path d="M128,620 V604 h14 V620" fill="#3a3350" stroke="#8d89a0" strokeWidth="1" />
        <circle className="site-spark" cx="150" cy="590" r="4" fill="#fff6c8" />
      </g>

      {/* barricade, cones and a site notice on the pavement */}
      <g>
        <rect x="236" y="884" width="92" height="14" fill="url(#site-stripe)" stroke="#17151f" strokeWidth="1" />
        <rect x="236" y="903" width="92" height="6" fill="url(#site-stripe)" stroke="#17151f" strokeWidth="1" />
        <path d="M244,884 V920 M320,884 V920" stroke="#d8d5e4" strokeWidth="3" />
        <circle className="site-lamp" cx="244" cy="879" r="4.5" fill="#ffb02e" />
        <circle className="site-lamp is-odd" cx="320" cy="879" r="4.5" fill="#ffb02e" />
        {[222, 338].map((x) => (
          <g key={x}>
            <path d={`M${x - 6},920 L${x - 1.6},896 h3.2 L${x + 6},920 Z`} fill="#ff7a1a" />
            <path d={`M${x - 3.6},907 h7.2 l0.8,4.4 h-8.8 Z`} fill="#fff" />
            <rect x={x - 8} y="918" width="16" height="2.6" fill="#ff7a1a" />
          </g>
        ))}
      </g>
      <defs>
        <pattern id="site-stripe" width="16" height="16" patternUnits="userSpaceOnUse" patternTransform="rotate(-45)">
          <rect width="16" height="16" fill="#ffd21f" />
          <rect width="8" height="16" fill="#17151f" />
        </pattern>
      </defs>
    </svg>
  );
}

/* ---------- Sunswift: glass tower that runs on its own solar skin ---------- */

// two-storey planted terrace cut into the tower: trees, festoon lights, a lounge behind glass
const TERRACE_TREES = [
  // [x, trunk top, canopy radius]
  [22, 30, 11],
  [50, 36, 8],
  [268, 34, 9],
  [295, 28, 11.5],
];
const TERRACE_BULBS = [0.1, 0.22, 0.34, 0.46, 0.58, 0.7, 0.82, 0.94];

function SkyTerrace() {
  return (
    <svg className="sx-garden" viewBox="0 0 316 64" preserveAspectRatio="none">
      <defs>
        <linearGradient id="terrace-back" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#0a1428" />
          <stop offset="1" stopColor="#1d2f52" />
        </linearGradient>
        <linearGradient id="terrace-warm" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff0c4" />
          <stop offset="1" stopColor="#ffb866" />
        </linearGradient>
        <radialGradient id="terrace-leaf" cx="0.35" cy="0.3" r="0.8">
          <stop offset="0" stopColor="#8fe89f" />
          <stop offset="0.55" stopColor="#3fae62" />
          <stop offset="1" stopColor="#1d6b3e" />
        </radialGradient>
      </defs>
      <rect width="316" height="64" fill="url(#terrace-back)" />
      {/* lounge behind full-height glass at the back of the terrace */}
      <rect x="96" y="18" width="124" height="40" fill="url(#terrace-warm)" />
      <path d="M127,18 V58 M158,18 V58 M189,18 V58 M96,30 H220" stroke="#16264a" strokeWidth="1.4" />
      <g fill="#16264a">
        <rect x="104" y="46" width="20" height="5" rx="2" />
        <rect x="102" y="42" width="4" height="12" rx="1.5" />
        <rect x="131" y="49" width="10" height="1.6" />
        <rect x="135" y="50" width="2" height="8" />
        <path d="M204,34 q4,-6 8,0 l-2.6,0 l0,24 l-2.8,0 l0,-24 Z" />
      </g>
      {/* ceiling slab with downlights washing the walls */}
      <rect width="316" height="6" fill="#060d1c" />
      {[40, 88, 228, 276].map((x) => (
        <g key={x}>
          <path d={`M${x},6 L${x - 16},58 L${x + 16},58 Z`} fill="#ffe2a6" opacity="0.13" />
          <rect x={x - 2.5} y="5" width="5" height="1.6" rx="0.8" fill="#fff3cf" />
        </g>
      ))}
      {/* columns */}
      <rect x="76" y="6" width="5" height="52" fill="#c9d6e6" />
      <rect x="235" y="6" width="5" height="52" fill="#c9d6e6" />
      <rect x="79.4" y="6" width="1.6" height="52" fill="#7f8ea6" />
      <rect x="238.4" y="6" width="1.6" height="52" fill="#7f8ea6" />
      {/* festoon lights strung between the columns */}
      <path d="M81,10 Q158,24 235,10" fill="none" stroke="#3a3350" strokeWidth="0.6" />
      {TERRACE_BULBS.map((t, i) => {
        const x = 81 + 154 * t;
        const y = 10 + 28 * t * (1 - t);
        return <circle key={i} className={`sx-bulb ${i % 2 ? 'is-odd' : ''}`} cx={x} cy={y + 1.2} r="1.5" fill="#ffe7a8" />;
      })}
      {/* timber deck and planters */}
      <rect y="58" width="316" height="6" fill="#8a5a3a" />
      <path d="M0,60 H316 M0,62 H316" stroke="#6b4329" strokeWidth="0.4" />
      <rect x="4" y="50" width="66" height="8" rx="1" fill="#39435c" />
      <rect x="246" y="50" width="66" height="8" rx="1" fill="#39435c" />
      <rect x="4" y="50" width="66" height="1.4" fill="#5d6a88" />
      <rect x="246" y="50" width="66" height="1.4" fill="#5d6a88" />
      {TERRACE_TREES.map(([x, top, r]) => (
        <g key={x}>
          <path d={`M${x - 1.2},51 L${x - 0.7},${top} L${x + 0.7},${top} L${x + 1.2},51 Z`} fill="#5a3d2a" />
          <circle cx={x - r * 0.55} cy={top + 1} r={r * 0.62} fill="#2a8a4f" />
          <circle cx={x + r * 0.6} cy={top} r={r * 0.68} fill="#2f9656" />
          <circle cx={x} cy={top - r * 0.45} r={r} fill="url(#terrace-leaf)" />
        </g>
      ))}
      <g fill="#46b96a">
        <ellipse cx="12" cy="49.6" rx="6" ry="3.4" />
        <ellipse cx="36" cy="49.4" rx="7" ry="3.8" />
        <ellipse cx="63" cy="49.8" rx="5.4" ry="3" />
        <ellipse cx="254" cy="49.8" rx="5.6" ry="3.2" />
        <ellipse cx="281" cy="49.4" rx="7" ry="3.8" />
        <ellipse cx="306" cy="49.8" rx="5" ry="3" />
      </g>
      <g fill="#ff8fc7">
        <circle cx="33" cy="47.4" r="1" /><circle cx="39" cy="48.4" r="0.9" /><circle cx="279" cy="47.6" r="1" /><circle cx="285" cy="48.6" r="0.9" />
      </g>
      {/* shadow under the slab, then the glass balustrade at the edge */}
      <rect y="6" width="316" height="7" fill="#040814" opacity="0.5" />
      <rect y="48" width="316" height="16" fill="#a8e6ff" opacity="0.14" />
      <path d="M0,48 H316" stroke="#e6faff" strokeWidth="1.1" />
      <path d="M26,48 V64 M79,48 V64 M132,48 V64 M184,48 V64 M237,48 V64 M290,48 V64" stroke="#e6faff" strokeWidth="0.6" opacity="0.7" />
    </svg>
  );
}

function SolarFacade() {
  return (
    <div className="solar" aria-hidden="true">
      <div className="sx-glass" />
      <SkyTerrace />
      <div className="sx-lobby" />
    </div>
  );
}

// the solar race car, parked on charge out front
function SolarCar() {
  return (
    <svg className="solar-car" viewBox="0 0 134 34" aria-hidden="true">
      <ellipse cx="60" cy="29.5" rx="58" ry="3" fill="#4fe3ff" opacity="0.35" />
      <circle cx="26" cy="25" r="5" fill="#0b0814" />
      <circle cx="96" cy="25" r="5" fill="#0b0814" />
      <path d="M3,24 Q6,17 30,13.4 Q60,8.6 92,12 Q113,15 117.5,22 Q118.5,27 112,27 L9,27 Q3,27 3,24 Z" fill="#f2f6fb" />
      <path d="M3,24 Q6,17 30,13.4 Q60,8.6 92,12 Q113,15 117.5,22 Q118.5,27 112,27 L9,27 Q3,27 3,24 Z" fill="url(#car-shade)" />
      <path d="M6,22.6 H116" stroke="#4fe3ff" strokeWidth="1.3" />
      <path d="M14,17.6 Q32,13.6 50,11.6 L52,14.2 Q34,16.4 18,19.6 Z M74,10.6 Q90,11.4 104,15 L100,17 Q88,14 75,13.4 Z" fill="#102a66" stroke="#7fc4ff" strokeWidth="0.4" />
      <path d="M22,16.4 l2,2.4 M30,14.8 l2,2.6 M38,13.4 l2,2.6 M46,12.2 l2,2.4 M82,11.2 l-1,2.6 M90,12.2 l-1.4,2.8 M97,13.6 l-1.6,2.8" stroke="#7fc4ff" strokeWidth="0.35" />
      <path d="M52,11.4 Q62,2.6 74,10.6 L73,13 Q62,11 53,13.6 Z" fill="#1a3a5c" stroke="#bfefff" strokeWidth="0.5" />
      <path d="M56,9.4 Q62,5 69,8.6" fill="none" stroke="#fff" strokeOpacity="0.6" strokeWidth="0.6" />
      <path d="M19,27 Q19,19.4 26,19.4 Q33,19.4 33,27 Z M89,27 Q89,19.4 96,19.4 Q103,19.4 103,27 Z" fill="#dfe6ee" />
      <rect x="113.5" y="20" width="3.4" height="1.6" rx="0.8" fill="#fff6d5" />
      {/* charging post */}
      <path className="solar-cable" d="M126,15 Q121,27 112,21.5" fill="none" stroke="#4fe3ff" strokeWidth="0.9" strokeLinecap="round" />
      <rect x="124" y="6" width="6" height="26" rx="1.4" fill="#e6ecf4" />
      <rect x="125.2" y="8.4" width="3.6" height="5" rx="0.6" fill="#0b1f4d" />
      <rect className="solar-led" x="125.2" y="15.4" width="3.6" height="1.2" rx="0.6" fill="#8dff6b" />
    </svg>
  );
}

/* ---------- Mercury: the real warehouse unit, with the bus stop out front ---------- */

function MercuryFacade() {
  return (
    <div className="mercury" aria-hidden="true">
      <div className="mx-cladding" />
      <div className="mx-joints" />
      <i className="mx-window" style={{ left: 'calc(var(--u) * 19.2)' }} />
      <i className="mx-window" style={{ left: 'calc(var(--u) * 23.2)' }} />
      <i className="mx-window mx-unit" style={{ left: 'calc(var(--u) * 29)' }}>1</i>
      {/* glass office box hanging over the entry */}
      <div className="mx-canopy" />
      <div className="mx-office" />
      <div className="mx-entry" />
      {/* roller door, cracked open with the workshop lit behind it */}
      <div className="mx-flood" />
      <div className="mx-roller"><span /></div>
      <i className="mx-hazard" />
      <i className="mx-keypad" />
      <i className="mx-bollard" style={{ left: 'calc(var(--u) * 3.4)' }} />
      <i className="mx-bollard" style={{ left: 'calc(var(--u) * 10.4)' }} />
      <i className="mx-bollard" style={{ left: 'calc(var(--u) * 25.2)' }} />
      <div className="mx-fence" />
    </div>
  );
}

const BUS_ROUTES = [
  ['400', 'Downtown', '3'],
  ['420', 'Career Ave', '6'],
  ['400', 'Skill St', '16'],
  ['420', 'Broadcast Hl', '17'],
];

function BusStop() {
  return (
    <svg className="bus-stop" viewBox="18 0 26 120" aria-hidden="true">
      {/* e-paper timetable on its own steel post */}
      <rect x="29" y="0" width="3" height="120" fill="#b9bfd0" />
      <path d="M19,12 Q30.5,8 42,12 L42,102 Q30.5,106 19,102 Z" fill="#1c8fe0" />
      <path d="M19,12 Q30.5,8 42,12 L42,26 L19,26 Z" fill="#2aa4f4" />
      <circle cx="30.5" cy="18" r="4.4" fill="none" stroke="#fff" strokeWidth="1.1" />
      <text x="30.5" y="20.3" textAnchor="middle" fontFamily="Arial, Helvetica, sans-serif" fontWeight="700" fontSize="6.4" fill="#fff">B</text>
      <rect className="bus-paper" x="20.5" y="26" width="20" height="64" fill="#e9ecee" />
      <rect x="20.5" y="26" width="20" height="5" fill="#3d4450" />
      <text x="21.6" y="29.5" fontFamily="Arial, Helvetica, sans-serif" fontWeight="700" fontSize="2.1" fill="#fff">Mercury Innov.</text>
      <text x="21.6" y="35.8" fontFamily="Arial, Helvetica, sans-serif" fontWeight="700" fontSize="2.3" fill="#1a1626">gabriel.city/info</text>
      <rect x="21.6" y="38.2" width="17.8" height="1.4" fill="#3d4450" />
      {BUS_ROUTES.map(([route, stop, mins], i) => (
        <g key={i} fontFamily="Arial, Helvetica, sans-serif" fill="#1a1626">
          <text x="21.6" y={45.6 + i * 7.2} fontWeight="700" fontSize="3.6">{route}</text>
          <text x="29.2" y={43.6 + i * 7.2} fontSize="1.9">{stop}</text>
          <text x="29.2" y={46 + i * 7.2} fontSize="1.7" fill="#5b6270">{mins} min</text>
          <rect x="21.6" y={47.2 + i * 7.2} width="17.8" height="0.3" fill="#9aa1ad" />
        </g>
      ))}
      <rect x="21.6" y="72" width="17.8" height="1.2" fill="#3d4450" />
      {['400', '400', '420', '420'].map((r, i) => (
        <text key={i} x={21.6 + i * 4.7} y="78" fontFamily="Arial, Helvetica, sans-serif" fontWeight="700" fontSize="2.2" fill="#1a1626">{r}</text>
      ))}
      <rect x="21.6" y="80" width="17.8" height="0.3" fill="#9aa1ad" />
      <rect x="21.6" y="83" width="12" height="0.6" fill="#9aa1ad" />
      <rect x="21.6" y="85" width="15" height="0.6" fill="#9aa1ad" />
      <path d="M19,90 L42,90 L42,102 Q30.5,106 19,102 Z" fill="#1c8fe0" />
      <rect x="22" y="94" width="3" height="3" rx="0.5" fill="#fff" opacity="0.9" />
      <rect x="27" y="94.6" width="12" height="0.7" fill="#fff" opacity="0.8" />
      <rect x="27" y="96.4" width="9" height="0.7" fill="#fff" opacity="0.6" />
    </svg>
  );
}

/* ---------- chrome diner at the foot of the antenna tower ---------- */

function Diner({ x }) {
  const { u } = useContext(CityCtx);
  return (
    <div className="diner" style={{ left: x * u, bottom: GROUND_U * u, width: 20 * u, height: 17 * u }} aria-hidden="true">
      {/* covered patio off the side of the diner */}
      <svg className="diner-patio" viewBox="0 0 146 100" preserveAspectRatio="none">
        <defs>
          <pattern id="patio-awning" width="14.6" height="10" patternUnits="userSpaceOnUse">
            <rect width="7.3" height="10" fill="#e0304c" />
            <rect x="7.3" width="7.3" height="10" fill="#f6f8ff" />
          </pattern>
          <pattern id="patio-check" width="20" height="10" patternUnits="userSpaceOnUse">
            <rect width="20" height="10" fill="#f2f0fa" />
            <rect width="10" height="5" fill="#17151f" />
            <rect x="10" y="5" width="10" height="5" fill="#17151f" />
          </pattern>
          <linearGradient id="patio-chrome" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#7c84a4" />
            <stop offset="0.5" stopColor="#f6f8ff" />
            <stop offset="1" stopColor="#8d95b3" />
          </linearGradient>
        </defs>
        {/* warm light under the awning */}
        <path d="M0,20 H146 V90 H0 Z" fill="#ffcf8a" opacity="0.12" />
        {/* posts, then the striped awning with a scalloped edge */}
        <rect x="1" y="16" width="3" height="74" fill="url(#patio-chrome)" />
        <rect x="71.5" y="16" width="3" height="74" fill="url(#patio-chrome)" />
        <path d="M0,6 H146 V18 q-7.3,7 -14.6,0 q-7.3,7 -14.6,0 q-7.3,7 -14.6,0 q-7.3,7 -14.6,0 q-7.3,7 -14.6,0 q-7.3,7 -14.6,0 q-7.3,7 -14.6,0 q-7.3,7 -14.6,0 q-7.3,7 -14.6,0 q-7.3,7 -14.6,0 Z" fill="url(#patio-awning)" />
        <rect x="0" y="3" width="146" height="3.4" rx="1.2" fill="url(#patio-chrome)" />
        <path d="M0,7.4 H146" stroke="#ff4fd8" strokeWidth="1.2" className="patio-neon" />
        {/* festoon bulbs */}
        <path d="M4,26 Q38,34 73,26 Q108,34 146,26" fill="none" stroke="#3a3350" strokeWidth="0.5" />
        {[14, 28, 42, 56, 70, 84, 98, 112, 126, 140].map((x, i) => (
          <circle key={x} className={`sx-bulb ${i % 2 ? 'is-odd' : ''}`} cx={x} cy={i % 5 === 2 ? 30.4 : i % 5 === 0 || i % 5 === 4 ? 28.2 : 30} r="1.5" fill="#ffe7a8" />
        ))}
        {/* two tables, chrome stools with red seats */}
        {[20, 94].map((tx) => (
          <g key={tx}>
            <rect x={tx - 16} y="72" width="2.6" height="17" fill="url(#patio-chrome)" />
            <rect x={tx - 21.2} y="67" width="13" height="5.4" rx="2.7" fill="#e0304c" />
            <rect x={tx + 43.4} y="72" width="2.6" height="17" fill="url(#patio-chrome)" />
            <rect x={tx + 38.2} y="67" width="13" height="5.4" rx="2.7" fill="#e0304c" />
            <rect x={tx + 13.5} y="61" width="3" height="27" fill="url(#patio-chrome)" />
            <rect x={tx + 7} y="87" width="16" height="3" rx="1.2" fill="#8d95b3" />
            <rect x={tx} y="57.6" width="30" height="3.6" rx="1.6" fill="#f6f8ff" />
            <rect x={tx} y="60.2" width="30" height="1" fill="#e0304c" />
          </g>
        ))}
        {/* on the tables: a milkshake and sauce bottles; coffee and a napkin holder */}
        <path d="M27,48 h6 l-1,9.6 h-4 Z" fill="#ffb3dd" />
        <path d="M27,48 h6" stroke="#fff" strokeWidth="1.4" />
        <path d="M31,48 l2,-5" stroke="#e0304c" strokeWidth="0.8" />
        <rect x="38" y="51" width="2.6" height="6.6" rx="0.8" fill="#e0304c" />
        <rect x="42" y="51" width="2.6" height="6.6" rx="0.8" fill="#ffd400" />
        <rect x="100" y="53" width="5" height="4.6" rx="0.8" fill="#f6f8ff" />
        <path d="M105,54 q2.4,1.2 0,2.6" fill="none" stroke="#f6f8ff" strokeWidth="0.8" />
        <rect x="112" y="51.6" width="5.4" height="6" rx="0.6" fill="url(#patio-chrome)" />
        {/* checker floor and a chrome rail along the pavement */}
        <rect x="0" y="90" width="146" height="10" fill="url(#patio-check)" />
        <path d="M0,76 H146" stroke="url(#patio-chrome)" strokeWidth="1.6" />
        <path d="M2.5,76 V90 M38,76 V90 M73,76 V90 M108,76 V90 M143.5,76 V90" stroke="#aab2cc" strokeWidth="1.2" />
      </svg>
      <div className="diner-sign">
        <b>DINER</b>
        <span>OPEN 24 HRS</span>
      </div>
      <div className="diner-roof" />
      <div className="diner-body">
        <div className="diner-windows">
          {[0, 1, 2, 3].map((i) => (
            <span key={i} />
          ))}
        </div>
        <div className="diner-door" />
      </div>
      <div className="diner-base" />
    </div>
  );
}

/* ---------- metro entrance ---------- */

const DEPARTURES = [
  { stop: 'Downtown', id: 'about', mins: 1, color: '#ff4fd8' },
  { stop: 'Career Ave', id: 'experience', mins: 3, color: '#ff9a4f' },
  { stop: 'Skill St', id: 'skills', mins: 5, color: '#8dff6b' },
  { stop: 'Broadcast Hill', id: 'contact', mins: 7, color: '#4fe3ff' },
];

function Metro({ x }) {
  const ctx = useContext(CityCtx);
  const ghost = useContext(GhostCtx);
  const { u } = ctx;
  return (
    <div className="metro" style={{ left: x * u, bottom: GROUND_U * u, width: 82 * u, height: 23 * u }}>
      {/* departure board, mounted on the station wall: each line drives you to that part of the city */}
      <div className="metro-board">
        <div className="metro-board-panel">
          <div className="metro-board-head">
            <span>NEXT TRAINS</span>
            <span className="metro-board-line">CITY LINE</span>
          </div>
          {DEPARTURES.map((d) => (
            <button
              key={d.id}
              type="button"
              className="metro-row"
              style={{ '--line': d.color }}
              tabIndex={ghost ? -1 : 0}
              aria-label={`Ride to ${d.stop}`}
              onClick={() => ctx.goto(d.id)}
            >
              <i aria-hidden="true" />
              <span className="metro-stop">{d.stop}</span>
              <span className="metro-mins">{d.mins} min</span>
            </button>
          ))}
          <div className="metro-ticker" aria-hidden="true">
            <span>GOOD SERVICE ON ALL LINES ◆ MIND THE GAP ◆ STAND CLEAR OF THE DOORS ◆ GOOD SERVICE ON ALL LINES ◆ MIND THE GAP ◆ STAND CLEAR OF THE DOORS ◆ </span>
          </div>
        </div>
      </div>
      {/* waiting alcove on the right: line map, a bench, and the shiba */}
      <svg className="metro-map" viewBox="0 0 108 60" aria-hidden="true">
        <rect x="1" y="1" width="106" height="58" rx="3" fill="#0d0a22" stroke="#d9ccff" strokeWidth="1.4" />
        <text x="8" y="13" fontFamily="Oswald, 'Arial Narrow', sans-serif" fontWeight="700" fontSize="7.4" letterSpacing="1.4" fill="#f2eaff">CITY LINE</text>
        <path d="M8,17 H100" stroke="#5a44b0" strokeWidth="0.8" />
        <path d="M12,44 H40 L52,30 H96" fill="none" stroke="#8f7ae0" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M40,44 H74 L84,52" fill="none" stroke="#4fe3ff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" opacity="0.7" />
        {DEPARTURES.map((d, i) => (
          <g key={d.id}>
            <circle cx={[12, 40, 68, 96][i]} cy={[44, 44, 30, 30][i]} r="4" fill="#0d0a22" stroke={d.color} strokeWidth="2.2" />
          </g>
        ))}
        <circle className="metro-here" cx="12" cy="44" r="1.8" fill="#fff" />
        <path d="M8,24 h18 M8,27 h12" stroke="#d9ccff" strokeWidth="0.9" opacity="0.5" />
      </svg>
      <div className="bench" style={{ left: `calc(var(--u) * 54.4)` }} aria-hidden="true"><span /></div>
      <svg className="shiba" style={{ left: `calc(var(--u) * 62.6)` }} viewBox="0 0 24 20" aria-hidden="true">
        <ellipse cx="11" cy="19.8" rx="8" ry="0.7" fill="rgba(0,0,0,0.35)" />
        {/* curled tail, cream on the inside of the curl */}
        <g className="shiba-tail">
          <path d="M7,13 C2.6,12.4 1.6,6.6 5.6,6 C8.2,5.7 8.6,9 6.4,9.3" fill="none" stroke="#d9893c" strokeWidth="2.6" strokeLinecap="round" />
          <path d="M4.7,10.8 C3.5,9.6 3.8,7.5 5.7,7.2" fill="none" stroke="#f6e3c4" strokeWidth="0.9" strokeLinecap="round" />
        </g>
        <g className="shiba-body">
          {/* far front leg */}
          <rect x="12.9" y="13.6" width="1.6" height="6.2" rx="0.8" fill="#b96d2a" />
          {/* torso and haunch */}
          <path d="M5.6,19.8 C4,15 5,10.6 9,9.2 C12.4,8.2 15.8,9.4 16.2,13.2 L16.2,19.8 Z" fill="#d9893c" />
          <path d="M5.2,17 C4.6,13.4 6.4,10.6 9.4,9.6" fill="none" stroke="#e9a35a" strokeWidth="0.7" strokeLinecap="round" opacity="0.7" />
          <ellipse cx="8.6" cy="16.6" rx="3.7" ry="3.1" fill="#c47a33" />
          <ellipse cx="11.2" cy="19.2" rx="2.1" ry="0.8" fill="#f6e3c4" />
          {/* cream chest and near front leg */}
          <path d="M13,9.8 C16.6,10.4 17,15 16.2,19.8 L14.4,19.8 C14.8,16 14.2,12.4 13,9.8 Z" fill="#f6e3c4" />
          <rect x="14.6" y="13.4" width="1.7" height="6.4" rx="0.8" fill="#f6e3c4" />
          <path d="M15.2,19.3 v0.5 M15.8,19.3 v0.5" stroke="#d8bf98" strokeWidth="0.25" />
        </g>
        <g className="shiba-head">
          <path className="shiba-ear" d="M12.3,3.8 L12.7,-0.6 L15.1,2.4 Z" fill="#c47a33" />
          <path className="shiba-ear" d="M16,2.3 L18.1,-0.5 L18.8,3.6 Z" fill="#d9893c" />
          <path d="M16.7,2.4 L17.9,0.7 L18.2,3 Z" fill="#f2b9a0" />
          <circle cx="15.5" cy="6" r="4" fill="#d9893c" />
          {/* cream cheeks and muzzle */}
          <path d="M12.6,8.6 C13.4,5.6 16.6,5 19.2,6.6 C19.6,8.6 18,10 15.6,10 C14.2,10 13.2,9.5 12.6,8.6 Z" fill="#f6e3c4" />
          <ellipse cx="19.1" cy="7.1" rx="2.1" ry="1.45" fill="#f6e3c4" />
          <path className="shiba-tongue" d="M18.4,8.2 h1.3 v1 a0.65,0.65 0 0 1 -1.3,0 Z" fill="#ff7a9c" />
          <path d="M18,8 Q19,8.7 20.4,8" fill="none" stroke="#1a1626" strokeWidth="0.35" strokeLinecap="round" />
          <ellipse cx="20.8" cy="6.5" rx="0.7" ry="0.55" fill="#1a1626" />
          <circle cx="17.3" cy="3.9" r="0.5" fill="#f6e3c4" />
          <g className="shiba-eye">
            <ellipse cx="17.1" cy="5.2" rx="0.5" ry="0.6" fill="#1a1626" />
            <circle cx="17.25" cy="5" r="0.16" fill="#fff" />
          </g>
          {/* collar with a brass tag */}
          <path d="M12.3,9.2 Q14.4,11 16.6,10" fill="none" stroke="#ff3b5c" strokeWidth="1.1" strokeLinecap="round" />
          <circle className="shiba-tag" cx="15.2" cy="11.3" r="0.6" fill="#ffe14f" />
        </g>
      </svg>

      {/* the entrance itself */}
      <div className="metro-entrance" aria-hidden="true">
        <div className="metro-glow" />
        <div className="metro-wall" />
        <span className="metro-exit">A</span>
        <span className="metro-clock"><i /></span>
        {/* glass and iron fan canopy, with a lamp bud on a curling stalk at each end */}
        <svg className="metro-canopy" viewBox="0 0 360 80">
          <defs>
            <linearGradient id="canopy-glass" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#bfe9ff" stopOpacity="0.55" />
              <stop offset="1" stopColor="#8f7ae0" stopOpacity="0.28" />
            </linearGradient>
          </defs>
          <path d="M4,78 Q180,-50 356,78 Z" fill="url(#canopy-glass)" />
          <path d="M180,78 L39.2,55.0 M180,78 L74.4,37.0 M180,78 L109.6,24.2 M180,78 L144.8,16.6 M180,78 L180.0,14.0 M180,78 L215.2,16.6 M180,78 L250.4,24.2 M180,78 L285.6,37.0 M180,78 L320.8,55.0" stroke="#d9ccff" strokeWidth="1.1" opacity="0.75" />
          <path d="M40,78 Q180,-10 320,78" fill="none" stroke="#d9ccff" strokeWidth="1" opacity="0.6" />
          <path d="M4,78 Q180,-50 356,78" fill="none" stroke="#8f7ae0" strokeWidth="4" strokeLinecap="round" />
          <path d="M0,78 H360" stroke="#5a44b0" strokeWidth="4" strokeLinecap="round" />
          <g fill="none" stroke="#5a44b0" strokeWidth="3" strokeLinecap="round">
            <path d="M8,78 C-12,52 -2,26 18,14" />
            <path d="M352,78 C372,52 362,26 342,14" />
          </g>
          <ellipse className="canopy-bud" cx="21" cy="11" rx="7" ry="8.4" fill="#ffb0d8" />
          <ellipse className="canopy-bud" cx="339" cy="11" rx="7" ry="8.4" fill="#ffb0d8" />
        </svg>
        <span className="metro-col mc-left" />
        <span className="metro-col mc-right" />
        <div className="metro-sign">
          <b>M</b>
          <span>METRO</span>
        </div>
        <div className="metro-arch">
          <div className="metro-train" />
          <div className="metro-stairs" />
          <div className="metro-handrail" />
          <div className="metro-hanger">
            {DEPARTURES.map((d) => <i key={d.id} style={{ background: d.color }} />)}
            <span>TRAINS ↓</span>
          </div>
        </div>
        <span className="metro-keystone" />
        <div className="metro-rail rl-left" />
        <div className="metro-rail rl-right" />
        <div className="metro-tactile" />
      </div>
    </div>
  );
}

/* ---------- Hobby Hall: brew pub, arcade, rooftop bar ---------- */

const CABINETS = ['#ff4fd8', '#4fe3ff', '#8dff6b', '#ffe14f', '#ff9a4f'];
const ON_TAP = ['Backend Bitter', 'Deploy IPA', 'Hotfix Lager'];
const BOTTLES = ['#8dff6b', '#ffcf6a', '#ff4fd8', '#4fe3ff', '#ff9a4f', '#ffcf6a', '#8dff6b', '#ff4fd8'];

function HobbyHall({ x }) {
  const { u } = useContext(CityCtx);
  return (
    <div className="hobby-hall" style={{ left: x * u, bottom: GROUND_U * u, width: 44 * u, height: 53 * u }} aria-hidden="true">
      {/* the building's name in neon, up on a frame over the rooftop bar */}
      <div className="hh-sign">
        <span>HOBBY</span>
        <b>HUB</b>
      </div>

      {/* roof: rooftop bar */}
      <div className="hh-roof">
        <div className="hh-lights">
          {Array.from({ length: 14 }, (_, i) => <span key={i} style={{ '--d': `${(i % 4) * -0.5}s` }} />)}
        </div>
        <div className="hh-umbrella" style={{ left: '6%' }}><span /></div>
        <div className="hh-umbrella alt" style={{ left: '28%' }}><span /></div>
        <div className="hh-rooftop-sign">Rooftop</div>
        <div className="hh-bar">
          <div className="hh-shelf">{BOTTLES.map((c, i) => <i key={i} style={{ background: c }} />)}</div>
          <div className="hh-counter" />
        </div>
        <div className="hh-railing" />
      </div>

      {/* second floor: boxing gym, lights on, nobody in */}
      <div className="hh-gym">
        <div className="blade-sign hh-gym-blade" style={{ '--neon': '#ff3b5c' }}>BOXING</div>
        <div className="gym-timer"><b>ROUND 3</b><span>2:59</span></div>
        <svg className="gym-window" viewBox="0 0 400 90" preserveAspectRatio="none">
          <defs>
            <linearGradient id="gym-wall" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#3a1428" />
              <stop offset="1" stopColor="#1f0c1c" />
            </linearGradient>
          </defs>
          <rect width="400" height="90" fill="url(#gym-wall)" />
          {/* brick courses and a fight poster on the back wall */}
          <path d="M0,18 H400 M0,36 H400 M0,54 H400" stroke="#000" strokeOpacity="0.18" strokeWidth="1" />
          <rect x="8" y="26" width="20" height="28" fill="#f3e4c4" />
          <rect x="8" y="26" width="20" height="8" fill="#c8102e" />
          <path d="M11,40 h14 M11,44 h10 M11,48 h12" stroke="#1a0b33" strokeWidth="1.4" />
          {/* pendant lamps and the pools of light under them */}
          {[70, 140, 210, 290, 350].map((x) => (
            <g key={x}>
              <path d={`M${x},10 L${x - 34},82 H${x + 34} Z`} fill="#ffd89a" opacity="0.1" />
              <path d={`M${x},0 V7`} stroke="#8d89a0" strokeWidth="0.8" />
              <path d={`M${x - 5},10 Q${x},4 ${x + 5},10 Z`} fill="#ffe7a8" />
            </g>
          ))}
          {/* the ring: apron, corner posts with pads, three ropes */}
          <rect x="34" y="64" width="216" height="18" fill="#1d2a7a" />
          <rect x="34" y="64" width="216" height="3" fill="#f2f0fa" />
          <path d="M34,74 H250" stroke="#f2f0fa" strokeWidth="1" opacity="0.5" />
          <path d="M66,28 V64 M218,28 V64" stroke="#5a5470" strokeWidth="3" />
          <path d="M70,34 H214 M70,43 H214 M70,52 H214" stroke="#8d89a0" strokeWidth="1" opacity="0.7" />
          <rect x="40" y="24" width="6" height="42" fill="#d8d5e4" />
          <rect x="238" y="24" width="6" height="42" fill="#d8d5e4" />
          <rect x="38.6" y="28" width="8.8" height="26" rx="2" fill="#e0304c" />
          <rect x="236.6" y="28" width="8.8" height="26" rx="2" fill="#2f66d0" />
          <path d="M46,32 H238" stroke="#e0304c" strokeWidth="2" />
          <path d="M46,42 H238" stroke="#f2f0fa" strokeWidth="2" />
          <path d="M46,52 H238" stroke="#2f66d0" strokeWidth="2" />
          {/* stool and bucket in the red corner */}
          <rect x="52" y="56" width="10" height="2.4" fill="#d8d5e4" />
          <path d="M54,58 V64 M60,58 V64" stroke="#d8d5e4" strokeWidth="1.2" />
          {/* heavy bags on chains, still swinging */}
          <g className="gym-bag">
            <path d="M286,0 V16" stroke="#8d89a0" strokeWidth="1.2" />
            <rect x="277" y="16" width="18" height="46" rx="7" fill="#c8102e" />
            <rect x="277" y="24" width="18" height="3" fill="#f2f0fa" opacity="0.8" />
            <rect x="277" y="52" width="18" height="3" fill="#000" opacity="0.25" />
          </g>
          <g className="gym-bag is-slow">
            <path d="M318,0 V12" stroke="#8d89a0" strokeWidth="1.2" />
            <rect x="309" y="12" width="18" height="52" rx="7" fill="#17151f" />
            <rect x="309" y="20" width="18" height="3" fill="#ffd21f" />
          </g>
          {/* speed bag under its platform */}
          <rect x="342" y="20" width="26" height="3" fill="#8a5a3a" />
          <path d="M355,0 V20" stroke="#5a5470" strokeWidth="2" />
          <g className="gym-speed">
            <rect x="353.8" y="23" width="2.4" height="4" fill="#a81c36" />
            <circle cx="355" cy="33" r="6.6" fill="#e0304c" />
            <path d="M350.6,30 a5,5 0 0 1 4,-3" fill="none" stroke="#fff" strokeOpacity="0.45" strokeWidth="1" strokeLinecap="round" />
          </g>
          {/* gloves on a hook, dumbbells on a rack */}
          <path d="M382,30 v6" stroke="#8d89a0" strokeWidth="1" />
          <path d="M377,36 q-4,2 -3,8 q1,5 6,5 q5,0 5,-6 v-7 Z" fill="#e0304c" />
          <path d="M386,37 q4,1 4,7 q0,5 -4,5 Z" fill="#a81c36" />
          <rect x="338" y="74" width="54" height="2" fill="#5a5470" />
          <path d="M342,76 V82 M388,76 V82" stroke="#5a5470" strokeWidth="2" />
          {[344, 360, 376].map((x) => (
            <g key={x}>
              <rect x={x} y="68" width="3" height="6" fill="#17151f" />
              <rect x={x + 3} y="70" width="6" height="2" fill="#8d89a0" />
              <rect x={x + 9} y="68" width="3" height="6" fill="#17151f" />
            </g>
          ))}
          <rect y="82" width="400" height="8" fill="#12081a" />
          {/* window mullions and a streak of glass */}
          <path d="M100,0 V90 M200,0 V90 M300,0 V90" stroke="#3d2a4a" strokeWidth="2.4" />
          <path d="M150,0 L170,0 L130,90 L110,90 Z" fill="#fff" opacity="0.05" />
        </svg>
      </div>

      {/* first floor: arcade */}
      <div className="hh-arcade">
        <div className="blade-sign hh-arcade-blade" style={{ '--neon': '#ff4fd8' }}>ARCADE</div>
        <div className="arcade-score">HIGH SCORE · GAB · 999999</div>
        <div className="hh-arcade-window">
          {CABINETS.map((c, i) => (
            <div key={c} className="cab" style={{ '--scr': c, '--d': `${i * -0.9}s` }}>
              <span className="cab-screen" />
              <span className="cab-panel" />
            </div>
          ))}
        </div>
        <span className="arcade-coin">INSERT COIN</span>
      </div>

      {/* ground floor: brew pub */}
      <div className="hh-brew">
        <div className="brew-name">
          <span>GABIDON</span>
          <small>BREW CO.</small>
        </div>
        <div className="brew-awning" />
        <div className="brew-front">
          <div className="brew-window" />
          <div className="brew-door" />
          <div className="brew-window" />
        </div>
      </div>

      <svg className="pint" viewBox="0 0 20 30">
        <defs>
          <clipPath id="pint-glass"><path d="M3,2 L17,2 L15.4,28 L4.6,28 Z" /></clipPath>
        </defs>
        <g clipPath="url(#pint-glass)">
          <g className="pint-fill">
            <rect x="0" y="0" width="20" height="3.2" fill="#fff6e0" />
            <rect x="0" y="3.2" width="20" height="40" fill="#ffb02e" />
            <circle cx="8" cy="12" r="0.6" fill="#ffe7a8" />
            <circle cx="12" cy="18" r="0.5" fill="#ffe7a8" />
            <circle cx="10" cy="24" r="0.6" fill="#ffe7a8" />
          </g>
        </g>
        <path d="M3,2 L17,2 L15.4,28 L4.6,28 Z" fill="none" stroke="#ffcf6a" strokeWidth="1.1" strokeLinejoin="round" />
      </svg>

      <div className="brew-board">
        <b>ON TAP</b>
        {ON_TAP.map((t) => <span key={t}>{t}</span>)}
      </div>
    </div>
  );
}

/* ---------- street life ---------- */

// curbside storm drain; some of them breathe a little steam
function Grate({ x, steam }) {
  const { u } = useContext(CityCtx);
  return (
    <div className="grate" style={{ left: x * u }} aria-hidden="true">
      {steam && (
        <span className="steam">
          <i />
          <i />
          <i />
        </span>
      )}
    </div>
  );
}

// a cat sitting on a ledge, tail swishing now and then
function Cat({ x, y, fur, eyes, stripes, flip }) {
  const { u } = useContext(CityCtx);
  return (
    <svg
      className={`cat ${flip ? 'is-flipped' : ''}`}
      viewBox="0 0 13 14"
      style={{ left: x * u, bottom: y * u }}
      aria-hidden="true"
    >
      <path className="cat-tail" d="M9.2,13.2 Q12.8,12.8 12.2,9.2 Q11.9,7.6 10.8,8.2" stroke={fur} strokeWidth="1.15" fill="none" strokeLinecap="round" />
      <g fill={fur}>
        <path d="M2.3,2.8 L2.5,0.2 L4.2,1.8 Z" />
        <path d="M5.3,1.8 L7,0.2 L7.2,2.9 Z" />
        <circle cx="4.75" cy="3.9" r="2.7" />
        <path d="M2.6,6 Q1,9.4 2,13.6 L9.8,13.6 Q10.8,9.2 7.4,6 Z" />
      </g>
      {stripes && (
        <g stroke={stripes} strokeWidth="0.55" strokeLinecap="round" fill="none">
          <path d="M3.6,1.6 Q4.75,2.2 5.9,1.6" />
          <path d="M3,8.6 Q4.2,9.2 5,8.4" />
          <path d="M2.6,10.6 Q3.8,11.2 4.8,10.4" />
          <path d="M7.2,8.2 Q8.4,8.8 9.2,8.4" />
        </g>
      )}
      <circle className="cat-eye" cx="3.75" cy="3.7" r="0.48" fill={eyes} />
      <circle className="cat-eye" cx="5.75" cy="3.7" r="0.48" fill={eyes} />
    </svg>
  );
}

// warm light pooling on the sidewalk in front of lit entrances
function Spill({ x, w, color }) {
  const { u } = useContext(CityCtx);
  return <div className="spill" style={{ left: x * u, width: w * u, '--spill': color }} aria-hidden="true" />;
}

/* ---------- the street itself (rendered twice so the loop wraps seamlessly) ---------- */

function Street({ goBlog }) {
  const { u } = useContext(CityCtx);
  const px = (n) => n * u;
  return (
    <>
      {/* road first, so everything on the street draws over it */}
      <div className="street" style={{ height: px(GROUND_U) }} aria-hidden="true">
        <div className="sidewalk" />
        <div className="lane" />
      </div>
      <Spill x={587} w={48} color="rgba(255, 180, 90, 0.5)" />
      <Spill x={47} w={28} color="rgba(255, 210, 140, 0.5)" />
      <Spill x={40} w={8} color="rgba(255, 110, 210, 0.35)" />
      <Spill x={74} w={8} color="rgba(255, 110, 210, 0.35)" />
      <Spill x={30} w={16} color="rgba(255, 176, 46, 0.3)" />
      <Spill x={128} w={48} color="rgba(255, 207, 106, 0.55)" />
      <Spill x={390} w={20} color="rgba(255, 150, 80, 0.5)" />
      <Spill x={430} w={36} color="rgba(255, 190, 110, 0.45)" />
      <Spill x={480} w={40} color="rgba(255, 210, 130, 0.5)" />

      {/* storm drains along the curb */}
      <Grate x={58.5} steam />
      <Grate x={216} steam />
      <Grate x={362} />
      <Grate x={455} steam />
      <Grate x={566} />

      {/* rooftop cats: black on The Gabriel's ledge, orange on the newspaper's cornice */}
      <Cat x={134.4} y={GROUND_U + 44} fur="#0b0912" eyes="#ffe14f" />
      <Cat x={515.4} y={GROUND_U + 52.4} fur="#f08a2c" eyes="#7dff8a" stripes="#b8571a" flip />

      {/* premiere night at The Gabriel: red carpet, velvet ropes, paparazzi, and a Walk of Fame star */}
      <div className="red-carpet" style={{ left: px(141), width: px(22), bottom: px(GROUND_U - 2.9) }} aria-hidden="true" />
      <VelvetRope x1={141} x2={146.5} />
      <VelvetRope x1={157.5} x2={163} />
      {/* walk of fame: a star for each chapter before the current one, either side of the carpet */}
      {CAREER.filter((job) => !job.current).map((job, i) => (
        <div key={job.id} className="fame-star" style={{ left: px([129.8, 135.4, 163.6, 169.2][i]), bottom: px(GROUND_U - 2.7) }} aria-hidden="true">
          <span className="fame-star-icon">★</span>
          <span className="fame-star-name">{job.company} ’{job.start.slice(2)}</span>
        </div>
      ))}
      <div className="paparazzi" aria-hidden="true">
        {[140, 149, 156, 164].map((fx, i) => (
          <span key={fx} style={{ left: px(fx), bottom: px(GROUND_U + 2 + (i % 2) * 3), animationDelay: `${i * 1.7}s` }} />
        ))}
      </div>

      {/* premiere searchlights sweeping the sky in front of The Gabriel */}
      <div className="searchlight sl-left" style={{ left: px(126.5), bottom: px(GROUND_U - 1.4) }} aria-hidden="true"><span className="sl-beam" /><span className="sl-unit" /></div>
      <div className="searchlight sl-right" style={{ left: px(174), bottom: px(GROUND_U - 1.4) }} aria-hidden="true"><span className="sl-beam" /><span className="sl-unit" /></div>

      {/* ---- Downtown ---- */}
      <Spot id="welcome" at={60} label={`Welcome to ${profile.name}, ${profile.title}`} className="billboard-main" style={{ left: px(22), bottom: px(GROUND_U), width: px(78), height: px(62) }}>
        <div className="billboard-poles"><span /><span /></div>
        <div className="billboard-board">
          <p className="neon-welcome">Welcome to</p>
          <h1 className="neon-name">{profile.name}</h1>
          <p className="neon-sub">{profile.title}</p>
        </div>
      </Spot>

      {/* arriving in the city: a metro entrance under the Welcome sign */}
      {/* x matches the Welcome sign's left edge so the entrance centres between its poles */}
      <Metro x={22} />

      <Building x={104} w={24} h={68} seed={11} color="#33186c" className="antenna" />
      <Diner x={104.6} />

      {/* About Me: an art-deco movie theater whose marquee and posters tell the story */}
      <div className="theater" style={{ left: px(132), bottom: px(GROUND_U), width: px(40), height: px(58) }} aria-hidden="true">
        <div className="theater-crown" />
        <span className="pennant pl" />
        <span className="pennant pr" />
        <div className="theater-body">
          <div className="theater-sunburst" />
          {/* two lightboxes tell the career as a night at the pictures: session times are the years */}
          <div className="bill-board bb-left">
            <b>SESSION TIMES</b>
            {CAREER.map((job) => (
              <span key={job.id} className={job.current ? 'is-now' : ''}>
                <i>20:{job.start.slice(2)}</i>
                <em>{job.company}</em>
              </span>
            ))}
          </div>
          <div className="bill-board bb-right">
            <b>STARRING GABRIEL AS</b>
            {CAREER.map((job) => (
              <span key={job.id} className={job.current ? 'is-now' : ''}>
                <em>{job.credit}</em>
              </span>
            ))}
          </div>
          <div className="theater-entrance">
            {theater.posters.map((p, i) => (
              <div key={p.title} className={`poster ${i ? 'poster-right' : 'poster-left'}`} style={{ '--neon': p.color }}>
                <span className="poster-billing">{profile.name}</span>
                <PosterArt kind={p.art} />
                <span className="poster-part">{p.part}</span>
                <strong>{p.title}</strong>
                <em className="poster-tagline">{p.tagline}</em>
                <span className="poster-credits">{p.credits}</span>
                <span className="poster-foot">
                  <b>{p.rating}</b>
                  <i>{p.years}</i>
                </span>
              </div>
            ))}
            <div className="theater-door td-left" />
            <div className="ticket-booth">
              <small>TICKETS</small>
              <div className="ticket-glass" />
            </div>
            <div className="theater-door td-right" />
          </div>
        </div>
        <div className="marquee">
          <div className="marquee-bulbs" />
          <MarqueeBoard />
          <div className="marquee-bulbs" />
        </div>
        <div className="theater-blade">
          {theater.blade.split('').map((c, i) => <span key={i}>{c}</span>)}
        </div>
      </div>

      {/* ---- Career Ave ---- */}
      <StreetSign x={177} text="CAREER AVE" />
      {experience.map((job, i) => {
        const x = 188 + i * 40;
        const h = EXP_HEIGHTS[i];
        return (
          <div
            key={job.id}
            className={`career-tower tower-${job.look}`}
            style={{ left: px(x), bottom: px(GROUND_U), width: px(34), height: px(h + 17) }}
          >
            <Building x={0} base={0} w={34} h={h} seed={31 + i} color={EXP_COLORS[i]} lit={job.lights} className={`flat office look-${job.look}`} windows={job.look !== 'glass' && job.look !== 'workshop' && job.look !== 'solar'}>
              {job.look === 'solar' && <SolarFacade />}
              {job.look === 'workshop' && <MercuryFacade />}
              {job.look === 'glass' && <div className="glass-wall" aria-hidden="true" />}
              {job.look === 'ink' && <InkDrips />}
              <div className="lobby-sign" style={{ '--glow': job.color }}>{job.role}</div>
              {job.look !== 'workshop' && <div className="lobby-door" aria-hidden="true" />}
              <div className="years-plate">{job.years}</div>
            </Building>
            {job.look === 'ink' && <Construction />}
            {job.look === 'ladder' && <SideLadder h={h + 7} />}
            {job.look === 'workshop' && <BusStop />}
            {job.look === 'solar' && (
              <>
                <div className="solar-panels" style={{ bottom: px(h) }} aria-hidden="true"><span /><span /><span /><span /></div>
                <SolarCar />
              </>
            )}
            {job.current && <div className="blade-sign now-blade" style={{ '--neon': job.color }}>NOW</div>}
            <div className="roof-billboard" style={{ bottom: px(h), '--glow': job.color }}>
              <div className="roof-billboard-face" style={job.face ? { background: job.face } : undefined}>
                <img src={job.image} alt="" />
              </div>
              <div className="roof-billboard-legs" />
            </div>
            <div className="milestone" aria-hidden="true">{job.start}</div>
          </div>
        );
      })}
      <StreetLamp x={388} />

      {/* hot dog stand on the corner before Skill St */}
      <div className="hotdog-stand" style={{ left: px(393), bottom: px(GROUND_U), width: px(13), height: px(20) }} aria-hidden="true">
        <svg className="hotdog-sign" viewBox="0 0 40 18">
          <rect x="1" y="5" width="38" height="11" rx="5.5" fill="#f2b45c" />
          <rect x="1" y="5" width="38" height="5" rx="2.5" fill="#ffd08a" opacity="0.6" />
          <rect x="-1" y="6.5" width="42" height="6" rx="3" fill="#c8402c" />
          <rect x="1" y="7" width="38" height="2" rx="1" fill="#e8664e" opacity="0.7" />
          <path d="M3,9.5 l3,-1.6 l3,1.6 l3,-1.6 l3,1.6 l3,-1.6 l3,1.6 l3,-1.6 l3,1.6 l3,-1.6 l3,1.6 l3,-1.6 l3,1.6" fill="none" stroke="#ffd800" strokeWidth="1.1" strokeLinejoin="round" />
        </svg>
        <div className="hotdog-awning" />
        <div className="hotdog-body">
          <div className="hotdog-window">
            <span>HOT DOGS</span>
          </div>
        </div>
      </div>

      {/* ---- Skill Institute: one floor per skill category, Languages at the foundation ---- */}
      <StreetSign x={406} text="SKILL ST" />
      <div className="skill-tower" style={{ left: px(424), bottom: px(GROUND_U), width: px(48), height: px(70) }}>
        {/* roof garden with the institute's name along the edge */}
        <div className="uni-roof" aria-hidden="true">
          <div className="uni-garden">
            {[3.2, 4.6, 3.6, 5, 3.4, 4.2].map((r, i) => (
              <span key={i} className="uni-tree" style={{ '--r': r }} />
            ))}
          </div>
          <span className="uni-name">SKILL INSTITUTE</span>
        </div>
        {skills
          .map((cat, i) => ({ cat, i }))
          .reverse()
          .map(({ cat, i }) => (
            <Spot
              key={cat.category}
              id={`skill-${i}`}
              at={448}
              label={`Level ${i + 1}: ${cat.category} skills`}
              className="tower-floor"
              style={{ '--neon': cat.color }}
            >
              <div className="floor-windows">
                <Windows cols={11} rows={2} seed={60 + i} lit={0.55} />
              </div>
              <div className="blade-sign floor-blade">{cat.short}</div>
            </Spot>
          ))}
        {/* double-height glass atrium */}
        <div className="tower-lobby" aria-hidden="true">
          <span className="uni-canopy" />
          <span className="uni-doors" />
          {/* UNSW plaque by the entrance */}
          <div className="uni-plaque">
            <span className="uni-plaque-lamp" />
            <svg viewBox="0 0 120 66">
              <defs>
                <linearGradient id="plaque-brass" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0" stopColor="#fff1b0" />
                  <stop offset="0.35" stopColor="#d9a93a" />
                  <stop offset="0.65" stopColor="#f6d778" />
                  <stop offset="1" stopColor="#9c741c" />
                </linearGradient>
                <linearGradient id="plaque-stone" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0" stopColor="#26232f" />
                  <stop offset="1" stopColor="#0d0c12" />
                </linearGradient>
              </defs>
              {/* brass frame, dark stone face, a bolt in each corner */}
              <rect x="0.5" y="0.5" width="119" height="65" rx="3" fill="url(#plaque-brass)" />
              <rect x="3.5" y="3.5" width="113" height="59" rx="1.6" fill="url(#plaque-stone)" />
              <rect x="5.5" y="5.5" width="109" height="55" rx="1" fill="none" stroke="#d9a93a" strokeWidth="0.5" opacity="0.7" />
              {[[8.6, 8.6], [111.4, 8.6], [8.6, 57.4], [111.4, 57.4]].map(([x, y]) => (
                <g key={`${x}-${y}`}>
                  <circle cx={x} cy={y} r="1.5" fill="url(#plaque-brass)" />
                  <path d={`M${x - 0.9},${y} h1.8`} stroke="#6b4e10" strokeWidth="0.4" />
                </g>
              ))}
              {/* crest: open book over a starred cross */}
              <path d="M14,11 H42 V34 Q42,47 28,54 Q14,47 14,34 Z" fill="#ffe600" stroke="url(#plaque-brass)" strokeWidth="1.2" />
              <path d="M14,11 H42 V24 H14 Z" fill="#17151f" />
              <path d="M18.4,15.2 Q23.4,13.4 28,16 Q32.6,13.4 37.6,15.2 V21 Q32.6,19.4 28,21.8 Q23.4,19.4 18.4,21 Z" fill="#ffe600" />
              <path d="M28,16 V21.8 M20.6,16.6 Q24,15.8 26.4,17.2 M20.6,18.6 Q24,17.8 26.4,19.2 M29.6,17.2 Q32,15.8 35.4,16.6 M29.6,19.2 Q32,17.8 35.4,18.6" fill="none" stroke="#17151f" strokeWidth="0.5" />
              <path d="M28,24 V53.6 M14.6,37 H41.4" stroke="#17151f" strokeWidth="3.2" />
              {[[28, 37], [28, 29], [28, 46], [20, 37], [36, 37]].map(([x, y]) => (
                <path key={`${x}-${y}`} transform={`translate(${x} ${y})`} d="M0,-1.7 L0.5,-0.5 L1.7,-0.5 L0.75,0.3 L1.1,1.5 L0,0.8 L-1.1,1.5 L-0.75,0.3 L-1.7,-0.5 L-0.5,-0.5 Z" fill="#ffe600" />
              ))}
              {/* lettering */}
              <text x="50" y="31.5" fontFamily="Oswald, 'Arial Narrow', sans-serif" fontWeight="700" fontSize="23" letterSpacing="1" fill="#ffe600">UNSW</text>
              <text x="50.6" y="41.6" fontFamily="Oswald, 'Arial Narrow', sans-serif" fontWeight="400" fontSize="7.4" letterSpacing="5.6" fill="#f4f1ea">SYDNEY</text>
              <path d="M50.6,45.6 H108" stroke="url(#plaque-brass)" strokeWidth="0.7" />
              <text x="50.6" y="52" fontFamily="Oswald, 'Arial Narrow', sans-serif" fontWeight="400" fontSize="3.8" letterSpacing="0.7" fill="#d9a93a">SCIENTIA MANU ET MENTE</text>
              <text x="50.6" y="57.6" fontFamily="Oswald, 'Arial Narrow', sans-serif" fontWeight="400" fontSize="3.4" letterSpacing="1.6" fill="#f4f1ea" opacity="0.65">EST. 1949</text>
              {/* sheen across the face */}
              <path d="M70,3.5 L84,3.5 L62,62.5 L48,62.5 Z" fill="#fff" opacity="0.05" />
            </svg>
          </div>
        </div>
      </div>
      <StreetLamp x={476} />

      {/* ---- Broadcast Hill ---- */}
      {/* The Daily Blog: an old New York newspaper headquarters */}
      <Spot id="blog" at={500} label="The Daily Blog building: open the blog" onActivate={goBlog} quiet className="news-hq" style={{ left: px(482), bottom: px(GROUND_U), width: px(36), height: px(60) }}>
        <div className="news-roof" style={{ bottom: px(52) }} aria-hidden="true">
          <div className="news-roof-board">The Daily Blog</div>
          <div className="news-roof-scaffold" />
        </div>
        <div className="news-facade" style={{ height: px(52) }}>
          <div className="news-cornice" />
          <div className="news-windows" aria-hidden="true">
            {[0, 1, 2].map((r) =>
              [0, 1, 2, 3].map((c) => <span key={`${r}-${c}`} />)
            )}
          </div>
          <div className="news-clock-band">
            <span className="news-frieze">EST.</span>
            <NewsClock />
            <span className="news-frieze">2024</span>
          </div>
          <div className="news-ticker">
            <div className="news-ticker-window">
              <div className="news-ticker-track">
                <span>{headlineCrawl}</span>
                <span>{headlineCrawl}</span>
              </div>
            </div>
          </div>
          <div className="news-ground">
            <span className="news-column" />
            <div className="news-vitrine"><FrontPage /></div>
            <span className="news-column" />
            <div className="news-door" aria-hidden="true"><span /></div>
            <span className="news-column" />
            <div className="news-vitrine extra" aria-hidden="true">
              <strong>EXTRA!</strong>
              <strong>EXTRA!</strong>
              <small>Read all about it</small>
            </div>
            <span className="news-column" />
          </div>
          <div className="news-box nb-left" aria-hidden="true" />
          <div className="news-box nb-right" aria-hidden="true" />
        </div>
      </Spot>

      <Spot id="contact" at={550} label="Gabidon FM tower: contact details" className="fm-tower" style={{ left: px(532), bottom: px(GROUND_U), width: px(36), height: px(78) }}>
        <svg className="fm-tower-svg" viewBox="0 0 36 78" aria-hidden="true">
          <defs>
            <linearGradient id="fm-bands" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="78">
              <stop offset="0.18" stopColor="#ff5a1f" />
              <stop offset="0.30" stopColor="#ff5a1f" />
              <stop offset="0.30" stopColor="#f6efe4" />
              <stop offset="0.41" stopColor="#f6efe4" />
              <stop offset="0.41" stopColor="#ff5a1f" />
              <stop offset="0.59" stopColor="#ff5a1f" />
              <stop offset="0.59" stopColor="#f6efe4" />
              <stop offset="0.71" stopColor="#f6efe4" />
              <stop offset="0.71" stopColor="#ff5a1f" />
              <stop offset="0.83" stopColor="#ff5a1f" />
              <stop offset="0.83" stopColor="#f6efe4" />
              <stop offset="0.92" stopColor="#f6efe4" />
              <stop offset="0.92" stopColor="#ff5a1f" />
            </linearGradient>
            <pattern id="fm-lattice" width="2.4" height="2.4" patternUnits="userSpaceOnUse">
              <path d="M0,0 L2.4,2.4 M2.4,0 L0,2.4" stroke="#3a1230" strokeWidth="0.28" strokeOpacity="0.55" />
            </pattern>
          </defs>
          {/* antenna */}
          <rect x="17.6" y="0.6" width="0.8" height="13.6" fill="#f6efe4" />
          <rect x="17.3" y="5" width="1.4" height="1.2" fill="#ff5a1f" />
          <rect x="17.3" y="9" width="1.4" height="1.2" fill="#ff5a1f" />
          {/* top deck */}
          <rect x="15.2" y="14" width="5.6" height="3.4" rx="0.4" fill="#1b1340" />
          <rect x="15.8" y="15" width="4.4" height="1.2" fill="#9fe8ff" opacity="0.9" />
          {/* upper shaft */}
          <path d="M16.2,17.4 L19.8,17.4 L21.6,31.5 L14.4,31.5 Z" fill="url(#fm-bands)" />
          <path d="M16.2,17.4 L19.8,17.4 L21.6,31.5 L14.4,31.5 Z" fill="url(#fm-lattice)" />
          {/* lower body with flared, arched legs */}
          <path d="M12.4,37.5 L23.6,37.5 L32.6,72 L35,78 L27.5,78 Q18,60 8.5,78 L1,78 L3.4,72 Z" fill="url(#fm-bands)" />
          <path d="M12.4,37.5 L23.6,37.5 L32.6,72 L35,78 L27.5,78 Q18,60 8.5,78 L1,78 L3.4,72 Z" fill="url(#fm-lattice)" />
          {/* mid platform */}
          <rect x="6.6" y="54.6" width="22.8" height="2" rx="0.4" fill="#f6efe4" />
          <rect x="7.2" y="55.2" width="21.6" height="0.7" fill="#ffd77a" opacity="0.9" />
          {/* main observation deck */}
          <rect x="7.5" y="31.2" width="21" height="6.6" rx="0.8" fill="#1b1340" />
          <rect x="7.5" y="31.2" width="21" height="1" fill="#f6efe4" />
          <rect x="7.5" y="36.8" width="21" height="1" fill="#f6efe4" />
        </svg>
        <div className="radio-rings" aria-hidden="true"><span /><span /><span /></div>
        <div className="radio-light" aria-hidden="true" />
        <div className="fm-deck-sign">
          <span>GABIDON FM</span>
        </div>
        <div className="fm-base-sign">CONTACT</div>
        <ContactBurst />
      </Spot>

      {/* Hobby Hall: brew pub, arcade and rooftop bar, last stop before the send-off */}
      <HobbyHall x={589} />

      {/* a planted strip either side of Hobby Hall, which sits midway between the FM tower and the send-off */}
      <StreetLamp x={571} />
      <div className="planter" style={{ left: px(573.4), bottom: px(GROUND_U) }} aria-hidden="true"><span /></div>
      <div className="bench" style={{ left: px(577.8), bottom: px(GROUND_U) }} aria-hidden="true"><span /></div>
      <div className="planter" style={{ left: px(585.2), bottom: px(GROUND_U) }} aria-hidden="true"><span /></div>
      <div className="planter" style={{ left: px(636.4), bottom: px(GROUND_U) }} aria-hidden="true"><span /></div>
      <div className="bench" style={{ left: px(640.8), bottom: px(GROUND_U) }} aria-hidden="true"><span /></div>
      <div className="planter" style={{ left: px(648.2), bottom: px(GROUND_U) }} aria-hidden="true"><span /></div>

      {/*
        End of the street: the send-off sign straddles the loop seam so it sits right beside the Welcome
        sign. It is drawn twice, one street length apart, so the part that hangs past the end also shows
        at the start.
      */}
      {[THANKS_U, THANKS_U - TRACK_U].map((x) => (
        <div key={x} className="thanks-sign" style={{ left: px(x), bottom: px(GROUND_U), width: px(34), height: px(40) }}>
          <div className="thanks-board">
            <span className="thanks-line">Thanks for</span>
            <span className="thanks-big">COMING!</span>
            <span className="thanks-sub">Come back soon</span>
            <small>© {new Date().getFullYear()} {profile.name}</small>
          </div>
          <div className="billboard-poles"><span /><span /></div>
        </div>
      ))}

      {/* dusk haze lying along the pavement, tying every frontage into the same light */}
      <div className="street-haze" style={{ left: 0, width: px(TRACK_U), bottom: px(GROUND_U) }} aria-hidden="true" />

    </>
  );
}

/* ---------- main component ---------- */

function City() {
  const navigate = useNavigate();
  const location = useLocation();

  const trackRef = useRef(null);
  const midRef = useRef(null);
  const farRef = useRef(null);
  const cardRef = useRef(null);
  const anchorRef = useRef(null);
  const openedByRef = useRef(null);
  const closeTimer = useRef(null);
  const metrics = useRef({ u: 8, vw: 1200, vh: 800 });
  const txRef = useRef(HOME_U * 8); // current street offset in px, within [0, TRACK_U * u); 8 matches the initial u
  const glideRef = useRef(null); // in-flight nav glide { from, to, start, dur }
  const pausedUntilRef = useRef(0);
  const carsResetRef = useRef(false);

  const [size, setSize] = useState({ u: 8, vw: 1200, vh: 800 });
  const [activeId, setActiveId] = useState(null);
  // scroll speed multiplier: state for the control, a ref for the animation loop
  const [speed, setSpeed] = useState(() => {
    try {
      const saved = Number(window.localStorage.getItem(SPEED_KEY));
      return SPEEDS.some((o) => o.value === saved) && window.localStorage.getItem(SPEED_KEY) !== null ? saved : 1;
    } catch (e) {
      return 1;
    }
  });
  const speedRef = useRef(speed);
  speedRef.current = speed;
  const chooseSpeed = (value) => {
    setSpeed(value);
    pausedUntilRef.current = 0; // take effect now, even mid-linger
    try {
      window.localStorage.setItem(SPEED_KEY, String(value));
    } catch (e) {
      /* private mode: the choice just won't be remembered */
    }
  };
  const activeIdRef = useRef(null);
  activeIdRef.current = activeId;
  const lastMoveRef = useRef(0);

  // Buildings slide under a still cursor; only real mouse movement counts as hover.
  useEffect(() => {
    const onMove = () => {
      lastMoveRef.current = performance.now();
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    return () => window.removeEventListener('pointermove', onMove);
  }, []);
  const mouseMoved = useCallback(() => performance.now() - lastMoveRef.current < 150, []);

  /* measure */
  useLayoutEffect(() => {
    const measure = () => {
      const vh = window.innerHeight;
      const vw = document.documentElement.clientWidth;
      const u = vh / 100;
      // keep the same street position across resizes
      txRef.current = (txRef.current / metrics.current.u) * u;
      metrics.current = { u, vw, vh };
      setSize({ u, vw, vh });
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);

  /* card positioning (runs every frame while a card is open, so it rides along with its building) */
  const close = useCallback(() => {
    clearTimeout(closeTimer.current);
    anchorRef.current = null;
    openedByRef.current = null;
    setActiveId(null);
  }, []);

  const placeCard = useCallback(() => {
    const el = anchorRef.current;
    const card = cardRef.current;
    if (!el || !card) return;
    const r = el.getBoundingClientRect();
    const { vw, vh } = metrics.current;
    if (r.right < 0 || r.left > vw) {
      if (!glideRef.current) close(); // a keyboard glide may still be bringing it on screen
      return;
    }
    if (vw < 640) {
      card.style.transform = '';
      return;
    }
    const nav = document.querySelector('.navbar');
    const top0 = (nav ? nav.getBoundingClientRect().bottom : 0) + 12;
    const cw = card.offsetWidth;
    const ch = card.offsetHeight;
    const gap = 18;
    let left = r.right + gap;
    if (left + cw > vw - 12) left = r.left - gap - cw;
    if (left < 12) left = clamp(r.left + r.width / 2 - cw / 2, 12, vw - cw - 12);
    const top = clamp(r.top + 8, top0, vh - ch - 12);
    card.style.transform = `translate(${Math.round(left)}px, ${Math.round(top)}px)`;
  }, [close]);

  /* paint the current offset onto every layer */
  const paint = useCallback(() => {
    const { u, vw } = metrics.current;
    const period = TRACK_U * u;
    const tx = txRef.current;
    if (trackRef.current) trackRef.current.style.transform = `translate3d(${-tx}px,0,0)`;
    if (midRef.current) midRef.current.style.transform = `translate3d(${-(tx * MID_FACTOR) % (period * MID_FACTOR)}px,0,0)`;
    if (farRef.current) farRef.current.style.transform = `translate3d(${-(tx * FAR_FACTOR) % (period * FAR_FACTOR)}px,0,0)`;
    const centre = (((tx + vw / 2) / u) % TRACK_U + TRACK_U) % TRACK_U;
    announceDistrict(DISTRICTS.find((x) => centre < x.to).nav);
    placeCard();
  }, [placeCard]);

  useLayoutEffect(() => {
    paint();
  }, [size, paint]);

  /*
   * Auto-drive: the city cruises by forever like a screensaver. The street is drawn twice back to back,
   * so wrapping the offset at one street length is invisible and the name sign comes back around.
   */
  useEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let raf = 0;
    let last = performance.now();
    let velocity = 0;
    pausedUntilRef.current = last + 1200;

    // traffic lives in the city: cars keep their own speed, and the camera's movement slides them
    // past, so a fast menu glide leaves them behind and new ones roll into frame
    const CAR_U = 20;
    const lanes = { far: 16, near: -9.6 }; // street units per second (+ is rightwards)
    let cars = [];
    const setupCars = () => {
      const { vw } = metrics.current;
      const seen = { far: 0, near: 0 };
      cars = [...document.querySelectorAll('.traffic .car')].map((el) => {
        const lane = el.classList.contains('lane-far') ? 'far' : 'near';
        dressCar(el);
        // spread each lane's cars across the screen, the two lanes out of step
        const slot = seen[lane]++;
        // each lane's second car starts off-screen on the side it will drive in from
        return { el, lane, x: lane === 'far' ? vw * (0.15 - slot * 0.65) : vw * (0.55 + slot * 0.75) };
      });
    };
    const moveCars = (dt, camDelta) => {
      const { u, vw } = metrics.current;
      const w = CAR_U * u;
      const margin = 8 * u;
      if (carsResetRef.current) {
        carsResetRef.current = false;
        setupCars();
      }
      cars.forEach((c) => {
        c.x += (reduce ? 0 : lanes[c.lane] * u * dt) - camDelta;
      });
      cars.forEach((c) => {
        const mates = cars.filter((o) => o !== c && o.lane === c.lane).map((o) => o.x);
        // Two dials for how busy the road feels. `wait` is how far off-screen a recycled car is parked
        // before it drives back in, so each lane is often empty for a while. `gap` is the least room it
        // leaves behind the other car in its lane.
        const wait = (8 + Math.random() * 62) * u;
        const gap = (30 + Math.random() * 40) * u;
        if (c.x < -w - margin) {
          // fell off the left: bring it in from beyond the right edge, behind any car already there
          c.x = Math.max(vw + wait, ...mates.map((x) => x + w + gap));
          dressCar(c.el);
        } else if (c.x > vw + margin) {
          c.x = Math.min(-w - wait, ...mates.map((x) => x - w - gap));
          dressCar(c.el);
        }
      });

      // House rule: between one and three vehicles in view at any moment.
      // Far-lane cars drive in from the left and out to the right; near-lane cars the other way.
      const inView = (c) => c.x + w > 0 && c.x < vw;
      const seen = cars.filter(inView);
      if (seen.length >= 3) {
        // full: anything about to drive in waits just off-screen
        cars.forEach((c) => {
          if (inView(c)) return;
          if (c.lane === 'far' && c.x < 0) c.x = Math.min(c.x, -w - 1);
          if (c.lane === 'near' && c.x >= vw) c.x = Math.max(c.x, vw + 1);
        });
      }
      const last = seen.length === 1 ? seen[0] : null;
      const leaving = last && (last.lane === 'far' ? vw - last.x : last.x + w) < 8 * u;
      if (seen.length === 0 || leaving) {
        // about to be empty: start the nearest waiting car on its way in
        const toEdge = (c) => Math.abs(c.lane === 'far' ? -w - c.x : c.x - vw);
        const next = cars.filter((c) => !inView(c)).sort((a, b) => toEdge(a) - toEdge(b))[0];
        if (next) next.x = next.lane === 'far' ? -w + 2 : vw - 2;
      }

      // two can arrive in the same instant: send the latest arrivals back out until three remain
      const entering = (c) => inView(c) && (c.lane === 'far' ? c.x < 0 : c.x + w > vw);
      const shown = (c) => Math.min(c.x + w, vw) - Math.max(c.x, 0);
      let over = cars.filter(inView).length - 3;
      cars
        .filter(entering)
        .sort((a, b) => shown(a) - shown(b))
        .forEach((c) => {
          if (over-- > 0) c.x = c.lane === 'far' ? -w - 1 : vw + 1;
        });

      cars.forEach((c) => {
        c.el.style.transform = `translate3d(${Math.round(c.x)}px,0,0)`;
      });
    };
    setupCars();

    const tick = (now) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      let camDelta = 0;
      const { u } = metrics.current;
      const period = TRACK_U * u;
      const glide = glideRef.current;
      // tap/keyboard-opened cards hold the city still; hover cards ride along
      const busy = (activeIdRef.current && openedByRef.current !== 'hover') || document.hidden;

      if (glide) {
        const t = Math.min(1, (now - glide.start) / glide.dur);
        const e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; // ease in-out
        const raw = glide.from + (glide.to - glide.from) * e;
        camDelta = raw - (glide.last ?? glide.from);
        glide.last = raw;
        txRef.current = raw;
        if (t >= 1) {
          glideRef.current = null;
          velocity = 0;
        }
      } else if (busy) {
        velocity = 0;
        pausedUntilRef.current = Math.max(pausedUntilRef.current, now + 800);
      } else if (!reduce && now >= pausedUntilRef.current) {
        velocity += (SPEED_U * speedRef.current * u - velocity) * Math.min(1, dt * 1.2); // ease back up to speed
        txRef.current += velocity * dt;
        camDelta = velocity * dt;
      }
      txRef.current = ((txRef.current % period) + period) % period;
      paint();
      moveCars(dt, camDelta);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [paint]);

  /* glide forward to a spot on the street */
  const glideTo = useCallback((xU, instant = false) => {
    const { u, vw } = metrics.current;
    const period = TRACK_U * u;
    const target = xU == null ? HOME_U * u : typeof xU === 'object' ? xU.left * u : xU * u - vw / 2;
    const from = txRef.current;
    // always drive forward (to the right); the loop brings every landmark back around
    const delta = (((target - from) % period) + period) % period;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    pausedUntilRef.current = performance.now() + 4000; // linger so the landmark can be read
    if (instant || reduce) {
      glideRef.current = null;
      txRef.current = from + delta;
      carsResetRef.current = true; // fresh traffic for the new spot
    } else {
      glideRef.current = { from, to: from + delta, start: performance.now(), dur: clamp((delta / u) * 5, 700, 2400) };
    }
  }, []);

  useEffect(() => {
    const onGoto = (e) => {
      if (e.detail in TARGETS) glideTo(TARGETS[e.detail]);
    };
    window.addEventListener(CITY_GOTO_EVENT, onGoto);
    return () => window.removeEventListener(CITY_GOTO_EVENT, onGoto);
  }, [glideTo]);

  useEffect(() => {
    const target = location.state && location.state.goto;
    if (target in TARGETS) {
      glideTo(TARGETS[target], true);
      navigate(location.pathname, { replace: true, state: null });
    }
  }, [location.state, location.pathname, navigate, glideTo]);

  /* hover card state */
  const open = useCallback((id, el, by) => {
    clearTimeout(closeTimer.current);
    anchorRef.current = el;
    openedByRef.current = by;
    setActiveId(id);
  }, []);

  const scheduleClose = useCallback(() => {
    clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(close, 180);
  }, [close]);

  const toggle = useCallback(
    (id, el) => {
      if (activeId === id && openedByRef.current === 'hover') return;
      if (activeId === id && openedByRef.current === 'tap') close();
      else open(id, el, 'tap');
    },
    [activeId, close, open]
  );

  // keyboard focus: bring the landmark on screen if it is off to the side
  const reveal = useCallback(
    (xU) => {
      const sticky = document.querySelector('.city-sticky');
      if (sticky) sticky.scrollLeft = 0;
      if (xU == null) return;
      const { u, vw } = metrics.current;
      const x = xU * u - txRef.current;
      if (x < vw * 0.1 || x > vw * 0.9) glideTo(xU);
    },
    [glideTo]
  );

  useLayoutEffect(() => {
    if (activeId) placeCard();
  }, [activeId, placeCard]);

  /* tap outside closes */
  useEffect(() => {
    if (!activeId) return undefined;
    const onDown = (e) => {
      if (cardRef.current && cardRef.current.contains(e.target)) return;
      if (anchorRef.current && anchorRef.current.contains(e.target)) return;
      close();
    };
    const onKey = (e) => e.key === 'Escape' && close();
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [activeId, close]);

  const goBlog = useCallback(() => navigate('/blog'), [navigate]);

  const ctx = useMemo(
    () => ({ u: size.u, activeId, open, scheduleClose, close, toggle, reveal, mouseMoved, goto: (id) => glideTo(TARGETS[id]) }),
    [size.u, activeId, open, scheduleClose, close, toggle, reveal, mouseMoved, glideTo]
  );

  const { u } = size;
  const px = (n) => n * u;

  return (
    <CityCtx.Provider value={ctx}>
      <section
        id="city"
        className="city"
        style={{ '--u': `${u}px` }}
        aria-label="Gabriel Esquivel's city"
      >
        <div className="city-sticky">
          <p className="city-credit">Inspired by Roku City</p>
          <div className="city-speed" role="group" aria-label="Scroll speed">
            <span aria-hidden="true">Speed</span>
            {SPEEDS.map((o) => (
              <button
                key={o.value}
                type="button"
                className={speed === o.value ? 'is-active' : ''}
                aria-pressed={speed === o.value}
                aria-label={o.name}
                title={o.name}
                onClick={() => chooseSpeed(o.value)}
              >
                {o.label}
              </button>
            ))}
          </div>
          <div className="sky" aria-hidden="true">
            <Stars />
            <div className="moon" />
            <SkyLife />
          </div>

          <div className="layer layer-far" ref={farRef}>
            <Skyline seed={7} period={TRACK_U * FAR_FACTOR} copies={Math.ceil(size.vw / u / (TRACK_U * FAR_FACTOR)) + 2} minW={8} maxW={20} minH={34} maxH={72} className="far" gap={FAR_GAP} harbour props={FAR_EGGS} />
          </div>
          <div className="layer layer-mid" ref={midRef}>
            <Skyline seed={19} period={TRACK_U * MID_FACTOR} copies={Math.ceil(size.vw / u / (TRACK_U * MID_FACTOR)) + 2} minW={10} maxW={24} minH={24} maxH={50} className="mid" neon={0.34} gap={MID_GAP} props={MID_EGGS} />
            <Monorail period={TRACK_U * MID_FACTOR} copies={Math.ceil(size.vw / u / (TRACK_U * MID_FACTOR)) + 2} />
          </div>

          {/* the blimp flies in front of the background skylines, so only the street's own landmarks ever hide it */}
          <div className="blimp-layer">
            <a className="blimp" href="https://bootink.com" target="_blank" rel="noopener noreferrer" aria-label="Buy Bootink at bootink.com">
              <svg className="blimp-svg" viewBox="0 0 220 76" aria-hidden="true">
                <defs>
                  <linearGradient id="blimp-skin" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0" stopColor="#3b3270" />
                    <stop offset="0.38" stopColor="#1b1638" />
                    <stop offset="1" stopColor="#07050f" />
                  </linearGradient>
                  <linearGradient id="blimp-fin" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0" stopColor="#1b1638" />
                    <stop offset="1" stopColor="#0a0716" />
                  </linearGradient>
                </defs>
                {/* cruciform tail: far-side fin first, then upper and lower */}
                <path d="M182,29 L216,26 L216,38 L182,35 Z" fill="#120e26" />
                <g stroke="#6f5aa8" strokeWidth="0.9" strokeLinejoin="round">
                  <path d="M172,21 L194,3 L212,5 L203,25 Z" fill="url(#blimp-fin)" />
                  <path d="M172,43 L194,61 L212,59 L203,39 Z" fill="url(#blimp-fin)" />
                </g>
                <path d="M190,8 L205,10 M187,12 L203,15 M190,56 L205,54 M187,52 L203,49" stroke="#ff4fd8" strokeWidth="0.8" opacity="0.7" />
                {/* envelope, its gores, and moonlight along the top */}
                <path className="blimp-hull" d="M5,32 C5,13 48,6 100,6 C152,6 186,15 198,32 C186,49 152,58 100,58 C48,58 5,51 5,32 Z" fill="url(#blimp-skin)" stroke="#5a4890" strokeWidth="0.9" />
                <g fill="none" stroke="#000" strokeOpacity="0.28" strokeWidth="0.7">
                  <path d="M5,32 C40,22 150,22 198,32" />
                  <path d="M5,32 C40,42 150,42 198,32" />
                  <path d="M40,10.6 C34,24 34,40 40,53.4 M160,11.6 C167,24 167,40 160,52.4" />
                </g>
                <path d="M16,21 C36,10 72,8 100,8 C140,8 170,13 187,24" fill="none" stroke="#d9c8ff" strokeOpacity="0.55" strokeWidth="1.3" strokeLinecap="round" />
                <path d="M5,32 C5,27 8,23 12,20 C9,24 8,28 8,32 C8,36 9,40 12,44 C8,41 5,37 5,32 Z" fill="#8d7ac8" opacity="0.7" />
                {/* frame for the lamp sign */}
                <rect x="38" y="17" width="124" height="30" rx="4" fill="#05030a" stroke="#3a3060" strokeWidth="0.8" />
                {/* gondola on its struts, cabin lit, with an engine pod and prop behind */}
                <path d="M86,57 L90,63 M118,57 L114,63 M102,58 V63" stroke="#2a2350" strokeWidth="1.1" />
                <path d="M82,63 H120 Q124,63 122,68 Q120,72 114,72 H90 Q84,72 82,68 Q80,63 82,63 Z" fill="#141029" stroke="#5a4890" strokeWidth="0.8" />
                <path d="M86,65 h6 v3.4 h-6 Z M94,65 h6 v3.4 h-6 Z M102,65 h6 v3.4 h-6 Z M110,65 h6 v3.4 h-6 Z" fill="#ffe7a8" />
                <rect x="122" y="65" width="10" height="3.6" rx="1.8" fill="#1b1638" stroke="#5a4890" strokeWidth="0.6" />
                <ellipse className="blimp-prop" cx="133.4" cy="66.8" rx="0.9" ry="5" fill="#d9c8ff" opacity="0.5" />
                {/* running lights: red on the nose, green on the tail, white strobe under the belly */}
                <circle className="blimp-nav" cx="5" cy="32" r="1.5" fill="#ff3b5c" />
                <circle className="blimp-nav is-odd" cx="213" cy="32" r="1.4" fill="#8dff6b" />
                <circle className="blimp-strobe" cx="60" cy="57.4" r="1.3" fill="#fff" />
              </svg>
              {/* the message runs along the side in light bulbs */}
              <span className="blimp-led" aria-hidden="true">
                <span className="blimp-led-track">
                  <span>BUY BOOTINK...</span>
                  <span>BUY BOOTINK...</span>
                </span>
              </span>
            </a>
          </div>

          <div className="layer layer-front" ref={trackRef} style={{ width: px(TRACK_U * 2) }}>
            <Street goBlog={goBlog} />
            <div className="street-ghost" style={{ left: px(TRACK_U), width: px(TRACK_U) }} aria-hidden="true">
              <GhostCtx.Provider value>
                <Street goBlog={goBlog} />
              </GhostCtx.Provider>
            </div>
          </div>

          <div className="traffic" style={{ height: px(GROUND_U) }} aria-hidden="true">
            <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true">
              <defs>
                <linearGradient id="car-shade" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0" stopColor="#fff" stopOpacity="0.35" />
                  <stop offset="0.45" stopColor="#fff" stopOpacity="0" />
                  <stop offset="1" stopColor="#000" stopOpacity="0.45" />
                </linearGradient>
                <radialGradient id="car-beam" cx="0.12" cy="0.5" r="0.9">
                  <stop offset="0" stopColor="#fff3c0" stopOpacity="0.5" />
                  <stop offset="0.45" stopColor="#ffe6a0" stopOpacity="0.16" />
                  <stop offset="1" stopColor="#ffe6a0" stopOpacity="0" />
                </radialGradient>
                <linearGradient id="car-gloss" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0" stopColor="#fff" stopOpacity="0.22" />
                  <stop offset="1" stopColor="#fff" stopOpacity="0" />
                </linearGradient>
                <linearGradient id="car-edge" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0" stopColor="#fff" stopOpacity="0.75" />
                  <stop offset="0.4" stopColor="#fff" stopOpacity="0" />
                </linearGradient>
                <radialGradient id="car-halo">
                  <stop offset="0" stopColor="#fff6c8" stopOpacity="0.85" />
                  <stop offset="1" stopColor="#fff6c8" stopOpacity="0" />
                </radialGradient>
                <radialGradient id="car-tailglow">
                  <stop offset="0" stopColor="#ff2340" stopOpacity="0.7" />
                  <stop offset="1" stopColor="#ff2340" stopOpacity="0" />
                </radialGradient>
                <linearGradient id="car-glass" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0" stopColor="#9fe8ff" stopOpacity="0.35" />
                  <stop offset="0.5" stopColor="#ff4fd8" stopOpacity="0.12" />
                  <stop offset="1" stopColor="#000" stopOpacity="0" />
                </linearGradient>
              </defs>
            </svg>
            <Car className="lane-far car-a" />
            <Car className="lane-far car-c" />
            <Car className="lane-near car-b" />
            <Car className="lane-near car-d" />
          </div>


        </div>

        {/* plain-text copy of the city for screen readers and search engines */}
        <div className="sr-only">
          <h2>About Me</h2>
          {about.map((p, i) => <p key={i}>{p}</p>)}
          <h2>Experience</h2>
          <ul>{experience.map((j) => <li key={j.id}>{j.company}: {j.role}</li>)}</ul>
          <h2>Technical Skills</h2>
          <ul>{skills.map((s) => <li key={s.category}>{s.category}: {s.items.join(', ')}</li>)}</ul>
        </div>
      </section>

      {activeId && activeId !== 'contact' && (
        <div
          ref={cardRef}
          className="city-card"
          role="dialog"
          aria-label="Details"
          onPointerEnter={() => clearTimeout(closeTimer.current)}
          onPointerLeave={(e) => e.pointerType === 'mouse' && openedByRef.current === 'hover' && scheduleClose()}
        >
          <button type="button" className="city-card-close" aria-label="Close" onClick={close}>×</button>
          <CardBody id={activeId} onNavigate={goBlog} />
        </div>
      )}
    </CityCtx.Provider>
  );
}

export default City;
