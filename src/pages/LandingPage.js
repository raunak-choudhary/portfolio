// src/pages/LandingPage.js

import React, { useEffect } from 'react';
import Hero from '../components/sections/Hero/Hero';
import About from '../components/sections/About/About';
import Navigation from '../components/sections/Navigation/Navigation';
import Contact from '../components/sections/Contact/Contact';
import { whenElementExists } from '../utils/homeSection';

/** Only plain ids are looked up, never arbitrary text from the address. */
const SECTION_ID = /^[A-Za-z][\w-]{0,40}$/;

/**
 * Opening /home#about (a shared link, or the admin's View on site) lands on
 * the section. The browser's own jump to the anchor happens before the
 * sections have loaded their content, so it finds the section at the top
 * and stays there; this waits until the section has held its place for
 * twelve frames, then jumps.
 */
export function useLandOnHash(hash = window.location.hash) {
  useEffect(() => {
    let id = '';
    try { id = decodeURIComponent((hash || '').replace(/^#/, '')); } catch { return undefined; }
    if (!SECTION_ID.test(id)) return undefined;
    return whenElementExists(id, (element) => element.scrollIntoView({ behavior: 'auto' }), { stableFrames: 12 });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- first load only; in-page links scroll themselves
}

const LandingPage = () => {
  useLandOnHash();
  return (
    <div className="page-wrapper">
      {/* Hero Section - ID for "Home" navigation */}
      <section id="hero">
        <Hero />
      </section>
      
      {/* About Section - ID for "About" navigation */}
      <section id="about">
        <About />
      </section>
      
      {/* Navigation Cards Section - ID for "Explore Portfolio" navigation */}
      <section id="navigation">
        <Navigation />
      </section>
      
      {/* Contact Section - ID for "Contact Me" navigation */}
      <section id="contact">
        <Contact />
      </section>
    </div>
  );
};

export default LandingPage;