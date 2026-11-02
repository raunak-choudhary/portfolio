// src/utils/viewportUtils.js

/**
 * Viewport utility functions to fix scaling issues between localhost and production
 */

export class ViewportFixer {
  constructor() {
    this.isInitialized = false;
    this.originalZoom = null;
    this.init();
  }

  /**
   * Initialize viewport fixes
   */
  init() {
    if (this.isInitialized) return;
    
    // Run fixes immediately
    this.applyImmediateFixes();
    
    // Run fixes when DOM is ready
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => this.applyDOMReadyFixes());
    } else {
      this.applyDOMReadyFixes();
    }
    
    // Run fixes when window loads
    window.addEventListener('load', () => this.applyWindowLoadFixes());
    
    // Handle orientation changes (mobile)
    window.addEventListener('orientationchange', () => {
      setTimeout(() => this.applyOrientationFixes(), 100);
    });
    
    // Handle resize events
    let resizeTimeout;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(() => this.applyResizeFixes(), 150);
    });
    
    this.isInitialized = true;
  }

  /**
   * Apply immediate fixes (runs synchronously)
   */
  applyImmediateFixes() {
    const html = document.documentElement;
    const body = document.body;
    
    // Force zoom reset
    if (html) {
      html.style.zoom = '1';
      html.style.webkitTransform = 'scale(1)';
      html.style.transform = 'scale(1)';
      html.style.transformOrigin = '0 0';
      html.style.fontSize = '16px';
    }
    
    if (body) {
      body.style.zoom = '1';
      body.style.webkitTransform = 'scale(1)';
      body.style.transform = 'scale(1)';
      body.style.transformOrigin = '0 0';
      body.style.fontSize = '16px';
    }
  }

  /**
   * Apply fixes when DOM is ready
   */
  applyDOMReadyFixes() {
    // Fix viewport meta tag if needed
    this.ensureViewportMetaTag();
    
    // Apply browser-specific fixes
    this.applyBrowserSpecificFixes();
    
    // Fix high-DPI scaling
    this.fixHighDPIScaling();
    
    // Add loaded class to body
    document.body.classList.add('loaded');
  }

  /**
   * Apply fixes when window fully loads
   */
  applyWindowLoadFixes() {
    // Final viewport adjustments
    this.finalViewportAdjustments();
    
    // Check and fix any scaling issues
    this.detectAndFixScalingIssues();
  }

  /**
   * Apply fixes when orientation changes
   */
  applyOrientationFixes() {
    // Reset viewport after orientation change
    this.applyImmediateFixes();
    this.fixHighDPIScaling();
  }

  /**
   * Apply fixes when window resizes
   */
  applyResizeFixes() {
    // Ensure consistent scaling during resize
    this.maintainConsistentScaling();
  }

  /**
   * Ensure proper viewport meta tag exists
   */
  ensureViewportMetaTag() {
    let viewportMeta = document.querySelector('meta[name="viewport"]');
    
    if (!viewportMeta) {
      viewportMeta = document.createElement('meta');
      viewportMeta.name = 'viewport';
      document.head.appendChild(viewportMeta);
    }
    
    // Set proper viewport content
    const properContent = 'width=device-width, initial-scale=1.0, maximum-scale=5.0, minimum-scale=1.0, user-scalable=yes, viewport-fit=cover';
    
    if (viewportMeta.content !== properContent) {
      viewportMeta.content = properContent;
    }
  }

  /**
   * Apply browser-specific fixes
   */
  applyBrowserSpecificFixes() {
    const userAgent = navigator.userAgent;
    const html = document.documentElement;
    const body = document.body;
    
    // Safari fixes
    if (userAgent.includes('Safari') && !userAgent.includes('Chrome')) {
      html.style.webkitTextSizeAdjust = '100%';
      body.style.webkitTextSizeAdjust = '100%';
    }
    
    // Chrome fixes
    if (userAgent.includes('Chrome')) {
      html.style.zoom = '1';
      body.style.zoom = '1';
    }
    
    // Firefox fixes
    if (userAgent.includes('Firefox')) {
      html.style.MozTransform = 'scale(1)';
      body.style.MozTransform = 'scale(1)';
    }
    
    // Edge fixes
    if (userAgent.includes('Edge')) {
      html.style.msTextSizeAdjust = '100%';
      body.style.msTextSizeAdjust = '100%';
    }
  }

  /**
   * Fix high-DPI scaling issues
   */
  fixHighDPIScaling() {
    const pixelRatio = window.devicePixelRatio || 1;
    
    // Only apply fixes for high-DPI displays
    if (pixelRatio > 1) {
      const html = document.documentElement;
      const body = document.body;
      
      // Force scale reset for high-DPI
      html.style.transform = 'scale(1)';
      html.style.webkitTransform = 'scale(1)';
      html.style.zoom = '1';
      
      body.style.transform = 'scale(1)';
      body.style.webkitTransform = 'scale(1)';
      body.style.zoom = '1';
      
      // Add high-DPI class for CSS targeting
      document.body.classList.add('high-dpi');
    }
  }

  /**
   * Final viewport adjustments
   */
  finalViewportAdjustments() {
    // Check if we're in production environment
    const isProduction = window.location.hostname !== 'localhost' && 
                        !window.location.hostname.includes('127.0.0.1') &&
                        !window.location.hostname.includes('local');
    
    if (isProduction) {
      // Additional production-specific fixes
      this.applyProductionFixes();
    }
  }

  /**
   * Apply production-specific fixes
   */
  applyProductionFixes() {
    const html = document.documentElement;
    const body = document.body;
    
    // Force consistent scaling in production
    html.style.setProperty('zoom', '1', 'important');
    html.style.setProperty('transform', 'scale(1)', 'important');
    html.style.setProperty('font-size', '16px', 'important');
    
    body.style.setProperty('zoom', '1', 'important');
    body.style.setProperty('transform', 'scale(1)', 'important');
    body.style.setProperty('font-size', '16px', 'important');
    
    // Add production class for CSS targeting
    document.body.classList.add('production-env');
  }

  /**
   * Detect and fix scaling issues
   */
  detectAndFixScalingIssues() {
    const actualWidth = window.innerWidth;
    const documentWidth = document.documentElement.clientWidth;
    
    // If there's a significant difference, there might be a scaling issue
    const widthDifference = Math.abs(actualWidth - documentWidth);
    
    if (widthDifference > 50) {
      console.warn('Potential scaling issue detected, applying fixes...');
      this.applyEmergencyScalingFixes();
    }
  }

  /**
   * Apply emergency scaling fixes
   */
  applyEmergencyScalingFixes() {
    const html = document.documentElement;
    const body = document.body;
    
    // Reset everything
    [html, body].forEach(element => {
      if (element) {
        element.style.zoom = '1';
        element.style.webkitZoom = '1';
        element.style.MozZoom = '1';
        element.style.transform = 'scale(1)';
        element.style.webkitTransform = 'scale(1)';
        element.style.MozTransform = 'scale(1)';
        element.style.msTransform = 'scale(1)';
        element.style.transformOrigin = '0 0';
        element.style.fontSize = '16px';
      }
    });
    
    // Force reflow
    void document.body.offsetHeight;
  }

  /**
   * Maintain consistent scaling during resize
   */
  maintainConsistentScaling() {
    const html = document.documentElement;
    const body = document.body;
    
    // Ensure scaling remains at 1
    html.style.zoom = '1';
    html.style.transform = 'scale(1)';
    body.style.zoom = '1';
    body.style.transform = 'scale(1)';
  }

  /**
   * Get current viewport information
   */
  getViewportInfo() {
    return {
      width: window.innerWidth,
      height: window.innerHeight,
      devicePixelRatio: window.devicePixelRatio || 1,
      documentWidth: document.documentElement.clientWidth,
      documentHeight: document.documentElement.clientHeight,
      zoom: this.getCurrentZoom(),
      isProduction: this.isProductionEnvironment(),
      userAgent: navigator.userAgent
    };
  }

  /**
   * Get current zoom level
   */
  getCurrentZoom() {
    const html = document.documentElement;
    return html.style.zoom || '1';
  }

  /**
   * Check if we're in production environment
   */
  isProductionEnvironment() {
    return window.location.hostname !== 'localhost' && 
           !window.location.hostname.includes('127.0.0.1') &&
           !window.location.hostname.includes('local');
  }

  /**
   * Debug viewport issues
   */
  debugViewport() {
    const info = this.getViewportInfo();
    console.group('Viewport Debug Information');
    console.log('Viewport Info:', info);
    console.log('HTML Element Styles:', {
      zoom: document.documentElement.style.zoom,
      transform: document.documentElement.style.transform,
      fontSize: document.documentElement.style.fontSize
    });
    console.log('Body Element Styles:', {
      zoom: document.body.style.zoom,
      transform: document.body.style.transform,
      fontSize: document.body.style.fontSize
    });
    console.groupEnd();
  }

  /**
   * Force reset all viewport settings
   */
  forceReset() {
    console.log('Forcing viewport reset...');
    this.applyImmediateFixes();
    this.applyBrowserSpecificFixes();
    this.fixHighDPIScaling();
    this.applyProductionFixes();
    this.detectAndFixScalingIssues();
  }
}

// Utility functions for easy access
export const viewportUtils = {
  /**
   * Initialize viewport fixer
   */
  init() {
    if (!window.viewportFixer) {
      window.viewportFixer = new ViewportFixer();
    }
    return window.viewportFixer;
  },

  /**
   * Quick fix for immediate use
   */
  quickFix() {
    const html = document.documentElement;
    const body = document.body;
    
    [html, body].forEach(element => {
      if (element) {
        element.style.zoom = '1';
        element.style.transform = 'scale(1)';
        element.style.fontSize = '16px';
        element.style.webkitTextSizeAdjust = '100%';
      }
    });
  },

  /**
   * Debug current viewport state
   */
  debug() {
    if (window.viewportFixer) {
      window.viewportFixer.debugViewport();
    } else {
      console.log('ViewportFixer not initialized. Run viewportUtils.init() first.');
    }
  },

  /**
   * Force complete reset
   */
  reset() {
    if (window.viewportFixer) {
      window.viewportFixer.forceReset();
    } else {
      this.quickFix();
    }
  }
};

// Auto-initialize if in browser environment
if (typeof window !== 'undefined') {
  // Initialize immediately
  viewportUtils.init();
}

export default ViewportFixer;