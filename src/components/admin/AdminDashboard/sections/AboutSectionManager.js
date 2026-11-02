// src/components/admin/AdminDashboard/sections/AboutSectionManager.js

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useSupabase } from '../../../../hooks/useSupabase';
import LoadingSpinner from '../../../common/LoadingSpinner';
import './AboutSectionManager.css';
import { triggerPublicRefresh } from '../../../../services/adminDataService';

const AboutSectionManager = () => {
  // ============================================================================
  // DATA FETCHING WITH OPTIMIZED useSupabase HOOK
  // ============================================================================
  
  const { 
    data: aboutData, 
    loading: dataLoading, 
    error: dataError,
    refetch 
  } = useSupabase('about_content', { is_active: true }, { 
    single: true,
    cacheKey: 'about-content-admin'
  });

  // ============================================================================
  // STATE MANAGEMENT - ORGANIZED AND OPTIMIZED
  // ============================================================================
  
  // Form state with proper initial values for array-based basic_info
  const [formData, setFormData] = useState({
    about_me_title: '',
    about_me_content: '',
    basic_info_title: '',
    basic_info: [], // 🔧 CHANGED: Now array of {key, value, order_index}
    profile_image_about: null,
    profile_image_info: null,
    profile_image_url: null, // Legacy field
    is_active: true
  });

  // UI state management
  const [uiState, setUiState] = useState({
    isEditing: false,
    isSaving: false,
    hasChanges: false,
    showPreview: false,
    activeTab: 'about', // 'about' or 'info'
    saveStatus: null, // 'success', 'error', null
    isPostSave: false // Track if we just completed a save
  });

  // Form validation state
  const [validationErrors, setValidationErrors] = useState({});
  
  // Basic info management for new items
  const [newInfoKey, setNewInfoKey] = useState('');
  const [newInfoValue, setNewInfoValue] = useState('');

  // File upload state
  const [imageUploading, setImageUploading] = useState({
    about: false,
    info: false
  });

  // ============================================================================
  // HELPER FUNCTIONS FOR ARRAY-BASED BASIC INFO
  // ============================================================================
  
  // Convert old object format to new array format (for backward compatibility)
  const convertToArrayFormat = useCallback((basicInfo) => {
    if (!basicInfo) return [];
    
    // If already array format, return as-is (ensure order_index exists)
    if (Array.isArray(basicInfo)) {
      return basicInfo.map((item, index) => ({
        key: item.key || '',
        value: item.value || '',
        order_index: item.order_index !== undefined ? item.order_index : index
      })).sort((a, b) => a.order_index - b.order_index);
    }
    
    // Convert old object format to array format (legacy support)
    if (typeof basicInfo === 'object') {
      return Object.entries(basicInfo).map(([key, value], index) => ({
        key,
        value,
        order_index: index
      }));
    }
    
    return [];
  }, []);
  // ============================================================================
  // MEMOIZED VALUES FOR PERFORMANCE
  // ============================================================================
  
  const characterCounts = useMemo(() => ({
    aboutMeTitle: formData.about_me_title.length,
    aboutMeContent: formData.about_me_content.length,
    basicInfoTitle: formData.basic_info_title.length,
    basicInfoCount: Array.isArray(formData.basic_info) ? formData.basic_info.length : 0
  }), [formData]);

  const hasUnsavedChanges = useMemo(() => {
  if (!aboutData) return uiState.hasChanges;
  
  return (
    formData.about_me_title !== (aboutData.about_me_title || '') ||
    formData.about_me_content !== (aboutData.about_me_content || '') ||
    formData.basic_info_title !== (aboutData.basic_info_title || '') ||
    formData.profile_image_url !== (aboutData.profile_image_url || '') ||
    formData.is_active !== (aboutData.is_active !== false) ||
    JSON.stringify(formData.basic_info) !== JSON.stringify(convertToArrayFormat(aboutData.basic_info || [])) ||
    formData.profile_image_about !== (aboutData.profile_image_about || null) ||
    formData.profile_image_info !== (aboutData.profile_image_info || null)
  );
}, [formData, aboutData, uiState.hasChanges, convertToArrayFormat]);

  // ============================================================================
  // EFFECT HOOKS - OPTIMIZED DATA LOADING
  // ============================================================================
  
  // Load data into form when fetched
  useEffect(() => {
    if (aboutData) {
      const newFormData = {
        about_me_title: aboutData.about_me_title || 'About Me',
        about_me_content: aboutData.about_me_content || '',
        basic_info_title: aboutData.basic_info_title || 'Basic Info',
        basic_info: convertToArrayFormat(aboutData.basic_info),
        profile_image_about: aboutData.profile_image_about || null,
        profile_image_info: aboutData.profile_image_info || null,
        profile_image_url: aboutData.profile_image_url || null,
        is_active: aboutData.is_active !== false
      };
      
      setFormData(newFormData);
      
      // Preserve success message if we're in post-save state
      setUiState(prev => {
        if (prev.isPostSave && prev.saveStatus === 'success') {
          return {
            ...prev,
            isEditing: false,
            hasChanges: false
          };
        } else {
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
  }, [aboutData, convertToArrayFormat]);

  // Auto-hide status messages
  useEffect(() => {
    if (uiState.saveStatus) {
      let timeout;
      
      if (uiState.saveStatus === 'success') {
        timeout = uiState.isEditing ? 3000 : 12000;
      } else {
        timeout = 5000;
      }
      
      const timer = setTimeout(() => {
        setUiState(prev => ({ 
          ...prev, 
          saveStatus: null,
          isPostSave: false
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
  // ARRAY-BASED BASIC INFO MANAGEMENT - WITH ORDERING
  // ============================================================================
  
  const addBasicInfo = useCallback(() => {
    const trimmedKey = newInfoKey.trim();
    const trimmedValue = newInfoValue.trim();
    
    if (trimmedKey && trimmedValue && 
        trimmedKey.length <= 50 && 
        trimmedValue.length <= 200 &&
        formData.basic_info.length < 10 &&
        !formData.basic_info.some(item => item.key === trimmedKey)) {
      
      const newItem = {
        key: trimmedKey,
        value: trimmedValue,
        order_index: formData.basic_info.length // Add at end
      };
      
      const updatedBasicInfo = [...formData.basic_info, newItem];
      handleInputChange('basic_info', updatedBasicInfo);
      setNewInfoKey('');
      setNewInfoValue('');
    }
  }, [newInfoKey, newInfoValue, formData.basic_info, handleInputChange]);

  const removeBasicInfo = useCallback((index) => {
    const updatedBasicInfo = formData.basic_info
      .filter((_, i) => i !== index)
      .map((item, newIndex) => ({
        ...item,
        order_index: newIndex // Reorder after deletion
      }));
    handleInputChange('basic_info', updatedBasicInfo);
  }, [formData.basic_info, handleInputChange]);

  const updateBasicInfo = useCallback((index, field, value) => {
    if (field === 'value' && value.length > 200) return;
    if (field === 'key' && value.length > 50) return;
    
    const updatedBasicInfo = formData.basic_info.map((item, i) => 
      i === index ? { ...item, [field]: value } : item
    );
    handleInputChange('basic_info', updatedBasicInfo);
  }, [formData.basic_info, handleInputChange]);

  // Move basic info item up/down - THIS PRESERVES YOUR CUSTOM ORDER!
  const moveBasicInfo = useCallback((index, direction) => {
    const newIndex = direction === 'up' ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= formData.basic_info.length) return;
    
    const updatedBasicInfo = [...formData.basic_info];
    [updatedBasicInfo[index], updatedBasicInfo[newIndex]] = [updatedBasicInfo[newIndex], updatedBasicInfo[index]];
    
    // Update order_index values to preserve order
    updatedBasicInfo.forEach((item, i) => {
      item.order_index = i;
    });
    
    handleInputChange('basic_info', updatedBasicInfo);
  }, [formData.basic_info, handleInputChange]);

  // Handle Enter key for adding basic info
  const handleBasicInfoKeyPress = useCallback((e, field) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (field === 'value' && newInfoKey.trim() && newInfoValue.trim()) {
        addBasicInfo();
      }
    }
  }, [addBasicInfo, newInfoKey, newInfoValue]);

  // ============================================================================
  // FILE UPLOAD HANDLING - PROFILE IMAGES
  // ============================================================================
  
  const handleImageUpload = useCallback(async (file, imageType) => {
    if (!file || !uiState.isEditing) return;

    // Validate file
    const maxSize = 5 * 1024 * 1024; // 5MB
    if (file.size > maxSize) {
      setValidationErrors(prev => ({
        ...prev,
        [`image_${imageType}`]: 'File size must be less than 5MB'
      }));
      return;
    }

    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      setValidationErrors(prev => ({
        ...prev,
        [`image_${imageType}`]: 'Only JPEG, PNG, and WebP files are allowed'
      }));
      return;
    }

    setImageUploading(prev => ({ ...prev, [imageType]: true }));

    try {
      // Import Supabase client for file upload
      const { createClient } = await import('@supabase/supabase-js');
      const supabaseAdmin = createClient(
        process.env.REACT_APP_SUPABASE_URL,
        process.env.REACT_APP_SUPABASE_SERVICE_ROLE_KEY
      );

      // Generate unique filename
      const timestamp = Date.now();
      const fileExtension = file.name.split('.').pop();
      const fileName = `${imageType}-profile-${timestamp}.${fileExtension}`;
      const filePath = `about/${fileName}`;

      // Upload to Supabase Storage
      const { error: uploadError } = await supabaseAdmin.storage
        .from('profile-images')
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: false
        });

      if (uploadError) {
        throw new Error(`Upload failed: ${uploadError.message}`);
      }

      // Get public URL
      const { data: urlData } = supabaseAdmin.storage
        .from('profile-images')
        .getPublicUrl(filePath);

      // Update form data based on image type
      const fieldName = imageType === 'about' ? 'profile_image_about' : 'profile_image_info';
      handleInputChange(fieldName, urlData.publicUrl);

      // Clear any validation errors
      setValidationErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[`image_${imageType}`];
        return newErrors;
      });

    } catch (error) {
      console.error('Image upload error:', error);
      setValidationErrors(prev => ({
        ...prev,
        [`image_${imageType}`]: error.message || 'Failed to upload image'
      }));
    } finally {
      setImageUploading(prev => ({ ...prev, [imageType]: false }));
    }
  }, [uiState.isEditing, handleInputChange]);

  // ============================================================================
  // FORM VALIDATION - COMPREHENSIVE AND OPTIMIZED
  // ============================================================================
  
  const validateForm = useCallback(() => {
    const errors = {};

    // About Me Title validation (required, 5-100 chars)
    const aboutTitleTrimmed = formData.about_me_title.trim();
    if (!aboutTitleTrimmed) {
      errors.about_me_title = 'About Me title is required';
    } else if (aboutTitleTrimmed.length < 3) {
      errors.about_me_title = 'About Me title must be at least 3 characters';
    } else if (aboutTitleTrimmed.length > 100) {
      errors.about_me_title = 'About Me title must be less than 100 characters';
    }

    // About Me Content validation (optional, max 2000 chars)
    if (formData.about_me_content && formData.about_me_content.length > 2000) {
      errors.about_me_content = 'About Me content must be less than 2000 characters';
    }

    // Basic Info Title validation (required, 5-100 chars)
    const basicTitleTrimmed = formData.basic_info_title.trim();
    if (!basicTitleTrimmed) {
      errors.basic_info_title = 'Basic Info title is required';
    } else if (basicTitleTrimmed.length < 3) {
      errors.basic_info_title = 'Basic Info title must be at least 3 characters';
    } else if (basicTitleTrimmed.length > 100) {
      errors.basic_info_title = 'Basic Info title must be less than 100 characters';
    }

    // Basic Info validation (at least one item)
    if (!Array.isArray(formData.basic_info) || formData.basic_info.length === 0) {
      errors.basic_info = 'At least one basic info item is required';
    }

    // Validate basic info items
    formData.basic_info.forEach((item, index) => {
      if (!item.key || !item.key.trim()) {
        errors.basic_info = `Item ${index + 1}: Key is required`;
      }
      if (!item.value || !item.value.trim()) {
        errors.basic_info = `Item ${index + 1}: Value is required`;
      }
      if (item.key && item.key.length > 50) {
        errors.basic_info = `Item ${index + 1}: Key must be less than 50 characters`;
      }
      if (item.value && item.value.length > 200) {
        errors.basic_info = `Item ${index + 1}: Value must be less than 200 characters`;
      }
    });

    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  }, [formData]);

  // ============================================================================
  // SAVE OPERATION - FOLLOWING HERO CONTENT MANAGER PATTERN
  // ============================================================================
  
  const handleSave = useCallback(async () => {
    console.log('🚀 Starting About content save process...');
    
    if (!validateForm()) {
      console.log('❌ Form validation failed');
      setUiState(prev => ({ ...prev, saveStatus: 'error' }));
      return;
    }

    setUiState(prev => ({ ...prev, isSaving: true, saveStatus: null }));

    try {
      // Prepare data for saving
      const saveData = {
        about_me_title: formData.about_me_title.trim(),
        about_me_content: formData.about_me_content.trim() || null,
        basic_info_title: formData.basic_info_title.trim(),
        basic_info: formData.basic_info, // 🔧 CHANGED: Save array directly
        profile_image_about: formData.profile_image_about,
        profile_image_info: formData.profile_image_info,
        profile_image_url: formData.profile_image_url, // Legacy field
        is_active: formData.is_active
      };

      console.log('📤 Sending data to save:', saveData);
      console.log('🆔 Current aboutData ID:', aboutData?.id);
      
      // Import Supabase with service key for admin operations
      const { createClient } = await import('@supabase/supabase-js');
      
      // Create admin client with service key (bypasses RLS)
      const supabaseAdmin = createClient(
        process.env.REACT_APP_SUPABASE_URL,
        process.env.REACT_APP_SUPABASE_SERVICE_ROLE_KEY
      );
      
      console.log('🔐 Using service key for admin operations');
      
      let result;
      
      if (aboutData?.id) {
        // Update the specific record
        console.log('🔄 Updating existing record with ID:', aboutData.id);
        const { data, error } = await supabaseAdmin
          .from('about_content')
          .update({
            ...saveData,
            updated_at: new Date().toISOString()
          })
          .eq('id', aboutData.id)
          .select()
          .single();
          
        console.log('✏️ Update operation result:', data);
        console.log('❌ Update error (if any):', error);
          
        if (error) {
          console.error('💥 Update error details:', error);
          throw new Error(`Failed to update about content: ${error.message}`);
        }
        
        result = { success: true, data };
      } else {
        // Create new record
        console.log('➕ Creating new record');
        const { data, error } = await supabaseAdmin
          .from('about_content')
          .insert([saveData])
          .select()
          .single();
          
        console.log('➕ Insert operation result:', data);
        console.log('❌ Insert error (if any):', error);
          
        if (error) {
          console.error('💥 Insert error details:', error);
          throw new Error(`Failed to create about content: ${error.message}`);
        }
        
        result = { success: true, data };
      }
      
      // Verify the save
      console.log('🔍 Verifying save...');
      const { data: verifyData} = await supabaseAdmin
        .from('about_content')
        .select('*')
        .eq('id', result.data.id);
      console.log('✅ Fresh data after save:', verifyData);
      
      console.log('📥 Final save result:', result);

      if (result && result.success) {
        console.log('✅ Save successful');

        triggerPublicRefresh('about_content');
        
        // Set success status immediately
        setUiState(prev => ({ 
          ...prev, 
          saveStatus: 'success',
          hasChanges: false,
          isEditing: false,
          isPostSave: true
        }));

        
        // Refresh data after a brief delay to ensure UI update happens first
        setTimeout(() => {
          refetch();
        }, 100);
        
      } else {
        console.log('❌ Save failed:', result);
        throw new Error(result?.error || result?.message || 'Failed to save about content');
      }
    } catch (error) {
      console.error('💥 Save error details:', error);
      console.error('Error message:', error.message);
      console.error('Error stack:', error.stack);
      
      // Set error status
      setUiState(prev => ({ ...prev, saveStatus: 'error' }));
      
    } finally {
      setUiState(prev => ({ ...prev, isSaving: false }));
    }
  }, [formData, aboutData, validateForm, refetch]);

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
    if (aboutData) {
      setFormData({
        about_me_title: aboutData.about_me_title || 'About Me',
        about_me_content: aboutData.about_me_content || '',
        basic_info_title: aboutData.basic_info_title || 'Basic Info',
        basic_info: convertToArrayFormat(aboutData.basic_info),
        profile_image_about: aboutData.profile_image_about || null,
        profile_image_info: aboutData.profile_image_info || null,
        profile_image_url: aboutData.profile_image_url || null,
        is_active: aboutData.is_active !== false
      });
    }

    setUiState(prev => ({
      ...prev,
      isEditing: false,
      hasChanges: false,
      saveStatus: null,
      isPostSave: false
    }));
    setValidationErrors({});
    setNewInfoKey('');
    setNewInfoValue('');
  }, [hasUnsavedChanges, aboutData, convertToArrayFormat]);

  const togglePreview = useCallback(() => {
    setUiState(prev => ({ ...prev, showPreview: !prev.showPreview }));
  }, []);

  const switchTab = useCallback((tab) => {
    setUiState(prev => ({ ...prev, activeTab: tab }));
  }, []);

  // ============================================================================
  // LOADING STATE - STANDARDIZED PHASE 3 PATTERN
  // ============================================================================
  
  if (dataLoading && !aboutData) {
    return (
      <div className="about-manager-loading">
        <LoadingSpinner size="large" />
        <p>Loading about content...</p>
      </div>
    );
  }

  // ============================================================================
  // RENDER - OPTIMIZED JSX STRUCTURE
  // ============================================================================
  
  return (
    <div className="about-content-manager">
      {/* Header Section */}
      <div className="about-manager-header">
        <div className="header-content">
          <h2 className="about-manager-title">
            <span className="about-title-icon">👤</span>
            About Section Management
          </h2>
          <p className="manager-subtitle">
            Manage your personal information and professional background
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
              title="Edit About Content"
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

      {/* Status Messages */}
      {uiState.saveStatus && (
        <div className={`status-message ${uiState.saveStatus}`} role="alert">
          {uiState.saveStatus === 'success' && (
            <>
              <span className="status-icon">✅</span>
              <div className="status-content">
                <strong>Success!</strong> About content has been saved successfully and is now live on your portfolio.
              </div>
            </>
          )}
          {uiState.saveStatus === 'error' && (
            <>
              <span className="status-icon">❌</span>
              <div className="status-content">
                <strong>Error!</strong> Failed to save about content. Please check your connection and try again.
              </div>
            </>
          )}
        </div>
      )}

      {/* Data Error */}
      {dataError && (
        <div className="status-message error" role="alert">
          <span className="status-icon">⚠️</span>
          Error loading about content: {
            typeof dataError === 'string' ? dataError : dataError.message || 'Unknown error'
          }
        </div>
      )}

      {/* Main Content */}
      <div className={`about-manager-content ${uiState.showPreview ? 'with-preview' : ''}`}>
        {/* Form Section */}
        <div className="form-section">
          <div className="form-container glass-card">
            {/* Tab Navigation */}
            <div className="tab-navigation">
              <button
                className={`tab-btn ${uiState.activeTab === 'about' ? 'active' : ''}`}
                onClick={() => switchTab('about')}
                type="button"
              >
                <span className="tab-icon">📝</span>
                About Me
              </button>
              <button
                className={`tab-btn ${uiState.activeTab === 'info' ? 'active' : ''}`}
                onClick={() => switchTab('info')}
                type="button"
              >
                <span className="tab-icon">📋</span>
                Basic Info
              </button>
            </div>

            {/* About Me Tab */}
            {uiState.activeTab === 'about' && (
              <div className="tab-content">
                {/* About Me Title Field */}
                <div className="form-group">
                  <div className="form-label-wrapper">
                    <label htmlFor="about-me-title" className="form-label required">
                      About Me Title
                    </label>
                    <span className="char-count">
                      {characterCounts.aboutMeTitle}/100
                    </span>
                  </div>
                  <input
                    id="about-me-title"
                    type="text"
                    value={formData.about_me_title}
                    onChange={(e) => handleInputChange('about_me_title', e.target.value)}
                    disabled={!uiState.isEditing}
                    className={`form-input ${validationErrors.about_me_title ? 'error' : ''}`}
                    placeholder="Enter the About Me section title..."
                    maxLength={100}
                    aria-describedby={validationErrors.about_me_title ? 'about-title-error' : undefined}
                  />
                  {validationErrors.about_me_title && (
                    <span id="about-title-error" className="error-text" role="alert">
                      {validationErrors.about_me_title}
                    </span>
                  )}
                </div>

                {/* About Me Content Field */}
                <div className="form-group">
                  <div className="form-label-wrapper">
                    <label htmlFor="about-me-content" className="form-label">
                      About Me Content
                    </label>
                    <span className="char-count">
                      {characterCounts.aboutMeContent}/2000
                    </span>
                  </div>
                  <textarea
                    id="about-me-content"
                    value={formData.about_me_content}
                    onChange={(e) => handleInputChange('about_me_content', e.target.value)}
                    disabled={!uiState.isEditing}
                    className={`form-textarea ${validationErrors.about_me_content ? 'error' : ''}`}
                    placeholder="Write your personal story and professional background..."
                    rows={8}
                    maxLength={2000}
                    aria-describedby={validationErrors.about_me_content ? 'about-content-error' : undefined}
                  />
                  {validationErrors.about_me_content && (
                    <span id="about-content-error" className="error-text" role="alert">
                      {validationErrors.about_me_content}
                    </span>
                  )}
                </div>

                {/* About Me Profile Image */}
               <div className="form-group">
                 <label className="form-label">About Me Profile Image</label>
                 <div className="image-upload-section">
                   <div className="current-image">
                     {formData.profile_image_about && (
                       <img 
                         src={formData.profile_image_about} 
                         alt="About Me Profile" 
                         className="profile-preview"
                         onError={(e) => {
                           e.target.style.display = 'none';
                         }}
                       />
                     )}
                   </div>
                   {uiState.isEditing && (
                     <div className="upload-controls">
                       <input
                         type="file"
                         accept="image/*"
                         onChange={(e) => e.target.files[0] && handleImageUpload(e.target.files[0], 'about')}
                         disabled={imageUploading.about}
                         className="file-input"
                         id="about-image-upload"
                       />
                       <label htmlFor="about-image-upload" className="upload-btn">
                         {imageUploading.about ? (
                           <>
                             <LoadingSpinner size="small" />
                             Uploading...
                           </>
                         ) : (
                           <>
                             <span className="btn-icon">📷</span>
                             Choose Image
                           </>
                         )}
                       </label>
                     </div>
                   )}
                   {validationErrors.image_about && (
                     <span className="error-text" role="alert">
                       {validationErrors.image_about}
                     </span>
                   )}
                 </div>
               </div>
             </div>
           )}

           {/* Basic Info Tab */}
           {uiState.activeTab === 'info' && (
             <div className="tab-content">
               {/* Basic Info Title Field */}
               <div className="form-group">
                 <div className="form-label-wrapper">
                   <label htmlFor="basic-info-title" className="form-label required">
                     Basic Info Title
                   </label>
                   <span className="char-count">
                     {characterCounts.basicInfoTitle}/100
                   </span>
                 </div>
                 <input
                   id="basic-info-title"
                   type="text"
                   value={formData.basic_info_title}
                   onChange={(e) => handleInputChange('basic_info_title', e.target.value)}
                   disabled={!uiState.isEditing}
                   className={`form-input ${validationErrors.basic_info_title ? 'error' : ''}`}
                   placeholder="Enter the Basic Info section title..."
                   maxLength={100}
                   aria-describedby={validationErrors.basic_info_title ? 'basic-title-error' : undefined}
                 />
                 {validationErrors.basic_info_title && (
                   <span id="basic-title-error" className="error-text" role="alert">
                     {validationErrors.basic_info_title}
                   </span>
                 )}
               </div>

               {/* Basic Info Key-Value Pairs - ARRAY BASED WITH ORDERING */}
               <div className="form-group basic-info-section">
                 <div className="form-label-wrapper">
                   <label className="form-label">
                     Basic Information Items
                   </label>
                   <span className="info-count">
                     {characterCounts.basicInfoCount}/10 items
                   </span>
                 </div>
                 
                 {/* Existing Basic Info Items - NOW WITH ORDERING CONTROLS */}
                 <div className="basic-info-list">
                   {formData.basic_info.map((item, index) => (
                     <div key={`info-${index}-${item.key}`} className="info-item">
                       {/* Order Controls */}
                       {uiState.isEditing && (
                         <div className="order-controls">
                           <button
                             type="button"
                             onClick={() => moveBasicInfo(index, 'up')}
                             disabled={index === 0}
                             className="order-btn"
                             title="Move up"
                             aria-label={`Move ${item.key} up`}
                           >
                             ⬆️
                           </button>
                           <span className="order-number">{index + 1}</span>
                           <button
                             type="button"
                             onClick={() => moveBasicInfo(index, 'down')}
                             disabled={index === formData.basic_info.length - 1}
                             className="order-btn"
                             title="Move down"
                             aria-label={`Move ${item.key} down`}
                           >
                             ⬇️
                           </button>
                         </div>
                       )}
                       
                       {/* Key Field */}
                       <div className="info-key">
                         <input
                           type="text"
                           value={item.key}
                           onChange={(e) => updateBasicInfo(index, 'key', e.target.value)}
                           disabled={!uiState.isEditing}
                           className="info-key-input"
                           placeholder="Info Label"
                           maxLength={50}
                           aria-label={`Key for item ${index + 1}`}
                         />
                       </div>
                       
                       {/* Value Field */}
                       <div className="info-value">
                         <input
                           type="text"
                           value={item.value}
                           onChange={(e) => updateBasicInfo(index, 'value', e.target.value)}
                           disabled={!uiState.isEditing}
                           className="info-value-input"
                           maxLength={200}
                           placeholder="Info Value"
                           aria-label={`Value for ${item.key}`}
                         />
                       </div>
                       
                       {/* Remove Button */}
                       {uiState.isEditing && (
                         <button
                           type="button"
                           onClick={() => removeBasicInfo(index)}
                           className="remove-info-btn"
                           title="Remove info item"
                           aria-label={`Remove ${item.key} info`}
                         >
                           ❌
                         </button>
                       )}
                     </div>
                   ))}
                 </div>

                 {/* Add New Basic Info */}
                 {uiState.isEditing && formData.basic_info.length < 10 && (
                   <div className="add-info">
                     <div className="add-info-inputs">
                       <input
                         type="text"
                         value={newInfoKey}
                         onChange={(e) => setNewInfoKey(e.target.value)}
                         placeholder="Info Label (e.g., Birth Date)"
                         className="form-input info-key-input"
                         maxLength={50}
                         onKeyPress={(e) => handleBasicInfoKeyPress(e, 'key')}
                         aria-label="New info label"
                       />
                       <input
                         type="text"
                         value={newInfoValue}
                         onChange={(e) => setNewInfoValue(e.target.value)}
                         placeholder="Info Value (e.g., 17 March 1998)"
                         className="form-input info-value-input"
                         maxLength={200}
                         onKeyPress={(e) => handleBasicInfoKeyPress(e, 'value')}
                         aria-label="New info value"
                       />
                       <button
                         type="button"
                         onClick={addBasicInfo}
                         disabled={!newInfoKey.trim() || !newInfoValue.trim()}
                         className="add-info-btn"
                         title="Add info item"
                       >
                         ➕ Add
                       </button>
                     </div>
                   </div>
                 )}

                 {validationErrors.basic_info && (
                   <span className="error-text" role="alert">
                     {validationErrors.basic_info}
                   </span>
                 )}
               </div>

               {/* Basic Info Profile Image */}
               <div className="form-group">
                 <label className="form-label">Basic Info Profile Image</label>
                 <div className="image-upload-section">
                   <div className="current-image">
                     {formData.profile_image_info && (
                       <img 
                         src={formData.profile_image_info} 
                         alt="Basic Info Profile" 
                         className="profile-preview"
                         onError={(e) => {
                           e.target.style.display = 'none';
                         }}
                       />
                     )}
                   </div>
                   {uiState.isEditing && (
                     <div className="upload-controls">
                       <input
                         type="file"
                         accept="image/*"
                         onChange={(e) => e.target.files[0] && handleImageUpload(e.target.files[0], 'info')}
                         disabled={imageUploading.info}
                         className="file-input"
                         id="info-image-upload"
                       />
                       <label htmlFor="info-image-upload" className="upload-btn">
                         {imageUploading.info ? (
                           <>
                             <LoadingSpinner size="small" />
                             Uploading...
                           </>
                         ) : (
                           <>
                             <span className="btn-icon">📷</span>
                             Choose Image
                           </>
                         )}
                       </label>
                     </div>
                   )}
                   {validationErrors.image_info && (
                     <span className="error-text" role="alert">
                       {validationErrors.image_info}
                     </span>
                   )}
                 </div>
               </div>

               {/* Legacy Profile Image URL */}
               <div className="form-group">
                 <div className="form-label-wrapper">
                   <label htmlFor="profile-image-url" className="form-label">
                     Legacy Profile Image URL
                   </label>
                 </div>
                 <input
                   id="profile-image-url"
                   type="text"
                   value={formData.profile_image_url || ''}
                   onChange={(e) => handleInputChange('profile_image_url', e.target.value)}
                   disabled={!uiState.isEditing}
                   className="form-input"
                   placeholder="Legacy profile image URL (if any)..."
                 />
                 <small className="field-help">
                   This field maintains compatibility with older profile image references.
                 </small>
               </div>
             </div>
           )}

           {/* Active Status */}
           <div className="form-group">
             <label className="checkbox-wrapper">
               <input
                 type="checkbox"
                 checked={formData.is_active}
                 onChange={(e) => handleInputChange('is_active', e.target.checked)}
                 disabled={!uiState.isEditing}
                 className="checkbox-input"
                 aria-describedby="about-active-status-description"
               />
               <span className="checkbox-custom" aria-hidden="true"></span>
               <span id="about-active-status-description" className="checkbox-label">
                 About section is active and visible to visitors
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
             
             <div className="about-preview">
               {/* Preview Tab Navigation */}
               <div className="preview-tabs">
                 <button
                   className={`preview-tab ${uiState.activeTab === 'about' ? 'active' : ''}`}
                   onClick={() => switchTab('about')}
                   type="button"
                 >
                   {formData.about_me_title || 'About Me'}
                 </button>
                 <button
                   className={`preview-tab ${uiState.activeTab === 'info' ? 'active' : ''}`}
                   onClick={() => switchTab('info')}
                   type="button"
                 >
                   {formData.basic_info_title || 'Basic Info'}
                 </button>
               </div>

               {/* Preview Content */}
               <div className="preview-about">
                 {uiState.activeTab === 'about' && (
                   <div className="preview-about-me">
                     <div className="preview-content">
                       {formData.about_me_title && (
                         <h3 className="preview-about-title">{formData.about_me_title}</h3>
                       )}
                       {formData.about_me_content && (
                         <div className="preview-about-content">
                           {formData.about_me_content.split('\n\n').map((paragraph, index) => (
                             <p key={`preview-para-${index}`} className="preview-paragraph">
                               {paragraph}
                             </p>
                           ))}
                         </div>
                       )}
                     </div>
                     {formData.profile_image_about && (
                       <div className="preview-image">
                         <img 
                           src={formData.profile_image_about} 
                           alt="About Me Preview" 
                           className="preview-profile-img"
                         />
                       </div>
                     )}
                   </div>
                 )}

                 {uiState.activeTab === 'info' && (
                   <div className="preview-basic-info">
                     <div className="preview-content">
                       {formData.basic_info_title && (
                         <h3 className="preview-info-title">{formData.basic_info_title}</h3>
                       )}
                       {formData.basic_info.length > 0 && (
                         <div className="preview-info-grid">
                           {formData.basic_info
                             .sort((a, b) => a.order_index - b.order_index)
                             .map((item, index) => (
                               <div key={`preview-info-${index}-${item.key}`} className="preview-info-item">
                                 <div className="preview-info-label">{item.key}</div>
                                 <div className="preview-info-value">{item.value}</div>
                               </div>
                             ))}
                         </div>
                       )}
                     </div>
                     {formData.profile_image_info && (
                       <div className="preview-image">
                         <img 
                           src={formData.profile_image_info} 
                           alt="Basic Info Preview" 
                           className="preview-profile-img"
                         />
                       </div>
                     )}
                   </div>
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

export default AboutSectionManager;