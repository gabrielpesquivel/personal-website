import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link as RouterLink, useLocation, useNavigate } from 'react-router-dom';
import { FaLinkedin, FaGithub, FaEnvelope, FaBars, FaTimes } from 'react-icons/fa';
import { SiLeetcode } from 'react-icons/si';
import '../styles/Navbar.css';
import { CITY_DISTRICT_EVENT, getCurrentDistrict, goToCityTarget } from './cityNav';

const STOPS = [
  { id: 'about', label: 'About' },
  { id: 'experience', label: 'Experience' },
  { id: 'skills', label: 'Skills' },
  { id: 'contact', label: 'Contact' },
];

const SOCIALS = [
  { href: 'mailto:gabrielpawluesquivel@gmail.com', label: 'Email', Icon: FaEnvelope },
  { href: 'https://www.linkedin.com/in/gabriel-esquivel-9a65a4209', label: 'LinkedIn', Icon: FaLinkedin },
  { href: 'https://github.com/gabrielpesquivel', label: 'GitHub', Icon: FaGithub },
  { href: 'https://leetcode.com/gabidonprime', label: 'Leetcode', Icon: SiLeetcode },
];

function Navbar() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [district, setDistrict] = useState(getCurrentDistrict);
  const location = useLocation();
  const navigate = useNavigate();
  const onCity = location.pathname === '/';
  const linksRef = useRef(null);
  const pillRef = useRef(null);
  const activeId = location.pathname === '/blog' ? 'blog' : district;

  // one pink pill that glides to whichever link is active
  useLayoutEffect(() => {
    const place = () => {
      const pill = pillRef.current;
      const el = linksRef.current && linksRef.current.querySelector('a.is-active');
      if (!pill) return;
      if (!el || !el.offsetWidth) {
        pill.style.opacity = '0';
        return;
      }
      const box = linksRef.current.getBoundingClientRect();
      const r = el.getBoundingClientRect();
      pill.style.opacity = '1';
      pill.style.width = `${r.width}px`;
      pill.style.height = `${r.height}px`;
      pill.style.transform = `translate(${r.left - box.left}px, ${r.top - box.top}px)`;
    };
    place();
    window.addEventListener('resize', place);
    return () => window.removeEventListener('resize', place);
  }, [activeId, isMenuOpen]);

  // light up whichever part of the city is currently driving past
  useEffect(() => {
    const onDistrict = (e) => setDistrict(e.detail);
    window.addEventListener(CITY_DISTRICT_EVENT, onDistrict);
    return () => window.removeEventListener(CITY_DISTRICT_EVENT, onDistrict);
  }, []);

  const closeMenu = () => setIsMenuOpen(false);

  const goTo = (target) => (e) => {
    e.preventDefault();
    closeMenu();
    // the city never unmounts, so it can start driving while we leave the blog
    if (!onCity) navigate('/');
    goToCityTarget(target);
  };

  return (
    <nav className={`navbar ${isMenuOpen ? 'is-open' : ''}`}>
      <RouterLink to="/" className="nav-brand" onClick={goTo('home')}>
        <span className="nav-badge" aria-hidden="true">GE</span>
        <span className="nav-name">Gabriel Esquivel</span>
      </RouterLink>

      <ul className="nav-links" ref={linksRef}>
        <li className="nav-pill" ref={pillRef} aria-hidden="true" />
        {STOPS.map((stop) => {
          const active = activeId === stop.id;
          return (
            <li key={stop.id}>
              <a href={`/#${stop.id}`} onClick={goTo(stop.id)} className={active ? 'is-active' : ''} aria-current={active ? 'location' : undefined}>
                {stop.label}
              </a>
            </li>
          );
        })}
        <li>
          <RouterLink to="/blog" onClick={closeMenu} className={activeId === 'blog' ? 'is-active' : ''}>
            Blog
          </RouterLink>
        </li>
      </ul>

      <div className="nav-socials">
        {SOCIALS.map(({ href, label, Icon }) => (
          <a key={label} href={href} target="_blank" rel="noopener noreferrer" aria-label={label} title={label}>
            <Icon />
          </a>
        ))}
      </div>

      <button className="nav-toggle" onClick={() => setIsMenuOpen((v) => !v)} aria-label="Toggle menu" aria-expanded={isMenuOpen}>
        {isMenuOpen ? <FaTimes /> : <FaBars />}
      </button>
    </nav>
  );
}

export default Navbar;
