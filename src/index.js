// src/index.js

// Must stay the first import: it silences verbose console output in
// production before any other module is evaluated. See quietConsole.js.
import './utils/quietConsole';

import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

// public/index.html keeps the body hidden until this class is present, to
// avoid a flash of unstyled content. It used to be set by an inline script;
// the security policy forbids inline scripts, so the bundle sets it instead.
document.body.classList.add('loaded');

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
