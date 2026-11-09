import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import '../styles/Newspaper.css';
import { blogPosts, profile } from '../data/content';

const shortTitle = (t) => t.replace(/^Blog Post \d+:\s*/, '');
const paragraphs = (text) =>
  text
    .split('\n\n')
    .map((p) => p.trim())
    .filter(Boolean);

function Newspaper() {
  const navigate = useNavigate();
  const [leadId, setLeadId] = useState(blogPosts[0].id);
  const [closing, setClosing] = useState(false);
  const paperRef = useRef(null);
  const bodyRef = useRef(null);

  const lead = blogPosts.find((p) => p.id === leadId);
  const others = blogPosts.filter((p) => p.id !== leadId);
  const today = new Date().toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  const close = () => {
    if (closing) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    setClosing(true);
    setTimeout(() => navigate('/'), reduce ? 0 : 380);
  };

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && close();
    window.addEventListener('keydown', onKey);
    paperRef.current?.focus();
    return () => window.removeEventListener('keydown', onKey);
  });

  const read = (id) => {
    setLeadId(id);
    bodyRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className={`paper-backdrop ${closing ? 'is-closing' : ''}`} onClick={close}>
      <article
        ref={paperRef}
        className="paper"
        role="dialog"
        aria-modal="true"
        aria-label="The Daily Blog"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <button type="button" className="paper-close" onClick={close} aria-label="Close newspaper">×</button>

        <header className="paper-head">
          <div className="paper-ears">
            <span>Sydney Edition</span>
            <span>Price: Free</span>
          </div>
          <h1 className="paper-masthead">The Daily Blog</h1>
          <div className="paper-dateline">
            <span>Vol. I · No. {blogPosts.length}</span>
            <span>{today}</span>
            <span>By {profile.name}</span>
          </div>
        </header>

        <div className="paper-body" ref={bodyRef}>
          <section className="paper-lead" key={lead.id}>
            <p className="paper-kicker">Lead story · {lead.date}</p>
            <h2 className="paper-headline">{shortTitle(lead.title)}</h2>
            <div className="paper-columns">
              {paragraphs(lead.content).map((p, i) => (
                <p key={i} className={i === 0 ? 'has-dropcap' : undefined}>{p}</p>
              ))}
            </div>
          </section>

          <aside className="paper-side">
            <h3 className="paper-side-title">Also in this edition</h3>
            {others.map((p) => (
              <button type="button" key={p.id} className="paper-story" onClick={() => read(p.id)}>
                <span className="paper-story-date">{p.date}</span>
                <strong>{shortTitle(p.title)}</strong>
                <span className="paper-story-teaser">{paragraphs(p.content)[0].slice(0, 140)}…</span>
                <span className="paper-story-more">Read story →</span>
              </button>
            ))}
            <div className="paper-ad">
              <small>Advertisement</small>
              <strong>BUY BOOTINK</strong>
              <span>As seen on the blimp.</span>
            </div>
          </aside>
        </div>
      </article>
    </div>
  );
}

export default Newspaper;
