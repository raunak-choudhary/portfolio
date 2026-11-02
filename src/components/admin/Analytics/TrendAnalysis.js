// src/components/admin/Analytics/TrendAnalysis.js
import React, { useState, useEffect, useCallback } from 'react';
import analyticsService from '../../../services/analyticsService';
import MetricsCard from './MetricsCard';
import './TrendAnalysis.css';

const TrendAnalysis = ({ dateRange = '30d' }) => {
  const [trendData, setTrendData] = useState({});
  const [isLoading, setIsLoading] = useState(true);
  const [activeView, setActiveView] = useState('overview');
  const [historicalTrends, setHistoricalTrends] = useState({});
  const [forecasts, setForecasts] = useState({});
  const [, setComparisons] = useState({});
  const [alerts, setAlerts] = useState([]);
  const [anomalies, setAnomalies] = useState({});
  const [, setBenchmarks] = useState({});
  const [error, setError] = useState(null);

  // View options for trend analysis
  const trendViews = [
    { id: 'overview', name: 'Overview', icon: '📊' },
    { id: 'portfolio', name: 'Portfolio Growth', icon: '📈' },
    { id: 'contacts', name: 'Contact Trends', icon: '📧' },
    { id: 'admin', name: 'Admin Activity', icon: '⚡' },
    { id: 'forecasts', name: 'Forecasts', icon: '🔮' }
  ];

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

  // Process trend analysis data - wrapped in useCallback
  const processTrendData = useCallback((trends, comparisons, forecasts, alerts) => {
    const overview = [];
    
    // Portfolio completeness trend
    if (trends.portfolioCompleteness && trends.portfolioCompleteness.data && trends.portfolioCompleteness.data.length > 0) {
      overview.push({
        title: 'Portfolio Growth',
        value: `${trends.portfolioCompleteness.change?.toFixed(1) || 0}%`,
        icon: '📈',
        color: trends.portfolioCompleteness.trend === 'increasing' ? 'emerald' : 
               trends.portfolioCompleteness.trend === 'decreasing' ? 'orange' : 'blue',
        change: trends.portfolioCompleteness.change || 0,
        changeType: trends.portfolioCompleteness.trend === 'increasing' ? 'positive' : 
                   trends.portfolioCompleteness.trend === 'decreasing' ? 'negative' : 'neutral',
        description: `${trends.portfolioCompleteness.trend || 'stable'} trend over ${dateRange}`,
        trend: trends.portfolioCompleteness.data
      });
    }

    // Contact volume trend
    if (trends.contactVolume && trends.contactVolume.data && trends.contactVolume.data.length > 0) {
      overview.push({
        title: 'Contact Volume',
        value: `${trends.contactVolume.change >= 0 ? '+' : ''}${trends.contactVolume.change?.toFixed(1) || 0}%`,
        icon: '📧',
        color: trends.contactVolume.trend === 'increasing' ? 'emerald' : 
               trends.contactVolume.trend === 'decreasing' ? 'orange' : 'blue',
        change: trends.contactVolume.change || 0,
        changeType: trends.contactVolume.trend === 'increasing' ? 'positive' : 
                   trends.contactVolume.trend === 'decreasing' ? 'negative' : 'neutral',
        description: 'Weekly contact trend analysis',
        trend: trends.contactVolume.data
      });
    }

    // Admin productivity trend
    if (trends.adminProductivity && trends.adminProductivity.data && trends.adminProductivity.data.length > 0) {
      overview.push({
        title: 'Admin Productivity',
        value: `${trends.adminProductivity.change >= 0 ? '+' : ''}${trends.adminProductivity.change?.toFixed(1) || 0}%`,
        icon: '⚡',
        color: trends.adminProductivity.trend === 'increasing' ? 'emerald' : 
               trends.adminProductivity.trend === 'decreasing' ? 'orange' : 'blue',
        change: trends.adminProductivity.change || 0,
        changeType: trends.adminProductivity.trend === 'increasing' ? 'positive' : 
                   trends.adminProductivity.trend === 'decreasing' ? 'negative' : 'neutral',
        description: 'Admin workflow efficiency trend',
        trend: trends.adminProductivity.data
      });
    }

    return overview;
  }, [dateRange]);

  // Generate forecast insights - wrapped in useCallback
  const generateForecastInsights = useCallback((forecasts) => {
    const insights = [];
    
    Object.entries(forecasts).forEach(([key, forecast]) => {
      if (forecast && forecast.forecast !== null) {
        const direction = forecast.confidence > 0.7 ? 'high' : forecast.confidence > 0.4 ? 'medium' : 'low';
        insights.push({
          metric: key.replace(/([A-Z])/g, ' $1').toLowerCase().replace(/^\w/, c => c.toUpperCase()),
          forecast: forecast.forecast,
          confidence: direction,
          recommendation: forecast.recommendation || 'Monitor closely for changes'
        });
      }
    });
    
    return insights;
  }, []);

  // Generate alert insights - wrapped in useCallback
  const generateAlertInsights = useCallback((anomalies, benchmarks) => {
    const alerts = [];
    
    // Check anomalies
    Object.entries(anomalies).forEach(([metric, data]) => {
      if (data.anomalies && data.anomalies.length > 0) {
        const recentAnomalies = data.anomalies.filter(anomaly => {
          const anomalyDate = new Date(anomaly.date);
          const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
          return anomalyDate >= threeDaysAgo;
        });
        
        if (recentAnomalies.length > 0) {
          alerts.push({
            type: 'anomaly',
            severity: recentAnomalies.some(a => a.severity === 'high') ? 'high' : 'medium',
            metric: metric.replace(/([A-Z])/g, ' $1').toLowerCase().replace(/^\w/, c => c.toUpperCase()),
            message: `${recentAnomalies.length} recent anomal${recentAnomalies.length === 1 ? 'y' : 'ies'} detected`,
            details: recentAnomalies
          });
        }
      }
    });
    
    // Check benchmarks
    Object.entries(benchmarks).forEach(([metric, data]) => {
      if (data.benchmark === 'below_average') {
        alerts.push({
          type: 'performance',
          severity: 'medium',
          metric: metric.replace(/([A-Z])/g, ' $1').toLowerCase().replace(/^\w/, c => c.toUpperCase()),
          message: `Performance below average (${data.percentile}th percentile)`,
          recommendation: data.recommendation
        });
      } else if (data.benchmark === 'excellent') {
        alerts.push({
          type: 'success',
          severity: 'low',
          metric: metric.replace(/([A-Z])/g, ' $1').toLowerCase().replace(/^\w/, c => c.toUpperCase()),
          message: `Excellent performance (${data.percentile}th percentile)`,
          recommendation: data.recommendation
        });
      }
    });
    
    return alerts.slice(0, 5); // Limit to 5 most important alerts
  }, []);

  // Load comprehensive trend analysis data
  const loadTrendData = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      
      const days = parseDateRange(dateRange);
      
      // Load historical trends for key metrics
      const [
        portfolioTrend,
        contactTrend,
        adminTrend
      ] = await Promise.all([
        analyticsService.getTrendAnalysis('portfolio_completeness', dateRange),
        analyticsService.getTrendAnalysis('contact_volume', dateRange),
        analyticsService.getTrendAnalysis('admin_productivity', dateRange)
      ]);

      // Load advanced analytics
      const [
        portfolioIdentification,
        contactIdentification,
        adminIdentification
      ] = await Promise.all([
        analyticsService.identifyTrends('portfolio_completeness', dateRange),
        analyticsService.identifyTrends('contact_volume', dateRange),
        analyticsService.identifyTrends('admin_productivity', dateRange)
      ]);

      // Load anomaly detection
      const [
        portfolioAnomalies,
        contactAnomalies,
        adminAnomalies
      ] = await Promise.all([
        analyticsService.detectAnomalies('portfolio_completeness', 3),
        analyticsService.detectAnomalies('contact_volume', 3),
        analyticsService.detectAnomalies('admin_productivity', 3)
      ]);

      // Load benchmarks
      const [
        portfolioBenchmark,
        contactBenchmark,
        adminBenchmark
      ] = await Promise.all([
        analyticsService.benchmarkMetrics('portfolio_completeness', days),
        analyticsService.benchmarkMetrics('contact_volume', days),
        analyticsService.benchmarkMetrics('admin_productivity', days)
      ]);

      // Load period comparisons
      const endDate = new Date();
      const startDate = new Date(endDate.getTime() - days * 24 * 60 * 60 * 1000);
      const prevEndDate = new Date(startDate.getTime() - 1);
      const prevStartDate = new Date(prevEndDate.getTime() - days * 24 * 60 * 60 * 1000);

      const periodComparison = await analyticsService.comparePerformancePeriods(
        prevStartDate.toISOString().split('T')[0],
        prevEndDate.toISOString().split('T')[0],
        startDate.toISOString().split('T')[0],
        endDate.toISOString().split('T')[0]
      );

      // Process all data
      const trends = {
        portfolioCompleteness: portfolioTrend || {},
        contactVolume: contactTrend || {},
        adminProductivity: adminTrend || {}
      };

      const identifications = {
        portfolioCompleteness: portfolioIdentification || {},
        contactVolume: contactIdentification || {},
        adminProductivity: adminIdentification || {}
      };

      const anomaliesData = {
        portfolioCompleteness: portfolioAnomalies || {},
        contactVolume: contactAnomalies || {},
        adminProductivity: adminAnomalies || {}
      };

      const benchmarksData = {
        portfolioCompleteness: portfolioBenchmark || {},
        contactVolume: contactBenchmark || {},
        adminProductivity: adminBenchmark || {}
      };

      setHistoricalTrends(trends);
      setForecasts(identifications);
      setAnomalies(anomaliesData);
      setBenchmarks(benchmarksData);
      setComparisons(periodComparison || {});

      // Generate alerts
      const alertInsights = generateAlertInsights(anomaliesData, benchmarksData);
      setAlerts(alertInsights);

      // Process overview data
      const overviewMetrics = processTrendData(trends, periodComparison, identifications, alertInsights);
      
      setTrendData({
        overview: overviewMetrics,
        trends,
        forecasts: identifications,
        comparisons: periodComparison,
        anomalies: anomaliesData,
        benchmarks: benchmarksData,
        lastUpdated: new Date()
      });

    } catch (error) {
      console.error('Error loading trend data:', error);
      setError('Failed to load trend analysis data. Please try again.');
      setTrendData({
        overview: [],
        trends: {},
        forecasts: {},
        comparisons: {},
        anomalies: {},
        benchmarks: {},
        error: error.message
      });
    } finally {
      setIsLoading(false);
    }
  }, [dateRange, parseDateRange, processTrendData, generateAlertInsights, setBenchmarks, setComparisons]);

  // Load data when component mounts or dateRange changes
  useEffect(() => {
    loadTrendData();
  }, [loadTrendData]);

  // Handle retry when error occurs
  const handleRetry = useCallback(() => {
    loadTrendData();
  }, [loadTrendData]);

  // Render trend chart
  const renderTrendChart = useCallback((data, title, color = 'blue') => {
    if (!data || data.length === 0) {
      return (
        <div className="trend-chart-empty">
          <span className="empty-chart-icon">📈</span>
          <p>No trend data available</p>
        </div>
      );
    }

    const maxValue = Math.max(...data.map(item => item.value || 0));
    const minValue = Math.min(...data.map(item => item.value || 0));
    const range = maxValue - minValue || 1;

    return (
      <div className="trend-chart">
        <h4 className="trend-chart-title">{title}</h4>
        <div className="trend-chart-container">
          <div className="trend-line">
            {data.map((point, index) => {
              const height = Math.max(5, ((point.value - minValue) / range) * 80);
              const left = (index / (data.length - 1)) * 100;
              
              return (
                <div
                  key={`trend-point-${index}`}
                  className={`trend-point trend-point--${color}`}
                  style={{
                    left: `${left}%`,
                    bottom: `${height}%`
                  }}
                  title={`${point.date}: ${point.value}`}
                />
              );
            })}
            <svg className="trend-path" viewBox="0 0 100 100" preserveAspectRatio="none">
              <polyline
                className={`trend-polyline trend-polyline--${color}`}
                points={data.map((point, index) => {
                  const x = (index / (data.length - 1)) * 100;
                  const y = 100 - Math.max(5, ((point.value - minValue) / range) * 80);
                  return `${x},${y}`;
                }).join(' ')}
              />
            </svg>
          </div>
          <div className="trend-axis">
            <span className="axis-label axis-label--min">{minValue.toFixed(1)}</span>
            <span className="axis-label axis-label--max">{maxValue.toFixed(1)}</span>
          </div>
        </div>
      </div>
    );
  }, []);

  // Render overview content
  const renderOverviewContent = useCallback(() => {
    return (
      <div className="trend-overview">
        {/* Key Metrics */}
        <div className="trend-metrics-grid">
          {trendData.overview && trendData.overview.length > 0 ? (
            trendData.overview.map((metric, index) => (
              <MetricsCard
                key={`trend-metric-${index}`}
                title={metric.title}
                value={metric.value}
                icon={metric.icon}
                color={metric.color}
                change={metric.change}
                changeType={metric.changeType}
                description={metric.description}
                showTrend={true}
                trend={metric.trend?.slice(-10).map(d => d.value || 0) || []}
                isLoading={isLoading}
              />
            ))
          ) : (
            !isLoading && (
              <div className="no-metrics-message">
                <span className="no-metrics-icon">📊</span>
                <p>No trend metrics available for the selected period</p>
              </div>
            )
          )}
        </div>

        {/* Period Comparison */}
        {trendData.comparisons && Object.keys(trendData.comparisons).length > 0 && (
          <div className="period-comparison">
            <h3 className="comparison-title">Period Comparison</h3>
            <div className="comparison-grid">
              <div className="period-card">
                <h4>Previous Period</h4>
                <div className="period-dates">
                  {trendData.comparisons.period1?.start} to {trendData.comparisons.period1?.end}
                </div>
                <div className="period-metrics">
                  {trendData.comparisons.period1?.metrics && Object.entries(trendData.comparisons.period1.metrics).map(([key, value]) => (
                    <div key={`prev-${key}`} className="metric-item">
                      <span className="metric-label">{key.replace(/_/g, ' ')}</span>
                      <span className="metric-value">{value}</span>
                    </div>
                  ))}
                </div>
              </div>
              
              <div className="period-card">
                <h4>Current Period</h4>
                <div className="period-dates">
                  {trendData.comparisons.period2?.start} to {trendData.comparisons.period2?.end}
                </div>
                <div className="period-metrics">
                  {trendData.comparisons.period2?.metrics && Object.entries(trendData.comparisons.period2.metrics).map(([key, value]) => (
                    <div key={`curr-${key}`} className="metric-item">
                      <span className="metric-label">{key.replace(/_/g, ' ')}</span>
                      <span className="metric-value">{value}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            
            {trendData.comparisons.summary && (
              <div className="comparison-summary">
                <div className="summary-stat">
                  <span className="stat-icon">📈</span>
                  <span className="stat-label">Improvements</span>
                  <span className="stat-value stat-value--positive">{trendData.comparisons.summary.improvement}</span>
                </div>
                <div className="summary-stat">
                  <span className="stat-icon">📉</span>
                  <span className="stat-label">Declines</span>
                  <span className="stat-value stat-value--negative">{trendData.comparisons.summary.decline}</span>
                </div>
                <div className="summary-stat">
                  <span className="stat-icon">➡️</span>
                  <span className="stat-label">Stable</span>
                  <span className="stat-value stat-value--neutral">{trendData.comparisons.summary.stable}</span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Alerts and Anomalies */}
        {alerts && alerts.length > 0 && (
          <div className="trend-alerts">
            <h3 className="alerts-title">Trend Alerts & Insights</h3>
            <div className="alerts-grid">
              {alerts.map((alert, index) => (
                <div key={`alert-${index}`} className={`alert-card alert-card--${alert.severity}`}>
                  <div className="alert-header">
                    <span className="alert-icon">
                      {alert.type === 'anomaly' && '⚠️'}
                      {alert.type === 'performance' && '📊'}
                      {alert.type === 'success' && '✅'}
                    </span>
                    <span className="alert-metric">{alert.metric}</span>
                  </div>
                  <div className="alert-message">{alert.message}</div>
                  {alert.recommendation && (
                    <div className="alert-recommendation">{alert.recommendation}</div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }, [trendData, alerts, isLoading]);

  // Render forecast content
  const renderForecastContent = useCallback(() => {
    const forecastInsights = generateForecastInsights(trendData.forecasts || {});
    
    return (
      <div className="trend-forecasts">
        <h3 className="forecasts-title">Predictive Analysis & Forecasts</h3>
        
        {forecastInsights.length > 0 ? (
          <div className="forecasts-grid">
            {forecastInsights.map((insight, index) => (
              <div key={`forecast-${index}`} className="forecast-card">
                <div className="forecast-header">
                  <h4 className="forecast-metric">{insight.metric}</h4>
                  <span className={`forecast-confidence forecast-confidence--${insight.confidence}`}>
                    {insight.confidence} confidence
                  </span>
                </div>
                <div className="forecast-value">
                  Forecast: <span className="forecast-number">{insight.forecast}</span>
                </div>
                <div className="forecast-recommendation">
                  {insight.recommendation}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="no-forecasts-message">
            <span className="no-forecasts-icon">🔮</span>
            <p>Insufficient data for reliable forecasting. Continue collecting data to enable predictions.</p>
          </div>
        )}

        {/* Benchmark Analysis */}
        {trendData.benchmarks && Object.keys(trendData.benchmarks).length > 0 && (
          <div className="benchmark-analysis">
            <h3 className="benchmark-title">Performance Benchmarks</h3>
            <div className="benchmark-grid">
              {Object.entries(trendData.benchmarks).map(([metric, data]) => (
                <div key={`benchmark-${metric}`} className="benchmark-card">
                  <h4 className="benchmark-metric">{metric.replace(/([A-Z])/g, ' $1').toLowerCase().replace(/^\w/, c => c.toUpperCase())}</h4>
                  <div className={`benchmark-status benchmark-status--${data.benchmark}`}>
                    {data.benchmark?.replace(/_/g, ' ').toUpperCase()}
                  </div>
                  <div className="benchmark-percentile">
                    {data.percentile}th percentile
                  </div>
                  {data.recommendation && (
                    <div className="benchmark-recommendation">
                      {data.recommendation}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }, [trendData.forecasts, trendData.benchmarks, generateForecastInsights]);

  // Render specific trend view
  const renderTrendView = useCallback((viewId) => {
    const trendMapping = {
      portfolio: { data: historicalTrends.portfolioCompleteness, title: 'Portfolio Completeness', color: 'blue' },
      contacts: { data: historicalTrends.contactVolume, title: 'Contact Volume', color: 'emerald' },
      admin: { data: historicalTrends.adminProductivity, title: 'Admin Productivity', color: 'purple' }
    };

    const trend = trendMapping[viewId];
    if (!trend || !trend.data || !trend.data.data) {
      return (
        <div className="trend-view-empty">
          <span className="empty-view-icon">📈</span>
          <p>No {trend?.title || 'trend'} data available for the selected period</p>
        </div>
      );
    }

    return (
      <div className="trend-view">
        {renderTrendChart(trend.data.data, trend.title, trend.color)}
        
        {/* Trend Analysis */}
        <div className="trend-analysis-content">
          <div className="analysis-card">
            <h4>Trend Direction</h4>
            <div className={`trend-direction trend-direction--${trend.data.trend}`}>
              {trend.data.trend?.toUpperCase() || 'STABLE'}
            </div>
            <div className="trend-change">
              {trend.data.change >= 0 ? '+' : ''}{trend.data.change?.toFixed(1) || 0}% change
            </div>
          </div>

          {forecasts[viewId] && (
            <div className="analysis-card">
              <h4>Pattern Analysis</h4>
              <div className="patterns-list">
                {forecasts[viewId].patterns?.map((pattern, index) => (
                  <div key={`pattern-${index}`} className="pattern-item">
                    {pattern.replace(/_/g, ' ').replace(/^\w/, c => c.toUpperCase())}
                  </div>
                ))}
              </div>
              {forecasts[viewId].forecast && (
                <div className="forecast-info">
                  Next period forecast: <strong>{forecasts[viewId].forecast}</strong>
                </div>
              )}
            </div>
          )}

          {anomalies[viewId] && anomalies[viewId].anomalies?.length > 0 && (
            <div className="analysis-card">
              <h4>Anomalies Detected</h4>
              <div className="anomalies-summary">
                {anomalies[viewId].summary.total} anomalies found
                ({anomalies[viewId].summary.spikes} spikes, {anomalies[viewId].summary.drops} drops)
              </div>
              {anomalies[viewId].recommendations?.map((rec, index) => (
                <div key={`anomaly-rec-${index}`} className="anomaly-recommendation">
                  {rec}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }, [historicalTrends, forecasts, anomalies, renderTrendChart]);

  // Error state
  if (error) {
    return (
      <div className="trend-analysis trend-analysis--error">
        <div className="error-state">
          <div className="error-icon">⚠️</div>
          <h3 className="error-title">Unable to Load Trend Analysis</h3>
          <p className="error-message">{error}</p>
          <button onClick={handleRetry} className="retry-button">
            Try Again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="trend-analysis">
      {/* Header */}
      <div className="trend-analysis-header">
        <h2 className="trend-analysis-title">
          <span className="analysis-icon">📉</span>
          Trend Analysis & Forecasting
        </h2>
        <p className="trend-analysis-subtitle">
          Historical patterns, predictive analytics, and performance insights
        </p>
      </div>

      {/* View Navigation */}
      <div className="trend-view-tabs">
        {trendViews.map(view => (
          <button
            key={view.id}
            className={`trend-tab ${activeView === view.id ? 'active' : ''}`}
            onClick={() => setActiveView(view.id)}
          >
            <span className="tab-icon">{view.icon}</span>
            <span className="tab-name">{view.name}</span>
          </button>
        ))}
      </div>

      {/* Content Area */}
      <div className="trend-content">
        {activeView === 'overview' && renderOverviewContent()}
        {activeView === 'forecasts' && renderForecastContent()}
        {['portfolio', 'contacts', 'admin'].includes(activeView) && renderTrendView(activeView)}
      </div>

      {/* Last Updated */}
      {trendData.lastUpdated && (
        <div className="trend-analysis-footer">
          <span className="last-updated">
            Analysis last updated: {trendData.lastUpdated.toLocaleString()}
          </span>
        </div>
      )}

      {/* Empty State */}
      {!isLoading && (!trendData.overview || trendData.overview.length === 0) && !error && (
        <div className="empty-state">
          <div className="empty-icon">📊</div>
          <h3 className="empty-title">No Trend Data Available</h3>
          <p className="empty-description">
            Start using your portfolio and collecting analytics data to see trend analysis and forecasting.
          </p>
        </div>
      )}
    </div>
  );
};

export default TrendAnalysis;