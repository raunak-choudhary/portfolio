// src/components/admin/Analytics/AnalyticsDashboard.js - COMPLETE INTEGRATION
import React, { useState, useEffect, useCallback } from 'react';
import { useTheme } from '../../../contexts/ThemeContext';
import analyticsService from '../../../services/analyticsService';

// Import all 9 analytics components
import MetricsCard from './MetricsCard';
import PortfolioMetrics from './PortfolioMetrics';
import VisitorInsights from './VisitorInsights';
import AdminProductivity from './AdminProductivity';
import ContentAnalytics from './ContentAnalytics';
import TrendAnalysis from './TrendAnalysis';
import ReportGenerator from './ReportGenerator';
import AutomatedReporting from './AutomatedReporting';
import SocialMediaAnalytics from './SocialMediaAnalytics';
import './AnalyticsDashboard.css';

const AnalyticsDashboard = () => {
  const { theme } = useTheme();
  const [activeTab, setActiveTab] = useState('overview');
  const [selectedDateRange, setSelectedDateRange] = useState('30d');
  const [isLoading, setIsLoading] = useState(true);
  const [overviewData, setOverviewData] = useState({});
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  // Date range options
  const dateRangeOptions = [
    { value: '7d', label: 'Last 7 Days' },
    { value: '30d', label: 'Last 30 Days' },
    { value: '90d', label: 'Last 3 Months' },
    { value: '1y', label: 'Last Year' }
  ];

  // COMPLETE Analytics tabs - ALL 8 TABS (Overview + 7 feature tabs)
  const analyticsTabs = React.useMemo(() => [
    { id: 'overview', name: 'Overview', icon: '📊', shortcut: 'o' },
    { id: 'portfolio', name: 'Portfolio Metrics', icon: '📈', shortcut: 'p' },
    { id: 'content', name: 'Content Analytics', icon: '📝', shortcut: 'c' }, // ✅ FIXED
    { id: 'contacts', name: 'Contact Insights', icon: '📧', shortcut: 'i' },
    { id: 'social', name: 'Social Media', icon: '🌐', shortcut: 'l' },
    { id: 'admin', name: 'Admin Productivity', icon: '⚡', shortcut: 'a' },
    { id: 'trends', name: 'Trends & Patterns', icon: '📉', shortcut: 't' },
    { id: 'reports', name: 'Reports', icon: '📄', shortcut: 'r' }, // ✅ ADDED
    { id: 'automation', name: 'Automation', icon: '🔔', shortcut: 'm' } // ✅ ADDED
  ], []);

  // Parse date range helper - wrapped in useCallback
  const parseDateRange = useCallback((range) => {
    switch (range) {
      case '7d': return 7;
      case '30d': return 30;
      case '90d': return 90;
      case '1y': return 365;
      default: return 30;
    }
  }, []);

  // Calculate real trend change from historical data
  const calculateChange = useCallback((current, historicalData) => {
    if (!historicalData || !Array.isArray(historicalData) || historicalData.length < 2) {
      return 0;
    }

    const previousValue = historicalData[historicalData.length - 2]?.value || 0;
    const currentValue = current || 0;

    if (previousValue === 0) return currentValue > 0 ? 100 : 0;
    
    return Math.round(((currentValue - previousValue) / previousValue) * 100 * 10) / 10;
  }, []);

  // Determine change type based on calculated change
  const getChangeType = useCallback((change) => {
    if (change > 0) return 'positive';
    if (change < 0) return 'negative';
    return 'neutral';
  }, []);

  // Load overview data - wrapped in useCallback
  const loadOverviewData = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      
      console.log('🔍 Loading overview data...');
      
      const [
        portfolioCompleteness,
        contactAnalytics,
        adminProductivity,
        contentEngagementData  // This is now an object, not array
      ] = await Promise.all([
        analyticsService.calculatePortfolioCompleteness(),
        analyticsService.getContactAnalytics(selectedDateRange),
        analyticsService.getAdminActivityAnalytics(selectedDateRange),
        analyticsService.calculateContentEngagement(null, parseDateRange(selectedDateRange))
      ]);

      console.log('✅ Overview data loaded:', {
        portfolioCompleteness,
        contactAnalytics,
        adminProductivity,
        contentEngagementData
      });

      setOverviewData({
        portfolioCompleteness: portfolioCompleteness || 0,
        contactAnalytics: contactAnalytics || {},
        adminProductivity: adminProductivity || {},
        contentEngagement: contentEngagementData || {}, // Now an object
        lastUpdated: new Date()
      });
    } catch (error) {
      console.error('❌ Error loading overview data:', error);
      setError('Failed to load analytics data. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }, [selectedDateRange, parseDateRange]);

  // Handle data refresh
  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadOverviewData();
    setTimeout(() => setRefreshing(false), 500);
  }, [loadOverviewData]);

  // Handle date range change
  const handleDateRangeChange = useCallback((range) => {
    setSelectedDateRange(range);
  }, []);

  // Handle tab change
  const handleTabChange = useCallback((tabId) => {
    setActiveTab(tabId);
  }, []);

  // Handle retry when error occurs
  const handleRetry = useCallback(() => {
    loadOverviewData();
  }, [loadOverviewData]);

  // Enhanced keyboard shortcuts - wrapped in useCallback
  const handleKeyPress = useCallback((event) => {
    if (event.ctrlKey || event.metaKey) {
      const tab = analyticsTabs.find(t => t.shortcut === event.key.toLowerCase());
      if (tab) {
        event.preventDefault();
        setActiveTab(tab.id);
      }
    }
    
    if (event.key === 'F5' || (event.ctrlKey && event.key === 'r')) {
      event.preventDefault();
      handleRefresh();
    }
  }, [analyticsTabs, handleRefresh]);

  // Keyboard shortcuts effect
  useEffect(() => {
    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [handleKeyPress]);

  // Load data on mount and date range change
  useEffect(() => {
    loadOverviewData();
  }, [loadOverviewData]);

  // Enhanced overview content with comprehensive metrics
  const renderOverviewContent = useCallback(() => {
    const { portfolioCompleteness, contactAnalytics, adminProductivity, contentEngagement } = overviewData;

    // Calculate real trend changes using historical data - FIXED
    const messageTrend = calculateChange(contactAnalytics?.totalMessages, contactAnalytics?.historicalData);
    
    // FIX: contentEngagement is now an object, not array
    const contentViewsTrend = calculateChange(
      contentEngagement?.totalViews || 0,
      contentEngagement?.historicalData // This may not exist yet, that's ok
    );
    
    const productivityTrend = calculateChange(adminProductivity?.productivityScore, adminProductivity?.historicalData);

    return (
      <div className="analytics-overview">
        {/* Primary Metrics Grid */}
        <div className="analytics-grid analytics-grid--4col">
          <MetricsCard
            title="Portfolio Completeness"
            value={`${portfolioCompleteness || 0}%`}
            icon="🎯"
            color="blue"
            description="Overall portfolio completion score"
            isLoading={isLoading}
            onClick={() => setActiveTab('portfolio')}
          />
          
          <MetricsCard
            title="Total Messages"
            value={contactAnalytics?.totalMessages || 0}
            change={messageTrend}
            changeType={getChangeType(messageTrend)}
            icon="📬"
            color="emerald"
            description={`${selectedDateRange} contact inquiries`}
            isLoading={isLoading}
            onClick={() => setActiveTab('contacts')}
          />
          
          <MetricsCard
            title="Admin Sessions"
            value={adminProductivity?.totalSessions || 0}
            icon="⚡"
            color="purple"
            description={`Active sessions in ${selectedDateRange}`}
            isLoading={isLoading}
            onClick={() => setActiveTab('admin')}
          />
          
          <MetricsCard
            title="Content Views"
            value={contentEngagement?.totalViews || 0}  // FIXED: use totalViews from object
            change={contentViewsTrend}
            changeType={getChangeType(contentViewsTrend)}
            icon="👀"
            color="pink"
            description="Total content engagement"
            isLoading={isLoading}
            onClick={() => setActiveTab('content')}
          />
        </div>

        {/* Secondary Metrics Grid */}
        <div className="analytics-grid analytics-grid--3col">
          <MetricsCard
            title="Productivity Score"
            value={`${adminProductivity?.productivityScore || 0}/100`}
            change={productivityTrend}
            changeType={getChangeType(productivityTrend)}
            icon="📊"
            color="orange"
            description="Admin workflow efficiency"
            isLoading={isLoading}
            size="large"
            onClick={() => setActiveTab('admin')}
          />
          
          <MetricsCard
            title="Average Session Time"
            value={`${adminProductivity?.avgSessionTime || 0}m`}
            icon="⏱️"
            color="blue"
            description="Average admin session duration"
            isLoading={isLoading}
            size="large"
            onClick={() => setActiveTab('admin')}
          />

          <MetricsCard
            title="Content Engagement"
            value={`${contentEngagement?.avgEngagementScore || 0}`}  // FIXED: use avgEngagementScore from object
            icon="⭐"
            color="yellow"
            description="Average content rating"
            isLoading={isLoading}
            size="large"
            onClick={() => setActiveTab('content')}
          />
        </div>

        {/* Quick Actions Grid - SAME AS BEFORE */}
        <div className="analytics-quick-actions">
          <h3 className="quick-actions-title">Quick Analytics Actions</h3>
          <div className="quick-actions-grid">
            <button 
              className="quick-action-btn quick-action-btn--reports"
              onClick={() => setActiveTab('reports')}
            >
              <span className="quick-action-icon">📄</span>
              <div className="quick-action-content">
                <span className="quick-action-title">Generate Report</span>
                <span className="quick-action-description">Export analytics data</span>
              </div>
            </button>

            <button 
              className="quick-action-btn quick-action-btn--automation"
              onClick={() => setActiveTab('automation')}
            >
              <span className="quick-action-icon">🔔</span>
              <div className="quick-action-content">
                <span className="quick-action-title">Setup Alerts</span>
                <span className="quick-action-description">Configure notifications</span>
              </div>
            </button>

            <button 
              className="quick-action-btn quick-action-btn--trends"
              onClick={() => setActiveTab('trends')}
            >
              <span className="quick-action-icon">📉</span>
              <div className="quick-action-content">
                <span className="quick-action-title">View Trends</span>
                <span className="quick-action-description">Analyze patterns</span>
              </div>
            </button>

            <button 
              className="quick-action-btn quick-action-btn--refresh"
              onClick={handleRefresh}
              disabled={refreshing}
            >
              <span className="quick-action-icon">🔄</span>
              <div className="quick-action-content">
                <span className="quick-action-title">{refreshing ? 'Refreshing...' : 'Refresh Data'}</span>
                <span className="quick-action-description">Update all metrics</span>
              </div>
            </button>
          </div>
        </div>

        {/* Popular Contact Subjects - SAME AS BEFORE */}
        {contactAnalytics?.popularSubjects && contactAnalytics.popularSubjects.length > 0 && (
          <div className="analytics-section">
            <h3 className="analytics-section-title">
              <span className="section-icon">📧</span>
              Popular Inquiry Topics
            </h3>
            <div className="popular-subjects">
              {contactAnalytics.popularSubjects.slice(0, 5).map((subject, index) => (
                <div key={`subject-${index}`} className="subject-item">
                  <span className="subject-rank">#{index + 1}</span>
                  <span className="subject-name">{subject.subject}</span>
                  <span className="subject-count">{subject.count}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Analytics Insights Summary - UPDATED FOR NEW STRUCTURE */}
        <div className="analytics-insights-summary">
          <h3 className="insights-title">
            <span className="section-icon">💡</span>
            Key Insights
          </h3>
          <div className="insights-grid">
            <div className="insight-card insight-card--portfolio">
              <div className="insight-icon">🎯</div>
              <div className="insight-content">
                <h4>Portfolio Status</h4>
                <p>
                  {portfolioCompleteness >= 90 
                    ? 'Excellent! Your portfolio is nearly complete.'
                    : portfolioCompleteness >= 70 
                    ? 'Good progress. Consider adding more content.'
                    : 'Focus on completing key sections for better impact.'
                  }
                </p>
              </div>
            </div>

            <div className="insight-card insight-card--engagement">
              <div className="insight-icon">📈</div>
              <div className="insight-content">
                <h4>Engagement Trend</h4>
                <p>
                  {messageTrend > 10 
                    ? 'Great! Contact inquiries are increasing significantly.'
                    : messageTrend > 0 
                    ? 'Positive trend in visitor engagement.'
                    : 'Consider optimizing content to boost engagement.'
                  }
                </p>
              </div>
            </div>

            <div className="insight-card insight-card--productivity">
              <div className="insight-icon">⚡</div>
              <div className="insight-content">
                <h4>Admin Efficiency</h4>
                <p>
                  {(adminProductivity?.productivityScore || 0) >= 80
                    ? 'High productivity! Your workflow is optimized.'
                    : (adminProductivity?.productivityScore || 0) >= 60
                    ? 'Good efficiency. Room for improvement.'
                    : 'Consider using shortcuts and batch operations.'
                  }
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Empty State - UPDATED CONDITION */}
        {!isLoading && (
          (!contactAnalytics?.totalMessages && 
          !adminProductivity?.totalSessions && 
          !(contentEngagement?.totalViews > 0)) && (  // FIXED: check totalViews property
          <div className="empty-state">
            <div className="empty-icon">📊</div>
            <h3 className="empty-title">No Analytics Data Available</h3>
            <p className="empty-description">
              Start using your portfolio and admin dashboard to generate analytics data.
            </p>
            <button className="empty-action-btn" onClick={handleRefresh}>
              Refresh Data
            </button>
          </div>
        ))}
      </div>
    );
  }, [overviewData, selectedDateRange, isLoading, calculateChange, getChangeType, refreshing, handleRefresh]);

  // Error state
  if (error) {
    return (
      <div className={`analytics-dashboard analytics-dashboard--${theme} analytics-dashboard--error`}>
        <div className="error-state">
          <div className="error-icon">⚠️</div>
          <h3 className="error-title">Unable to Load Analytics Dashboard</h3>
          <p className="error-message">{error}</p>
          <button onClick={handleRetry} className="retry-button">
            Try Again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={`analytics-dashboard analytics-dashboard--${theme}`}>
      {/* Enhanced Header */}
      <div className="analytics-header">
        <div className="analytics-header-content">
          <div className="analytics-title-section">
            <h1 className="analytics-title">
              <span className="analytics-icon">📊</span>
              Analytics Dashboard
            </h1>
            <p className="analytics-subtitle">
              Comprehensive portfolio performance insights and automated reporting
            </p>
          </div>

          <div className="analytics-controls">
            <div className="date-range-selector">
              <label htmlFor="dateRange">Time Period:</label>
              <select
                id="dateRange"
                value={selectedDateRange}
                onChange={(e) => handleDateRangeChange(e.target.value)}
                className="date-range-select"
              >
                {dateRangeOptions.map(option => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <button
              onClick={handleRefresh}
              className={`refresh-button ${refreshing ? 'refreshing' : ''}`}
              disabled={refreshing}
              aria-label="Refresh analytics data"
              title="Refresh Data (F5)"
            >
              <span className="refresh-icon">🔄</span>
              {refreshing ? 'Refreshing...' : 'Refresh'}
            </button>
          </div>
        </div>
      </div>

      {/* Enhanced Tab Navigation - ALL 8 TABS */}
      <div className="analytics-tabs">
        {analyticsTabs.map(tab => (
          <button
            key={tab.id}
            className={`analytics-tab ${activeTab === tab.id ? 'active' : ''}`}
            onClick={() => handleTabChange(tab.id)}
            title={`${tab.name} (Ctrl+${tab.shortcut})`}
            aria-label={`Switch to ${tab.name} tab`}
          >
            <span className="tab-icon">{tab.icon}</span>
            <span className="tab-name">{tab.name}</span>
            {tab.id === 'automation' && (
              <span className="tab-badge" title="Smart Alerts Active">●</span>
            )}
          </button>
        ))}
      </div>

      {/* Content Area - ALL 9 COMPONENTS INTEGRATED */}
      <div className="analytics-content">
        {activeTab === 'overview' && renderOverviewContent()}
        {activeTab === 'portfolio' && <PortfolioMetrics dateRange={selectedDateRange} />}
        {activeTab === 'content' && <ContentAnalytics dateRange={selectedDateRange} />}
        {activeTab === 'contacts' && <VisitorInsights dateRange={selectedDateRange} />}
        {activeTab === 'social' && <SocialMediaAnalytics dateRange={selectedDateRange} />}
        {activeTab === 'admin' && <AdminProductivity dateRange={selectedDateRange} />}
        {activeTab === 'trends' && <TrendAnalysis dateRange={selectedDateRange} />}
        {activeTab === 'reports' && <ReportGenerator dateRange={selectedDateRange} />}
        {activeTab === 'automation' && <AutomatedReporting dateRange={selectedDateRange} />}
      </div>

      {/* Enhanced Footer */}
      <div className="analytics-footer">
        <div className="footer-left">
          {overviewData.lastUpdated && (
            <span className="last-updated">
              Last updated: {overviewData.lastUpdated.toLocaleTimeString()}
            </span>
          )}
        </div>
        <div className="footer-right">
          <div className="footer-shortcuts">
            <span className="shortcuts-label">Shortcuts:</span>
            <span className="shortcut-item">Ctrl+O: Overview</span>
            <span className="shortcut-item">Ctrl+P: Portfolio</span>
            <span className="shortcut-item">Ctrl+C: Content</span>
            <span className="shortcut-item">Ctrl+R: Reports</span>
            <span className="shortcut-item">F5: Refresh</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AnalyticsDashboard;