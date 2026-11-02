import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useSupabase } from '../../../../hooks/useSupabase';
import LoadingSpinner from '../../../common/LoadingSpinner';
import './AchievementsManager.css';
import { triggerPublicRefresh } from '../../../../services/adminDataService';

const AchievementsManager = () => {
  // ============================================================================
  // DATA FETCHING WITH OPTIMIZED useSupabase HOOK
  // ============================================================================
  
  const { 
    data: achievementsData, 
    loading: dataLoading, 
    error: dataError,
    refetch 
  } = useSupabase('achievements', {}, { 
    orderBy: [
      { column: 'date_achieved', ascending: false }, // Sort by date (newest first)
      { column: 'order_index', ascending: true }
    ],
    cacheKey: 'achievements-admin'
  });

  // ============================================================================
  // STATE MANAGEMENT - ORGANIZED AND OPTIMIZED
  // ============================================================================
  
  // View state management
  const [viewMode, setViewMode] = useState('list'); // 'list', 'add', 'edit'
  const [selectedAchievement, setSelectedAchievement] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterCategory, setFilterCategory] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterFeatured, setFilterFeatured] = useState('all');

  // Form state with proper initial values
  const [formData, setFormData] = useState({
    achievement_number: '',
    title: '',
    description: '',
    date_achieved: '',
    category: '',
    issuing_organization: '',
    competition_name: '',
    position: '',
    participants_count: '',
    certificate_url: '',
    impact: '',
    verification_url: '',
    is_featured: false,
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
  const [certificateUploading, setCertificateUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  // Delete confirmation modal state
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [achievementToDelete, setAchievementToDelete] = useState(null);

  // Certificate delete confirmation state
  const [showCertDeleteModal, setShowCertDeleteModal] = useState(false);

  // Achievement categories
  const achievementCategories = useMemo(() => [
    'Professional Recognition',
    'Academic Excellence',
    'Competition Winner',
    'Certification Achievement',
    'Leadership Award',
    'Innovation Award',
    'Performance Award',
    'Community Service',
    'Research Achievement',
    'Technical Excellence',
    'Team Achievement',
    'Industry Recognition',
    'Other'
  ], []);

  // Position/Rank options
  const positionOptions = [
    'Winner', 'First Place', '1st Position',
    'Runner-up', 'Second Place', '2nd Position', 
    'Third Place', '3rd Position',
    'Finalist', 'Semi-finalist', 'Quarter-finalist',
    'Top 5', 'Top 10', 'Top 25', 'Top 50', 'Top 100',
    'Gold Medal', 'Silver Medal', 'Bronze Medal',
    'Excellence Award', 'Merit Award', 'Honor Roll',
    'Star Performer', 'Outstanding Performance',
    'Best Performer', 'Top Performer',
    'Distinguished Achievement', 'Special Recognition'
  ];

  // ============================================================================
  // MEMOIZED VALUES FOR PERFORMANCE
  // ============================================================================
  
  const characterCounts = useMemo(() => ({
    title: formData.title.length,
    description: formData.description.length,
    category: formData.category.length,
    issuingOrganization: formData.issuing_organization.length,
    competitionName: formData.competition_name.length,
    position: formData.position.length,
    impact: formData.impact.length,
    verificationUrl: formData.verification_url.length
  }), [formData]);

  const filteredAchievements = useMemo(() => {
    if (!achievementsData) return [];
    
    return achievementsData.filter(achievement => {
      const matchesSearch = achievement.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                           achievement.category?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                           achievement.issuing_organization?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                           achievement.competition_name?.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesCategory = filterCategory === 'all' || achievement.category === filterCategory;
      const matchesStatus = filterStatus === 'all' || achievement.status === filterStatus;
      const matchesFeatured = filterFeatured === 'all' || 
                             (filterFeatured === 'true' && achievement.is_featured) ||
                             (filterFeatured === 'false' && !achievement.is_featured);
      
      return matchesSearch && matchesCategory && matchesStatus && matchesFeatured;
    });
  }, [achievementsData, searchTerm, filterCategory, filterStatus, filterFeatured]);

  const categoriesInData = useMemo(() => {
    if (!achievementsData) return [];
    return [...new Set(achievementsData.map(a => a.category).filter(Boolean))];
  }, [achievementsData]);

  const hasUnsavedChanges = useMemo(() => {
    if (viewMode === 'list') return false;
    if (!selectedAchievement && viewMode === 'edit') return false;
    
    if (viewMode === 'add') {
      return formData.title.trim() !== '' || 
             formData.description.trim() !== '' ||
             formData.category.trim() !== '' ||
             formData.issuing_organization.trim() !== '' ||
             formData.competition_name.trim() !== '' ||
             formData.position.trim() !== '' ||
             formData.impact.trim() !== '';
    }

    if (viewMode === 'edit' && selectedAchievement) {
      return (
        formData.achievement_number !== (selectedAchievement.achievement_number || '') ||
        formData.title !== (selectedAchievement.title || '') ||
        formData.description !== (selectedAchievement.description || '') ||
        formData.date_achieved !== (selectedAchievement.date_achieved || '') ||
        formData.category !== (selectedAchievement.category || '') ||
        formData.issuing_organization !== (selectedAchievement.issuing_organization || '') ||
        formData.competition_name !== (selectedAchievement.competition_name || '') ||
        formData.position !== (selectedAchievement.position || '') ||
        formData.participants_count !== (selectedAchievement.participants_count || '') ||
        formData.certificate_url !== (selectedAchievement.certificate_url || '') ||
        formData.impact !== (selectedAchievement.impact || '') ||
        formData.verification_url !== (selectedAchievement.verification_url || '') ||
        formData.is_featured !== (selectedAchievement.is_featured || false) ||
        formData.status !== (selectedAchievement.status || 'active')
      );
    }

    return uiState.hasChanges;
  }, [formData, selectedAchievement, viewMode, uiState.hasChanges]);

  // ============================================================================
  // EFFECT HOOKS - OPTIMIZED DATA LOADING
  // ============================================================================
  
  // Load data into form when editing achievement
  useEffect(() => {
    if (viewMode === 'edit' && selectedAchievement) {
      const newFormData = {
        achievement_number: selectedAchievement.achievement_number || '',
        title: selectedAchievement.title || '',
        description: selectedAchievement.description || '',
        date_achieved: selectedAchievement.date_achieved || '',
        category: selectedAchievement.category || '',
        issuing_organization: selectedAchievement.issuing_organization || '',
        competition_name: selectedAchievement.competition_name || '',
        position: selectedAchievement.position || '',
        participants_count: selectedAchievement.participants_count || '',
        certificate_url: selectedAchievement.certificate_url || '',
        impact: selectedAchievement.impact || '',
        verification_url: selectedAchievement.verification_url || '',
        is_featured: selectedAchievement.is_featured || false,
        order_index: selectedAchievement.order_index,
        status: selectedAchievement.status || 'active'
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
  }, [viewMode, selectedAchievement]);

  // Reset form when switching to add mode
  useEffect(() => {
    if (viewMode === 'add') {
      setFormData({
        achievement_number: '',
        title: '',
        description: '',
        date_achieved: '',
        category: '',
        issuing_organization: '',
        competition_name: '',
        position: '',
        participants_count: '',
        certificate_url: '',
        impact: '',
        verification_url: '',
        is_featured: false,
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
      
      // If setting issuing_organization, clear competition_name (mutually exclusive)
      if (field === 'issuing_organization' && value.trim() !== '') {
        newData.competition_name = '';
      }
      
      // If setting competition_name, clear issuing_organization (mutually exclusive)
      if (field === 'competition_name' && value.trim() !== '') {
        newData.issuing_organization = '';
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
  // CERTIFICATE UPLOAD HANDLING
  // ============================================================================
  
  const handleCertificateUpload = useCallback(async (file) => {
    if (!file) return;

    const maxSize = 10 * 1024 * 1024; // 10MB for certificates/documents
    const allowedTypes = [
      'application/pdf',
      'image/jpeg', 
      'image/jpg', 
      'image/png',
      'image/webp',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ];

    // Validate file
    if (file.size > maxSize) {
      setValidationErrors(prev => ({
        ...prev,
        certificate: 'File size must be less than 10MB'
      }));
      return;
    }
    
    if (!allowedTypes.includes(file.type)) {
      setValidationErrors(prev => ({
        ...prev,
        certificate: 'Only PDF, JPEG, PNG, WebP, DOC, and DOCX formats are allowed'
      }));
      return;
    }

    setCertificateUploading(true);
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
      const achievementTitle = formData.title || 'achievement';
      const sanitizedTitle = achievementTitle.toLowerCase().replace(/[^a-z0-9]/g, '-');
      const fileName = `${sanitizedTitle}-certificate-${timestamp}.${fileExtension}`;
      const filePath = `certificates/${fileName}`;

      // Simulate upload progress
      const progressInterval = setInterval(() => {
        setUploadProgress(prev => Math.min(prev + 10, 90));
      }, 100);

      // Upload to Supabase Storage
      const { error: uploadError } = await supabaseAdmin.storage
        .from('achievement-images')
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
        .from('achievement-images')
        .getPublicUrl(filePath);

      // Update form data with certificate URL
      handleInputChange('certificate_url', urlData.publicUrl);

      // Clear any validation errors
      setValidationErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors.certificate;
        return newErrors;
      });

    } catch (error) {
      console.error('Certificate upload error:', error);
      setValidationErrors(prev => ({
        ...prev,
        certificate: error.message || 'Failed to upload certificate'
      }));
    } finally {
      setCertificateUploading(false);
      setUploadProgress(0);
    }
  }, [formData.title, handleInputChange]);

  const removeCertificate = useCallback(() => {
    setShowCertDeleteModal(true);
  }, []);

  const confirmCertificateDelete = useCallback(async () => {
    if (!formData.certificate_url) return;

    try {
      // Import Supabase client for file deletion
      const { createClient } = await import('@supabase/supabase-js');
      const supabaseAdmin = createClient(
        process.env.REACT_APP_SUPABASE_URL,
        process.env.REACT_APP_SUPABASE_SERVICE_ROLE_KEY
      );

      // Extract file path from URL
      const filePath = formData.certificate_url.split('/storage/v1/object/public/achievement-images/')[1];
      
      if (filePath) {
        // Delete file from storage
        const { error: storageError } = await supabaseAdmin.storage
          .from('achievement-images')
          .remove([filePath]);

        if (storageError) {
          console.warn('⚠️ Could not delete file from storage:', storageError);
        }
      }

      // Remove certificate URL from form
      handleInputChange('certificate_url', '');
      
      setUiState(prev => ({ 
        ...prev, 
        saveStatus: 'success',
        statusMessageContent: 'Certificate deleted successfully.'
      }));

    } catch (error) {
      console.error('Certificate delete error:', error);
      setValidationErrors(prev => ({
        ...prev,
        certificate: error.message || 'Failed to delete certificate'
      }));
    } finally {
      setShowCertDeleteModal(false);
    }
  }, [formData.certificate_url, handleInputChange]);

  const cancelCertificateDelete = useCallback(() => {
    setShowCertDeleteModal(false);
  }, []);

  // ============================================================================
  // FORM VALIDATION - COMPREHENSIVE AND OPTIMIZED
  // ============================================================================
  
  const validateForm = useCallback(() => {
    const errors = {};

    // Title validation (required, 3-200 chars)
    const titleTrimmed = formData.title.trim();
    if (!titleTrimmed) {
      errors.title = 'Achievement title is required';
    } else if (titleTrimmed.length < 3) {
      errors.title = 'Achievement title must be at least 3 characters';
    } else if (titleTrimmed.length > 200) {
      errors.title = 'Achievement title must be less than 200 characters';
    }

    // Description validation (optional, max 1000 chars)
    if (formData.description && formData.description.length > 1000) {
      errors.description = 'Description must be less than 1000 characters';
    }

    // Category validation (optional, max 100 chars)
    if (formData.category && formData.category.length > 100) {
      errors.category = 'Category must be less than 100 characters';
    }

    // Issuing organization validation (optional, max 200 chars)
    if (formData.issuing_organization && formData.issuing_organization.length > 200) {
      errors.issuing_organization = 'Issuing organization must be less than 200 characters';
    }

    // Competition name validation (optional, max 200 chars)
    if (formData.competition_name && formData.competition_name.length > 200) {
      errors.competition_name = 'Competition name must be less than 200 characters';
    }

    // Either issuing_organization OR competition_name should be provided (not both)
    const hasIssuer = formData.issuing_organization && formData.issuing_organization.trim() !== '';
    const hasCompetition = formData.competition_name && formData.competition_name.trim() !== '';
    
    if (hasIssuer && hasCompetition) {
      errors.issuing_organization = 'Please provide either issuing organization OR competition name, not both';
      errors.competition_name = 'Please provide either issuing organization OR competition name, not both';
    }

    // Position validation (optional, max 100 chars)
    if (formData.position && formData.position.length > 100) {
      errors.position = 'Position must be less than 100 characters';
    }

    // Participants count validation
    if (formData.participants_count && (isNaN(formData.participants_count) || parseInt(formData.participants_count) < 0)) {
      errors.participants_count = 'Participants count must be a positive number';
    }

    // Impact validation (optional, max 1000 chars)
    if (formData.impact && formData.impact.length > 1000) {
      errors.impact = 'Impact description must be less than 1000 characters';
    }

    // Verification URL validation
    if (formData.verification_url && formData.verification_url.trim() !== '') {
      const urlPattern = /^(https?:\/\/)?([\da-z.-]+)\.([a-z.]{2,6})([/\w .-]*)*\/?$/;
      if (!urlPattern.test(formData.verification_url)) {
        errors.verification_url = 'Please enter a valid URL';
      }
    }

    // Date validation (check if date is not in future)
    if (formData.date_achieved) {
      const achievedDate = new Date(formData.date_achieved);
      const today = new Date();
      
      if (achievedDate > today) {
        errors.date_achieved = 'Achievement date cannot be in the future';
      }
    }

    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  }, [formData]);

  // ============================================================================
  // SAVE OPERATION - FOLLOWING WORK EXPERIENCE MANAGER PATTERN
  // ============================================================================
  
  const handleSave = useCallback(async () => {
    console.log('🚀 Starting Achievement save process...');
    
    if (!validateForm()) {
      console.log('❌ Form validation failed');
      setUiState(prev => ({ ...prev, saveStatus: 'error' }));
      return;
    }

    setUiState(prev => ({ ...prev, isSaving: true, saveStatus: null }));

    try {
      // Prepare data for saving
      const saveData = {
        achievement_number: formData.achievement_number ? parseInt(formData.achievement_number) : null,
        title: formData.title.trim(),
        description: formData.description.trim() || null,
        date_achieved: formData.date_achieved || null,
        category: formData.category.trim() || null,
        issuing_organization: formData.issuing_organization.trim() || null,
        competition_name: formData.competition_name.trim() || null,
        position: formData.position.trim() || null,
        participants_count: formData.participants_count ? parseInt(formData.participants_count) : null,
        certificate_url: formData.certificate_url || null,
        impact: formData.impact.trim() || null,
        verification_url: formData.verification_url.trim() || null,
        is_featured: formData.is_featured,
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
      
      if (viewMode === 'edit' && selectedAchievement?.id) {
        // Update existing achievement
        console.log('🔄 Updating existing achievement with ID:', selectedAchievement.id);
        const { data, error } = await supabaseAdmin
          .from('achievements')
          .update({
            ...saveData,
            updated_at: new Date().toISOString()
          })
          .eq('id', selectedAchievement.id)
          .select()
          .single();
          
        console.log('✏️ Update operation result:', data);
        console.log('❌ Update error (if any):', error);
          
        if (error) {
          console.error('💥 Update error details:', error);
          throw new Error(`Failed to update achievement: ${error.message}`);
        }
        
        result = { success: true, data };
      } else {
        // Create new achievement
        console.log('➕ Creating new achievement');
        const { data, error } = await supabaseAdmin
          .from('achievements')
          .insert([saveData])
          .select()
          .single();
          
        console.log('➕ Insert operation result:', data);
        console.log('❌ Insert error (if any):', error);
          
        if (error) {
          console.error('💥 Insert error details:', error);
          throw new Error(`Failed to create achievement: ${error.message}`);
        }
        
        result = { success: true, data };
      }
      
      console.log('📥 Final save result:', result);

      if (result && result.success) {
        console.log('✅ Save successful');

        triggerPublicRefresh('achievements');
        
        // Set success status immediately
        setUiState(prev => ({ 
          ...prev, 
          saveStatus: 'success',
          hasChanges: false,
          isPostSave: true
        }));

        // If this was a new achievement, switch to list view after save
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
        throw new Error(result?.error || result?.message || 'Failed to save achievement');
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
  }, [formData, selectedAchievement, viewMode, validateForm, refetch]);

  // ============================================================================
  // UI ACTIONS - OPTIMIZED EVENT HANDLERS
  // ============================================================================
  
  const handleAddNew = useCallback(() => {
    if (hasUnsavedChanges && viewMode !== 'list') {
      if (!window.confirm('You have unsaved changes. Are you sure you want to start a new achievement entry? Changes will be lost.')) {
        return;
      }
    }
    setViewMode('add');
    setSelectedAchievement(null);
  }, [hasUnsavedChanges, viewMode]);

  const handleEdit = useCallback((achievement) => {
    if (hasUnsavedChanges && viewMode !== 'list' && selectedAchievement?.id !== achievement.id) {
      if (!window.confirm('You have unsaved changes. Are you sure you want to edit a different achievement? Changes will be lost.')) {
        return;
      }
    }
    setSelectedAchievement(achievement);
    setViewMode('edit');
  }, [hasUnsavedChanges, viewMode, selectedAchievement]);

  const handleCancel = useCallback(() => {
    if (hasUnsavedChanges) {
      if (!window.confirm('You have unsaved changes. Are you sure you want to cancel? Changes will be lost.')) {
        return;
      }
    }
    setViewMode('list');
    setSelectedAchievement(null);
    setValidationErrors({});
    setUiState(prev => ({
      ...prev,
      hasChanges: false,
      saveStatus: null,
      isPostSave: false
    }));
  }, [hasUnsavedChanges]);

  const handleDelete = useCallback((achievement) => {
    setAchievementToDelete(achievement);
    setShowDeleteModal(true);
  }, []);

  const confirmDeleteAction = useCallback(async () => {
    if (!achievementToDelete) return;

    try {
      const { createClient } = await import('@supabase/supabase-js');
      const supabaseAdmin = createClient(
        process.env.REACT_APP_SUPABASE_URL,
        process.env.REACT_APP_SUPABASE_SERVICE_ROLE_KEY
      );

      // Delete associated certificate file if exists
      if (achievementToDelete.certificate_url) {
        try {
          const filePath = achievementToDelete.certificate_url.split('/storage/v1/object/public/achievement-images/')[1];
          if (filePath) {
            await supabaseAdmin.storage
              .from('achievement-images')
              .remove([filePath]);
            console.log('🗑️ Associated certificate file deleted');
          }
        } catch (fileError) {
          console.warn('⚠️ Could not delete associated certificate file:', fileError);
        }
      }

      const { error } = await supabaseAdmin
        .from('achievements')
        .delete()
        .eq('id', achievementToDelete.id);

      if (error) {
        throw new Error(`Failed to delete achievement: ${error.message}`);
      }

      triggerPublicRefresh('achievements');
      setUiState(prev => ({ 
        ...prev, 
        saveStatus: 'success',
        statusMessageContent: `Achievement "${achievementToDelete.title}" has been deleted.`
      }));
      refetch();

    } catch (error) {
      console.error('Delete error:', error);
      setUiState(prev => ({ 
        ...prev, 
        saveStatus: 'error',
        statusMessageContent: `Error deleting achievement: ${error.message}`
      }));
    } finally {
      setShowDeleteModal(false);
      setAchievementToDelete(null);
    }
  }, [achievementToDelete, refetch]);

  const cancelDeleteAction = useCallback(() => {
    setShowDeleteModal(false);
    setAchievementToDelete(null);
  }, []);

  const togglePreview = useCallback(() => {
    setUiState(prev => ({ ...prev, showPreview: !prev.showPreview }));
  }, []);

  // ============================================================================
  // DATE FORMATTING UTILITIES
  // ============================================================================
  
  const formatAchievementDate = useCallback((dateString) => {
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
  
  if (dataLoading && !achievementsData) {
    return (
      <div className="achievemgr-loading">
        <LoadingSpinner size="large" />
        <p>Loading achievements...</p>
      </div>
    );
  }

  // ============================================================================
  // RENDER - OPTIMIZED JSX STRUCTURE
  // ============================================================================
  
  return (
    <div className="achievemgr-content-manager">
      {/* Header Section */}
      <div className="achievemgr-manager-header">
        <div className="achievemgr-header-content">
          <h2 className="achievemgr-manager-title">
            <span className="achievemgr-title-icon">🏆</span>
            Achievements & Awards Management
          </h2>
          <p className="achievemgr-manager-subtitle">
            Manage your achievements, awards, and recognitions
          </p>
        </div>

        <div className="achievemgr-header-actions">
          {viewMode === 'list' ? (
            <>
              <button
                className="achievemgr-action-btn achievemgr-add-btn achievemgr-primary"
                onClick={handleAddNew}
                title="Add New Achievement"
                type="button"
              >
                <span className="achievemgr-btn-icon">➕</span>
                Add Achievement
              </button>
            </>
          ) : (
            <>
              <button
                className="achievemgr-action-btn achievemgr-preview-btn"
                onClick={togglePreview}
                title="Toggle Preview"
                type="button"
              >
                <span className="achievemgr-btn-icon">👁️</span>
                {uiState.showPreview ? 'Hide Preview' : 'Show Preview'}
              </button>
              <div className="achievemgr-edit-actions">
                <button
                  className="achievemgr-action-btn achievemgr-cancel-btn"
                  onClick={handleCancel}
                  disabled={uiState.isSaving}
                  title="Cancel Changes"
                  type="button"
                >
                  <span className="achievemgr-btn-icon">❌</span>
                  Cancel
                </button>
                <button
                  className="achievemgr-action-btn achievemgr-save-btn achievemgr-primary"
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
                      <span className="achievemgr-btn-icon">💾</span>
                      Save Achievement
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
        <div className={`achievemgr-status-message ${uiState.saveStatus}`} role="alert">
          {uiState.saveStatus === 'success' && (
            <>
              <span className="achievemgr-status-icon">✅</span>
              <div className="achievemgr-status-content">
                <strong>Success!</strong> 
                {uiState.statusMessageContent || 'Achievement has been saved successfully and is now live on your portfolio.'}
              </div>
            </>
          )}
          {uiState.saveStatus === 'error' && (
            <>
              <span className="achievemgr-status-icon">❌</span>
              <div className="achievemgr-status-content">
                <strong>Error!</strong> 
                {uiState.statusMessageContent || 'Failed to save achievement. Please check your connection and try again.'}
              </div>
            </>
          )}
        </div>
      )}

      {/* Data Error */}
      {dataError && (
        <div className="achievemgr-status-message achievemgr-error" role="alert">
          <span className="achievemgr-status-icon">⚠️</span>
          Error loading achievements: {
            typeof dataError === 'string' ? dataError : dataError.message || 'Unknown error'
          }
        </div>
      )}

      {/* Delete Achievement Confirmation Modal */}
      {showDeleteModal && achievementToDelete && (
        <div className="achievemgr-modal-overlay">
          <div className="achievemgr-modal-content achievemgr-glass-card">
            <h3 className="achievemgr-modal-title">
              <span className="achievemgr-modal-icon">🗑️</span> Confirm Deletion
            </h3>
            <p className="achievemgr-modal-text">
              Are you sure you want to delete the achievement: <strong>"{achievementToDelete.title}"</strong>? 
              This action cannot be undone and will also delete any associated certificate.
            </p>
            <div className="achievemgr-modal-actions">
              <button
                type="button"
                className="achievemgr-action-btn achievemgr-cancel-btn"
                onClick={cancelDeleteAction}
              >
                <span className="achievemgr-btn-icon">❌</span> Cancel
              </button>
              <button
                type="button"
                className="achievemgr-action-btn achievemgr-delete-btn-confirm achievemgr-primary"
                onClick={confirmDeleteAction}
              >
                <span className="achievemgr-btn-icon">🗑️</span> Delete Achievement
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Certificate Confirmation Modal */}
      {showCertDeleteModal && (
        <div className="achievemgr-modal-overlay">
          <div className="achievemgr-modal-content achievemgr-glass-card">
            <h3 className="achievemgr-modal-title">
              <span className="achievemgr-modal-icon">📄</span> Confirm Certificate Deletion
            </h3>
            <p className="achievemgr-modal-text">
              Are you sure you want to delete this certificate? This action cannot be undone.
            </p>
            <div className="achievemgr-modal-actions">
              <button
                type="button"
                className="achievemgr-action-btn achievemgr-cancel-btn"
                onClick={cancelCertificateDelete}
              >
                <span className="achievemgr-btn-icon">❌</span> Cancel
              </button>
              <button
                type="button"
                className="achievemgr-action-btn achievemgr-delete-btn-confirm achievemgr-primary"
                onClick={confirmCertificateDelete}
              >
                <span className="achievemgr-btn-icon">🗑️</span> Delete Certificate
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className={`achievemgr-manager-content ${uiState.showPreview ? 'achievemgr-with-preview' : ''}`}>
        
        {/* LIST VIEW */}
        {viewMode === 'list' && (
          <div className="achievemgr-list-section">
            <div className="achievemgr-list-container achievemgr-glass-card">
              
              {/* Search and Filters */}
              <div className="achievemgr-list-controls">
                <div className="achievemgr-search-section">
                  <div className="achievemgr-search-wrapper">
                    <span className="achievemgr-search-icon">🔍</span>
                    <input
                      type="text"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      placeholder="Search achievements by title, category, organization..."
                      className="achievemgr-search-input"
                    />
                  </div>
                </div>
                
                <div className="achievemgr-filters-section">
                  <select
                    value={filterCategory}
                    onChange={(e) => setFilterCategory(e.target.value)}
                    className="achievemgr-filter-select"
                  >
                    <option value="all">All Categories</option>
                    {categoriesInData.map(category => (
                      <option key={category} value={category}>{category}</option>
                    ))}
                  </select>
                  
                  <select
                    value={filterFeatured}
                    onChange={(e) => setFilterFeatured(e.target.value)}
                    className="achievemgr-filter-select"
                  >
                    <option value="all">All Featured Status</option>
                    <option value="true">Featured</option>
                    <option value="false">Not Featured</option>
                  </select>
                  
                  <select
                    value={filterStatus}
                    onChange={(e) => setFilterStatus(e.target.value)}
                    className="achievemgr-filter-select"
                  >
                    <option value="all">All Status</option>
                    <option value="active">Active</option>
                    <option value="draft">Draft</option>
                    <option value="archived">Archived</option>
                  </select>
                </div>
              </div>

              {/* Achievements Table */}
              <div className="achievemgr-table-wrapper">
                {filteredAchievements.length === 0 ? (
                  <div className="achievemgr-no-data-message">
                    <div className="achievemgr-no-data-icon">🏆</div>
                    <h3>No Achievements Found</h3>
                    <p>
                      {achievementsData?.length === 0 
                        ? 'No achievements have been created yet. Click "Add Achievement" to get started.'
                        : 'No achievements match your current filters. Try adjusting your search criteria.'
                      }
                    </p>
                  </div>
                ) : (
                  <table className="achievemgr-table">
                    <thead>
                      <tr>
                        <th>Achievement Title</th>
                        <th>Category</th>
                        <th>Date Achieved</th>
                        <th>Featured Status</th>
                        <th>Status</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredAchievements.map((achievement, index) => (
                        <tr key={achievement.id || index} className="achievemgr-table-row">
                          <td className="achievemgr-achievement-title">
                            <div className="achievemgr-title-content">
                              <h4 className="achievemgr-title-text">{achievement.title}</h4>
                              {achievement.position && (
                                <span className="achievemgr-position-badge">
                                  🥇 {achievement.position}
                                </span>
                              )}
                            </div>
                          </td>
                          
                          <td className="achievemgr-category">
                            <span className="achievemgr-category-text">{achievement.category || 'N/A'}</span>
                          </td>
                          
                          <td className="achievemgr-date">
                            <span className="achievemgr-date-text">
                              {formatAchievementDate(achievement.date_achieved)}
                            </span>
                          </td>
                          
                          <td className="achievemgr-featured">
                            <span className={`achievemgr-featured-text ${achievement.is_featured ? 'achievemgr-featured-true' : 'achievemgr-featured-false'}`}>
                              {achievement.is_featured ? 'TRUE' : 'FALSE'}
                            </span>
                          </td>
                          
                          <td className="achievemgr-status">
                            <span className={`achievemgr-status-badge achievemgr-status-${achievement.status}`}>
                              {achievement.status?.toUpperCase() || 'ACTIVE'}
                            </span>
                          </td>
                          
                          <td className="achievemgr-actions">
                            <div className="achievemgr-action-buttons">
                              <button
                                className="achievemgr-action-btn-mini achievemgr-edit-btn"
                                onClick={() => handleEdit(achievement)}
                                title="Edit Achievement"
                              >
                                ✏️
                              </button>
                              <button
                                className="achievemgr-action-btn-mini achievemgr-delete-btn"
                                onClick={() => handleDelete(achievement)}
                                title="Delete Achievement"
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
              
              {/* Achievements Summary */}
              {achievementsData && achievementsData.length > 0 && (
                <div className="achievemgr-summary">
                  <div className="achievemgr-summary-stats">
                    <span className="achievemgr-stat-item">
                      <strong>{achievementsData.length}</strong> total achievements
                    </span>
                    <span className="achievemgr-stat-item">
                      <strong>{achievementsData.filter(a => a.is_featured).length}</strong> featured achievements
                    </span>
                    <span className="achievemgr-stat-item">
                      <strong>{achievementsData.filter(a => a.status === 'active').length}</strong> active achievements
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* FORM VIEW (ADD/EDIT) */}
        {(viewMode === 'add' || viewMode === 'edit') && (
          <div className="achievemgr-form-section">
            <div className="achievemgr-form-container achievemgr-glass-card">
              
              {/* Form Title */}
              <div className="achievemgr-form-title-section">
                <h3 className="achievemgr-form-title">
                  {viewMode === 'add' ? 'Add New Achievement' : `Edit: ${selectedAchievement?.title}`}
                </h3>
                <p className="achievemgr-form-subtitle">
                  {viewMode === 'add' 
                    ? 'Create a new achievement entry for your portfolio'
                    : 'Update achievement information and details'
                  }
                </p>
              </div>

              {/* Basic Information Section */}
              <div className="achievemgr-form-section-group">
                <h4 className="achievemgr-section-title">
                  <span className="achievemgr-section-icon">📋</span>
                  Basic Information
                </h4>
                
                <div className="achievemgr-form-row">
                  <div className="achievemgr-form-group">
                    <div className="achievemgr-form-label-wrapper">
                      <label htmlFor="achievemgr-achievement-number" className="achievemgr-form-label">
                        Achievement Number
                      </label>
                    </div>
                    <input
                      id="achievemgr-achievement-number"
                      type="number"
                      value={formData.achievement_number}
                      onChange={(e) => handleInputChange('achievement_number', e.target.value)}
                      className="achievemgr-form-input"
                      placeholder="e.g., 1"
                      min="1"
                    />
                  </div>

                  <div className="achievemgr-form-group">
                    <div className="achievemgr-form-label-wrapper">
                      <label htmlFor="achievemgr-category" className="achievemgr-form-label">
                        Category
                      </label>
                      <span className="achievemgr-char-count">
                        {characterCounts.category}/100
                      </span>
                    </div>
                    <select
                      id="achievemgr-category"
                      value={formData.category}
                      onChange={(e) => handleInputChange('category', e.target.value)}
                      className="achievemgr-form-select"
                    >
                      <option value="">Select Category</option>
                      {achievementCategories.map(category => (
                        <option key={category} value={category}>{category}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="achievemgr-form-group">
                  <div className="achievemgr-form-label-wrapper">
                    <label htmlFor="achievemgr-title" className="achievemgr-form-label achievemgr-required">
                      Achievement Title
                    </label>
                    <span className="achievemgr-char-count">
                      {characterCounts.title}/200
                    </span>
                  </div>
                  <input
                    id="achievemgr-title"
                    type="text"
                    value={formData.title}
                    onChange={(e) => handleInputChange('title', e.target.value)}
                    className={`achievemgr-form-input ${validationErrors.title ? 'achievemgr-error' : ''}`}
                    placeholder="e.g., TCS Star of the Quarter (Q3 2023)"
                    maxLength={200}
                    aria-describedby={validationErrors.title ? 'achievemgr-title-error' : undefined}
                  />
                  {validationErrors.title && (
                    <span id="achievemgr-title-error" className="achievemgr-error-text" role="alert">
                      {validationErrors.title}
                    </span>
                  )}
                </div>

                <div className="achievemgr-form-group">
                  <div className="achievemgr-form-label-wrapper">
                    <label htmlFor="achievemgr-description" className="achievemgr-form-label">
                      Description
                    </label>
                    <span className="achievemgr-char-count">
                      {characterCounts.description}/1000
                    </span>
                  </div>
                  <textarea
                    id="achievemgr-description"
                    value={formData.description}
                    onChange={(e) => handleInputChange('description', e.target.value)}
                    className={`achievemgr-form-textarea ${validationErrors.description ? 'achievemgr-error' : ''}`}
                    placeholder="Brief description of the achievement..."
                    rows={4}
                    maxLength={1000}
                  />
                  {validationErrors.description && (
                    <span className="achievemgr-error-text" role="alert">
                      {validationErrors.description}
                    </span>
                  )}
                </div>

                <div className="achievemgr-form-group">
                  <div className="achievemgr-form-label-wrapper">
                    <label htmlFor="achievemgr-date-achieved" className="achievemgr-form-label">
                      Date Achieved
                    </label>
                  </div>
                  <input
                    id="achievemgr-date-achieved"
                    type="date"
                    value={formData.date_achieved}
                    onChange={(e) => handleInputChange('date_achieved', e.target.value)}
                    className={`achievemgr-form-input ${validationErrors.date_achieved ? 'achievemgr-error' : ''}`}
                    max={new Date().toISOString().split('T')[0]}
                  />
                  {validationErrors.date_achieved && (
                    <span className="achievemgr-error-text" role="alert">
                      {validationErrors.date_achieved}
                    </span>
                  )}
                </div>
              </div>

              {/* Organization & Competition Section */}
              <div className="achievemgr-form-section-group">
                <h4 className="achievemgr-section-title">
                  <span className="achievemgr-section-icon">🏢</span>
                  Organization & Competition Details
                </h4>
                
                <div className="achievemgr-mutual-exclusive-note">
                  <span className="achievemgr-note-icon">ℹ️</span>
                  <span className="achievemgr-note-text">
                    Provide either <strong>Issuing Organization</strong> OR <strong>Competition Name</strong>, not both.
                  </span>
                </div>

                <div className="achievemgr-form-group">
                  <div className="achievemgr-form-label-wrapper">
                    <label htmlFor="achievemgr-issuing-organization" className="achievemgr-form-label">
                      Issuing Organization
                    </label>
                    <span className="achievemgr-char-count">
                      {characterCounts.issuingOrganization}/200
                    </span>
                  </div>
                  <input
                    id="achievemgr-issuing-organization"
                    type="text"
                    value={formData.issuing_organization}
                    onChange={(e) => handleInputChange('issuing_organization', e.target.value)}
                    className={`achievemgr-form-input ${validationErrors.issuing_organization ? 'achievemgr-error' : ''}`}
                    placeholder="e.g., Tata Consultancy Services"
                    maxLength={200}
                    disabled={formData.competition_name.trim() !== ''}
                  />
                  {validationErrors.issuing_organization && (
                    <span className="achievemgr-error-text" role="alert">
                      {validationErrors.issuing_organization}
                    </span>
                  )}
                </div>

                <div className="achievemgr-form-group">
                  <div className="achievemgr-form-label-wrapper">
                    <label htmlFor="achievemgr-competition-name" className="achievemgr-form-label">
                      Competition Name
                    </label>
                    <span className="achievemgr-char-count">
                      {characterCounts.competitionName}/200
                    </span>
                  </div>
                  <input
                    id="achievemgr-competition-name"
                    type="text"
                    value={formData.competition_name}
                    onChange={(e) => handleInputChange('competition_name', e.target.value)}
                    className={`achievemgr-form-input ${validationErrors.competition_name ? 'achievemgr-error' : ''}`}
                    placeholder="e.g., National Programming Contest"
                    maxLength={200}
                    disabled={formData.issuing_organization.trim() !== ''}
                  />
                  {validationErrors.competition_name && (
                    <span className="achievemgr-error-text" role="alert">
                      {validationErrors.competition_name}
                    </span>
                  )}
                </div>
              </div>

              {/* Position & Competition Details Section */}
              <div className="achievemgr-form-section-group">
                <h4 className="achievemgr-section-title">
                  <span className="achievemgr-section-icon">🥇</span>
                  Position & Competition Details
                </h4>
                
                <div className="achievemgr-form-row">
                  <div className="achievemgr-form-group">
                    <div className="achievemgr-form-label-wrapper">
                      <label htmlFor="achievemgr-position" className="achievemgr-form-label">
                        Position/Rank Achieved
                      </label>
                      <span className="achievemgr-char-count">
                        {characterCounts.position}/100
                      </span>
                    </div>
                    <select
                      id="achievemgr-position"
                      value={formData.position}
                      onChange={(e) => handleInputChange('position', e.target.value)}
                      className={`achievemgr-form-select ${validationErrors.position ? 'achievemgr-error' : ''}`}
                    >
                      <option value="">Select Position/Rank</option>
                      {positionOptions.map(position => (
                        <option key={position} value={position}>{position}</option>
                      ))}
                    </select>
                    {validationErrors.position && (
                      <span className="achievemgr-error-text" role="alert">
                        {validationErrors.position}
                      </span>
                    )}
                  </div>

                  <div className="achievemgr-form-group">
                    <div className="achievemgr-form-label-wrapper">
                      <label htmlFor="achievemgr-participants-count" className="achievemgr-form-label">
                        Number of Participants
                      </label>
                    </div>
                    <input
                      id="achievemgr-participants-count"
                      type="number"
                      value={formData.participants_count}
                      onChange={(e) => handleInputChange('participants_count', e.target.value)}
                      className={`achievemgr-form-input ${validationErrors.participants_count ? 'achievemgr-error' : ''}`}
                      placeholder="e.g., 500"
                      min="0"
                    />
                    {validationErrors.participants_count && (
                      <span className="achievemgr-error-text" role="alert">
                        {validationErrors.participants_count}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Certificate Section */}
              <div className="achievemgr-form-section-group">
                <h4 className="achievemgr-section-title">
                  <span className="achievemgr-section-icon">📄</span>
                  Certificate & Documentation
                </h4>
                
                {formData.certificate_url ? (
                  <div className="achievemgr-current-certificate">
                    <div className="achievemgr-certificate-preview">
                      <div className="achievemgr-certificate-info">
                        <span className="achievemgr-certificate-icon">📄</span>
                        <span className="achievemgr-certificate-text">Certificate uploaded</span>
                      </div>
                      <div className="achievemgr-certificate-actions">
                        <a 
                          href={formData.certificate_url} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="achievemgr-view-certificate-btn"
                          title="View certificate"
                        >
                          👁️ View
                        </a>
                        <button
                          type="button"
                          onClick={removeCertificate}
                          className="achievemgr-remove-certificate-btn"
                          title="Remove certificate"
                        >
                          🗑️ Delete
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="achievemgr-upload-section">
                    <input
                      type="file"
                      accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx"
                      onChange={(e) => e.target.files[0] && handleCertificateUpload(e.target.files[0])}
                      disabled={certificateUploading}
                      className="achievemgr-file-input"
                      id="achievemgr-certificate-upload"
                    />
                    <label htmlFor="achievemgr-certificate-upload" className="achievemgr-upload-btn">
                      {certificateUploading ? (
                        <>
                          <LoadingSpinner size="small" />
                          Uploading... {Math.round(uploadProgress)}%
                        </>
                      ) : (
                        <>
                          <span className="achievemgr-btn-icon">📄</span>
                          Upload Certificate
                        </>
                      )}
                    </label>
                    <p className="achievemgr-upload-help">
                      Upload certificate (PDF, JPEG, PNG, WebP, DOC, DOCX, max 10MB)
                    </p>
                  </div>
                )}

                {validationErrors.certificate && (
                  <span className="achievemgr-error-text" role="alert">
                    {validationErrors.certificate}
                  </span>
                )}

                <div className="achievemgr-form-group">
                  <div className="achievemgr-form-label-wrapper">
                    <label htmlFor="achievemgr-verification-url" className="achievemgr-form-label">
                      Verification URL
                    </label>
                    <span className="achievemgr-char-count">
                      {characterCounts.verificationUrl}/500
                    </span>
                  </div>
                  <input
                    id="achievemgr-verification-url"
                    type="url"
                    value={formData.verification_url}
                    onChange={(e) => handleInputChange('verification_url', e.target.value)}
                    className={`achievemgr-form-input ${validationErrors.verification_url ? 'achievemgr-error' : ''}`}
                    placeholder="https://example.com/verify-achievement"
                    maxLength={500}
                  />
                  {validationErrors.verification_url && (
                    <span className="achievemgr-error-text" role="alert">
                      {validationErrors.verification_url}
                    </span>
                  )}
                </div>
              </div>

              {/* Impact & Additional Details Section */}
              <div className="achievemgr-form-section-group">
                <h4 className="achievemgr-section-title">
                  <span className="achievemgr-section-icon">💫</span>
                  Impact & Additional Details
                </h4>
                
                <div className="achievemgr-form-group">
                  <div className="achievemgr-form-label-wrapper">
                    <label htmlFor="achievemgr-impact" className="achievemgr-form-label">
                      Impact & Significance
                    </label>
                    <span className="achievemgr-char-count">
                      {characterCounts.impact}/1000
                    </span>
                  </div>
                  <textarea
                    id="achievemgr-impact"
                    value={formData.impact}
                    onChange={(e) => handleInputChange('impact', e.target.value)}
                    className={`achievemgr-form-textarea ${validationErrors.impact ? 'achievemgr-error' : ''}`}
                    placeholder="Describe the impact and significance of this achievement..."
                    rows={4}
                    maxLength={1000}
                  />
                  {validationErrors.impact && (
                    <span className="achievemgr-error-text" role="alert">
                      {validationErrors.impact}
                    </span>
                  )}
                </div>
              </div>

              {/* Achievement Settings Section */}
              <div className="achievemgr-form-section-group">
                <h4 className="achievemgr-section-title">
                  <span className="achievemgr-section-icon">⚙️</span>
                  Achievement Settings
                </h4>
                
                <div className="achievemgr-form-row">
                  <div className="achievemgr-form-group">
                    <div className="achievemgr-form-label-wrapper">
                      <label htmlFor="achievemgr-status" className="achievemgr-form-label">
                        Record Status
                      </label>
                    </div>
                    <select
                      id="achievemgr-status"
                      value={formData.status}
                      onChange={(e) => handleInputChange('status', e.target.value)}
                      className="achievemgr-form-select"
                    >
                      <option value="active">Active</option>
                      <option value="draft">Draft</option>
                      <option value="archived">Archived</option>
                    </select>
                  </div>

                  <div className="achievemgr-form-group">
                    <div className="achievemgr-form-label-wrapper">
                      <label htmlFor="achievemgr-order-index" className="achievemgr-form-label">
                        Display Order
                      </label>
                    </div>
                    <input
                      id="achievemgr-order-index"
                      type="number"
                      value={formData.order_index || ''}
                      onChange={(e) => handleInputChange('order_index', e.target.value ? parseInt(e.target.value) : null)}
                      className="achievemgr-form-input"
                      placeholder="e.g., 1"
                      min="1"
                    />
                    <p className="achievemgr-form-help">
                      Lower numbers appear first (leave empty for default ordering)
                    </p>
                  </div>
                </div>

                <div className="achievemgr-form-group">
                  <div className="achievemgr-checkbox-wrapper">
                    <input
                      id="achievemgr-is-featured"
                      type="checkbox"
                      checked={formData.is_featured}
                      onChange={(e) => handleInputChange('is_featured', e.target.checked)}
                      className="achievemgr-form-checkbox"
                    />
                    <label htmlFor="achievemgr-is-featured" className="achievemgr-checkbox-label">
                      Mark as Featured Achievement
                    </label>
                  </div>
                  <p className="achievemgr-form-help">
                    Featured achievements appear prominently on your portfolio
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Preview Section */}
        {uiState.showPreview && (viewMode === 'add' || viewMode === 'edit') && (
          <div className="achievemgr-preview-section">
            <div className="achievemgr-preview-container achievemgr-glass-card">
              <h3 className="achievemgr-preview-title">
                <span className="achievemgr-preview-icon">👁️</span>
                Live Preview
              </h3>
              
              <div className="achievemgr-achievement-preview">
                <div className="achievemgr-preview-achievement-card">
                  
                  {/* Preview Header */}
                  <div className="achievemgr-preview-card-header">
                    <div className="achievemgr-preview-status-indicators">
                      {formData.is_featured && (
                        <div className="achievemgr-preview-featured-badge">
                          <span className="achievemgr-badge-text">FEATURED</span>
                        </div>
                      )}
                      <div className="achievemgr-preview-status-badge">
                        <span className="achievemgr-badge-text">{formData.status.toUpperCase()}</span>
                      </div>
                    </div>
                  </div>

                  {/* Preview Title */}
                  <div className="achievemgr-preview-title-section">
                    <h3 className="achievemgr-preview-achievement-title">
                      {formData.title || 'Achievement Title'}
                    </h3>
                    <div className="achievemgr-preview-title-underline"></div>
                  </div>

                  {/* Preview Meta Information */}
                  <div className="achievemgr-preview-meta-section">
                    <div className="achievemgr-preview-meta-row">
                      <div className="achievemgr-preview-meta-item">
                        <span className="achievemgr-meta-label">Category</span>
                        <span className="achievemgr-meta-value">
                          {formData.category || 'N/A'}
                        </span>
                      </div>
                      <div className="achievemgr-preview-meta-item">
                        <span className="achievemgr-meta-label">Date</span>
                        <span className="achievemgr-meta-value">
                          {formData.date_achieved ? formatAchievementDate(formData.date_achieved) : 'N/A'}
                        </span>
                      </div>
                    </div>
                    
                    <div className="achievemgr-preview-meta-row">
                      <div className="achievemgr-preview-meta-item">
                        <span className="achievemgr-meta-label">Organization</span>
                        <span className="achievemgr-meta-value">
                          {formData.issuing_organization || formData.competition_name || 'N/A'}
                        </span>
                      </div>
                      {formData.position && (
                        <div className="achievemgr-preview-meta-item">
                          <span className="achievemgr-meta-label">Position</span>
                          <span className="achievemgr-meta-value">{formData.position}</span>
                        </div>
                      )}
                    </div>

                    {formData.participants_count && (
                      <div className="achievemgr-preview-meta-row">
                        <div className="achievemgr-preview-meta-item">
                          <span className="achievemgr-meta-label">Participants</span>
                          <span className="achievemgr-meta-value">{formData.participants_count}</span>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Preview Description */}
                  {formData.description && (
                    <div className="achievemgr-preview-description-section">
                      <h4 className="achievemgr-preview-section-title">Description</h4>
                      <p className="achievemgr-preview-description-text">
                        {formData.description}
                      </p>
                    </div>
                  )}

                  {/* Preview Impact */}
                  {formData.impact && (
                    <div className="achievemgr-preview-impact-section">
                      <h4 className="achievemgr-preview-section-title">Impact & Significance</h4>
                      <p className="achievemgr-preview-impact-text">
                        {formData.impact}
                      </p>
                    </div>
                  )}

                  {/* Preview Actions */}
                  <div className="achievemgr-preview-actions-section">
                    {formData.certificate_url && (
                      <div className="achievemgr-preview-action-item">
                        <span className="achievemgr-action-icon">📄</span>
                        <span className="achievemgr-action-text">Certificate Available</span>
                      </div>
                    )}
                    {formData.verification_url && (
                      <div className="achievemgr-preview-action-item">
                        <span className="achievemgr-action-icon">🔗</span>
                        <span className="achievemgr-action-text">Verification Link Available</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Preview Status */}
              <div className="achievemgr-preview-status">
                <span className={`achievemgr-status-indicator ${formData.status}`}>
                  {formData.status === 'active' && '🟢 Active'}
                  {formData.status === 'draft' && '🟡 Draft'}
                  {formData.status === 'archived' && '🔴 Archived'}
                </span>
                <span className="achievemgr-featured-status-indicator">
                  {formData.is_featured ? '⭐ Featured Achievement' : '📋 Regular Achievement'}
                </span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AchievementsManager;