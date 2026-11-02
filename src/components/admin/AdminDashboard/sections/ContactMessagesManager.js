import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useSupabase } from '../../../../hooks/useSupabase';
import LoadingSpinner from '../../../common/LoadingSpinner';
import './ContactMessagesManager.css';
import { triggerPublicRefresh } from '../../../../services/adminDataService';

const ContactMessagesManager = () => {
  // ============================================================================
  // DATA FETCHING WITH OPTIMIZED useSupabase HOOK
  // ============================================================================
  
  const { 
    data: messagesData, 
    loading: dataLoading, 
    error: dataError,
    refetch 
  } = useSupabase('contact_messages', {}, { 
    orderBy: [{ column: 'created_at', ascending: false }],
    cacheKey: 'contact-messages-admin'
  });

  // ============================================================================
  // STATE MANAGEMENT - ORGANIZED AND OPTIMIZED
  // ============================================================================
  
  // Filter and view state
  const [filterState, setFilterState] = useState({
    activeFilter: 'all', // 'all', 'unread', 'starred', 'archived', 'spam'
    searchQuery: '',
    sortBy: 'created_at', // 'created_at', 'priority', 'status'
    sortOrder: 'desc' // 'asc', 'desc'
  });

  // UI state management
  const [uiState, setUiState] = useState({
    selectedMessages: new Set(), // For bulk operations
    expandedMessage: null, // Currently expanded message ID
    showDeleteModal: false,
    messageToDelete: null,
    isDeleting: false,
    showBulkActions: false,
    actionLoading: new Set(), // Messages currently being processed
    saveStatus: null, // 'success', 'error', null
    isPostAction: false,
    lastActionType: null // 'delete', 'read', 'unread', 'star', 'archive', 'spam'
  });

  // Bulk operation state
  const [bulkState, setBulkState] = useState({
    showConfirmation: false,
    operation: null, // 'delete', 'read', 'unread', 'star', 'archive', 'spam'
    selectedCount: 0
  });

  // ============================================================================
  // MEMOIZED DATA PROCESSING - OPTIMIZED FOR PERFORMANCE
  // ============================================================================
  
  // Process and filter messages based on current filter state
  const processedMessages = useMemo(() => {
    if (!Array.isArray(messagesData)) return [];

    let filtered = [...messagesData];

    // Apply search filter
    if (filterState.searchQuery.trim()) {
      const query = filterState.searchQuery.toLowerCase();
      filtered = filtered.filter(message => 
        message.name?.toLowerCase().includes(query) ||
        message.email?.toLowerCase().includes(query) ||
        message.subject?.toLowerCase().includes(query) ||
        message.message?.toLowerCase().includes(query) ||
        message.organization?.toLowerCase().includes(query)
      );
    }

    // Apply status filter
    switch (filterState.activeFilter) {
      case 'unread':
        filtered = filtered.filter(msg => msg.status === 'unread');
        break;
      case 'starred':
        filtered = filtered.filter(msg => msg.is_starred === true);
        break;
      case 'archived':
        filtered = filtered.filter(msg => msg.is_archived === true);
        break;
      case 'spam':
        filtered = filtered.filter(msg => msg.is_spam === true);
        break;
      case 'all':
      default:
        // Show all except spam (spam only visible in spam tab)
        filtered = filtered.filter(msg => msg.is_spam !== true);
        break;
    }

    // Apply sorting
    filtered.sort((a, b) => {
      let aValue, bValue;
      
      switch (filterState.sortBy) {
        case 'priority':
          const priorityOrder = { 'urgent': 4, 'high': 3, 'normal': 2, 'low': 1 };
          aValue = priorityOrder[a.priority?.toLowerCase()] || 2;
          bValue = priorityOrder[b.priority?.toLowerCase()] || 2;
          break;
        case 'status':
          aValue = a.status === 'unread' ? 1 : 0;
          bValue = b.status === 'unread' ? 1 : 0;
          break;
        case 'created_at':
        default:
          aValue = new Date(a.created_at || 0);
          bValue = new Date(b.created_at || 0);
          break;
      }

      if (filterState.sortOrder === 'asc') {
        return aValue > bValue ? 1 : aValue < bValue ? -1 : 0;
      } else {
        return aValue < bValue ? 1 : aValue > bValue ? -1 : 0;
      }
    });

    return filtered;
  }, [messagesData, filterState]);

  // Calculate message counts for filters and dashboard
  const messageCounts = useMemo(() => {
    if (!Array.isArray(messagesData)) {
      return {
        total: 0,
        unread: 0,
        starred: 0,
        archived: 0,
        spam: 0,
        read: 0
      };
    }

    return {
      total: messagesData.filter(msg => msg.is_spam !== true).length,
      unread: messagesData.filter(msg => msg.status === 'unread' && msg.is_spam !== true).length,
      starred: messagesData.filter(msg => msg.is_starred === true).length,
      archived: messagesData.filter(msg => msg.is_archived === true).length,
      spam: messagesData.filter(msg => msg.is_spam === true).length,
      read: messagesData.filter(msg => msg.status === 'read' && msg.is_spam !== true).length
    };
  }, [messagesData]);

  // Selected messages info for bulk operations
  const selectedMessagesData = useMemo(() => {
    const selected = processedMessages.filter(msg => uiState.selectedMessages.has(msg.id));
    return {
      messages: selected,
      count: selected.length,
      allSelected: selected.length === processedMessages.length && processedMessages.length > 0,
      someSelected: selected.length > 0 && selected.length < processedMessages.length
    };
  }, [processedMessages, uiState.selectedMessages]);

  // ============================================================================
  // EFFECT HOOKS - AUTO-HIDE STATUS MESSAGES
  // ============================================================================
  
  // Auto-hide status messages
  useEffect(() => {
    if (uiState.saveStatus) {
      let timeout;
      
      if (uiState.saveStatus === 'success') {
        timeout = 4000; // 4 seconds for success messages
      } else {
        timeout = 6000; // 6 seconds for errors
      }
      
      const timer = setTimeout(() => {
        setUiState(prev => ({ 
          ...prev, 
          saveStatus: null,
          isPostAction: false,
          lastActionType: null
        }));
      }, timeout);
      
      return () => clearTimeout(timer);
    }
  }, [uiState.saveStatus]);

  // Clear selections when filter changes
  useEffect(() => {
    setUiState(prev => ({
      ...prev,
      selectedMessages: new Set(),
      showBulkActions: false
    }));
    setBulkState(prev => ({
      ...prev,
      selectedCount: 0
    }));
  }, [filterState.activeFilter]);

  // ============================================================================
  // FILTER AND SEARCH HANDLERS - OPTIMIZED EVENT HANDLING
  // ============================================================================
  
  const handleFilterChange = useCallback((newFilter) => {
    setFilterState(prev => ({
      ...prev,
      activeFilter: newFilter
    }));
  }, []);

  const handleSearchChange = useCallback((query) => {
    setFilterState(prev => ({
      ...prev,
      searchQuery: query
    }));
  }, []);

  const handleSortChange = useCallback((sortBy, sortOrder = null) => {
    setFilterState(prev => ({
      ...prev,
      sortBy,
      sortOrder: sortOrder || (prev.sortBy === sortBy && prev.sortOrder === 'desc' ? 'asc' : 'desc')
    }));
  }, []);

  // ============================================================================
  // MESSAGE SELECTION HANDLERS - OPTIMIZED FOR BULK OPERATIONS
  // ============================================================================
  
  const handleSelectMessage = useCallback((messageId) => {
    setUiState(prev => {
      const newSelected = new Set(prev.selectedMessages);
      if (newSelected.has(messageId)) {
        newSelected.delete(messageId);
      } else {
        newSelected.add(messageId);
      }
      
      return {
        ...prev,
        selectedMessages: newSelected,
        showBulkActions: newSelected.size > 0
      };
    });
  }, []);

  const handleSelectAll = useCallback(() => {
    setUiState(prev => {
      const allIds = new Set(processedMessages.map(msg => msg.id));
      const allSelected = prev.selectedMessages.size === processedMessages.length && processedMessages.length > 0;
      
      return {
        ...prev,
        selectedMessages: allSelected ? new Set() : allIds,
        showBulkActions: !allSelected && processedMessages.length > 0
      };
    });
  }, [processedMessages]);

  const handleClearSelection = useCallback(() => {
    setUiState(prev => ({
      ...prev,
      selectedMessages: new Set(),
      showBulkActions: false
    }));
    setBulkState(prev => ({
      ...prev,
      selectedCount: 0
    }));
  }, []);

  // ============================================================================
  // MESSAGE EXPANSION HANDLER
  // ============================================================================
  
  const handleToggleExpand = useCallback((messageId) => {
    setUiState(prev => ({
      ...prev,
      expandedMessage: prev.expandedMessage === messageId ? null : messageId
    }));
  }, []);

  // ============================================================================
  // ADMIN OPERATIONS - DATABASE INTERACTIONS
  // ============================================================================
  
  // Generic message update function using service key
  const updateMessage = useCallback(async (messageId, updates, actionType) => {
    console.log(`🚀 Starting ${actionType} operation for message:`, messageId);
    
    setUiState(prev => ({
      ...prev,
      actionLoading: new Set([...prev.actionLoading, messageId]),
      saveStatus: null
    }));

    try {
      // Import Supabase with service key for admin operations
      const { createClient } = await import('@supabase/supabase-js');
      
      // Create admin client with service key (bypasses RLS)
      const supabaseAdmin = createClient(
        process.env.REACT_APP_SUPABASE_URL,
        process.env.REACT_APP_SUPABASE_SERVICE_ROLE_KEY
      );
      
      console.log('🔐 Using service key for admin operations');
      
      // Add timestamp for specific actions
      const timestampedUpdates = { ...updates };
      if (actionType === 'read' && updates.status === 'read') {
        timestampedUpdates.read_at = new Date().toISOString();
      } else if (actionType === 'unread' && updates.status === 'unread') {
        timestampedUpdates.read_at = null;
      } else if (actionType === 'archive' && updates.is_archived === true) {
        timestampedUpdates.archived_at = new Date().toISOString();
      } else if (actionType === 'unarchive' && updates.is_archived === false) {
        timestampedUpdates.archived_at = null;
      } else if (actionType === 'spam' && updates.is_spam === true) {
        timestampedUpdates.marked_spam_at = new Date().toISOString();
      }

      // Update the message
      const { data, error } = await supabaseAdmin
        .from('contact_messages')
        .update({
          ...timestampedUpdates,
          updated_at: new Date().toISOString()
        })
        .eq('id', messageId)
        .select()
        .single();
        
      console.log(`✏️ ${actionType} operation result:`, data);
      console.log('❌ Update error (if any):', error);
        
      if (error) {
        console.error(`💥 ${actionType} error details:`, error);
        throw new Error(`Failed to ${actionType} message: ${error.message}`);
      }
      
      console.log(`✅ ${actionType} successful`);

      // Trigger public refresh if needed
      triggerPublicRefresh('contact_messages');
      
      // Set success status
      setUiState(prev => ({ 
        ...prev, 
        saveStatus: 'success',
        isPostAction: true,
        lastActionType: actionType
      }));
      
      // Refresh data after a brief delay
      setTimeout(() => {
        refetch();
      }, 100);
      
      return { success: true, data };
    } catch (error) {
      console.error(`💥 ${actionType} error:`, error);
      
      // Set error status
      setUiState(prev => ({ ...prev, saveStatus: 'error' }));
      
      return { success: false, error: error.message };
    } finally {
      setUiState(prev => ({
        ...prev,
        actionLoading: new Set([...prev.actionLoading].filter(id => id !== messageId))
      }));
    }
  }, [refetch]);

  // ============================================================================
  // INDIVIDUAL MESSAGE ACTIONS
  // ============================================================================
  
  const handleMarkAsRead = useCallback(async (messageId) => {
    await updateMessage(messageId, { status: 'read' }, 'read');
  }, [updateMessage]);

  const handleMarkAsUnread = useCallback(async (messageId) => {
    await updateMessage(messageId, { status: 'unread' }, 'unread');
  }, [updateMessage]);

  const handleToggleStar = useCallback(async (messageId, currentStarred) => {
    await updateMessage(messageId, { is_starred: !currentStarred }, currentStarred ? 'unstar' : 'star');
  }, [updateMessage]);

  const handleToggleArchive = useCallback(async (messageId, currentArchived) => {
    await updateMessage(messageId, { is_archived: !currentArchived }, currentArchived ? 'unarchive' : 'archive');
  }, [updateMessage]);

  const handleToggleSpam = useCallback(async (messageId, currentSpam) => {
    await updateMessage(messageId, { is_spam: !currentSpam }, currentSpam ? 'not-spam' : 'spam');
  }, [updateMessage]);

  const handleChangePriority = useCallback(async (messageId, newPriority) => {
    await updateMessage(messageId, { priority: newPriority }, `priority-${newPriority}`);
  }, [updateMessage]);

  // ============================================================================
  // DELETE OPERATIONS WITH CONFIRMATION
  // ============================================================================
  
  const handleDeleteMessage = useCallback((messageId) => {
    setUiState(prev => ({
      ...prev,
      showDeleteModal: true,
      messageToDelete: messageId
    }));
  }, []);

  const confirmDeleteMessage = useCallback(async () => {
    if (!uiState.messageToDelete) return;
    
    console.log('🗑️ Starting delete operation for message:', uiState.messageToDelete);
    
    setUiState(prev => ({
      ...prev,
      isDeleting: true,
      saveStatus: null
    }));

    try {
      // Import Supabase with service key for admin operations
      const { createClient } = await import('@supabase/supabase-js');
      
      // Create admin client with service key (bypasses RLS)
      const supabaseAdmin = createClient(
        process.env.REACT_APP_SUPABASE_URL,
        process.env.REACT_APP_SUPABASE_SERVICE_ROLE_KEY
      );
      
      console.log('🔐 Using service key for delete operation');
      
      // Hard delete the message (permanent removal)
      const { error } = await supabaseAdmin
        .from('contact_messages')
        .delete()
        .eq('id', uiState.messageToDelete);
        
      console.log('❌ Delete error (if any):', error);
        
      if (error) {
        console.error('💥 Delete error details:', error);
        throw new Error(`Failed to delete message: ${error.message}`);
      }
      
      console.log('✅ Delete successful');

      // Close modal and clear state
      setUiState(prev => ({
        ...prev,
        showDeleteModal: false,
        messageToDelete: null,
        saveStatus: 'success',
        isPostAction: true,
        lastActionType: 'delete',
        selectedMessages: new Set([...prev.selectedMessages].filter(id => id !== uiState.messageToDelete))
      }));
      
      // Refresh data after a brief delay
      setTimeout(() => {
        refetch();
      }, 100);
      
    } catch (error) {
      console.error('💥 Delete error:', error);
      
      // Set error status but keep modal open
      setUiState(prev => ({ ...prev, saveStatus: 'error' }));
      
    } finally {
      setUiState(prev => ({ ...prev, isDeleting: false }));
    }
  }, [uiState.messageToDelete, refetch]);

  const cancelDeleteMessage = useCallback(() => {
    setUiState(prev => ({
      ...prev,
      showDeleteModal: false,
      messageToDelete: null
    }));
  }, []);

  const executeBulkOperation = useCallback(async (operation, messageIds) => {
    console.log(`🚀 Executing bulk ${operation} for messages:`, messageIds);
    
    setUiState(prev => ({
      ...prev,
      actionLoading: new Set([...prev.actionLoading, ...messageIds]),
      saveStatus: null
    }));

    try {
      // Import Supabase with service key for admin operations
      const { createClient } = await import('@supabase/supabase-js');
      
      // Create admin client with service key (bypasses RLS)
      const supabaseAdmin = createClient(
        process.env.REACT_APP_SUPABASE_URL,
        process.env.REACT_APP_SUPABASE_SERVICE_ROLE_KEY
      );
      
      console.log('🔐 Using service key for bulk operations');

      let updateData = {};
      let actionType = operation;

      // Determine update data based on operation
      switch (operation) {
        case 'read':
          updateData = { status: 'read', read_at: new Date().toISOString() };
          break;
        case 'unread':
          updateData = { status: 'unread', read_at: null };
          break;
        case 'star':
          updateData = { is_starred: true };
          break;
        case 'unstar':
          updateData = { is_starred: false };
          break;
        case 'archive':
          updateData = { is_archived: true, archived_at: new Date().toISOString() };
          break;
        case 'unarchive':
          updateData = { is_archived: false, archived_at: null };
          break;
        case 'spam':
          updateData = { is_spam: true, marked_spam_at: new Date().toISOString() };
          break;
        case 'not-spam':
          updateData = { is_spam: false, marked_spam_at: null };
          actionType = 'not-spam';
          break;
        case 'delete':
          // Handle delete separately
          const { error: deleteError } = await supabaseAdmin
            .from('contact_messages')
            .delete()
            .in('id', messageIds);
            
          if (deleteError) {
            throw new Error(`Failed to delete messages: ${deleteError.message}`);
          }
          
          console.log(`✅ Bulk delete successful for ${messageIds.length} messages`);
          
          // Clear selections and close bulk confirmation
          setUiState(prev => ({
            ...prev,
            selectedMessages: new Set(),
            showBulkActions: false,
            saveStatus: 'success',
            isPostAction: true,
            lastActionType: 'bulk-delete'
          }));
          
          setBulkState(prev => ({
            ...prev,
            showConfirmation: false,
            operation: null,
            selectedCount: 0
          }));
          
          // Refresh data
          setTimeout(() => {
            refetch();
          }, 100);
          
          return;
        default:
          console.warn(`⚠️ Unknown bulk operation: ${operation}`);
          throw new Error(`Unsupported bulk operation: ${operation}`);
      }

      // For non-delete operations, update messages
      if (Object.keys(updateData).length > 0) {
        updateData.updated_at = new Date().toISOString();
        
        const { data, error } = await supabaseAdmin
          .from('contact_messages')
          .update(updateData)
          .in('id', messageIds)
          .select();
          
        console.log(`✏️ Bulk ${operation} operation result:`, data);
        console.log('❌ Update error (if any):', error);
          
        if (error) {
          console.error(`💥 Bulk ${operation} error details:`, error);
          throw new Error(`Failed to ${operation} messages: ${error.message}`);
        }
        
        console.log(`✅ Bulk ${operation} successful for ${messageIds.length} messages`);
      }

      // Trigger public refresh
      triggerPublicRefresh('contact_messages');
      
      // Clear selections and set success status
      setUiState(prev => ({
        ...prev,
        selectedMessages: new Set(),
        showBulkActions: false,
        saveStatus: 'success',
        isPostAction: true,
        lastActionType: `bulk-${actionType}`
      }));
      
      setBulkState(prev => ({
        ...prev,
        showConfirmation: false,
        operation: null,
        selectedCount: 0
      }));
      
      // Refresh data after a brief delay
      setTimeout(() => {
        refetch();
      }, 100);
      
    } catch (error) {
      console.error(`💥 Bulk ${operation} error:`, error);
      
      // Set error status
      setUiState(prev => ({ ...prev, saveStatus: 'error' }));
      
    } finally {
      setUiState(prev => ({
        ...prev,
        actionLoading: new Set([...prev.actionLoading].filter(id => !messageIds.includes(id)))
      }));
    }
  }, [refetch]);

  const handleBulkOperation = useCallback(async (operation) => {
    const selectedIds = Array.from(uiState.selectedMessages);
    if (selectedIds.length === 0) return;
    console.log(`🔄 Starting bulk ${operation} operation for ${selectedIds.length} messages`);
    
    setBulkState(prev => ({
      ...prev,
      operation,
      selectedCount: selectedIds.length,
      showConfirmation: operation === 'delete' // Only show confirmation for delete
    }));
    // For non-delete operations, proceed immediately
    if (operation !== 'delete') {
      await executeBulkOperation(operation, selectedIds);
    }
  }, [uiState.selectedMessages, executeBulkOperation]);

  const confirmBulkOperation = useCallback(async () => {
    if (bulkState.operation && bulkState.selectedCount > 0) {
      const selectedIds = Array.from(uiState.selectedMessages);
      await executeBulkOperation(bulkState.operation, selectedIds);
    }
  }, [bulkState.operation, bulkState.selectedCount, uiState.selectedMessages, executeBulkOperation]);

  const cancelBulkOperation = useCallback(() => {
    setBulkState(prev => ({
      ...prev,
      showConfirmation: false,
      operation: null,
      selectedCount: 0
    }));
  }, []);

  // ============================================================================
  // UTILITY FUNCTIONS - FORMATTING AND HELPERS
  // ============================================================================
  
  const formatDate = useCallback((dateString) => {
    if (!dateString) return 'N/A';
    
    try {
      const date = new Date(dateString);
      const now = new Date();
      const diffInHours = (now - date) / (1000 * 60 * 60);
      
      if (diffInHours < 1) {
        const diffInMinutes = Math.floor((now - date) / (1000 * 60));
        return diffInMinutes <= 1 ? 'Just now' : `${diffInMinutes} minutes ago`;
      } else if (diffInHours < 24) {
        return `${Math.floor(diffInHours)} hours ago`;
      } else if (diffInHours < 48) {
        return 'Yesterday';
      } else {
        return date.toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
          year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined
        });
      }
    } catch (error) {
      return 'Invalid date';
    }
  }, []);

  const formatFileSize = useCallback((bytes) => {
    if (!bytes || bytes === 0) return '0 B';
    
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }, []);

  const getPriorityColor = useCallback((priority) => {
    switch (priority?.toLowerCase()) {
      case 'urgent': return 'contactmgr-priority-urgent';
      case 'high': return 'contactmgr-priority-high';
      case 'normal': return 'contactmgr-priority-normal';
      case 'low': return 'contactmgr-priority-low';
      default: return 'contactmgr-priority-normal';
    }
  }, []);

  const getPriorityIcon = useCallback((priority) => {
    switch (priority?.toLowerCase()) {
      case 'urgent': return '🔥';
      case 'high': return '⭐';
      case 'normal': return '📄';
      case 'low': return '📋';
      default: return '📄';
    }
  }, []);

  const getInquiryTypeIcon = useCallback((inquiryType) => {
    switch (inquiryType?.toLowerCase()) {
      case 'job opportunity': return '💼';
      case 'collaboration': return '🤝';
      case 'project inquiry': return '🚀';
      case 'general inquiry': return '💬';
      case 'feedback': return '💭';
      case 'support': return '🛠️';
      case 'partnership': return '🤝';
      case 'interview': return '🎯';
      case 'freelance': return '💻';
      case 'consultation': return '💡';
      case 'networking': return '🌐';
      case 'other': return '📧';
      default: return '📧';
    }
  }, []);

  const truncateText = useCallback((text, maxLength = 100) => {
    if (!text || text.length <= maxLength) return text;
    return text.substring(0, maxLength).trim() + '...';
  }, []);

  const handleDownloadAttachment = useCallback(async (attachmentUrl, fileName) => {
    if (!attachmentUrl) return;
    
    try {
      // Create a temporary link to trigger download
      const link = document.createElement('a');
      link.href = attachmentUrl;
      link.download = fileName || 'attachment';
      link.target = '_blank';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      console.log('📥 Download initiated for:', fileName);
    } catch (error) {
      console.error('💥 Download error:', error);
      // Fallback: open in new tab
      window.open(attachmentUrl, '_blank');
    }
  }, []);

  // ============================================================================
  // LOADING STATE - STANDARDIZED PHASE 3 PATTERN
  // ============================================================================
  
  if (dataLoading && !messagesData) {
    return (
      <div className="contactmgr-loading">
        <LoadingSpinner size="large" />
        <p>Loading contact messages...</p>
      </div>
    );
  }

  // ============================================================================
  // MAIN RENDER STRUCTURE - HEADER AND NAVIGATION
  // ============================================================================
  
  return (
    <div className="contactmgr-messages-manager">
      {/* Header Section */}
      <div className="contactmgr-manager-header">
        <div className="contactmgr-header-content">
          <h2 className="contactmgr-manager-title">
            <span className="contactmgr-title-icon">📧</span>
            Contact Messages Management
          </h2>
          <p className="contactmgr-manager-subtitle">
            Manage visitor inquiries, messages, and communication
          </p>
        </div>

        <div className="contactmgr-header-stats">
          <div className="contactmgr-stat-item contactmgr-stat-unread">
            <span className="contactmgr-stat-icon">📩</span>
            <div className="contactmgr-stat-content">
              <span className="contactmgr-stat-number">{messageCounts.unread}</span>
              <span className="contactmgr-stat-label">Unread</span>
            </div>
          </div>
          <div className="contactmgr-stat-item contactmgr-stat-total">
            <span className="contactmgr-stat-icon">📊</span>
            <div className="contactmgr-stat-content">
              <span className="contactmgr-stat-number">{messageCounts.total}</span>
              <span className="contactmgr-stat-label">Total</span>
            </div>
          </div>
          <div className="contactmgr-stat-item contactmgr-stat-starred">
            <span className="contactmgr-stat-icon">⭐</span>
            <div className="contactmgr-stat-content">
              <span className="contactmgr-stat-number">{messageCounts.starred}</span>
              <span className="contactmgr-stat-label">Starred</span>
            </div>
          </div>
        </div>
      </div>

      {/* Status Messages */}
      {uiState.saveStatus && (
        <div className={`contactmgr-status-message ${uiState.saveStatus}`} role="alert">
          {uiState.saveStatus === 'success' && (
            <>
              <span className="contactmgr-status-icon">✅</span>
              <div className="contactmgr-status-content">
                <strong>Success!</strong> 
                {uiState.lastActionType === 'delete' && ' Message deleted successfully.'}
                {uiState.lastActionType === 'bulk-delete' && ' Messages deleted successfully.'}
                {uiState.lastActionType === 'read' && ' Message marked as read.'}
                {uiState.lastActionType === 'unread' && ' Message marked as unread.'}
                {uiState.lastActionType === 'star' && ' Message starred.'}
                {uiState.lastActionType === 'archive' && ' Message archived.'}
                {uiState.lastActionType === 'spam' && ' Message marked as spam.'}
                {uiState.lastActionType?.startsWith('bulk-') && uiState.lastActionType !== 'bulk-delete' && 
                  ` Bulk operation completed.`}
                {!uiState.lastActionType && ' Operation completed successfully.'}
              </div>
            </>
          )}
          {uiState.saveStatus === 'error' && (
            <>
              <span className="contactmgr-status-icon">❌</span>
              <div className="contactmgr-status-content">
                <strong>Error!</strong> Failed to complete the operation. Please try again.
              </div>
            </>
          )}
        </div>
      )}

      {/* Data Error */}
      {dataError && (
        <div className="contactmgr-status-message error" role="alert">
          <span className="contactmgr-status-icon">⚠️</span>
          Error loading contact messages: {
            typeof dataError === 'string' ? dataError : dataError.message || 'Unknown error'
          }
        </div>
      )}

      {/* Filter and Search Section */}
      <div className="contactmgr-filters-section">
        {/* Filter Tabs */}
        <div className="contactmgr-filter-tabs">
          <button
            className={`contactmgr-filter-tab ${filterState.activeFilter === 'all' ? 'active' : ''}`}
            onClick={() => handleFilterChange('all')}
            type="button"
            title="All messages (excluding spam)"
          >
            <span className="contactmgr-tab-icon">📄</span>
            <span className="contactmgr-tab-text">All</span>
            <span className="contactmgr-tab-count">{messageCounts.total}</span>
          </button>
          
          <button
            className={`contactmgr-filter-tab ${filterState.activeFilter === 'unread' ? 'active' : ''}`}
            onClick={() => handleFilterChange('unread')}
            type="button"
            title="Unread messages"
          >
            <span className="contactmgr-tab-icon">📩</span>
            <span className="contactmgr-tab-text">Unread</span>
            <span className="contactmgr-tab-count">{messageCounts.unread}</span>
          </button>
          
          <button
            className={`contactmgr-filter-tab ${filterState.activeFilter === 'starred' ? 'active' : ''}`}
            onClick={() => handleFilterChange('starred')}
            type="button"
            title="Starred messages"
          >
            <span className="contactmgr-tab-icon">⭐</span>
            <span className="contactmgr-tab-text">Starred</span>
            <span className="contactmgr-tab-count">{messageCounts.starred}</span>
          </button>
          
          <button
            className={`contactmgr-filter-tab ${filterState.activeFilter === 'archived' ? 'active' : ''}`}
            onClick={() => handleFilterChange('archived')}
            type="button"
            title="Archived messages"
          >
            <span className="contactmgr-tab-icon">📦</span>
            <span className="contactmgr-tab-text">Archived</span>
            <span className="contactmgr-tab-count">{messageCounts.archived}</span>
          </button>
          
          <button
            className={`contactmgr-filter-tab ${filterState.activeFilter === 'spam' ? 'active' : ''}`}
            onClick={() => handleFilterChange('spam')}
            type="button"
            title="Spam messages"
          >
            <span className="contactmgr-tab-icon">🚫</span>
            <span className="contactmgr-tab-text">Spam</span>
            <span className="contactmgr-tab-count">{messageCounts.spam}</span>
          </button>
        </div>

        {/* Search and Sort Controls */}
        <div className="contactmgr-search-controls">
          <div className="contactmgr-search-wrapper">
            <span className="contactmgr-search-icon">🔍</span>
            <input
              type="text"
              placeholder="Search messages..."
              value={filterState.searchQuery}
              onChange={(e) => handleSearchChange(e.target.value)}
              className="contactmgr-search-input"
              aria-label="Search messages"
            />
            {filterState.searchQuery && (
              <button
                className="contactmgr-search-clear"
                onClick={() => handleSearchChange('')}
                type="button"
                title="Clear search"
                aria-label="Clear search"
              >
                ❌
              </button>
            )}
          </div>

          <div className="contactmgr-sort-controls">
            <button
              className={`contactmgr-sort-btn ${filterState.sortBy === 'created_at' ? 'active' : ''}`}
              onClick={() => handleSortChange('created_at')}
              type="button"
              title="Sort by date"
            >
              <span className="contactmgr-sort-icon">📅</span>
              Date
              {filterState.sortBy === 'created_at' && (
                <span className="contactmgr-sort-order">
                  {filterState.sortOrder === 'desc' ? '↓' : '↑'}
                </span>
              )}
            </button>
            
            <button
              className={`contactmgr-sort-btn ${filterState.sortBy === 'priority' ? 'active' : ''}`}
              onClick={() => handleSortChange('priority')}
              type="button"
              title="Sort by priority"
            >
              <span className="contactmgr-sort-icon">⭐</span>
              Priority
              {filterState.sortBy === 'priority' && (
                <span className="contactmgr-sort-order">
                  {filterState.sortOrder === 'desc' ? '↓' : '↑'}
                </span>
              )}
            </button>
            
            <button
              className={`contactmgr-sort-btn ${filterState.sortBy === 'status' ? 'active' : ''}`}
              onClick={() => handleSortChange('status')}
              type="button"
              title="Sort by status"
            >
              <span className="contactmgr-sort-icon">📊</span>
              Status
              {filterState.sortBy === 'status' && (
                <span className="contactmgr-sort-order">
                  {filterState.sortOrder === 'desc' ? '↓' : '↑'}
                </span>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Bulk Actions Bar */}
      {uiState.showBulkActions && selectedMessagesData.count > 0 && (
        <div className="contactmgr-bulk-actions-bar">
          <div className="contactmgr-bulk-info">
            <button
              className="contactmgr-select-all-btn"
              onClick={handleSelectAll}
              type="button"
              title={selectedMessagesData.allSelected ? 'Deselect all' : 'Select all visible'}
            >
              <span className="contactmgr-checkbox-icon">
                {selectedMessagesData.allSelected ? '☑️' : 
                 selectedMessagesData.someSelected ? '◐' : '☐'}
              </span>
            </button>
            <span className="contactmgr-bulk-count">
              {selectedMessagesData.count} selected
            </span>
            <button
              className="contactmgr-clear-selection-btn"
              onClick={handleClearSelection}
              type="button"
              title="Clear selection"
            >
              Clear
            </button>
          </div>

          <div className="contactmgr-bulk-actions">
            <button
              className="contactmgr-bulk-action-btn contactmgr-bulk-read"
              onClick={() => handleBulkOperation('read')}
              type="button"
              title="Mark selected as read"
            >
              <span className="contactmgr-action-icon">📖</span>
              Read
            </button>
            
            <button
              className="contactmgr-bulk-action-btn contactmgr-bulk-unread"
              onClick={() => handleBulkOperation('unread')}
              type="button"
              title="Mark selected as unread"
            >
              <span className="contactmgr-action-icon">📩</span>
              Unread
            </button>
            
            <button
              className="contactmgr-bulk-action-btn contactmgr-bulk-star"
              onClick={() => handleBulkOperation('star')}
              type="button"
              title="Star selected messages"
            >
              <span className="contactmgr-action-icon">⭐</span>
              Star
            </button>
            
            <button
              className="contactmgr-bulk-action-btn contactmgr-bulk-archive"
              onClick={() => handleBulkOperation('archive')}
              type="button"
              title="Archive selected messages"
            >
              <span className="contactmgr-action-icon">📦</span>
              Archive
            </button>
            
            <button
              className="contactmgr-bulk-action-btn contactmgr-bulk-spam"
              onClick={() => handleBulkOperation('spam')}
              type="button"
              title="Mark selected as spam"
            >
              <span className="contactmgr-action-icon">🚫</span>
              Spam
            </button>
            
            <button
              className="contactmgr-bulk-action-btn contactmgr-bulk-delete"
              onClick={() => handleBulkOperation('delete')}
              type="button"
              title="Delete selected messages"
            >
              <span className="contactmgr-action-icon">🗑️</span>
              Delete
            </button>
          </div>
        </div>
      )}

      {/* Messages List Section */}
      <div className="contactmgr-messages-content">
        {processedMessages.length === 0 ? (
          <div className="contactmgr-no-messages">
            <div className="contactmgr-no-messages-content">
              <div className="contactmgr-no-messages-icon">
                {filterState.searchQuery ? '🔍' : 
                 filterState.activeFilter === 'unread' ? '📭' :
                 filterState.activeFilter === 'starred' ? '⭐' :
                 filterState.activeFilter === 'archived' ? '📦' :
                 filterState.activeFilter === 'spam' ? '🚫' : '📧'}
              </div>
              <h3 className="contactmgr-no-messages-title">
                {filterState.searchQuery ? 'No matching messages found' :
                 filterState.activeFilter === 'unread' ? 'No unread messages' :
                 filterState.activeFilter === 'starred' ? 'No starred messages' :
                 filterState.activeFilter === 'archived' ? 'No archived messages' :
                 filterState.activeFilter === 'spam' ? 'No spam messages' :
                 'No messages yet'}
              </h3>
              <p className="contactmgr-no-messages-subtitle">
                {filterState.searchQuery ? 'Try adjusting your search terms' :
                 filterState.activeFilter === 'unread' ? 'All messages have been read' :
                 filterState.activeFilter === 'starred' ? 'Star important messages to find them here' :
                 filterState.activeFilter === 'archived' ? 'Archived messages will appear here' :
                 filterState.activeFilter === 'spam' ? 'Spam messages will be shown here' :
                 'Contact messages from your portfolio will appear here'}
              </p>
              {filterState.searchQuery && (
                <button
                  className="contactmgr-clear-search-btn"
                  onClick={() => handleSearchChange('')}
                  type="button"
                >
                  Clear Search
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="contactmgr-messages-list">
            {processedMessages.map((message, index) => (
              <div
                key={message.id}
                className={`contactmgr-message-card ${
                  message.status === 'unread' ? 'contactmgr-unread' : 'contactmgr-read'
                } ${
                  message.is_starred ? 'contactmgr-starred' : ''
                } ${
                  message.is_archived ? 'contactmgr-archived' : ''
                } ${
                  message.is_spam ? 'contactmgr-spam' : ''
                } ${
                  uiState.selectedMessages.has(message.id) ? 'contactmgr-selected' : ''
                } ${
                  uiState.expandedMessage === message.id ? 'contactmgr-expanded' : ''
                }`}
              >
                {/* Message Card Header */}
                <div className="contactmgr-message-header">
                  <div className="contactmgr-message-select">
                    <button
                      className="contactmgr-select-checkbox"
                      onClick={() => handleSelectMessage(message.id)}
                      type="button"
                      title={uiState.selectedMessages.has(message.id) ? 'Deselect message' : 'Select message'}
                      aria-label={uiState.selectedMessages.has(message.id) ? 'Deselect message' : 'Select message'}
                    >
                      <span className="contactmgr-checkbox-icon">
                        {uiState.selectedMessages.has(message.id) ? '☑️' : '☐'}
                      </span>
                    </button>
                  </div>

                  <div className="contactmgr-message-info">
                    <div className="contactmgr-message-sender">
                      <span className="contactmgr-sender-name">{message.name}</span>
                      <span className="contactmgr-sender-email">&lt;{message.email}&gt;</span>
                      {message.organization && (
                        <span className="contactmgr-sender-org">from {message.organization}</span>
                      )}
                    </div>
                    
                    <div className="contactmgr-message-meta">
                      <span className="contactmgr-message-date" title={new Date(message.created_at).toLocaleString()}>
                        {formatDate(message.created_at)}
                      </span>
                      
                      {message.message_number && (
                        <span className="contactmgr-message-number" title="Message ID">
                          #{message.message_number}
                        </span>
                      )}
                      
                      <span className={`contactmgr-priority-badge ${getPriorityColor(message.priority)}`}>
                        <span className="contactmgr-priority-icon">{getPriorityIcon(message.priority)}</span>
                        {message.priority || 'normal'}
                      </span>
                      
                      {message.inquiry_type && (
                        <span className="contactmgr-inquiry-type" title="Inquiry Type">
                          <span className="contactmgr-inquiry-icon">{getInquiryTypeIcon(message.inquiry_type)}</span>
                          {message.inquiry_type}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="contactmgr-message-actions">
                    {/* Status Indicators */}
                    <div className="contactmgr-status-indicators">
                      {message.is_starred && (
                        <span className="contactmgr-status-indicator contactmgr-starred-indicator" title="Starred">
                          ⭐
                        </span>
                      )}
                      {message.is_archived && (
                        <span className="contactmgr-status-indicator contactmgr-archived-indicator" title="Archived">
                          📦
                        </span>
                      )}
                      {message.is_spam && (
                        <span className="contactmgr-status-indicator contactmgr-spam-indicator" title="Spam">
                          🚫
                        </span>
                      )}
                      {message.attachment_url && (
                        <span className="contactmgr-status-indicator contactmgr-attachment-indicator" title="Has attachment">
                          📎
                        </span>
                      )}
                    </div>

                    {/* Quick Actions */}
                    <div className="contactmgr-quick-actions">
                      <button
                        className={`contactmgr-action-btn contactmgr-read-toggle ${
                          message.status === 'read' ? 'contactmgr-mark-unread' : 'contactmgr-mark-read'
                        }`}
                        onClick={() => message.status === 'read' ? handleMarkAsUnread(message.id) : handleMarkAsRead(message.id)}
                        disabled={uiState.actionLoading.has(message.id)}
                        type="button"
                        title={message.status === 'read' ? 'Mark as unread' : 'Mark as read'}
                      >
                        {uiState.actionLoading.has(message.id) ? (
                          <LoadingSpinner size="small" />
                        ) : (
                          <span className="contactmgr-action-icon">
                            {message.status === 'read' ? '📩' : '📖'}
                          </span>
                        )}
                      </button>

                      <button
                        className={`contactmgr-action-btn contactmgr-star-toggle ${
                          message.is_starred ? 'contactmgr-starred' : 'contactmgr-unstarred'
                        }`}
                        onClick={() => handleToggleStar(message.id, message.is_starred)}
                        disabled={uiState.actionLoading.has(message.id)}
                        type="button"
                        title={message.is_starred ? 'Remove star' : 'Add star'}
                      >
                        {uiState.actionLoading.has(message.id) ? (
                          <LoadingSpinner size="small" />
                        ) : (
                          <span className="contactmgr-action-icon">
                            {message.is_starred ? '⭐' : '☆'}
                          </span>
                        )}
                      </button>

                      <button
                        className="contactmgr-action-btn contactmgr-expand-toggle"
                        onClick={() => handleToggleExpand(message.id)}
                        type="button"
                        title={uiState.expandedMessage === message.id ? 'Collapse message' : 'Expand message'}
                      >
                        <span className="contactmgr-action-icon">
                          {uiState.expandedMessage === message.id ? '🔼' : '🔽'}
                        </span>
                      </button>
                    </div>
                  </div>
                </div>

                {/* Message Preview */}
                <div className="contactmgr-message-preview">
                  <div className="contactmgr-message-subject">
                    <strong>{message.subject}</strong>
                  </div>
                  <div className="contactmgr-message-snippet">
                    {truncateText(message.message, 150)}
                  </div>
                </div>

                {/* Expanded Message Content */}
                {uiState.expandedMessage === message.id && (
                  <div className="contactmgr-message-expanded">
                    <div className="contactmgr-expanded-content">
                      {/* Full Message */}
                      <div className="contactmgr-full-message">
                        <h4 className="contactmgr-expanded-subject">{message.subject}</h4>
                        <div className="contactmgr-message-body">
                          {message.message.split('\n').map((paragraph, pIndex) => (
                            <p key={`para-${message.id}-${pIndex}`} className="contactmgr-message-paragraph">
                              {paragraph}
                            </p>
                          ))}
                        </div>
                      </div>

                      {/* Contact Details */}
                      <div className="contactmgr-contact-details">
                        <h5 className="contactmgr-details-title">Contact Information</h5>
                        <div className="contactmgr-details-grid">
                          <div className="contactmgr-detail-item">
                            <span className="contactmgr-detail-label">Name:</span>
                            <span className="contactmgr-detail-value">{message.name}</span>
                          </div>
                          <div className="contactmgr-detail-item">
                            <span className="contactmgr-detail-label">Email:</span>
                            <span className="contactmgr-detail-value">
                              <a href={`mailto:${message.email}`} className="contactmgr-email-link">
                                {message.email}
                              </a>
                            </span>
                          </div>
                          {message.organization && (
                            <div className="contactmgr-detail-item">
                              <span className="contactmgr-detail-label">Organization:</span>
                              <span className="contactmgr-detail-value">{message.organization}</span>
                            </div>
                          )}
                          {message.role_position && (
                            <div className="contactmgr-detail-item">
                              <span className="contactmgr-detail-label">Role/Position:</span>
                              <span className="contactmgr-detail-value">{message.role_position}</span>
                            </div>
                          )}
                          <div className="contactmgr-detail-item">
                            <span className="contactmgr-detail-label">Priority:</span>
                            <span className={`contactmgr-detail-value ${getPriorityColor(message.priority)}`}>
                              {getPriorityIcon(message.priority)} {message.priority || 'normal'}
                            </span>
                          </div>
                          <div className="contactmgr-detail-item">
                            <span className="contactmgr-detail-label">Inquiry Type:</span>
                            <span className="contactmgr-detail-value">
                              {getInquiryTypeIcon(message.inquiry_type)} {message.inquiry_type}
                            </span>
                          </div>
                          <div className="contactmgr-detail-item">
                            <span className="contactmgr-detail-label">Received:</span>
                            <span className="contactmgr-detail-value">
                              {new Date(message.created_at).toLocaleString()}
                            </span>
                          </div>
                          {message.read_at && (
                            <div className="contactmgr-detail-item">
                              <span className="contactmgr-detail-label">Read:</span>
                              <span className="contactmgr-detail-value">
                                {new Date(message.read_at).toLocaleString()}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Attachments */}
                      {message.attachment_url && (
                        <div className="contactmgr-attachments">
                          <h5 className="contactmgr-attachments-title">Attachments</h5>
                          <div className="contactmgr-attachment-item">
                            <div className="contactmgr-attachment-info">
                              <span className="contactmgr-attachment-icon">📎</span>
                              <div className="contactmgr-attachment-details">
                                <span className="contactmgr-attachment-name">
                                  {message.attachment_name || 'attachment'}
                                </span>
                                {message.attachment_size && (
                                  <span className="contactmgr-attachment-size">
                                    {formatFileSize(message.attachment_size)}
                                  </span>
                                )}
                              </div>
                            </div>
                            <button
                              className="contactmgr-download-btn"
                              onClick={() => handleDownloadAttachment(message.attachment_url, message.attachment_name)}
                              type="button"
                              title="Download attachment"
                            >
                              <span className="contactmgr-download-icon">📥</span>
                              Download
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Admin Notes */}
                      {message.admin_notes && (
                        <div className="contactmgr-admin-notes">
                          <h5 className="contactmgr-notes-title">Admin Notes</h5>
                          <div className="contactmgr-notes-content">
                            {message.admin_notes}
                          </div>
                        </div>
                      )}

                      {/* Technical Details */}
                      <div className="contactmgr-technical-details">
                        <h5 className="contactmgr-tech-title">Technical Information</h5>
                        <div className="contactmgr-tech-grid">
                          {message.sender_ip && (
                            <div className="contactmgr-tech-item">
                              <span className="contactmgr-tech-label">IP Address:</span>
                              <span className="contactmgr-tech-value">{message.sender_ip}</span>
                            </div>
                          )}
                          {message.user_agent && (
                            <div className="contactmgr-tech-item">
                              <span className="contactmgr-tech-label">User Agent:</span>
                              <span className="contactmgr-tech-value contactmgr-user-agent">
                                {truncateText(message.user_agent, 60)}
                              </span>
                            </div>
                          )}
                          {message.referrer_url && (
                            <div className="contactmgr-tech-item">
                              <span className="contactmgr-tech-label">Referrer:</span>
                              <span className="contactmgr-tech-value">
                                <a href={message.referrer_url} target="_blank" rel="noopener noreferrer" className="contactmgr-tech-link">
                                  {truncateText(message.referrer_url, 40)}
                                </a>
                              </span>
                            </div>
                          )}
                          {(message.utm_source || message.utm_medium || message.utm_campaign) && (
                            <div className="contactmgr-tech-item contactmgr-utm-params">
                              <span className="contactmgr-tech-label">UTM Parameters:</span>
                              <div className="contactmgr-utm-values">
                                {message.utm_source && <span>Source: {message.utm_source}</span>}
                                {message.utm_medium && <span>Medium: {message.utm_medium}</span>}
                                {message.utm_campaign && <span>Campaign: {message.utm_campaign}</span>}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Expanded Actions */}
                    <div className="contactmgr-expanded-actions">
                      <div className="contactmgr-primary-actions">
                        <button
                          className={`contactmgr-action-btn contactmgr-archive-btn ${
                            message.is_archived ? 'contactmgr-unarchive' : 'contactmgr-archive'
                          }`}
                          onClick={() => handleToggleArchive(message.id, message.is_archived)}
                          disabled={uiState.actionLoading.has(message.id)}
                          type="button"
                          title={message.is_archived ? 'Unarchive message' : 'Archive message'}
                        >
                          {uiState.actionLoading.has(message.id) ? (
                            <LoadingSpinner size="small" />
                          ) : (
                            <>
                              <span className="contactmgr-action-icon">
                                {message.is_archived ? '📤' : '📦'}
                              </span>
                              {message.is_archived ? 'Unarchive' : 'Archive'}
                            </>
                          )}
                        </button>

                        <button
                          className={`contactmgr-action-btn contactmgr-spam-btn ${
                            message.is_spam ? 'contactmgr-not-spam' : 'contactmgr-mark-spam'
                          }`}
                          onClick={() => handleToggleSpam(message.id, message.is_spam)}
                          disabled={uiState.actionLoading.has(message.id)}
                          type="button"
                          title={message.is_spam ? 'Mark as not spam' : 'Mark as spam'}
                        >
                          {uiState.actionLoading.has(message.id) ? (
                            <LoadingSpinner size="small" />
                          ) : (
                            <>
                              <span className="contactmgr-action-icon">
                                {message.is_spam ? '✅' : '🚫'}
                              </span>
                              {message.is_spam ? 'Not Spam' : 'Mark Spam'}
                            </>
                          )}
                        </button>

                        <div className="contactmgr-priority-editor">
                            <label htmlFor={`priority-${message.id}`} className="contactmgr-priority-label">
                                Priority:
                            </label>
                            <select
                                id={`priority-${message.id}`}
                                value={message.priority || 'normal'}
                                onChange={(e) => handleChangePriority(message.id, e.target.value)}
                                disabled={uiState.actionLoading.has(message.id)}
                                className="contactmgr-priority-select"
                            >
                                <option value="low">🔹 Low</option>
                                <option value="normal">📄 Normal</option>
                                <option value="high">⭐ High</option>
                                <option value="urgent">🔥 Urgent</option>
                            </select>
                        </div>

                        <button
                          className="contactmgr-action-btn contactmgr-delete-btn"
                          onClick={() => handleDeleteMessage(message.id)}
                          disabled={uiState.actionLoading.has(message.id)}
                          type="button"
                          title="Delete message permanently"
                        >
                          <span className="contactmgr-action-icon">🗑️</span>
                          Delete
                        </button>
                      </div>

                      <div className="contactmgr-secondary-actions">
                        <button
                          className="contactmgr-action-btn contactmgr-reply-btn"
                          onClick={() => window.open(`mailto:${message.email}?subject=Re: ${message.subject}`)}
                          type="button"
                          title="Reply via email"
                        >
                          <span className="contactmgr-action-icon">📧</span>
                          Reply
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Delete Confirmation Modal */}
      {uiState.showDeleteModal && (
        <div className="contactmgr-modal-overlay">
          <div className="contactmgr-modal contactmgr-delete-modal">
            <div className="contactmgr-modal-header">
              <h3 className="contactmgr-modal-title">
                <span className="contactmgr-modal-icon">🗑️</span>
                Delete Message Permanently
              </h3>
            </div>
            
            <div className="contactmgr-modal-content">
              <p className="contactmgr-modal-text">
                Are you sure you want to delete this message permanently? This action cannot be undone.
              </p>
              
              {uiState.messageToDelete && (
                <div className="contactmgr-delete-preview">
                  {(() => {
                    const messageToDelete = messagesData?.find(m => m.id === uiState.messageToDelete);
                    return messageToDelete ? (
                      <div className="contactmgr-preview-card">
                        <div className="contactmgr-preview-sender">
                          <strong>{messageToDelete.name}</strong> &lt;{messageToDelete.email}&gt;
                        </div>
                        <div className="contactmgr-preview-subject">
                          {messageToDelete.subject}
                        </div>
                        <div className="contactmgr-preview-date">
                          {formatDate(messageToDelete.created_at)}
                        </div>
                      </div>
                    ) : null;
                  })()}
                </div>
              )}
            </div>
            
            <div className="contactmgr-modal-actions">
              <button
                className="contactmgr-modal-btn contactmgr-cancel-btn"
                onClick={cancelDeleteMessage}
                disabled={uiState.isDeleting}
                type="button"
              >
                <span className="contactmgr-btn-icon">❌</span>
                Cancel
              </button>
              <button
                className="contactmgr-modal-btn contactmgr-confirm-delete-btn"
                onClick={confirmDeleteMessage}
                disabled={uiState.isDeleting}
                type="button"
              >
                {uiState.isDeleting ? (
                  <>
                    <LoadingSpinner size="small" />
                    Deleting...
                  </>
                ) : (
                  <>
                    <span className="contactmgr-btn-icon">🗑️</span>
                    Delete Permanently
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Operation Confirmation Modal */}
      {bulkState.showConfirmation && (
        <div className="contactmgr-modal-overlay">
          <div className="contactmgr-modal contactmgr-bulk-modal">
            <div className="contactmgr-modal-header">
              <h3 className="contactmgr-modal-title">
                <span className="contactmgr-modal-icon">📦</span>
                Confirm Bulk Operation
              </h3>
            </div>
            
            <div className="contactmgr-modal-content">
              <p className="contactmgr-modal-text">
                Are you sure you want to <strong>{bulkState.operation}</strong> {bulkState.selectedCount} selected message{bulkState.selectedCount !== 1 ? 's' : ''}?
                {bulkState.operation === 'delete' && (
                  <span className="contactmgr-warning-text">
                    <br />⚠️ This action cannot be undone.
                  </span>
                )}
              </p>
            </div>
            
            <div className="contactmgr-modal-actions">
              <button
                className="contactmgr-modal-btn contactmgr-cancel-btn"
                onClick={cancelBulkOperation}
                type="button"
              >
                <span className="contactmgr-btn-icon">❌</span>
                Cancel
              </button>
              <button
                className="contactmgr-modal-btn contactmgr-confirm-bulk-btn"
                onClick={confirmBulkOperation}
                type="button"
              >
                <span className="contactmgr-btn-icon">✅</span>
                Confirm {bulkState.operation}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ContactMessagesManager;