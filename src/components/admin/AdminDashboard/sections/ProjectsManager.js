// src/components/admin/AdminDashboard/sections/ProjectsManager.js

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useSupabase } from '../../../../hooks/useSupabase';
import LoadingSpinner from '../../../common/LoadingSpinner';
import './ProjectsManager.css';
import { getAdminSupabaseClient, triggerPublicRefresh } from '../../../../services/adminDataService';

import { deleteProjectImage } from '../../../../services/dataService';
import { teamLabel } from '../../../sections/Projects/projectFormat';

// UUID generation utility
const generateUUID = () => {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : ((r & 0x3) | 0x8);
    return v.toString(16);
  });
};

const ProjectsManager = () => {
  // ============================================================================
  // DATA FETCHING WITH OPTIMIZED useSupabase HOOK
  // ============================================================================
  
  const { 
    data: projectsData, 
    loading: dataLoading, 
    error: dataError,
    refetch 
  } = useSupabase('projects', {}, { 
    orderBy: [
      { column: 'order_index', ascending: true },
      { column: 'created_at', ascending: false }
    ],
    cacheKey: 'projects-admin'
  });

  // ============================================================================
  // STATE MANAGEMENT - ORGANIZED AND OPTIMIZED
  // ============================================================================
  
  // View state management
  const [viewMode, setViewMode] = useState('list'); // 'list', 'add', 'edit'
  const [selectedProject, setSelectedProject] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterType, setFilterType] = useState('all');

  // NEW: UUID for new projects (generated upfront)
  const [newProjectId, setNewProjectId] = useState(null);

  // Form state with proper initial values
  const [formData, setFormData] = useState({
    project_number: '',
    title: '',
    short_description: '',
    detailed_description: '',
    technologies: [],
    live_url: '',
    github_urls: [],
    image_urls: [],
    featured: false,
    project_type: '',
    duration: '',
    team_size: 1,
    awards: '',
    key_features: [],
    challenges: '',
    learnings: '',
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
  const [newTechnology, setNewTechnology] = useState('');
  const [newGithubUrl, setNewGithubUrl] = useState('');
  const [newFeature, setNewFeature] = useState('');

  // File upload state
  const [imageUploading, setImageUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  // Project delete confirmation modal
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [projectToDelete, setProjectToDelete] = useState(null);

  // NEW: Image delete confirmation modal
  const [showImageDeleteModal, setShowImageDeleteModal] = useState(false);
  const [imageToDelete, setImageToDelete] = useState(null);

  // Technology suggestions for autocomplete
  const technologySuggestions = [
    'React.js', 'Node.js', 'Python', 'JavaScript', 'TypeScript', 'HTML5', 'CSS3',
    'MongoDB', 'PostgreSQL', 'MySQL', 'Firebase', 'Supabase', 'AWS', 'Azure',
    'Docker', 'Kubernetes', 'Git', 'GitHub', 'Next.js', 'Express.js', 'Django',
    'Flask', 'Spring Boot', 'Angular', 'Vue.js', 'TailwindCSS', 'Bootstrap',
    'Material-UI', 'Figma', 'Adobe XD', 'Photoshop', 'Redis', 'GraphQL', 'REST API'
  ];

  // ============================================================================
  // MEMOIZED VALUES FOR PERFORMANCE
  // ============================================================================
  
  const characterCounts = useMemo(() => ({
    title: formData.title.length,
    shortDescription: formData.short_description.length,
    detailedDescription: formData.detailed_description.length,
    challenges: formData.challenges.length,
    learnings: formData.learnings.length,
    technologiesCount: formData.technologies.length,
    githubUrlsCount: formData.github_urls.length,
    featuresCount: formData.key_features.length,
    imagesCount: formData.image_urls.length
  }), [formData]);

  const filteredProjects = useMemo(() => {
    if (!projectsData) return [];
    
    return projectsData.filter(project => {
      const matchesSearch = project.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                           project.short_description?.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesStatus = filterStatus === 'all' || project.status === filterStatus;
      const matchesType = filterType === 'all' || project.project_type === filterType;
      
      return matchesSearch && matchesStatus && matchesType;
    });
  }, [projectsData, searchTerm, filterStatus, filterType]);

  const projectTypes = useMemo(() => {
    if (!projectsData) return [];
    const types = [...new Set(projectsData.map(p => p.project_type).filter(Boolean))];
    return types.sort();
  }, [projectsData]);

  const hasUnsavedChanges = useMemo(() => {
    if (viewMode === 'list') return false;
    if (!selectedProject && viewMode === 'edit') return false;
    
    if (viewMode === 'add') {
      return formData.title.trim() !== '' || 
             formData.short_description.trim() !== '' ||
             formData.technologies.length > 0 ||
             formData.github_urls.length > 0 ||
             formData.key_features.length > 0;
    }

    if (viewMode === 'edit' && selectedProject) {
      return (
        formData.title !== (selectedProject.title || '') ||
        formData.short_description !== (selectedProject.short_description || '') ||
        formData.detailed_description !== (selectedProject.detailed_description || '') ||
        formData.live_url !== (selectedProject.live_url || '') ||
        formData.project_type !== (selectedProject.project_type || '') ||
        formData.duration !== (selectedProject.duration || '') ||
        formData.team_size !== (selectedProject.team_size || 1) ||
        formData.awards !== (selectedProject.awards || '') ||
        formData.challenges !== (selectedProject.challenges || '') ||
        formData.learnings !== (selectedProject.learnings || '') ||
        formData.featured !== (selectedProject.featured || false) ||
        formData.status !== (selectedProject.status || 'active') ||
        JSON.stringify(formData.technologies) !== JSON.stringify(selectedProject.technologies || []) ||
        JSON.stringify(formData.github_urls) !== JSON.stringify(selectedProject.github_urls || []) ||
        JSON.stringify(formData.key_features) !== JSON.stringify(selectedProject.key_features || []) ||
        JSON.stringify(formData.image_urls) !== JSON.stringify(selectedProject.image_urls || [])
      );
    }

    return uiState.hasChanges;
  }, [formData, selectedProject, viewMode, uiState.hasChanges]);

  // ============================================================================
  // UTILITY FUNCTIONS FOR FILE MANAGEMENT
  // ============================================================================

  // Get current project ID for file operations
  const getCurrentProjectId = useCallback(() => {
    if (viewMode === 'edit' && selectedProject?.id) {
      return selectedProject.id;
    } else if (viewMode === 'add') {
      return newProjectId;
    }
    return null;
  }, [viewMode, selectedProject, newProjectId]);

  // Clean up entire project folder when project is deleted
  const cleanupProjectFolder = useCallback(async (projectId) => {
    try {
      const supabaseAdmin = getAdminSupabaseClient();

      // List all files in the project folder
      const { data: fileList, error: listError } = await supabaseAdmin.storage
        .from('project-images')
        .list(`projects/${projectId}`);

      if (listError) {
        console.warn('Could not list files for cleanup:', listError.message);
        return;
      }

      if (fileList && fileList.length > 0) {
        // Delete all files in the project folder
        const filesToDelete = fileList.map(file => `projects/${projectId}/${file.name}`);
        
        const { error: deleteError } = await supabaseAdmin.storage
          .from('project-images')
          .remove(filesToDelete);

        if (deleteError) {
          console.warn('Some files could not be deleted during cleanup:', deleteError.message);
        } else {
          console.log('✅ Project folder cleaned up:', projectId);
        }
      }
    } catch (error) {
      console.error('❌ Error cleaning up project folder:', error);
      // Don't throw - this is cleanup, shouldn't break the main operation
    }
  }, []);

  // ============================================================================
  // EFFECT HOOKS - OPTIMIZED DATA LOADING
  // ============================================================================
  
  // Load data into form when editing project
  useEffect(() => {
    if (viewMode === 'edit' && selectedProject) {
      const newFormData = {
        project_number: selectedProject.project_number || '',
        title: selectedProject.title || '',
        short_description: selectedProject.short_description || '',
        detailed_description: selectedProject.detailed_description || '',
        technologies: Array.isArray(selectedProject.technologies) ? [...selectedProject.technologies] : [],
        live_url: selectedProject.live_url || '',
        github_urls: Array.isArray(selectedProject.github_urls) ? [...selectedProject.github_urls] : [],
        image_urls: Array.isArray(selectedProject.image_urls) ? [...selectedProject.image_urls] : [],
        featured: selectedProject.featured || false,
        project_type: selectedProject.project_type || '',
        duration: selectedProject.duration || '',
        team_size: selectedProject.team_size || 1,
        awards: selectedProject.awards || '',
        key_features: Array.isArray(selectedProject.key_features) ? [...selectedProject.key_features] : [],
        challenges: selectedProject.challenges || '',
        learnings: selectedProject.learnings || '',
        order_index: selectedProject.order_index,
        status: selectedProject.status || 'active'
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
  }, [viewMode, selectedProject]);

  // Reset form when switching to add mode and generate new project ID
  useEffect(() => {
    if (viewMode === 'add') {
      // Generate new UUID for the project
      const newId = generateUUID();
      setNewProjectId(newId);
      
      setFormData({
        project_number: '',
        title: '',
        short_description: '',
        detailed_description: '',
        technologies: [],
        live_url: '',
        github_urls: [],
        image_urls: [],
        featured: false,
        project_type: '',
        duration: '',
        team_size: 1,
        awards: '',
        key_features: [],
        challenges: '',
        learnings: '',
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
  // DYNAMIC ARRAYS MANAGEMENT - TECHNOLOGIES, GITHUB URLS, FEATURES
  // ============================================================================
  
  const addTechnology = useCallback(() => {
    const trimmedTech = newTechnology.trim();
    
    if (trimmedTech && 
        trimmedTech.length <= 50 && 
        formData.technologies.length < 20 &&
        !formData.technologies.includes(trimmedTech)) {
      
      const updatedTechnologies = [...formData.technologies, trimmedTech];
      handleInputChange('technologies', updatedTechnologies);
      setNewTechnology('');
    }
  }, [newTechnology, formData.technologies, handleInputChange]);

  const removeTechnology = useCallback((index) => {
    const updatedTechnologies = formData.technologies.filter((_, i) => i !== index);
    handleInputChange('technologies', updatedTechnologies);
  }, [formData.technologies, handleInputChange]);

  const addGithubUrl = useCallback(() => {
    const trimmedUrl = newGithubUrl.trim();
    
    if (trimmedUrl && 
        formData.github_urls.length < 5 &&
        !formData.github_urls.includes(trimmedUrl)) {
      
      // Basic URL validation
      const urlPattern = /^https?:\/\/.+/;
      if (urlPattern.test(trimmedUrl)) {
        const updatedUrls = [...formData.github_urls, trimmedUrl];
        handleInputChange('github_urls', updatedUrls);
        setNewGithubUrl('');
      }
    }
  }, [newGithubUrl, formData.github_urls, handleInputChange]);

  const removeGithubUrl = useCallback((index) => {
    const updatedUrls = formData.github_urls.filter((_, i) => i !== index);
    handleInputChange('github_urls', updatedUrls);
  }, [formData.github_urls, handleInputChange]);

  const addFeature = useCallback(() => {
    const trimmedFeature = newFeature.trim();
    
    if (trimmedFeature && 
        trimmedFeature.length <= 150 && 
        formData.key_features.length < 10 &&
        !formData.key_features.includes(trimmedFeature)) {
      
      const updatedFeatures = [...formData.key_features, trimmedFeature];
      handleInputChange('key_features', updatedFeatures);
      setNewFeature('');
    }
  }, [newFeature, formData.key_features, handleInputChange]);

  const removeFeature = useCallback((index) => {
    const updatedFeatures = formData.key_features.filter((_, i) => i !== index);
    handleInputChange('key_features', updatedFeatures);
  }, [formData.key_features, handleInputChange]);

  // Handle Enter key for adding items
  const handleKeyPress = useCallback((e, action) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      action();
    }
  }, []);

  // ============================================================================
  // IMAGE UPLOAD HANDLING - MULTIPLE IMAGES WITH PROJECT-SPECIFIC FOLDERS
  // ============================================================================
  
  const handleImageUpload = useCallback(async (files) => {
    if (!files || files.length === 0) return;

    const maxSize = 5 * 1024 * 1024; // 5MB per file
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    const maxFiles = 10;

    // Get current project ID
    const currentProjectId = getCurrentProjectId();
    if (!currentProjectId) {
      setValidationErrors(prev => ({
        ...prev,
        images: 'Project ID not available for file upload'
      }));
      return;
    }

    // Validate files
    if (files.length > maxFiles) {
      setValidationErrors(prev => ({
        ...prev,
        images: `Maximum ${maxFiles} images allowed`
      }));
      return;
    }

    for (const file of files) {
      if (file.size > maxSize) {
        setValidationErrors(prev => ({
          ...prev,
          images: `File ${file.name} is too large. Maximum size is 5MB`
        }));
        return;
      }
      if (!allowedTypes.includes(file.type)) {
        setValidationErrors(prev => ({
          ...prev,
          images: `File ${file.name} has invalid type. Only JPEG, PNG, and WebP are allowed`
        }));
        return;
      }
    }

    setImageUploading(true);
    setUploadProgress(0);

    try {
      // Import Supabase client for file upload
      const supabaseAdmin = getAdminSupabaseClient();

      const uploadPromises = Array.from(files).map(async (file, index) => {
        const timestamp = Date.now();
        const fileExtension = file.name.split('.').pop();
        const fileName = `project-${timestamp}-${index + 1}.${fileExtension}`;
        // NEW: Project-specific folder structure
        const filePath = `projects/${currentProjectId}/${fileName}`;

        // Upload to Supabase Storage
        const { error: uploadError } = await supabaseAdmin.storage
          .from('project-images')
          .upload(filePath, file, {
            cacheControl: '3600',
            upsert: false
          });

        if (uploadError) {
          throw new Error(`Upload failed for ${fileName}: ${uploadError.message}`);
        }

        // Get public URL
        const { data: urlData } = supabaseAdmin.storage
          .from('project-images')
          .getPublicUrl(filePath);

        // Update progress
        setUploadProgress(prev => prev + (100 / files.length));

        return urlData.publicUrl;
      });

      // Wait for all uploads to complete
      const uploadedUrls = await Promise.all(uploadPromises);
      
      // Add new URLs to existing ones
      const updatedImageUrls = [...formData.image_urls, ...uploadedUrls];
      handleInputChange('image_urls', updatedImageUrls);

      // Clear any validation errors
      setValidationErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors.images;
        return newErrors;
      });

    } catch (error) {
      console.error('Image upload error:', error);
      setValidationErrors(prev => ({
        ...prev,
        images: error.message || 'Failed to upload images'
      }));
    } finally {
      setImageUploading(false);
      setUploadProgress(0);
    }
  }, [formData.image_urls, handleInputChange, getCurrentProjectId]);

  // ============================================================================
  // IMAGE DELETION WITH CONFIRMATION MODAL
  // ============================================================================

  // Handle image delete button click (shows modal)
  const handleImageDeleteClick = useCallback((index) => {
    const imageUrl = formData.image_urls[index];
    setImageToDelete({ index, url: imageUrl });
    setShowImageDeleteModal(true);
  }, [formData.image_urls]);

  // Confirm image deletion (called from modal)
  const confirmImageDelete = useCallback(async () => {
    if (!imageToDelete) return;

    const { index, url } = imageToDelete;
    const currentProjectId = getCurrentProjectId();

    try {
      // NOW THIS FUNCTION IS PROPERLY IMPORTED AND WILL WORK
      const deleteResult = await deleteProjectImage(currentProjectId, url);
      
      if (!deleteResult.success) {
        throw new Error(deleteResult.error);
      }

      // Update UI with remaining images
      const updatedImages = deleteResult.data.remainingImages;
      handleInputChange('image_urls', updatedImages);

      // Show success message
      setUiState(prev => ({ 
        ...prev, 
        saveStatus: 'success',
        statusMessageContent: 'Image deleted successfully from both storage and project.'
      }));

    } catch (error) {
      console.error('Error deleting image:', error);
      
      // Handle different error scenarios
      if (error.message.includes('not found') || error.message.includes('does not exist')) {
        // File not found in storage, remove from UI anyway
        const updatedImages = formData.image_urls.filter((_, i) => i !== index);
        handleInputChange('image_urls', updatedImages);
        
        setUiState(prev => ({ 
          ...prev, 
          saveStatus: 'success',
          statusMessageContent: 'Image removed from project (file was already deleted from storage).'
        }));
      } else {
        // Other storage errors - show error but ask user what to do
        const shouldRemoveFromUI = window.confirm(
          `Failed to delete image from storage: ${error.message}\n\nWould you like to remove it from the project anyway?`
        );
        
        if (shouldRemoveFromUI) {
          const updatedImages = formData.image_urls.filter((_, i) => i !== index);
          handleInputChange('image_urls', updatedImages);
          
          setUiState(prev => ({ 
            ...prev, 
            saveStatus: 'success',
            statusMessageContent: 'Image removed from project (but may still exist in storage).'
          }));
        } else {
          setUiState(prev => ({ 
            ...prev, 
            saveStatus: 'error',
            statusMessageContent: `Failed to delete image: ${error.message}`
          }));
        }
      }
    } finally {
      setShowImageDeleteModal(false);
      setImageToDelete(null);
    }
  }, [imageToDelete, getCurrentProjectId, formData.image_urls, handleInputChange]);

  // Cancel image deletion (called from modal)
  const cancelImageDelete = useCallback(() => {
    setShowImageDeleteModal(false);
    setImageToDelete(null);
  }, []);

  // ============================================================================
  // FORM VALIDATION - COMPREHENSIVE AND OPTIMIZED
  // ============================================================================
  
  const validateForm = useCallback(() => {
    const errors = {};

    // Title validation (required, 5-100 chars)
    const titleTrimmed = formData.title.trim();
    if (!titleTrimmed) {
      errors.title = 'Project title is required';
    } else if (titleTrimmed.length < 5) {
      errors.title = 'Project title must be at least 5 characters';
    } else if (titleTrimmed.length > 100) {
      errors.title = 'Project title must be less than 100 characters';
    }

    // Short description validation (optional, max 300 chars)
    if (formData.short_description && formData.short_description.length > 300) {
      errors.short_description = 'Short description must be less than 300 characters';
    }

    // Detailed description validation (optional, max 2000 chars)
    if (formData.detailed_description && formData.detailed_description.length > 2000) {
      errors.detailed_description = 'Detailed description must be less than 2000 characters';
    }

    // Live URL validation (basic URL check if provided)
    if (formData.live_url && formData.live_url.trim()) {
      const urlPattern = /^https?:\/\/.+/;
      if (!urlPattern.test(formData.live_url.trim())) {
        errors.live_url = 'Live URL must be a valid HTTP/HTTPS URL';
      }
    }

    // Project type validation (optional, max 50 chars)
    if (formData.project_type && formData.project_type.length > 50) {
      errors.project_type = 'Project type must be less than 50 characters';
    }

    // Duration validation (optional, max 50 chars)
    if (formData.duration && formData.duration.length > 50) {
      errors.duration = 'Duration must be less than 50 characters';
    }

    // Team size validation (1-100)
    if (formData.team_size < 1 || formData.team_size > 100) {
      errors.team_size = 'Team size must be between 1 and 100';
    }

    // Technologies validation (max 20 items)
    if (formData.technologies.length > 20) {
      errors.technologies = 'Maximum 20 technologies allowed';
    }

    // GitHub URLs validation (max 5 items)
    if (formData.github_urls.length > 5) {
      errors.github_urls = 'Maximum 5 GitHub URLs allowed';
    }

    // Key features validation (max 10 items)
    if (formData.key_features.length > 10) {
      errors.key_features = 'Maximum 10 key features allowed';
    }

    // Challenges validation (optional, max 1000 chars)
    if (formData.challenges && formData.challenges.length > 1000) {
      errors.challenges = 'Challenges must be less than 1000 characters';
    }

    // Learnings validation (optional, max 1000 chars)
    if (formData.learnings && formData.learnings.length > 1000) {
      errors.learnings = 'Learnings must be less than 1000 characters';
    }

    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  }, [formData]);

  // ============================================================================
  // SAVE OPERATION - ENHANCED WITH UUID HANDLING
  // ============================================================================
  
  const handleSave = useCallback(async () => {
    console.log('🚀 Starting Project save process...');
    
    if (!validateForm()) {
      console.log('❌ Form validation failed');
      setUiState(prev => ({ ...prev, saveStatus: 'error' }));
      return;
    }

    setUiState(prev => ({ ...prev, isSaving: true, saveStatus: null }));

    try {
      // Prepare data for saving
      const saveData = {
        project_number: formData.project_number || null,
        title: formData.title.trim(),
        short_description: formData.short_description.trim() || null,
        detailed_description: formData.detailed_description.trim() || null,
        technologies: formData.technologies,
        live_url: formData.live_url.trim() || null,
        github_urls: formData.github_urls,
        image_urls: formData.image_urls,
        featured: formData.featured,
        project_type: formData.project_type.trim() || null,
        duration: formData.duration.trim() || null,
        team_size: formData.team_size,
        awards: formData.awards.trim() || null,
        key_features: formData.key_features,
        challenges: formData.challenges.trim() || null,
        learnings: formData.learnings.trim() || null,
        order_index: formData.order_index,
        status: formData.status
      };

      console.log('📤 Sending data to save:', saveData);
      
      // Use authenticated Supabase client for admin operations
      const supabaseAdmin = getAdminSupabaseClient();
      
      console.log('🔐 Using authenticated admin access');
      
      let result;
      
      if (viewMode === 'edit' && selectedProject?.id) {
        // Update existing project
        console.log('🔄 Updating existing project with ID:', selectedProject.id);
        const { data, error } = await supabaseAdmin
          .from('projects')
          .update({
            ...saveData,
            updated_at: new Date().toISOString()
          })
          .eq('id', selectedProject.id)
          .select()
          .single();
          
        console.log('✏️ Update operation result:', data);
        console.log('❌ Update error (if any):', error);
          
        if (error) {
          console.error('💥 Update error details:', error);
          throw new Error(`Failed to update project: ${error.message}`);
        }
        
        result = { success: true, data };
      } else {
        // Create new project with the pre-generated UUID
        console.log('➕ Creating new project with ID:', newProjectId);
        const { data, error } = await supabaseAdmin
          .from('projects')
          .insert([{
            ...saveData,
            id: newProjectId // Use the pre-generated UUID
          }])
          .select()
          .single();
          
        console.log('➕ Insert operation result:', data);
        console.log('❌ Insert error (if any):', error);
          
        if (error) {
          console.error('💥 Insert error details:', error);
          throw new Error(`Failed to create project: ${error.message}`);
        }
        
        result = { success: true, data };
      }
      
      console.log('📥 Final save result:', result);

      if (result && result.success) {
        console.log('✅ Save successful');

        triggerPublicRefresh('projects');
        
        // Set success status immediately
        setUiState(prev => ({ 
          ...prev, 
          saveStatus: 'success',
          hasChanges: false,
          isPostSave: true
        }));

        // If this was a new project, switch to list view after save
        if (viewMode === 'add') {
          setTimeout(() => {
            setViewMode('list');
            setNewProjectId(null); // Reset the new project ID
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
        throw new Error(result?.error || result?.message || 'Failed to save project');
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
  }, [formData, selectedProject, viewMode, validateForm, refetch, newProjectId]);

  // ============================================================================
  // UI ACTIONS - OPTIMIZED EVENT HANDLERS
  // ============================================================================
  
  const handleAddNew = useCallback(() => {
    // Check for unsaved changes before switching
    if (hasUnsavedChanges && viewMode !== 'list') {
        if (!window.confirm('You have unsaved changes. Are you sure you want to start a new project? Changes will be lost.')) {
            return;
        }
    }
    setViewMode('add');
    setSelectedProject(null);
    // newProjectId will be generated in the useEffect
  }, [hasUnsavedChanges, viewMode]);

  const handleEdit = useCallback((project) => {
    // Check for unsaved changes before switching
    if (hasUnsavedChanges && viewMode !== 'list' && selectedProject?.id !== project.id) {
         if (!window.confirm('You have unsaved changes. Are you sure you want to edit a different project? Changes will be lost.')) {
            return;
        }
    }
    setSelectedProject(project);
    setViewMode('edit');
    setNewProjectId(null); // Clear any new project ID
  }, [hasUnsavedChanges, viewMode, selectedProject]);

  const handleCancel = useCallback(() => {
    // Check for unsaved changes before cancelling
    if (hasUnsavedChanges) {
        if (!window.confirm('You have unsaved changes. Are you sure you want to cancel? Changes will be lost.')) {
            return;
        }
    }
    setViewMode('list');
    setSelectedProject(null);
    setNewProjectId(null); // Clear any new project ID
    setValidationErrors({});
    setNewTechnology('');
    setNewGithubUrl('');
    setNewFeature('');
    setUiState(prev => ({
      ...prev,
      hasChanges: false,
      saveStatus: null,
      isPostSave: false
    }));
  }, [hasUnsavedChanges]);

  // Project delete - opens confirmation modal
  const handleDelete = useCallback((project) => {
    setProjectToDelete(project);
    setShowDeleteModal(true);
  }, []);

  // Confirm project deletion with file cleanup
  const confirmDeleteAction = useCallback(async () => {
    if (!projectToDelete) return;

    try {
      // First, clean up project files
      if (projectToDelete.id) {
        await cleanupProjectFolder(projectToDelete.id);
      }

      // Then delete the project from database
      const supabaseAdmin = getAdminSupabaseClient();

      const { error } = await supabaseAdmin
        .from('projects')
        .delete()
        .eq('id', projectToDelete.id);

      if (error) {
        throw new Error(`Failed to delete project: ${error.message}`);
      }

      triggerPublicRefresh('projects');
      setUiState(prev => ({ 
        ...prev, 
        saveStatus: 'success', 
        statusMessageContent: `Project "${projectToDelete.title}" and all its files have been deleted.` 
      }));
      refetch();

    } catch (error) {
      console.error('Delete error:', error);
      setUiState(prev => ({ 
        ...prev, 
        saveStatus: 'error',
        statusMessageContent: `Error deleting project: ${error.message}`
      }));
    } finally {
      setShowDeleteModal(false);
      setProjectToDelete(null);
    }
  }, [projectToDelete, refetch, cleanupProjectFolder]);

  // Cancel project deletion
  const cancelDeleteAction = useCallback(() => {
    setShowDeleteModal(false);
    setProjectToDelete(null);
  }, []);

  const togglePreview = useCallback(() => {
    setUiState(prev => ({ ...prev, showPreview: !prev.showPreview }));
  }, []);

  // ============================================================================
  // LOADING STATE - STANDARDIZED PHASE 3 PATTERN
  // ============================================================================
  
  if (dataLoading && !projectsData) {
    return (
      <div className="projects-manager-loading">
        <LoadingSpinner size="large" />
        <p>Loading projects...</p>
      </div>
    );
  }

  // ============================================================================
  // RENDER - OPTIMIZED JSX STRUCTURE
  // ============================================================================
  
  return (
    <div className="projects-content-manager">
      {/* Header Section */}
      <div className="projects-manager-header">
        <div className="header-content">
          <h2 className="projects-manager-title">
            <span className="projects-title-icon">💻</span>
            Projects Management
          </h2>
          <p className="manager-subtitle">
            Manage your project portfolio and showcase technical work
          </p>
        </div>

        <div className="header-actions">
          {viewMode === 'list' ? (
            <>
              <button
                className="action-btn add-btn primary"
                onClick={handleAddNew}
                title="Add New Project"
                type="button"
              >
                <span className="btn-icon">➕</span>
                Add Project
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
                      Save Project
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
                {uiState.statusMessageContent || 'Project has been saved successfully and is now live on your portfolio.'}
              </div>
            </>
          )}
          {uiState.saveStatus === 'error' && (
            <>
              <span className="status-icon">❌</span>
              <div className="status-content">
                <strong>Error!</strong> 
                {uiState.statusMessageContent || 'Failed to save project. Please check your connection and try again.'}
              </div>
            </>
          )}
        </div>
      )}

      {/* Data Error */}
      {dataError && (
        <div className="status-message error" role="alert">
          <span className="status-icon">⚠️</span>
          Error loading projects: {
            typeof dataError === 'string' ? dataError : dataError.message || 'Unknown error'
          }
        </div>
      )}

      {/* Project Delete Confirmation Modal */}
      {showDeleteModal && projectToDelete && (
        <div className="modal-overlay">
          <div className="modal-content glass-card">
            <h3 className="modal-title">
              <span className="modal-icon">🗑️</span> Confirm Project Deletion
            </h3>
            <p className="modal-text">
              Are you sure you want to delete the project: <strong>"{projectToDelete.title}"</strong>? 
              <br/><br/>
              This will also delete all associated files from storage. This action cannot be undone.
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
                <span className="btn-icon">🗑️</span> Delete Project
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Image Delete Confirmation Modal */}
      {showImageDeleteModal && imageToDelete && (
        <div className="modal-overlay">
          <div className="modal-content glass-card">
            <h3 className="modal-title">
              <span className="modal-icon">🖼️</span> Confirm Image Deletion
            </h3>
            <p className="modal-text">
              Are you sure you want to delete this image? 
              <br/><br/>
              This will remove the image from both the project and storage. This action cannot be undone.
            </p>
            <div className="modal-actions">
              <button
                type="button"
                className="action-btn cancel-btn"
                onClick={cancelImageDelete}
              >
                <span className="btn-icon">❌</span> Cancel
              </button>
              <button
                type="button"
                className="action-btn delete-btn-confirm primary"
                onClick={confirmImageDelete}
              >
                <span className="btn-icon">🗑️</span> Delete Image
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className={`projects-manager-content ${uiState.showPreview ? 'with-preview' : ''}`}>
        
        {/* LIST VIEW */}
        {viewMode === 'list' && (
          <div className="projects-list-section">
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
                      placeholder="Search projects by title or description..."
                      className="search-input"
                    />
                  </div>
                </div>
                
                <div className="filters-section">
                  <select
                    value={filterStatus}
                    onChange={(e) => setFilterStatus(e.target.value)}
                    className="filter-select"
                  >
                    <option value="all">All Status</option>
                    <option value="active">Active</option>
                    <option value="archived">Archived</option>
                    <option value="draft">Draft</option>
                  </select>
                  
                  <select
                    value={filterType}
                    onChange={(e) => setFilterType(e.target.value)}
                    className="filter-select"
                  >
                    <option value="all">All Types</option>
                    {projectTypes.map(type => (
                      <option key={type} value={type}>{type}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Projects Table */}
              <div className="projects-table-wrapper">
                {filteredProjects.length === 0 ? (
                  <div className="no-projects-message">
                    <div className="no-projects-icon">📋</div>
                    <h3>No Projects Found</h3>
                    <p>
                      {projectsData?.length === 0 
                        ? 'No projects have been created yet. Click "Add Project" to get started.'
                        : 'No projects match your current filters. Try adjusting your search criteria.'
                      }
                    </p>
                  </div>
                ) : (
                  <table className="projects-table">
                    <thead>
                      <tr>
                        <th>Project</th>
                        <th>Type</th>
                        <th>Technologies</th>
                        <th>Status</th>
                        <th>Featured</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredProjects.map((project, index) => (
                        <tr key={project.id || index} className="project-row">
                          <td className="project-info">
                            <div className="project-main">
                              <div className="project-title-row">
                                <h4 className="project-title">{project.title}</h4>
                              </div>
                              <p className="project-description">
                                {project.short_description || 'No description available'}
                              </p>
                              <div className="project-meta">
                                {project.duration && (
                                  <span className="meta-item">📅 {project.duration}</span>
                                )}
                                {project.team_size && (
                                  <span className="meta-item">👥 {teamLabel(project.team_size)}</span>
                                )}
                              </div>
                            </div>
                          </td>
                          
                          <td className="project-type">
                            <span className="type-badge">
                              {project.project_type || 'General'}
                            </span>
                          </td>
                          
                          <td className="project-technologies">
                            <div className="tech-tags-list">
                              {(project.technologies || []).slice(0, 3).map((tech, i) => (
                                <span key={i} className="tech-tag-mini">{tech}</span>
                              ))}
                              {(project.technologies || []).length > 3 && (
                                <span className="tech-more">+{(project.technologies || []).length - 3}</span>
                              )}
                            </div>
                          </td>
                          
                          <td className="project-status">
                            <span className={`status-badge ${project.status || 'active'}`}>
                              {project.status || 'active'}
                            </span>
                          </td>
                          
                          <td className="project-featured">
                            <span className={`featured-value ${project.featured ? 'true' : 'false'}`}>
                              {project.featured ? 'TRUE' : 'FALSE'}
                            </span>
                          </td>
                          
                          <td className="project-actions">
                            <div className="action-buttons">
                              <button
                                className="action-btn-mini edit-btn"
                                onClick={() => handleEdit(project)}
                                title="Edit Project"
                              >
                                ✏️
                              </button>
                              <button
                                className="action-btn-mini delete-btn"
                                onClick={() => handleDelete(project)}
                                title="Delete Project"
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
              
              {/* Projects Summary */}
              {projectsData && projectsData.length > 0 && (
                <div className="projects-summary">
                  <div className="summary-stats">
                    <span className="stat-item">
                      <strong>{projectsData.length}</strong> total projects
                    </span>
                    <span className="stat-item">
                      <strong>{projectsData.filter(p => p.featured).length}</strong> featured
                    </span>
                    <span className="stat-item">
                      <strong>{projectsData.filter(p => p.status === 'active').length}</strong> active
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
                  {viewMode === 'add' ? 'Add New Project' : `Edit: ${selectedProject?.title}`}
                </h3>
                <p className="form-subtitle">
                  {viewMode === 'add' 
                    ? 'Create a new project entry for your portfolio'
                    : 'Update project information and details'
                  }
                </p>
                {/* Show project ID for debugging/reference */}
                {(viewMode === 'add' && newProjectId) && (
                  <div className="form-debug-info">
                    <small style={{ color: '#888', fontSize: '0.8rem' }}>
                      Project ID: {newProjectId}
                    </small>
                  </div>
                )}
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
                      <label htmlFor="project-title" className="form-label required">
                        Project Title
                      </label>
                      <span className="char-count">
                        {characterCounts.title}/100
                      </span>
                    </div>
                    <input
                      id="project-title"
                      type="text"
                      value={formData.title}
                      onChange={(e) => handleInputChange('title', e.target.value)}
                      className={`form-input ${validationErrors.title ? 'error' : ''}`}
                      placeholder="Enter project title..."
                      maxLength={100}
                      aria-describedby={validationErrors.title ? 'title-error' : undefined}
                    />
                    {validationErrors.title && (
                      <span id="title-error" className="error-text" role="alert">
                        {validationErrors.title}
                      </span>
                    )}
                  </div>

                  <div className="form-group">
                    <div className="form-label-wrapper">
                      <label htmlFor="project-type" className="form-label">
                        Project Type
                      </label>
                    </div>
                    <input
                      id="project-type"
                      type="text"
                      value={formData.project_type}
                      onChange={(e) => handleInputChange('project_type', e.target.value)}
                      className={`form-input ${validationErrors.project_type ? 'error' : ''}`}
                      placeholder="e.g., Full Stack Web Application"
                      maxLength={50}
                    />
                    {validationErrors.project_type && (
                      <span className="error-text" role="alert">
                        {validationErrors.project_type}
                      </span>
                    )}
                  </div>
                </div>

                <div className="form-group">
                  <div className="form-label-wrapper">
                    <label htmlFor="short-description" className="form-label">
                      Short Description
                    </label>
                    <span className="char-count">
                      {characterCounts.shortDescription}/300
                    </span>
                  </div>
                  <textarea
                    id="short-description"
                    value={formData.short_description}
                    onChange={(e) => handleInputChange('short_description', e.target.value)}
                    className={`form-textarea ${validationErrors.short_description ? 'error' : ''}`}
                    placeholder="Brief description of the project..."
                    rows={3}
                    maxLength={300}
                  />
                  {validationErrors.short_description && (
                    <span className="error-text" role="alert">
                      {validationErrors.short_description}
                    </span>
                  )}
                </div>

                <div className="form-group">
                  <div className="form-label-wrapper">
                    <label htmlFor="detailed-description" className="form-label">
                      Detailed Description
                    </label>
                    <span className="char-count">
                      {characterCounts.detailedDescription}/2000
                    </span>
                  </div>
                  <textarea
                    id="detailed-description"
                    value={formData.detailed_description}
                    onChange={(e) => handleInputChange('detailed_description', e.target.value)}
                    className={`form-textarea ${validationErrors.detailed_description ? 'error' : ''}`}
                    placeholder="Detailed project description, objectives, and implementation details..."
                    rows={6}
                    maxLength={2000}
                  />
                  {validationErrors.detailed_description && (
                    <span className="error-text" role="alert">
                      {validationErrors.detailed_description}
                    </span>
                  )}
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <div className="form-label-wrapper">
                      <label htmlFor="duration" className="form-label">
                        Duration
                      </label>
                    </div>
                    <input
                      id="duration"
                      type="text"
                      value={formData.duration}
                      onChange={(e) => handleInputChange('duration', e.target.value)}
                      className="form-input"
                      placeholder="e.g., 3 months, 6 weeks"
                      maxLength={50}
                    />
                  </div>

                  <div className="form-group">
                    <div className="form-label-wrapper">
                      <label htmlFor="team-size" className="form-label">
                        Team Size
                      </label>
                    </div>
                    <input
                      id="team-size"
                      type="number"
                      min="1"
                      max="100"
                      value={formData.team_size}
                      onChange={(e) => handleInputChange('team_size', parseInt(e.target.value) || 1)}
                      className={`form-input ${validationErrors.team_size ? 'error' : ''}`}
                    />
                    {validationErrors.team_size && (
                      <span className="error-text" role="alert">
                        {validationErrors.team_size}
                      </span>
                    )}
                  </div>
                </div>

                <div className="form-group">
                  <div className="form-label-wrapper">
                    <label htmlFor="awards" className="form-label">
                      Awards
                    </label>
                    <span className="char-count">{formData.awards.length}/200</span>
                  </div>
                  <input
                    id="awards"
                    type="text"
                    value={formData.awards}
                    onChange={(e) => handleInputChange('awards', e.target.value)}
                    className="form-input"
                    placeholder="Leave empty unless the project won or placed, e.g. First Prize, Example Hackathon"
                    maxLength={200}
                  />
                </div>
              </div>

              {/* Technologies Section */}
              <div className="form-section-group">
                <h4 className="section-title">
                  <span className="section-icon">🛠️</span>
                  Technologies ({characterCounts.technologiesCount}/20)
                </h4>
                
                <div className="technologies-list">
                  {formData.technologies.map((tech, index) => (
                    <div key={index} className="technology-item">
                      <span className="tech-name">{tech}</span>
                      <button
                        type="button"
                        onClick={() => removeTechnology(index)}
                        className="remove-tech-btn"
                        title="Remove technology"
                      >
                        ❌
                      </button>
                    </div>
                  ))}
                </div>

                {formData.technologies.length < 20 && (
                  <div className="add-technology">
                    <input
                      type="text"
                      value={newTechnology}
                      onChange={(e) => setNewTechnology(e.target.value)}
                      placeholder="Add technology (e.g., React.js, Python)..."
                      className="form-input"
                      maxLength={50}
                      onKeyPress={(e) => handleKeyPress(e, addTechnology)}
                      list="tech-suggestions"
                    />
                    <datalist id="tech-suggestions">
                      {technologySuggestions.map((suggestion, index) => (
                        <option key={index} value={suggestion} />
                      ))}
                    </datalist>
                    <button
                      type="button"
                      onClick={addTechnology}
                      disabled={!newTechnology.trim()}
                      className="add-tech-btn"
                    >
                      ➕ Add
                    </button>
                  </div>
                )}

                {validationErrors.technologies && (
                  <span className="error-text" role="alert">
                    {validationErrors.technologies}
                  </span>
                )}
              </div>

              {/* URLs Section */}
              <div className="form-section-group">
                <h4 className="section-title">
                  <span className="section-icon">🔗</span>
                  Project URLs
                </h4>
                
                <div className="form-group">
                  <div className="form-label-wrapper">
                    <label htmlFor="live-url" className="form-label">
                      Live Demo URL
                    </label>
                  </div>
                  <input
                    id="live-url"
                    type="url"
                    value={formData.live_url}
                    onChange={(e) => handleInputChange('live_url', e.target.value)}
                    className={`form-input ${validationErrors.live_url ? 'error' : ''}`}
                    placeholder="https://your-project-demo.com"
                  />
                  {validationErrors.live_url && (
                    <span className="error-text" role="alert">
                      {validationErrors.live_url}
                    </span>
                  )}
                </div>

                <div className="github-urls-section">
                  <div className="form-label-wrapper">
                    <label className="form-label">
                      GitHub URLs ({characterCounts.githubUrlsCount}/5)
                    </label>
                  </div>
                  
                  <div className="github-urls-list">
                    {formData.github_urls.map((url, index) => (
                      <div key={index} className="github-url-item">
                        <span className="url-text">{url}</span>
                        <button
                          type="button"
                          onClick={() => removeGithubUrl(index)}
                          className="remove-url-btn"
                          title="Remove GitHub URL"
                        >
                          ❌
                        </button>
                      </div>
                    ))}
                  </div>

                  {formData.github_urls.length < 5 && (
                    <div className="add-github-url">
                      <input
                        type="url"
                        value={newGithubUrl}
                        onChange={(e) => setNewGithubUrl(e.target.value)}
                        placeholder="https://github.com/username/repository"
                        className="form-input"
                        onKeyPress={(e) => handleKeyPress(e, addGithubUrl)}
                      />
                      <button
                        type="button"
                        onClick={addGithubUrl}
                        disabled={!newGithubUrl.trim()}
                        className="add-url-btn"
                      >
                        ➕ Add GitHub
                      </button>
                    </div>
                  )}

                  {validationErrors.github_urls && (
                    <span className="error-text" role="alert">
                      {validationErrors.github_urls}
                    </span>
                  )}
                </div>
              </div>

              {/* Key Features Section */}
              <div className="form-section-group">
                <h4 className="section-title">
                  <span className="section-icon">🔑</span>
                  Key Features ({characterCounts.featuresCount}/10)
                </h4>
                
                <div className="features-list">
                  {formData.key_features.map((feature, index) => (
                    <div key={index} className="feature-item">
                      <span className="feature-text">{feature}</span>
                      <button
                        type="button"
                        onClick={() => removeFeature(index)}
                        className="remove-feature-btn"
                        title="Remove feature"
                      >
                        ❌
                      </button>
                    </div>
                  ))}
                </div>

                {formData.key_features.length < 10 && (
                  <div className="add-feature">
                    <input
                      type="text"
                      value={newFeature}
                      onChange={(e) => setNewFeature(e.target.value)}
                      placeholder="Add key feature..."
                      className="form-input"
                      maxLength={150}
                      onKeyPress={(e) => handleKeyPress(e, addFeature)}
                    />
                    <button
                      type="button"
                      onClick={addFeature}
                      disabled={!newFeature.trim()}
                      className="add-feature-btn"
                    >
                      ➕ Add Feature
                    </button>
                  </div>
                )}

                {validationErrors.key_features && (
                  <span className="error-text" role="alert">
                    {validationErrors.key_features}
                  </span>
                )}
              </div>

              {/* Images Section - Updated with Delete Confirmation */}
              <div className="form-section-group">
                <h4 className="section-title">
                  <span className="section-icon">🖼️</span>
                  Project Images ({characterCounts.imagesCount}/10)
                </h4>
                
                <div className="images-grid">
                  {formData.image_urls.map((url, index) => (
                    <div key={index} className="image-item">
                      <div className="image-preview">
                        <img 
                          src={url} 
                          alt={`Project ${index + 1}`}
                          className="preview-img"
                          onError={(e) => {
                            e.target.style.display = 'none';
                          }}
                        />
                        <button
                          type="button"
                          onClick={() => handleImageDeleteClick(index)}
                          className="remove-image-btn"
                          title="Delete image"
                        >
                          ❌
                        </button>
                      </div>
                      <span className="image-index">Image {index + 1}</span>
                    </div>
                  ))}
                </div>

                {formData.image_urls.length < 10 && (
                  <div className="upload-section">
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      onChange={(e) => e.target.files.length > 0 && handleImageUpload(e.target.files)}
                      disabled={imageUploading}
                      className="file-input"
                      id="images-upload"
                    />
                    <label htmlFor="images-upload" className="upload-btn">
                      {imageUploading ? (
                        <>
                          <LoadingSpinner size="small" />
                          Uploading... {Math.round(uploadProgress)}%
                        </>
                      ) : (
                        <>
                          <span className="btn-icon">📷</span>
                          Upload Images
                        </>
                      )}
                    </label>
                    <p className="upload-help">
                      Select up to {10 - formData.image_urls.length} images (JPEG, PNG, WebP, max 5MB each)
                      <br/>
                      <small style={{ color: '#888', fontSize: '0.8rem' }}>
                        {viewMode === 'add' && newProjectId && (
                          <>Images will be stored in: projects/{newProjectId}/</>
                        )}
                        {viewMode === 'edit' && selectedProject?.id && (
                          <>Images will be stored in: projects/{selectedProject.id}/</>
                        )}
                      </small>
                    </p>
                  </div>
                )}

                {validationErrors.images && (
                  <span className="error-text" role="alert">
                    {validationErrors.images}
                  </span>
                )}
              </div>

              {/* Development Details Section */}
              <div className="form-section-group">
                <h4 className="section-title">
                  <span className="section-icon">🧠</span>
                  Development Details
                </h4>
                
                <div className="form-group">
                  <div className="form-label-wrapper">
                    <label htmlFor="challenges" className="form-label">
                      Challenges Faced
                    </label>
                    <span className="char-count">
                      {characterCounts.challenges}/1000
                    </span>
                  </div>
                  <textarea
                    id="challenges"
                    value={formData.challenges}
                    onChange={(e) => handleInputChange('challenges', e.target.value)}
                    className={`form-textarea ${validationErrors.challenges ? 'error' : ''}`}
                    placeholder="Describe the main challenges you encountered during development..."
                    rows={4}
                    maxLength={1000}
                  />
                  {validationErrors.challenges && (
                    <span className="error-text" role="alert">
                      {validationErrors.challenges}
                    </span>
                  )}
                </div>

                <div className="form-group">
                  <div className="form-label-wrapper">
                    <label htmlFor="learnings" className="form-label">
                      Key Learnings
                    </label>
                    <span className="char-count">
                      {characterCounts.learnings}/1000
                    </span>
                  </div>
                  <textarea
                    id="learnings"
                    value={formData.learnings}
                    onChange={(e) => handleInputChange('learnings', e.target.value)}
                    className={`form-textarea ${validationErrors.learnings ? 'error' : ''}`}
                    placeholder="What did you learn from this project? New technologies, methodologies, or insights..."
                    rows={4}
                    maxLength={1000}
                  />
                  {validationErrors.learnings && (
                    <span className="error-text" role="alert">
                      {validationErrors.learnings}
                    </span>
                  )}
                </div>
              </div>

              {/* Project Settings Section */}
              <div className="form-section-group">
                <h4 className="section-title">
                  <span className="section-icon">⚙️</span>
                  Project Settings
                </h4>
                
                <div className="form-row">
                  <div className="form-group">
                    <label className="checkbox-wrapper">
                      <input
                        type="checkbox"
                        checked={formData.featured}
                        onChange={(e) => handleInputChange('featured', e.target.checked)}
                        className="checkbox-input"
                      />
                      <span className="checkbox-custom" aria-hidden="true"></span>
                      <span className="checkbox-label">
                        Featured project (highlight in portfolio)
                      </span>
                    </label>
                  </div>

                  <div className="form-group">
                    <div className="form-label-wrapper">
                      <label htmlFor="status" className="form-label">
                        Status
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
          </div>
        )}

        {/* Preview Section - Enhanced with Project-Specific Details */}
        {uiState.showPreview && (viewMode === 'add' || viewMode === 'edit') && (
          <div className="preview-section">
            <div className="preview-container glass-card">
              <h3 className="preview-title">
                <span className="preview-icon">👁️</span>
                Live Preview
              </h3>
              
              {/* Project ID Display for Admin Reference */}
              <div className="preview-debug-info">
                <small style={{ color: '#888', fontSize: '0.8rem', marginBottom: '1rem', display: 'block' }}>
                  Project ID: {getCurrentProjectId() || 'Not assigned'}
                  {formData.image_urls.length > 0 && (
                    <><br/>Storage Path: projects/{getCurrentProjectId()}/</>
                  )}
                </small>
              </div>
              
              <div className="project-preview">
                <div className="preview-project-card">
                  
                  {/* Preview Header */}
                  <div className="preview-card-header">
                    <div className="preview-status-indicators">
                      {formData.featured && (
                        <div className="preview-status-badge featured">
                          <span className="badge-icon">⭐</span>
                          <span className="badge-text">Featured</span>
                        </div>
                      )}
                      
                      {formData.image_urls.length > 0 && (
                        <div className="preview-status-badge images">
                          <span className="badge-icon">📸</span>
                          <span className="badge-text">{formData.image_urls.length}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Preview Title */}
                  <div className="preview-title-section">
                    <h3 className="preview-project-title">
                      {formData.title || 'Project Title'}
                    </h3>
                    <div className="preview-title-underline"></div>
                  </div>

                  {/* Preview Meta */}
                  <div className="preview-meta-section">
                    <div className="preview-meta-row">
                      <div className="preview-meta-item">
                        <span className="meta-label">Type</span>
                        <span className="meta-value">{formData.project_type || 'Project'}</span>
                      </div>
                      <div className="preview-meta-item">
                        <span className="meta-label">Duration</span>
                        <span className="meta-value">{formData.duration || 'N/A'}</span>
                      </div>
                    </div>
                    <div className="preview-meta-row">
                      <div className="preview-meta-item">
                        <span className="meta-label">Team</span>
                        <span className="meta-value">{teamLabel(formData.team_size)}</span>
                      </div>
                      <div className="preview-meta-item">
                        <span className="meta-label">Status</span>
                        <span className="meta-value status">{formData.status}</span>
                      </div>
                    </div>
                  </div>

                  {/* Preview Description */}
                  <div className="preview-description-section">
                    <p className="preview-description-text">
                      {formData.short_description || 'No description available'}
                    </p>
                  </div>

                  {/* Preview Technologies */}
                  {formData.technologies.length > 0 && (
                    <div className="preview-tech-section">
                      <div className="preview-tech-header">
                        <span className="tech-icon">🛠️</span>
                        <span className="tech-title">Tech Stack</span>
                      </div>
                      <div className="preview-tech-tags">
                        {formData.technologies.slice(0, 6).map((tech, index) => (
                          <span key={index} className="preview-tech-tag">
                            {tech}
                          </span>
                        ))}
                        {formData.technologies.length > 6 && (
                          <span className="preview-tech-tag tech-more">
                            +{formData.technologies.length - 6}
                          </span>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Preview Action Buttons */}
                  <div className="preview-action-section">
                    
                    {formData.live_url && (
                      <div className="preview-action-btn demo-btn">
                        <span className="btn-icon">🚀</span>
                        <span className="btn-text">Live Demo</span>
                      </div>
                    )}

                    {formData.github_urls.map((url, index) => (
                      <div key={index} className="preview-action-btn github-btn">
                        <span className="btn-icon">📂</span>
                        <span className="btn-text">
                          GitHub{formData.github_urls.length > 1 ? ` ${index + 1}` : ''}
                        </span>
                      </div>
                    ))}

                    {formData.image_urls.length > 0 && (
                      <div className="preview-action-btn images-btn">
                        <span className="btn-icon">🖼️</span>
                        <span className="btn-text">Images ({formData.image_urls.length})</span>
                      </div>
                    )}
                  </div>

                  {/* Preview Images Gallery */}
                  {formData.image_urls.length > 0 && (
                    <div className="preview-images-section">
                      <h4 className="preview-section-title">Project Gallery</h4>
                      <div className="preview-images-grid">
                        {formData.image_urls.slice(0, 4).map((url, index) => (
                          <div key={index} className="preview-image-item">
                            <img 
                              src={url} 
                              alt={`Preview ${index + 1}`}
                              className="preview-image"
                              onError={(e) => {
                                e.target.style.display = 'none';
                              }}
                            />
                            <div className="preview-image-overlay">
                              <span className="image-number">{index + 1}</span>
                            </div>
                          </div>
                        ))}
                        {formData.image_urls.length > 4 && (
                          <div className="preview-image-item more-images">
                            <div className="more-images-content">
                              <span className="more-count">+{formData.image_urls.length - 4}</span>
                              <span className="more-text">more</span>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Preview Status */}
              <div className="preview-status">
                <span className={`status-indicator ${formData.status}`}>
                  {formData.status === 'active' && '🟢 Active'}
                  {formData.status === 'draft' && '🟡 Draft'}
                  {formData.status === 'archived' && '🔴 Archived'}
                </span>
                {formData.featured && (
                  <span className="featured-indicator">
                    ⭐ Featured Project
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

export default ProjectsManager;