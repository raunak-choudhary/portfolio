// src/components/admin/Analytics/AutomatedReporting.js
import React, { useState, useEffect, useCallback } from 'react';
import analyticsService from '../../../services/analyticsService';
import './AutomatedReporting.css';

const AutomatedReporting = ({ dateRange = '30d' }) => {
  const [insights, setInsights] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [thresholds, setThresholds] = useState({
    portfolioCompleteness: { min: 80, max: 100 },
    contactVolume: { min: 5, max: 50 },
    adminProductivity: { min: 70, max: 100 },
    contentEngagement: { min: 10, max: 100 }
  });
  const [alertSettings, setAlertSettings] = useState({
    enabled: true,
    email: '',
    frequency: 'immediate',
    types: ['performance', 'anomaly', 'threshold', 'recommendation']
  });
  const [isLoading, setIsLoading] = useState(true);
  const [automationStatus] = useState('active');

  // Alert types configuration
  const alertTypes = [
    { id: 'performance', name: 'Performance Alerts', icon: '📊', color: 'blue' },
    { id: 'anomaly', name: 'Anomaly Detection', icon: '⚠️', color: 'orange' },
    { id: 'threshold', name: 'Threshold Breaches', icon: '📉', color: 'red' },
    { id: 'recommendation', name: 'Smart Recommendations', icon: '💡', color: 'emerald' }
  ];

  // Notification frequencies
  const frequencies = [
    { id: 'immediate', name: 'Immediate', description: 'Real-time notifications' },
    { id: 'hourly', name: 'Hourly', description: 'Digest every hour' },
    { id: 'daily', name: 'Daily', description: 'Daily summary at 9 AM' },
    { id: 'weekly', name: 'Weekly', description: 'Weekly report on Mondays' }
  ];

  // Load stored alert settings
  const loadStoredSettings = () => {
    try {
      const stored = localStorage.getItem('automatedReportingSettings');
      if (stored) {
        const settings = JSON.parse(stored);
        setAlertSettings(prev => ({ ...prev, ...settings }));
        setThresholds(prev => ({ ...prev, ...settings.thresholds }));
      }
    } catch (error) {
      console.error('Error loading settings:', error);
    }
  };

  // Save alert settings
  const saveSettings = () => {
    try {
      const settings = {
        ...alertSettings,
        thresholds,
        lastUpdated: new Date().toISOString()
      };
      localStorage.setItem('automatedReportingSettings', JSON.stringify(settings));
      
      // Show success notification
      addNotification({
        type: 'success',
        title: 'Settings Saved',
        message: 'Automated reporting settings have been updated successfully.',
        timestamp: new Date()
      });
    } catch (error) {
      console.error('Error saving settings:', error);
      addNotification({
        type: 'error',
        title: 'Save Failed',
        message: 'Failed to save settings. Please try again.',
        timestamp: new Date()
      });
    }
  };

  // Generate automated insights
  const generateAutomatedInsights = useCallback(async () => {
    try {
      setIsLoading(true);
      
      // Collect current analytics data
      const [
        portfolioCompleteness,
        contactAnalytics,
        adminProductivity,
        contentEngagement,
        portfolioTrend
      ] = await Promise.all([
        analyticsService.calculatePortfolioCompleteness(),
        analyticsService.getContactAnalytics(dateRange),
        analyticsService.getAdminActivityAnalytics(dateRange),
        analyticsService.calculateContentEngagement(null, parseDateRange(dateRange)),
        analyticsService.getTrendAnalysis('portfolio_completeness', dateRange),
        analyticsService.getTrendAnalysis('contact_volume', dateRange),
        analyticsService.getTrendAnalysis('admin_productivity', dateRange)
      ]);

      // Generate insights based on data
      const generatedInsights = [];
      const generatedAlerts = [];

      // Portfolio insights
      if (portfolioCompleteness) {
        if (portfolioCompleteness >= 90) {
          generatedInsights.push({
            id: `portfolio_excellent_${Date.now()}`,
            type: 'success',
            category: 'portfolio',
            title: 'Excellent Portfolio Completeness',
            message: `Your portfolio is ${portfolioCompleteness}% complete - outstanding work!`,
            recommendation: 'Consider showcasing your comprehensive portfolio to potential employers.',
            priority: 'low',
            timestamp: new Date(),
            metrics: { completeness: portfolioCompleteness }
          });
        } else if (portfolioCompleteness < thresholds.portfolioCompleteness.min) {
          generatedAlerts.push({
            id: `portfolio_threshold_${Date.now()}`,
            type: 'warning',
            category: 'portfolio',
            title: 'Portfolio Completeness Below Threshold',
            message: `Portfolio completeness is ${portfolioCompleteness}%, below your target of ${thresholds.portfolioCompleteness.min}%.`,
            recommendation: 'Focus on completing missing sections to improve your professional presentation.',
            priority: 'high',
            timestamp: new Date(),
            metrics: { current: portfolioCompleteness, target: thresholds.portfolioCompleteness.min }
          });
        }
      }

      // Contact volume insights
      if (contactAnalytics?.totalMessages !== undefined) {
        const totalMessages = contactAnalytics.totalMessages;
        
        if (totalMessages > thresholds.contactVolume.max) {
          generatedInsights.push({
            id: `contact_high_${Date.now()}`,
            type: 'info',
            category: 'contacts',
            title: 'High Contact Volume',
            message: `Received ${totalMessages} messages in ${dateRange} - your portfolio is attracting attention!`,
            recommendation: 'Consider setting up automated responses for common inquiries.',
            priority: 'medium',
            timestamp: new Date(),
            metrics: { totalMessages }
          });
        } else if (totalMessages < thresholds.contactVolume.min) {
          generatedInsights.push({
            id: `contact_low_${Date.now()}`,
            type: 'warning',
            category: 'contacts',
            title: 'Low Contact Volume',
            message: `Only ${totalMessages} messages received in ${dateRange}. Consider portfolio optimization.`,
            recommendation: 'Review portfolio visibility and consider adding more engaging content.',
            priority: 'medium',
            timestamp: new Date(),
            metrics: { totalMessages }
          });
        }

        // Contact type distribution insights
        if (contactAnalytics.contactTypes) {
          const types = contactAnalytics.contactTypes;
          const professionalContacts = (types.hr || 0) + (types.recruiter || 0) + (types.manager || 0);
          const professionalPercentage = totalMessages > 0 ? (professionalContacts / totalMessages) * 100 : 0;
          
          if (professionalPercentage >= 80) {
            generatedInsights.push({
              id: `contact_quality_${Date.now()}`,
              type: 'success',
              category: 'contacts',
              title: 'High-Quality Professional Contacts',
              message: `${professionalPercentage.toFixed(1)}% of contacts are from HR, recruiters, or managers.`,
              recommendation: 'Your portfolio is effectively reaching the right audience.',
              priority: 'low',
              timestamp: new Date(),
              metrics: { professionalPercentage, totalMessages }
            });
          }
        }
      }

      // Admin productivity insights
      if (adminProductivity?.productivityScore !== undefined) {
        const score = adminProductivity.productivityScore;
        
        if (score >= 80) {
          generatedInsights.push({
            id: `admin_productive_${Date.now()}`,
            type: 'success',
            category: 'admin',
            title: 'High Admin Productivity',
            message: `Productivity score of ${score}/100 indicates efficient portfolio management.`,
            recommendation: 'Your workflow is optimized. Consider documenting best practices.',
            priority: 'low',
            timestamp: new Date(),
            metrics: { productivityScore: score }
          });
        } else if (score < thresholds.adminProductivity.min) {
          generatedAlerts.push({
            id: `admin_productivity_${Date.now()}`,
            type: 'warning',
            category: 'admin',
            title: 'Low Admin Productivity',
            message: `Productivity score is ${score}/100, below target of ${thresholds.adminProductivity.min}.`,
            recommendation: 'Consider using keyboard shortcuts and batch operations to improve efficiency.',
            priority: 'medium',
            timestamp: new Date(),
            metrics: { current: score, target: thresholds.adminProductivity.min }
          });
        }
      }

      // Trend analysis insights
      if (portfolioTrend?.trend === 'increasing') {
        generatedInsights.push({
          id: `portfolio_trending_${Date.now()}`,
          type: 'success',
          category: 'trends',
          title: 'Portfolio Improving',
          message: `Portfolio metrics show positive trend with ${portfolioTrend.change.toFixed(1)}% improvement.`,
          recommendation: 'Continue current strategies to maintain growth momentum.',
          priority: 'low',
          timestamp: new Date(),
          metrics: { trendChange: portfolioTrend.change }
        });
      } else if (portfolioTrend?.trend === 'decreasing') {
        generatedAlerts.push({
          id: `portfolio_declining_${Date.now()}`,
          type: 'warning',
          category: 'trends',
          title: 'Portfolio Metrics Declining',
          message: `Portfolio shows declining trend with ${Math.abs(portfolioTrend.change).toFixed(1)}% decrease.`,
          recommendation: 'Review recent changes and focus on content quality improvements.',
          priority: 'high',
          timestamp: new Date(),
          metrics: { trendChange: portfolioTrend.change }
        });
      }

      // Content engagement insights
      if (contentEngagement && contentEngagement.length > 0) {
        const totalEngagement = contentEngagement.reduce((sum, item) => sum + (item.avg_engagement || 0), 0);
        const avgEngagement = totalEngagement / contentEngagement.length;
        
        if (avgEngagement >= 50) {
          generatedInsights.push({
            id: `content_engaging_${Date.now()}`,
            type: 'success',
            category: 'content',
            title: 'High Content Engagement',
            message: `Average content engagement score of ${avgEngagement.toFixed(1)} indicates compelling content.`,
            recommendation: 'Your content strategy is working well. Consider expanding successful content types.',
            priority: 'low',
            timestamp: new Date(),
            metrics: { avgEngagement, contentItems: contentEngagement.length }
          });
        }
      }

      // Anomaly detection
      const [
        portfolioAnomalies,
        contactAnomalies,
        adminAnomalies
      ] = await Promise.all([
        analyticsService.detectAnomalies('portfolio_completeness', 3),
        analyticsService.detectAnomalies('contact_volume', 3),
        analyticsService.detectAnomalies('admin_productivity', 3)
      ]);

      // Process anomalies
      [portfolioAnomalies, contactAnomalies, adminAnomalies].forEach((anomalyData, index) => {
        const categories = ['portfolio', 'contacts', 'admin'];
        const category = categories[index];
        
        if (anomalyData.anomalies && anomalyData.anomalies.length > 0) {
          const recentAnomalies = anomalyData.anomalies.filter(anomaly => {
            const anomalyDate = new Date(anomaly.date);
            const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
            return anomalyDate >= threeDaysAgo;
          });
          
          if (recentAnomalies.length > 0) {
            generatedAlerts.push({
              id: `anomaly_${category}_${Date.now()}`,
              type: 'warning',
              category: 'anomaly',
              title: `${category.charAt(0).toUpperCase() + category.slice(1)} Anomaly Detected`,
              message: `${recentAnomalies.length} recent anomal${recentAnomalies.length === 1 ? 'y' : 'ies'} detected in ${category} metrics.`,
              recommendation: 'Review recent changes that might have caused unusual patterns.',
              priority: recentAnomalies.some(a => a.severity === 'high') ? 'high' : 'medium',
              timestamp: new Date(),
              metrics: { anomalies: recentAnomalies.length, category }
            });
          }
        }
      });

      // Set generated insights and alerts
      setInsights(generatedInsights.sort((a, b) => {
        const priorityOrder = { high: 3, medium: 2, low: 1 };
        return priorityOrder[b.priority] - priorityOrder[a.priority];
      }));
      
      setAlerts(generatedAlerts.sort((a, b) => {
        const priorityOrder = { high: 3, medium: 2, low: 1 };
        return priorityOrder[b.priority] - priorityOrder[a.priority];
      }));

    } catch (error) {
      console.error('Error generating automated insights:', error);
      addNotification({
        type: 'error',
        title: 'Insights Generation Failed',
        message: 'Unable to generate automated insights. Please check your data connection.',
        timestamp: new Date()
      });
    } finally {
      setIsLoading(false);
    }
  }, [dateRange, thresholds]);

  // Load automated insights and alerts
  useEffect(() => {
    generateAutomatedInsights();
    loadStoredSettings();
  }, [dateRange, generateAutomatedInsights]);

  // Parse date range helper
  const parseDateRange = (range) => {
    switch (range) {
      case '7d': return 7;
      case '30d': return 30;
      case '90d': return 90;
      case '1y': return 365;
      default: return 30;
    }
  };

  // Add notification
  const addNotification = (notification) => {
    const newNotification = {
      ...notification,
      id: Date.now(),
      read: false
    };
    setNotifications(prev => [newNotification, ...prev.slice(0, 9)]); // Keep last 10
  };

  // Dismiss notification
  const dismissNotification = (id) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  };

  // Mark notification as read
  const markAsRead = (id) => {
    setNotifications(prev => prev.map(n => 
      n.id === id ? { ...n, read: true } : n
    ));
  };

  // Handle threshold change
  const handleThresholdChange = (metric, type, value) => {
    setThresholds(prev => ({
      ...prev,
      [metric]: {
        ...prev[metric],
        [type]: parseFloat(value)
      }
    }));
  };

  // Handle alert settings change
  const handleAlertSettingChange = (field, value) => {
    setAlertSettings(prev => ({
      ...prev,
      [field]: value
    }));
  };

  // Handle alert type toggle
  const toggleAlertType = (type) => {
    setAlertSettings(prev => ({
      ...prev,
      types: prev.types.includes(type) 
        ? prev.types.filter(t => t !== type)
        : [...prev.types, type]
    }));
  };

  // Format timestamp
  const formatTimestamp = (timestamp) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  // Get priority color
  const getPriorityColor = (priority) => {
    switch (priority) {
      case 'high': return 'var(--neon-orange)';
      case 'medium': return 'var(--neon-purple)';
      case 'low': return 'var(--neon-emerald)';
      default: return 'var(--neon-cyan)';
    }
  };

  // Get insight type color
  const getInsightTypeColor = (type) => {
    switch (type) {
      case 'success': return 'var(--neon-emerald)';
      case 'warning': return 'var(--neon-orange)';
      case 'info': return 'var(--neon-cyan)';
      case 'error': return 'var(--neon-pink)';
      default: return 'var(--neon-purple)';
    }
  };

  return (
    <div className="automated-reporting">
      {/* Header */}
      <div className="automated-reporting-header">
        <h2 className="automated-title">
          <span className="automated-icon">🔔</span>
          Automated Insights & Alerts
        </h2>
        <p className="automated-subtitle">
          Smart analytics with automated notifications and performance recommendations
        </p>
      </div>

      <div className="automated-content">
        {/* Quick Status */}
        <div className="status-overview">
          <div className="status-card">
            <div className="status-info">
              <div className="status-value">{insights.length}</div>
              <div className="status-label">Active Insights</div>
            </div>
            <div className="status-icon insights-icon">💡</div>
          </div>
          
          <div className="status-card">
            <div className="status-info">
              <div className="status-value">{alerts.length}</div>
              <div className="status-label">Active Alerts</div>
            </div>
            <div className="status-icon alerts-icon">⚠️</div>
          </div>
          
          <div className="status-card">
            <div className="status-info">
              <div className="status-value">{automationStatus}</div>
              <div className="status-label">Automation</div>
            </div>
            <div className="status-icon automation-icon">⚙️</div>
          </div>
          
          <div className="status-card">
            <div className="status-info">
              <div className="status-value">{notifications.filter(n => !n.read).length}</div>
              <div className="status-label">Unread</div>
            </div>
            <div className="status-icon notifications-icon">📬</div>
          </div>
        </div>

        {/* Smart Insights */}
        <div className="insights-section">
          <h3 className="section-title">
            <span className="title-icon">💡</span>
            Smart Insights
          </h3>
          
          {isLoading ? (
            <div className="loading-insights">
              <div className="loading-spinner">⚙️</div>
              <p>Generating automated insights...</p>
            </div>
          ) : insights.length > 0 ? (
            <div className="insights-grid">
              {insights.map(insight => (
                <div 
                  key={insight.id} 
                  className={`insight-card insight-card--${insight.type}`}
                  style={{ '--insight-color': getInsightTypeColor(insight.type) }}
                >
                  <div className="insight-header">
                    <div className="insight-category">{insight.category}</div>
                    <div 
                      className="insight-priority"
                      style={{ '--priority-color': getPriorityColor(insight.priority) }}
                    >
                      {insight.priority}
                    </div>
                  </div>
                  
                  <div className="insight-content">
                    <h4 className="insight-title">{insight.title}</h4>
                    <p className="insight-message">{insight.message}</p>
                    {insight.recommendation && (
                      <div className="insight-recommendation">
                        <strong>Recommendation:</strong> {insight.recommendation}
                      </div>
                    )}
                  </div>
                  
                  <div className="insight-footer">
                    <span className="insight-timestamp">{formatTimestamp(insight.timestamp)}</span>
                    {insight.metrics && (
                      <div className="insight-metrics">
                        {Object.entries(insight.metrics).map(([key, value]) => (
                          <span key={key} className="metric-badge">
                            {key}: {typeof value === 'number' ? value.toFixed(1) : value}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="empty-insights">
              <div className="empty-icon">💡</div>
              <p>No insights available. Generate more data to see smart recommendations.</p>
            </div>
          )}
        </div>

        {/* Active Alerts */}
        {alerts.length > 0 && (
          <div className="alerts-section">
            <h3 className="section-title">
              <span className="title-icon">⚠️</span>
              Active Alerts
            </h3>
            
            <div className="alerts-grid">
              {alerts.map(alert => (
                <div 
                  key={alert.id} 
                  className={`alert-card alert-card--${alert.priority}`}
                  style={{ '--alert-color': getPriorityColor(alert.priority) }}
                >
                  <div className="alert-header">
                    <div className="alert-category">{alert.category}</div>
                    <div className="alert-priority">{alert.priority} priority</div>
                  </div>
                  
                  <div className="alert-content">
                    <h4 className="alert-title">{alert.title}</h4>
                    <p className="alert-message">{alert.message}</p>
                    <div className="alert-recommendation">
                      <strong>Action:</strong> {alert.recommendation}
                    </div>
                  </div>
                  
                  <div className="alert-footer">
                    <span className="alert-timestamp">{formatTimestamp(alert.timestamp)}</span>
                    <button className="dismiss-alert-btn">Dismiss</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Notification Settings */}
        <div className="settings-section">
          <h3 className="section-title">
            <span className="title-icon">⚙️</span>
            Automation Settings
          </h3>
          
          <div className="settings-grid">
            {/* Alert Configuration */}
            <div className="settings-card">
              <h4 className="settings-card-title">Alert Configuration</h4>
              
              <div className="setting-group">
                <label className="setting-label">
                  <input
                    type="checkbox"
                    checked={alertSettings.enabled}
                    onChange={(e) => handleAlertSettingChange('enabled', e.target.checked)}
                  />
                  <span className="checkmark"></span>
                  Enable Automated Alerts
                </label>
              </div>
              
              {alertSettings.enabled && (
                <>
                  <div className="setting-group">
                    <label className="setting-label">Notification Frequency</label>
                    <select
                      value={alertSettings.frequency}
                      onChange={(e) => handleAlertSettingChange('frequency', e.target.value)}
                      className="setting-select"
                    >
                      {frequencies.map(freq => (
                        <option key={freq.id} value={freq.id}>
                          {freq.name} - {freq.description}
                        </option>
                      ))}
                    </select>
                  </div>
                  
                  <div className="setting-group">
                    <label className="setting-label">Email Address</label>
                    <input
                      type="email"
                      value={alertSettings.email}
                      onChange={(e) => handleAlertSettingChange('email', e.target.value)}
                      placeholder="your.email@example.com"
                      className="setting-input"
                    />
                  </div>
                  
                  <div className="setting-group">
                    <label className="setting-label">Alert Types</label>
                    <div className="alert-types-grid">
                      {alertTypes.map(type => (
                        <label key={type.id} className="alert-type-option">
                          <input
                            type="checkbox"
                            checked={alertSettings.types.includes(type.id)}
                            onChange={() => toggleAlertType(type.id)}
                          />
                          <span className="checkmark"></span>
                          <span className="type-icon">{type.icon}</span>
                          <span className="type-name">{type.name}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>
            
            {/* Threshold Settings */}
            <div className="settings-card">
              <h4 className="settings-card-title">Performance Thresholds</h4>
              
              {Object.entries(thresholds).map(([metric, values]) => (
                <div key={metric} className="threshold-group">
                  <div className="threshold-label">
                    {metric.replace(/([A-Z])/g, ' $1').toLowerCase().replace(/^\w/, c => c.toUpperCase())}
                  </div>
                  <div className="threshold-inputs">
                    <div className="threshold-input-group">
                      <label>Min</label>
                      <input
                        type="number"
                        value={values.min}
                        onChange={(e) => handleThresholdChange(metric, 'min', e.target.value)}
                        className="threshold-input"
                      />
                    </div>
                    <div className="threshold-input-group">
                      <label>Max</label>
                      <input
                        type="number"
                        value={values.max}
                        onChange={(e) => handleThresholdChange(metric, 'max', e.target.value)}
                        className="threshold-input"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
          
          <div className="settings-actions">
            <button onClick={saveSettings} className="save-settings-btn">
              <span className="btn-icon">💾</span>
              Save Settings
            </button>
            <button onClick={generateAutomatedInsights} className="refresh-insights-btn">
              <span className="btn-icon">🔄</span>
              Refresh Insights
            </button>
          </div>
        </div>

        {/* Recent Notifications */}
        {notifications.length > 0 && (
          <div className="notifications-section">
            <h3 className="section-title">
              <span className="title-icon">📬</span>
              Recent Notifications
            </h3>
            
            <div className="notifications-list">
              {notifications.map(notification => (
                <div 
                  key={notification.id} 
                  className={`notification-item ${notification.read ? 'read' : 'unread'}`}
                >
                  <div className="notification-content">
                    <div className="notification-header">
                      <span className={`notification-type notification-type--${notification.type}`}>
                        {notification.type === 'success' && '✅'}
                        {notification.type === 'warning' && '⚠️'}
                        {notification.type === 'error' && '❌'}
                        {notification.type === 'info' && 'ℹ️'}
                      </span>
                      <span className="notification-title">{notification.title}</span>
                    </div>
                    <p className="notification-message">{notification.message}</p>
                    <span className="notification-timestamp">{formatTimestamp(notification.timestamp)}</span>
                  </div>
                  
                  <div className="notification-actions">
                    {!notification.read && (
                      <button 
                        onClick={() => markAsRead(notification.id)}
                        className="mark-read-btn"
                      >
                        ✓
                      </button>
                    )}
                    <button 
                      onClick={() => dismissNotification(notification.id)}
                      className="dismiss-btn"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AutomatedReporting;