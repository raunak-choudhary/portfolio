import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useSupabase } from '../../../../hooks/useSupabase';
import LoadingSpinner from '../../../common/LoadingSpinner';
import './RecommendationsManager.css';
import { triggerPublicRefresh } from '../../../../services/adminDataService';

const RecommendationsManager = () => {
  // ============================================================================
  // DATA FETCHING WITH OPTIMIZED useSupabase HOOK
  // ============================================================================
  
  const { 
    data: recommendationsData, 
    loading: dataLoading, 
    error: dataError,
    refetch 
  } = useSupabase('recommendations', {}, { 
    orderBy: [
      { column: 'date_received', ascending: false }, // Sort by date (newest first)
      { column: 'order_index', ascending: true }
    ],
    cacheKey: 'recommendations-admin'
  });

  // ============================================================================
  // STATE MANAGEMENT - ORGANIZED AND OPTIMIZED
  // ============================================================================
  
  // View state management
  const [viewMode, setViewMode] = useState('list'); // 'list', 'add', 'edit'
  const [selectedRecommendation, setSelectedRecommendation] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterFeatured, setFilterFeatured] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');

  // Form state with proper initial values
  const [formData, setFormData] = useState({
    recommendation_number: '',
    recommender_name: '',
    recommender_title: '',
    organization: '',
    relationship: '',
    content: '',
    linkedin_profile_url: '',
    profile_image_url: '',
    date_received: '',
    recommendation_type: '',
    rating: '',
    is_featured: false,
    is_public: true,
    word_count: null,
    order_index: null,
    status: 'active'
  });

  // UI state management
  const [uiState, setUiState] = useState({
    isSaving: false,
    hasChanges: false,
    showPreview: false,
    saveStatus: null, // 'success', 'error', null
    isPostSave: false
  });

  // Form validation state
  const [validationErrors, setValidationErrors] = useState({});

  // File upload state
  const [profileImageUploading, setProfileImageUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  // Delete confirmation modal state
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [recommendationToDelete, setRecommendationToDelete] = useState(null);

  // Profile image delete confirmation state
  const [showImageDeleteModal, setShowImageDeleteModal] = useState(false);

  // ============================================================================
  // MEMOIZED VALUES FOR PERFORMANCE
  // ============================================================================
  
  const characterCounts = useMemo(() => ({
    content: formData.content.length,
    recommenderName: formData.recommender_name.length,
    recommenderTitle: formData.recommender_title.length,
    organization: formData.organization.length,
    relationship: formData.relationship.length,
    linkedinUrl: formData.linkedin_profile_url.length,
    recommendationType: formData.recommendation_type.length
  }), [formData]);

  const filteredRecommendations = useMemo(() => {
    if (!recommendationsData) return [];
    
    return recommendationsData.filter(recommendation => {
      const matchesSearch = recommendation.recommender_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                           recommendation.organization?.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesFeatured = filterFeatured === 'all' || 
                             (filterFeatured === 'true' && recommendation.is_featured) ||
                             (filterFeatured === 'false' && !recommendation.is_featured);
      const matchesStatus = filterStatus === 'all' || recommendation.status === filterStatus;
      
      return matchesSearch && matchesFeatured && matchesStatus;
    });
  }, [recommendationsData, searchTerm, filterFeatured, filterStatus]);

  const wordCount = useMemo(() => {
    if (!formData.content) return 0;
    return formData.content.trim().split(/\s+/).filter(word => word.length > 0).length;
  }, [formData.content]);

  const hasUnsavedChanges = useMemo(() => {
    if (viewMode === 'list') return false;
    if (!selectedRecommendation && viewMode === 'edit') return false;
    
    if (viewMode === 'add') {
      return formData.recommender_name.trim() !== '' || 
             formData.content.trim() !== '' ||
             formData.recommender_title.trim() !== '' ||
             formData.organization.trim() !== '' ||
             formData.relationship.trim() !== '';
    }

    if (viewMode === 'edit' && selectedRecommendation) {
      return (
        formData.recommendation_number !== (selectedRecommendation.recommendation_number || '') ||
        formData.recommender_name !== (selectedRecommendation.recommender_name || '') ||
        formData.recommender_title !== (selectedRecommendation.recommender_title || '') ||
        formData.organization !== (selectedRecommendation.organization || '') ||
        formData.relationship !== (selectedRecommendation.relationship || '') ||
        formData.content !== (selectedRecommendation.content || '') ||
        formData.linkedin_profile_url !== (selectedRecommendation.linkedin_profile_url || '') ||
        formData.profile_image_url !== (selectedRecommendation.profile_image_url || '') ||
        formData.date_received !== (selectedRecommendation.date_received || '') ||
        formData.recommendation_type !== (selectedRecommendation.recommendation_type || '') ||
        formData.rating !== (selectedRecommendation.rating || '') ||
        formData.is_featured !== (selectedRecommendation.is_featured || false) ||
        formData.is_public !== (selectedRecommendation.is_public !== false ? selectedRecommendation.is_public : true) ||
        formData.status !== (selectedRecommendation.status || 'active')
      );
    }

    return uiState.hasChanges;
  }, [formData, selectedRecommendation, viewMode, uiState.hasChanges]);

  // ============================================================================
  // EFFECT HOOKS - OPTIMIZED DATA LOADING
  // ============================================================================
  
  // Load data into form when editing recommendation
  useEffect(() => {
    if (viewMode === 'edit' && selectedRecommendation) {
      const newFormData = {
        recommendation_number: selectedRecommendation.recommendation_number || '',
        recommender_name: selectedRecommendation.recommender_name || '',
        recommender_title: selectedRecommendation.recommender_title || '',
        organization: selectedRecommendation.organization || '',
        relationship: selectedRecommendation.relationship || '',
        content: selectedRecommendation.content || '',
        linkedin_profile_url: selectedRecommendation.linkedin_profile_url || '',
        profile_image_url: selectedRecommendation.profile_image_url || '',
        date_received: selectedRecommendation.date_received || '',
        recommendation_type: selectedRecommendation.recommendation_type || '',
        rating: selectedRecommendation.rating || '',
        is_featured: selectedRecommendation.is_featured || false,
        is_public: selectedRecommendation.is_public !== false ? selectedRecommendation.is_public : true,
        word_count: selectedRecommendation.word_count,
        order_index: selectedRecommendation.order_index,
        status: selectedRecommendation.status || 'active'
      };
      
      setFormData(newFormData);
      setValidationErrors({});
      
      // Preserve success message if we're in post-save state
      setUiState(prev => {
        if (prev.isPostSave && prev.saveStatus === 'success') {
          return {
            ...prev,
            hasChanges: false
          };
        } else {
          return {
            ...prev,
            hasChanges: false,
            saveStatus: null,
            isPostSave: false
          };
        }
      });
    }
  }, [viewMode, selectedRecommendation]);

  // Reset form when switching to add mode
  useEffect(() => {
    if (viewMode === 'add') {
      setFormData({
        recommendation_number: '',
        recommender_name: '',
        recommender_title: '',
        organization: '',
        relationship: '',
        content: '',
        linkedin_profile_url: '',
        profile_image_url: '',
        date_received: '',
        recommendation_type: '',
        rating: '',
        is_featured: false,
        is_public: true,
        word_count: null,
        order_index: null,
        status: 'active'
      });
      setValidationErrors({});
      setUiState(prev => ({
        ...prev,
        hasChanges: false,
        saveStatus: null,
        isPostSave: false
      }));
    }
  }, [viewMode]);

  // Auto-hide status messages
  useEffect(() => {
    if (uiState.saveStatus) {
      let timeout;
      
      if (uiState.saveStatus === 'success') {
        timeout = viewMode === 'list' ? 12000 : 3000;
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
  }, [uiState.saveStatus, viewMode]);

  // ============================================================================
  // FORM HANDLING - OPTIMIZED AND STANDARDIZED
  // ============================================================================
  
  const handleInputChange = useCallback((field, value) => {
    setFormData(prev => {
      const newData = { ...prev, [field]: value };
      
      // Auto-calculate word count when content changes
      if (field === 'content') {
        const words = value.trim().split(/\s+/).filter(word => word.length > 0);
        newData.word_count = words.length;
      }
      
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
  // PROFILE IMAGE UPLOAD HANDLING
  // ============================================================================
  
  const handleProfileImageUpload = useCallback(async (file) => {
    if (!file) return;

    const maxSize = 5 * 1024 * 1024; // 5MB for profile images
    const allowedTypes = [
      'image/jpeg', 
      'image/jpg', 
      'image/png',
      'image/webp'
    ];

    // Validate file
    if (file.size > maxSize) {
      setValidationErrors(prev => ({
        ...prev,
        profileImage: 'File size must be less than 5MB'
      }));
      return;
    }
    
    if (!allowedTypes.includes(file.type)) {
      setValidationErrors(prev => ({
        ...prev,
        profileImage: 'Only JPEG, PNG, and WebP formats are allowed'
      }));
      return;
    }

    setProfileImageUploading(true);
    setUploadProgress(0);

    try {
      // Import Supabase client for file upload
      const { createClient } = await import('@supabase/supabase-js');
      const supabaseAdmin = createClient(
        process.env.REACT_APP_SUPABASE_URL,
        process.env.REACT_APP_SUPABASE_SERVICE_ROLE_KEY
      );

      const timestamp = Date.now();
      const fileExtension = file.name.split('.').pop();
      const recommenderName = formData.recommender_name || 'recommender';
      const sanitizedName = recommenderName.toLowerCase().replace(/[^a-z0-9]/g, '-');
      const fileName = `${sanitizedName}-profile-${timestamp}.${fileExtension}`;
      const filePath = `profile-images/${fileName}`;

      // Simulate upload progress
      const progressInterval = setInterval(() => {
        setUploadProgress(prev => Math.min(prev + 10, 90));
      }, 100);

      // Upload to Supabase Storage
      const { error: uploadError } = await supabaseAdmin.storage
        .from('profile-images')
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: false
        });

      clearInterval(progressInterval);
      setUploadProgress(100);

      if (uploadError) {
        throw new Error(`Upload failed: ${uploadError.message}`);
      }

      // Get public URL
      const { data: urlData } = supabaseAdmin.storage
        .from('profile-images')
        .getPublicUrl(filePath);

      // Update form data with profile image URL
      handleInputChange('profile_image_url', urlData.publicUrl);

      // Clear any validation errors
      setValidationErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors.profileImage;
        return newErrors;
      });

    } catch (error) {
      console.error('Profile image upload error:', error);
      setValidationErrors(prev => ({
        ...prev,
        profileImage: error.message || 'Failed to upload profile image'
      }));
    } finally {
      setProfileImageUploading(false);
      setUploadProgress(0);
    }
  }, [formData.recommender_name, handleInputChange]);

  const removeProfileImage = useCallback(() => {
    setShowImageDeleteModal(true);
  }, []);

  const confirmProfileImageDelete = useCallback(async () => {
    if (!formData.profile_image_url) return;

    try {
      // Import Supabase client for file deletion
      const { createClient } = await import('@supabase/supabase-js');
      const supabaseAdmin = createClient(
        process.env.REACT_APP_SUPABASE_URL,
        process.env.REACT_APP_SUPABASE_SERVICE_ROLE_KEY
      );

      // Extract file path from URL
      const filePath = formData.profile_image_url.split('/storage/v1/object/public/profile-images/')[1];
      
      if (filePath) {
        // Delete file from storage
        const { error: storageError } = await supabaseAdmin.storage
          .from('profile-images')
          .remove([filePath]);

        if (storageError) {
          console.warn('⚠️ Could not delete file from storage:', storageError);
        }
      }

      // Remove profile image URL from form
      handleInputChange('profile_image_url', '');
      
      setUiState(prev => ({ 
        ...prev, 
        saveStatus: 'success',
        statusMessageContent: 'Profile image deleted successfully.'
      }));

    } catch (error) {
      console.error('Profile image delete error:', error);
      setValidationErrors(prev => ({
        ...prev,
        profileImage: error.message || 'Failed to delete profile image'
      }));
    } finally {
      setShowImageDeleteModal(false);
    }
  }, [formData.profile_image_url, handleInputChange]);

  const cancelProfileImageDelete = useCallback(() => {
    setShowImageDeleteModal(false);
  }, []);

  // ============================================================================
  // FORM VALIDATION - COMPREHENSIVE AND OPTIMIZED
  // ============================================================================
  
  const validateForm = useCallback(() => {
    const errors = {};

    // Recommender name validation (required, 2-200 chars)
    const nameTrimmed = formData.recommender_name.trim();
    if (!nameTrimmed) {
      errors.recommender_name = 'Recommender name is required';
    } else if (nameTrimmed.length < 2) {
      errors.recommender_name = 'Recommender name must be at least 2 characters';
    } else if (nameTrimmed.length > 200) {
      errors.recommender_name = 'Recommender name must be less than 200 characters';
    }

    // Content validation (required, max 8000 chars)
    const contentTrimmed = formData.content.trim();
    if (!contentTrimmed) {
      errors.content = 'Recommendation content is required';
    } else if (contentTrimmed.length > 8000) {
      errors.content = 'Content must be less than 8000 characters';
    }

    // Recommender title validation (optional, max 200 chars)
    if (formData.recommender_title && formData.recommender_title.length > 200) {
      errors.recommender_title = 'Title must be less than 200 characters';
    }

    // Organization validation (optional, max 200 chars)
    if (formData.organization && formData.organization.length > 200) {
      errors.organization = 'Organization must be less than 200 characters';
    }

    // Relationship validation (optional, max 100 chars)
    if (formData.relationship && formData.relationship.length > 100) {
      errors.relationship = 'Relationship must be less than 100 characters';
    }

    // LinkedIn URL validation
    if (formData.linkedin_profile_url && formData.linkedin_profile_url.trim() !== '') {
      const linkedinPattern = /^(https?:\/\/)?(www\.)?linkedin\.com\/in\/[a-zA-Z0-9-]+\/?$/;
      if (!linkedinPattern.test(formData.linkedin_profile_url)) {
        errors.linkedin_profile_url = 'Please enter a valid LinkedIn profile URL (e.g., https://linkedin.com/in/username)';
      }
    }

    // Recommendation type validation (optional, max 50 chars)
    if (formData.recommendation_type && formData.recommendation_type.length > 50) {
      errors.recommendation_type = 'Recommendation type must be less than 50 characters';
    }

    // Rating validation
    if (formData.rating) {
      const rating = parseInt(formData.rating);
      if (isNaN(rating) || rating < 1 || rating > 5) {
        errors.rating = 'Rating must be between 1 and 5';
      }
    }

    // Date validation (check if date is not in future)
    if (formData.date_received) {
      const receivedDate = new Date(formData.date_received);
      const today = new Date();
      
      if (receivedDate > today) {
        errors.date_received = 'Date received cannot be in the future';
      }
    }

    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  }, [formData]);

  // ============================================================================
  // SAVE OPERATION - FOLLOWING WORK EXPERIENCE MANAGER PATTERN
  // ============================================================================
  
  const handleSave = useCallback(async () => {
    console.log('🚀 Starting Recommendation save process...');
    
    if (!validateForm()) {
      console.log('❌ Form validation failed');
      setUiState(prev => ({ ...prev, saveStatus: 'error' }));
      return;
    }

    setUiState(prev => ({ ...prev, isSaving: true, saveStatus: null }));

    try {
      // Calculate word count
      const wordCount = formData.content.trim().split(/\s+/).filter(word => word.length > 0).length;

      // Prepare data for saving
      const saveData = {
        recommendation_number: formData.recommendation_number ? parseInt(formData.recommendation_number) : null,
        recommender_name: formData.recommender_name.trim(),
        recommender_title: formData.recommender_title.trim() || null,
        organization: formData.organization.trim() || null,
        relationship: formData.relationship.trim() || null,
        content: formData.content.trim(),
        linkedin_profile_url: formData.linkedin_profile_url.trim() || null,
        profile_image_url: formData.profile_image_url || null,
        date_received: formData.date_received || null,
        recommendation_type: formData.recommendation_type.trim() || null,
        rating: formData.rating ? parseInt(formData.rating) : null,
        is_featured: formData.is_featured,
        is_public: formData.is_public,
        word_count: wordCount,
        order_index: formData.order_index,
        status: formData.status
      };

      console.log('📤 Sending data to save:', saveData);
      
      // Import Supabase with service key for admin operations
      const { createClient } = await import('@supabase/supabase-js');
      
      // Create admin client with service key (bypasses RLS)
      const supabaseAdmin = createClient(
        process.env.REACT_APP_SUPABASE_URL,
        process.env.REACT_APP_SUPABASE_SERVICE_ROLE_KEY
      );
      
      console.log('🔐 Using service key for admin operations');
      
      let result;
      
      if (viewMode === 'edit' && selectedRecommendation?.id) {
        // Update existing recommendation
        console.log('🔄 Updating existing recommendation with ID:', selectedRecommendation.id);
        const { data, error } = await supabaseAdmin
          .from('recommendations')
          .update({
            ...saveData,
            updated_at: new Date().toISOString()
          })
          .eq('id', selectedRecommendation.id)
          .select()
          .single();
          
        console.log('✏️ Update operation result:', data);
        console.log('❌ Update error (if any):', error);
          
        if (error) {
          console.error('💥 Update error details:', error);
          throw new Error(`Failed to update recommendation: ${error.message}`);
        }
        
        result = { success: true, data };
      } else {
        // Create new recommendation
        console.log('➕ Creating new recommendation');
        const { data, error } = await supabaseAdmin
          .from('recommendations')
          .insert([saveData])
          .select()
          .single();
          
        console.log('➕ Insert operation result:', data);
        console.log('❌ Insert error (if any):', error);
          
        if (error) {
          console.error('💥 Insert error details:', error);
          throw new Error(`Failed to create recommendation: ${error.message}`);
        }
        
        result = { success: true, data };
      }
      
      console.log('📥 Final save result:', result);

      if (result && result.success) {
        console.log('✅ Save successful');

        triggerPublicRefresh('recommendations');
        
        // Set success status immediately
        setUiState(prev => ({ 
          ...prev, 
          saveStatus: 'success',
          hasChanges: false,
          isPostSave: true
        }));

        // If this was a new recommendation, switch to list view after save
        if (viewMode === 'add') {
          setTimeout(() => {
            setViewMode('list');
            refetch();
          }, 1500);
        } else {
          // Refresh data after a brief delay
          setTimeout(() => {
            refetch();
          }, 100);
        }
        
      } else {
        console.log('❌ Save failed:', result);
        throw new Error(result?.error || result?.message || 'Failed to save recommendation');
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
  }, [formData, selectedRecommendation, viewMode, validateForm, refetch]);

  // ============================================================================
  // UI ACTIONS - OPTIMIZED EVENT HANDLERS
  // ============================================================================
  
  const handleAddNew = useCallback(() => {
    if (hasUnsavedChanges && viewMode !== 'list') {
      if (!window.confirm('You have unsaved changes. Are you sure you want to start a new recommendation entry? Changes will be lost.')) {
        return;
      }
    }
    setViewMode('add');
    setSelectedRecommendation(null);
  }, [hasUnsavedChanges, viewMode]);

  const handleEdit = useCallback((recommendation) => {
    if (hasUnsavedChanges && viewMode !== 'list' && selectedRecommendation?.id !== recommendation.id) {
      if (!window.confirm('You have unsaved changes. Are you sure you want to edit a different recommendation? Changes will be lost.')) {
        return;
      }
    }
    setSelectedRecommendation(recommendation);
    setViewMode('edit');
  }, [hasUnsavedChanges, viewMode, selectedRecommendation]);

  const handleCancel = useCallback(() => {
    if (hasUnsavedChanges) {
      if (!window.confirm('You have unsaved changes. Are you sure you want to cancel? Changes will be lost.')) {
        return;
      }
    }
    setViewMode('list');
    setSelectedRecommendation(null);
    setValidationErrors({});
    setUiState(prev => ({
      ...prev,
      hasChanges: false,
      saveStatus: null,
      isPostSave: false
    }));
  }, [hasUnsavedChanges]);

  const handleDelete = useCallback((recommendation) => {
    setRecommendationToDelete(recommendation);
    setShowDeleteModal(true);
  }, []);

  const confirmDeleteAction = useCallback(async () => {
    if (!recommendationToDelete) return;

    try {
      const { createClient } = await import('@supabase/supabase-js');
      const supabaseAdmin = createClient(
        process.env.REACT_APP_SUPABASE_URL,
        process.env.REACT_APP_SUPABASE_SERVICE_ROLE_KEY
      );

      // Delete associated profile image if exists
      if (recommendationToDelete.profile_image_url) {
        try {
          const filePath = recommendationToDelete.profile_image_url.split('/storage/v1/object/public/profile-images/')[1];
          if (filePath) {
            await supabaseAdmin.storage
              .from('profile-images')
              .remove([filePath]);
            console.log('🗑️ Associated profile image deleted');
          }
        } catch (fileError) {
          console.warn('⚠️ Could not delete associated profile image:', fileError);
        }
      }

      const { error } = await supabaseAdmin
        .from('recommendations')
        .delete()
        .eq('id', recommendationToDelete.id);

      if (error) {
        throw new Error(`Failed to delete recommendation: ${error.message}`);
      }

      triggerPublicRefresh('recommendations');
      setUiState(prev => ({ 
        ...prev, 
        saveStatus: 'success',
        statusMessageContent: `Recommendation from "${recommendationToDelete.recommender_name}" has been deleted.`
      }));
      refetch();

    } catch (error) {
      console.error('Delete error:', error);
      setUiState(prev => ({ 
        ...prev, 
        saveStatus: 'error',
        statusMessageContent: `Error deleting recommendation: ${error.message}`
      }));
    } finally {
      setShowDeleteModal(false);
      setRecommendationToDelete(null);
    }
  }, [recommendationToDelete, refetch]);

  const cancelDeleteAction = useCallback(() => {
    setShowDeleteModal(false);
    setRecommendationToDelete(null);
  }, []);

  const togglePreview = useCallback(() => {
    setUiState(prev => ({ ...prev, showPreview: !prev.showPreview }));
  }, []);

  // ============================================================================
  // DATE FORMATTING UTILITIES
  // ============================================================================
  
  const formatRecommendationDate = useCallback((dateString) => {
    if (!dateString) return 'N/A';
    
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString('en-US', { 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
      });
    } catch (error) {
      return 'Invalid Date';
    }
  }, []);

  // ============================================================================
  // LOADING STATE - STANDARDIZED PHASE 3 PATTERN
  // ============================================================================
  
  if (dataLoading && !recommendationsData) {
    return (
      <div className="recommgr-loading">
        <LoadingSpinner size="large" />
        <p>Loading recommendations...</p>
      </div>
    );
  }

  // ============================================================================
  // RENDER - OPTIMIZED JSX STRUCTURE
  // ============================================================================
  
  return (
    <div className="recommgr-content-manager">
      {/* Header Section */}
      <div className="recommgr-manager-header">
        <div className="recommgr-header-content">
          <h2 className="recommgr-manager-title">
            <span className="recommgr-title-icon">⭐</span>
            Recommendations Management
          </h2>
          <p className="recommgr-manager-subtitle">
            Manage your professional recommendations and testimonials
          </p>
        </div>

        <div className="recommgr-header-actions">
          {viewMode === 'list' ? (
            <>
              <button
                className="recommgr-action-btn recommgr-add-btn recommgr-primary"
                onClick={handleAddNew}
                title="Add New Recommendation"
                type="button"
              >
                <span className="recommgr-btn-icon">➕</span>
                Add Recommendation
              </button>
            </>
          ) : (
            <>
              <button
                className="recommgr-action-btn recommgr-preview-btn"
                onClick={togglePreview}
                title="Toggle Preview"
                type="button"
              >
                <span className="recommgr-btn-icon">👁️</span>
                {uiState.showPreview ? 'Hide Preview' : 'Show Preview'}
              </button>
              <div className="recommgr-edit-actions">
                <button
                  className="recommgr-action-btn recommgr-cancel-btn"
                  onClick={handleCancel}
                  disabled={uiState.isSaving}
                  title="Cancel Changes"
                  type="button"
                >
                  <span className="recommgr-btn-icon">❌</span>
                  Cancel
                </button>
                <button
                  className="recommgr-action-btn recommgr-save-btn recommgr-primary"
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
                      <span className="recommgr-btn-icon">💾</span>
                      Save Recommendation
                    </>
                  )}
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Status Messages */}
      {uiState.saveStatus && (
        <div className={`recommgr-status-message ${uiState.saveStatus}`} role="alert">
          {uiState.saveStatus === 'success' && (
            <>
              <span className="recommgr-status-icon">✅</span>
              <div className="recommgr-status-content">
                <strong>Success!</strong> 
                {uiState.statusMessageContent || 'Recommendation has been saved successfully and is now live on your portfolio.'}
              </div>
            </>
          )}
          {uiState.saveStatus === 'error' && (
            <>
              <span className="recommgr-status-icon">❌</span>
              <div className="recommgr-status-content">
                <strong>Error!</strong> 
                {uiState.statusMessageContent || 'Failed to save recommendation. Please check your connection and try again.'}
              </div>
            </>
          )}
        </div>
      )}

      {/* Data Error */}
      {dataError && (
        <div className="recommgr-status-message recommgr-error" role="alert">
          <span className="recommgr-status-icon">⚠️</span>
          Error loading recommendations: {
            typeof dataError === 'string' ? dataError : dataError.message || 'Unknown error'
          }
        </div>
      )}

      {/* Delete Recommendation Confirmation Modal */}
      {showDeleteModal && recommendationToDelete && (
        <div className="recommgr-modal-overlay">
          <div className="recommgr-modal-content recommgr-glass-card">
            <h3 className="recommgr-modal-title">
              <span className="recommgr-modal-icon">🗑️</span> Confirm Deletion
            </h3>
            <p className="recommgr-modal-text">
              Are you sure you want to delete the recommendation from <strong>"{recommendationToDelete.recommender_name}"</strong>? 
              This action cannot be undone and will also delete any associated profile image.
            </p>
            <div className="recommgr-modal-actions">
              <button
                type="button"
                className="recommgr-action-btn recommgr-cancel-btn"
                onClick={cancelDeleteAction}
              >
                <span className="recommgr-btn-icon">❌</span> Cancel
              </button>
              <button
                type="button"
                className="recommgr-action-btn recommgr-delete-btn-confirm recommgr-primary"
                onClick={confirmDeleteAction}
              >
                <span className="recommgr-btn-icon">🗑️</span> Delete Recommendation
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Profile Image Confirmation Modal */}
      {showImageDeleteModal && (
        <div className="recommgr-modal-overlay">
          <div className="recommgr-modal-content recommgr-glass-card">
            <h3 className="recommgr-modal-title">
              <span className="recommgr-modal-icon">🖼️</span> Confirm Profile Image Deletion
            </h3>
            <p className="recommgr-modal-text">
              Are you sure you want to delete this profile image? This action cannot be undone.
            </p>
            <div className="recommgr-modal-actions">
              <button
                type="button"
                className="recommgr-action-btn recommgr-cancel-btn"
                onClick={cancelProfileImageDelete}
              >
                <span className="recommgr-btn-icon">❌</span> Cancel
              </button>
              <button
                type="button"
                className="recommgr-action-btn recommgr-delete-btn-confirm recommgr-primary"
                onClick={confirmProfileImageDelete}
              >
                <span className="recommgr-btn-icon">🗑️</span> Delete Image
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className={`recommgr-manager-content ${uiState.showPreview ? 'recommgr-with-preview' : ''}`}>
        
        {/* LIST VIEW */}
        {viewMode === 'list' && (
          <div className="recommgr-list-section">
            <div className="recommgr-list-container recommgr-glass-card">
              
              {/* Search and Filters */}
              <div className="recommgr-list-controls">
                <div className="recommgr-search-section">
                  <div className="recommgr-search-wrapper">
                    <span className="recommgr-search-icon">🔍</span>
                    <input
                      type="text"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      placeholder="Search by recommender name or organization..."
                      className="recommgr-search-input"
                    />
                  </div>
                </div>
                
                <div className="recommgr-filters-section">
                  <select
                    value={filterFeatured}
                    onChange={(e) => setFilterFeatured(e.target.value)}
                    className="recommgr-filter-select"
                  >
                    <option value="all">All Featured Status</option>
                    <option value="true">Featured</option>
                    <option value="false">Not Featured</option>
                  </select>
                  
                  <select
                    value={filterStatus}
                    onChange={(e) => setFilterStatus(e.target.value)}
                    className="recommgr-filter-select"
                  >
                    <option value="all">All Status</option>
                    <option value="active">Active</option>
                    <option value="draft">Draft</option>
                    <option value="archived">Archived</option>
                  </select>
                </div>
              </div>

              {/* Recommendations Table */}
              <div className="recommgr-table-wrapper">
                {filteredRecommendations.length === 0 ? (
                  <div className="recommgr-no-data-message">
                    <div className="recommgr-no-data-icon">⭐</div>
                    <h3>No Recommendations Found</h3>
                    <p>
                      {recommendationsData?.length === 0 
                        ? 'No recommendations have been created yet. Click "Add Recommendation" to get started.'
                        : 'No recommendations match your current filters. Try adjusting your search criteria.'
                      }
                    </p>
                  </div>
                ) : (
                  <table className="recommgr-table">
                    <thead>
                      <tr>
                        <th>Recommender Name</th>
                        <th>Organization/Company</th>
                        <th>Relationship</th>
                        <th>Date Received</th>
                        <th>Featured Status</th>
                        <th>Status</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredRecommendations.map((recommendation, index) => (
                        <tr key={recommendation.id || index} className="recommgr-table-row">
                          <td className="recommgr-recommender-name">
                            <div className="recommgr-name-content">
                              <h4 className="recommgr-name-text">{recommendation.recommender_name}</h4>
                              {recommendation.recommender_title && (
                                <span className="recommgr-title-subtitle">{recommendation.recommender_title}</span>
                              )}
                            </div>
                          </td>
                          
                          <td className="recommgr-organization">
                            <span className="recommgr-org-text">{recommendation.organization || 'N/A'}</span>
                          </td>
                          
                          <td className="recommgr-relationship">
                            <span className="recommgr-rel-text">{recommendation.relationship || 'N/A'}</span>
                          </td>
                          
                          <td className="recommgr-date">
                            <span className="recommgr-date-text">
                              {formatRecommendationDate(recommendation.date_received)}
                            </span>
                          </td>
                          
                          <td className="recommgr-featured">
                            <span className={`recommgr-featured-text ${recommendation.is_featured ? 'recommgr-featured-true' : 'recommgr-featured-false'}`}>
                              {recommendation.is_featured ? 'TRUE' : 'FALSE'}
                            </span>
                          </td>
                          
                          <td className="recommgr-status">
                            <span className={`recommgr-status-badge recommgr-status-${recommendation.status}`}>
                              {recommendation.status?.toUpperCase() || 'ACTIVE'}
                            </span>
                          </td>
                          
                          <td className="recommgr-actions">
                            <div className="recommgr-action-buttons">
                              <button
                                className="recommgr-action-btn-mini recommgr-edit-btn"
                                onClick={() => handleEdit(recommendation)}
                                title="Edit Recommendation"
                              >
                                ✏️
                              </button>
                              <button
                                className="recommgr-action-btn-mini recommgr-delete-btn"
                                onClick={() => handleDelete(recommendation)}
                                title="Delete Recommendation"
                              >
                                🗑️
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
              
              {/* Recommendations Summary */}
              {recommendationsData && recommendationsData.length > 0 && (
                <div className="recommgr-summary">
                  <div className="recommgr-summary-stats">
                    <span className="recommgr-stat-item">
                      <strong>{recommendationsData.length}</strong> total recommendations
                    </span>
                    <span className="recommgr-stat-item">
                      <strong>{recommendationsData.filter(r => r.is_featured).length}</strong> featured recommendations
                    </span>
                    <span className="recommgr-stat-item">
                      <strong>{recommendationsData.filter(r => r.status === 'active').length}</strong> active recommendations
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* FORM VIEW (ADD/EDIT) */}
        {(viewMode === 'add' || viewMode === 'edit') && (
          <div className="recommgr-form-section">
            <div className="recommgr-form-container recommgr-glass-card">
              
              {/* Form Title */}
              <div className="recommgr-form-title-section">
                <h3 className="recommgr-form-title">
                  {viewMode === 'add' ? 'Add New Recommendation' : `Edit: ${selectedRecommendation?.recommender_name}`}
                </h3>
                <p className="recommgr-form-subtitle">
                  {viewMode === 'add' 
                    ? 'Create a new recommendation entry for your portfolio'
                    : 'Update recommendation information and details'
                  }
                </p>
              </div>

              {/* Basic Information Section */}
              <div className="recommgr-form-section-group">
                <h4 className="recommgr-section-title">
                  <span className="recommgr-section-icon">📋</span>
                  Basic Information
                </h4>
                
                <div className="recommgr-form-row">
                  <div className="recommgr-form-group">
                    <div className="recommgr-form-label-wrapper">
                      <label htmlFor="recommgr-recommendation-number" className="recommgr-form-label">
                        Recommendation Number
                      </label>
                    </div>
                    <input
                      id="recommgr-recommendation-number"
                      type="number"
                      value={formData.recommendation_number}
                      onChange={(e) => handleInputChange('recommendation_number', e.target.value)}
                      className="recommgr-form-input"
                      placeholder="e.g., 1"
                      min="1"
                    />
                  </div>

                  <div className="recommgr-form-group">
                    <div className="recommgr-form-label-wrapper">
                      <label htmlFor="recommgr-date-received" className="recommgr-form-label">
                        Date Received
                      </label>
                    </div>
                    <input
                      id="recommgr-date-received"
                      type="date"
                      value={formData.date_received}
                      onChange={(e) => handleInputChange('date_received', e.target.value)}
                      className={`recommgr-form-input ${validationErrors.date_received ? 'recommgr-error' : ''}`}
                      max={new Date().toISOString().split('T')[0]}
                    />
                    {validationErrors.date_received && (
                      <span className="recommgr-error-text" role="alert">
                        {validationErrors.date_received}
                      </span>
                    )}
                  </div>
                </div>

                <div className="recommgr-form-group">
                  <div className="recommgr-form-label-wrapper">
                    <label htmlFor="recommgr-recommender-name" className="recommgr-form-label recommgr-required">
                      Recommender Name
                    </label>
                    <span className="recommgr-char-count">
                      {characterCounts.recommenderName}/200
                    </span>
                  </div>
                  <input
                    id="recommgr-recommender-name"
                    type="text"
                    value={formData.recommender_name}
                    onChange={(e) => handleInputChange('recommender_name', e.target.value)}
                    className={`recommgr-form-input ${validationErrors.recommender_name ? 'recommgr-error' : ''}`}
                    placeholder="e.g., John Smith"
                    maxLength={200}
                    aria-describedby={validationErrors.recommender_name ? 'recommgr-name-error' : undefined}
                  />
                  {validationErrors.recommender_name && (
                    <span id="recommgr-name-error" className="recommgr-error-text" role="alert">
                      {validationErrors.recommender_name}
                    </span>
                  )}
                </div>

                <div className="recommgr-form-row">
                  <div className="recommgr-form-group">
                    <div className="recommgr-form-label-wrapper">
                      <label htmlFor="recommgr-recommender-title" className="recommgr-form-label">
                        Recommender Title
                      </label>
                      <span className="recommgr-char-count">
                        {characterCounts.recommenderTitle}/200
                      </span>
                    </div>
                    <input
                      id="recommgr-recommender-title"
                      type="text"
                      value={formData.recommender_title}
                      onChange={(e) => handleInputChange('recommender_title', e.target.value)}
                      className={`recommgr-form-input ${validationErrors.recommender_title ? 'recommgr-error' : ''}`}
                      placeholder="e.g., Senior Manager"
                      maxLength={200}
                    />
                    {validationErrors.recommender_title && (
                      <span className="recommgr-error-text" role="alert">
                        {validationErrors.recommender_title}
                      </span>
                    )}
                  </div>

                  <div className="recommgr-form-group">
                    <div className="recommgr-form-label-wrapper">
                      <label htmlFor="recommgr-organization" className="recommgr-form-label">
                        Organization
                      </label>
                      <span className="recommgr-char-count">
                        {characterCounts.organization}/200
                      </span>
                    </div>
                    <input
                      id="recommgr-organization"
                      type="text"
                      value={formData.organization}
                      onChange={(e) => handleInputChange('organization', e.target.value)}
                      className={`recommgr-form-input ${validationErrors.organization ? 'recommgr-error' : ''}`}
                      placeholder="e.g., TCS"
                      maxLength={200}
                    />
                    {validationErrors.organization && (
                      <span className="recommgr-error-text" role="alert">
                        {validationErrors.organization}
                      </span>
                    )}
                  </div>
                </div>

                <div className="recommgr-form-group">
                  <div className="recommgr-form-label-wrapper">
                    <label htmlFor="recommgr-relationship" className="recommgr-form-label">
                      Professional Relationship
                    </label>
                    <span className="recommgr-char-count">
                      {characterCounts.relationship}/100
                    </span>
                  </div>
                  <input
                    id="recommgr-relationship"
                    type="text"
                    value={formData.relationship}
                    onChange={(e) => handleInputChange('relationship', e.target.value)}
                    className={`recommgr-form-input ${validationErrors.relationship ? 'recommgr-error' : ''}`}
                    placeholder="e.g., Direct Manager, Colleague, Client"
                    maxLength={100}
                  />
                  {validationErrors.relationship && (
                    <span className="recommgr-error-text" role="alert">
                      {validationErrors.relationship}
                    </span>
                  )}
                </div>
              </div>

              {/* Recommendation Content Section */}
              <div className="recommgr-form-section-group">
                <h4 className="recommgr-section-title">
                  <span className="recommgr-section-icon">💬</span>
                  Recommendation Content
                </h4>
                
                <div className="recommgr-form-group">
                  <div className="recommgr-form-label-wrapper">
                    <label htmlFor="recommgr-content" className="recommgr-form-label recommgr-required">
                      Recommendation Text
                    </label>
                    <span className="recommgr-char-count">
                      {characterCounts.content}/8000 ({wordCount} words)
                    </span>
                  </div>
                  <textarea
                    id="recommgr-content"
                    value={formData.content}
                    onChange={(e) => handleInputChange('content', e.target.value)}
                    className={`recommgr-form-textarea recommgr-large ${validationErrors.content ? 'recommgr-error' : ''}`}
                    placeholder="Enter the full recommendation text..."
                    rows={8}
                    maxLength={8000}
                  />
                  {validationErrors.content && (
                    <span className="recommgr-error-text" role="alert">
                      {validationErrors.content}
                    </span>
                  )}
                </div>
              </div>

              {/* Profile & Additional Details Section */}
              <div className="recommgr-form-section-group">
                <h4 className="recommgr-section-title">
                  <span className="recommgr-section-icon">👤</span>
                  Profile & Additional Details
                </h4>
                
                {/* Profile Image Upload */}
                <div className="recommgr-form-group">
                  <label className="recommgr-form-label">Profile Image</label>
                  {formData.profile_image_url ? (
                    <div className="recommgr-current-image">
                      <div className="recommgr-image-preview">
                        <img 
                          src={formData.profile_image_url} 
                          alt="Recommender profile" 
                          className="recommgr-profile-thumbnail"
                        />
                        <div className="recommgr-image-actions">
                          <a 
                            href={formData.profile_image_url} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="recommgr-view-image-btn"
                            title="View full size"
                          >
                            👁️ View
                          </a>
                          <button
                            type="button"
                            onClick={removeProfileImage}
                            className="recommgr-remove-image-btn"
                            title="Remove image"
                          >
                            🗑️ Delete
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="recommgr-upload-section">
                      <input
                        type="file"
                        accept=".jpg,.jpeg,.png,.webp"
                        onChange={(e) => e.target.files[0] && handleProfileImageUpload(e.target.files[0])}
                        disabled={profileImageUploading}
                        className="recommgr-file-input"
                        id="recommgr-profile-upload"
                      />
                      <label htmlFor="recommgr-profile-upload" className="recommgr-upload-btn">
                        {profileImageUploading ? (
                          <>
                            <LoadingSpinner size="small" />
                            Uploading... {Math.round(uploadProgress)}%
                          </>
                        ) : (
                          <>
                            <span className="recommgr-btn-icon">📸</span>
                            Upload Profile Image
                          </>
                        )}
                      </label>
                      <p className="recommgr-upload-help">
                        Upload profile photo (JPEG, PNG, WebP, max 5MB)
                      </p>
                    </div>
                  )}
                  {validationErrors.profileImage && (
                    <span className="recommgr-error-text" role="alert">
                      {validationErrors.profileImage}
                    </span>
                  )}
                </div>

                <div className="recommgr-form-group">
                  <div className="recommgr-form-label-wrapper">
                    <label htmlFor="recommgr-linkedin-url" className="recommgr-form-label">
                      LinkedIn Profile URL
                    </label>
                    <span className="recommgr-char-count">
                      {characterCounts.linkedinUrl}/500
                    </span>
                  </div>
                  <input
                    id="recommgr-linkedin-url"
                    type="url"
                    value={formData.linkedin_profile_url}
                    onChange={(e) => handleInputChange('linkedin_profile_url', e.target.value)}
                    className={`recommgr-form-input ${validationErrors.linkedin_profile_url ? 'recommgr-error' : ''}`}
                    placeholder="https://linkedin.com/in/username"
                    maxLength={500}
                  />
                  {validationErrors.linkedin_profile_url && (
                    <span className="recommgr-error-text" role="alert">
                      {validationErrors.linkedin_profile_url}
                    </span>
                  )}
                </div>

                <div className="recommgr-form-row">
                  <div className="recommgr-form-group">
                    <div className="recommgr-form-label-wrapper">
                      <label htmlFor="recommgr-recommendation-type" className="recommgr-form-label">
                        Recommendation Type
                      </label>
                      <span className="recommgr-char-count">
                        {characterCounts.recommendationType}/50
                      </span>
                    </div>
                    <input
                      id="recommgr-recommendation-type"
                      type="text"
                      value={formData.recommendation_type}
                      onChange={(e) => handleInputChange('recommendation_type', e.target.value)}
                      className={`recommgr-form-input ${validationErrors.recommendation_type ? 'recommgr-error' : ''}`}
                      placeholder="e.g., LinkedIn, Written, Email"
                      maxLength={50}
                    />
                    {validationErrors.recommendation_type && (
                      <span className="recommgr-error-text" role="alert">
                        {validationErrors.recommendation_type}
                      </span>
                    )}
                  </div>

                  <div className="recommgr-form-group">
                    <div className="recommgr-form-label-wrapper">
                      <label htmlFor="recommgr-rating" className="recommgr-form-label">
                        Rating (1-5)
                      </label>
                    </div>
                    <input
                      id="recommgr-rating"
                      type="number"
                      value={formData.rating}
                      onChange={(e) => handleInputChange('rating', e.target.value)}
                      className={`recommgr-form-input ${validationErrors.rating ? 'recommgr-error' : ''}`}
                      placeholder="5"
                      min="1"
                      max="5"
                    />
                    {validationErrors.rating && (
                      <span className="recommgr-error-text" role="alert">
                        {validationErrors.rating}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Settings Section */}
              <div className="recommgr-form-section-group">
                <h4 className="recommgr-section-title">
                  <span className="recommgr-section-icon">⚙️</span>
                  Recommendation Settings
                </h4>
                
                <div className="recommgr-form-row">
                  <div className="recommgr-form-group">
                    <div className="recommgr-form-label-wrapper">
                      <label htmlFor="recommgr-status" className="recommgr-form-label">
                        Record Status
                      </label>
                    </div>
                    <select
                      id="recommgr-status"
                      value={formData.status}
                      onChange={(e) => handleInputChange('status', e.target.value)}
                      className="recommgr-form-select"
                    >
                      <option value="active">Active</option>
                      <option value="draft">Draft</option>
                      <option value="archived">Archived</option>
                    </select>
                  </div>

                  <div className="recommgr-form-group">
                    <div className="recommgr-form-label-wrapper">
                      <label htmlFor="recommgr-order-index" className="recommgr-form-label">
                        Display Order
                      </label>
                    </div>
                    <input
                      id="recommgr-order-index"
                      type="number"
                      value={formData.order_index || ''}
                      onChange={(e) => handleInputChange('order_index', e.target.value ? parseInt(e.target.value) : null)}
                      className="recommgr-form-input"
                      placeholder="e.g., 1"
                      min="1"
                    />
                    <p className="recommgr-form-help">
                      Lower numbers appear first (leave empty for default ordering)
                    </p>
                  </div>
                </div>

                <div className="recommgr-form-group">
                  <div className="recommgr-checkbox-wrapper">
                    <input
                      id="recommgr-is-featured"
                      type="checkbox"
                      checked={formData.is_featured}
                      onChange={(e) => handleInputChange('is_featured', e.target.checked)}
                      className="recommgr-form-checkbox"
                    />
                    <label htmlFor="recommgr-is-featured" className="recommgr-checkbox-label">
                      Mark as Featured Recommendation
                    </label>
                  </div>
                  <p className="recommgr-form-help">
                    Featured recommendations appear prominently on your portfolio
                  </p>
                </div>

                <div className="recommgr-form-group">
                  <div className="recommgr-checkbox-wrapper">
                    <input
                      id="recommgr-is-public"
                      type="checkbox"
                      checked={formData.is_public}
                      onChange={(e) => handleInputChange('is_public', e.target.checked)}
                      className="recommgr-form-checkbox"
                    />
                    <label htmlFor="recommgr-is-public" className="recommgr-checkbox-label">
                      Make Public
                    </label>
                  </div>
                  <p className="recommgr-form-help">
                    Public recommendations are visible on your portfolio
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Preview Section */}
        {uiState.showPreview && (viewMode === 'add' || viewMode === 'edit') && (
          <div className="recommgr-preview-section">
            <div className="recommgr-preview-container recommgr-glass-card">
              <h3 className="recommgr-preview-title">
                <span className="recommgr-preview-icon">👁️</span>
                Live Preview
              </h3>
              
              <div className="recommgr-recommendation-preview">
                <div className="recommgr-preview-recommendation-card">
                  
                  {/* Preview Header */}
                  <div className="recommgr-preview-card-header">
                    <div className="recommgr-preview-recommender-info">
                      {formData.profile_image_url ? (
                        <img 
                          src={formData.profile_image_url} 
                          alt={formData.recommender_name || 'Recommender'} 
                          className="recommgr-preview-profile-img"
                        />
                      ) : (
                        <div className="recommgr-preview-profile-placeholder">
                          {formData.recommender_name ? formData.recommender_name.charAt(0).toUpperCase() : 'R'}
                        </div>
                      )}
                      <div className="recommgr-preview-recommender-details">
                        <h4 className="recommgr-preview-recommender-name">
                          {formData.recommender_name || 'Recommender Name'}
                        </h4>
                        {formData.recommender_title && (
                          <p className="recommgr-preview-recommender-title">{formData.recommender_title}</p>
                        )}
                        {formData.organization && (
                          <p className="recommgr-preview-organization">{formData.organization}</p>
                        )}
                      </div>
                    </div>
                    
                    <div className="recommgr-preview-status-indicators">
                      {formData.is_featured && (
                        <div className="recommgr-preview-featured-badge">
                          <span className="recommgr-badge-text">FEATURED</span>
                        </div>
                      )}
                      <div className="recommgr-preview-status-badge">
                        <span className="recommgr-badge-text">{formData.status.toUpperCase()}</span>
                      </div>
                    </div>
                  </div>

                  {/* Preview Meta */}
                  <div className="recommgr-preview-meta">
                    {formData.relationship && (
                      <span className="recommgr-preview-meta-item">
                        <span className="recommgr-meta-icon">🤝</span>
                        {formData.relationship}
                      </span>
                    )}
                    {formData.date_received && (
                      <span className="recommgr-preview-meta-item">
                        <span className="recommgr-meta-icon">📅</span>
                        {formatRecommendationDate(formData.date_received)}
                      </span>
                    )}
                    {formData.rating && (
                      <span className="recommgr-preview-meta-item">
                        <span className="recommgr-meta-icon">⭐</span>
                        {formData.rating}/5
                      </span>
                    )}
                  </div>

                  {/* Preview Content */}
                  <div className="recommgr-preview-content">
                    <p className="recommgr-preview-text">
                      "{formData.content || 'Recommendation content will appear here...'}"
                    </p>
                  </div>

                  {/* Preview Footer */}
                  <div className="recommgr-preview-footer">
                   {formData.linkedin_profile_url && (
                      <button 
                        type="button"
                        className="recommgr-preview-linkedin-link"
                        onClick={(e) => e.preventDefault()}
                      >
                        <span className="recommgr-linkedin-icon">in</span>
                        View LinkedIn Profile
                      </button>
                    )}
                    <div className="recommgr-preview-visibility">
                      {formData.is_public ? '🌐 Public' : '🔒 Private'}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default RecommendationsManager;