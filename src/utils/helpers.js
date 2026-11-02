// src/utils/helpers.js

// Format date to readable string
export const formatDate = (date) => {
    if (!date) return '';
    
    const options = {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    };
    
    return new Date(date).toLocaleDateString('en-US', options);
  };
  
  // Format date to month/year
  export const formatMonthYear = (date) => {
    if (!date) return '';
    
    const options = {
      year: 'numeric',
      month: 'long'
    };
    
    return new Date(date).toLocaleDateString('en-US', options);
  };
  
  // Scroll to element smoothly
  export const scrollToElement = (elementId) => {
    const element = document.getElementById(elementId);
    if (element) {
      element.scrollIntoView({
        behavior: 'smooth',
        block: 'start'
      });
    }
  };
  
  // Debounce function for search/input
  export const debounce = (func, wait) => {
    let timeout;
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout);
        func(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  };
  
  // Validate email format
  export const isValidEmail = (email) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };
  
  // Validate file type and size
  export const validateFile = (file, allowedTypes, maxSize) => {
    if (!file) return { isValid: false, error: 'No file selected' };
    
    if (!allowedTypes.includes(file.type)) {
      return {
        isValid: false,
        error: 'Invalid file type. Please select a valid file.'
      };
    }
    
    if (file.size > maxSize) {
      return {
        isValid: false,
        error: `File size too large. Maximum size is ${maxSize / (1024 * 1024)}MB.`
      };
    }
    
    return { isValid: true, error: null };
  };
  
  // Truncate text to specified length
  export const truncateText = (text, maxLength) => {
    if (!text || text.length <= maxLength) return text;
    return text.substring(0, maxLength).trim() + '...';
  };
  
  // Generate unique ID
  export const generateId = () => {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
  };
  
  // Get file extension
  export const getFileExtension = (filename) => {
    return filename.slice((filename.lastIndexOf('.') - 1 >>> 0) + 2);
  };
  
  // Format file size
  export const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };
  
  // Check if element is in viewport
  export const isInViewport = (element) => {
    const rect = element.getBoundingClientRect();
    return (
      rect.top >= 0 &&
      rect.left >= 0 &&
      rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) &&
      rect.right <= (window.innerWidth || document.documentElement.clientWidth)
    );
  };
  
  // Get device type based on screen width
  export const getDeviceType = () => {
    const width = window.innerWidth;
    if (width < 768) return 'mobile';
    if (width < 1024) return 'tablet';
    return 'desktop';
  };
  
  // Copy text to clipboard
  export const copyToClipboard = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      return { success: true };
    } catch (err) {
      return { success: false, error: 'Failed to copy to clipboard' };
    }
  };
  
  // Local storage helpers
  export const localStorage = {
    get: (key) => {
      try {
        const item = window.localStorage.getItem(key);
        return item ? JSON.parse(item) : null;
      } catch (error) {
        console.error('Error reading from localStorage:', error);
        return null;
      }
    },
    
    set: (key, value) => {
      try {
        window.localStorage.setItem(key, JSON.stringify(value));
        return true;
      } catch (error) {
        console.error('Error writing to localStorage:', error);
        return false;
      }
    },
    
    remove: (key) => {
      try {
        window.localStorage.removeItem(key);
        return true;
      } catch (error) {
        console.error('Error removing from localStorage:', error);
        return false;
      }
    }
  };
  
  // Create slug from text
  export const createSlug = (text) => {
    return text
      .toLowerCase()
      .replace(/[^\w ]+/g, '')
      .replace(/ +/g, '-');
  };
  
  // Calculate reading time for text
  export const calculateReadingTime = (text, wordsPerMinute = 200) => {
    const words = text.trim().split(/\s+/).length;
    const minutes = Math.ceil(words / wordsPerMinute);
    return minutes;
  };
  
  // Format duration (minutes to readable format)
  export const formatDuration = (minutes) => {
    if (minutes < 60) {
      return `${minutes} min`;
    }
    
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    
    if (remainingMinutes === 0) {
      return `${hours} hr`;
    }
    
    return `${hours} hr ${remainingMinutes} min`;
  };
  
  // Check if user prefers reduced motion
  export const prefersReducedMotion = () => {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  };
  
  // Get current theme from document
  export const getCurrentTheme = () => {
    return document.documentElement.getAttribute('data-theme') || 'dark';
  };
  
  // Safe JSON parse
  export const safeJsonParse = (json, fallback = null) => {
    try {
      return JSON.parse(json);
    } catch (error) {
      console.error('Error parsing JSON:', error);
      return fallback;
    }
  };