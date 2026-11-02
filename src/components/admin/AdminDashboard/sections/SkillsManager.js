import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useSupabase } from '../../../../hooks/useSupabase';
import LoadingSpinner from '../../../common/LoadingSpinner';
import './SkillsManager.css';
import { triggerPublicRefresh } from '../../../../services/adminDataService';

const SkillsManager = () => {
  // ============================================================================
  // DATA FETCHING WITH OPTIMIZED useSupabase HOOK
  // ============================================================================
  
  const { 
    data: skillsData, 
    loading: dataLoading, 
    error: dataError,
    refetch 
  } = useSupabase('skills', {}, { 
    orderBy: [
      { column: 'skill_type_priority', ascending: true }, 
      { column: 'skill_type', ascending: true },
      { column: 'is_featured', ascending: false },
      { column: 'order_index', ascending: true },
      { column: 'skill_name', ascending: true }
    ],
    cacheKey: 'skills-admin'
  });

  // ============================================================================
  // STATE MANAGEMENT - ORGANIZED AND OPTIMIZED
  // ============================================================================
  
  // View state management
  const [viewMode, setViewMode] = useState('list'); // 'list', 'add', 'edit'
  const [selectedSkill, setSelectedSkill] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterSkillType, setFilterSkillType] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterFeatured, setFilterFeatured] = useState('all');

  // Form state with proper initial values
  const [formData, setFormData] = useState({
    skill_name: '',
    category: '',
    skill_type: '',
    proficiency_level: null,
    icon_url: '',
    description: '',
    certifications: [],
    projects_used: [],
    learning_source: '',
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
  const [newCertification, setNewCertification] = useState('');
  const [newProject, setNewProject] = useState('');

  // File upload state
  const [iconUploading, setIconUploading] = useState(false);
  const [certificateUploading, setCertificateUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  // Delete confirmation modal state
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [skillToDelete, setSkillToDelete] = useState(null);
  const [showCertificateDeleteModal, setShowCertificateDeleteModal] = useState(false);
  const [certificateToDelete, setCertificateToDelete] = useState(null);

  // Category reordering state
  const [isReorderingCategory, setIsReorderingCategory] = useState(false);

  // Skill type options (predefined categories)
  const skillTypes = useMemo(() => [
    'Programming Languages',
    'Frontend Development',
    'Backend Development',
    'Database Technologies',
    'Cloud Platforms',
    'DevOps & Tools',
    'Mobile Development',
    'Data Science & Analytics',
    'Machine Learning & AI',
    'Cybersecurity',
    'Software Testing',
    'Project Management',
    'Design & UI/UX',
    'Version Control',
    'Operating Systems',
    'Networking',
    'Other'
  ], []);

  // Learning source options
  const learningSources = [
    'University/College',
    'Online Courses',
    'Self-learning',
    'Bootcamp',
    'Work Experience',
    'Mentorship',
    'Certification Programs',
    'Books & Documentation',
    'Open Source Contributions',
    'Personal Projects',
    'YouTube & Tutorials',
    'Professional Training'
  ];

  // ============================================================================
  // MEMOIZED VALUES FOR PERFORMANCE
  // ============================================================================
  
  const characterCounts = useMemo(() => ({
    skillName: formData.skill_name.length,
    category: formData.category.length,
    skillType: formData.skill_type.length,
    description: formData.description.length,
    learningSource: formData.learning_source.length,
    certificationsCount: formData.certifications.length,
    projectsCount: formData.projects_used.length
  }), [formData]);

  // Group skills by skill_type for display, ordered by skill_type_priority
  const groupedSkills = useMemo(() => {
    if (!skillsData) return {};
    
    // First, group skills by skill_type
    const groups = skillsData.reduce((acc, skill) => {
      const skillType = skill.skill_type || 'Other';
      if (!acc[skillType]) {
        acc[skillType] = {
          skills: [],
          priority: skill.skill_type_priority || 999 // Default high number for unset priorities
        };
      }
      acc[skillType].skills.push(skill);
      return acc;
    }, {});

    // Convert to array and sort by priority (lower number = higher priority)
    const sortedGroups = Object.entries(groups)
      .sort(([, a], [, b]) => (a.priority || 999) - (b.priority || 999))
      .reduce((acc, [skillType, data]) => {
        acc[skillType] = data.skills;
        return acc;
      }, {});

    return sortedGroups;
  }, [skillsData]);

  const skillTypesInData = useMemo(() => {
    if (!skillsData) return [];
    return [...new Set(skillsData.map(s => s.skill_type).filter(Boolean))];
  }, [skillsData]);

  const hasUnsavedChanges = useMemo(() => {
    if (viewMode === 'list') return false;
    if (!selectedSkill && viewMode === 'edit') return false;
    
    if (viewMode === 'add') {
      return formData.skill_name.trim() !== '' || 
             formData.category.trim() !== '' ||
             formData.skill_type.trim() !== '' ||
             formData.description.trim() !== '' ||
             formData.certifications.length > 0 ||
             formData.projects_used.length > 0 ||
             formData.proficiency_level !== null;
    }

    if (viewMode === 'edit' && selectedSkill) {
      return (
        formData.skill_name !== (selectedSkill.skill_name || '') ||
        formData.category !== (selectedSkill.category || '') ||
        formData.skill_type !== (selectedSkill.skill_type || '') ||
        formData.proficiency_level !== (selectedSkill.proficiency_level || null) ||
        formData.icon_url !== (selectedSkill.icon_url || '') ||
        formData.description !== (selectedSkill.description || '') ||
        formData.learning_source !== (selectedSkill.learning_source || '') ||
        formData.is_featured !== (selectedSkill.is_featured || false) ||
        formData.status !== (selectedSkill.status || 'active') ||
        JSON.stringify(formData.certifications) !== JSON.stringify(selectedSkill.certifications || []) ||
        JSON.stringify(formData.projects_used) !== JSON.stringify(selectedSkill.projects_used || [])
      );
    }

    return uiState.hasChanges;
  }, [formData, selectedSkill, viewMode, uiState.hasChanges]);

  // ============================================================================
  // EFFECT HOOKS - OPTIMIZED DATA LOADING
  // ============================================================================
  
  // Load data into form when editing skill
  useEffect(() => {
    if (viewMode === 'edit' && selectedSkill) {
      const newFormData = {
        skill_name: selectedSkill.skill_name || '',
        category: selectedSkill.category || '',
        skill_type: selectedSkill.skill_type || '',
        proficiency_level: selectedSkill.proficiency_level || null,
        icon_url: selectedSkill.icon_url || '',
        description: selectedSkill.description || '',
        certifications: Array.isArray(selectedSkill.certifications) ? [...selectedSkill.certifications] : [],
        projects_used: Array.isArray(selectedSkill.projects_used) ? [...selectedSkill.projects_used] : [],
        learning_source: selectedSkill.learning_source || '',
        is_featured: selectedSkill.is_featured || false,
        order_index: selectedSkill.order_index,
        status: selectedSkill.status || 'active'
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
  }, [viewMode, selectedSkill]);

  // Reset form when switching to add mode
  useEffect(() => {
    if (viewMode === 'add') {
      setFormData({
        skill_name: '',
        category: '',
        skill_type: '',
        proficiency_level: null,
        icon_url: '',
        description: '',
        certifications: [],
        projects_used: [],
        learning_source: '',
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
      
      // Validate proficiency level range
      if (field === 'proficiency_level') {
        if (value !== null && value !== '' && (value < 1 || value > 10)) {
          return prev; // Don't update if out of range
        }
        newData[field] = value === '' ? null : parseInt(value);
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

  const addCertification = useCallback(() => {
    const trimmedCertification = newCertification.trim();
    
    if (trimmedCertification && 
        trimmedCertification.length <= 300 && 
        formData.certifications.length < 20 &&
        !formData.certifications.includes(trimmedCertification)) {
      
      const updatedCertifications = [...formData.certifications, trimmedCertification];
      handleInputChange('certifications', updatedCertifications);
      setNewCertification('');
    }
  }, [newCertification, formData.certifications, handleInputChange]);

  const removeCertification = useCallback((index) => {
    const updatedCertifications = formData.certifications.filter((_, i) => i !== index);
    handleInputChange('certifications', updatedCertifications);
  }, [formData.certifications, handleInputChange]);

  const addProject = useCallback(() => {
    const trimmedProject = newProject.trim();
    
    if (trimmedProject && 
        trimmedProject.length <= 200 && 
        formData.projects_used.length < 30 &&
        !formData.projects_used.includes(trimmedProject)) {
      
      const updatedProjects = [...formData.projects_used, trimmedProject];
      handleInputChange('projects_used', updatedProjects);
      setNewProject('');
    }
  }, [newProject, formData.projects_used, handleInputChange]);

  const removeProject = useCallback((index) => {
    const updatedProjects = formData.projects_used.filter((_, i) => i !== index);
    handleInputChange('projects_used', updatedProjects);
  }, [formData.projects_used, handleInputChange]);

  // Handle Enter key for adding items
  const handleKeyPress = useCallback((e, action) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      action();
    }
  }, []);

  // ============================================================================
  // FILE UPLOAD HANDLING - ICON AND CERTIFICATES
  // ============================================================================
  
  const handleIconUpload = useCallback(async (file) => {
    if (!file) return;

    const maxSize = 5 * 1024 * 1024; // 5MB
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/svg+xml'];

    // Validate file
    if (file.size > maxSize) {
      setValidationErrors(prev => ({
        ...prev,
        icon: 'File size must be less than 5MB'
      }));
      return;
    }
    
    if (!allowedTypes.includes(file.type)) {
      setValidationErrors(prev => ({
        ...prev,
        icon: 'Only JPEG, PNG, WebP, and SVG formats are allowed'
      }));
      return;
    }

    setIconUploading(true);
    setUploadProgress(0);

    try {
      // Import your upload function
      const { uploadSkillIcon } = await import('../../../../services/dataService');
      
      const skillId = selectedSkill?.id || 'temp'; // Use temp for new skills
      const skillName = formData.skill_name || 'skill';

      // Simulate upload progress
      const progressInterval = setInterval(() => {
        setUploadProgress(prev => Math.min(prev + 10, 90));
      }, 100);

      // Upload using your API
      const result = await uploadSkillIcon(file, skillId, skillName);

      clearInterval(progressInterval);
      setUploadProgress(100);

      if (result.success) {
        // Update form data with icon URL
        handleInputChange('icon_url', result.data.url);

        // Clear any validation errors
        setValidationErrors(prev => {
          const newErrors = { ...prev };
          delete newErrors.icon;
          return newErrors;
        });

        console.log('✅ Icon uploaded successfully');
      } else {
        throw new Error(result.error || 'Failed to upload icon');
      }

    } catch (error) {
      console.error('Icon upload error:', error);
      setValidationErrors(prev => ({
        ...prev,
        icon: error.message || 'Failed to upload icon'
      }));
    } finally {
      setIconUploading(false);
      setUploadProgress(0);
    }
  }, [formData.skill_name, handleInputChange, selectedSkill?.id]);

  // Add new state for icon delete modal
  const [showIconDeleteModal, setShowIconDeleteModal] = useState(false);
  const [iconToDelete, setIconToDelete] = useState(null);

  const removeIcon = useCallback(() => {
    if (formData.icon_url && selectedSkill?.id) {
      // Show delete modal for existing skills with uploaded icons
      setIconToDelete({ 
        skillId: selectedSkill.id, 
        iconUrl: formData.icon_url 
      });
      setShowIconDeleteModal(true);
    } else {
      // For new skills or no icon, just clear the form
      handleInputChange('icon_url', '');
    }
  }, [formData.icon_url, selectedSkill?.id, handleInputChange]);

  const confirmDeleteIcon = useCallback(async () => {
    if (!iconToDelete) return;

    try {
      const { deleteSkillIcon } = await import('../../../../services/dataService');
      
      const result = await deleteSkillIcon(iconToDelete.skillId, iconToDelete.iconUrl);
      
      if (result.success) {
        handleInputChange('icon_url', '');
        setUiState(prev => ({ 
          ...prev, 
          saveStatus: 'success',
          statusMessageContent: 'Icon deleted successfully from storage.'
        }));
      } else {
        throw new Error(result.error || 'Failed to delete icon');
      }
    } catch (error) {
      console.error('Delete icon error:', error);
      setUiState(prev => ({ 
        ...prev, 
        saveStatus: 'error',
        statusMessageContent: `Error deleting icon: ${error.message}`
      }));
    } finally {
      setShowIconDeleteModal(false);
      setIconToDelete(null);
    }
  }, [iconToDelete, handleInputChange]);

  const cancelDeleteIcon = useCallback(() => {
    setShowIconDeleteModal(false);
    setIconToDelete(null);
  }, []);

  const handleCertificateUpload = useCallback(async (files) => {
    if (!files || files.length === 0) return;

    const maxSize = 10 * 1024 * 1024; // 10MB for certificates
    const allowedTypes = [
      'application/pdf',
      'image/jpeg', 'image/jpg', 'image/png', 'image/webp',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ];
    const maxFiles = 5; // Maximum 5 certificates per skill

    // Validate files
    if (files.length > maxFiles) {
      setValidationErrors(prev => ({
        ...prev,
        certificates: `Maximum ${maxFiles} certificates allowed per skill`
      }));
      return;
    }

    for (const file of files) {
      if (file.size > maxSize) {
        setValidationErrors(prev => ({
          ...prev,
          certificates: `File ${file.name} is too large. Maximum size is 10MB`
        }));
        return;
      }
      if (!allowedTypes.includes(file.type)) {
        setValidationErrors(prev => ({
          ...prev,
          certificates: `File ${file.name} has invalid type. Only PDF, images, and document files are allowed`
        }));
        return;
      }
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

      const skillId = selectedSkill?.id || `temp-${Date.now()}`;
      const skillName = formData.skill_name || 'skill';
      const timestamp = Date.now();
      const sanitizedName = skillName.toLowerCase().replace(/[^a-z0-9]/g, '-');

      // Simulate upload progress
      const progressInterval = setInterval(() => {
        setUploadProgress(prev => Math.min(prev + 15, 90));
      }, 200);

      // Upload all files directly using admin client
      const uploadPromises = files.map(async (file, index) => {
        const fileExtension = file.name.split('.').pop();
        const fileName = `${sanitizedName}-cert-${timestamp}-${index + 1}.${fileExtension}`;
        const filePath = `certifications/skill_${skillId}/${fileName}`;

        console.log(`🔄 Uploading certificate: ${fileName}`);

        // Upload to Supabase Storage using admin client
        const { error: uploadError } = await supabaseAdmin.storage
          .from('skill-icons')
          .upload(filePath, file, {
            cacheControl: '3600',
            upsert: false
        });

        if (uploadError) {
          console.error(`❌ Upload failed for ${fileName}:`, uploadError);
          throw new Error(`Upload failed for ${fileName}: ${uploadError.message}`);
        }

        // Get public URL
        const { data: urlData } = supabaseAdmin.storage
          .from('skill-icons')
          .getPublicUrl(filePath);

        return urlData.publicUrl;
      });

      // Wait for all uploads to complete
      const certificateUrls = await Promise.all(uploadPromises);
      
      clearInterval(progressInterval);
      setUploadProgress(100);

      // Update form data with new certificate URLs
      const updatedCertifications = [...formData.certifications, ...certificateUrls];
      handleInputChange('certifications', updatedCertifications);

      // Clear any validation errors
      setValidationErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors.certificates;
        return newErrors;
      });

      console.log(`✅ Successfully uploaded ${certificateUrls.length} certificates`);

    } catch (error) {
      console.error('Certificate upload error:', error);
      setValidationErrors(prev => ({
        ...prev,
        certificates: error.message || 'Failed to upload certificates'
      }));
    } finally {
      setCertificateUploading(false);
      setUploadProgress(0);
    }
  }, [formData.skill_name, formData.certifications, handleInputChange, selectedSkill?.id]);

  const deleteCertificate = useCallback((certificateUrl, index) => {
    setCertificateToDelete({ 
      url: certificateUrl, 
      index, 
      type: 'certificate',
      skillId: selectedSkill?.id 
    });
    setShowCertificateDeleteModal(true);
  }, [selectedSkill?.id]);

  const confirmDeleteCertificate = useCallback(async () => {
    if (!certificateToDelete) return;

    try {
      // Check if this is an uploaded file (has supabase URL) and skill exists
      if (certificateToDelete.url && 
          certificateToDelete.url.includes('supabase') && 
          certificateToDelete.skillId) {
        
        const { deleteSkillCertificates } = await import('../../../../services/dataService');
        
        const result = await deleteSkillCertificates(
          certificateToDelete.skillId, 
          [certificateToDelete.url]
        );
        
        if (!result.success) {
          console.warn('⚠️ Failed to delete from storage:', result.error);
          // Continue anyway - the main goal is removing from the form
        }
      }

      // Remove from form data
      const updatedCertifications = formData.certifications.filter((_, i) => i !== certificateToDelete.index);
      handleInputChange('certifications', updatedCertifications);

      setUiState(prev => ({ 
        ...prev, 
        saveStatus: 'success',
        statusMessageContent: 'Certificate deleted successfully.'
      }));

    } catch (error) {
      console.error('Delete certificate error:', error);
      setUiState(prev => ({ 
        ...prev, 
        saveStatus: 'error',
        statusMessageContent: `Error deleting certificate: ${error.message}`
      }));
    } finally {
      setShowCertificateDeleteModal(false);
      setCertificateToDelete(null);
    }
  }, [certificateToDelete, formData.certifications, handleInputChange]);

  const cancelDeleteCertificate = useCallback(() => {
    setShowCertificateDeleteModal(false);
    setCertificateToDelete(null);
  }, []);

  // ============================================================================
  // FORM VALIDATION - COMPREHENSIVE AND OPTIMIZED
  // ============================================================================
  
  const validateForm = useCallback(() => {
    const errors = {};

    // Skill name validation (required, 2-100 chars)
    const skillNameTrimmed = formData.skill_name.trim();
    if (!skillNameTrimmed) {
      errors.skill_name = 'Skill name is required';
    } else if (skillNameTrimmed.length < 2) {
      errors.skill_name = 'Skill name must be at least 2 characters';
    } else if (skillNameTrimmed.length > 100) {
      errors.skill_name = 'Skill name must be less than 100 characters';
    }

    // Category validation (required, 2-100 chars)
    const categoryTrimmed = formData.category.trim();
    if (!categoryTrimmed) {
      errors.category = 'Category is required';
    } else if (categoryTrimmed.length < 2) {
      errors.category = 'Category must be at least 2 characters';
    } else if (categoryTrimmed.length > 100) {
      errors.category = 'Category must be less than 100 characters';
    }

    // Skill type validation (optional, max 100 chars)
    if (formData.skill_type && formData.skill_type.length > 100) {
      errors.skill_type = 'Skill type must be less than 100 characters';
    }

    // Proficiency level validation (optional, 1-10)
    if (formData.proficiency_level !== null && 
        (formData.proficiency_level < 1 || formData.proficiency_level > 10)) {
      errors.proficiency_level = 'Proficiency level must be between 1 and 10';
    }

    // Description validation (optional, max 1000 chars)
    if (formData.description && formData.description.length > 1000) {
      errors.description = 'Description must be less than 1000 characters';
    }

    // Learning source validation (optional, max 200 chars)
    if (formData.learning_source && formData.learning_source.length > 200) {
      errors.learning_source = 'Learning source must be less than 200 characters';
    }

    // Arrays validation
    if (formData.certifications.length > 20) {
      errors.certifications = 'Maximum 20 certifications allowed';
    }

    if (formData.projects_used.length > 30) {
      errors.projects_used = 'Maximum 30 projects allowed';
    }

    // Order index validation
    if (formData.order_index !== null && 
        (isNaN(formData.order_index) || parseInt(formData.order_index) < 0)) {
      errors.order_index = 'Order index must be a positive number';
    }

    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  }, [formData]);

  // ============================================================================
  // SAVE OPERATION - FOLLOWING WORK EXPERIENCE MANAGER PATTERN
  // ============================================================================
  
  const handleSave = useCallback(async () => {
    console.log('🚀 Starting Skill save process...');
    
    if (!validateForm()) {
      console.log('❌ Form validation failed');
      setUiState(prev => ({ ...prev, saveStatus: 'error' }));
      return;
    }

    setUiState(prev => ({ ...prev, isSaving: true, saveStatus: null }));

    try {
      // Prepare data for saving
      const saveData = {
        skill_name: formData.skill_name.trim(),
        category: formData.category.trim(),
        skill_type: formData.skill_type.trim() || null,
        proficiency_level: formData.proficiency_level,
        icon_url: formData.icon_url || null,
        description: formData.description.trim() || null,
        certifications: formData.certifications,
        projects_used: formData.projects_used,
        learning_source: formData.learning_source.trim() || null,
        is_featured: formData.is_featured,
        order_index: formData.order_index ? parseInt(formData.order_index) : null,
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
      
      if (viewMode === 'edit' && selectedSkill?.id) {
        // Update existing skill
        console.log('🔄 Updating existing skill with ID:', selectedSkill.id);
        const { data, error } = await supabaseAdmin
          .from('skills')
          .update({
            ...saveData,
            updated_at: new Date().toISOString()
          })
          .eq('id', selectedSkill.id)
          .select()
          .single();
          
        console.log('✏️ Update operation result:', data);
        console.log('❌ Update error (if any):', error);
          
        if (error) {
          console.error('💥 Update error details:', error);
          throw new Error(`Failed to update skill: ${error.message}`);
        }
        
        result = { success: true, data };
      } else {
        // Create new skill
        console.log('➕ Creating new skill');
        const { data, error } = await supabaseAdmin
          .from('skills')
          .insert([saveData])
          .select()
          .single();
          
        console.log('➕ Insert operation result:', data);
        console.log('❌ Insert error (if any):', error);
          
        if (error) {
          console.error('💥 Insert error details:', error);
          throw new Error(`Failed to create skill: ${error.message}`);
        }
        
        result = { success: true, data };
      }
      
      console.log('📥 Final save result:', result);

      if (result && result.success) {
        console.log('✅ Save successful');

        triggerPublicRefresh('skills');
        
        // Set success status immediately
        setUiState(prev => ({ 
          ...prev, 
          saveStatus: 'success',
          hasChanges: false,
          isPostSave: true
        }));

        // If this was a new skill, switch to list view after save
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
        throw new Error(result?.error || result?.message || 'Failed to save skill');
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
  }, [formData, selectedSkill, viewMode, validateForm, refetch]);

  // ============================================================================
  // UI ACTIONS - OPTIMIZED EVENT HANDLERS
  // ============================================================================
  
  const handleAddNew = useCallback(() => {
    if (hasUnsavedChanges && viewMode !== 'list') {
      if (!window.confirm('You have unsaved changes. Are you sure you want to start a new skill entry? Changes will be lost.')) {
        return;
      }
    }
    setViewMode('add');
    setSelectedSkill(null);
  }, [hasUnsavedChanges, viewMode]);

  const handleEdit = useCallback((skill) => {
    if (hasUnsavedChanges && viewMode !== 'list' && selectedSkill?.id !== skill.id) {
      if (!window.confirm('You have unsaved changes. Are you sure you want to edit a different skill? Changes will be lost.')) {
        return;
      }
    }
    setSelectedSkill(skill);
    setViewMode('edit');
  }, [hasUnsavedChanges, viewMode, selectedSkill]);

  const handleCancel = useCallback(() => {
    if (hasUnsavedChanges) {
      if (!window.confirm('You have unsaved changes. Are you sure you want to cancel? Changes will be lost.')) {
        return;
      }
    }
    setViewMode('list');
    setSelectedSkill(null);
    setValidationErrors({});
    setNewCertification('');
    setNewProject('');
    setUiState(prev => ({
      ...prev,
      hasChanges: false,
      saveStatus: null,
      isPostSave: false
    }));
  }, [hasUnsavedChanges]);

  const handleDelete = useCallback((skill) => {
    setSkillToDelete(skill);
    setShowDeleteModal(true);
  }, []);

  const confirmDeleteAction = useCallback(async () => {
    if (!skillToDelete) return;

    try {
      const { createClient } = await import('@supabase/supabase-js');
      const supabaseAdmin = createClient(
        process.env.REACT_APP_SUPABASE_URL,
        process.env.REACT_APP_SUPABASE_SERVICE_ROLE_KEY
      );

      // Delete associated files first
      if (skillToDelete.icon_url || (skillToDelete.certifications && skillToDelete.certifications.length > 0)) {
        console.log('🗑️ Cleaning up skill files...');
        
        // Delete icon if exists
        if (skillToDelete.icon_url) {
          try {
            const urlParts = skillToDelete.icon_url.split('/storage/v1/object/public/skill-icons/');
            const filePath = urlParts.length > 1 ? urlParts[1] : null;
            if (filePath) {
              await supabaseAdmin.storage.from('skill-icons').remove([filePath]);
            }
          } catch (storageError) {
            console.warn('⚠️ Failed to delete icon from storage:', storageError);
          }
        }

        // Delete certificates if exist
        if (skillToDelete.certifications && skillToDelete.certifications.length > 0) {
          try {
            const filePaths = skillToDelete.certifications
              .filter(url => url.includes('supabase'))
              .map(url => {
                const urlParts = url.split('/storage/v1/object/public/skill-icons/');
                return urlParts.length > 1 ? urlParts[1] : null;
              })
              .filter(Boolean);
            
            if (filePaths.length > 0) {
              await supabaseAdmin.storage.from('skill-icons').remove(filePaths);
            }
          } catch (storageError) {
            console.warn('⚠️ Failed to delete certificates from storage:', storageError);
          }
        }
      }

      const { error } = await supabaseAdmin
        .from('skills')
        .delete()
        .eq('id', skillToDelete.id);

      if (error) {
        throw new Error(`Failed to delete skill: ${error.message}`);
      }

      triggerPublicRefresh('skills');
      setUiState(prev => ({ 
        ...prev, 
        saveStatus: 'success',
        statusMessageContent: `Skill "${skillToDelete.skill_name}" has been deleted.`
      }));
      refetch();

    } catch (error) {
      console.error('Delete error:', error);
      setUiState(prev => ({ 
        ...prev, 
        saveStatus: 'error',
        statusMessageContent: `Error deleting skill: ${error.message}`
      }));
    } finally {
      setShowDeleteModal(false);
      setSkillToDelete(null);
    }
  }, [skillToDelete, refetch]);

  const cancelDeleteAction = useCallback(() => {
    setShowDeleteModal(false);
    setSkillToDelete(null);
  }, []);

  // Category reordering functions
  const moveCategory = useCallback(async (skillType, direction) => {
    console.log(`🔄 Moving category "${skillType}" ${direction}`);
    
    if (isReorderingCategory) return; // Prevent multiple simultaneous operations
    
    setIsReorderingCategory(true);
    
    try {
      // Get current categories with their priorities
      const categoryPriorities = new Map();
      skillsData.forEach(skill => {
        if (skill.skill_type && !categoryPriorities.has(skill.skill_type)) {
          categoryPriorities.set(skill.skill_type, skill.skill_type_priority || 999);
        }
      });
      
      // Convert to sorted array
      const sortedCategories = Array.from(categoryPriorities.entries())
        .sort(([, a], [, b]) => (a || 999) - (b || 999));
      
      // Find current index
      const currentIndex = sortedCategories.findIndex(([cat]) => cat === skillType);
      if (currentIndex === -1) return;
      
      // Calculate new index
      let newIndex;
      if (direction === 'up' && currentIndex > 0) {
        newIndex = currentIndex - 1;
      } else if (direction === 'down' && currentIndex < sortedCategories.length - 1) {
        newIndex = currentIndex + 1;
      } else {
        return; // Can't move further
      }
      
      // Swap priorities
      const [currentCategory, currentPriority] = sortedCategories[currentIndex];
      const [targetCategory, targetPriority] = sortedCategories[newIndex];
      
      // Import Supabase client
      const { createClient } = await import('@supabase/supabase-js');
      const supabaseAdmin = createClient(
        process.env.REACT_APP_SUPABASE_URL,
        process.env.REACT_APP_SUPABASE_SERVICE_ROLE_KEY
      );
      
      // Update both categories
      const { error: error1 } = await supabaseAdmin
        .from('skills')
        .update({ skill_type_priority: targetPriority })
        .eq('skill_type', currentCategory);
      
      const { error: error2 } = await supabaseAdmin
        .from('skills')
        .update({ skill_type_priority: currentPriority })
        .eq('skill_type', targetCategory);
      
      if (error1 || error2) {
        throw new Error(`Failed to reorder categories: ${error1?.message || error2?.message}`);
      }
      
      // Trigger refresh
      await refetch();
      
      // Trigger public site refresh
      triggerPublicRefresh('skills');
      
      setUiState(prev => ({ 
        ...prev, 
        saveStatus: 'success',
        statusMessageContent: `Category "${skillType}" moved ${direction} successfully.`
      }));
      
    } catch (error) {
      console.error('Category reorder error:', error);
      setUiState(prev => ({ 
        ...prev, 
        saveStatus: 'error',
        statusMessageContent: `Error reordering category: ${error.message}`
      }));
    } finally {
      setIsReorderingCategory(false);
    }
  }, [skillsData, refetch, isReorderingCategory]);

  const togglePreview = useCallback(() => {
    setUiState(prev => ({ ...prev, showPreview: !prev.showPreview }));
  }, []);

  // ============================================================================
  // LOADING STATE - STANDARDIZED PHASE 3 PATTERN
  // ============================================================================
  
  if (dataLoading && !skillsData) {
    return (
      <div className="skillmgr-loading">
        <LoadingSpinner size="large" />
        <p>Loading skills records...</p>
      </div>
    );
  }

  // ============================================================================
  // RENDER - OPTIMIZED JSX STRUCTURE
  // ============================================================================
  
  return (
    <div className="skillmgr-content-manager">
      {/* Header Section */}
      <div className="skillmgr-manager-header">
        <div className="skillmgr-header-content">
          <h2 className="skillmgr-manager-title">
            <span className="skillmgr-title-icon">⚡</span>
            Skills Management
          </h2>
          <p className="skillmgr-manager-subtitle">
            Manage your technical skills and competencies
          </p>
        </div>

        <div className="skillmgr-header-actions">
          {viewMode === 'list' ? (
            <>
              <button
                className="skillmgr-action-btn skillmgr-add-btn skillmgr-primary"
                onClick={handleAddNew}
                title="Add New Skill"
                type="button"
              >
                <span className="skillmgr-btn-icon">➕</span>
                Add Skill
              </button>
            </>
          ) : (
            <>
              <button
                className="skillmgr-action-btn skillmgr-preview-btn"
                onClick={togglePreview}
                title="Toggle Preview"
                type="button"
              >
                <span className="skillmgr-btn-icon">👁️</span>
                {uiState.showPreview ? 'Hide Preview' : 'Show Preview'}
              </button>
              <div className="skillmgr-edit-actions">
                <button
                  className="skillmgr-action-btn skillmgr-cancel-btn"
                  onClick={handleCancel}
                  disabled={uiState.isSaving}
                  title="Cancel Changes"
                  type="button"
                >
                  <span className="skillmgr-btn-icon">❌</span>
                  Cancel
                </button>
                <button
                  className="skillmgr-action-btn skillmgr-save-btn skillmgr-primary"
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
                      <span className="skillmgr-btn-icon">💾</span>
                      Save Skill
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
        <div className={`skillmgr-status-message ${uiState.saveStatus}`} role="alert">
          {uiState.saveStatus === 'success' && (
            <>
              <span className="skillmgr-status-icon">✅</span>
              <div className="skillmgr-status-content">
                <strong>Success!</strong> 
                {uiState.statusMessageContent || 'Skill has been saved successfully and is now live on your portfolio.'}
              </div>
            </>
          )}
          {uiState.saveStatus === 'error' && (
            <>
              <span className="skillmgr-status-icon">❌</span>
              <div className="skillmgr-status-content">
                <strong>Error!</strong> 
                {uiState.statusMessageContent || 'Failed to save skill. Please check your connection and try again.'}
              </div>
            </>
          )}
        </div>
      )}

      {/* Data Error */}
      {dataError && (
        <div className="skillmgr-status-message skillmgr-error" role="alert">
          <span className="skillmgr-status-icon">⚠️</span>
          Error loading skills: {
            typeof dataError === 'string' ? dataError : dataError.message || 'Unknown error'
          }
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteModal && skillToDelete && (
        <div className="skillmgr-modal-overlay">
          <div className="skillmgr-modal-content skillmgr-glass-card">
            <h3 className="skillmgr-modal-title">
              <span className="skillmgr-modal-icon">🗑️</span> Confirm Deletion
            </h3>
            <p className="skillmgr-modal-text">
              Are you sure you want to delete the skill: <strong>"{skillToDelete.skill_name}"</strong>? 
              This action cannot be undone and will also delete any associated files.
            </p>
            <div className="skillmgr-modal-actions">
              <button
                type="button"
                className="skillmgr-action-btn skillmgr-cancel-btn"
                onClick={cancelDeleteAction}
              >
                <span className="skillmgr-btn-icon">❌</span> Cancel
              </button>
              <button
                type="button"
                className="skillmgr-action-btn skillmgr-delete-btn-confirm skillmgr-primary"
                onClick={confirmDeleteAction}
              >
                <span className="skillmgr-btn-icon">🗑️</span> Delete Skill
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Certificate Delete Confirmation Modal */}
      {showCertificateDeleteModal && certificateToDelete && (
        <div className="skillmgr-modal-overlay">
          <div className="skillmgr-modal-content skillmgr-glass-card">
            <h3 className="skillmgr-modal-title">
              <span className="skillmgr-modal-icon">🗑️</span> Delete Certificate
            </h3>
            <p className="skillmgr-modal-text">
              Are you sure you want to delete this certificate? This action cannot be undone.
            </p>
            <div className="skillmgr-modal-actions">
              <button
                type="button"
                className="skillmgr-action-btn skillmgr-cancel-btn"
                onClick={cancelDeleteCertificate}
              >
                <span className="skillmgr-btn-icon">❌</span> Cancel
              </button>
              <button
                type="button"
                className="skillmgr-action-btn skillmgr-delete-btn-confirm skillmgr-primary"
                onClick={confirmDeleteCertificate}
              >
                <span className="skillmgr-btn-icon">🗑️</span> Delete Certificate
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Icon Delete Confirmation Modal */}
      {showIconDeleteModal && iconToDelete && (
        <div className="skillmgr-modal-overlay">
          <div className="skillmgr-modal-content skillmgr-glass-card">
            <h3 className="skillmgr-modal-title">
              <span className="skillmgr-modal-icon">🗑️</span> Delete Icon
            </h3>
            <p className="skillmgr-modal-text">
              Are you sure you want to delete this skill icon? This will permanently remove the file from storage. This action cannot be undone.
            </p>
            <div className="skillmgr-modal-actions">
              <button
                type="button"
                className="skillmgr-action-btn skillmgr-cancel-btn"
                onClick={cancelDeleteIcon}
              >
                <span className="skillmgr-btn-icon">❌</span> Cancel
              </button>
              <button
                type="button"
                className="skillmgr-action-btn skillmgr-delete-btn-confirm skillmgr-primary"
                onClick={confirmDeleteIcon}
              >
                <span className="skillmgr-btn-icon">🗑️</span> Delete Icon
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className={`skillmgr-manager-content ${uiState.showPreview ? 'skillmgr-with-preview' : ''}`}>
        
        {/* LIST VIEW */}
        {viewMode === 'list' && (
          <div className="skillmgr-list-section">
            <div className="skillmgr-list-container skillmgr-glass-card">
              
              {/* Search and Filters */}
              <div className="skillmgr-list-controls">
                <div className="skillmgr-search-section">
                  <div className="skillmgr-search-wrapper">
                    <span className="skillmgr-search-icon">🔍</span>
                    <input
                      type="text"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      placeholder="Search skills by name, category, or type..."
                      className="skillmgr-search-input"
                    />
                  </div>
                </div>
                
                <div className="skillmgr-filters-section">
                  <select
                    value={filterSkillType}
                    onChange={(e) => setFilterSkillType(e.target.value)}
                    className="skillmgr-filter-select"
                  >
                    <option value="all">All Skill Types</option>
                    {skillTypesInData.map(type => (
                      <option key={type} value={type}>{type}</option>
                    ))}
                  </select>
                  
                  <select
                    value={filterStatus}
                    onChange={(e) => setFilterStatus(e.target.value)}
                    className="skillmgr-filter-select"
                  >
                    <option value="all">All Status</option>
                    <option value="active">Active</option>
                    <option value="draft">Draft</option>
                    <option value="archived">Archived</option>
                  </select>

                  <select
                    value={filterFeatured}
                    onChange={(e) => setFilterFeatured(e.target.value)}
                    className="skillmgr-filter-select"
                  >
                    <option value="all">All Skills</option>
                    <option value="true">Featured Only</option>
                    <option value="false">Non-Featured</option>
                  </select>
                </div>
              </div>

              {/* Skills by Skill Type Groups */}
              <div className="skillmgr-grouped-skills">
                {Object.keys(groupedSkills).length === 0 ? (
                  <div className="skillmgr-no-data-message">
                    <div className="skillmgr-no-data-icon">⚡</div>
                    <h3>No Skills Found</h3>
                    <p>
                      {skillsData?.length === 0 
                        ? 'No skills have been created yet. Click "Add Skill" to get started.'
                        : 'No skills match your current filters. Try adjusting your search criteria.'
                      }
                    </p>
                  </div>
                ) : (
                  Object.entries(groupedSkills).map(([skillType, skills]) => {
                    // Filter skills within this group
                    const filteredGroupSkills = skills.filter(skill => {
                      const matchesSearch = skill.skill_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                                          skill.category?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                                          skill.skill_type?.toLowerCase().includes(searchTerm.toLowerCase());
                      const matchesSkillType = filterSkillType === 'all' || skill.skill_type === filterSkillType;
                      const matchesStatus = filterStatus === 'all' || skill.status === filterStatus;
                      const matchesFeatured = filterFeatured === 'all' || 
                                            (filterFeatured === 'true' && skill.is_featured) ||
                                            (filterFeatured === 'false' && !skill.is_featured);
                      
                      return matchesSearch && matchesSkillType && matchesStatus && matchesFeatured;
                    });

                    if (filteredGroupSkills.length === 0) return null;

                    return (
                      <div key={skillType} className="skillmgr-skill-group">
                        <div className="skillmgr-group-header">
                          <div className="skillmgr-group-title-wrapper">
                            <h3 className="skillmgr-group-title">
                              {skillType}
                              <span className="skillmgr-group-count">({filteredGroupSkills.length})</span>
                            </h3>
                            
                            {/* Simple Category Reordering Controls */}
                            <div className="skillmgr-category-controls">
                              <button
                                type="button"
                                className="skillmgr-category-move-btn"
                                onClick={() => moveCategory(skillType, 'up')}
                                disabled={isReorderingCategory}
                                title={`Move "${skillType}" category up`}
                              >
                                Up
                              </button>
                              <button
                                type="button"
                                className="skillmgr-category-move-btn"
                                onClick={() => moveCategory(skillType, 'down')}
                                disabled={isReorderingCategory}
                                title={`Move "${skillType}" category down`}
                              >
                                Down
                              </button>
                            </div>
                          </div>
                        </div>

                        <div className="skillmgr-table-wrapper">
                          <table className="skillmgr-table">
                            <thead>
                              <tr>
                                <th>Skill Name</th>
                                <th>Category</th>
                                <th>Skill Type</th>
                                <th>Proficiency</th>
                                <th>Featured</th>
                                <th>Status</th>
                                <th>Actions</th>
                              </tr>
                            </thead>
                            <tbody>
                              {filteredGroupSkills.map((skill, index) => (
                                <tr key={skill.id || index} className="skillmgr-table-row">
                                  <td className="skillmgr-skill-name">
                                    <div className="skillmgr-name-content">
                                      <h4 className="skillmgr-name-text">{skill.skill_name}</h4>
                                    </div>
                                  </td>
                                  
                                  <td className="skillmgr-category">
                                    <span className="skillmgr-category-text">{skill.category}</span>
                                  </td>
                                  
                                  <td className="skillmgr-skill-type">
                                    <span className="skillmgr-type-text">{skill.skill_type || 'N/A'}</span>
                                  </td>
                                  
                                  <td className="skillmgr-proficiency">
                                    <span className="skillmgr-proficiency-text">
                                      {skill.proficiency_level ? `${skill.proficiency_level}/10` : 'N/A'}
                                    </span>
                                  </td>
                                  
                                  <td className="skillmgr-featured">
                                    <span className={`skillmgr-featured-text ${skill.is_featured ? 'featured' : 'not-featured'}`}>
                                      {skill.is_featured ? 'TRUE' : 'FALSE'}
                                    </span>
                                  </td>
                                  
                                  <td className="skillmgr-status">
                                    <span className={`skillmgr-status-badge ${skill.status}`}>
                                      {skill.status}
                                    </span>
                                  </td>
                                  
                                  <td className="skillmgr-actions">
                                    <div className="skillmgr-action-buttons">
                                      <button
                                        className="skillmgr-action-btn-mini skillmgr-edit-btn"
                                        onClick={() => handleEdit(skill)}
                                        title="Edit Skill"
                                      >
                                        ✏️
                                      </button>
                                      <button
                                        className="skillmgr-action-btn-mini skillmgr-delete-btn"
                                        onClick={() => handleDelete(skill)}
                                        title="Delete Skill"
                                      >
                                        🗑️
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
              
              {/* Skills Summary */}
              {skillsData && skillsData.length > 0 && (
                <div className="skillmgr-summary">
                  <div className="skillmgr-summary-stats">
                    <span className="skillmgr-stat-item">
                      <strong>{skillsData.length}</strong> total skills
                    </span>
                    <span className="skillmgr-stat-item">
                      <strong>{skillsData.filter(s => s.is_featured).length}</strong> featured skills
                    </span>
                    <span className="skillmgr-stat-item">
                      <strong>{Object.keys(groupedSkills).length}</strong> skill categories
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* FORM VIEW (ADD/EDIT) */}
        {(viewMode === 'add' || viewMode === 'edit') && (
          <div className="skillmgr-form-section">
            <div className="skillmgr-form-container skillmgr-glass-card">
              
              {/* Form Title */}
              <div className="skillmgr-form-title-section">
                <h3 className="skillmgr-form-title">
                  {viewMode === 'add' ? 'Add New Skill' : `Edit: ${selectedSkill?.skill_name}`}
                </h3>
                <p className="skillmgr-form-subtitle">
                  {viewMode === 'add' 
                    ? 'Create a new skill entry for your portfolio'
                    : 'Update skill information and details'
                  }
                </p>
              </div>

              {/* Basic Information Section */}
              <div className="skillmgr-form-section-group">
                <h4 className="skillmgr-section-title">
                  <span className="skillmgr-section-icon">📋</span>
                  Basic Information
                </h4>
                
                <div className="skillmgr-form-row">
                  <div className="skillmgr-form-group">
                    <div className="skillmgr-form-label-wrapper">
                      <label htmlFor="skillmgr-skill-name" className="skillmgr-form-label skillmgr-required">
                        Skill Name
                      </label>
                      <span className="skillmgr-char-count">
                        {characterCounts.skillName}/100
                      </span>
                    </div>
                    <input
                      id="skillmgr-skill-name"
                      type="text"
                      value={formData.skill_name}
                      onChange={(e) => handleInputChange('skill_name', e.target.value)}
                      className={`skillmgr-form-input ${validationErrors.skill_name ? 'skillmgr-error' : ''}`}
                      placeholder="e.g., Python"
                      maxLength={100}
                      aria-describedby={validationErrors.skill_name ? 'skillmgr-skill-name-error' : undefined}
                    />
                    {validationErrors.skill_name && (
                      <span id="skillmgr-skill-name-error" className="skillmgr-error-text" role="alert">
                        {validationErrors.skill_name}
                      </span>
                    )}
                  </div>

                  <div className="skillmgr-form-group">
                    <div className="skillmgr-form-label-wrapper">
                      <label htmlFor="skillmgr-category" className="skillmgr-form-label skillmgr-required">
                        Category
                      </label>
                      <span className="skillmgr-char-count">
                        {characterCounts.category}/100
                      </span>
                    </div>
                    <input
                      id="skillmgr-category"
                      type="text"
                      value={formData.category}
                      onChange={(e) => handleInputChange('category', e.target.value)}
                      className={`skillmgr-form-input ${validationErrors.category ? 'skillmgr-error' : ''}`}
                      placeholder="e.g., Programming Languages"
                      maxLength={100}
                    />
                    {validationErrors.category && (
                      <span className="skillmgr-error-text" role="alert">
                        {validationErrors.category}
                      </span>
                    )}
                  </div>
                </div>

                <div className="skillmgr-form-row">
                  <div className="skillmgr-form-group">
                    <div className="skillmgr-form-label-wrapper">
                      <label htmlFor="skillmgr-skill-type" className="skillmgr-form-label">
                        Skill Type
                      </label>
                    </div>
                    <select
                      id="skillmgr-skill-type"
                      value={formData.skill_type}
                      onChange={(e) => handleInputChange('skill_type', e.target.value)}
                      className="skillmgr-form-select"
                    >
                      <option value="">Select Skill Type</option>
                      {skillTypes.map(type => (
                        <option key={type} value={type}>{type}</option>
                      ))}
                    </select>
                  </div>

                  <div className="skillmgr-form-group">
                    <div className="skillmgr-form-label-wrapper">
                      <label htmlFor="skillmgr-proficiency-level" className="skillmgr-form-label">
                        Proficiency Level (1-10)
                      </label>
                    </div>
                    <input
                      id="skillmgr-proficiency-level"
                      type="number"
                      value={formData.proficiency_level || ''}
                      onChange={(e) => handleInputChange('proficiency_level', e.target.value)}
                      className={`skillmgr-form-input ${validationErrors.proficiency_level ? 'skillmgr-error' : ''}`}
                      placeholder="e.g., 8"
                      min="1"
                      max="10"
                    />
                    {validationErrors.proficiency_level && (
                      <span className="skillmgr-error-text" role="alert">
                        {validationErrors.proficiency_level}
                      </span>
                    )}
                  </div>
                </div>

                <div className="skillmgr-form-group">
                  <div className="skillmgr-form-label-wrapper">
                    <label htmlFor="skillmgr-description" className="skillmgr-form-label">
                      Description
                    </label>
                    <span className="skillmgr-char-count">
                      {characterCounts.description}/1000
                    </span>
                  </div>
                  <textarea
                    id="skillmgr-description"
                    value={formData.description}
                    onChange={(e) => handleInputChange('description', e.target.value)}
                    className={`skillmgr-form-textarea ${validationErrors.description ? 'skillmgr-error' : ''}`}
                    placeholder="Brief description of your skill level and experience..."
                    rows={4}
                    maxLength={1000}
                  />
                  {validationErrors.description && (
                    <span className="skillmgr-error-text" role="alert">
                      {validationErrors.description}
                    </span>
                  )}
                </div>

                <div className="skillmgr-form-group">
                  <div className="skillmgr-form-label-wrapper">
                    <label htmlFor="skillmgr-learning-source" className="skillmgr-form-label">
                      Learning Source
                    </label>
                    <span className="skillmgr-char-count">
                      {characterCounts.learningSource}/200
                    </span>
                  </div>
                  <select
                    id="skillmgr-learning-source"
                    value={formData.learning_source}
                    onChange={(e) => handleInputChange('learning_source', e.target.value)}
                    className="skillmgr-form-select"
                  >
                    <option value="">Select Learning Source</option>
                    {learningSources.map(source => (
                      <option key={source} value={source}>{source}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Skill Icon Section */}
              <div className="skillmgr-form-section-group">
                <h4 className="skillmgr-section-title">
                  <span className="skillmgr-section-icon">🎨</span>
                  Skill Icon
                </h4>
                
                {formData.icon_url ? (
                  <div className="skillmgr-current-icon">
                    <div className="skillmgr-icon-preview">
                      <img 
                        src={formData.icon_url} 
                        alt="Skill Icon"
                        className="skillmgr-icon-image"
                        onError={(e) => {
                          e.target.style.display = 'none';
                        }}
                      />
                      <button
                        type="button"
                        onClick={removeIcon}
                        className="skillmgr-remove-icon-btn"
                        title="Remove icon"
                      >
                        ❌
                      </button>
                    </div>
                    <span className="skillmgr-icon-filename">Current icon</span>
                  </div>
                ) : (
                  <div className="skillmgr-upload-section">
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => e.target.files[0] && handleIconUpload(e.target.files[0])}
                      disabled={iconUploading}
                      className="skillmgr-file-input"
                      id="skillmgr-icon-upload"
                    />
                    <label htmlFor="skillmgr-icon-upload" className="skillmgr-upload-btn">
                      {iconUploading ? (
                        <>
                          <LoadingSpinner size="small" />
                          Uploading... {Math.round(uploadProgress)}%
                        </>
                      ) : (
                        <>
                          <span className="skillmgr-btn-icon">🎨</span>
                          Upload Skill Icon
                        </>
                      )}
                    </label>
                    <p className="skillmgr-upload-help">
                      Upload skill icon (JPEG, PNG, WebP, SVG, max 5MB)
                    </p>
                  </div>
                )}

                {validationErrors.icon && (
                  <span className="skillmgr-error-text" role="alert">
                    {validationErrors.icon}
                  </span>
                )}
              </div>

              {/* Certifications Section */}
              <div className="skillmgr-form-section-group">
                <h4 className="skillmgr-section-title">
                  <span className="skillmgr-section-icon">🏆</span>
                  Certifications ({characterCounts.certificationsCount}/20)
                </h4>
                
                <div className="skillmgr-certifications-list">
                  {formData.certifications.map((certification, index) => (
                    <div key={index} className="skillmgr-certification-item">
                      <span className="skillmgr-certification-text">{certification}</span>
                      <button
                        type="button"
                        onClick={() => {
                          // Check if it's a file URL or text
                          if (certification.includes('http') || certification.includes('supabase')) {
                            deleteCertificate(certification, index); // File - use modal
                          } else {
                            removeCertification(index); // Text - immediate removal
                          }
                        }}
                        className="skillmgr-remove-certification-btn"
                        title={certification.includes('http') ? "Delete certificate file" : "Remove certification"}
                      >
                        🗑️ Delete
                      </button>
                    </div>
                  ))}
                </div>

                {formData.certifications.length < 20 && (
                  <>
                    <div className="skillmgr-add-certification">
                      <input
                        type="text"
                        value={newCertification}
                        onChange={(e) => setNewCertification(e.target.value)}
                        placeholder="Add certification (e.g., AWS Certified Developer)..."
                        className="skillmgr-form-input"
                        maxLength={300}
                        onKeyPress={(e) => handleKeyPress(e, addCertification)}
                      />
                      <button
                        type="button"
                        onClick={addCertification}
                        disabled={!newCertification.trim()}
                        className="skillmgr-add-certification-btn"
                      >
                        ➕ Add Certification
                      </button>
                    </div>

                    <div className="skillmgr-upload-section">
                      <input
                        type="file"
                        accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx"
                        multiple
                        onChange={(e) => e.target.files.length > 0 && handleCertificateUpload(Array.from(e.target.files))}
                        disabled={certificateUploading}
                        className="skillmgr-file-input"
                        id="skillmgr-certificate-upload"
                      />
                      <label htmlFor="skillmgr-certificate-upload" className="skillmgr-upload-btn">
                        {certificateUploading ? (
                          <>
                            <LoadingSpinner size="small" />
                            Uploading... {Math.round(uploadProgress)}%
                          </>
                        ) : (
                          <>
                            <span className="skillmgr-btn-icon">📄</span>
                            Upload Certificate Files
                          </>
                        )}
                      </label>
                      <p className="skillmgr-upload-help">
                        Upload certificate files (PDF, Images, Documents, max 10MB each, up to 5 files)
                      </p>
                    </div>
                  </>
                )}

                {validationErrors.certifications && (
                  <span className="skillmgr-error-text" role="alert">
                    {validationErrors.certifications}
                  </span>
                )}
              </div>

              {/* Projects Used Section */}
              <div className="skillmgr-form-section-group">
                <h4 className="skillmgr-section-title">
                  <span className="skillmgr-section-icon">💼</span>
                  Projects Used ({characterCounts.projectsCount}/30)
                </h4>
                
                <div className="skillmgr-projects-list">
                  {formData.projects_used.map((project, index) => (
                    <div key={index} className="skillmgr-project-item">
                      <span className="skillmgr-project-text">{project}</span>
                      <button
                        type="button"
                        onClick={() => removeProject(index)}
                        className="skillmgr-remove-project-btn"
                        title="Remove project"
                      >
                        ❌
                      </button>
                    </div>
                  ))}
                </div>

                {formData.projects_used.length < 30 && (
                  <div className="skillmgr-add-project">
                    <input
                      type="text"
                      value={newProject}
                      onChange={(e) => setNewProject(e.target.value)}
                      placeholder="Add project (e.g., E-commerce Platform, Data Analytics Dashboard)..."
                      className="skillmgr-form-input"
                      maxLength={200}
                      onKeyPress={(e) => handleKeyPress(e, addProject)}
                    />
                    <button
                      type="button"
                      onClick={addProject}
                      disabled={!newProject.trim()}
                      className="skillmgr-add-project-btn"
                    >
                      ➕ Add Project
                    </button>
                  </div>
                )}

                {validationErrors.projects_used && (
                  <span className="skillmgr-error-text" role="alert">
                    {validationErrors.projects_used}
                  </span>
                )}
              </div>

              {/* Skill Settings Section */}
              <div className="skillmgr-form-section-group">
                <h4 className="skillmgr-section-title">
                  <span className="skillmgr-section-icon">⚙️</span>
                  Skill Settings
                </h4>
                
                <div className="skillmgr-form-row">
                  <div className="skillmgr-form-group">
                    <div className="skillmgr-checkbox-wrapper">
                      <input
                        id="skillmgr-is-featured"
                        type="checkbox"
                        checked={formData.is_featured}
                        onChange={(e) => handleInputChange('is_featured', e.target.checked)}
                        className="skillmgr-form-checkbox"
                      />
                      <label htmlFor="skillmgr-is-featured" className="skillmgr-checkbox-label">
                        Featured skill
                      </label>
                    </div>
                    <p className="skillmgr-form-help">
                      Featured skills appear prominently on your portfolio
                    </p>
                  </div>

                  <div className="skillmgr-form-group">
                    <div className="skillmgr-form-label-wrapper">
                      <label htmlFor="skillmgr-order-index" className="skillmgr-form-label">
                        Display Order
                      </label>
                    </div>
                    <input
                      id="skillmgr-order-index"
                      type="number"
                      value={formData.order_index || ''}
                      onChange={(e) => handleInputChange('order_index', e.target.value)}
                      className="skillmgr-form-input"
                      placeholder="e.g., 1"
                      min="0"
                    />
                  </div>
                </div>

                <div className="skillmgr-form-group">
                  <div className="skillmgr-form-label-wrapper">
                    <label htmlFor="skillmgr-status" className="skillmgr-form-label">
                      Skill Status
                    </label>
                  </div>
                  <select
                    id="skillmgr-status"
                    value={formData.status}
                    onChange={(e) => handleInputChange('status', e.target.value)}
                    className="skillmgr-form-select"
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
          <div className="skillmgr-preview-section">
            <div className="skillmgr-preview-container skillmgr-glass-card">
              <h3 className="skillmgr-preview-title">
                <span className="skillmgr-preview-icon">👁️</span>
                Live Preview
              </h3>
              
              <div className="skillmgr-skill-preview">
                <div className="skillmgr-preview-skill-card">
                  
                  {/* Preview Header */}
                  <div className="skillmgr-preview-card-header">
                    <div className="skillmgr-preview-skill-icon">
                      {formData.icon_url ? (
                        <img 
                          src={formData.icon_url}
                          alt="Skill Icon"
                          className="skillmgr-preview-icon-img"
                          onError={(e) => {
                            e.target.style.display = 'none';
                            e.target.nextElementSibling.style.display = 'flex';
                          }}
                        />
                      ) : null}
                      
                      <div 
                        className="skillmgr-preview-icon-temp"
                        style={{ display: formData.icon_url ? 'none' : 'flex' }}
                      >
                        {(formData.skill_name || 'SK').substring(0, 2).toUpperCase()}
                      </div>
                    </div>

                    <div className="skillmgr-preview-status-indicators">
                      {formData.is_featured && (
                        <div className="skillmgr-preview-featured-badge">
                          <span className="skillmgr-badge-text">FEATURED</span>
                        </div>
                      )}
                      {formData.proficiency_level && (
                        <div className="skillmgr-preview-proficiency-badge">
                          <span className="skillmgr-badge-text">{formData.proficiency_level}/10</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Preview Title */}
                  <div className="skillmgr-preview-title-section">
                    <h3 className="skillmgr-preview-skill-name">
                      {formData.skill_name || 'Skill Name'}
                    </h3>
                    <div className="skillmgr-preview-title-underline"></div>
                  </div>

                  {/* Preview Category Info */}
                  <div className="skillmgr-preview-category-section">
                    <h4 className="skillmgr-preview-category-name">
                      {formData.category || 'Category'}
                    </h4>
                    {formData.skill_type && (
                      <p className="skillmgr-preview-skill-type">Type: {formData.skill_type}</p>
                    )}
                    {formData.learning_source && (
                      <p className="skillmgr-preview-learning-source">📚 {formData.learning_source}</p>
                    )}
                  </div>

                  {/* Preview Description */}
                  {formData.description && (
                    <div className="skillmgr-preview-description-section">
                      <p className="skillmgr-preview-description-text">
                        {formData.description}
                      </p>
                    </div>
                  )}

                  {/* Preview Detailed Information */}
                  <div className="skillmgr-preview-detailed-section">
                    <h4 className="skillmgr-preview-section-title">Skill Details</h4>
                    
                    {formData.certifications.length > 0 && (
                      <div className="skillmgr-preview-detail-group">
                        <div className="skillmgr-preview-detail-header">
                          <span className="skillmgr-detail-icon">🏆</span>
                          <span className="skillmgr-detail-title">Certifications ({formData.certifications.length})</span>
                        </div>
                        <ul className="skillmgr-preview-certifications-list">
                          {formData.certifications.slice(0, 5).map((certification, index) => (
                            <li key={index} className="skillmgr-preview-certification-item">
                              <span className="skillmgr-certification-bullet">🎖️</span>
                              <span className="skillmgr-certification-text">{certification}</span>
                            </li>
                          ))}
                          {formData.certifications.length > 5 && (
                            <li className="skillmgr-preview-certification-item skillmgr-more">
                              <span className="skillmgr-certification-bullet">🎖️</span>
                              <span className="skillmgr-certification-text">
                                +{formData.certifications.length - 5} more certifications
                              </span>
                            </li>
                          )}
                        </ul>
                      </div>
                    )}

                    {formData.projects_used.length > 0 && (
                      <div className="skillmgr-preview-detail-group">
                        <div className="skillmgr-preview-detail-header">
                          <span className="skillmgr-detail-icon">💼</span>
                          <span className="skillmgr-detail-title">Projects Used ({formData.projects_used.length})</span>
                        </div>
                        <div className="skillmgr-preview-projects-grid">
                          {formData.projects_used.slice(0, 6).map((project, index) => (
                            <span key={index} className="skillmgr-preview-project-tag">
                              {project}
                            </span>
                          ))}
                          {formData.projects_used.length > 6 && (
                            <span className="skillmgr-preview-project-tag skillmgr-project-more">
                              +{formData.projects_used.length - 6}
                            </span>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Preview Status */}
              <div className="skillmgr-preview-status">
                <span className={`skillmgr-status-indicator ${formData.status}`}>
                  {formData.status === 'active' && '🟢 Active'}
                  {formData.status === 'draft' && '🟡 Draft'}
                  {formData.status === 'archived' && '🔴 Archived'}
                </span>
                <span className="skillmgr-skill-status-indicator">
                  ⚡ {formData.is_featured ? 'Featured Skill' : 'Regular Skill'}
                </span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default SkillsManager;