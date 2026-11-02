import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useSupabase } from '../../../../hooks/useSupabase';
import LoadingSpinner from '../../../common/LoadingSpinner';
import './LeadershipManager.css';
import { triggerPublicRefresh } from '../../../../services/adminDataService';

const LeadershipManager = () => {
  // ============================================================================
  // DATA FETCHING WITH OPTIMIZED useSupabase HOOK
  // ============================================================================
  
  const { 
    data: leadershipData, 
    loading: dataLoading, 
    error: dataError,
    refetch 
  } = useSupabase('leadership', {}, { 
    orderBy: [
      { column: 'is_current', ascending: false }, // Current positions first
      { column: 'start_date', ascending: false }
    ],
    cacheKey: 'leadership-admin'
  });

  // ============================================================================
  // STATE MANAGEMENT - ORGANIZED AND OPTIMIZED
  // ============================================================================
  
  // View state management
  const [viewMode, setViewMode] = useState('list'); // 'list', 'add', 'edit'
  const [selectedLeadership, setSelectedLeadership] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterOrganizationType, setFilterOrganizationType] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');

  // Form state with proper initial values
  const [formData, setFormData] = useState({
    position_number: '',
    title: '',
    organization: '',
    organization_type: '',
    start_date: '',
    end_date: '',
    is_current: false,
    location: '',
    description: '',
    team_size: '',
    budget_managed: '',
    key_responsibilities: [],
    achievements: [],
    skills_developed: [],
    challenges_overcome: '',
    impact: '',
    volunteer_hours: '',
    initiative_type: '',
    recognition_received: [],
    mentees_count: '',
    training_provided: [],
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
  
  // Dynamic arrays management
  const [newResponsibility, setNewResponsibility] = useState('');
  const [newAchievement, setNewAchievement] = useState('');
  const [newSkill, setNewSkill] = useState('');
  const [newRecognition, setNewRecognition] = useState('');
  const [newTraining, setNewTraining] = useState('');

  // Delete confirmation modal state
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [leadershipToDelete, setLeadershipToDelete] = useState(null);

  // Organization type options
  const organizationTypes = useMemo(() => [
    'Corporate',
    'Non-Profit',
    'Government',
    'Educational',
    'Healthcare',
    'Technology',
    'Financial',
    'Consulting',
    'Manufacturing',
    'Retail',
    'Startup',
    'Other'
  ], []);

  // Initiative type options
  const initiativeTypes = [
    'Professional',
    'Volunteer',
    'Community Service',
    'Academic',
    'Social Impact',
    'Environmental',
    'Cultural',
    'Sports',
    'Technology',
    'Healthcare',
    'Education',
    'Other'
  ];

  // ============================================================================
  // MEMOIZED VALUES FOR PERFORMANCE
  // ============================================================================
  
  const characterCounts = useMemo(() => ({
    title: formData.title.length,
    organization: formData.organization.length,
    location: formData.location.length,
    description: formData.description.length,
    budgetManaged: formData.budget_managed.length,
    challengesOvercome: formData.challenges_overcome.length,
    impact: formData.impact.length,
    responsibilitiesCount: formData.key_responsibilities.length,
    achievementsCount: formData.achievements.length,
    skillsCount: formData.skills_developed.length,
    recognitionCount: formData.recognition_received.length,
    trainingCount: formData.training_provided.length
  }), [formData]);

  const filteredLeadership = useMemo(() => {
    if (!leadershipData) return [];
    
    return leadershipData.filter(leadership => {
      const matchesSearch = leadership.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                           leadership.organization?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                           leadership.location?.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesOrgType = filterOrganizationType === 'all' || leadership.organization_type === filterOrganizationType;
      const matchesStatus = filterStatus === 'all' || leadership.status === filterStatus;
      
      return matchesSearch && matchesOrgType && matchesStatus;
    });
  }, [leadershipData, searchTerm, filterOrganizationType, filterStatus]);

  const organizationTypesInData = useMemo(() => {
    if (!leadershipData) return [];
    return [...new Set(leadershipData.map(l => l.organization_type).filter(Boolean))];
  }, [leadershipData]);

  const hasUnsavedChanges = useMemo(() => {
    if (viewMode === 'list') return false;
    if (!selectedLeadership && viewMode === 'edit') return false;
    
    if (viewMode === 'add') {
      return formData.title.trim() !== '' || 
             formData.organization.trim() !== '' ||
             formData.location.trim() !== '' ||
             formData.key_responsibilities.length > 0 ||
             formData.achievements.length > 0 ||
             formData.skills_developed.length > 0 ||
             formData.recognition_received.length > 0 ||
             formData.training_provided.length > 0;
    }

    if (viewMode === 'edit' && selectedLeadership) {
      return (
        formData.position_number !== (selectedLeadership.position_number || '') ||
        formData.title !== (selectedLeadership.title || '') ||
        formData.organization !== (selectedLeadership.organization || '') ||
        formData.organization_type !== (selectedLeadership.organization_type || '') ||
        formData.start_date !== (selectedLeadership.start_date || '') ||
        formData.end_date !== (selectedLeadership.end_date || '') ||
        formData.is_current !== (selectedLeadership.is_current || false) ||
        formData.location !== (selectedLeadership.location || '') ||
        formData.description !== (selectedLeadership.description || '') ||
        formData.team_size !== (selectedLeadership.team_size || '') ||
        formData.budget_managed !== (selectedLeadership.budget_managed || '') ||
        formData.challenges_overcome !== (selectedLeadership.challenges_overcome || '') ||
        formData.impact !== (selectedLeadership.impact || '') ||
        formData.volunteer_hours !== (selectedLeadership.volunteer_hours || '') ||
        formData.initiative_type !== (selectedLeadership.initiative_type || '') ||
        formData.mentees_count !== (selectedLeadership.mentees_count || '') ||
        formData.is_featured !== (selectedLeadership.is_featured || false) ||
        formData.status !== (selectedLeadership.status || 'active') ||
        JSON.stringify(formData.key_responsibilities) !== JSON.stringify(selectedLeadership.key_responsibilities || []) ||
        JSON.stringify(formData.achievements) !== JSON.stringify(selectedLeadership.achievements || []) ||
        JSON.stringify(formData.skills_developed) !== JSON.stringify(selectedLeadership.skills_developed || []) ||
        JSON.stringify(formData.recognition_received) !== JSON.stringify(selectedLeadership.recognition_received || []) ||
        JSON.stringify(formData.training_provided) !== JSON.stringify(selectedLeadership.training_provided || [])
      );
    }

    return uiState.hasChanges;
  }, [formData, selectedLeadership, viewMode, uiState.hasChanges]);

  // ============================================================================
  // EFFECT HOOKS - OPTIMIZED DATA LOADING
  // ============================================================================
  
  // Load data into form when editing leadership
  useEffect(() => {
    if (viewMode === 'edit' && selectedLeadership) {
      const newFormData = {
        position_number: selectedLeadership.position_number || '',
        title: selectedLeadership.title || '',
        organization: selectedLeadership.organization || '',
        organization_type: selectedLeadership.organization_type || '',
        start_date: selectedLeadership.start_date || '',
        end_date: selectedLeadership.end_date || '',
        is_current: selectedLeadership.is_current || false,
        location: selectedLeadership.location || '',
        description: selectedLeadership.description || '',
        team_size: selectedLeadership.team_size || '',
        budget_managed: selectedLeadership.budget_managed || '',
        key_responsibilities: Array.isArray(selectedLeadership.key_responsibilities) ? [...selectedLeadership.key_responsibilities] : [],
        achievements: Array.isArray(selectedLeadership.achievements) ? [...selectedLeadership.achievements] : [],
        skills_developed: Array.isArray(selectedLeadership.skills_developed) ? [...selectedLeadership.skills_developed] : [],
        challenges_overcome: selectedLeadership.challenges_overcome || '',
        impact: selectedLeadership.impact || '',
        volunteer_hours: selectedLeadership.volunteer_hours || '',
        initiative_type: selectedLeadership.initiative_type || '',
        recognition_received: Array.isArray(selectedLeadership.recognition_received) ? [...selectedLeadership.recognition_received] : [],
        mentees_count: selectedLeadership.mentees_count || '',
        training_provided: Array.isArray(selectedLeadership.training_provided) ? [...selectedLeadership.training_provided] : [],
        is_featured: selectedLeadership.is_featured || false,
        order_index: selectedLeadership.order_index,
        status: selectedLeadership.status || 'active'
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
  }, [viewMode, selectedLeadership]);

  // Reset form when switching to add mode
  useEffect(() => {
    if (viewMode === 'add') {
      setFormData({
        position_number: '',
        title: '',
        organization: '',
        organization_type: '',
        start_date: '',
        end_date: '',
        is_current: false,
        location: '',
        description: '',
        team_size: '',
        budget_managed: '',
        key_responsibilities: [],
        achievements: [],
        skills_developed: [],
        challenges_overcome: '',
        impact: '',
        volunteer_hours: '',
        initiative_type: '',
        recognition_received: [],
        mentees_count: '',
        training_provided: [],
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

  const addSkill = useCallback(() => {
    const trimmedSkill = newSkill.trim();
    
    if (trimmedSkill && 
        trimmedSkill.length <= 100 && 
        formData.skills_developed.length < 40 &&
        !formData.skills_developed.includes(trimmedSkill)) {
      
      const updatedSkills = [...formData.skills_developed, trimmedSkill];
      handleInputChange('skills_developed', updatedSkills);
      setNewSkill('');
    }
  }, [newSkill, formData.skills_developed, handleInputChange]);

  const removeSkill = useCallback((index) => {
    const updatedSkills = formData.skills_developed.filter((_, i) => i !== index);
    handleInputChange('skills_developed', updatedSkills);
  }, [formData.skills_developed, handleInputChange]);

  const addRecognition = useCallback(() => {
    const trimmedRecognition = newRecognition.trim();
    
    if (trimmedRecognition && 
        trimmedRecognition.length <= 150 && 
        formData.recognition_received.length < 20 &&
        !formData.recognition_received.includes(trimmedRecognition)) {
      
      const updatedRecognition = [...formData.recognition_received, trimmedRecognition];
      handleInputChange('recognition_received', updatedRecognition);
      setNewRecognition('');
    }
  }, [newRecognition, formData.recognition_received, handleInputChange]);

  const removeRecognition = useCallback((index) => {
    const updatedRecognition = formData.recognition_received.filter((_, i) => i !== index);
    handleInputChange('recognition_received', updatedRecognition);
  }, [formData.recognition_received, handleInputChange]);

  const addTraining = useCallback(() => {
    const trimmedTraining = newTraining.trim();
    
    if (trimmedTraining && 
        trimmedTraining.length <= 150 && 
        formData.training_provided.length < 25 &&
        !formData.training_provided.includes(trimmedTraining)) {
      
      const updatedTraining = [...formData.training_provided, trimmedTraining];
      handleInputChange('training_provided', updatedTraining);
      setNewTraining('');
    }
  }, [newTraining, formData.training_provided, handleInputChange]);

  const removeTraining = useCallback((index) => {
    const updatedTraining = formData.training_provided.filter((_, i) => i !== index);
    handleInputChange('training_provided', updatedTraining);
  }, [formData.training_provided, handleInputChange]);

  // Handle Enter key for adding items
  const handleKeyPress = useCallback((e, action) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      action();
    }
  }, []);

  // ============================================================================
  // DURATION FORMATTING UTILITIES
  // ============================================================================
  
  const formatLeadershipDuration = useCallback((startDate, endDate, isCurrent) => {
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
      errors.title = 'Position title is required';
    } else if (titleTrimmed.length < 3) {
      errors.title = 'Position title must be at least 3 characters';
    } else if (titleTrimmed.length > 200) {
      errors.title = 'Position title must be less than 200 characters';
    }

    // Organization validation (required, 2-200 chars)
    const organizationTrimmed = formData.organization.trim();
    if (!organizationTrimmed) {
      errors.organization = 'Organization name is required';
    } else if (organizationTrimmed.length < 2) {
      errors.organization = 'Organization name must be at least 2 characters';
    } else if (organizationTrimmed.length > 200) {
      errors.organization = 'Organization name must be less than 200 characters';
    }

    // Location validation (optional, max 100 chars)
    if (formData.location && formData.location.length > 100) {
      errors.location = 'Location must be less than 100 characters';
    }

    // Description validation (optional, max 2000 chars)
    if (formData.description && formData.description.length > 2000) {
      errors.description = 'Description must be less than 2000 characters';
    }

    // Budget managed validation (optional, max 100 chars)
    if (formData.budget_managed && formData.budget_managed.length > 100) {
      errors.budget_managed = 'Budget managed must be less than 100 characters';
    }

    // Challenges overcome validation (optional, max 2000 chars)
    if (formData.challenges_overcome && formData.challenges_overcome.length > 2000) {
      errors.challenges_overcome = 'Challenges overcome must be less than 2000 characters';
    }

    // Impact validation (optional, max 2000 chars)
    if (formData.impact && formData.impact.length > 2000) {
      errors.impact = 'Impact must be less than 2000 characters';
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

    // Volunteer hours validation
    if (formData.volunteer_hours && (isNaN(formData.volunteer_hours) || parseInt(formData.volunteer_hours) < 0)) {
      errors.volunteer_hours = 'Volunteer hours must be a positive number';
    }

    // Mentees count validation
    if (formData.mentees_count && (isNaN(formData.mentees_count) || parseInt(formData.mentees_count) < 0)) {
      errors.mentees_count = 'Mentees count must be a positive number';
    }

    // Arrays validation
    if (formData.key_responsibilities.length > 50) {
      errors.key_responsibilities = 'Maximum 50 responsibilities allowed';
    }

    if (formData.achievements.length > 30) {
      errors.achievements = 'Maximum 30 achievements allowed';
    }

    if (formData.skills_developed.length > 40) {
      errors.skills_developed = 'Maximum 40 skills allowed';
    }

    if (formData.recognition_received.length > 20) {
      errors.recognition_received = 'Maximum 20 recognitions allowed';
    }

    if (formData.training_provided.length > 25) {
      errors.training_provided = 'Maximum 25 training programs allowed';
    }

    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  }, [formData]);

  // ============================================================================
  // SAVE OPERATION - FOLLOWING WORK EXPERIENCE MANAGER PATTERN
  // ============================================================================
  
  const handleSave = useCallback(async () => {
    console.log('🚀 Starting Leadership save process...');
    
    if (!validateForm()) {
      console.log('❌ Form validation failed');
      setUiState(prev => ({ ...prev, saveStatus: 'error' }));
      return;
    }

    setUiState(prev => ({ ...prev, isSaving: true, saveStatus: null }));

    try {
      // Prepare data for saving
      const saveData = {
        position_number: formData.position_number ? parseInt(formData.position_number) : null,
        title: formData.title.trim(),
        organization: formData.organization.trim(),
        organization_type: formData.organization_type || null,
        start_date: formData.start_date || null,
        end_date: formData.is_current ? null : formData.end_date || null,
        is_current: formData.is_current,
        location: formData.location.trim() || null,
        description: formData.description.trim() || null,
        team_size: formData.team_size ? parseInt(formData.team_size) : null,
        budget_managed: formData.budget_managed.trim() || null,
        key_responsibilities: formData.key_responsibilities,
        achievements: formData.achievements,
        skills_developed: formData.skills_developed,
        challenges_overcome: formData.challenges_overcome.trim() || null,
        impact: formData.impact.trim() || null,
        volunteer_hours: formData.volunteer_hours ? parseInt(formData.volunteer_hours) : null,
        initiative_type: formData.initiative_type || null,
        recognition_received: formData.recognition_received,
        mentees_count: formData.mentees_count ? parseInt(formData.mentees_count) : null,
        training_provided: formData.training_provided,
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
      
      if (viewMode === 'edit' && selectedLeadership?.id) {
        // Update existing leadership
        console.log('🔄 Updating existing leadership with ID:', selectedLeadership.id);
        const { data, error } = await supabaseAdmin
          .from('leadership')
          .update({
            ...saveData,
            updated_at: new Date().toISOString()
          })
          .eq('id', selectedLeadership.id)
          .select()
          .single();
          
        console.log('✏️ Update operation result:', data);
        console.log('❌ Update error (if any):', error);
          
        if (error) {
          console.error('💥 Update error details:', error);
          throw new Error(`Failed to update leadership: ${error.message}`);
        }
        
        result = { success: true, data };
      } else {
        // Create new leadership
        console.log('➕ Creating new leadership');
        const { data, error } = await supabaseAdmin
          .from('leadership')
          .insert([saveData])
          .select()
          .single();
          
        console.log('➕ Insert operation result:', data);
        console.log('❌ Insert error (if any):', error);
          
        if (error) {
          console.error('💥 Insert error details:', error);
          throw new Error(`Failed to create leadership: ${error.message}`);
        }
        
        result = { success: true, data };
      }
      
      console.log('📥 Final save result:', result);

      if (result && result.success) {
        console.log('✅ Save successful');

        triggerPublicRefresh('leadership');
        
        // Set success status immediately
        setUiState(prev => ({ 
          ...prev, 
          saveStatus: 'success',
          hasChanges: false,
          isPostSave: true
        }));

        // If this was a new leadership, switch to list view after save
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
        throw new Error(result?.error || result?.message || 'Failed to save leadership');
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
  }, [formData, selectedLeadership, viewMode, validateForm, refetch]);

  // ============================================================================
  // UI ACTIONS - OPTIMIZED EVENT HANDLERS
  // ============================================================================
  
  const handleAddNew = useCallback(() => {
    if (hasUnsavedChanges && viewMode !== 'list') {
      if (!window.confirm('You have unsaved changes. Are you sure you want to start a new leadership entry? Changes will be lost.')) {
        return;
      }
    }
    setViewMode('add');
    setSelectedLeadership(null);
  }, [hasUnsavedChanges, viewMode]);

  const handleEdit = useCallback((leadership) => {
    if (hasUnsavedChanges && viewMode !== 'list' && selectedLeadership?.id !== leadership.id) {
      if (!window.confirm('You have unsaved changes. Are you sure you want to edit a different leadership? Changes will be lost.')) {
        return;
      }
    }
    setSelectedLeadership(leadership);
    setViewMode('edit');
  }, [hasUnsavedChanges, viewMode, selectedLeadership]);

  const handleCancel = useCallback(() => {
    if (hasUnsavedChanges) {
      if (!window.confirm('You have unsaved changes. Are you sure you want to cancel? Changes will be lost.')) {
        return;
      }
    }
    setViewMode('list');
    setSelectedLeadership(null);
    setValidationErrors({});
    setNewResponsibility('');
    setNewAchievement('');
    setNewSkill('');
    setNewRecognition('');
    setNewTraining('');
    setUiState(prev => ({
      ...prev,
      hasChanges: false,
      saveStatus: null,
      isPostSave: false
    }));
  }, [hasUnsavedChanges]);

  const handleDelete = useCallback((leadership) => {
    setLeadershipToDelete(leadership);
    setShowDeleteModal(true);
  }, []);

  const confirmDeleteAction = useCallback(async () => {
    if (!leadershipToDelete) return;

    try {
      const { createClient } = await import('@supabase/supabase-js');
      const supabaseAdmin = createClient(
        process.env.REACT_APP_SUPABASE_URL,
        process.env.REACT_APP_SUPABASE_SERVICE_ROLE_KEY
      );

      const { error } = await supabaseAdmin
        .from('leadership')
        .delete()
        .eq('id', leadershipToDelete.id);

      if (error) {
        throw new Error(`Failed to delete leadership: ${error.message}`);
      }

      triggerPublicRefresh('leadership');
      setUiState(prev => ({ 
        ...prev, 
        saveStatus: 'success',
        statusMessageContent: `Leadership position "${leadershipToDelete.title}" at "${leadershipToDelete.organization}" has been deleted.`
      }));
      refetch();

    } catch (error) {
      console.error('Delete error:', error);
      setUiState(prev => ({ 
        ...prev, 
        saveStatus: 'error',
        statusMessageContent: `Error deleting leadership: ${error.message}`
      }));
    } finally {
      setShowDeleteModal(false);
      setLeadershipToDelete(null);
    }
  }, [leadershipToDelete, refetch]);

  const cancelDeleteAction = useCallback(() => {
    setShowDeleteModal(false);
    setLeadershipToDelete(null);
  }, []);

  const togglePreview = useCallback(() => {
    setUiState(prev => ({ ...prev, showPreview: !prev.showPreview }));
  }, []);

  // ============================================================================
  // LOADING STATE - STANDARDIZED PHASE 3 PATTERN
  // ============================================================================
  
  if (dataLoading && !leadershipData) {
    return (
      <div className="leadermgr-loading">
        <LoadingSpinner size="large" />
        <p>Loading leadership records...</p>
      </div>
    );
  }

  // ============================================================================
  // RENDER - OPTIMIZED JSX STRUCTURE
  // ============================================================================
  
  return (
    <div className="leadermgr-content-manager">
      {/* Header Section */}
      <div className="leadermgr-manager-header">
        <div className="leadermgr-header-content">
          <h2 className="leadermgr-manager-title">
            <span className="leadermgr-title-icon">👑</span>
            Leadership Management
          </h2>
          <p className="leadermgr-manager-subtitle">
            Manage your leadership positions and volunteer experiences
          </p>
        </div>

        <div className="leadermgr-header-actions">
          {viewMode === 'list' ? (
            <>
              <button
                className="leadermgr-action-btn leadermgr-add-btn leadermgr-primary"
                onClick={handleAddNew}
                title="Add New Leadership Position"
                type="button"
              >
                <span className="leadermgr-btn-icon">➕</span>
                Add Leadership Position
              </button>
            </>
          ) : (
            <>
              <button
                className="leadermgr-action-btn leadermgr-preview-btn"
                onClick={togglePreview}
                title="Toggle Preview"
                type="button"
              >
                <span className="leadermgr-btn-icon">👁️</span>
                {uiState.showPreview ? 'Hide Preview' : 'Show Preview'}
              </button>
              <div className="leadermgr-edit-actions">
                <button
                  className="leadermgr-action-btn leadermgr-cancel-btn"
                  onClick={handleCancel}
                  disabled={uiState.isSaving}
                  title="Cancel Changes"
                  type="button"
                >
                  <span className="leadermgr-btn-icon">❌</span>
                  Cancel
                </button>
                <button
                  className="leadermgr-action-btn leadermgr-save-btn leadermgr-primary"
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
                      <span className="leadermgr-btn-icon">💾</span>
                      Save Leadership Position
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
        <div className={`leadermgr-status-message ${uiState.saveStatus}`} role="alert">
          {uiState.saveStatus === 'success' && (
            <>
              <span className="leadermgr-status-icon">✅</span>
              <div className="leadermgr-status-content">
                <strong>Success!</strong> 
                {uiState.statusMessageContent || 'Leadership position has been saved successfully and is now live on your portfolio.'}
              </div>
            </>
          )}
          {uiState.saveStatus === 'error' && (
            <>
              <span className="leadermgr-status-icon">❌</span>
              <div className="leadermgr-status-content">
                <strong>Error!</strong> 
                {uiState.statusMessageContent || 'Failed to save leadership position. Please check your connection and try again.'}
              </div>
            </>
          )}
        </div>
      )}

      {/* Data Error */}
      {dataError && (
        <div className="leadermgr-status-message leadermgr-error" role="alert">
          <span className="leadermgr-status-icon">⚠️</span>
          Error loading leadership: {
            typeof dataError === 'string' ? dataError : dataError.message || 'Unknown error'
          }
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteModal && leadershipToDelete && (
        <div className="leadermgr-modal-overlay">
          <div className="leadermgr-modal-content leadermgr-glass-card">
            <h3 className="leadermgr-modal-title">
              <span className="leadermgr-modal-icon">🗑️</span> Confirm Deletion
            </h3>
            <p className="leadermgr-modal-text">
              Are you sure you want to delete the leadership position: <strong>"{leadershipToDelete.title}"</strong> 
              at <strong>"{leadershipToDelete.organization}"</strong>? This action cannot be undone.
            </p>
            <div className="leadermgr-modal-actions">
              <button
                type="button"
                className="leadermgr-action-btn leadermgr-cancel-btn"
                onClick={cancelDeleteAction}
              >
                <span className="leadermgr-btn-icon">❌</span> Cancel
              </button>
              <button
                type="button"
                className="leadermgr-action-btn leadermgr-delete-btn-confirm leadermgr-primary"
                onClick={confirmDeleteAction}
              >
                <span className="leadermgr-btn-icon">🗑️</span> Delete Leadership Position
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className={`leadermgr-manager-content ${uiState.showPreview ? 'leadermgr-with-preview' : ''}`}>
        
        {/* LIST VIEW */}
        {viewMode === 'list' && (
          <div className="leadermgr-list-section">
            <div className="leadermgr-list-container leadermgr-glass-card">
              
              {/* Search and Filters */}
              <div className="leadermgr-list-controls">
                <div className="leadermgr-search-section">
                  <div className="leadermgr-search-wrapper">
                    <span className="leadermgr-search-icon">🔍</span>
                    <input
                      type="text"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      placeholder="Search leadership by title, organization, or location..."
                      className="leadermgr-search-input"
                    />
                  </div>
                </div>
                
                <div className="leadermgr-filters-section">
                  <select
                    value={filterOrganizationType}
                    onChange={(e) => setFilterOrganizationType(e.target.value)}
                    className="leadermgr-filter-select"
                  >
                    <option value="all">All Organization Types</option>
                    {organizationTypesInData.map(type => (
                      <option key={type} value={type}>{type}</option>
                    ))}
                  </select>
                  
                  <select
                    value={filterStatus}
                    onChange={(e) => setFilterStatus(e.target.value)}
                    className="leadermgr-filter-select"
                  >
                    <option value="all">All Status</option>
                    <option value="active">Active</option>
                    <option value="draft">Draft</option>
                    <option value="archived">Archived</option>
                  </select>
                </div>
              </div>

              {/* Leadership Table */}
              <div className="leadermgr-table-wrapper">
                {filteredLeadership.length === 0 ? (
                  <div className="leadermgr-no-data-message">
                    <div className="leadermgr-no-data-icon">👑</div>
                    <h3>No Leadership Records Found</h3>
                    <p>
                      {leadershipData?.length === 0 
                        ? 'No leadership records have been created yet. Click "Add Leadership Position" to get started.'
                        : 'No leadership records match your current filters. Try adjusting your search criteria.'
                      }
                    </p>
                  </div>
                ) : (
                  <table className="leadermgr-table">
                    <thead>
                      <tr>
                        <th>Position Title</th>
                        <th>Organization</th>
                        <th>Duration</th>
                        <th>Featured</th>
                        <th>Current</th>
                        <th>Status</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredLeadership.map((leadership, index) => (
                        <tr key={leadership.id || index} className="leadermgr-table-row">
                          <td className="leadermgr-position-title">
                            <div className="leadermgr-title-content">
                              <h4 className="leadermgr-title-text">{leadership.title}</h4>
                            </div>
                          </td>
                          
                          <td className="leadermgr-organization">
                            <span className="leadermgr-organization-name">{leadership.organization}</span>
                          </td>
                          
                          <td className="leadermgr-duration">
                            {leadership.start_date ? (
                              <div className="leadermgr-duration-content">
                                <span className="leadermgr-duration-dates">
                                  {new Date(leadership.start_date).toLocaleDateString('en-US', { 
                                    year: 'numeric', 
                                    month: 'short' 
                                  })} - {leadership.is_current ? 'Present' : 
                                    leadership.end_date ? new Date(leadership.end_date).toLocaleDateString('en-US', { 
                                      year: 'numeric', 
                                      month: 'short' 
                                    }) : 'N/A'
                                  }
                                </span>
                                <span className="leadermgr-duration-calculated">
                                  {formatLeadershipDuration(leadership.start_date, leadership.end_date, leadership.is_current)}
                                </span>
                              </div>
                            ) : (
                              <span className="leadermgr-duration-na">N/A</span>
                            )}
                          </td>
                          
                          <td className="leadermgr-featured">
                            <span className={`leadermgr-boolean-value ${leadership.is_featured ? 'leadermgr-true' : 'leadermgr-false'}`}>
                              {leadership.is_featured ? 'TRUE' : 'FALSE'}
                            </span>
                          </td>
                          
                          <td className="leadermgr-current">
                            <span className={`leadermgr-boolean-value ${leadership.is_current ? 'leadermgr-true' : 'leadermgr-false'}`}>
                              {leadership.is_current ? 'TRUE' : 'FALSE'}
                            </span>
                          </td>
                          
                          <td className="leadermgr-status">
                            <span className={`leadermgr-status-badge leadermgr-status-${leadership.status}`}>
                              {leadership.status}
                            </span>
                          </td>
                          
                          <td className="leadermgr-actions">
                            <div className="leadermgr-action-buttons">
                              <button
                                className="leadermgr-action-btn-mini leadermgr-edit-btn"
                                onClick={() => handleEdit(leadership)}
                                title="Edit Leadership Position"
                              >
                                ✏️
                              </button>
                              <button
                                className="leadermgr-action-btn-mini leadermgr-delete-btn"
                                onClick={() => handleDelete(leadership)}
                                title="Delete Leadership Position"
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
              
              {/* Leadership Summary */}
              {leadershipData && leadershipData.length > 0 && (
                <div className="leadermgr-summary">
                  <div className="leadermgr-summary-stats">
                    <span className="leadermgr-stat-item">
                      <strong>{leadershipData.length}</strong> total leadership positions
                    </span>
                    <span className="leadermgr-stat-item">
                      <strong>{leadershipData.filter(l => l.is_current).length}</strong> current positions
                    </span>
                    <span className="leadermgr-stat-item">
                      <strong>{leadershipData.filter(l => l.is_featured).length}</strong> featured positions
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* FORM VIEW (ADD/EDIT) */}
        {(viewMode === 'add' || viewMode === 'edit') && (
          <div className="leadermgr-form-section">
            <div className="leadermgr-form-container leadermgr-glass-card">
              
              {/* Form Title */}
              <div className="leadermgr-form-title-section">
                <h3 className="leadermgr-form-title">
                  {viewMode === 'add' ? 'Add New Leadership Position' : `Edit: ${selectedLeadership?.title}`}
                </h3>
                <p className="leadermgr-form-subtitle">
                  {viewMode === 'add' 
                    ? 'Create a new leadership position entry for your portfolio'
                    : 'Update leadership position information and details'
                  }
                </p>
              </div>

              {/* Basic Information Section */}
              <div className="leadermgr-form-section-group">
                <h4 className="leadermgr-section-title">
                  <span className="leadermgr-section-icon">📋</span>
                  Basic Information
                </h4>
                
                <div className="leadermgr-form-row">
                  <div className="leadermgr-form-group">
                    <div className="leadermgr-form-label-wrapper">
                      <label htmlFor="leadermgr-position-number" className="leadermgr-form-label">
                        Position Number
                      </label>
                    </div>
                    <input
                      id="leadermgr-position-number"
                      type="number"
                      value={formData.position_number}
                      onChange={(e) => handleInputChange('position_number', e.target.value)}
                      className="leadermgr-form-input"
                      placeholder="e.g., 1"
                      min="1"
                    />
                  </div>

                  <div className="leadermgr-form-group">
                    <div className="leadermgr-form-label-wrapper">
                      <label htmlFor="leadermgr-organization-type" className="leadermgr-form-label">
                        Organization Type
                      </label>
                    </div>
                    <select
                      id="leadermgr-organization-type"
                      value={formData.organization_type}
                      onChange={(e) => handleInputChange('organization_type', e.target.value)}
                      className="leadermgr-form-select"
                    >
                      <option value="">Select Organization Type</option>
                      {organizationTypes.map(type => (
                        <option key={type} value={type}>{type}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="leadermgr-form-group">
                  <div className="leadermgr-form-label-wrapper">
                    <label htmlFor="leadermgr-title" className="leadermgr-form-label leadermgr-required">
                      Position Title
                    </label>
                    <span className="leadermgr-char-count">
                      {characterCounts.title}/200
                    </span>
                  </div>
                  <input
                    id="leadermgr-title"
                    type="text"
                    value={formData.title}
                    onChange={(e) => handleInputChange('title', e.target.value)}
                    className={`leadermgr-form-input ${validationErrors.title ? 'leadermgr-error' : ''}`}
                    placeholder="e.g., Infrastructure Team Lead"
                    maxLength={200}
                    aria-describedby={validationErrors.title ? 'leadermgr-title-error' : undefined}
                  />
                  {validationErrors.title && (
                    <span id="leadermgr-title-error" className="leadermgr-error-text" role="alert">
                      {validationErrors.title}
                    </span>
                  )}
                </div>

                <div className="leadermgr-form-group">
                  <div className="leadermgr-form-label-wrapper">
                    <label htmlFor="leadermgr-organization" className="leadermgr-form-label leadermgr-required">
                      Organization
                    </label>
                    <span className="leadermgr-char-count">
                      {characterCounts.organization}/200
                    </span>
                  </div>
                  <input
                    id="leadermgr-organization"
                    type="text"
                    value={formData.organization}
                    onChange={(e) => handleInputChange('organization', e.target.value)}
                    className={`leadermgr-form-input ${validationErrors.organization ? 'leadermgr-error' : ''}`}
                    placeholder="e.g., Tata Consultancy Services"
                    maxLength={200}
                  />
                  {validationErrors.organization && (
                    <span className="leadermgr-error-text" role="alert">
                      {validationErrors.organization}
                    </span>
                  )}
                </div>

                <div className="leadermgr-form-row">
                  <div className="leadermgr-form-group">
                    <div className="leadermgr-form-label-wrapper">
                      <label htmlFor="leadermgr-location" className="leadermgr-form-label">
                        Location
                      </label>
                      <span className="leadermgr-char-count">
                        {characterCounts.location}/100
                      </span>
                    </div>
                    <input
                      id="leadermgr-location"
                      type="text"
                      value={formData.location}
                      onChange={(e) => handleInputChange('location', e.target.value)}
                      className={`leadermgr-form-input ${validationErrors.location ? 'leadermgr-error' : ''}`}
                      placeholder="e.g., Mumbai, India"
                      maxLength={100}
                    />
                    {validationErrors.location && (
                      <span className="leadermgr-error-text" role="alert">
                        {validationErrors.location}
                      </span>
                    )}
                  </div>

                  <div className="leadermgr-form-group">
                    <div className="leadermgr-form-label-wrapper">
                      <label htmlFor="leadermgr-initiative-type" className="leadermgr-form-label">
                        Initiative Type
                      </label>
                    </div>
                    <select
                      id="leadermgr-initiative-type"
                      value={formData.initiative_type}
                      onChange={(e) => handleInputChange('initiative_type', e.target.value)}
                      className="leadermgr-form-select"
                    >
                      <option value="">Select Initiative Type</option>
                      {initiativeTypes.map(type => (
                        <option key={type} value={type}>{type}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="leadermgr-form-group">
                  <div className="leadermgr-form-label-wrapper">
                    <label htmlFor="leadermgr-description" className="leadermgr-form-label">
                      Position Description
                    </label>
                    <span className="leadermgr-char-count">
                      {characterCounts.description}/2000
                    </span>
                  </div>
                  <textarea
                    id="leadermgr-description"
                    value={formData.description}
                    onChange={(e) => handleInputChange('description', e.target.value)}
                    className={`leadermgr-form-textarea ${validationErrors.description ? 'leadermgr-error' : ''}`}
                    placeholder="Brief description of your leadership role and responsibilities..."
                    rows={4}
                    maxLength={2000}
                  />
                  {validationErrors.description && (
                    <span className="leadermgr-error-text" role="alert">
                      {validationErrors.description}
                    </span>
                  )}
                </div>
              </div>

              {/* Duration & Status Section */}
              <div className="leadermgr-form-section-group">
                <h4 className="leadermgr-section-title">
                  <span className="leadermgr-section-icon">📅</span>
                  Duration & Status
                </h4>
                
                <div className="leadermgr-form-row">
                  <div className="leadermgr-form-group">
                    <div className="leadermgr-form-label-wrapper">
                      <label htmlFor="leadermgr-start-date" className="leadermgr-form-label">
                        Start Date
                      </label>
                    </div>
                    <input
                      id="leadermgr-start-date"
                      type="date"
                      value={formData.start_date}
                      onChange={(e) => handleInputChange('start_date', e.target.value)}
                      className="leadermgr-form-input"
                    />
                  </div>

                  <div className="leadermgr-form-group">
                    <div className="leadermgr-form-label-wrapper">
                      <label htmlFor="leadermgr-end-date" className="leadermgr-form-label">
                        End Date
                      </label>
                    </div>
                    <input
                      id="leadermgr-end-date"
                      type="date"
                      value={formData.end_date}
                      onChange={(e) => handleInputChange('end_date', e.target.value)}
                      className={`leadermgr-form-input ${validationErrors.end_date ? 'leadermgr-error' : ''}`}
                      disabled={formData.is_current}
                    />
                    {validationErrors.end_date && (
                      <span className="leadermgr-error-text" role="alert">
                        {validationErrors.end_date}
                      </span>
                    )}
                  </div>
                </div>

                <div className="leadermgr-form-group">
                  <div className="leadermgr-checkbox-wrapper">
                    <input
                      id="leadermgr-is-current"
                      type="checkbox"
                      checked={formData.is_current}
                      onChange={(e) => handleInputChange('is_current', e.target.checked)}
                      className="leadermgr-form-checkbox"
                    />
                    <label htmlFor="leadermgr-is-current" className="leadermgr-checkbox-label">
                      This is my current position
                    </label>
                  </div>
                  <p className="leadermgr-form-help">
                    Check this if you are currently holding this leadership position
                  </p>
                </div>
              </div>

              {/* Team & Budget Section */}
              <div className="leadermgr-form-section-group">
                <h4 className="leadermgr-section-title">
                  <span className="leadermgr-section-icon">👥</span>
                  Team & Budget Management
                </h4>
                
                <div className="leadermgr-form-row">
                  <div className="leadermgr-form-group">
                    <div className="leadermgr-form-label-wrapper">
                      <label htmlFor="leadermgr-team-size" className="leadermgr-form-label">
                        Team Size
                      </label>
                    </div>
                    <input
                      id="leadermgr-team-size"
                      type="number"
                      value={formData.team_size}
                      onChange={(e) => handleInputChange('team_size', e.target.value)}
                      className={`leadermgr-form-input ${validationErrors.team_size ? 'leadermgr-error' : ''}`}
                      placeholder="e.g., 8"
                      min="0"
                    />
                    {validationErrors.team_size && (
                      <span className="leadermgr-error-text" role="alert">
                        {validationErrors.team_size}
                      </span>
                    )}
                  </div>

                  <div className="leadermgr-form-group">
                    <div className="leadermgr-form-label-wrapper">
                      <label htmlFor="leadermgr-budget-managed" className="leadermgr-form-label">
                        Budget Managed
                      </label>
                      <span className="leadermgr-char-count">
                        {characterCounts.budgetManaged}/100
                      </span>
                    </div>
                    <input
                      id="leadermgr-budget-managed"
                      type="text"
                      value={formData.budget_managed}
                      onChange={(e) => handleInputChange('budget_managed', e.target.value)}
                      className="leadermgr-form-input"
                      placeholder="e.g., ₹2 Crore"
                      maxLength={100}
                    />
                  </div>
                </div>

                <div className="leadermgr-form-row">
                  <div className="leadermgr-form-group">
                    <div className="leadermgr-form-label-wrapper">
                      <label htmlFor="leadermgr-volunteer-hours" className="leadermgr-form-label">
                        Volunteer Hours
                      </label>
                    </div>
                    <input
                      id="leadermgr-volunteer-hours"
                      type="number"
                      value={formData.volunteer_hours}
                      onChange={(e) => handleInputChange('volunteer_hours', e.target.value)}
                      className={`leadermgr-form-input ${validationErrors.volunteer_hours ? 'leadermgr-error' : ''}`}
                      placeholder="e.g., 120"
                      min="0"
                    />
                    {validationErrors.volunteer_hours && (
                      <span className="leadermgr-error-text" role="alert">
                        {validationErrors.volunteer_hours}
                      </span>
                    )}
                  </div>

                  <div className="leadermgr-form-group">
                    <div className="leadermgr-form-label-wrapper">
                      <label htmlFor="leadermgr-mentees-count" className="leadermgr-form-label">
                        Mentees Count
                      </label>
                    </div>
                    <input
                      id="leadermgr-mentees-count"
                      type="number"
                      value={formData.mentees_count}
                      onChange={(e) => handleInputChange('mentees_count', e.target.value)}
                      className={`leadermgr-form-input ${validationErrors.mentees_count ? 'leadermgr-error' : ''}`}
                      placeholder="e.g., 15"
                      min="0"
                    />
                    {validationErrors.mentees_count && (
                      <span className="leadermgr-error-text" role="alert">
                        {validationErrors.mentees_count}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Key Responsibilities Section */}
              <div className="leadermgr-form-section-group">
                <h4 className="leadermgr-section-title">
                  <span className="leadermgr-section-icon">✅</span>
                  Key Responsibilities ({characterCounts.responsibilitiesCount}/50)
                </h4>
                
                <div className="leadermgr-responsibilities-list">
                  {formData.key_responsibilities.map((responsibility, index) => (
                    <div key={index} className="leadermgr-responsibility-item">
                      <span className="leadermgr-responsibility-text">{responsibility}</span>
                      <button
                        type="button"
                        onClick={() => removeResponsibility(index)}
                        className="leadermgr-remove-responsibility-btn"
                        title="Remove responsibility"
                      >
                        ❌
                      </button>
                    </div>
                  ))}
                </div>

                {formData.key_responsibilities.length < 50 && (
                  <div className="leadermgr-add-responsibility">
                    <input
                      type="text"
                      value={newResponsibility}
                      onChange={(e) => setNewResponsibility(e.target.value)}
                      placeholder="Add responsibility (e.g., Led team of 8 engineers)..."
                      className="leadermgr-form-input"
                      maxLength={200}
                      onKeyPress={(e) => handleKeyPress(e, addResponsibility)}
                    />
                    <button
                      type="button"
                      onClick={addResponsibility}
                      disabled={!newResponsibility.trim()}
                      className="leadermgr-add-responsibility-btn"
                    >
                      ➕ Add Responsibility
                    </button>
                  </div>
                )}

                {validationErrors.key_responsibilities && (
                  <span className="leadermgr-error-text" role="alert">
                    {validationErrors.key_responsibilities}
                  </span>
                )}
              </div>

              {/* Achievements Section */}
              <div className="leadermgr-form-section-group">
                <h4 className="leadermgr-section-title">
                  <span className="leadermgr-section-icon">🏆</span>
                  Key Achievements ({characterCounts.achievementsCount}/30)
                </h4>
                
                <div className="leadermgr-achievements-list">
                  {formData.achievements.map((achievement, index) => (
                    <div key={index} className="leadermgr-achievement-item">
                      <span className="leadermgr-achievement-text">{achievement}</span>
                      <button
                        type="button"
                        onClick={() => removeAchievement(index)}
                        className="leadermgr-remove-achievement-btn"
                        title="Remove achievement"
                      >
                        ❌
                      </button>
                    </div>
                  ))}
                </div>

                {formData.achievements.length < 30 && (
                  <div className="leadermgr-add-achievement">
                    <input
                      type="text"
                      value={newAchievement}
                      onChange={(e) => setNewAchievement(e.target.value)}
                      placeholder="Add achievement (e.g., 100% on-time project delivery)..."
                      className="leadermgr-form-input"
                      maxLength={200}
                      onKeyPress={(e) => handleKeyPress(e, addAchievement)}
                    />
                    <button
                      type="button"
                      onClick={addAchievement}
                      disabled={!newAchievement.trim()}
                      className="leadermgr-add-achievement-btn"
                    >
                      ➕ Add Achievement
                    </button>
                  </div>
                )}

                {validationErrors.achievements && (
                  <span className="leadermgr-error-text" role="alert">
                    {validationErrors.achievements}
                  </span>
                )}
              </div>

              {/* Skills Developed Section */}
              <div className="leadermgr-form-section-group">
                <h4 className="leadermgr-section-title">
                  <span className="leadermgr-section-icon">🎯</span>
                  Skills Developed ({characterCounts.skillsCount}/40)
                </h4>
                
                <div className="leadermgr-skills-list">
                  {formData.skills_developed.map((skill, index) => (
                    <div key={index} className="leadermgr-skill-item">
                      <span className="leadermgr-skill-text">{skill}</span>
                      <button
                        type="button"
                        onClick={() => removeSkill(index)}
                        className="leadermgr-remove-skill-btn"
                        title="Remove skill"
                      >
                        ❌
                      </button>
                    </div>
                  ))}
                </div>

                {formData.skills_developed.length < 40 && (
                  <div className="leadermgr-add-skill">
                    <input
                      type="text"
                      value={newSkill}
                      onChange={(e) => setNewSkill(e.target.value)}
                      placeholder="Add skill (e.g., Team Management, Strategic Planning)..."
                      className="leadermgr-form-input"
                      maxLength={100}
                      onKeyPress={(e) => handleKeyPress(e, addSkill)}
                    />
                    <button
                      type="button"
                      onClick={addSkill}
                      disabled={!newSkill.trim()}
                      className="leadermgr-add-skill-btn"
                    >
                      ➕ Add Skill
                    </button>
                  </div>
                )}

                {validationErrors.skills_developed && (
                  <span className="leadermgr-error-text" role="alert">
                    {validationErrors.skills_developed}
                  </span>
                )}
              </div>

              {/* Recognition Received Section */}
              <div className="leadermgr-form-section-group">
                <h4 className="leadermgr-section-title">
                  <span className="leadermgr-section-icon">🎖️</span>
                  Recognition Received ({characterCounts.recognitionCount}/20)
                </h4>
                
                <div className="leadermgr-recognition-list">
                  {formData.recognition_received.map((recognition, index) => (
                    <div key={index} className="leadermgr-recognition-item">
                      <span className="leadermgr-recognition-text">{recognition}</span>
                      <button
                        type="button"
                        onClick={() => removeRecognition(index)}
                        className="leadermgr-remove-recognition-btn"
                        title="Remove recognition"
                      >
                        ❌
                      </button>
                    </div>
                  ))}
                </div>

                {formData.recognition_received.length < 20 && (
                  <div className="leadermgr-add-recognition">
                    <input
                      type="text"
                      value={newRecognition}
                      onChange={(e) => setNewRecognition(e.target.value)}
                      placeholder="Add recognition (e.g., Star of the Quarter, Team Excellence Award)..."
                      className="leadermgr-form-input"
                      maxLength={150}
                      onKeyPress={(e) => handleKeyPress(e, addRecognition)}
                    />
                    <button
                      type="button"
                      onClick={addRecognition}
                      disabled={!newRecognition.trim()}
                      className="leadermgr-add-recognition-btn"
                    >
                      ➕ Add Recognition
                    </button>
                  </div>
                )}

                {validationErrors.recognition_received && (
                  <span className="leadermgr-error-text" role="alert">
                    {validationErrors.recognition_received}
                  </span>
                )}
              </div>

              {/* Training Provided Section */}
              <div className="leadermgr-form-section-group">
                <h4 className="leadermgr-section-title">
                  <span className="leadermgr-section-icon">📚</span>
                  Training Provided ({characterCounts.trainingCount}/25)
                </h4>
                
                <div className="leadermgr-training-list">
                  {formData.training_provided.map((training, index) => (
                    <div key={index} className="leadermgr-training-item">
                      <span className="leadermgr-training-text">{training}</span>
                      <button
                        type="button"
                        onClick={() => removeTraining(index)}
                        className="leadermgr-remove-training-btn"
                        title="Remove training"
                      >
                        ❌
                      </button>
                    </div>
                  ))}
                </div>

                {formData.training_provided.length < 25 && (
                  <div className="leadermgr-add-training">
                    <input
                      type="text"
                      value={newTraining}
                      onChange={(e) => setNewTraining(e.target.value)}
                      placeholder="Add training (e.g., AWS certifications, Leadership development)..."
                      className="leadermgr-form-input"
                      maxLength={150}
                      onKeyPress={(e) => handleKeyPress(e, addTraining)}
                    />
                    <button
                      type="button"
                      onClick={addTraining}
                      disabled={!newTraining.trim()}
                      className="leadermgr-add-training-btn"
                    >
                      ➕ Add Training
                    </button>
                  </div>
                )}

                {validationErrors.training_provided && (
                  <span className="leadermgr-error-text" role="alert">
                    {validationErrors.training_provided}
                  </span>
                )}
              </div>

              {/* Challenges & Impact Section */}
              <div className="leadermgr-form-section-group">
                <h4 className="leadermgr-section-title">
                  <span className="leadermgr-section-icon">💫</span>
                  Challenges & Impact
                </h4>
                
                <div className="leadermgr-form-group">
                  <div className="leadermgr-form-label-wrapper">
                    <label htmlFor="leadermgr-challenges-overcome" className="leadermgr-form-label">
                      Challenges Overcome
                    </label>
                    <span className="leadermgr-char-count">
                      {characterCounts.challengesOvercome}/2000
                    </span>
                  </div>
                  <textarea
                    id="leadermgr-challenges-overcome"
                    value={formData.challenges_overcome}
                    onChange={(e) => handleInputChange('challenges_overcome', e.target.value)}
                    className={`leadermgr-form-textarea ${validationErrors.challenges_overcome ? 'leadermgr-error' : ''}`}
                    placeholder="Describe major challenges you overcame in this leadership role..."
                    rows={4}
                    maxLength={2000}
                  />
                  {validationErrors.challenges_overcome && (
                    <span className="leadermgr-error-text" role="alert">
                      {validationErrors.challenges_overcome}
                    </span>
                  )}
                </div>

                <div className="leadermgr-form-group">
                  <div className="leadermgr-form-label-wrapper">
                    <label htmlFor="leadermgr-impact" className="leadermgr-form-label">
                      Impact on Organization
                    </label>
                    <span className="leadermgr-char-count">
                      {characterCounts.impact}/2000
                    </span>
                  </div>
                  <textarea
                    id="leadermgr-impact"
                    value={formData.impact}
                    onChange={(e) => handleInputChange('impact', e.target.value)}
                    className={`leadermgr-form-textarea ${validationErrors.impact ? 'leadermgr-error' : ''}`}
                    placeholder="Describe the impact you made on the organization..."
                    rows={4}
                    maxLength={2000}
                  />
                  {validationErrors.impact && (
                    <span className="leadermgr-error-text" role="alert">
                      {validationErrors.impact}
                    </span>
                  )}
                </div>
              </div>

              {/* Leadership Settings Section */}
              <div className="leadermgr-form-section-group">
                <h4 className="leadermgr-section-title">
                  <span className="leadermgr-section-icon">⚙️</span>
                  Leadership Settings
                </h4>
                
                <div className="leadermgr-form-row">
                  <div className="leadermgr-form-group">
                    <div className="leadermgr-form-label-wrapper">
                      <label htmlFor="leadermgr-status" className="leadermgr-form-label">
                        Record Status
                      </label>
                    </div>
                    <select
                      id="leadermgr-status"
                      value={formData.status}
                      onChange={(e) => handleInputChange('status', e.target.value)}
                      className="leadermgr-form-select"
                    >
                      <option value="active">Active</option>
                      <option value="draft">Draft</option>
                      <option value="archived">Archived</option>
                    </select>
                  </div>

                  <div className="leadermgr-form-group">
                    <div className="leadermgr-checkbox-wrapper">
                      <input
                        id="leadermgr-is-featured"
                        type="checkbox"
                        checked={formData.is_featured}
                        onChange={(e) => handleInputChange('is_featured', e.target.checked)}
                        className="leadermgr-form-checkbox"
                      />
                      <label htmlFor="leadermgr-is-featured" className="leadermgr-checkbox-label">
                        Featured Leadership Position
                      </label>
                    </div>
                    <p className="leadermgr-form-help">
                      Check this to highlight this position on your portfolio
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Preview Section */}
        {uiState.showPreview && (viewMode === 'add' || viewMode === 'edit') && (
          <div className="leadermgr-preview-section">
            <div className="leadermgr-preview-container leadermgr-glass-card">
              <h3 className="leadermgr-preview-title">
                <span className="leadermgr-preview-icon">👁️</span>
                Live Preview
              </h3>
              
              <div className="leadermgr-leadership-preview">
                <div className="leadermgr-preview-leadership-card">
                  
                  {/* Preview Header */}
                  <div className="leadermgr-preview-card-header">
                    <div className="leadermgr-preview-organization-initials">
                      {(formData.organization || 'ORG').substring(0, 3).toUpperCase()}
                    </div>

                    <div className="leadermgr-preview-status-indicators">
                      {formData.is_current && (
                        <div className="leadermgr-preview-status-badge leadermgr-current">
                          <span className="leadermgr-badge-text">CURRENT</span>
                        </div>
                      )}
                      {formData.is_featured && (
                        <div className="leadermgr-preview-featured-badge">
                          <span className="leadermgr-badge-text">FEATURED</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Preview Title */}
                  <div className="leadermgr-preview-title-section">
                    <h3 className="leadermgr-preview-position-title">
                      {formData.title || 'Position Title'}
                    </h3>
                    <div className="leadermgr-preview-title-underline"></div>
                  </div>

                  {/* Preview Organization Info */}
                  <div className="leadermgr-preview-organization-section">
                    <h4 className="leadermgr-preview-organization-name">
                      {formData.organization || 'Organization Name'}
                    </h4>
                    {formData.organization_type && (
                      <p className="leadermgr-preview-org-type">Type: {formData.organization_type}</p>
                    )}
                    {formData.location && (
                      <p className="leadermgr-preview-location">📍 {formData.location}</p>
                    )}
                  </div>

                  {/* Preview Meta */}
                  <div className="leadermgr-preview-meta-section">
                    <div className="leadermgr-preview-meta-row">
                      <div className="leadermgr-preview-meta-item">
                        <span className="leadermgr-meta-label">Duration</span>
                        <span className="leadermgr-meta-value">
                          {formData.start_date && (formData.end_date || formData.is_current)
                            ? `${new Date(formData.start_date).getFullYear()} - ${formData.is_current ? 'Present' : new Date(formData.end_date).getFullYear()}`
                            : 'N/A'
                          }
                        </span>
                      </div>
                      <div className="leadermgr-preview-meta-item">
                        <span className="leadermgr-meta-label">Initiative</span>
                        <span className="leadermgr-meta-value">
                          {formData.initiative_type || 'N/A'}
                        </span>
                      </div>
                    </div>
                    {(formData.team_size || formData.budget_managed) && (
                      <div className="leadermgr-preview-meta-row">
                        {formData.team_size && (
                          <div className="leadermgr-preview-meta-item">
                            <span className="leadermgr-meta-label">Team Size</span>
                            <span className="leadermgr-meta-value">{formData.team_size}</span>
                          </div>
                        )}
                        {formData.budget_managed && (
                          <div className="leadermgr-preview-meta-item">
                            <span className="leadermgr-meta-label">Budget</span>
                            <span className="leadermgr-meta-value">{formData.budget_managed}</span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Preview Description */}
                  {formData.description && (
                    <div className="leadermgr-preview-description-section">
                      <p className="leadermgr-preview-description-text">
                        {formData.description}
                      </p>
                    </div>
                  )}

                  {/* Preview Detailed Information */}
                  <div className="leadermgr-preview-detailed-section">
                    <h4 className="leadermgr-preview-section-title">Leadership Details</h4>
                    
                    {formData.key_responsibilities.length > 0 && (
                      <div className="leadermgr-preview-detail-group">
                        <div className="leadermgr-preview-detail-header">
                          <span className="leadermgr-detail-icon">✅</span>
                          <span className="leadermgr-detail-title">Key Responsibilities ({formData.key_responsibilities.length})</span>
                        </div>
                        <ul className="leadermgr-preview-responsibilities-list">
                          {formData.key_responsibilities.slice(0, 6).map((responsibility, index) => (
                            <li key={index} className="leadermgr-preview-responsibility-item">
                              <span className="leadermgr-responsibility-bullet">▸</span>
                              <span className="leadermgr-responsibility-text">{responsibility}</span>
                            </li>
                          ))}
                          {formData.key_responsibilities.length > 6 && (
                            <li className="leadermgr-preview-responsibility-item leadermgr-more">
                              <span className="leadermgr-responsibility-bullet">▸</span>
                              <span className="leadermgr-responsibility-text">
                                +{formData.key_responsibilities.length - 6} more responsibilities
                              </span>
                            </li>
                          )}
                        </ul>
                      </div>
                    )}

                    {formData.achievements.length > 0 && (
                      <div className="leadermgr-preview-detail-group">
                        <div className="leadermgr-preview-detail-header">
                          <span className="leadermgr-detail-icon">🏆</span>
                          <span className="leadermgr-detail-title">Key Achievements ({formData.achievements.length})</span>
                        </div>
                        <ul className="leadermgr-preview-achievements-list">
                          {formData.achievements.map((achievement, index) => (
                            <li key={index} className="leadermgr-preview-achievement-item">
                              <span className="leadermgr-achievement-bullet">⭐</span>
                              <span className="leadermgr-achievement-text">{achievement}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {formData.skills_developed.length > 0 && (
                      <div className="leadermgr-preview-detail-group">
                        <div className="leadermgr-preview-detail-header">
                          <span className="leadermgr-detail-icon">🎯</span>
                          <span className="leadermgr-detail-title">Skills Developed ({formData.skills_developed.length})</span>
                        </div>
                        <div className="leadermgr-preview-skills-grid">
                          {formData.skills_developed.slice(0, 8).map((skill, index) => (
                            <span key={index} className="leadermgr-preview-skill-tag">
                              {skill}
                            </span>
                          ))}
                          {formData.skills_developed.length > 8 && (
                            <span className="leadermgr-preview-skill-tag leadermgr-skill-more">
                              +{formData.skills_developed.length - 8}
                            </span>
                          )}
                        </div>
                      </div>
                    )}

                    {formData.recognition_received.length > 0 && (
                      <div className="leadermgr-preview-detail-group">
                        <div className="leadermgr-preview-detail-header">
                          <span className="leadermgr-detail-icon">🎖️</span>
                          <span className="leadermgr-detail-title">Recognition ({formData.recognition_received.length})</span>
                        </div>
                        <div className="leadermgr-preview-recognition-grid">
                          {formData.recognition_received.map((recognition, index) => (
                            <span key={index} className="leadermgr-preview-recognition-tag">
                              {recognition}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {(formData.challenges_overcome || formData.impact) && (
                      <div className="leadermgr-preview-detail-group">
                        <div className="leadermgr-preview-detail-header">
                          <span className="leadermgr-detail-icon">💫</span>
                          <span className="leadermgr-detail-title">Leadership Impact</span>
                        </div>
                        {formData.challenges_overcome && (
                          <div className="leadermgr-preview-impact-item">
                            <strong>Challenges Overcome:</strong>
                            <p>{formData.challenges_overcome}</p>
                          </div>
                        )}
                        {formData.impact && (
                          <div className="leadermgr-preview-impact-item">
                            <strong>Impact:</strong>
                            <p>{formData.impact}</p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Preview Status */}
              <div className="leadermgr-preview-status">
                <span className={`leadermgr-status-indicator ${formData.status}`}>
                  {formData.status === 'active' && '🟢 Active'}
                  {formData.status === 'draft' && '🟡 Draft'}
                  {formData.status === 'archived' && '🔴 Archived'}
                </span>
                <span className="leadermgr-leadership-status-indicator">
                  👑 {formData.is_current ? 'Current Position' : 'Past Position'}
                </span>
                {formData.is_featured && (
                  <span className="leadermgr-featured-status-indicator">
                    ⭐ Featured Leadership
                  </span>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default LeadershipManager;