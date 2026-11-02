// src/components/admin/Analytics/VisitorInsights.js
import React, { useState, useEffect, useCallback } from 'react';
import analyticsService from '../../../services/analyticsService';
import MetricsCard from './MetricsCard';
import './VisitorInsights.css';

const VisitorInsights = ({ dateRange = '30d' }) => {
  const [visitorData, setVisitorData] = useState({});
  const [isLoading, setIsLoading] = useState(true);
  const [contactMetrics, setContactMetrics] = useState([]);
  const [peakHours, setPeakHours] = useState([]);
  const [popularSubjects, setPopularSubjects] = useState([]);
  const [contactTrends, setContactTrends] = useState([]);
  const [error, setError] = useState(null);

  // Calculate real trend change from historical data
  const calculateTrendChange = useCallback((current, historical) => {
    if (!historical || !Array.isArray(historical) || historical.length < 2) {
      return 0;
    }

    const previousPeriod = historical[historical.length - 2]?.value || 0;
    const currentPeriod = current || 0;

    if (previousPeriod === 0) return currentPeriod > 0 ? 100 : 0;
    
    return Math.round(((currentPeriod - previousPeriod) / previousPeriod) * 100 * 10) / 10;
  }, []);

  // Get trend type based on change value
  const getTrendType = useCallback((change) => {
    if (change > 5) return 'positive';
    if (change < -5) return 'negative';
    return 'neutral';
  }, []);

  // Process contact analytics data with real trend calculations
  const processContactData = useCallback((contactAnalytics) => {
    const total = contactAnalytics.totalMessages || 0;
    const types = contactAnalytics.contactTypes || {};
    const historical = contactAnalytics.historicalData || [];
    
    // Calculate real trend changes from historical data
    const totalTrend = calculateTrendChange(total, historical.filter(h => h.metric === 'total'));
    const hrTrend = calculateTrendChange(types.hr || types['HR Representative'] || 0, historical.filter(h => h.metric === 'hr'));
    const recruiterTrend = calculateTrendChange(types.recruiter || types['Recruiter'] || 0, historical.filter(h => h.metric === 'recruiter'));
    const managerTrend = calculateTrendChange(types.manager || types['Manager'] || 0, historical.filter(h => h.metric === 'manager'));
    const otherTrend = calculateTrendChange(types.other || types['Other'] || 0, historical.filter(h => h.metric === 'other'));
    const responseTrend = calculateTrendChange(contactAnalytics.avgResponseTime || 0, historical.filter(h => h.metric === 'response_time'));
    
    return [
      {
        title: 'Total Messages',
        value: total,
        icon: '📬',
        color: 'blue',
        change: totalTrend,
        changeType: getTrendType(totalTrend),
        description: `Messages received in ${dateRange}`
      },
      {
        title: 'HR Representatives',
        value: types.hr || types['HR Representative'] || 0,
        icon: '👔',
        color: 'emerald',
        change: hrTrend,
        changeType: getTrendType(hrTrend),
        description: 'HR professional inquiries'
      },
      {
        title: 'Recruiters',
        value: types.recruiter || types['Recruiter'] || 0,
        icon: '🎯',
        color: 'purple',
        change: recruiterTrend,
        changeType: getTrendType(recruiterTrend),
        description: 'Recruitment opportunities'
      },
      {
        title: 'Managers',
        value: types.manager || types['Manager'] || 0,
        icon: '👨‍💼',
        color: 'orange',
        change: managerTrend,
        changeType: getTrendType(managerTrend),
        description: 'Management inquiries'
      },
      {
        title: 'Other Contacts',
        value: types.other || types['Other'] || 0,
        icon: '💼',
        color: 'pink',
        change: otherTrend,
        changeType: getTrendType(otherTrend),
        description: 'General inquiries'
      },
      {
        title: 'Avg Response Time',
        value: `${Math.round((contactAnalytics.avgResponseTime || 0) * 10) / 10}h`,
        icon: '⏱️',
        color: 'blue',
        change: responseTrend,
        changeType: getTrendType(responseTrend),
        description: 'Average response time'
      }
    ];
  }, [dateRange, calculateTrendChange, getTrendType]);

  // Format hour for display
  const formatHour = useCallback((hour) => {
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour % 12 || 12;
    return `${displayHour}${ampm}`;
  }, []);

  // Process peak hours data
  const processPeakHours = useCallback((peakHoursData) => {
    if (!peakHoursData || typeof peakHoursData !== 'object') return [];
    
    const hours = [];
    for (let i = 0; i < 24; i++) {
      hours.push({
        hour: i,
        count: peakHoursData[i] || 0,
        label: formatHour(i),
        isActive: (peakHoursData[i] || 0) > 0
      });
    }

    return hours.sort((a, b) => b.count - a.count);
  }, [formatHour]);

  // Calculate day percentage
  const calculateDayPercentage = useCallback((dayCount, allDays) => {
    const maxCount = Math.max(...allDays.map(d => d.count));
    return maxCount > 0 ? (dayCount / maxCount) * 100 : 0;
  }, []);

  // Process daily trends
  const processDailyTrends = useCallback((dailyTrend) => {
    if (!dailyTrend || !Array.isArray(dailyTrend)) return [];
    
    return dailyTrend.map(day => ({
      ...day,
      percentage: calculateDayPercentage(day.count, dailyTrend)
    }));
  }, [calculateDayPercentage]);

  // Load visitor insights data
  const loadVisitorData = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      
      const contactAnalytics = await analyticsService.getContactAnalytics(dateRange);
      
      setVisitorData({
        ...contactAnalytics,
        lastUpdated: new Date()
      });

      // Process data for components
      const processedMetrics = processContactData(contactAnalytics);
      setContactMetrics(processedMetrics);

      const processedPeakHours = processPeakHours(contactAnalytics.peakHours);
      setPeakHours(processedPeakHours);

      setPopularSubjects(contactAnalytics.popularSubjects || []);
      
      const processedTrends = processDailyTrends(contactAnalytics.dailyTrend);
      setContactTrends(processedTrends);

    } catch (error) {
      console.error('Error loading visitor data:', error);
      setError('Failed to load visitor insights. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }, [dateRange, processContactData, processPeakHours, processDailyTrends]);

  // Load data when component mounts or dateRange changes
  useEffect(() => {
    loadVisitorData();
  }, [loadVisitorData]);

  // Handle retry when error occurs
  const handleRetry = useCallback(() => {
    loadVisitorData();
  }, [loadVisitorData]);

  // Get contact type distribution for chart
  const getContactTypeDistribution = useCallback(() => {
    const types = visitorData.contactTypes || {};
    return [
      { name: 'HR Representatives', value: types.hr || types['HR Representative'] || 0, color: 'var(--neon-emerald)' },
      { name: 'Recruiters', value: types.recruiter || types['Recruiter'] || 0, color: 'var(--neon-purple)' },
      { name: 'Managers', value: types.manager || types['Manager'] || 0, color: 'var(--neon-orange)' },
      { name: 'Other', value: types.other || types['Other'] || 0, color: 'var(--neon-pink)' }
    ].filter(item => item.value > 0);
  }, [visitorData.contactTypes]);

  const contactDistribution = getContactTypeDistribution();
  const totalContacts = contactDistribution.reduce((sum, item) => sum + item.value, 0);

  // Error state
  if (error) {
    return (
      <div className="visitor-insights visitor-insights--error">
        <div className="error-state">
          <div className="error-icon">⚠️</div>
          <h3 className="error-title">Unable to Load Visitor Insights</h3>
          <p className="error-message">{error}</p>
          <button onClick={handleRetry} className="retry-button">
            Try Again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="visitor-insights">
      {/* Header */}
      <div className="visitor-insights-header">
        <h2 className="visitor-insights-title">
          <span className="insights-icon">📧</span>
          Visitor Insights & Contact Analytics
        </h2>
        <p className="visitor-insights-subtitle">
          Comprehensive analysis of contact patterns, inquiry types, and visitor engagement trends
        </p>
      </div>

      {/* Contact Metrics Grid */}
      <div className="contact-metrics-grid">
        {contactMetrics.map((metric, index) => (
          <MetricsCard
            key={`contact-metric-${index}`}
            title={metric.title}
            value={metric.value}
            icon={metric.icon}
            color={metric.color}
            change={metric.change}
            changeType={metric.changeType}
            description={metric.description}
            isLoading={isLoading}
          />
        ))}
      </div>

      {/* Contact Type Distribution */}
      <div className="contact-distribution-section">
        <div className="distribution-card">
          <h3 className="distribution-title">Contact Type Distribution</h3>
          {totalContacts > 0 ? (
            <>
              <div className="distribution-chart">
                <div className="donut-chart">
                  <svg viewBox="0 0 100 100" className="donut-svg">
                    {contactDistribution.map((item, index) => {
                      const percentage = (item.value / totalContacts) * 100;
                      const circumference = 2 * Math.PI * 30;
                      const strokeDasharray = `${(percentage / 100) * circumference} ${circumference}`;
                      const rotation = contactDistribution.slice(0, index).reduce((sum, prev) => {
                        return sum + ((prev.value / totalContacts) * 360);
                      }, 0);
                      
                      return (
                        <circle
                          key={`donut-${index}`}
                          cx="50"
                          cy="50"
                          r="30"
                          fill="none"
                          stroke={item.color}
                          strokeWidth="8"
                          strokeDasharray={strokeDasharray}
                          transform={`rotate(${rotation - 90} 50 50)`}
                          className="donut-segment"
                        />
                      );
                    })}
                  </svg>
                  <div className="donut-center">
                    <div className="donut-total">{totalContacts}</div>
                    <div className="donut-label">Total</div>
                  </div>
                </div>
              </div>
              <div className="distribution-legend">
                {contactDistribution.map((item, index) => (
                  <div key={`legend-${index}`} className="legend-item">
                    <div 
                      className="legend-color" 
                      style={{ backgroundColor: item.color }}
                    ></div>
                    <span className="legend-name">{item.name}</span>
                    <span className="legend-value">
                      {item.value} ({Math.round((item.value / totalContacts) * 100)}%)
                    </span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="no-data-message">
              <span className="no-data-icon">📭</span>
              <p>No contact data available for the selected period</p>
            </div>
          )}
        </div>

        {/* Peak Hours Analysis */}
        <div className="peak-hours-card">
          <h3 className="peak-hours-title">Peak Contact Hours</h3>
          {peakHours.length > 0 && peakHours.some(h => h.count > 0) ? (
            <div className="peak-hours-chart">
              {peakHours.slice(0, 12).map((hour, index) => (
                <div key={`hour-${index}`} className="hour-bar">
                  <div 
                    className="hour-bar-fill"
                    style={{ 
                      height: `${hour.count > 0 ? Math.max(20, (hour.count / Math.max(...peakHours.map(h => h.count))) * 100) : 0}%`,
                      transition: 'height 0.3s ease-in-out'
                    }}
                  ></div>
                  <div className="hour-label">{hour.label}</div>
                  <div className="hour-count">{hour.count}</div>
                </div>
              ))}
            </div>
          ) : (
            <div className="no-data-message">
              <span className="no-data-icon">⏰</span>
              <p>No peak hour data available</p>
            </div>
          )}
        </div>
      </div>

      {/* Popular Subjects */}
      {popularSubjects && popularSubjects.length > 0 && (
        <div className="popular-subjects-section">
          <h3 className="subjects-title">Popular Inquiry Topics</h3>
          <div className="subjects-grid">
            {popularSubjects.slice(0, 8).map((subject, index) => (
              <div key={`subject-${index}`} className="subject-card">
                <div className="subject-rank">#{index + 1}</div>
                <div className="subject-content">
                  <div className="subject-name">{subject.subject}</div>
                  <div className="subject-stats">
                    <span className="subject-count">{subject.count} inquiries</span>
                  </div>
                </div>
                <div className="subject-bar">
                  <div 
                    className="subject-bar-fill"
                    style={{ 
                      width: `${(subject.count / Math.max(...popularSubjects.map(s => s.count))) * 100}%`,
                      transition: 'width 0.3s ease-in-out'
                    }}
                  ></div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Contact Trends */}
      {contactTrends && contactTrends.length > 0 && (
        <div className="contact-trends-section">
          <h3 className="trends-title">Daily Contact Trends</h3>
          <div className="trends-chart">
            {contactTrends.map((day, index) => (
              <div key={`trend-${index}`} className="trend-day">
                <div 
                  className="trend-bar"
                  style={{ 
                    height: `${Math.max(10, day.percentage)}%`,
                    transition: 'height 0.3s ease-in-out'
                  }}
                  title={`${day.day}: ${day.count} contacts`}
                ></div>
                <div className="trend-label">{day.day}</div>
                <div className="trend-count">{day.count}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Insights Summary */}
      <div className="insights-summary">
        <h3 className="summary-title">Key Insights</h3>
        <div className="insights-grid">
          <div className="insight-card">
            <div className="insight-icon">🎯</div>
            <div className="insight-content">
              <h4>Contact Quality</h4>
              <p>
                {contactDistribution.length > 0 
                  ? `${Math.round((contactDistribution.filter(c => c.name !== 'Other').reduce((sum, c) => sum + c.value, 0) / totalContacts) * 100)}% professional inquiries`
                  : 'No contact data available'
                }
              </p>
            </div>
          </div>
          
          <div className="insight-card">
            <div className="insight-icon">📈</div>
            <div className="insight-content">
              <h4>Engagement Trend</h4>
              <p>
                {visitorData.totalMessages > 0 
                  ? `${visitorData.totalMessages} total messages in ${dateRange}`
                  : `No messages received in ${dateRange}`
                }
              </p>
            </div>
          </div>
          
          <div className="insight-card">
            <div className="insight-icon">⏰</div>
            <div className="insight-content">
              <h4>Best Contact Time</h4>
              <p>
                {peakHours.length > 0 && peakHours[0].count > 0
                  ? `Peak activity at ${peakHours[0].label}`
                  : 'No peak hour data available'
                }
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Last Updated */}
      {visitorData.lastUpdated && (
        <div className="visitor-insights-footer">
          <span className="last-updated">
            Data last updated: {visitorData.lastUpdated.toLocaleString()}
          </span>
        </div>
      )}

      {/* Empty State */}
      {!isLoading && contactMetrics.every(m => m.value === 0) && (
        <div className="empty-state">
          <div className="empty-icon">📧</div>
          <h3 className="empty-title">No Visitor Data Available</h3>
          <p className="empty-description">
            Contact form submissions will appear here once visitors start reaching out through your portfolio.
          </p>
        </div>
      )}
    </div>
  );
};

export default VisitorInsights;