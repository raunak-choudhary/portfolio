// src/components/admin/AdminDashboard/sections/EducationManager.js

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useSupabase } from '../../../../hooks/useSupabase';
import LoadingSpinner from '../../../common/LoadingSpinner';
import './EducationManager.css';
import { triggerPublicRefresh } from '../../../../services/adminDataService';

const EducationManager = () => {
  // ============================================================================
  // DATA FETCHING WITH OPTIMIZED useSupabase HOOK
  // ============================================================================
  
  const { 
    data: educationData, 
    loading: dataLoading, 
    error: dataError,
    refetch 
  } = useSupabase('education', {}, { 
    orderBy: [
      { column: 'education_level', ascending: false }, // Highest degree first
      { column: 'start_date', ascending: false }
    ],
    cacheKey: 'education-admin'
  });

  // ============================================================================
  // STATE MANAGEMENT - ORGANIZED AND OPTIMIZED
  // ============================================================================
  
  // View state management
  const [viewMode, setViewMode] = useState('list'); // 'list', 'add', 'edit'
  const [selectedEducation, setSelectedEducation] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterLevel, setFilterLevel] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');

  // Form state with proper initial values
  const [formData, setFormData] = useState({
    education_level: '',
    degree: '',
    institution: '',
    college: '',
    institution_logo_url: '',
    start_date: '',
    end_date: '',
    gpa_received: '',
    max_gpa_scale: '',
    location: '',
    description: '',
    major: '',
    minor: '',
    coursework: [],
    achievements: [],
    activities: [],
    thesis_title: '',
    degree_type: '',
    education_status: 'completed',
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
  
  // Dynamic arrays management
  const [newCoursework, setNewCoursework] = useState('');
  const [newAchievement, setNewAchievement] = useState('');
  const [newActivity, setNewActivity] = useState('');

  // File upload state
  const [logoUploading, setLogoUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  // Delete confirmation modal state
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [educationToDelete, setEducationToDelete] = useState(null);

  // Education level options (ordered by hierarchy)
  const educationLevels = useMemo(() => [
    'PhD',
    'Doctorate',
    'Master\'s Degree',
    'Bachelor\'s Degree',
    'Associate Degree',
    'Diploma',
    'Certificate',
    'High School',
    'Secondary School',
    'Primary School'
  ], []);

  // Degree type options
  const degreeTypes = [
    'Graduate',
    'Undergraduate',
    'Postgraduate',
    'Professional',
    'Research'
  ];

  // Education status options
  const educationStatusOptions = [
    'Completed',
    'In Progress',
    'Graduated',
    'Transferred',
    'Withdrawn',
    'Deferred'
  ];

  // ============================================================================
  // MEMOIZED VALUES FOR PERFORMANCE
  // ============================================================================
  
  const characterCounts = useMemo(() => ({
    degree: formData.degree.length,
    institution: formData.institution.length,
    college: formData.college.length,
    location: formData.location.length,
    description: formData.description.length,
    major: formData.major.length,
    minor: formData.minor.length,
    thesisTitle: formData.thesis_title.length,
    courseworkCount: formData.coursework.length,
    achievementsCount: formData.achievements.length,
    activitiesCount: formData.activities.length
  }), [formData]);

  const filteredEducation = useMemo(() => {
    if (!educationData) return [];
    
    return educationData.filter(education => {
      const matchesSearch = education.degree.toLowerCase().includes(searchTerm.toLowerCase()) ||
                           education.institution?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                           education.college?.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesLevel = filterLevel === 'all' || education.education_level === filterLevel;
      const matchesStatus = filterStatus === 'all' || education.education_status === filterStatus;
      
      return matchesSearch && matchesLevel && matchesStatus;
    });
  }, [educationData, searchTerm, filterLevel, filterStatus]);

  const educationLevelsInData = useMemo(() => {
    if (!educationData) return [];
    const levels = [...new Set(educationData.map(e => e.education_level).filter(Boolean))];
    return levels.sort((a, b) => {
      const aIndex = educationLevels.indexOf(a);
      const bIndex = educationLevels.indexOf(b);
      return aIndex - bIndex;
    });
  }, [educationData, educationLevels]);

  const hasUnsavedChanges = useMemo(() => {
    if (viewMode === 'list') return false;
    if (!selectedEducation && viewMode === 'edit') return false;
    
    if (viewMode === 'add') {
      return formData.degree.trim() !== '' || 
             formData.college.trim() !== '' ||
             formData.institution.trim() !== '' ||
             formData.coursework.length > 0 ||
             formData.achievements.length > 0 ||
             formData.activities.length > 0;
    }

    if (viewMode === 'edit' && selectedEducation) {
      return (
        formData.education_level !== (selectedEducation.education_level || '') ||
        formData.degree !== (selectedEducation.degree || '') ||
        formData.institution !== (selectedEducation.institution || '') ||
        formData.college !== (selectedEducation.college || '') ||
        formData.start_date !== (selectedEducation.start_date || '') ||
        formData.end_date !== (selectedEducation.end_date || '') ||
        formData.gpa_received !== (selectedEducation.gpa_received || '') ||
        formData.max_gpa_scale !== (selectedEducation.max_gpa_scale || '') ||
        formData.location !== (selectedEducation.location || '') ||
        formData.description !== (selectedEducation.description || '') ||
        formData.major !== (selectedEducation.major || '') ||
        formData.minor !== (selectedEducation.minor || '') ||
        formData.thesis_title !== (selectedEducation.thesis_title || '') ||
        formData.degree_type !== (selectedEducation.degree_type || '') ||
        formData.education_status !== (selectedEducation.education_status || 'completed') ||
        formData.status !== (selectedEducation.status || 'active') ||
        JSON.stringify(formData.coursework) !== JSON.stringify(selectedEducation.coursework || []) ||
        JSON.stringify(formData.achievements) !== JSON.stringify(selectedEducation.achievements || []) ||
        JSON.stringify(formData.activities) !== JSON.stringify(selectedEducation.activities || [])
      );
    }

    return uiState.hasChanges;
  }, [formData, selectedEducation, viewMode, uiState.hasChanges]);

  // ============================================================================
  // EFFECT HOOKS - OPTIMIZED DATA LOADING
  // ============================================================================
  
  // Load data into form when editing education
  useEffect(() => {
    if (viewMode === 'edit' && selectedEducation) {
      const newFormData = {
        education_level: selectedEducation.education_level || '',
        degree: selectedEducation.degree || '',
        institution: selectedEducation.institution || '',
        college: selectedEducation.college || '',
        institution_logo_url: selectedEducation.institution_logo_url || '',
        start_date: selectedEducation.start_date || '',
        end_date: selectedEducation.end_date || '',
        gpa_received: selectedEducation.gpa_received || '',
        max_gpa_scale: selectedEducation.max_gpa_scale || '',
        location: selectedEducation.location || '',
        description: selectedEducation.description || '',
        major: selectedEducation.major || '',
        minor: selectedEducation.minor || '',
        coursework: Array.isArray(selectedEducation.coursework) ? [...selectedEducation.coursework] : [],
        achievements: Array.isArray(selectedEducation.achievements) ? [...selectedEducation.achievements] : [],
        activities: Array.isArray(selectedEducation.activities) ? [...selectedEducation.activities] : [],
        thesis_title: selectedEducation.thesis_title || '',
        degree_type: selectedEducation.degree_type || '',
        education_status: selectedEducation.education_status || 'completed',
        order_index: selectedEducation.order_index,
        status: selectedEducation.status || 'active'
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
  }, [viewMode, selectedEducation]);

  // Reset form when switching to add mode
  useEffect(() => {
    if (viewMode === 'add') {
      setFormData({
        education_level: '',
        degree: '',
        institution: '',
        college: '',
        institution_logo_url: '',
        start_date: '',
        end_date: '',
        gpa_received: '',
        max_gpa_scale: '',
        location: '',
        description: '',
        major: '',
        minor: '',
        coursework: [],
        achievements: [],
        activities: [],
        thesis_title: '',
        degree_type: '',
        education_status: 'completed',
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
  // DYNAMIC ARRAYS MANAGEMENT - COURSEWORK, ACHIEVEMENTS, ACTIVITIES
  // ============================================================================
  
  const addCoursework = useCallback(() => {
    const trimmedCourse = newCoursework.trim();
    
    if (trimmedCourse && 
        trimmedCourse.length <= 100 && 
        formData.coursework.length < 30 &&
        !formData.coursework.includes(trimmedCourse)) {
      
      const updatedCoursework = [...formData.coursework, trimmedCourse];
      handleInputChange('coursework', updatedCoursework);
      setNewCoursework('');
    }
  }, [newCoursework, formData.coursework, handleInputChange]);

  const removeCoursework = useCallback((index) => {
    const updatedCoursework = formData.coursework.filter((_, i) => i !== index);
    handleInputChange('coursework', updatedCoursework);
  }, [formData.coursework, handleInputChange]);

  const addAchievement = useCallback(() => {
    const trimmedAchievement = newAchievement.trim();
    
    if (trimmedAchievement && 
        trimmedAchievement.length <= 150 && 
        formData.achievements.length < 20 &&
        !formData.achievements.includes(trimmedAchievement)) {
      
      const updatedAchievements = [...formData.achievements, trimmedAchievement];
      handleInputChange('achievements', updatedAchievements);
      setNewAchievement('');
    }
  }, [newAchievement, formData.achievements, handleInputChange]);

  const removeAchievement = useCallback((index) => {
    const updatedAchievements = formData.achievements.filter((_, i) => i !== index);
    handleInputChange('achievements', updatedAchievements);
  }, [formData.achievements, handleInputChange]);

  const addActivity = useCallback(() => {
    const trimmedActivity = newActivity.trim();
    
    if (trimmedActivity && 
        trimmedActivity.length <= 100 && 
        formData.activities.length < 15 &&
        !formData.activities.includes(trimmedActivity)) {
      
      const updatedActivities = [...formData.activities, trimmedActivity];
      handleInputChange('activities', updatedActivities);
      setNewActivity('');
    }
  }, [newActivity, formData.activities, handleInputChange]);

  const removeActivity = useCallback((index) => {
    const updatedActivities = formData.activities.filter((_, i) => i !== index);
    handleInputChange('activities', updatedActivities);
  }, [formData.activities, handleInputChange]);

  // Handle Enter key for adding items
  const handleKeyPress = useCallback((e, action) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      action();
    }
  }, []);

  // ============================================================================
  // LOGO UPLOAD HANDLING
  // ============================================================================
  
  const handleLogoUpload = useCallback(async (file) => {
    if (!file) return;

    const maxSize = 5 * 1024 * 1024; // 5MB
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];

    // Validate file
    if (file.size > maxSize) {
      setValidationErrors(prev => ({
        ...prev,
        logo: 'File size must be less than 5MB'
      }));
      return;
    }
    
    if (!allowedTypes.includes(file.type)) {
      setValidationErrors(prev => ({
        ...prev,
        logo: 'Only JPEG, PNG, and WebP formats are allowed'
      }));
      return;
    }

    setLogoUploading(true);
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
      const institutionName = formData.institution || formData.college || 'institution';
      const sanitizedName = institutionName.toLowerCase().replace(/[^a-z0-9]/g, '-');
      const fileName = `${sanitizedName}-logo-${timestamp}.${fileExtension}`;
      const filePath = `education/${fileName}`;

      // Simulate upload progress
      const progressInterval = setInterval(() => {
        setUploadProgress(prev => Math.min(prev + 10, 90));
      }, 100);

      // Upload to Supabase Storage
      const { error: uploadError } = await supabaseAdmin.storage
        .from('organization-logos')
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
        .from('organization-logos')
        .getPublicUrl(filePath);

      // Update form data with logo URL
      handleInputChange('institution_logo_url', urlData.publicUrl);

      // Clear any validation errors
      setValidationErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors.logo;
        return newErrors;
      });

    } catch (error) {
      console.error('Logo upload error:', error);
      setValidationErrors(prev => ({
        ...prev,
        logo: error.message || 'Failed to upload logo'
      }));
    } finally {
      setLogoUploading(false);
      setUploadProgress(0);
    }
  }, [formData.institution, formData.college, handleInputChange]);

  const removeLogo = useCallback(() => {
    handleInputChange('institution_logo_url', '');
  }, [handleInputChange]);

  // ============================================================================
  // GPA/PERCENTAGE FORMATTING UTILITIES
  // ============================================================================
  
  const formatGradeDisplay = useCallback((received, maxScale) => {
    if (!received || !maxScale) return 'N/A';
    
    const max = parseFloat(maxScale);
    const receivedVal = parseFloat(received);
    
    if (max === 100) {
      // Percentage format
      return `${receivedVal}%`;
    } else {
      // GPA format
      return `${receivedVal}/${max}`;
    }
  }, []);

  const getGradeType = useCallback((maxScale) => {
    if (!maxScale) return '';
    const max = parseFloat(maxScale);
    return max === 100 ? 'Percentage' : 'GPA';
  }, []);

  // ============================================================================
  // FORM VALIDATION - COMPREHENSIVE AND OPTIMIZED
  // ============================================================================
  
  const validateForm = useCallback(() => {
    const errors = {};

    // Degree validation (required, 3-200 chars)
    const degreeTrimmed = formData.degree.trim();
    if (!degreeTrimmed) {
      errors.degree = 'Degree is required';
    } else if (degreeTrimmed.length < 3) {
      errors.degree = 'Degree must be at least 3 characters';
    } else if (degreeTrimmed.length > 200) {
      errors.degree = 'Degree must be less than 200 characters';
    }

    // College validation (required, 2-200 chars)
    const collegeTrimmed = formData.college.trim();
    if (!collegeTrimmed) {
      errors.college = 'College/School name is required';
    } else if (collegeTrimmed.length < 2) {
      errors.college = 'College name must be at least 2 characters';
    } else if (collegeTrimmed.length > 200) {
      errors.college = 'College name must be less than 200 characters';
    }

    // Institution validation (optional, max 200 chars)
    if (formData.institution && formData.institution.length > 200) {
      errors.institution = 'Institution name must be less than 200 characters';
    }

    // Education level validation (optional, max 50 chars)
    if (formData.education_level && formData.education_level.length > 50) {
      errors.education_level = 'Education level must be less than 50 characters';
    }

    // Location validation (optional, max 100 chars)
    if (formData.location && formData.location.length > 100) {
      errors.location = 'Location must be less than 100 characters';
    }

    // Description validation (optional, max 2000 chars)
    if (formData.description && formData.description.length > 2000) {
      errors.description = 'Description must be less than 2000 characters';
    }

    // Major validation (optional, max 100 chars)
    if (formData.major && formData.major.length > 100) {
      errors.major = 'Major must be less than 100 characters';
    }

    // Minor validation (optional, max 100 chars)
    if (formData.minor && formData.minor.length > 100) {
      errors.minor = 'Minor must be less than 100 characters';
    }

    // Thesis title validation (optional, max 300 chars)
    if (formData.thesis_title && formData.thesis_title.length > 300) {
      errors.thesis_title = 'Thesis title must be less than 300 characters';
    }

    // Date validation
    if (formData.start_date && formData.end_date) {
      const startDate = new Date(formData.start_date);
      const endDate = new Date(formData.end_date);
      
      if (startDate >= endDate) {
        errors.end_date = 'End date must be after start date';
      }
    }

    // GPA validation
    if (formData.gpa_received && formData.max_gpa_scale) {
      const received = parseFloat(formData.gpa_received);
      const maxScale = parseFloat(formData.max_gpa_scale);
      
      if (isNaN(received) || isNaN(maxScale)) {
        errors.gpa_received = 'GPA values must be numbers';
      } else if (received > maxScale) {
        errors.gpa_received = 'Received GPA cannot be greater than maximum scale';
      } else if (received < 0 || maxScale < 0) {
        errors.gpa_received = 'GPA values cannot be negative';
      }
    }

    // Arrays validation
    if (formData.coursework.length > 30) {
      errors.coursework = 'Maximum 30 coursework items allowed';
    }

    if (formData.achievements.length > 20) {
      errors.achievements = 'Maximum 20 achievements allowed';
    }

    if (formData.activities.length > 15) {
      errors.activities = 'Maximum 15 activities allowed';
    }

    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  }, [formData]);

  // ============================================================================
  // SAVE OPERATION - FOLLOWING PROJECTS MANAGER PATTERN
  // ============================================================================
  
  const handleSave = useCallback(async () => {
    console.log('🚀 Starting Education save process...');
    
    if (!validateForm()) {
      console.log('❌ Form validation failed');
      setUiState(prev => ({ ...prev, saveStatus: 'error' }));
      return;
    }

    setUiState(prev => ({ ...prev, isSaving: true, saveStatus: null }));

    try {
      // Prepare data for saving
      const saveData = {
        education_level: formData.education_level.trim() || null,
        degree: formData.degree.trim(),
        institution: formData.institution.trim() || null,
        college: formData.college.trim(),
        institution_logo_url: formData.institution_logo_url || null,
        start_date: formData.start_date || null,
        end_date: formData.end_date || null,
        gpa_received: formData.gpa_received || null,
        max_gpa_scale: formData.max_gpa_scale || null,
        location: formData.location.trim() || null,
        description: formData.description.trim() || null,
        major: formData.major.trim() || null,
        minor: formData.minor.trim() || null,
        coursework: formData.coursework,
        achievements: formData.achievements,
        activities: formData.activities,
        thesis_title: formData.thesis_title.trim() || null,
        degree_type: formData.degree_type || null,
        education_status: formData.education_status,
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
      
      if (viewMode === 'edit' && selectedEducation?.id) {
        // Update existing education
        console.log('🔄 Updating existing education with ID:', selectedEducation.id);
        const { data, error } = await supabaseAdmin
          .from('education')
          .update({
            ...saveData,
            updated_at: new Date().toISOString()
          })
          .eq('id', selectedEducation.id)
          .select()
          .single();
          
        console.log('✏️ Update operation result:', data);
        console.log('❌ Update error (if any):', error);
          
        if (error) {
          console.error('💥 Update error details:', error);
          throw new Error(`Failed to update education: ${error.message}`);
        }
        
        result = { success: true, data };
      } else {
        // Create new education
        console.log('➕ Creating new education');
        const { data, error } = await supabaseAdmin
          .from('education')
          .insert([saveData])
          .select()
          .single();
          
        console.log('➕ Insert operation result:', data);
        console.log('❌ Insert error (if any):', error);
          
        if (error) {
          console.error('💥 Insert error details:', error);
          throw new Error(`Failed to create education: ${error.message}`);
        }
        
        result = { success: true, data };
      }
      
      console.log('📥 Final save result:', result);

      if (result && result.success) {
        console.log('✅ Save successful');

        triggerPublicRefresh('education');
        
        // Set success status immediately
        setUiState(prev => ({ 
          ...prev, 
          saveStatus: 'success',
          hasChanges: false,
          isPostSave: true
        }));

        // If this was a new education, switch to list view after save
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
        throw new Error(result?.error || result?.message || 'Failed to save education');
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
  }, [formData, selectedEducation, viewMode, validateForm, refetch]);

  // ============================================================================
  // UI ACTIONS - OPTIMIZED EVENT HANDLERS
  // ============================================================================
  
  const handleAddNew = useCallback(() => {
    if (hasUnsavedChanges && viewMode !== 'list') {
      if (!window.confirm('You have unsaved changes. Are you sure you want to start a new education entry? Changes will be lost.')) {
        return;
      }
    }
    setViewMode('add');
    setSelectedEducation(null);
  }, [hasUnsavedChanges, viewMode]);

  const handleEdit = useCallback((education) => {
    if (hasUnsavedChanges && viewMode !== 'list' && selectedEducation?.id !== education.id) {
      if (!window.confirm('You have unsaved changes. Are you sure you want to edit a different education? Changes will be lost.')) {
        return;
      }
    }
    setSelectedEducation(education);
    setViewMode('edit');
  }, [hasUnsavedChanges, viewMode, selectedEducation]);

  const handleCancel = useCallback(() => {
    if (hasUnsavedChanges) {
      if (!window.confirm('You have unsaved changes. Are you sure you want to cancel? Changes will be lost.')) {
        return;
      }
    }
    setViewMode('list');
    setSelectedEducation(null);
    setValidationErrors({});
    setNewCoursework('');
    setNewAchievement('');
    setNewActivity('');
    setUiState(prev => ({
      ...prev,
      hasChanges: false,
      saveStatus: null,
      isPostSave: false
    }));
  }, [hasUnsavedChanges]);

  const handleDelete = useCallback((education) => {
    setEducationToDelete(education);
    setShowDeleteModal(true);
  }, []);

  const confirmDeleteAction = useCallback(async () => {
    if (!educationToDelete) return;

    try {
      const { createClient } = await import('@supabase/supabase-js');
      const supabaseAdmin = createClient(
        process.env.REACT_APP_SUPABASE_URL,
        process.env.REACT_APP_SUPABASE_SERVICE_ROLE_KEY
      );

      const { error } = await supabaseAdmin
        .from('education')
        .delete()
        .eq('id', educationToDelete.id);

      if (error) {
        throw new Error(`Failed to delete education: ${error.message}`);
      }

      triggerPublicRefresh('education');
      setUiState(prev => ({ 
        ...prev, 
        saveStatus: 'success',
        statusMessageContent: `Education "${educationToDelete.degree}" at "${educationToDelete.college}" has been deleted.`
      }));
      refetch();

    } catch (error) {
      console.error('Delete error:', error);
      setUiState(prev => ({ 
        ...prev, 
        saveStatus: 'error',
        statusMessageContent: `Error deleting education: ${error.message}`
      }));
    } finally {
      setShowDeleteModal(false);
      setEducationToDelete(null);
    }
  }, [educationToDelete, refetch]);

  const cancelDeleteAction = useCallback(() => {
    setShowDeleteModal(false);
    setEducationToDelete(null);
  }, []);

  const togglePreview = useCallback(() => {
    setUiState(prev => ({ ...prev, showPreview: !prev.showPreview }));
  }, []);

  // ============================================================================
  // LOADING STATE - STANDARDIZED PHASE 3 PATTERN
  // ============================================================================
  
  if (dataLoading && !educationData) {
    return (
      <div className="education-manager-loading">
        <LoadingSpinner size="large" />
        <p>Loading education records...</p>
      </div>
    );
  }

  // ============================================================================
  // RENDER - OPTIMIZED JSX STRUCTURE
  // ============================================================================
  
  return (
    <div className="education-content-manager">
      {/* Header Section */}
      <div className="education-manager-header">
        <div className="header-content">
          <h2 className="education-manager-title">
            <span className="education-title-icon">🎓</span>
            Education Management
          </h2>
          <p className="manager-subtitle">
            Manage your educational background and academic achievements
          </p>
        </div>

        <div className="header-actions">
          {viewMode === 'list' ? (
            <>
              <button
                className="action-btn add-btn primary"
                onClick={handleAddNew}
                title="Add New Education"
                type="button"
              >
                <span className="btn-icon">➕</span>
                Add Education
              </button>
            </>
          ) : (
            <>
              <button
                className="action-btn preview-btn"
                onClick={togglePreview}
                title="Toggle Preview"
                type="button"
              >
                <span className="btn-icon">👁️</span>
                {uiState.showPreview ? 'Hide Preview' : 'Show Preview'}
              </button>
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
                      Save Education
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
        <div className={`status-message ${uiState.saveStatus}`} role="alert">
          {uiState.saveStatus === 'success' && (
            <>
              <span className="status-icon">✅</span>
              <div className="status-content">
                <strong>Success!</strong> 
                {uiState.statusMessageContent || 'Education has been saved successfully and is now live on your portfolio.'}
              </div>
            </>
          )}
          {uiState.saveStatus === 'error' && (
            <>
              <span className="status-icon">❌</span>
              <div className="status-content">
                <strong>Error!</strong> 
                {uiState.statusMessageContent || 'Failed to save education. Please check your connection and try again.'}
              </div>
            </>
          )}
        </div>
      )}

      {/* Data Error */}
      {dataError && (
        <div className="status-message error" role="alert">
          <span className="status-icon">⚠️</span>
          Error loading education: {
            typeof dataError === 'string' ? dataError : dataError.message || 'Unknown error'
          }
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteModal && educationToDelete && (
        <div className="modal-overlay">
          <div className="modal-content glass-card">
            <h3 className="modal-title">
              <span className="modal-icon">🗑️</span> Confirm Deletion
            </h3>
            <p className="modal-text">
              Are you sure you want to delete the education: <strong>"{educationToDelete.degree}"</strong> 
              at <strong>"{educationToDelete.college}"</strong>? This action cannot be undone.
            </p>
            <div className="modal-actions">
              <button
                type="button"
                className="action-btn cancel-btn"
                onClick={cancelDeleteAction}
              >
                <span className="btn-icon">❌</span> Cancel
              </button>
              <button
                type="button"
                className="action-btn delete-btn-confirm primary"
                onClick={confirmDeleteAction}
              >
                <span className="btn-icon">🗑️</span> Delete Education
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className={`education-manager-content ${uiState.showPreview ? 'with-preview' : ''}`}>
        
        {/* LIST VIEW */}
        {viewMode === 'list' && (
          <div className="education-list-section">
            <div className="list-container glass-card">
              
              {/* Search and Filters */}
              <div className="list-controls">
                <div className="search-section">
                  <div className="search-wrapper">
                    <span className="search-icon">🔍</span>
                    <input
                      type="text"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      placeholder="Search education by degree, institution, or college..."
                      className="search-input"
                    />
                  </div>
                </div>
                
                <div className="filters-section">
                  <select
                    value={filterLevel}
                    onChange={(e) => setFilterLevel(e.target.value)}
                    className="filter-select"
                  >
                    <option value="all">All Levels</option>
                    {educationLevelsInData.map(level => (
                      <option key={level} value={level}>{level}</option>
                    ))}
                  </select>
                  
                  <select
                    value={filterStatus}
                    onChange={(e) => setFilterStatus(e.target.value)}
                    className="filter-select"
                  >
                    <option value="all">All Status</option>
                    <option value="Completed">Completed</option>
                    <option value="In Progress">In Progress</option>
                    <option value="Graduated">Graduated</option>
                    <option value="Transferred">Transferred</option>
                  </select>
                </div>
              </div>

              {/* Education Table */}
              <div className="education-table-wrapper">
                {filteredEducation.length === 0 ? (
                  <div className="no-education-message">
                    <div className="no-education-icon">🎓</div>
                    <h3>No Education Records Found</h3>
                    <p>
                      {educationData?.length === 0 
                        ? 'No education records have been created yet. Click "Add Education" to get started.'
                        : 'No education records match your current filters. Try adjusting your search criteria.'
                      }
                    </p>
                  </div>
                ) : (
                  <table className="education-table">
                    <thead>
                      <tr>
                        <th>Degree</th>
                        <th>College</th>
                        <th>Institution</th>
                        <th>GPA/Percentage</th>
                        <th>Education Level</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredEducation.map((education, index) => (
                        <tr key={education.id || index} className="education-row">
                          <td className="education-degree">
                            <div className="degree-content">
                              <h4 className="degree-title">{education.degree}</h4>
                              {education.major && (
                                <p className="degree-major">Major: {education.major}</p>
                              )}
                              {education.minor && (
                                <p className="degree-minor">Minor: {education.minor}</p>
                              )}
                              <div className="degree-meta">
                                {education.start_date && education.end_date && (
                                  <span className="meta-item">
                                    📅 {new Date(education.start_date).getFullYear()} - {new Date(education.end_date).getFullYear()}
                                  </span>
                                )}
                                {education.education_status && (
                                  <span className="meta-item">📊 {education.education_status}</span>
                                )}
                              </div>
                            </div>
                          </td>
                          
                          <td className="education-college">
                            <div className="college-content">
                              <span className="college-name">{education.college}</span>
                              {education.location && (
                                <span className="college-location">📍 {education.location}</span>
                              )}
                            </div>
                          </td>
                          
                          <td className="education-institution">
                            <span className="institution-name">
                              {education.institution || 'N/A'}
                            </span>
                          </td>
                          
                          <td className="education-gpa">
                            {education.gpa_received && education.max_gpa_scale ? (
                              <div className="gpa-content">
                                <span className="gpa-value">
                                  {formatGradeDisplay(education.gpa_received, education.max_gpa_scale)}
                                </span>
                                <span className="gpa-type">
                                  {getGradeType(education.max_gpa_scale)}
                                </span>
                              </div>
                            ) : (
                              <span className="gpa-na">N/A</span>
                            )}
                          </td>
                          
                          <td className="education-level">
                            <span className="level-badge">
                              {education.education_level || 'General'}
                            </span>
                          </td>
                          
                          <td className="education-actions">
                            <div className="action-buttons">
                              <button
                                className="action-btn-mini edit-btn"
                                onClick={() => handleEdit(education)}
                                title="Edit Education"
                              >
                                ✏️
                              </button>
                              <button
                                className="action-btn-mini delete-btn"
                                onClick={() => handleDelete(education)}
                                title="Delete Education"
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
              
              {/* Education Summary */}
              {educationData && educationData.length > 0 && (
                <div className="education-summary">
                  <div className="summary-stats">
                    <span className="stat-item">
                      <strong>{educationData.length}</strong> total education records
                    </span>
                    <span className="stat-item">
                      <strong>{educationData.filter(e => e.education_status === 'Completed').length}</strong> completed
                    </span>
                    <span className="stat-item">
                      <strong>{educationData.filter(e => e.education_status === 'In Progress').length}</strong> in progress
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* FORM VIEW (ADD/EDIT) */}
        {(viewMode === 'add' || viewMode === 'edit') && (
          <div className="form-section">
            <div className="form-container glass-card">
              
              {/* Form Title */}
              <div className="form-title-section">
                <h3 className="form-title">
                  {viewMode === 'add' ? 'Add New Education' : `Edit: ${selectedEducation?.degree}`}
                </h3>
                <p className="form-subtitle">
                  {viewMode === 'add' 
                    ? 'Create a new education entry for your portfolio'
                    : 'Update education information and details'
                  }
                </p>
              </div>

              {/* Basic Information Section */}
              <div className="form-section-group">
                <h4 className="section-title">
                  <span className="section-icon">📋</span>
                  Basic Information
                </h4>
                
                <div className="form-row">
                  <div className="form-group">
                    <div className="form-label-wrapper">
                      <label htmlFor="education-level" className="form-label">
                        Education Level
                      </label>
                    </div>
                    <select
                      id="education-level"
                      value={formData.education_level}
                      onChange={(e) => handleInputChange('education_level', e.target.value)}
                      className={`form-select ${validationErrors.education_level ? 'error' : ''}`}
                    >
                      <option value="">Select Education Level</option>
                      {educationLevels.map(level => (
                        <option key={level} value={level}>{level}</option>
                      ))}
                    </select>
                    {validationErrors.education_level && (
                      <span className="error-text" role="alert">
                        {validationErrors.education_level}
                      </span>
                    )}
                  </div>

                  <div className="form-group">
                    <div className="form-label-wrapper">
                      <label htmlFor="degree-type" className="form-label">
                        Degree Type
                      </label>
                    </div>
                    <select
                      id="degree-type"
                      value={formData.degree_type}
                      onChange={(e) => handleInputChange('degree_type', e.target.value)}
                      className="form-select"
                    >
                      <option value="">Select Degree Type</option>
                      {degreeTypes.map(type => (
                        <option key={type} value={type}>{type}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="form-group">
                  <div className="form-label-wrapper">
                    <label htmlFor="degree" className="form-label required">
                      Degree
                    </label>
                    <span className="char-count">
                      {characterCounts.degree}/200
                    </span>
                  </div>
                  <input
                    id="degree"
                    type="text"
                    value={formData.degree}
                    onChange={(e) => handleInputChange('degree', e.target.value)}
                    className={`form-input ${validationErrors.degree ? 'error' : ''}`}
                    placeholder="e.g., MS in Computer Science"
                    maxLength={200}
                    aria-describedby={validationErrors.degree ? 'degree-error' : undefined}
                  />
                  {validationErrors.degree && (
                    <span id="degree-error" className="error-text" role="alert">
                      {validationErrors.degree}
                    </span>
                  )}
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <div className="form-label-wrapper">
                      <label htmlFor="college" className="form-label required">
                        College/School
                      </label>
                      <span className="char-count">
                        {characterCounts.college}/200
                      </span>
                    </div>
                    <input
                      id="college"
                      type="text"
                      value={formData.college}
                      onChange={(e) => handleInputChange('college', e.target.value)}
                      className={`form-input ${validationErrors.college ? 'error' : ''}`}
                      placeholder="e.g., Tandon School of Engineering"
                      maxLength={200}
                    />
                    {validationErrors.college && (
                      <span className="error-text" role="alert">
                        {validationErrors.college}
                      </span>
                    )}
                  </div>

                  <div className="form-group">
                    <div className="form-label-wrapper">
                      <label htmlFor="institution" className="form-label">
                        Institution
                      </label>
                      <span className="char-count">
                        {characterCounts.institution}/200
                      </span>
                    </div>
                    <input
                      id="institution"
                      type="text"
                      value={formData.institution}
                      onChange={(e) => handleInputChange('institution', e.target.value)}
                      className={`form-input ${validationErrors.institution ? 'error' : ''}`}
                      placeholder="e.g., New York University"
                      maxLength={200}
                    />
                    {validationErrors.institution && (
                      <span className="error-text" role="alert">
                        {validationErrors.institution}
                      </span>
                    )}
                  </div>
                </div>

                <div className="form-group">
                  <div className="form-label-wrapper">
                    <label htmlFor="location" className="form-label">
                      Location
                    </label>
                    <span className="char-count">
                      {characterCounts.location}/100
                    </span>
                  </div>
                  <input
                    id="location"
                    type="text"
                    value={formData.location}
                    onChange={(e) => handleInputChange('location', e.target.value)}
                    className={`form-input ${validationErrors.location ? 'error' : ''}`}
                    placeholder="e.g., New York, USA"
                    maxLength={100}
                  />
                  {validationErrors.location && (
                    <span className="error-text" role="alert">
                      {validationErrors.location}
                    </span>
                  )}
                </div>

                <div className="form-group">
                  <div className="form-label-wrapper">
                    <label htmlFor="description" className="form-label">
                      Description
                    </label>
                    <span className="char-count">
                      {characterCounts.description}/2000
                    </span>
                  </div>
                  <textarea
                    id="description"
                    value={formData.description}
                    onChange={(e) => handleInputChange('description', e.target.value)}
                    className={`form-textarea ${validationErrors.description ? 'error' : ''}`}
                    placeholder="Brief description of your education experience..."
                    rows={4}
                    maxLength={2000}
                  />
                  {validationErrors.description && (
                    <span className="error-text" role="alert">
                      {validationErrors.description}
                    </span>
                  )}
                </div>
              </div>

              {/* Academic Details Section */}
              <div className="form-section-group">
                <h4 className="section-title">
                  <span className="section-icon">📚</span>
                  Academic Details
                </h4>
                
                <div className="form-row">
                  <div className="form-group">
                    <div className="form-label-wrapper">
                      <label htmlFor="major" className="form-label">
                        Major
                      </label>
                      <span className="char-count">
                        {characterCounts.major}/100
                      </span>
                    </div>
                    <input
                      id="major"
                      type="text"
                      value={formData.major}
                      onChange={(e) => handleInputChange('major', e.target.value)}
                      className="form-input"
                      placeholder="e.g., Computer Science"
                      maxLength={100}
                    />
                  </div>

                  <div className="form-group">
                    <div className="form-label-wrapper">
                      <label htmlFor="minor" className="form-label">
                        Minor
                      </label>
                      <span className="char-count">
                        {characterCounts.minor}/100
                      </span>
                    </div>
                    <input
                      id="minor"
                      type="text"
                      value={formData.minor}
                      onChange={(e) => handleInputChange('minor', e.target.value)}
                      className="form-input"
                      placeholder="e.g., Mathematics"
                      maxLength={100}
                    />
                  </div>
                </div>

                <div className="form-group">
                  <div className="form-label-wrapper">
                    <label htmlFor="thesis-title" className="form-label">
                      Thesis/Capstone Title
                    </label>
                    <span className="char-count">
                      {characterCounts.thesisTitle}/300
                    </span>
                  </div>
                  <input
                    id="thesis-title"
                    type="text"
                    value={formData.thesis_title}
                    onChange={(e) => handleInputChange('thesis_title', e.target.value)}
                    className={`form-input ${validationErrors.thesis_title ? 'error' : ''}`}
                    placeholder="e.g., Adversarial Machine Learning in Computer Vision"
                    maxLength={300}
                  />
                  {validationErrors.thesis_title && (
                    <span className="error-text" role="alert">
                      {validationErrors.thesis_title}
                    </span>
                  )}
                </div>
              </div>

              {/* Duration & Performance Section */}
              <div className="form-section-group">
                <h4 className="section-title">
                  <span className="section-icon">📅</span>
                  Duration & Performance
                </h4>
                
                <div className="form-row">
                  <div className="form-group">
                    <div className="form-label-wrapper">
                      <label htmlFor="start-date" className="form-label">
                        Start Date
                      </label>
                    </div>
                    <input
                      id="start-date"
                      type="date"
                      value={formData.start_date}
                      onChange={(e) => handleInputChange('start_date', e.target.value)}
                      className="form-input"
                    />
                  </div>

                  <div className="form-group">
                    <div className="form-label-wrapper">
                      <label htmlFor="end-date" className="form-label">
                        End Date
                      </label>
                    </div>
                    <input
                      id="end-date"
                      type="date"
                      value={formData.end_date}
                      onChange={(e) => handleInputChange('end_date', e.target.value)}
                      className={`form-input ${validationErrors.end_date ? 'error' : ''}`}
                    />
                    {validationErrors.end_date && (
                      <span className="error-text" role="alert">
                        {validationErrors.end_date}
                      </span>
                    )}
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <div className="form-label-wrapper">
                      <label htmlFor="gpa-received" className="form-label">
                        GPA/Percentage Received
                      </label>
                    </div>
                    <input
                      id="gpa-received"
                      type="number"
                      step="0.001"
                      value={formData.gpa_received}
                      onChange={(e) => handleInputChange('gpa_received', e.target.value)}
                      className={`form-input ${validationErrors.gpa_received ? 'error' : ''}`}
                      placeholder="e.g., 3.889 or 85"
                    />
                    {validationErrors.gpa_received && (
                      <span className="error-text" role="alert">
                        {validationErrors.gpa_received}
                      </span>
                    )}
                  </div>

                  <div className="form-group">
                    <div className="form-label-wrapper">
                      <label htmlFor="max-gpa-scale" className="form-label">
                        Max GPA/Percentage Scale
                      </label>
                    </div>
                    <input
                      id="max-gpa-scale"
                      type="number"
                      step="0.1"
                      value={formData.max_gpa_scale}
                      onChange={(e) => handleInputChange('max_gpa_scale', e.target.value)}
                      className="form-input"
                      placeholder="e.g., 4.0 or 100"
                    />
                    <p className="form-help">
                      Enter 100 for percentage or the maximum GPA scale (e.g., 4.0)
                    </p>
                  </div>
                </div>

                <div className="form-group">
                  <div className="form-label-wrapper">
                    <label htmlFor="education-status" className="form-label">
                      Education Status
                    </label>
                  </div>
                  <select
                    id="education-status"
                    value={formData.education_status}
                    onChange={(e) => handleInputChange('education_status', e.target.value)}
                    className="form-select"
                  >
                    {educationStatusOptions.map(status => (
                      <option key={status} value={status}>{status}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Institution Logo Section */}
              <div className="form-section-group">
                <h4 className="section-title">
                  <span className="section-icon">🏫</span>
                  Institution Logo
                </h4>
                
                {formData.institution_logo_url ? (
                  <div className="current-logo">
                    <div className="logo-preview">
                      <img 
                        src={formData.institution_logo_url} 
                        alt="Institution Logo"
                        className="logo-image"
                        onError={(e) => {
                          e.target.style.display = 'none';
                        }}
                      />
                      <button
                        type="button"
                        onClick={removeLogo}
                        className="remove-logo-btn"
                        title="Remove logo"
                      >
                        ❌
                      </button>
                    </div>
                    <span className="logo-filename">Current logo</span>
                  </div>
                ) : (
                  <div className="upload-section">
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => e.target.files[0] && handleLogoUpload(e.target.files[0])}
                      disabled={logoUploading}
                      className="file-input"
                      id="logo-upload"
                    />
                    <label htmlFor="logo-upload" className="upload-btn">
                      {logoUploading ? (
                        <>
                          <LoadingSpinner size="small" />
                          Uploading... {Math.round(uploadProgress)}%
                        </>
                      ) : (
                        <>
                          <span className="btn-icon">🏫</span>
                          Upload Institution Logo
                        </>
                      )}
                    </label>
                    <p className="upload-help">
                      Upload institution logo (JPEG, PNG, WebP, max 5MB)
                    </p>
                  </div>
                )}

                {validationErrors.logo && (
                  <span className="error-text" role="alert">
                    {validationErrors.logo}
                  </span>
                )}
              </div>

              {/* Coursework Section */}
              <div className="form-section-group">
                <h4 className="section-title">
                  <span className="section-icon">📖</span>
                  Relevant Coursework ({characterCounts.courseworkCount}/30)
                </h4>
                
                <div className="coursework-list">
                  {formData.coursework.map((course, index) => (
                    <div key={index} className="coursework-item">
                      <span className="course-name">{course}</span>
                      <button
                        type="button"
                        onClick={() => removeCoursework(index)}
                        className="remove-course-btn"
                        title="Remove coursework"
                      >
                        ❌
                      </button>
                    </div>
                  ))}
                </div>

                {formData.coursework.length < 30 && (
                  <div className="add-coursework">
                    <input
                      type="text"
                      value={newCoursework}
                      onChange={(e) => setNewCoursework(e.target.value)}
                      placeholder="Add coursework (e.g., Design and Analysis of Algorithms)..."
                      className="form-input"
                      maxLength={100}
                      onKeyPress={(e) => handleKeyPress(e, addCoursework)}
                    />
                    <button
                      type="button"
                      onClick={addCoursework}
                      disabled={!newCoursework.trim()}
                      className="add-course-btn"
                    >
                      ➕ Add Course
                    </button>
                  </div>
                )}

                {validationErrors.coursework && (
                  <span className="error-text" role="alert">
                    {validationErrors.coursework}
                  </span>
                )}
              </div>

              {/* Achievements Section */}
              <div className="form-section-group">
                <h4 className="section-title">
                  <span className="section-icon">🏆</span>
                  Academic Achievements ({characterCounts.achievementsCount}/20)
                </h4>
                
                <div className="achievements-list">
                  {formData.achievements.map((achievement, index) => (
                    <div key={index} className="achievement-item">
                      <span className="achievement-text">{achievement}</span>
                      <button
                        type="button"
                        onClick={() => removeAchievement(index)}
                        className="remove-achievement-btn"
                        title="Remove achievement"
                      >
                        ❌
                      </button>
                    </div>
                  ))}
                </div>

                {formData.achievements.length < 20 && (
                  <div className="add-achievement">
                    <input
                      type="text"
                      value={newAchievement}
                      onChange={(e) => setNewAchievement(e.target.value)}
                      placeholder="Add achievement (e.g., Dean's List, Magna Cum Laude)..."
                      className="form-input"
                      maxLength={150}
                      onKeyPress={(e) => handleKeyPress(e, addAchievement)}
                    />
                    <button
                      type="button"
                      onClick={addAchievement}
                      disabled={!newAchievement.trim()}
                      className="add-achievement-btn"
                    >
                      ➕ Add Achievement
                    </button>
                  </div>
                )}

                {validationErrors.achievements && (
                  <span className="error-text" role="alert">
                    {validationErrors.achievements}
                  </span>
                )}
              </div>

              {/* Activities Section */}
              <div className="form-section-group">
                <h4 className="section-title">
                  <span className="section-icon">🎯</span>
                  Extracurricular Activities ({characterCounts.activitiesCount}/15)
                </h4>
                
                <div className="activities-list">
                  {formData.activities.map((activity, index) => (
                    <div key={index} className="activity-item">
                      <span className="activity-text">{activity}</span>
                      <button
                        type="button"
                        onClick={() => removeActivity(index)}
                        className="remove-activity-btn"
                        title="Remove activity"
                      >
                        ❌
                      </button>
                    </div>
                  ))}
                </div>

                {formData.activities.length < 15 && (
                  <div className="add-activity">
                    <input
                      type="text"
                      value={newActivity}
                      onChange={(e) => setNewActivity(e.target.value)}
                      placeholder="Add activity (e.g., Computer Science Club, Research Assistant)..."
                      className="form-input"
                      maxLength={100}
                      onKeyPress={(e) => handleKeyPress(e, addActivity)}
                    />
                    <button
                      type="button"
                      onClick={addActivity}
                      disabled={!newActivity.trim()}
                      className="add-activity-btn"
                    >
                      ➕ Add Activity
                    </button>
                  </div>
                )}

                {validationErrors.activities && (
                  <span className="error-text" role="alert">
                    {validationErrors.activities}
                  </span>
                )}
              </div>

              {/* Education Settings Section */}
              <div className="form-section-group">
                <h4 className="section-title">
                  <span className="section-icon">⚙️</span>
                  Education Settings
                </h4>
                
                <div className="form-group">
                  <div className="form-label-wrapper">
                    <label htmlFor="status" className="form-label">
                      Record Status
                    </label>
                  </div>
                  <select
                    id="status"
                    value={formData.status}
                    onChange={(e) => handleInputChange('status', e.target.value)}
                    className="form-select"
                  >
                    <option value="active">Active</option>
                    <option value="draft">Draft</option>
                    <option value="archived">Archived</option>
                  </select>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Preview Section */}
        {uiState.showPreview && (viewMode === 'add' || viewMode === 'edit') && (
          <div className="preview-section">
            <div className="preview-container glass-card">
              <h3 className="preview-title">
                <span className="preview-icon">👁️</span>
                Live Preview
              </h3>
              
              <div className="education-preview">
                <div className="preview-education-card">
                  
                  {/* Preview Header */}
                  <div className="preview-card-header">
                    <div className="preview-institution-logo">
                      {formData.institution_logo_url ? (
                        <img 
                          src={formData.institution_logo_url}
                          alt="Institution Logo"
                          className="preview-logo"
                          onError={(e) => {
                            e.target.style.display = 'none';
                            e.target.nextElementSibling.style.display = 'flex';
                          }}
                        />
                      ) : null}
                      
                      <div 
                        className="preview-logo-temp"
                        style={{ display: formData.institution_logo_url ? 'none' : 'flex' }}
                      >
                        {(formData.institution || formData.college || 'EDU').substring(0, 3).toUpperCase()}
                      </div>
                    </div>

                    <div className="preview-status-indicators">
                      {formData.education_status && (
                        <div className="preview-status-badge">
                          <span className="badge-text">{formData.education_status}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Preview Title */}
                  <div className="preview-title-section">
                    <h3 className="preview-degree-title">
                      {formData.degree || 'Degree Name'}
                    </h3>
                    <div className="preview-title-underline"></div>
                  </div>

                  {/* Preview Institution Info */}
                  <div className="preview-institution-section">
                    <h4 className="preview-institution-name">
                      {formData.institution || formData.college || 'Institution Name'}
                    </h4>
                    {formData.college && formData.institution && (
                      <p className="preview-college-name">{formData.college}</p>
                    )}
                    {formData.location && (
                      <p className="preview-location">📍 {formData.location}</p>
                    )}
                  </div>

                  {/* Preview Meta */}
                  <div className="preview-meta-section">
                    <div className="preview-meta-row">
                      <div className="preview-meta-item">
                        <span className="meta-label">Level</span>
                        <span className="meta-value">{formData.education_level || 'General'}</span>
                      </div>
                      <div className="preview-meta-item">
                        <span className="meta-label">Type</span>
                        <span className="meta-value">{formData.degree_type || 'N/A'}</span>
                      </div>
                    </div>
                    <div className="preview-meta-row">
                      <div className="preview-meta-item">
                        <span className="meta-label">Duration</span>
                        <span className="meta-value">
                          {formData.start_date && formData.end_date 
                            ? `${new Date(formData.start_date).getFullYear()} - ${new Date(formData.end_date).getFullYear()}`
                            : 'N/A'
                          }
                        </span>
                      </div>
                      <div className="preview-meta-item">
                        <span className="meta-label">Status</span>
                        <span className="meta-value status">{formData.education_status}</span>
                      </div>
                    </div>
                    {(formData.gpa_received && formData.max_gpa_scale) && (
                      <div className="preview-meta-row">
                        <div className="preview-meta-item full-width">
                          <span className="meta-label">
                            {getGradeType(formData.max_gpa_scale)}
                          </span>
                          <span className="meta-value gpa">
                            {formatGradeDisplay(formData.gpa_received, formData.max_gpa_scale)}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Preview Description */}
                  {formData.description && (
                    <div className="preview-description-section">
                      <p className="preview-description-text">
                        {formData.description}
                      </p>
                    </div>
                  )}

                  {/* Preview Academic Details */}
                  <div className="preview-academic-section">
                    {formData.major && (
                      <div className="preview-academic-item">
                        <span className="academic-label">Major:</span>
                        <span className="academic-value">{formData.major}</span>
                      </div>
                    )}
                    {formData.minor && (
                      <div className="preview-academic-item">
                        <span className="academic-label">Minor:</span>
                        <span className="academic-value">{formData.minor}</span>
                      </div>
                    )}
                    {formData.thesis_title && (
                      <div className="preview-academic-item">
                        <span className="academic-label">Thesis:</span>
                        <span className="academic-value">{formData.thesis_title}</span>
                      </div>
                    )}
                  </div>

                  {/* Preview Detailed Information */}
                  <div className="preview-detailed-section">
                    <h4 className="preview-section-title">Education Details</h4>
                    
                    {formData.coursework.length > 0 && (
                      <div className="preview-detail-group">
                        <div className="preview-detail-header">
                          <span className="detail-icon">📖</span>
                          <span className="detail-title">Relevant Coursework ({formData.coursework.length})</span>
                        </div>
                        <div className="preview-coursework-grid">
                          {formData.coursework.slice(0, 6).map((course, index) => (
                            <span key={index} className="preview-course-tag">
                              {course}
                            </span>
                          ))}
                          {formData.coursework.length > 6 && (
                            <span className="preview-course-tag course-more">
                              +{formData.coursework.length - 6}
                            </span>
                          )}
                        </div>
                      </div>
                    )}

                    {formData.achievements.length > 0 && (
                      <div className="preview-detail-group">
                        <div className="preview-detail-header">
                          <span className="detail-icon">🏆</span>
                          <span className="detail-title">Academic Achievements ({formData.achievements.length})</span>
                        </div>
                        <ul className="preview-achievements-list">
                          {formData.achievements.map((achievement, index) => (
                            <li key={index} className="preview-achievement-item">
                              <span className="achievement-bullet">▸</span>
                              <span className="achievement-text">{achievement}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {formData.activities.length > 0 && (
                      <div className="preview-detail-group">
                        <div className="preview-detail-header">
                          <span className="detail-icon">🎯</span>
                          <span className="detail-title">Extracurricular Activities ({formData.activities.length})</span>
                        </div>
                        <div className="preview-activities-grid">
                          {formData.activities.map((activity, index) => (
                            <span key={index} className="preview-activity-tag">
                              {activity}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Preview Status */}
              <div className="preview-status">
                <span className={`status-indicator ${formData.status}`}>
                  {formData.status === 'active' && '🟢 Active'}
                  {formData.status === 'draft' && '🟡 Draft'}
                  {formData.status === 'archived' && '🔴 Archived'}
                </span>
                <span className="education-status-indicator">
                  📊 {formData.education_status}
                </span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default EducationManager;