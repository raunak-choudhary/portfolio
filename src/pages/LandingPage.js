// src/pages/LandingPage.js

import React from 'react';
import Hero from '../components/sections/Hero/Hero';
import About from '../components/sections/About/About';
import Navigation from '../components/sections/Navigation/Navigation';
import Contact from '../components/sections/Contact/Contact';

const LandingPage = () => {
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