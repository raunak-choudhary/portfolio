// src/components/admin/AdminDashboard/sections/WorkExperienceManager.js - PART 1 OF 3

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useSupabase } from '../../../../hooks/useSupabase';
import LoadingSpinner from '../../../common/LoadingSpinner';
import './WorkExperienceManager.css';
import { triggerPublicRefresh } from '../../../../services/adminDataService';

const WorkExperienceManager = () => {
  // ============================================================================
  // DATA FETCHING WITH OPTIMIZED useSupabase HOOK
  // ============================================================================
  
  const { 
    data: workExperienceData, 
    loading: dataLoading, 
    error: dataError,
    refetch 
  } = useSupabase('work_experience', {}, { 
    orderBy: [
      { column: 'is_current', ascending: false }, // Current jobs first
      { column: 'start_date', ascending: false }
    ],
    cacheKey: 'work-experience-admin'
  });

  // ============================================================================
  // STATE MANAGEMENT - ORGANIZED AND OPTIMIZED
  // ============================================================================
  
  // View state management
  const [viewMode, setViewMode] = useState('list'); // 'list', 'add', 'edit'
  const [selectedWorkExperience, setSelectedWorkExperience] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterEmploymentType, setFilterEmploymentType] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');

  // Form state with proper initial values
  const [formData, setFormData] = useState({
    job_number: '',
    title: '',
    company: '',
    company_logo_url: '',
    employment_type: '',
    start_date: '',
    end_date: '',
    location: '',
    is_current: false,
    description: '',
    key_responsibilities: [],
    achievements: [],
    technologies: [],
    team_size: '',
    clients_served: [],
    salary_range: '',
    department: '',
    performance_rating: '',
    reason_for_leaving: '',
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
  const [newResponsibility, setNewResponsibility] = useState('');
  const [newAchievement, setNewAchievement] = useState('');
  const [newTechnology, setNewTechnology] = useState('');
  const [newClient, setNewClient] = useState('');

  // File upload state
  const [logoUploading, setLogoUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  // Delete confirmation modal state
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [workExperienceToDelete, setWorkExperienceToDelete] = useState(null);

  // Employment type options
  const employmentTypes = useMemo(() => [
    'Full-time',
    'Part-time',
    'Contract',
    'Freelance',
    'Internship',
    'Temporary',
    'Remote',
    'Hybrid'
  ], []);

  // Performance rating options
  const performanceRatings = [
    'Exceeds Expectations',
    'Meets Expectations',
    'Below Expectations',
    'Outstanding',
    'Excellent',
    'Good',
    'Satisfactory',
    'Needs Improvement',
    'Top 5%',
    'Top 10%',
    'Top 25%'
  ];

  // ============================================================================
  // MEMOIZED VALUES FOR PERFORMANCE
  // ============================================================================
  
  const characterCounts = useMemo(() => ({
    title: formData.title.length,
    company: formData.company.length,
    location: formData.location.length,
    description: formData.description.length,
    department: formData.department.length,
    salaryRange: formData.salary_range.length,
    reasonForLeaving: formData.reason_for_leaving.length,
    responsibilitiesCount: formData.key_responsibilities.length,
    achievementsCount: formData.achievements.length,
    technologiesCount: formData.technologies.length,
    clientsCount: formData.clients_served.length
  }), [formData]);

  const filteredWorkExperience = useMemo(() => {
    if (!workExperienceData) return [];
    
    return workExperienceData.filter(work => {
      const matchesSearch = work.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                           work.company?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                           work.location?.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesEmploymentType = filterEmploymentType === 'all' || work.employment_type === filterEmploymentType;
      const matchesStatus = filterStatus === 'all' || work.status === filterStatus;
      
      return matchesSearch && matchesEmploymentType && matchesStatus;
    });
  }, [workExperienceData, searchTerm, filterEmploymentType, filterStatus]);

  const employmentTypesInData = useMemo(() => {
    if (!workExperienceData) return [];
    return [...new Set(workExperienceData.map(w => w.employment_type).filter(Boolean))];
  }, [workExperienceData]);

  const hasUnsavedChanges = useMemo(() => {
    if (viewMode === 'list') return false;
    if (!selectedWorkExperience && viewMode === 'edit') return false;
    
    if (viewMode === 'add') {
      return formData.title.trim() !== '' || 
             formData.company.trim() !== '' ||
             formData.location.trim() !== '' ||
             formData.key_responsibilities.length > 0 ||
             formData.achievements.length > 0 ||
             formData.technologies.length > 0 ||
             formData.clients_served.length > 0;
    }

    if (viewMode === 'edit' && selectedWorkExperience) {
      return (
        formData.job_number !== (selectedWorkExperience.job_number || '') ||
        formData.title !== (selectedWorkExperience.title || '') ||
        formData.company !== (selectedWorkExperience.company || '') ||
        formData.employment_type !== (selectedWorkExperience.employment_type || '') ||
        formData.start_date !== (selectedWorkExperience.start_date || '') ||
        formData.end_date !== (selectedWorkExperience.end_date || '') ||
        formData.location !== (selectedWorkExperience.location || '') ||
        formData.is_current !== (selectedWorkExperience.is_current || false) ||
        formData.description !== (selectedWorkExperience.description || '') ||
        formData.team_size !== (selectedWorkExperience.team_size || '') ||
        formData.salary_range !== (selectedWorkExperience.salary_range || '') ||
        formData.department !== (selectedWorkExperience.department || '') ||
        formData.performance_rating !== (selectedWorkExperience.performance_rating || '') ||
        formData.reason_for_leaving !== (selectedWorkExperience.reason_for_leaving || '') ||
        formData.status !== (selectedWorkExperience.status || 'active') ||
        JSON.stringify(formData.key_responsibilities) !== JSON.stringify(selectedWorkExperience.key_responsibilities || []) ||
        JSON.stringify(formData.achievements) !== JSON.stringify(selectedWorkExperience.achievements || []) ||
        JSON.stringify(formData.technologies) !== JSON.stringify(selectedWorkExperience.technologies || []) ||
        JSON.stringify(formData.clients_served) !== JSON.stringify(selectedWorkExperience.clients_served || [])
      );
    }

    return uiState.hasChanges;
  }, [formData, selectedWorkExperience, viewMode, uiState.hasChanges]);

  // ============================================================================
  // EFFECT HOOKS - OPTIMIZED DATA LOADING
  // ============================================================================
  
  // Load data into form when editing work experience
  useEffect(() => {
    if (viewMode === 'edit' && selectedWorkExperience) {
      const newFormData = {
        job_number: selectedWorkExperience.job_number || '',
        title: selectedWorkExperience.title || '',
        company: selectedWorkExperience.company || '',
        company_logo_url: selectedWorkExperience.company_logo_url || '',
        employment_type: selectedWorkExperience.employment_type || '',
        start_date: selectedWorkExperience.start_date || '',
        end_date: selectedWorkExperience.end_date || '',
        location: selectedWorkExperience.location || '',
        is_current: selectedWorkExperience.is_current || false,
        description: selectedWorkExperience.description || '',
        key_responsibilities: Array.isArray(selectedWorkExperience.key_responsibilities) ? [...selectedWorkExperience.key_responsibilities] : [],
        achievements: Array.isArray(selectedWorkExperience.achievements) ? [...selectedWorkExperience.achievements] : [],
        technologies: Array.isArray(selectedWorkExperience.technologies) ? [...selectedWorkExperience.technologies] : [],
        team_size: selectedWorkExperience.team_size || '',
        clients_served: Array.isArray(selectedWorkExperience.clients_served) ? [...selectedWorkExperience.clients_served] : [],
        salary_range: selectedWorkExperience.salary_range || '',
        department: selectedWorkExperience.department || '',
        performance_rating: selectedWorkExperience.performance_rating || '',
        reason_for_leaving: selectedWorkExperience.reason_for_leaving || '',
        order_index: selectedWorkExperience.order_index,
        status: selectedWorkExperience.status || 'active'
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
  }, [viewMode, selectedWorkExperience]);

  // Reset form when switching to add mode
  useEffect(() => {
    if (viewMode === 'add') {
      setFormData({
        job_number: '',
        title: '',
        company: '',
        company_logo_url: '',
        employment_type: '',
        start_date: '',
        end_date: '',
        location: '',
        is_current: false,
        description: '',
        key_responsibilities: [],
        achievements: [],
        technologies: [],
        team_size: '',
        clients_served: [],
        salary_range: '',
        department: '',
        performance_rating: '',
        reason_for_leaving: '',
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
      
      // If setting is_current to true, clear end_date
      if (field === 'is_current' && value === true) {
        newData.end_date = '';
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

  const addResponsibility = useCallback(() => {
    const trimmedResponsibility = newResponsibility.trim();
    
    if (trimmedResponsibility && 
        trimmedResponsibility.length <= 200 && 
        formData.key_responsibilities.length < 50 &&
        !formData.key_responsibilities.includes(trimmedResponsibility)) {
      
      const updatedResponsibilities = [...formData.key_responsibilities, trimmedResponsibility];
      handleInputChange('key_responsibilities', updatedResponsibilities);
      setNewResponsibility('');
    }
  }, [newResponsibility, formData.key_responsibilities, handleInputChange]);

  const removeResponsibility = useCallback((index) => {
    const updatedResponsibilities = formData.key_responsibilities.filter((_, i) => i !== index);
    handleInputChange('key_responsibilities', updatedResponsibilities);
  }, [formData.key_responsibilities, handleInputChange]);

  const addAchievement = useCallback(() => {
    const trimmedAchievement = newAchievement.trim();
    
    if (trimmedAchievement && 
        trimmedAchievement.length <= 200 && 
        formData.achievements.length < 30 &&
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

  const addTechnology = useCallback(() => {
    const trimmedTechnology = newTechnology.trim();
    
    if (trimmedTechnology && 
        trimmedTechnology.length <= 50 && 
        formData.technologies.length < 40 &&
        !formData.technologies.includes(trimmedTechnology)) {
      
      const updatedTechnologies = [...formData.technologies, trimmedTechnology];
      handleInputChange('technologies', updatedTechnologies);
      setNewTechnology('');
    }
  }, [newTechnology, formData.technologies, handleInputChange]);

  const removeTechnology = useCallback((index) => {
    const updatedTechnologies = formData.technologies.filter((_, i) => i !== index);
    handleInputChange('technologies', updatedTechnologies);
  }, [formData.technologies, handleInputChange]);

  const addClient = useCallback(() => {
    const trimmedClient = newClient.trim();
    
    if (trimmedClient && 
        trimmedClient.length <= 100 && 
        formData.clients_served.length < 25 &&
        !formData.clients_served.includes(trimmedClient)) {
      
      const updatedClients = [...formData.clients_served, trimmedClient];
      handleInputChange('clients_served', updatedClients);
      setNewClient('');
    }
  }, [newClient, formData.clients_served, handleInputChange]);

  const removeClient = useCallback((index) => {
    const updatedClients = formData.clients_served.filter((_, i) => i !== index);
    handleInputChange('clients_served', updatedClients);
  }, [formData.clients_served, handleInputChange]);

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
      const companyName = formData.company || 'company';
      const sanitizedName = companyName.toLowerCase().replace(/[^a-z0-9]/g, '-');
      const fileName = `${sanitizedName}-logo-${timestamp}.${fileExtension}`;
      const filePath = `work/${fileName}`;

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
      handleInputChange('company_logo_url', urlData.publicUrl);

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
  }, [formData.company, handleInputChange]);

  const removeLogo = useCallback(() => {
    handleInputChange('company_logo_url', '');
  }, [handleInputChange]);

  // ============================================================================
  // DURATION FORMATTING UTILITIES
  // ============================================================================
  
  const formatWorkDuration = useCallback((startDate, endDate, isCurrent) => {
    if (!startDate) return 'N/A';
    
    try {
      const start = new Date(startDate);
      const end = isCurrent ? new Date() : new Date(endDate);
      
      if (!end || isNaN(end.getTime())) return 'N/A';
      
      const diffTime = Math.abs(end - start);
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      const diffMonths = Math.round(diffDays / 30);
      const diffYears = Math.floor(diffMonths / 12);
      const remainingMonths = diffMonths % 12;
      
      if (diffYears > 0) {
        if (remainingMonths > 0) {
          return `${diffYears} year${diffYears > 1 ? 's' : ''} ${remainingMonths} month${remainingMonths > 1 ? 's' : ''}`;
        }
        return `${diffYears} year${diffYears > 1 ? 's' : ''}`;
      }
      
      if (diffMonths > 0) {
        return `${diffMonths} month${diffMonths > 1 ? 's' : ''}`;
      }
      
      return `${diffDays} day${diffDays > 1 ? 's' : ''}`;
    } catch (error) {
      return 'N/A';
    }
  }, []);

  // ============================================================================
  // FORM VALIDATION - COMPREHENSIVE AND OPTIMIZED
  // ============================================================================
  
  const validateForm = useCallback(() => {
    const errors = {};

    // Title validation (required, 3-200 chars)
    const titleTrimmed = formData.title.trim();
    if (!titleTrimmed) {
      errors.title = 'Job title is required';
    } else if (titleTrimmed.length < 3) {
      errors.title = 'Job title must be at least 3 characters';
    } else if (titleTrimmed.length > 200) {
      errors.title = 'Job title must be less than 200 characters';
    }

    // Company validation (required, 2-200 chars)
    const companyTrimmed = formData.company.trim();
    if (!companyTrimmed) {
      errors.company = 'Company name is required';
    } else if (companyTrimmed.length < 2) {
      errors.company = 'Company name must be at least 2 characters';
    } else if (companyTrimmed.length > 200) {
      errors.company = 'Company name must be less than 200 characters';
    }

    // Location validation (optional, max 100 chars)
    if (formData.location && formData.location.length > 100) {
      errors.location = 'Location must be less than 100 characters';
    }

    // Description validation (optional, max 2000 chars)
    if (formData.description && formData.description.length > 2000) {
      errors.description = 'Description must be less than 2000 characters';
    }

    // Department validation (optional, max 100 chars)
    if (formData.department && formData.department.length > 100) {
      errors.department = 'Department must be less than 100 characters';
    }

    // Salary range validation (optional, max 50 chars)
    if (formData.salary_range && formData.salary_range.length > 50) {
      errors.salary_range = 'Salary range must be less than 50 characters';
    }

    // Reason for leaving validation (optional, max 500 chars)
    if (formData.reason_for_leaving && formData.reason_for_leaving.length > 500) {
      errors.reason_for_leaving = 'Reason for leaving must be less than 500 characters';
    }

    // Date validation
    if (formData.start_date && formData.end_date && !formData.is_current) {
      const startDate = new Date(formData.start_date);
      const endDate = new Date(formData.end_date);
      
      if (startDate >= endDate) {
        errors.end_date = 'End date must be after start date';
      }
    }

    // Team size validation
    if (formData.team_size && (isNaN(formData.team_size) || parseInt(formData.team_size) < 0)) {
      errors.team_size = 'Team size must be a positive number';
    }

    // Arrays validation
    if (formData.key_responsibilities.length > 50) {
      errors.key_responsibilities = 'Maximum 50 responsibilities allowed';
    }

    if (formData.achievements.length > 30) {
      errors.achievements = 'Maximum 30 achievements allowed';
    }

    if (formData.technologies.length > 40) {
      errors.technologies = 'Maximum 40 technologies allowed';
    }

    if (formData.clients_served.length > 25) {
      errors.clients_served = 'Maximum 25 clients allowed';
    }

    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  }, [formData]);

  // ============================================================================
  // SAVE OPERATION - FOLLOWING EDUCATION MANAGER PATTERN
  // ============================================================================
  
  const handleSave = useCallback(async () => {
    console.log('🚀 Starting Work Experience save process...');
    
    if (!validateForm()) {
      console.log('❌ Form validation failed');
      setUiState(prev => ({ ...prev, saveStatus: 'error' }));
      return;
    }

    setUiState(prev => ({ ...prev, isSaving: true, saveStatus: null }));

    try {
      // Prepare data for saving
      const saveData = {
        job_number: formData.job_number ? parseInt(formData.job_number) : null,
        title: formData.title.trim(),
        company: formData.company.trim(),
        company_logo_url: formData.company_logo_url || null,
        employment_type: formData.employment_type || null,
        start_date: formData.start_date || null,
        end_date: formData.is_current ? null : formData.end_date || null,
        location: formData.location.trim() || null,
        is_current: formData.is_current,
        description: formData.description.trim() || null,
        key_responsibilities: formData.key_responsibilities,
        achievements: formData.achievements,
        technologies: formData.technologies,
        team_size: formData.team_size ? parseInt(formData.team_size) : null,
        clients_served: formData.clients_served,
        salary_range: formData.salary_range.trim() || null,
        department: formData.department.trim() || null,
        performance_rating: formData.performance_rating || null,
        reason_for_leaving: formData.reason_for_leaving.trim() || null,
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
      
      if (viewMode === 'edit' && selectedWorkExperience?.id) {
        // Update existing work experience
        console.log('🔄 Updating existing work experience with ID:', selectedWorkExperience.id);
        const { data, error } = await supabaseAdmin
          .from('work_experience')
          .update({
            ...saveData,
            updated_at: new Date().toISOString()
          })
          .eq('id', selectedWorkExperience.id)
          .select()
          .single();
          
        console.log('✏️ Update operation result:', data);
        console.log('❌ Update error (if any):', error);
          
        if (error) {
          console.error('💥 Update error details:', error);
          throw new Error(`Failed to update work experience: ${error.message}`);
        }
        
        result = { success: true, data };
      } else {
        // Create new work experience
        console.log('➕ Creating new work experience');
        const { data, error } = await supabaseAdmin
          .from('work_experience')
          .insert([saveData])
          .select()
          .single();
          
        console.log('➕ Insert operation result:', data);
        console.log('❌ Insert error (if any):', error);
          
        if (error) {
          console.error('💥 Insert error details:', error);
          throw new Error(`Failed to create work experience: ${error.message}`);
        }
        
        result = { success: true, data };
      }
      
      console.log('📥 Final save result:', result);

      if (result && result.success) {
        console.log('✅ Save successful');

        triggerPublicRefresh('work_experience');
        
        // Set success status immediately
        setUiState(prev => ({ 
          ...prev, 
          saveStatus: 'success',
          hasChanges: false,
          isPostSave: true
        }));

        // If this was a new work experience, switch to list view after save
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
        throw new Error(result?.error || result?.message || 'Failed to save work experience');
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
  }, [formData, selectedWorkExperience, viewMode, validateForm, refetch]);

  // ============================================================================
  // UI ACTIONS - OPTIMIZED EVENT HANDLERS
  // ============================================================================
  
  const handleAddNew = useCallback(() => {
    if (hasUnsavedChanges && viewMode !== 'list') {
      if (!window.confirm('You have unsaved changes. Are you sure you want to start a new work experience entry? Changes will be lost.')) {
        return;
      }
    }
    setViewMode('add');
    setSelectedWorkExperience(null);
  }, [hasUnsavedChanges, viewMode]);

  const handleEdit = useCallback((workExperience) => {
    if (hasUnsavedChanges && viewMode !== 'list' && selectedWorkExperience?.id !== workExperience.id) {
      if (!window.confirm('You have unsaved changes. Are you sure you want to edit a different work experience? Changes will be lost.')) {
        return;
      }
    }
    setSelectedWorkExperience(workExperience);
    setViewMode('edit');
  }, [hasUnsavedChanges, viewMode, selectedWorkExperience]);

  const handleCancel = useCallback(() => {
    if (hasUnsavedChanges) {
      if (!window.confirm('You have unsaved changes. Are you sure you want to cancel? Changes will be lost.')) {
        return;
      }
    }
    setViewMode('list');
    setSelectedWorkExperience(null);
    setValidationErrors({});
    setNewResponsibility('');
    setNewAchievement('');
    setNewTechnology('');
    setNewClient('');
    setUiState(prev => ({
      ...prev,
      hasChanges: false,
      saveStatus: null,
      isPostSave: false
    }));
  }, [hasUnsavedChanges]);

  const handleDelete = useCallback((workExperience) => {
    setWorkExperienceToDelete(workExperience);
    setShowDeleteModal(true);
  }, []);

  const confirmDeleteAction = useCallback(async () => {
    if (!workExperienceToDelete) return;

    try {
      const { createClient } = await import('@supabase/supabase-js');
      const supabaseAdmin = createClient(
        process.env.REACT_APP_SUPABASE_URL,
        process.env.REACT_APP_SUPABASE_SERVICE_ROLE_KEY
      );

      const { error } = await supabaseAdmin
        .from('work_experience')
        .delete()
        .eq('id', workExperienceToDelete.id);

      if (error) {
        throw new Error(`Failed to delete work experience: ${error.message}`);
      }

      triggerPublicRefresh('work_experience');
      setUiState(prev => ({ 
        ...prev, 
        saveStatus: 'success',
        statusMessageContent: `Work experience "${workExperienceToDelete.title}" at "${workExperienceToDelete.company}" has been deleted.`
      }));
      refetch();

    } catch (error) {
      console.error('Delete error:', error);
      setUiState(prev => ({ 
        ...prev, 
        saveStatus: 'error',
        statusMessageContent: `Error deleting work experience: ${error.message}`
      }));
    } finally {
      setShowDeleteModal(false);
      setWorkExperienceToDelete(null);
    }
  }, [workExperienceToDelete, refetch]);

  const cancelDeleteAction = useCallback(() => {
    setShowDeleteModal(false);
    setWorkExperienceToDelete(null);
  }, []);

  const togglePreview = useCallback(() => {
    setUiState(prev => ({ ...prev, showPreview: !prev.showPreview }));
  }, []);

  // ============================================================================
  // LOADING STATE - STANDARDIZED PHASE 3 PATTERN
  // ============================================================================
  
  if (dataLoading && !workExperienceData) {
    return (
      <div className="workexmgr-loading">
        <LoadingSpinner size="large" />
        <p>Loading work experience records...</p>
      </div>
    );
  }

  // ============================================================================
  // RENDER - OPTIMIZED JSX STRUCTURE
  // ============================================================================
  
  return (
    <div className="workexmgr-content-manager">
      {/* Header Section */}
      <div className="workexmgr-manager-header">
        <div className="workexmgr-header-content">
          <h2 className="workexmgr-manager-title">
            <span className="workexmgr-title-icon">💼</span>
            Work Experience Management
          </h2>
          <p className="workexmgr-manager-subtitle">
            Manage your professional work history and achievements
          </p>
        </div>

        <div className="workexmgr-header-actions">
          {viewMode === 'list' ? (
            <>
              <button
                className="workexmgr-action-btn workexmgr-add-btn workexmgr-primary"
                onClick={handleAddNew}
                title="Add New Work Experience"
                type="button"
              >
                <span className="workexmgr-btn-icon">➕</span>
                Add Work Experience
              </button>
            </>
          ) : (
            <>
              <button
                className="workexmgr-action-btn workexmgr-preview-btn"
                onClick={togglePreview}
                title="Toggle Preview"
                type="button"
              >
                <span className="workexmgr-btn-icon">👁️</span>
                {uiState.showPreview ? 'Hide Preview' : 'Show Preview'}
              </button>
              <div className="workexmgr-edit-actions">
                <button
                  className="workexmgr-action-btn workexmgr-cancel-btn"
                  onClick={handleCancel}
                  disabled={uiState.isSaving}
                  title="Cancel Changes"
                  type="button"
                >
                  <span className="workexmgr-btn-icon">❌</span>
                  Cancel
                </button>
                <button
                  className="workexmgr-action-btn workexmgr-save-btn workexmgr-primary"
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
                      <span className="workexmgr-btn-icon">💾</span>
                      Save Work Experience
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
        <div className={`workexmgr-status-message ${uiState.saveStatus}`} role="alert">
          {uiState.saveStatus === 'success' && (
            <>
              <span className="workexmgr-status-icon">✅</span>
              <div className="workexmgr-status-content">
                <strong>Success!</strong> 
                {uiState.statusMessageContent || 'Work experience has been saved successfully and is now live on your portfolio.'}
              </div>
            </>
          )}
          {uiState.saveStatus === 'error' && (
            <>
              <span className="workexmgr-status-icon">❌</span>
              <div className="workexmgr-status-content">
                <strong>Error!</strong> 
                {uiState.statusMessageContent || 'Failed to save work experience. Please check your connection and try again.'}
              </div>
            </>
          )}
        </div>
      )}

      {/* Data Error */}
      {dataError && (
        <div className="workexmgr-status-message workexmgr-error" role="alert">
          <span className="workexmgr-status-icon">⚠️</span>
          Error loading work experience: {
            typeof dataError === 'string' ? dataError : dataError.message || 'Unknown error'
          }
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteModal && workExperienceToDelete && (
        <div className="workexmgr-modal-overlay">
          <div className="workexmgr-modal-content workexmgr-glass-card">
            <h3 className="workexmgr-modal-title">
              <span className="workexmgr-modal-icon">🗑️</span> Confirm Deletion
            </h3>
            <p className="workexmgr-modal-text">
              Are you sure you want to delete the work experience: <strong>"{workExperienceToDelete.title}"</strong> 
              at <strong>"{workExperienceToDelete.company}"</strong>? This action cannot be undone.
            </p>
            <div className="workexmgr-modal-actions">
              <button
                type="button"
                className="workexmgr-action-btn workexmgr-cancel-btn"
                onClick={cancelDeleteAction}
              >
                <span className="workexmgr-btn-icon">❌</span> Cancel
              </button>
              <button
                type="button"
                className="workexmgr-action-btn workexmgr-delete-btn-confirm workexmgr-primary"
                onClick={confirmDeleteAction}
              >
                <span className="workexmgr-btn-icon">🗑️</span> Delete Work Experience
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className={`workexmgr-manager-content ${uiState.showPreview ? 'workexmgr-with-preview' : ''}`}>
        
        {/* LIST VIEW */}
        {viewMode === 'list' && (
          <div className="workexmgr-list-section">
            <div className="workexmgr-list-container workexmgr-glass-card">
              
              {/* Search and Filters */}
              <div className="workexmgr-list-controls">
                <div className="workexmgr-search-section">
                  <div className="workexmgr-search-wrapper">
                    <span className="workexmgr-search-icon">🔍</span>
                    <input
                      type="text"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      placeholder="Search work experience by title, company, or location..."
                      className="workexmgr-search-input"
                    />
                  </div>
                </div>
                
                <div className="workexmgr-filters-section">
                  <select
                    value={filterEmploymentType}
                    onChange={(e) => setFilterEmploymentType(e.target.value)}
                    className="workexmgr-filter-select"
                  >
                    <option value="all">All Employment Types</option>
                    {employmentTypesInData.map(type => (
                      <option key={type} value={type}>{type}</option>
                    ))}
                  </select>
                  
                  <select
                    value={filterStatus}
                    onChange={(e) => setFilterStatus(e.target.value)}
                    className="workexmgr-filter-select"
                  >
                    <option value="all">All Status</option>
                    <option value="active">Active</option>
                    <option value="draft">Draft</option>
                    <option value="archived">Archived</option>
                  </select>
                </div>
              </div>

              {/* Work Experience Table */}
              <div className="workexmgr-table-wrapper">
                {filteredWorkExperience.length === 0 ? (
                  <div className="workexmgr-no-data-message">
                    <div className="workexmgr-no-data-icon">💼</div>
                    <h3>No Work Experience Records Found</h3>
                    <p>
                      {workExperienceData?.length === 0 
                        ? 'No work experience records have been created yet. Click "Add Work Experience" to get started.'
                        : 'No work experience records match your current filters. Try adjusting your search criteria.'
                      }
                    </p>
                  </div>
                ) : (
                  <table className="workexmgr-table">
                    <thead>
                      <tr>
                        <th>Job Title</th>
                        <th>Company</th>
                        <th>Duration</th>
                        <th>Location</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredWorkExperience.map((work, index) => (
                        <tr key={work.id || index} className="workexmgr-table-row">
                          <td className="workexmgr-job-title">
                            <div className="workexmgr-title-content">
                              <h4 className="workexmgr-title-text">{work.title}</h4>
                              {work.is_current && (
                                <span className="workexmgr-current-badge">
                                  🟢 Current Position
                                </span>
                              )}
                            </div>
                          </td>
                          
                          <td className="workexmgr-company">
                            <span className="workexmgr-company-name">{work.company}</span>
                          </td>
                          
                          <td className="workexmgr-duration">
                            {work.start_date ? (
                              <div className="workexmgr-duration-content">
                                <span className="workexmgr-duration-dates">
                                  {new Date(work.start_date).toLocaleDateString('en-US', { 
                                    year: 'numeric', 
                                    month: 'short' 
                                  })} - {work.is_current ? 'Present' : 
                                    work.end_date ? new Date(work.end_date).toLocaleDateString('en-US', { 
                                      year: 'numeric', 
                                      month: 'short' 
                                    }) : 'N/A'
                                  }
                                </span>
                                <span className="workexmgr-duration-calculated">
                                  {formatWorkDuration(work.start_date, work.end_date, work.is_current)}
                                </span>
                              </div>
                            ) : (
                              <span className="workexmgr-duration-na">N/A</span>
                            )}
                          </td>
                          
                          <td className="workexmgr-location">
                            <span className="workexmgr-location-text">
                              {work.location || 'N/A'}
                            </span>
                          </td>
                          
                          <td className="workexmgr-actions">
                            <div className="workexmgr-action-buttons">
                              <button
                                className="workexmgr-action-btn-mini workexmgr-edit-btn"
                                onClick={() => handleEdit(work)}
                                title="Edit Work Experience"
                              >
                                ✏️
                              </button>
                              <button
                                className="workexmgr-action-btn-mini workexmgr-delete-btn"
                                onClick={() => handleDelete(work)}
                                title="Delete Work Experience"
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
              
              {/* Work Experience Summary */}
              {workExperienceData && workExperienceData.length > 0 && (
                <div className="workexmgr-summary">
                  <div className="workexmgr-summary-stats">
                    <span className="workexmgr-stat-item">
                      <strong>{workExperienceData.length}</strong> total work experiences
                    </span>
                    <span className="workexmgr-stat-item">
                      <strong>{workExperienceData.filter(w => w.is_current).length}</strong> current positions
                    </span>
                    <span className="workexmgr-stat-item">
                      <strong>{workExperienceData.filter(w => !w.is_current).length}</strong> past positions
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* FORM VIEW (ADD/EDIT) */}
        {(viewMode === 'add' || viewMode === 'edit') && (
          <div className="workexmgr-form-section">
            <div className="workexmgr-form-container workexmgr-glass-card">
              
              {/* Form Title */}
              <div className="workexmgr-form-title-section">
                <h3 className="workexmgr-form-title">
                  {viewMode === 'add' ? 'Add New Work Experience' : `Edit: ${selectedWorkExperience?.title}`}
                </h3>
                <p className="workexmgr-form-subtitle">
                  {viewMode === 'add' 
                    ? 'Create a new work experience entry for your portfolio'
                    : 'Update work experience information and details'
                  }
                </p>
              </div>

              {/* Basic Information Section */}
              <div className="workexmgr-form-section-group">
                <h4 className="workexmgr-section-title">
                  <span className="workexmgr-section-icon">📋</span>
                  Basic Information
                </h4>
                
                <div className="workexmgr-form-row">
                  <div className="workexmgr-form-group">
                    <div className="workexmgr-form-label-wrapper">
                      <label htmlFor="workexmgr-job-number" className="workexmgr-form-label">
                        Job Number
                      </label>
                    </div>
                    <input
                      id="workexmgr-job-number"
                      type="number"
                      value={formData.job_number}
                      onChange={(e) => handleInputChange('job_number', e.target.value)}
                      className="workexmgr-form-input"
                      placeholder="e.g., 1"
                      min="1"
                    />
                  </div>

                  <div className="workexmgr-form-group">
                    <div className="workexmgr-form-label-wrapper">
                      <label htmlFor="workexmgr-employment-type" className="workexmgr-form-label">
                        Employment Type
                      </label>
                    </div>
                    <select
                      id="workexmgr-employment-type"
                      value={formData.employment_type}
                      onChange={(e) => handleInputChange('employment_type', e.target.value)}
                      className="workexmgr-form-select"
                    >
                      <option value="">Select Employment Type</option>
                      {employmentTypes.map(type => (
                        <option key={type} value={type}>{type}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="workexmgr-form-group">
                  <div className="workexmgr-form-label-wrapper">
                    <label htmlFor="workexmgr-title" className="workexmgr-form-label workexmgr-required">
                      Job Title
                    </label>
                    <span className="workexmgr-char-count">
                      {characterCounts.title}/200
                    </span>
                  </div>
                  <input
                    id="workexmgr-title"
                    type="text"
                    value={formData.title}
                    onChange={(e) => handleInputChange('title', e.target.value)}
                    className={`workexmgr-form-input ${validationErrors.title ? 'workexmgr-error' : ''}`}
                    placeholder="e.g., Senior Software Engineer"
                    maxLength={200}
                    aria-describedby={validationErrors.title ? 'workexmgr-title-error' : undefined}
                  />
                  {validationErrors.title && (
                    <span id="workexmgr-title-error" className="workexmgr-error-text" role="alert">
                      {validationErrors.title}
                    </span>
                  )}
                </div>

                <div className="workexmgr-form-group">
                  <div className="workexmgr-form-label-wrapper">
                    <label htmlFor="workexmgr-company" className="workexmgr-form-label workexmgr-required">
                      Company
                    </label>
                    <span className="workexmgr-char-count">
                      {characterCounts.company}/200
                    </span>
                  </div>
                  <input
                    id="workexmgr-company"
                    type="text"
                    value={formData.company}
                    onChange={(e) => handleInputChange('company', e.target.value)}
                    className={`workexmgr-form-input ${validationErrors.company ? 'workexmgr-error' : ''}`}
                    placeholder="e.g., Tata Consultancy Services (TCS) Ltd."
                    maxLength={200}
                  />
                  {validationErrors.company && (
                    <span className="workexmgr-error-text" role="alert">
                      {validationErrors.company}
                    </span>
                  )}
                </div>

                <div className="workexmgr-form-row">
                  <div className="workexmgr-form-group">
                    <div className="workexmgr-form-label-wrapper">
                      <label htmlFor="workexmgr-location" className="workexmgr-form-label">
                        Location
                      </label>
                      <span className="workexmgr-char-count">
                        {characterCounts.location}/100
                      </span>
                    </div>
                    <input
                      id="workexmgr-location"
                      type="text"
                      value={formData.location}
                      onChange={(e) => handleInputChange('location', e.target.value)}
                      className={`workexmgr-form-input ${validationErrors.location ? 'workexmgr-error' : ''}`}
                      placeholder="e.g., Mumbai, India"
                      maxLength={100}
                    />
                    {validationErrors.location && (
                      <span className="workexmgr-error-text" role="alert">
                        {validationErrors.location}
                      </span>
                    )}
                  </div>

                  <div className="workexmgr-form-group">
                    <div className="workexmgr-form-label-wrapper">
                      <label htmlFor="workexmgr-department" className="workexmgr-form-label">
                        Department
                      </label>
                      <span className="workexmgr-char-count">
                        {characterCounts.department}/100
                      </span>
                    </div>
                    <input
                      id="workexmgr-department"
                      type="text"
                      value={formData.department}
                      onChange={(e) => handleInputChange('department', e.target.value)}
                      className="workexmgr-form-input"
                      placeholder="e.g., Infrastructure Services"
                      maxLength={100}
                    />
                  </div>
                </div>

                <div className="workexmgr-form-group">
                  <div className="workexmgr-form-label-wrapper">
                    <label htmlFor="workexmgr-description" className="workexmgr-form-label">
                      Job Description
                    </label>
                    <span className="workexmgr-char-count">
                      {characterCounts.description}/2000
                    </span>
                  </div>
                  <textarea
                    id="workexmgr-description"
                    value={formData.description}
                    onChange={(e) => handleInputChange('description', e.target.value)}
                    className={`workexmgr-form-textarea ${validationErrors.description ? 'workexmgr-error' : ''}`}
                    placeholder="Brief description of your role and responsibilities..."
                    rows={4}
                    maxLength={2000}
                  />
                  {validationErrors.description && (
                    <span className="workexmgr-error-text" role="alert">
                      {validationErrors.description}
                    </span>
                  )}
                </div>
              </div>

              {/* Duration & Status Section */}
              <div className="workexmgr-form-section-group">
                <h4 className="workexmgr-section-title">
                  <span className="workexmgr-section-icon">📅</span>
                  Duration & Status
                </h4>
                
                <div className="workexmgr-form-row">
                  <div className="workexmgr-form-group">
                    <div className="workexmgr-form-label-wrapper">
                      <label htmlFor="workexmgr-start-date" className="workexmgr-form-label">
                        Start Date
                      </label>
                    </div>
                    <input
                      id="workexmgr-start-date"
                      type="date"
                      value={formData.start_date}
                      onChange={(e) => handleInputChange('start_date', e.target.value)}
                      className="workexmgr-form-input"
                    />
                  </div>

                  <div className="workexmgr-form-group">
                    <div className="workexmgr-form-label-wrapper">
                      <label htmlFor="workexmgr-end-date" className="workexmgr-form-label">
                        End Date
                      </label>
                    </div>
                    <input
                      id="workexmgr-end-date"
                      type="date"
                      value={formData.end_date}
                      onChange={(e) => handleInputChange('end_date', e.target.value)}
                      className={`workexmgr-form-input ${validationErrors.end_date ? 'workexmgr-error' : ''}`}
                      disabled={formData.is_current}
                    />
                    {validationErrors.end_date && (
                      <span className="workexmgr-error-text" role="alert">
                        {validationErrors.end_date}
                      </span>
                    )}
                  </div>
                </div>

                <div className="workexmgr-form-group">
                  <div className="workexmgr-checkbox-wrapper">
                    <input
                      id="workexmgr-is-current"
                      type="checkbox"
                      checked={formData.is_current}
                      onChange={(e) => handleInputChange('is_current', e.target.checked)}
                      className="workexmgr-form-checkbox"
                    />
                    <label htmlFor="workexmgr-is-current" className="workexmgr-checkbox-label">
                      This is my current position
                    </label>
                  </div>
                  <p className="workexmgr-form-help">
                    Check this if you are currently working in this position
                  </p>
                </div>
              </div>

              {/* Team & Performance Section */}
              <div className="workexmgr-form-section-group">
                <h4 className="workexmgr-section-title">
                  <span className="workexmgr-section-icon">👥</span>
                  Team & Performance
                </h4>
                
                <div className="workexmgr-form-row">
                  <div className="workexmgr-form-group">
                    <div className="workexmgr-form-label-wrapper">
                      <label htmlFor="workexmgr-team-size" className="workexmgr-form-label">
                        Team Size
                      </label>
                    </div>
                    <input
                      id="workexmgr-team-size"
                      type="number"
                      value={formData.team_size}
                      onChange={(e) => handleInputChange('team_size', e.target.value)}
                      className={`workexmgr-form-input ${validationErrors.team_size ? 'workexmgr-error' : ''}`}
                      placeholder="e.g., 8"
                      min="0"
                    />
                    {validationErrors.team_size && (
                      <span className="workexmgr-error-text" role="alert">
                        {validationErrors.team_size}
                      </span>
                    )}
                  </div>

                  <div className="workexmgr-form-group">
                    <div className="workexmgr-form-label-wrapper">
                      <label htmlFor="workexmgr-performance-rating" className="workexmgr-form-label">
                        Performance Rating
                      </label>
                    </div>
                    <select
                      id="workexmgr-performance-rating"
                      value={formData.performance_rating}
                      onChange={(e) => handleInputChange('performance_rating', e.target.value)}
                      className="workexmgr-form-select"
                    >
                      <option value="">Select Performance Rating</option>
                      {performanceRatings.map(rating => (
                        <option key={rating} value={rating}>{rating}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="workexmgr-form-group">
                  <div className="workexmgr-form-label-wrapper">
                    <label htmlFor="workexmgr-salary-range" className="workexmgr-form-label">
                      Salary Range
                    </label>
                    <span className="workexmgr-char-count">
                      {characterCounts.salaryRange}/50
                    </span>
                  </div>
                  <input
                    id="workexmgr-salary-range"
                    type="text"
                    value={formData.salary_range}
                    onChange={(e) => handleInputChange('salary_range', e.target.value)}
                    className="workexmgr-form-input"
                    placeholder="e.g., ₹8-12 LPA"
                    maxLength={50}
                  />
                </div>
              </div>

              {/* Company Logo Section */}
              <div className="workexmgr-form-section-group">
                <h4 className="workexmgr-section-title">
                  <span className="workexmgr-section-icon">🏢</span>
                  Company Logo
                </h4>
                
                {formData.company_logo_url ? (
                  <div className="workexmgr-current-logo">
                    <div className="workexmgr-logo-preview">
                      <img 
                        src={formData.company_logo_url} 
                        alt="Company Logo"
                        className="workexmgr-logo-image"
                        onError={(e) => {
                          e.target.style.display = 'none';
                        }}
                      />
                      <button
                        type="button"
                        onClick={removeLogo}
                        className="workexmgr-remove-logo-btn"
                        title="Remove logo"
                      >
                        ❌
                      </button>
                    </div>
                    <span className="workexmgr-logo-filename">Current logo</span>
                  </div>
                ) : (
                  <div className="workexmgr-upload-section">
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => e.target.files[0] && handleLogoUpload(e.target.files[0])}
                      disabled={logoUploading}
                      className="workexmgr-file-input"
                      id="workexmgr-logo-upload"
                    />
                    <label htmlFor="workexmgr-logo-upload" className="workexmgr-upload-btn">
                      {logoUploading ? (
                        <>
                          <LoadingSpinner size="small" />
                          Uploading... {Math.round(uploadProgress)}%
                        </>
                      ) : (
                        <>
                          <span className="workexmgr-btn-icon">🏢</span>
                          Upload Company Logo
                        </>
                      )}
                    </label>
                    <p className="workexmgr-upload-help">
                      Upload company logo (JPEG, PNG, WebP, max 5MB)
                    </p>
                  </div>
                )}

                {validationErrors.logo && (
                  <span className="workexmgr-error-text" role="alert">
                    {validationErrors.logo}
                  </span>
                )}
              </div>

              {/* Key Responsibilities Section */}
              <div className="workexmgr-form-section-group">
                <h4 className="workexmgr-section-title">
                  <span className="workexmgr-section-icon">✅</span>
                  Key Responsibilities ({characterCounts.responsibilitiesCount}/50)
                </h4>
                
                <div className="workexmgr-responsibilities-list">
                  {formData.key_responsibilities.map((responsibility, index) => (
                    <div key={index} className="workexmgr-responsibility-item">
                      <span className="workexmgr-responsibility-text">{responsibility}</span>
                      <button
                        type="button"
                        onClick={() => removeResponsibility(index)}
                        className="workexmgr-remove-responsibility-btn"
                        title="Remove responsibility"
                      >
                        ❌
                      </button>
                    </div>
                  ))}
                </div>

                {formData.key_responsibilities.length < 50 && (
                  <div className="workexmgr-add-responsibility">
                    <input
                      type="text"
                      value={newResponsibility}
                      onChange={(e) => setNewResponsibility(e.target.value)}
                      placeholder="Add responsibility (e.g., Led team of 8 engineers)..."
                      className="workexmgr-form-input"
                      maxLength={200}
                      onKeyPress={(e) => handleKeyPress(e, addResponsibility)}
                    />
                    <button
                      type="button"
                      onClick={addResponsibility}
                      disabled={!newResponsibility.trim()}
                      className="workexmgr-add-responsibility-btn"
                    >
                      ➕ Add Responsibility
                    </button>
                  </div>
                )}

                {validationErrors.key_responsibilities && (
                  <span className="workexmgr-error-text" role="alert">
                    {validationErrors.key_responsibilities}
                  </span>
                )}
              </div>

              {/* Achievements Section */}
              <div className="workexmgr-form-section-group">
                <h4 className="workexmgr-section-title">
                  <span className="workexmgr-section-icon">🏆</span>
                  Key Achievements ({characterCounts.achievementsCount}/30)
                </h4>
                
                <div className="workexmgr-achievements-list">
                  {formData.achievements.map((achievement, index) => (
                    <div key={index} className="workexmgr-achievement-item">
                      <span className="workexmgr-achievement-text">{achievement}</span>
                      <button
                        type="button"
                        onClick={() => removeAchievement(index)}
                        className="workexmgr-remove-achievement-btn"
                        title="Remove achievement"
                      >
                        ❌
                      </button>
                    </div>
                  ))}
                </div>

                {formData.achievements.length < 30 && (
                  <div className="workexmgr-add-achievement">
                    <input
                      type="text"
                      value={newAchievement}
                      onChange={(e) => setNewAchievement(e.target.value)}
                      placeholder="Add achievement (e.g., 100% on-time project delivery)..."
                      className="workexmgr-form-input"
                      maxLength={200}
                      onKeyPress={(e) => handleKeyPress(e, addAchievement)}
                    />
                    <button
                      type="button"
                      onClick={addAchievement}
                      disabled={!newAchievement.trim()}
                      className="workexmgr-add-achievement-btn"
                    >
                      ➕ Add Achievement
                    </button>
                  </div>
                )}

                {validationErrors.achievements && (
                  <span className="workexmgr-error-text" role="alert">
                    {validationErrors.achievements}
                  </span>
                )}
              </div>

              {/* Technologies Section */}
              <div className="workexmgr-form-section-group">
                <h4 className="workexmgr-section-title">
                  <span className="workexmgr-section-icon">🛠️</span>
                  Technologies Used ({characterCounts.technologiesCount}/40)
                </h4>
                
                <div className="workexmgr-technologies-list">
                  {formData.technologies.map((technology, index) => (
                    <div key={index} className="workexmgr-technology-item">
                      <span className="workexmgr-technology-text">{technology}</span>
                      <button
                        type="button"
                        onClick={() => removeTechnology(index)}
                        className="workexmgr-remove-technology-btn"
                        title="Remove technology"
                      >
                        ❌
                      </button>
                    </div>
                  ))}
                </div>

                {formData.technologies.length < 40 && (
                  <div className="workexmgr-add-technology">
                    <input
                      type="text"
                      value={newTechnology}
                      onChange={(e) => setNewTechnology(e.target.value)}
                      placeholder="Add technology (e.g., AWS, Docker, Kubernetes)..."
                      className="workexmgr-form-input"
                      maxLength={50}
                      onKeyPress={(e) => handleKeyPress(e, addTechnology)}
                    />
                    <button
                      type="button"
                      onClick={addTechnology}
                      disabled={!newTechnology.trim()}
                      className="workexmgr-add-technology-btn"
                    >
                      ➕ Add Technology
                    </button>
                  </div>
                )}

                {validationErrors.technologies && (
                  <span className="workexmgr-error-text" role="alert">
                    {validationErrors.technologies}
                  </span>
                )}
              </div>

              {/* Clients Served Section */}
              <div className="workexmgr-form-section-group">
                <h4 className="workexmgr-section-title">
                  <span className="workexmgr-section-icon">🤝</span>
                  Clients Served ({characterCounts.clientsCount}/25)
                </h4>
                
                <div className="workexmgr-clients-list">
                  {formData.clients_served.map((client, index) => (
                    <div key={index} className="workexmgr-client-item">
                      <span className="workexmgr-client-text">{client}</span>
                      <button
                        type="button"
                        onClick={() => removeClient(index)}
                        className="workexmgr-remove-client-btn"
                        title="Remove client"
                      >
                        ❌
                      </button>
                    </div>
                  ))}
                </div>

                {formData.clients_served.length < 25 && (
                  <div className="workexmgr-add-client">
                    <input
                      type="text"
                      value={newClient}
                      onChange={(e) => setNewClient(e.target.value)}
                      placeholder="Add client (e.g., UK Banking Client, Healthcare Client)..."
                      className="workexmgr-form-input"
                      maxLength={100}
                      onKeyPress={(e) => handleKeyPress(e, addClient)}
                    />
                    <button
                      type="button"
                      onClick={addClient}
                      disabled={!newClient.trim()}
                      className="workexmgr-add-client-btn"
                    >
                      ➕ Add Client
                    </button>
                  </div>
                )}

                {validationErrors.clients_served && (
                  <span className="workexmgr-error-text" role="alert">
                    {validationErrors.clients_served}
                  </span>
                )}
              </div>

              {/* Additional Details Section */}
              <div className="workexmgr-form-section-group">
                <h4 className="workexmgr-section-title">
                  <span className="workexmgr-section-icon">📝</span>
                  Additional Details
                </h4>
                
                <div className="workexmgr-form-group">
                  <div className="workexmgr-form-label-wrapper">
                    <label htmlFor="workexmgr-reason-for-leaving" className="workexmgr-form-label">
                      Reason for Leaving
                    </label>
                    <span className="workexmgr-char-count">
                      {characterCounts.reasonForLeaving}/500
                    </span>
                  </div>
                  <textarea
                    id="workexmgr-reason-for-leaving"
                    value={formData.reason_for_leaving}
                    onChange={(e) => handleInputChange('reason_for_leaving', e.target.value)}
                    className={`workexmgr-form-textarea ${validationErrors.reason_for_leaving ? 'workexmgr-error' : ''}`}
                    placeholder="e.g., Pursuing higher education, Career advancement..."
                    rows={3}
                    maxLength={500}
                  />
                  {validationErrors.reason_for_leaving && (
                    <span className="workexmgr-error-text" role="alert">
                      {validationErrors.reason_for_leaving}
                    </span>
                  )}
                </div>
              </div>

              {/* Work Experience Settings Section */}
              <div className="workexmgr-form-section-group">
                <h4 className="workexmgr-section-title">
                  <span className="workexmgr-section-icon">⚙️</span>
                  Work Experience Settings
                </h4>
                
                <div className="workexmgr-form-group">
                  <div className="workexmgr-form-label-wrapper">
                    <label htmlFor="workexmgr-status" className="workexmgr-form-label">
                      Record Status
                    </label>
                  </div>
                  <select
                    id="workexmgr-status"
                    value={formData.status}
                    onChange={(e) => handleInputChange('status', e.target.value)}
                    className="workexmgr-form-select"
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
          <div className="workexmgr-preview-section">
            <div className="workexmgr-preview-container workexmgr-glass-card">
              <h3 className="workexmgr-preview-title">
                <span className="workexmgr-preview-icon">👁️</span>
                Live Preview
              </h3>
              
              <div className="workexmgr-work-preview">
                <div className="workexmgr-preview-work-card">
                  
                  {/* Preview Header */}
                  <div className="workexmgr-preview-card-header">
                    <div className="workexmgr-preview-company-logo">
                      {formData.company_logo_url ? (
                        <img 
                          src={formData.company_logo_url}
                          alt="Company Logo"
                          className="workexmgr-preview-logo"
                          onError={(e) => {
                            e.target.style.display = 'none';
                            e.target.nextElementSibling.style.display = 'flex';
                          }}
                        />
                      ) : null}
                      
                      <div 
                        className="workexmgr-preview-logo-temp"
                        style={{ display: formData.company_logo_url ? 'none' : 'flex' }}
                      >
                        {(formData.company || 'CO').substring(0, 2).toUpperCase()}
                      </div>
                    </div>

                    <div className="workexmgr-preview-status-indicators">
                      {formData.is_current && (
                        <div className="workexmgr-preview-status-badge workexmgr-current">
                          <span className="workexmgr-badge-text">CURRENT</span>
                        </div>
                      )}
                      {formData.employment_type && (
                        <div className="workexmgr-preview-employment-badge">
                          <span className="workexmgr-badge-text">{formData.employment_type}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Preview Title */}
                  <div className="workexmgr-preview-title-section">
                    <h3 className="workexmgr-preview-job-title">
                      {formData.title || 'Job Title'}
                    </h3>
                    <div className="workexmgr-preview-title-underline"></div>
                  </div>

                  {/* Preview Company Info */}
                  <div className="workexmgr-preview-company-section">
                    <h4 className="workexmgr-preview-company-name">
                      {formData.company || 'Company Name'}
                    </h4>
                    {formData.department && (
                      <p className="workexmgr-preview-department">Department: {formData.department}</p>
                    )}
                    {formData.location && (
                      <p className="workexmgr-preview-location">📍 {formData.location}</p>
                    )}
                  </div>

                  {/* Preview Meta */}
                  <div className="workexmgr-preview-meta-section">
                    <div className="workexmgr-preview-meta-row">
                      <div className="workexmgr-preview-meta-item">
                        <span className="workexmgr-meta-label">Duration</span>
                        <span className="workexmgr-meta-value">
                          {formData.start_date && (formData.end_date || formData.is_current)
                            ? `${new Date(formData.start_date).getFullYear()} - ${formData.is_current ? 'Present' : new Date(formData.end_date).getFullYear()}`
                            : 'N/A'
                          }
                        </span>
                      </div>
                      <div className="workexmgr-preview-meta-item">
                        <span className="workexmgr-meta-label">Status</span>
                        <span className="workexmgr-meta-value workexmgr-status">
                          {formData.is_current ? 'Current' : 'Past'}
                        </span>
                      </div>
                    </div>
                    {(formData.team_size || formData.performance_rating) && (
                      <div className="workexmgr-preview-meta-row">
                        {formData.team_size && (
                          <div className="workexmgr-preview-meta-item">
                            <span className="workexmgr-meta-label">Team Size</span>
                            <span className="workexmgr-meta-value">{formData.team_size}</span>
                          </div>
                        )}
                        {formData.performance_rating && (
                          <div className="workexmgr-preview-meta-item">
                            <span className="workexmgr-meta-label">Performance</span>
                            <span className="workexmgr-meta-value">{formData.performance_rating}</span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Preview Description */}
                  {formData.description && (
                    <div className="workexmgr-preview-description-section">
                      <p className="workexmgr-preview-description-text">
                        {formData.description}
                      </p>
                    </div>
                  )}

                  {/* Preview Detailed Information */}
                  <div className="workexmgr-preview-detailed-section">
                    <h4 className="workexmgr-preview-section-title">Work Experience Details</h4>
                    
                    {formData.key_responsibilities.length > 0 && (
                      <div className="workexmgr-preview-detail-group">
                        <div className="workexmgr-preview-detail-header">
                          <span className="workexmgr-detail-icon">✅</span>
                          <span className="workexmgr-detail-title">Key Responsibilities ({formData.key_responsibilities.length})</span>
                        </div>
                        <ul className="workexmgr-preview-responsibilities-list">
                          {formData.key_responsibilities.slice(0, 6).map((responsibility, index) => (
                            <li key={index} className="workexmgr-preview-responsibility-item">
                              <span className="workexmgr-responsibility-bullet">▸</span>
                              <span className="workexmgr-responsibility-text">{responsibility}</span>
                            </li>
                          ))}
                          {formData.key_responsibilities.length > 6 && (
                            <li className="workexmgr-preview-responsibility-item workexmgr-more">
                              <span className="workexmgr-responsibility-bullet">▸</span>
                              <span className="workexmgr-responsibility-text">
                                +{formData.key_responsibilities.length - 6} more responsibilities
                              </span>
                            </li>
                          )}
                        </ul>
                      </div>
                    )}

                    {formData.achievements.length > 0 && (
                      <div className="workexmgr-preview-detail-group">
                        <div className="workexmgr-preview-detail-header">
                          <span className="workexmgr-detail-icon">🏆</span>
                          <span className="workexmgr-detail-title">Key Achievements ({formData.achievements.length})</span>
                        </div>
                        <ul className="workexmgr-preview-achievements-list">
                          {formData.achievements.map((achievement, index) => (
                            <li key={index} className="workexmgr-preview-achievement-item">
                              <span className="workexmgr-achievement-bullet">⭐</span>
                              <span className="workexmgr-achievement-text">{achievement}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {formData.technologies.length > 0 && (
                      <div className="workexmgr-preview-detail-group">
                        <div className="workexmgr-preview-detail-header">
                          <span className="workexmgr-detail-icon">🛠️</span>
                          <span className="workexmgr-detail-title">Technologies ({formData.technologies.length})</span>
                        </div>
                        <div className="workexmgr-preview-tech-grid">
                          {formData.technologies.slice(0, 8).map((tech, index) => (
                            <span key={index} className="workexmgr-preview-tech-tag">
                              {tech}
                            </span>
                          ))}
                          {formData.technologies.length > 8 && (
                            <span className="workexmgr-preview-tech-tag workexmgr-tech-more">
                              +{formData.technologies.length - 8}
                            </span>
                          )}
                        </div>
                      </div>
                    )}

                    {formData.clients_served.length > 0 && (
                      <div className="workexmgr-preview-detail-group">
                        <div className="workexmgr-preview-detail-header">
                          <span className="workexmgr-detail-icon">🤝</span>
                          <span className="workexmgr-detail-title">Clients Served ({formData.clients_served.length})</span>
                        </div>
                        <div className="workexmgr-preview-clients-grid">
                          {formData.clients_served.map((client, index) => (
                            <span key={index} className="workexmgr-preview-client-tag">
                              {client}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Preview Status */}
              <div className="workexmgr-preview-status">
                <span className={`workexmgr-status-indicator ${formData.status}`}>
                  {formData.status === 'active' && '🟢 Active'}
                  {formData.status === 'draft' && '🟡 Draft'}
                  {formData.status === 'archived' && '🔴 Archived'}
                </span>
                <span className="workexmgr-work-status-indicator">
                  💼 {formData.is_current ? 'Current Position' : 'Past Position'}
                </span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default WorkExperienceManager;