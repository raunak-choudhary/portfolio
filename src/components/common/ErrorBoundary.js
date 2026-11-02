// src/components/common/ErrorBoundary.js

import React from 'react';
import './ErrorBoundary.css';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    this.setState({
      error: error,
      errorInfo: errorInfo
    });
    
    // Log error to console in development
    if (process.env.NODE_ENV === 'development') {
      console.error('ErrorBoundary caught an error:', error, errorInfo);
    }
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="error-boundary">
          <div className="error-container glass-card">
            <div className="error-icon">⚠️</div>
            <h2 className="error-title shimmer-text">Oops! Something went wrong</h2>
            <p className="error-message">
              {this.props.fallbackMessage || 
               "We're sorry, but something unexpected happened. Please try refreshing the page."}
            </p>
            
            {process.env.NODE_ENV === 'development' && this.state.error && (
              <details className="error-details">
                <summary>Error Details (Development)</summary>
                <div className="error-stack">
                  <strong>Error:</strong> {this.state.error.toString()}
                  <br />
                  <strong>Stack Trace:</strong>
                  <pre>{this.state.errorInfo.componentStack}</pre>
                </div>
              </details>
            )}
            
            <div className="error-actions">
              <button onClick={this.handleRetry} className="neon-button">
                Try Again
              </button>
              <button 
                onClick={() => window.location.reload()} 
                className="neon-button secondary"
              >
                Refresh Page
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;