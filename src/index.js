// src/index.js

import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

import './utils/routeEncoder';
import './utils/routeNavigation'; 

// Ensure crypto-js is loaded
import 'crypto-js';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);