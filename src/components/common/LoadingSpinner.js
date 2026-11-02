// src/components/common/LoadingSpinner.js

import React from 'react';
import './LoadingSpinner.css';

const LoadingSpinner = ({ size = 'medium', message = 'Loading...', className = '' }) => {
  const sizeClass = `spinner-${size}`;
  
  return (
    <div className={`loading-spinner-container ${className}`}>
      <div className={`loading-spinner ${sizeClass}`}>
        <div className="spinner-ring">
          <div className="spinner-ring-inner"></div>
        </div>
        <div className="spinner-glow"></div>
      </div>
      {message && (
        <p className="loading-message shimmer-text">{message}</p>
      )}
    </div>
  );
};

export default LoadingSpinner;