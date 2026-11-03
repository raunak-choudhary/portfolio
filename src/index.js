// src/index.js

// Must stay the first import: it silences verbose console output in
// production before any other module is evaluated. See quietConsole.js.
import './utils/quietConsole';

import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
