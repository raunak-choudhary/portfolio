// src/components/admin/Analytics/AdminProductivity.js
import React, { useState, useEffect, useCallback } from 'react';
import analyticsService from '../../../services/analyticsService';
import MetricsCard from './MetricsCard';
import './AdminProductivity.css';

const AdminProductivity = ({ dateRange = '30d' }) => {
  const [productivityData, setProductivityData] = useState({});
  const [isLoading, setIsLoading] = useState(true);
  const [productivityMetrics, setProductivityMetrics] = useState([]);
  const [sectionUsage, setSectionUsage] = useState([]);
  const [sessionPatterns, setSessionPatterns] = useState([]);
  const [workflowInsights, setWorkflowInsights] = useState([]);

  // Calculate trend change (mock calculation for demo)
  const calculateTrendChange = useCallback((current) => {
    // In real implementation, this would compare with previous period
    return Math.random() * 30 - 15; // Random -15% to +15%
  }, []);

  // Get trend type
  const getTrendType = useCallback((change) => {
    if (change > 5) return 'positive';
    if (change < -5) return 'negative';
    return 'neutral';
  }, []);

  // Process productivity metrics for display
  const processProductivityMetrics = useCallback((adminActivityData) => {
    const {
      totalSessions = 0,
      avgSessionTime = 0,
      productivityScore = 0,
      contentUpdates = 0,
      filesUploaded = 0,
      actionsPerMinute = 0
    } = adminActivityData;

    return [
      {
        title: 'Productivity Score',
        value: productivityScore,
        suffix: '/100',
        icon: '🎯',
        color: 'purple',
        change: calculateTrendChange(productivityScore),
        changeType: getTrendType(calculateTrendChange(productivityScore)),
        description: `Overall efficiency rating for ${dateRange}`
      },
      {
        title: 'Total Sessions',
        value: totalSessions,
        icon: '⚡',
        color: 'blue',
        change: calculateTrendChange(totalSessions),
        changeType: getTrendType(calculateTrendChange(totalSessions)),
        description: `Admin login sessions in ${dateRange}`
      },
      {
        title: 'Avg Session Time',
        value: Math.round(avgSessionTime),
        suffix: 'm',
        icon: '⏱️',
        color: 'emerald',
        change: calculateTrendChange(avgSessionTime),
        changeType: getTrendType(calculateTrendChange(avgSessionTime)),
        description: 'Average time per admin session'
      },
      {
        title: 'Content Updates',
        value: contentUpdates,
        icon: '📝',
        color: 'orange',
        change: calculateTrendChange(contentUpdates),
        changeType: getTrendType(calculateTrendChange(contentUpdates)),
        description: 'Total content modifications'
      },
      {
        title: 'Files Uploaded',
        value: filesUploaded,
        icon: '📁',
        color: 'pink',
        change: calculateTrendChange(filesUploaded),
        changeType: getTrendType(calculateTrendChange(filesUploaded)),
        description: 'Media files uploaded'
      },
      {
        title: 'Actions/Minute',
        value: actionsPerMinute.toFixed(1),
        icon: '🚀',
        color: 'blue',
        change: calculateTrendChange(actionsPerMinute),
        changeType: getTrendType(calculateTrendChange(actionsPerMinute)),
        description: 'Average actions per minute'
      }
    ];
  }, [dateRange, calculateTrendChange, getTrendType]);

  // Calculate section percentage
  const calculateSectionPercentage = useCallback((sectionVisits, allSections) => {
    const totalVisits = allSections.reduce((sum, s) => sum + s.visits, 0);
    return totalVisits > 0 ? Math.round((sectionVisits / totalVisits) * 100) : 0;
  }, []);

  // Process section usage data
  const processSectionUsage = useCallback((sectionUsageData) => {
    if (!sectionUsageData || !Array.isArray(sectionUsageData)) {
      // Mock data for demonstration
      return [
        { section: 'Projects', visits: 45, percentage: 25, timeSpent: 120 },
        { section: 'About', visits: 38, percentage: 21, timeSpent: 95 },
        { section: 'Hero Content', visits: 32, percentage: 18, timeSpent: 85 },
        { section: 'Skills', visits: 28, percentage: 16, timeSpent: 70 },
        { section: 'Work Experience', visits: 25, percentage: 14, timeSpent: 65 },
        { section: 'Contact Messages', visits: 18, percentage: 10, timeSpent: 45 },
        { section: 'Certifications', visits: 15, percentage: 8, timeSpent: 40 },
        { section: 'Education', visits: 12, percentage: 7, timeSpent: 35 }
      ].sort((a, b) => b.visits - a.visits);
    }

    return sectionUsageData.map(section => ({
      ...section,
      percentage: calculateSectionPercentage(section.visits, sectionUsageData)
    })).sort((a, b) => b.visits - a.visits);
  }, [calculateSectionPercentage]);

  // Process session patterns for hourly chart
  const processSessionPatterns = useCallback((sessionData) => {
    if (!sessionData || typeof sessionData !== 'object') {
      // Mock hourly session data
      const mockData = {};
      for (let i = 0; i < 24; i++) {
        // Simulate realistic admin hours (9 AM - 11 PM with peaks)
        if (i >= 9 && i <= 23) {
          mockData[i] = Math.floor(Math.random() * 8) + 1;
        } else {
          mockData[i] = Math.floor(Math.random() * 2);
        }
      }
      return mockData;
    }
    return sessionData;
  }, []);

  // Process workflow insights
  const processWorkflowInsights = useCallback((adminData) => {
    const insights = [];

    // Productivity insights
    if (adminData.productivityScore >= 80) {
      insights.push({
        type: 'success',
        icon: '🎉',
        title: 'High Productivity',
        message: 'Excellent workflow efficiency! You\'re maintaining high productivity levels.'
      });
    } else if (adminData.productivityScore < 60) {
      insights.push({
        type: 'warning',
        icon: '⚠️',
        title: 'Productivity Opportunity',
        message: 'Consider using keyboard shortcuts and batch operations to improve efficiency.'
      });
    }

    // Session length insights
    if (adminData.avgSessionTime > 60) {
      insights.push({
        type: 'info',
        icon: '⏰',
        title: 'Long Sessions',
        message: 'Taking breaks during long sessions can help maintain focus and productivity.'
      });
    }

    // Content update insights
    if (adminData.contentUpdates > 20) {
      insights.push({
        type: 'success',
        icon: '📈',
        title: 'Active Content Management',
        message: 'Great job keeping your portfolio content fresh and up-to-date!'
      });
    }

    // Default insight if no specific patterns
    if (insights.length === 0) {
      insights.push({
        type: 'info',
        icon: '💡',
        title: 'Workflow Tip',
        message: 'Use Ctrl+S for quick saves and Ctrl+P to toggle preview mode.'
      });
    }

    return insights;
  }, []);

  // Format hour for display
  const formatHour = useCallback((hour) => {
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour % 12 || 12;
    return `${displayHour}${ampm}`;
  }, []);

  // Load admin productivity data
  const loadProductivityData = useCallback(async () => {
    try {
      setIsLoading(true);
      
      const adminActivityData = await analyticsService.getAdminActivityAnalytics(dateRange);
      
      setProductivityData({
        ...adminActivityData,
        lastUpdated: new Date()
      });

      // Process data for components
      const processedMetrics = processProductivityMetrics(adminActivityData);
      setProductivityMetrics(processedMetrics);

      const processedSectionUsage = processSectionUsage(adminActivityData.sectionUsage);
      setSectionUsage(processedSectionUsage);

      const processedSessionPatterns = processSessionPatterns(adminActivityData.sessionPatterns);
      setSessionPatterns(processedSessionPatterns);

      const processedInsights = processWorkflowInsights(adminActivityData);
      setWorkflowInsights(processedInsights);

    } catch (error) {
      console.error('Error loading productivity data:', error);
    } finally {
      setIsLoading(false);
    }
  }, [
    dateRange,
    processProductivityMetrics,
    processSectionUsage,
    processSessionPatterns,
    processWorkflowInsights
  ]);

  // Load data when component mounts or dateRange changes
  useEffect(() => {
    loadProductivityData();
  }, [loadProductivityData]);

  // Get productivity level based on score
  const getProductivityLevel = useCallback(() => {
    const score = productivityData.productivityScore || 0;
    if (score >= 90) return { level: 'Exceptional', color: 'var(--neon-emerald)' };
    if (score >= 80) return { level: 'High', color: 'var(--neon-cyan)' };
    if (score >= 70) return { level: 'Good', color: 'var(--neon-purple)' };
    if (score >= 60) return { level: 'Average', color: 'var(--neon-orange)' };
    return { level: 'Needs Improvement', color: 'var(--neon-pink)' };
  }, [productivityData.productivityScore]);

  const productivityLevel = getProductivityLevel();

  return (
    <div className="admin-productivity">
      {/* Header */}
      <div className="admin-productivity-header">
        <h2 className="admin-productivity-title">
          <span className="productivity-icon">⚡</span>
          Admin Productivity & Workflow Analytics
        </h2>
        <p className="admin-productivity-subtitle">
          Comprehensive analysis of your admin efficiency, workflow patterns, and optimization opportunities
        </p>
      </div>

      {/* Productivity Score Overview */}
      <div className="productivity-score-overview">
        <div className="productivity-score-card">
          <div className="score-content">
            <h3 className="score-title">Overall Productivity Score</h3>
            <div className="score-display">
              <span className="score-value">{productivityData.productivityScore || 0}</span>
              <span className="score-max">/100</span>
            </div>
            <div className="score-level" style={{ color: productivityLevel.color }}>
              {productivityLevel.level}
            </div>
            <div className="score-progress">
              <div 
                className="score-progress-fill"
                style={{ 
                  width: `${productivityData.productivityScore || 0}%`,
                  background: `linear-gradient(90deg, ${productivityLevel.color}, var(--neon-cyan))`
                }}
              ></div>
            </div>
          </div>
          <div className="score-visual">
            <div className="circular-score">
              <svg viewBox="0 0 100 100">
                <circle
                  cx="50"
                  cy="50"
                  r="40"
                  fill="none"
                  stroke="rgba(255, 255, 255, 0.1)"
                  strokeWidth="8"
                />
                <circle
                  cx="50"
                  cy="50"
                  r="40"
                  fill="none"
                  stroke={productivityLevel.color}
                  strokeWidth="8"
                  strokeLinecap="round"
                  strokeDasharray={`${2 * Math.PI * 40}`}
                  strokeDashoffset={`${2 * Math.PI * 40 * (1 - (productivityData.productivityScore || 0) / 100)}`}
                  transform="rotate(-90 50 50)"
                />
              </svg>
              <div className="score-percentage">
                {productivityData.productivityScore || 0}%
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Productivity Metrics Grid */}
      <div className="productivity-metrics-grid">
        {productivityMetrics.map((metric, index) => (
          <MetricsCard
            key={index}
            title={metric.title}
            value={metric.value}
            suffix={metric.suffix}
            icon={metric.icon}
            color={metric.color}
            change={metric.change}
            changeType={metric.changeType}
            description={metric.description}
            isLoading={isLoading}
          />
        ))}
      </div>

      {/* Section Usage Analysis */}
      <div className="section-usage-analysis">
        <div className="usage-chart-section">
          <h3 className="usage-title">Section Usage Patterns</h3>
          <div className="usage-chart">
            {sectionUsage.slice(0, 8).map((section, index) => (
              <div key={index} className="usage-bar-container">
                <div className="usage-bar-wrapper">
                  <div 
                    className="usage-bar"
                    style={{ 
                      height: `${Math.max(10, (section.visits / Math.max(...sectionUsage.map(s => s.visits))) * 100)}%`
                    }}
                    title={`${section.section}: ${section.visits} visits, ${section.timeSpent}min`}
                  ></div>
                </div>
                <div className="usage-label">{section.section}</div>
                <div className="usage-count">{section.visits}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="usage-details-section">
          <h3 className="details-title">Usage Details</h3>
          <div className="usage-details-grid">
            {sectionUsage.slice(0, 6).map((section, index) => (
              <div key={index} className="usage-detail-item">
                <div className="usage-detail-header">
                  <span className="section-name">{section.section}</span>
                  <span className="section-percentage">{section.percentage}%</span>
                </div>
                <div className="usage-detail-bar">
                  <div 
                    className="usage-detail-fill"
                    style={{ width: `${section.percentage}%` }}
                  ></div>
                </div>
                <div className="usage-detail-stats">
                  <span className="visits-count">{section.visits} visits</span>
                  <span className="time-spent">{section.timeSpent}min total</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Session Patterns */}
      <div className="session-patterns-section">
        <h3 className="patterns-title">Daily Activity Patterns</h3>
        <div className="session-patterns-chart">
          {Object.entries(sessionPatterns).map(([hour, sessions]) => (
            <div key={hour} className="hour-activity">
              <div 
                className="activity-bar"
                style={{ 
                  height: `${Math.max(8, (sessions / Math.max(...Object.values(sessionPatterns))) * 100)}%`
                }}
                title={`${formatHour(parseInt(hour))}: ${sessions} sessions`}
              ></div>
              <div className="hour-label">{formatHour(parseInt(hour))}</div>
              <div className="session-count">{sessions}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Workflow Insights */}
      <div className="workflow-insights-section">
        <h3 className="insights-title">Workflow Insights & Recommendations</h3>
        <div className="insights-grid">
          {workflowInsights.map((insight, index) => (
            <div key={index} className={`insight-card insight-card--${insight.type}`}>
              <div className="insight-icon">{insight.icon}</div>
              <div className="insight-content">
                <h4 className="insight-title">{insight.title}</h4>
                <p className="insight-message">{insight.message}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Productivity Tips */}
      <div className="productivity-tips-section">
        <h3 className="tips-title">Productivity Enhancement Tips</h3>
        <div className="tips-grid">
          <div className="tip-card">
            <div className="tip-icon">⌨️</div>
            <div className="tip-content">
              <h4>Keyboard Shortcuts</h4>
              <p>Use Ctrl+S for quick saves, Ctrl+P for preview, and Ctrl+1-9 for section navigation</p>
            </div>
          </div>
          
          <div className="tip-card">
            <div className="tip-icon">📊</div>
            <div className="tip-content">
              <h4>Batch Operations</h4>
              <p>Update multiple items at once using bulk edit features to save time</p>
            </div>
          </div>
          
          <div className="tip-card">
            <div className="tip-icon">🎯</div>
            <div className="tip-content">
              <h4>Focus Sessions</h4>
              <p>Dedicate specific time blocks to different content types for better efficiency</p>
            </div>
          </div>
        </div>
      </div>

      {/* Last Updated */}
      {productivityData.lastUpdated && (
        <div className="admin-productivity-footer">
          <span className="last-updated">
            Productivity data last updated: {productivityData.lastUpdated.toLocaleString()}
          </span>
        </div>
      )}
    </div>
  );
};

export default AdminProductivity;