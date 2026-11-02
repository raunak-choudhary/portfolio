// src/components/admin/AdminDashboard/sections/HeroContentManager.js

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useSupabase } from '../../../../hooks/useSupabase';
import LoadingSpinner from '../../../common/LoadingSpinner';
import './HeroContentManager.css';
import { triggerPublicRefresh } from '../../../../services/adminDataService';

const HeroContentManager = () => {
  // ============================================================================
  // DATA FETCHING WITH OPTIMIZED useSupabase HOOK
  // ============================================================================
  
  const { 
    data: heroData, 
    loading: dataLoading, 
    error: dataError,
    refetch 
  } = useSupabase('hero_content', { is_active: true }, { 
    single: true,
    cacheKey: 'hero-content-admin'
  });

  // ============================================================================
  // STATE MANAGEMENT - ORGANIZED AND OPTIMIZED
  // ============================================================================
  
  // Form state with proper initial values
  const [formData, setFormData] = useState({
    title: '',
    subtitle: '',
    description: '',
    highlights: [],
    cta_text: '',
    cta_link: '',
    is_active: true
  });

  // UI state management
  const [uiState, setUiState] = useState({
  isEditing: false,
  isSaving: false,
  hasChanges: false,
  showPreview: false,
  saveStatus: null, // 'success', 'error', null
  isPostSave: false // NEW: Track if we just completed a save
});

  // Form validation state
  const [validationErrors, setValidationErrors] = useState({});
  
  // Highlights management
  const [newHighlight, setNewHighlight] = useState('');

  // ============================================================================
  // MEMOIZED VALUES FOR PERFORMANCE
  // ============================================================================
  
  const characterCounts = useMemo(() => ({
    title: formData.title.length,
    subtitle: formData.subtitle.length,
    description: formData.description.length,
    highlightsCount: formData.highlights.length,
    ctaText: formData.cta_text.length
  }), [formData]);

  const hasUnsavedChanges = useMemo(() => {
    if (!heroData) return uiState.hasChanges;
    
    return (
      formData.title !== (heroData.title || '') ||
      formData.subtitle !== (heroData.subtitle || '') ||
      formData.description !== (heroData.description || '') ||
      formData.cta_text !== (heroData.cta_text || '') ||
      formData.cta_link !== (heroData.cta_link || '') ||
      formData.is_active !== (heroData.is_active !== false) ||
      JSON.stringify(formData.highlights) !== JSON.stringify(heroData.highlights || [])
    );
  }, [formData, heroData, uiState.hasChanges]);

  // ============================================================================
  // EFFECT HOOKS - OPTIMIZED DATA LOADING
  // ============================================================================
  
  // Load data into form when fetched
  useEffect(() => {
    if (heroData) {
        const newFormData = {
        title: heroData.title || '',
        subtitle: heroData.subtitle || '',
        description: heroData.description || '',
        highlights: Array.isArray(heroData.highlights) ? [...heroData.highlights] : [],
        cta_text: heroData.cta_text || '',
        cta_link: heroData.cta_link || '',
        is_active: heroData.is_active !== false
        };
        
        setFormData(newFormData);
        
        // Preserve success message if we're in post-save state
        setUiState(prev => {
        if (prev.isPostSave && prev.saveStatus === 'success') {
            // Keep success message visible after data refresh
            return {
            ...prev,
            isEditing: false,
            hasChanges: false
            // Keep saveStatus: 'success' and isPostSave: true
            };
        } else {
            // Normal data loading - reset everything
            return {
            ...prev,
            isEditing: false,
            hasChanges: false,
            saveStatus: null,
            isPostSave: false
            };
        }
        });
        setValidationErrors({});
    }
}, [heroData]);

  // Auto-hide status messages
  useEffect(() => {
    if (uiState.saveStatus) {
        let timeout;
        
        if (uiState.saveStatus === 'success') {
        // For success messages, show longer if not editing (post-save state)
        timeout = uiState.isEditing ? 3000 : 12000; // 3s while editing, 12s after save
        } else {
        timeout = 5000; // 5 seconds for errors
        }
        
        const timer = setTimeout(() => {
        setUiState(prev => ({ 
            ...prev, 
            saveStatus: null,
            isPostSave: false // Clear post-save flag when message disappears
        }));
        }, timeout);
        
        return () => clearTimeout(timer);
    }
  }, [uiState.saveStatus, uiState.isEditing, uiState.isPostSave]);

  // ============================================================================
  // FORM HANDLING - OPTIMIZED AND STANDARDIZED
  // ============================================================================
  
  const handleInputChange = useCallback((field, value) => {
    setFormData(prev => {
      const newData = { ...prev, [field]: value };
      return newData;
    });
    
    setUiState(prev => ({ ...prev, hasChanges: true }));
    
    // Clear field-specific validation errors
    if (validationErrors[field]) {
      setValidationErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[field];
        return newErrors;
      });
    }
  }, [validationErrors]);

  // ============================================================================
  // HIGHLIGHTS MANAGEMENT - OPTIMIZED ARRAY OPERATIONS
  // ============================================================================
  
  const addHighlight = useCallback(() => {
    const trimmedHighlight = newHighlight.trim();
    
    if (trimmedHighlight && 
        trimmedHighlight.length <= 100 && 
        formData.highlights.length < 6 &&
        !formData.highlights.includes(trimmedHighlight)) {
      
      const updatedHighlights = [...formData.highlights, trimmedHighlight];
      handleInputChange('highlights', updatedHighlights);
      setNewHighlight('');
    }
  }, [newHighlight, formData.highlights, handleInputChange]);

  const removeHighlight = useCallback((index) => {
    const updatedHighlights = formData.highlights.filter((_, i) => i !== index);
    handleInputChange('highlights', updatedHighlights);
  }, [formData.highlights, handleInputChange]);

  const updateHighlight = useCallback((index, value) => {
    if (value.length <= 100) {
      const updatedHighlights = formData.highlights.map((highlight, i) => 
        i === index ? value : highlight
      );
      handleInputChange('highlights', updatedHighlights);
    }
  }, [formData.highlights, handleInputChange]);

  // Handle Enter key for adding highlights
  const handleHighlightKeyPress = useCallback((e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addHighlight();
    }
  }, [addHighlight]);

  // ============================================================================
  // FORM VALIDATION - COMPREHENSIVE AND OPTIMIZED
  // ============================================================================
  
  const validateForm = useCallback(() => {
    const errors = {};

    // Title validation (required, 5-100 chars)
    const titleTrimmed = formData.title.trim();
    if (!titleTrimmed) {
      errors.title = 'Title is required';
    } else if (titleTrimmed.length < 5) {
      errors.title = 'Title must be at least 5 characters';
    } else if (titleTrimmed.length > 100) {
      errors.title = 'Title must be less than 100 characters';
    }

    // Subtitle validation (optional, max 150 chars)
    if (formData.subtitle && formData.subtitle.length > 150) {
      errors.subtitle = 'Subtitle must be less than 150 characters';
    }

    // Description validation (optional, max 500 chars)
    if (formData.description && formData.description.length > 500) {
      errors.description = 'Description must be less than 500 characters';
    }

    // CTA text validation (optional, max 50 chars)
    if (formData.cta_text && formData.cta_text.length > 50) {
      errors.cta_text = 'CTA text must be less than 50 characters';
    }

    // CTA link validation (basic URL check if provided)
    if (formData.cta_link && formData.cta_link.trim()) {
      const linkPattern = /^(https?:\/\/|\/|#)/;
      if (!linkPattern.test(formData.cta_link.trim())) {
        errors.cta_link = 'CTA link must be a valid URL or anchor link';
      }
    }

    // Highlights validation (max 6 items, each max 100 chars)
    if (formData.highlights.length > 6) {
      errors.highlights = 'Maximum 6 highlights allowed';
    }

    const invalidHighlights = formData.highlights.filter(h => h.length > 100);
    if (invalidHighlights.length > 0) {
      errors.highlights = 'Each highlight must be less than 100 characters';
    }

    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  }, [formData]);

  // ============================================================================
  // SAVE OPERATION - ORIGINAL LOGIC WITH PHASE 3 OPTIMIZATIONS
  // ============================================================================
  
  const handleSave = useCallback(async () => {
    console.log('🚀 Starting save process...');
    
    if (!validateForm()) {
      console.log('❌ Form validation failed');
      setUiState(prev => ({ ...prev, saveStatus: 'error' }));
      return;
    }

    setUiState(prev => ({ ...prev, isSaving: true, saveStatus: null }));

    try {
      // Prepare data for saving - ORIGINAL LOGIC
      const saveData = {
        title: formData.title.trim(),
        subtitle: formData.subtitle.trim() || null,
        description: formData.description.trim() || null,
        cta_text: formData.cta_text.trim() || null,
        cta_link: formData.cta_link.trim() || null,
        highlights: formData.highlights.filter(h => h.trim().length > 0),
        is_active: formData.is_active
      };

      console.log('📤 Sending data to save:', saveData);
      console.log('🆔 Current heroData ID:', heroData?.id);
      
      // Import Supabase with service key for admin operations - ORIGINAL LOGIC
      const { createClient } = await import('@supabase/supabase-js');
      
      // Create admin client with service key (bypasses RLS) - ORIGINAL LOGIC
      const supabaseAdmin = createClient(
        process.env.REACT_APP_SUPABASE_URL,
        process.env.REACT_APP_SUPABASE_SERVICE_ROLE_KEY
      );
      
      console.log('🔐 Using service key for admin operations');
      
      // Check current hero_content records with admin access - ORIGINAL LOGIC
      const { data: currentRecords, error: fetchError } = await supabaseAdmin
        .from('hero_content')
        .select('*');
      console.log('📊 Current hero_content records:', currentRecords);
      console.log('❌ Fetch error (if any):', fetchError);
      
      let result;
      
      if (heroData?.id) {
        // Update the specific record - ORIGINAL LOGIC
        console.log('🔄 Updating existing record with ID:', heroData.id);
        const { data, error } = await supabaseAdmin
          .from('hero_content')
          .update({
            ...saveData,
            updated_at: new Date().toISOString()
          })
          .eq('id', heroData.id)
          .select()
          .single();
          
        console.log('✏️ Update operation result:', data);
        console.log('❌ Update error (if any):', error);
          
        if (error) {
          console.error('💥 Update error details:', error);
          throw new Error(`Failed to update hero content: ${error.message}`);
        }
        
        result = { success: true, data };
      } else {
        // Create new record - ORIGINAL LOGIC
        console.log('➕ Creating new record');
        const { data, error } = await supabaseAdmin
          .from('hero_content')
          .insert([saveData])
          .select()
          .single();
          
        console.log('➕ Insert operation result:', data);
        console.log('❌ Insert error (if any):', error);
          
        if (error) {
          console.error('💥 Insert error details:', error);
          throw new Error(`Failed to create hero content: ${error.message}`);
        }
        
        result = { success: true, data };
      }
      
      // Verify the save - ORIGINAL LOGIC
      console.log('🔍 Verifying save...');
      const { data: verifyData} = await supabaseAdmin
        .from('hero_content')
        .select('*')
        .eq('id', result.data.id);
      console.log('✅ Fresh data after save:', verifyData);
      
      console.log('📥 Final save result:', result);

      if (result && result.success) {
        console.log('✅ Save successful');

        triggerPublicRefresh('hero_content');
        
        // Set success status immediately
        setUiState(prev => ({ 
            ...prev, 
            saveStatus: 'success',
            hasChanges: false,
            isEditing: false,
            isPostSave: true  // Mark that we just saved
        }));

        
        // Refresh data after a brief delay to ensure UI update happens first
        setTimeout(() => {
            refetch();
        }, 100);
        
        // Don't auto-hide success message here - let useEffect handle it
      } else {
        console.log('❌ Save failed:', result);
        throw new Error(result?.error || result?.message || 'Failed to save hero content');
      }
    } catch (error) {
      console.error('💥 Save error details:', error);
      console.error('Error message:', error.message);
      console.error('Error stack:', error.stack);
      
      // Set error status
      setUiState(prev => ({ ...prev, saveStatus: 'error' }));
      
      // Don't auto-hide error message here - let useEffect handle it
    } finally {
      setUiState(prev => ({ ...prev, isSaving: false }));
    }
  }, [formData, heroData, validateForm, refetch]);

  // ============================================================================
  // UI ACTIONS - OPTIMIZED EVENT HANDLERS
  // ============================================================================
  
  const handleStartEditing = useCallback(() => {
    setUiState(prev => ({ ...prev, isEditing: true, saveStatus: null }));
  }, []);

  const handleCancel = useCallback(() => {
    if (hasUnsavedChanges) {
      const confirmCancel = window.confirm(
        'You have unsaved changes. Are you sure you want to cancel?'
      );
      if (!confirmCancel) return;
    }

    // Reset form data to original
    if (heroData) {
      setFormData({
        title: heroData.title || '',
        subtitle: heroData.subtitle || '',
        description: heroData.description || '',
        highlights: Array.isArray(heroData.highlights) ? [...heroData.highlights] : [],
        cta_text: heroData.cta_text || '',
        cta_link: heroData.cta_link || '',
        is_active: heroData.is_active !== false
      });
    }

    setUiState(prev => ({
        ...prev,
        isEditing: false,
        hasChanges: false,
        saveStatus: null,
        isPostSave: false // Clear post-save flag on cancel
    }));
    setValidationErrors({});
    setNewHighlight('');
  }, [hasUnsavedChanges, heroData]);

  const togglePreview = useCallback(() => {
    setUiState(prev => ({ ...prev, showPreview: !prev.showPreview }));
  }, []);

  // ============================================================================
  // LOADING STATE - STANDARDIZED PHASE 3 PATTERN
  // ============================================================================
  
  if (dataLoading && !heroData) {
    return (
      <div className="hero-manager-loading">
        <LoadingSpinner size="large" />
        <p>Loading hero content...</p>
      </div>
    );
  }

  // ============================================================================
  // RENDER - OPTIMIZED JSX STRUCTURE
  // ============================================================================
  
  return (
    <div className="hero-content-manager">
      {/* Header Section */}
      <div className="hero-manager-header">
        <div className="header-content">
          <h2 className="hero-manager-title">
            <span className="hero-title-icon">🚀</span>
            Hero Section Management
          </h2>
          <p className="manager-subtitle">
            Customize the main landing page hero content that visitors see first
          </p>
        </div>

        <div className="header-actions">
          <button
            className="action-btn preview-btn"
            onClick={togglePreview}
            title="Toggle Preview"
            type="button"
          >
            <span className="btn-icon">👁️</span>
            {uiState.showPreview ? 'Hide Preview' : 'Show Preview'}
          </button>

          {!uiState.isEditing ? (
            <button
              className="action-btn edit-btn primary"
              onClick={handleStartEditing}
              title="Edit Hero Content"
              type="button"
            >
              <span className="btn-icon">✏️</span>
              Edit Content
            </button>
          ) : (
            <div className="edit-actions">
              <button
                className="action-btn cancel-btn"
                onClick={handleCancel}
                disabled={uiState.isSaving}
                title="Cancel Changes"
                type="button"
              >
                <span className="btn-icon">❌</span>
                Cancel
              </button>
              <button
                className="action-btn save-btn primary"
                onClick={handleSave}
                disabled={uiState.isSaving || !hasUnsavedChanges}
                title="Save Changes"
                type="button"
              >
                {uiState.isSaving ? (
                  <>
                    <LoadingSpinner size="small" />
                    Saving...
                  </>
                ) : (
                  <>
                    <span className="btn-icon">💾</span>
                    Save Changes
                  </>
                )}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Status Messages - Enhanced Display */}
      {uiState.saveStatus && (
        <div className={`status-message ${uiState.saveStatus}`} role="alert">
          {uiState.saveStatus === 'success' && (
            <>
              <span className="status-icon">✅</span>
              <div className="status-content">
                <strong>Success!</strong> Hero content has been saved successfully and is now live on your portfolio.
              </div>
            </>
          )}
          {uiState.saveStatus === 'error' && (
            <>
              <span className="status-icon">❌</span>
              <div className="status-content">
                <strong>Error!</strong> Failed to save hero content. Please check your connection and try again.
              </div>
            </>
          )}
        </div>
      )}

      {/* Data Error */}
      {dataError && (
        <div className="status-message error" role="alert">
          <span className="status-icon">⚠️</span>
          Error loading hero content: {
            typeof dataError === 'string' ? dataError : dataError.message || 'Unknown error'
          }
        </div>
      )}

      {/* Main Content */}
      <div className={`hero-manager-content ${uiState.showPreview ? 'with-preview' : ''}`}>
        {/* Form Section */}
        <div className="form-section">
          <div className="form-container glass-card">
            {/* Title Field */}
            <div className="form-group">
              <div className="form-label-wrapper">
                <label htmlFor="hero-title" className="form-label required">
                  Main Title
                </label>
                <span className="char-count">
                  {characterCounts.title}/100
                </span>
              </div>
              <input
                id="hero-title"
                type="text"
                value={formData.title}
                onChange={(e) => handleInputChange('title', e.target.value)}
                disabled={!uiState.isEditing}
                className={`form-input ${validationErrors.title ? 'error' : ''}`}
                placeholder="Enter the main hero title..."
                maxLength={100}
                aria-describedby={validationErrors.title ? 'title-error' : undefined}
              />
              {validationErrors.title && (
                <span id="title-error" className="error-text" role="alert">
                  {validationErrors.title}
                </span>
              )}
            </div>

            {/* Subtitle Field */}
            <div className="form-group">
              <div className="form-label-wrapper">
                <label htmlFor="hero-subtitle" className="form-label">
                  Subtitle
                </label>
                <span className="char-count">
                  {characterCounts.subtitle}/150
                </span>
              </div>
              <input
                id="hero-subtitle"
                type="text"
                value={formData.subtitle}
                onChange={(e) => handleInputChange('subtitle', e.target.value)}
                disabled={!uiState.isEditing}
                className={`form-input ${validationErrors.subtitle ? 'error' : ''}`}
                placeholder="Enter the subtitle..."
                maxLength={150}
                aria-describedby={validationErrors.subtitle ? 'subtitle-error' : undefined}
              />
              {validationErrors.subtitle && (
                <span id="subtitle-error" className="error-text" role="alert">
                  {validationErrors.subtitle}
                </span>
              )}
            </div>

            {/* Description Field */}
            <div className="form-group">
              <div className="form-label-wrapper">
                <label htmlFor="hero-description" className="form-label">
                  Description
                </label>
                <span className="char-count">
                  {characterCounts.description}/500
                </span>
              </div>
              <textarea
                id="hero-description"
                value={formData.description}
                onChange={(e) => handleInputChange('description', e.target.value)}
                disabled={!uiState.isEditing}
                className={`form-textarea ${validationErrors.description ? 'error' : ''}`}
                placeholder="Enter the hero description..."
                rows={4}
                maxLength={500}
                aria-describedby={validationErrors.description ? 'description-error' : undefined}
              />
              {validationErrors.description && (
                <span id="description-error" className="error-text" role="alert">
                  {validationErrors.description}
                </span>
              )}
            </div>

            {/* Highlights Section */}
            <div className="form-group highlights-section">
              <div className="form-label-wrapper">
                <label className="form-label">
                  Key Highlights
                </label>
                <span className="highlight-count">
                  {characterCounts.highlightsCount}/6 items
                </span>
              </div>
              
              {/* Existing Highlights */}
              <div className="highlights-list">
                {formData.highlights.map((highlight, index) => (
                  <div key={`highlight-${index}`} className="highlight-item">
                    <input
                      type="text"
                      value={highlight}
                      onChange={(e) => updateHighlight(index, e.target.value)}
                      disabled={!uiState.isEditing}
                      className="highlight-input"
                      maxLength={100}
                      placeholder={`Highlight ${index + 1}`}
                      aria-label={`Highlight ${index + 1}`}
                    />
                    {uiState.isEditing && (
                      <button
                        type="button"
                        onClick={() => removeHighlight(index)}
                        className="remove-highlight-btn"
                        title="Remove highlight"
                        aria-label={`Remove highlight ${index + 1}`}
                      >
                        ❌
                      </button>
                    )}
                  </div>
                ))}
              </div>

              {/* Add New Highlight */}
              {uiState.isEditing && formData.highlights.length < 6 && (
                <div className="add-highlight">
                  <input
                    type="text"
                    value={newHighlight}
                    onChange={(e) => setNewHighlight(e.target.value)}
                    placeholder="Add a new highlight..."
                    className="form-input"
                    maxLength={100}
                    onKeyPress={handleHighlightKeyPress}
                    aria-label="New highlight text"
                  />
                  <button
                    type="button"
                    onClick={addHighlight}
                    disabled={!newHighlight.trim() || newHighlight.trim().length === 0}
                    className="add-highlight-btn"
                    title="Add highlight"
                  >
                    ➕ Add
                  </button>
                </div>
              )}

              {validationErrors.highlights && (
                <span className="error-text" role="alert">
                  {validationErrors.highlights}
                </span>
              )}
            </div>

            {/* CTA Section */}
            <div className="form-row">
              <div className="form-group">
                <div className="form-label-wrapper">
                  <label htmlFor="cta-text" className="form-label">
                    CTA Button Text
                  </label>
                  <span className="char-count">
                    {characterCounts.ctaText}/50
                  </span>
                </div>
                <input
                  id="cta-text"
                  type="text"
                  value={formData.cta_text}
                  onChange={(e) => handleInputChange('cta_text', e.target.value)}
                  disabled={!uiState.isEditing}
                  className={`form-input ${validationErrors.cta_text ? 'error' : ''}`}
                  placeholder="e.g., Explore My Work"
                  maxLength={50}
                  aria-describedby={validationErrors.cta_text ? 'cta-text-error' : undefined}
                />
                {validationErrors.cta_text && (
                  <span id="cta-text-error" className="error-text" role="alert">
                    {validationErrors.cta_text}
                  </span>
                )}
              </div>

              <div className="form-group">
                <div className="form-label-wrapper">
                  <label htmlFor="cta-link" className="form-label">
                    CTA Button Link
                  </label>
                </div>
                <input
                  id="cta-link"
                  type="text"
                  value={formData.cta_link}
                  onChange={(e) => handleInputChange('cta_link', e.target.value)}
                  disabled={!uiState.isEditing}
                  className={`form-input ${validationErrors.cta_link ? 'error' : ''}`}
                  placeholder="e.g., #navigation, /projects, https://..."
                  aria-describedby={validationErrors.cta_link ? 'cta-link-error' : undefined}
                />
                {validationErrors.cta_link && (
                  <span id="cta-link-error" className="error-text" role="alert">
                    {validationErrors.cta_link}
                  </span>
                )}
              </div>
            </div>

            {/* Active Status */}
            <div className="form-group">
              <label className="checkbox-wrapper">
                <input
                  type="checkbox"
                  checked={formData.is_active}
                  onChange={(e) => handleInputChange('is_active', e.target.checked)}
                  disabled={!uiState.isEditing}
                  className="checkbox-input"
                  aria-describedby="active-status-description"
                />
                <span className="checkbox-custom" aria-hidden="true"></span>
                <span id="active-status-description" className="checkbox-label">
                  Hero section is active and visible to visitors
                </span>
              </label>
            </div>
          </div>
        </div>

        {/* Preview Section */}
        {uiState.showPreview && (
          <div className="preview-section">
            <div className="preview-container glass-card">
              <h3 className="preview-title">
                <span className="preview-icon">👁️</span>
                Live Preview
              </h3>
              
              <div className="hero-preview">
                <div className="preview-hero">
                  {formData.title && (
                    <h1 className="preview-hero-title">{formData.title}</h1>
                  )}
                  {formData.subtitle && (
                    <h2 className="preview-hero-subtitle">{formData.subtitle}</h2>
                  )}
                  {formData.description && (
                    <p className="preview-hero-description">{formData.description}</p>
                  )}
                  
                  {formData.highlights.length > 0 && (
                    <div className="preview-highlights">
                      {formData.highlights.map((highlight, index) => (
                        <div key={`preview-highlight-${index}`} className="preview-highlight">
                          <span className="highlight-bullet">✓</span>
                          {highlight}
                        </div>
                      ))}
                    </div>
                  )}
                  
                  {formData.cta_text && (
                    <button className="preview-cta-btn" type="button" disabled>
                      {formData.cta_text}
                    </button>
                  )}
                </div>
              </div>

              <div className="preview-status">
                <span className={`status-indicator ${formData.is_active ? 'active' : 'inactive'}`}>
                  {formData.is_active ? '🟢 Active' : '🔴 Inactive'}
                </span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default HeroContentManager;