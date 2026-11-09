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

// Where each nav target sits along the street (centre x, in u). Home puts the street start at the left edge.
const TARGETS = {
  home: null,
  about: 152,
  experience: { left: 179 }, // land at the start of the avenue, Bootink first
  skills: 448,
  blog: 500,
  contact: 550,
};

const DISTRICTS = [
  { name: 'Downtown', to: 176, nav: 'about' },
  { name: 'Career Ave', to: 408, nav: 'experience' },
  { name: 'Skill St', to: 480, nav: 'skills' },
  { name: 'Broadcast Hill', to: Infinity, nav: 'contact' },
];

const EXP_HEIGHTS = [60, 55, 50, 46, 42];
const EXP_COLORS = ['#36196e', '#3b1f73', '#33196a', '#40237a', '#2e1862'];

const SPEED_U = 7; // cruising speed, street units per second
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

function Spot({ id, at, label, className = '', style, onActivate, children }) {
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
      onPointerEnter={(e) => e.pointerType === 'mouse' && ctx.mouseMoved() && ctx.open(id, e.currentTarget, 'hover')}
      onPointerMove={(e) => e.pointerType === 'mouse' && !active && ctx.open(id, e.currentTarget, 'hover')}
      onPointerLeave={(e) => e.pointerType === 'mouse' && ctx.scheduleClose()}
      onFocus={(e) => {
        ctx.reveal(at);
        ctx.open(id, e.currentTarget, 'focus');
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

function Skyline({ seed, period, copies, minW, maxW, minH, maxH, className }) {
  const { u } = useContext(CityCtx);
  const blocks = useMemo(() => {
    const rnd = mulberry32(seed);
    const out = [];
    let x = 0;
    while (x < period - minW) {
      const w = Math.min(minW + rnd() * (maxW - minW), period - x);
      const h = minH + rnd() * (maxH - minH);
      const spire = rnd() < 0.18;
      const dome = !spire && rnd() < 0.08;
      const tank = !spire && !dome && rnd() < 0.25;
      const glow = rnd() < 0.14 ? ROOF_GLOWS[Math.floor(rnd() * ROOF_GLOWS.length)] : null;
      out.push({ x, w, h, spire, dome, tank, glow, tankAt: 15 + rnd() * 45 });
      x += w + rnd() * 3;
    }
    return out;
  }, [seed, period, minW, maxW, minH, maxH]);
  return (
    <div className={`skyline ${className}`} aria-hidden="true">
      {Array.from({ length: copies }, (_, k) =>
        blocks.map((b, i) => (
          <div
            key={`${k}-${i}`}
            className={`sky-bldg ${b.spire ? 'spire' : ''} ${b.dome ? 'dome' : ''}`}
            style={{ left: (b.x + k * period) * u, width: b.w * u, height: b.h * u }}
          >
            {b.tank && <span className="tank" style={{ left: `${b.tankAt}%` }} />}
            {b.glow && <span className="roof-glow" style={{ '--c': b.glow }} />}
          </div>
        ))
      )}
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
        <p className="card-kicker">Skill Tower · Level {level + 1}</p>
        <h3>{cat.category}</h3>
        <div className="card-tags" style={{ '--tag': cat.color }}>{cat.items.map((t) => <span key={t}>{t}</span>)}</div>
      </>
    );
  }
  if (id === 'blog') {
    return (
      <>
        <p className="card-kicker">The Daily Blog</p>
        <h3>Latest headlines</h3>
        <ul className="card-list">
          {blogPosts.map((p) => (
            <li key={p.id}>
              <button type="button" onClick={onNavigate}>{p.title.replace(/^Blog Post \d+:\s*/, '')}</button>
              <small>{p.date}</small>
            </li>
          ))}
        </ul>
        <p className="card-hint">Click the newsstand to read the blog.</p>
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

// [row, col] of the arched windows that are dark tonight
const NEWS_DARK = new Set(['0-1', '1-3', '2-0', '2-2']);

/* ---------- traffic: original side-profile JDM-style cars ---------- */

const CAR_BODIES = {
  // boxy, muscular GT coupe: flared arches, tall wing, quad round tail lights
  gt: {
    body: 'M6,45 L6,30 Q6,27 12,27 L42,26 L60,14 Q63,12 68,12 L112,12 Q117,12 121,15 L140,26 L186,28 Q196,29 197,35 L197,45 Q197,47 193,47 L177,47 A17,17 0 0 0 143,47 L63,47 A17,17 0 0 0 29,47 L10,47 Q6,47 6,45 Z',
    glass: 'M58,26 L66,15 L112,15 L132,26 Z',
    pillar: 'M90,15 L94,15 L94,26 L90,26 Z',
    doors: [64, 120],
    wheels: [46, 160],
    head: [184, 30, 11, 3],
    extras: (paint) => (
      <g>
        <rect x="13" y="17" width="3" height="10" fill={paint} />
        <rect x="29" y="17" width="3" height="9" fill={paint} />
        <path d="M1,15 L40,14 L40,18 L3,19 Z" fill={paint} />
        <path d="M1,15 L40,14 L40,18 L3,19 Z" fill="#000" opacity="0.25" />
        <path d="M150,31 l6,-3 M154,32 l6,-3 M158,33 l6,-3" stroke="rgba(0,0,0,0.45)" strokeWidth="1.2" />
        <circle cx="8.5" cy="31" r="2.3" className="tail" />
        <circle cx="8.5" cy="37" r="2.3" className="tail" />
      </g>
    ),
  },
  // curvy long-hood grand tourer with a bubble roof and hoop wing
  tourer: {
    body: 'M8,44 Q4,40 6,34 Q8,29 22,27 L50,25 Q62,13 82,12 Q100,11 112,15 L132,25 Q160,27 184,30 Q196,32 197,38 L196,44 Q195,47 190,47 L176,47 A16,16 0 0 0 144,47 L62,47 A16,16 0 0 0 30,47 L12,47 Q8,47 8,44 Z',
    glass: 'M56,25 Q66,15 82,14 Q98,13 109,17 L126,25 Z',
    pillar: 'M93,13.5 L97,13.5 L99,25 L95,25 Z',
    doors: [66, 122],
    wheels: [46, 160],
    head: [186, 31, 9, 3],
    extras: (paint) => (
      <g>
        <path d="M13,27 Q11,16 20,16 L34,16 Q41,16 39,26" fill="none" stroke={paint} strokeWidth="2.6" />
        <path d="M13,27 Q11,16 20,16 L34,16 Q41,16 39,26" fill="none" stroke="#000" strokeOpacity="0.2" strokeWidth="2.6" />
        <rect x="4.5" y="31" width="7" height="3.2" rx="1.6" className="tail" />
      </g>
    ),
  },
  // short, tall hot hatch with a roof spoiler
  hatch: {
    body: 'M40,45 L40,21 Q40,13 49,12.5 L102,12 Q107,12 111,15 L130,26 L166,29 Q175,30 177,36 L177,45 Q177,47 173,47 L165,47 A15,15 0 0 0 135,47 L79,47 A15,15 0 0 0 49,47 L44,47 Q40,47 40,45 Z',
    glass: 'M45,24 L47,15 Q48,14 52,14 L102,13.5 Q106,13.5 109,16 L123,26 L45,26 Z',
    pillar: 'M90,13.5 L94,13.5 L94,26 L90,26 Z',
    doors: [80, 116],
    wheels: [64, 150],
    wheelScale: 0.9,
    head: [168, 31, 8, 3],
    extras: (paint) => (
      <g>
        <path d="M36,12.5 L62,11.5 L62,14 L39,15.5 Z" fill={paint} />
        <path d="M36,12.5 L62,11.5 L62,14 L39,15.5 Z" fill="#000" opacity="0.25" />
        <rect x="39.5" y="25" width="3" height="7" rx="1" className="tail" />
        <rect x="150" y="39" width="27" height="2" fill="rgba(0,0,0,0.5)" />
      </g>
    ),
  },
};

function Wheel({ cx, scale = 1 }) {
  return (
    <g className="wheel" transform={`translate(${cx} 46) scale(${scale})`}>
      <circle r="13" fill="#0b0814" />
      <circle r="12" fill="none" stroke="#1d1830" strokeWidth="2" />
      <g className="rim">
        <circle r="8.5" fill="#2a2638" stroke="#c9c6d6" strokeWidth="1.4" />
        {[0, 60, 120, 180, 240, 300].map((a) => (
          <rect key={a} x="-1" y="-8" width="2" height="8" fill="#d8d5e4" transform={`rotate(${a})`} />
        ))}
        <circle r="2.2" fill="#8d89a0" />
      </g>
    </g>
  );
}

function Car({ type, paint, stripe, glow, tint, rim, className }) {
  const b = CAR_BODIES[type];
  const [hx, hy, hw, hh] = b.head;
  const [w1, w2] = b.wheels;
  const [d1, d2] = b.doors;
  return (
    <div className={`car car-${type} ${className}`} style={{ '--glow': glow }}>
      <svg viewBox="0 0 204 62" aria-hidden="true">
        <ellipse className="underglow" cx={(w1 + w2) / 2} cy="55" rx={(w2 - w1) / 2 + 40} ry="5" fill={glow} />
        <path className="beam" d={`M${hx + hw},${hy} L${hx + hw + 70},${hy - 10} L${hx + hw + 70},${hy + 16} Z`} />
        <path d={b.body} fill={paint} />
        <path d={b.body} fill="url(#car-shade)" stroke={rim} strokeWidth={rim ? 0.8 : undefined} />
        {stripe && <path d="M10,38 L194,38 L194,41 L10,41 Z" fill={stripe} opacity="0.9" clipPath={`url(#clip-${type})`} />}
        <clipPath id={`clip-${type}`}><path d={b.body} /></clipPath>
        <path d={b.glass} fill={tint ? '#050309' : '#1a1433'} />
        <path d={b.glass} fill="url(#car-glass)" opacity={tint ? 0.25 : 1} />
        <path d={b.pillar} fill={paint} />
        <path d={`M${d1},28 L${d1},44 M${d2},28 L${d2},44`} stroke="rgba(0,0,0,0.35)" strokeWidth="0.8" />
        <rect x={d2 - 14} y="31" width="7" height="1.6" rx="0.8" fill="rgba(0,0,0,0.45)" />
        {b.extras(paint)}
        <rect x={hx} y={hy} width={hw} height={hh} rx="1" fill="#fff6d5" />
        <Wheel cx={w1} scale={b.wheelScale} />
        <Wheel cx={w2} scale={b.wheelScale} />
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
    <div className="metro" style={{ left: x * u, bottom: GROUND_U * u, width: 74 * u, height: 23 * u }}>
      {/* departure board: each line drives you to that part of the city */}
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
        </div>
        <div className="metro-board-legs" aria-hidden="true" />
      </div>

      {/* the entrance itself */}
      <div className="metro-entrance" aria-hidden="true">
        <span className="metro-lamp ml-left" />
        <span className="metro-lamp ml-right" />
        <div className="metro-sign">
          <b>M</b>
          <span>METRO</span>
        </div>
        <div className="metro-arch">
          <div className="metro-stairs" />
          <div className="metro-train" />
        </div>
        <div className="metro-rail rl-left" />
        <div className="metro-rail rl-right" />
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
    <div className="hobby-hall" style={{ left: x * u, bottom: GROUND_U * u, width: 44 * u, height: 40 * u }} aria-hidden="true">
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
      <Spill x={576} w={48} color="rgba(255, 180, 90, 0.5)" />
      <Spill x={128} w={48} color="rgba(255, 207, 106, 0.55)" />
      <Spill x={390} w={20} color="rgba(255, 150, 80, 0.5)" />
      <Spill x={430} w={36} color="rgba(255, 190, 110, 0.45)" />
      <Spill x={480} w={40} color="rgba(255, 210, 130, 0.5)" />

      {/* storm drains along the curb */}
      <Grate x={56} />
      <Grate x={216} steam />
      <Grate x={362} />
      <Grate x={455} steam />
      <Grate x={566} />

      {/* rooftop cats: black on The Gabriel's ledge, orange on the newspaper's cornice */}
      <Cat x={134.4} y={GROUND_U + 44} fur="#0b0912" eyes="#ffe14f" />
      <Cat x={515.4} y={GROUND_U + 52.4} fur="#f08a2c" eyes="#7dff8a" stripes="#b8571a" flip />

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
      <Metro x={24} />

      <Building x={104} w={24} h={68} seed={11} color="#33186c" className="antenna" />

      {/* About Me: an art-deco movie theater whose marquee and posters tell the story */}
      <div className="theater" style={{ left: px(132), bottom: px(GROUND_U), width: px(40), height: px(58) }} aria-hidden="true">
        <div className="theater-crown" />
        <span className="pennant pl" />
        <span className="pennant pr" />
        <div className="theater-body">
          <div className="theater-sunburst" />
          <div className="porthole ph-left" />
          <div className="porthole ph-right" />
          <div className="theater-entrance">
            {theater.posters.map((p, i) => (
              <div key={p.title} className={`poster ${i ? 'poster-right' : 'poster-left'}`} style={{ '--neon': p.color }}>
                <small>{p.part}</small>
                <strong>{p.title}</strong>
                <em>{p.credit}</em>
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
          <div className="marquee-board">
            <small>{theater.marquee[0]}</small>
            <strong>{theater.marquee[1]}</strong>
            <span>{theater.marquee[2]}</span>
          </div>
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
            <Building x={0} base={0} w={34} h={h} seed={31 + i} color={EXP_COLORS[i]} lit={job.lights} className={`flat office look-${job.look}`} windows={job.look !== 'glass'}>
              {job.look === 'glass' && <div className="glass-wall" aria-hidden="true" />}
              {job.look === 'ink' && <InkDrips />}
              <div className="lobby-sign" style={{ '--glow': job.color }}>{job.role}</div>
              {job.look === 'workshop' ? (
                <div className="roller-doors" aria-hidden="true"><span /><span className="is-open" /></div>
              ) : (
                <div className="lobby-door" aria-hidden="true" />
              )}
              <div className="years-plate">{job.years}</div>
            </Building>
            {job.look === 'ladder' && <SideLadder h={h + 7} />}
            {job.look === 'solar' && (
              <>
                <div className="solar-panels" style={{ bottom: px(h) }} aria-hidden="true"><span /><span /><span /><span /></div>
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

      {/* ---- Skill Tower: one floor per skill category, Languages at the foundation ---- */}
      <StreetSign x={406} text="SKILL ST" />
      <div className="skill-tower" style={{ left: px(424), bottom: px(GROUND_U), width: px(48), height: px(72) }}>
        <div className="tower-crown" aria-hidden="true">
          <span>SKILL TOWER</span>
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
                <Windows cols={11} rows={2} seed={60 + i} lit={0.6} />
              </div>
              <div className="blade-sign floor-blade">{cat.short}</div>
            </Spot>
          ))}
        <div className="tower-lobby" aria-hidden="true"><span /><span /></div>
      </div>
      <StreetLamp x={476} />

      {/* ---- Broadcast Hill ---- */}
      {/* The Daily Blog: an old New York newspaper headquarters */}
      <Spot id="blog" at={500} label="The Daily Blog building: open the blog" onActivate={goBlog} className="news-hq" style={{ left: px(482), bottom: px(GROUND_U), width: px(36), height: px(60) }}>
        <div className="news-roof" style={{ bottom: px(52) }} aria-hidden="true">
          <div className="news-roof-board">The Daily Blog</div>
          <div className="news-roof-scaffold" />
        </div>
        <div className="news-facade" style={{ height: px(52) }}>
          <div className="news-cornice" />
          <div className="news-windows" aria-hidden="true">
            {[0, 1, 2].map((r) =>
              [0, 1, 2, 3].map((c) => <span key={`${r}-${c}`} className={NEWS_DARK.has(`${r}-${c}`) ? 'is-dark' : ''} />)
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
      <HobbyHall x={578} />

      {/* end of the street: a send-off sign before the loop brings the Welcome sign back around */}
      <div className="thanks-sign" style={{ left: px(632), bottom: px(GROUND_U), width: px(34), height: px(40) }}>
        <div className="thanks-board">
          <span className="thanks-line">Thanks for</span>
          <span className="thanks-big">COMING!</span>
          <span className="thanks-sub">Come back soon</span>
          <small>© {new Date().getFullYear()} {profile.name}</small>
        </div>
        <div className="billboard-poles"><span /><span /></div>
      </div>

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
  const txRef = useRef(0); // current street offset in px, always within [0, TRACK_U * u)
  const glideRef = useRef(null); // in-flight nav glide { from, to, start, dur }
  const pausedUntilRef = useRef(0);

  const [size, setSize] = useState({ u: 8, vw: 1200, vh: 800 });
  const [activeId, setActiveId] = useState(null);
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

    const tick = (now) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const { u } = metrics.current;
      const period = TRACK_U * u;
      const glide = glideRef.current;
      // tap/keyboard-opened cards hold the city still; hover cards ride along
      const busy = (activeIdRef.current && openedByRef.current !== 'hover') || document.hidden;

      if (glide) {
        const t = Math.min(1, (now - glide.start) / glide.dur);
        const e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; // ease in-out
        txRef.current = glide.from + (glide.to - glide.from) * e;
        if (t >= 1) {
          glideRef.current = null;
          velocity = 0;
        }
      } else if (busy) {
        velocity = 0;
        pausedUntilRef.current = Math.max(pausedUntilRef.current, now + 800);
      } else if (!reduce && now >= pausedUntilRef.current) {
        velocity += (SPEED_U * u - velocity) * Math.min(1, dt * 1.2); // ease back up to speed
        txRef.current += velocity * dt;
      }
      txRef.current = ((txRef.current % period) + period) % period;
      paint();
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [paint]);

  /* glide forward to a spot on the street */
  const glideTo = useCallback((xU, instant = false) => {
    const { u, vw } = metrics.current;
    const period = TRACK_U * u;
    const target = xU == null ? 0 : typeof xU === 'object' ? xU.left * u : xU * u - vw / 2;
    const from = txRef.current;
    // always drive forward (to the right); the loop brings every landmark back around
    const delta = (((target - from) % period) + period) % period;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    pausedUntilRef.current = performance.now() + 4000; // linger so the landmark can be read
    if (instant || reduce) {
      glideRef.current = null;
      txRef.current = from + delta;
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
          <div className="sky" aria-hidden="true">
            <Stars />
            <div className="moon" />
          </div>

          {/* the blimp flies in the distance, behind every skyline layer */}
          <div className="blimp-layer">
            <a className="blimp" href="https://bootink.com" target="_blank" rel="noopener noreferrer" aria-label="Buy Bootink at bootink.com">
              <svg className="blimp-svg" viewBox="0 0 220 70" aria-hidden="true">
                {/* cross-shaped tail fins */}
                <g stroke="#7d62b8" strokeWidth="1.3" strokeLinejoin="round">
                  <path d="M176,22 L196,5 L211,7 L201,25 Z" fill="#0c0918" />
                  <path d="M176,42 L196,59 L211,57 L201,39 Z" fill="#0c0918" />
                  <path d="M184,29.5 L214,27.5 L214,36.5 L184,34.5 Z" fill="#15112a" />
                </g>
                {/* envelope */}
                <path className="blimp-hull" d="M6,32 C6,14 48,7 100,7 C150,7 184,16 196,32 C184,48 150,57 100,57 C48,57 6,50 6,32 Z" fill="#0c0918" stroke="#7d62b8" strokeWidth="1.4" />
                <path d="M14,24 C30,12 70,9 100,9 C140,9 170,15 186,26" fill="none" stroke="rgba(190,150,255,0.35)" strokeWidth="1.4" />
                {/* gondola */}
                <path d="M88,56 L90,61 L112,61 L114,56" fill="none" stroke="#0c0918" strokeWidth="1.2" />
                <rect x="86" y="59" width="30" height="6" rx="3" fill="#0c0918" stroke="#7d62b8" strokeWidth="1.1" />
                <rect x="90" y="61" width="3" height="2" fill="#ffe7a8" opacity="0.7" />
                <rect x="96" y="61" width="3" height="2" fill="#ffe7a8" opacity="0.7" />
                <rect x="102" y="61" width="3" height="2" fill="#ffe7a8" opacity="0.7" />
              </svg>
              <span className="blimp-led" aria-hidden="true">
                <span>BUY</span>
                <span>BOOTINK...</span>
              </span>
            </a>
          </div>

          <div className="layer layer-far" ref={farRef}>
            <Skyline seed={7} period={TRACK_U * FAR_FACTOR} copies={Math.ceil(size.vw / u / (TRACK_U * FAR_FACTOR)) + 2} minW={8} maxW={20} minH={34} maxH={72} className="far" />
          </div>
          <div className="layer layer-mid" ref={midRef}>
            <Skyline seed={19} period={TRACK_U * MID_FACTOR} copies={Math.ceil(size.vw / u / (TRACK_U * MID_FACTOR)) + 2} minW={10} maxW={24} minH={24} maxH={50} className="mid" />
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
                <linearGradient id="car-beam" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0" stopColor="#fff6c8" stopOpacity="0.28" />
                  <stop offset="1" stopColor="#fff6c8" stopOpacity="0" />
                </linearGradient>
                <linearGradient id="car-glass" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0" stopColor="#9fe8ff" stopOpacity="0.35" />
                  <stop offset="0.5" stopColor="#ff4fd8" stopOpacity="0.12" />
                  <stop offset="1" stopColor="#000" stopOpacity="0" />
                </linearGradient>
              </defs>
            </svg>
            <Car type="gt" paint="#1f6fe0" glow="#4fe3ff" className="lane-far car-a" />
            <Car type="hatch" paint="#ffd21f" stripe="#d12f4a" glow="#ff4fd8" className="lane-far car-c" />
            <Car type="tourer" paint="#b0101e" glow="#ffe14f" className="lane-near car-b" />
            <Car type="gt" paint="#0d0c14" glow="#8dff6b" tint rim="rgba(190, 170, 255, 0.35)" className="lane-near car-d" />
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
