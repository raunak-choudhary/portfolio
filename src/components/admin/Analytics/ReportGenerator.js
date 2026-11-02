// src/components/admin/Analytics/ReportGenerator.js
import React, { useState, useEffect } from 'react';
import analyticsService from '../../../services/analyticsService';
import './ReportGenerator.css';

const ReportGenerator = ({ dateRange = '30d' }) => {
  const [isGenerating, setIsGenerating] = useState(false);
  const [setReportData] = useState({});
  const [selectedSections, setSelectedSections] = useState(['all']);
  const [reportFormat, setReportFormat] = useState('pdf');
  const [reportType, setReportType] = useState('comprehensive');
  const [exportProgress, setExportProgress] = useState(0);
  const [generatedReports, setGeneratedReports] = useState([]);
  const [scheduleSettings, setScheduleSettings] = useState({
    enabled: false,
    frequency: 'weekly',
    email: '',
    sections: ['all']
  });

  // Available report sections
  const reportSections = [
    { id: 'all', name: 'All Sections', icon: '📊' },
    { id: 'portfolio', name: 'Portfolio Metrics', icon: '📈' },
    { id: 'contacts', name: 'Contact Analytics', icon: '📧' },
    { id: 'admin', name: 'Admin Productivity', icon: '⚡' },
    { id: 'content', name: 'Content Performance', icon: '📝' },
    { id: 'trends', name: 'Trends & Forecasts', icon: '📉' }
  ];

  // Report formats
  const reportFormats = [
    { id: 'pdf', name: 'PDF Report', icon: '📄', description: 'Professional formatted report' },
    { id: 'csv', name: 'CSV Data', icon: '📋', description: 'Raw data for analysis' },
    { id: 'json', name: 'JSON Export', icon: '⚙️', description: 'Structured data format' }
  ];

  // Report types
  const reportTypes = [
    { id: 'comprehensive', name: 'Comprehensive Report', description: 'Full analytics overview' },
    { id: 'executive', name: 'Executive Summary', description: 'High-level insights only' },
    { id: 'technical', name: 'Technical Deep Dive', description: 'Detailed technical metrics' },
    { id: 'custom', name: 'Custom Report', description: 'Selected sections only' }
  ];

  // Load recent reports on mount
  useEffect(() => {
    loadRecentReports();
  }, []);

  // Load recent reports from localStorage
  const loadRecentReports = () => {
    try {
      const recent = JSON.parse(localStorage.getItem('recentReports') || '[]');
      setGeneratedReports(recent.slice(0, 10)); // Keep last 10 reports
    } catch (error) {
      console.error('Error loading recent reports:', error);
      setGeneratedReports([]);
    }
  };

  // Save report to recent list
  const saveToRecentReports = (report) => {
    try {
      const recent = JSON.parse(localStorage.getItem('recentReports') || '[]');
      const updated = [report, ...recent.filter(r => r.id !== report.id)].slice(0, 10);
      localStorage.setItem('recentReports', JSON.stringify(updated));
      setGeneratedReports(updated);
    } catch (error) {
      console.error('Error saving report:', error);
    }
  };

  // Handle section selection
  const handleSectionToggle = (sectionId) => {
    if (sectionId === 'all') {
      setSelectedSections(['all']);
    } else {
      const newSelection = selectedSections.includes('all') 
        ? [sectionId]
        : selectedSections.includes(sectionId)
          ? selectedSections.filter(id => id !== sectionId)
          : [...selectedSections.filter(id => id !== 'all'), sectionId];
      
      setSelectedSections(newSelection.length === 0 ? ['all'] : newSelection);
    }
  };

  // Collect analytics data for report
  const collectAnalyticsData = async () => {
    try {
      const sections = selectedSections.includes('all') ? 
        ['portfolio', 'contacts', 'admin', 'content', 'trends'] : 
        selectedSections;

      const data = {};

      // Collect data based on selected sections
      if (sections.includes('portfolio')) {
        setExportProgress(20);
        data.portfolio = {
          completeness: await analyticsService.calculatePortfolioCompleteness(),
          metrics: await analyticsService.getPortfolioMetrics(),
          engagement: await analyticsService.calculateContentEngagement(null, parseDateRange(dateRange))
        };
      }

      if (sections.includes('contacts')) {
        setExportProgress(40);
        data.contacts = await analyticsService.getContactAnalytics(dateRange);
      }

      if (sections.includes('admin')) {
        setExportProgress(60);
        data.admin = await analyticsService.getAdminActivityAnalytics(dateRange);
      }

      if (sections.includes('content')) {
        setExportProgress(80);
        data.content = await analyticsService.getContentAnalytics(null, dateRange);
      }

      if (sections.includes('trends')) {
        setExportProgress(90);
        data.trends = {
          portfolio: await analyticsService.getTrendAnalysis('portfolio_completeness', dateRange),
          contacts: await analyticsService.getTrendAnalysis('contact_volume', dateRange),
          admin: await analyticsService.getTrendAnalysis('admin_productivity', dateRange)
        };
      }

      setExportProgress(100);
      return data;
    } catch (error) {
      console.error('Error collecting analytics data:', error);
      throw new Error('Failed to collect analytics data');
    }
  };

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

  // Generate comprehensive report content
  const generateReportContent = (data) => {
    const sections = selectedSections.includes('all') ? 
      ['portfolio', 'contacts', 'admin', 'content', 'trends'] : 
      selectedSections;

    let content = `# RC Portfolio Analytics Report
Generated on: ${new Date().toLocaleString()}
Date Range: ${dateRange}
Report Type: ${reportTypes.find(t => t.id === reportType)?.name}

## Executive Summary
`;

    // Add executive summary
    if (data.portfolio?.completeness) {
      content += `- Portfolio Completeness: ${data.portfolio.completeness}%\n`;
    }
    if (data.contacts?.totalMessages) {
      content += `- Total Contact Messages: ${data.contacts.totalMessages}\n`;
    }
    if (data.admin?.totalSessions) {
      content += `- Admin Sessions: ${data.admin.totalSessions}\n`;
    }
    if (data.admin?.productivityScore) {
      content += `- Productivity Score: ${data.admin.productivityScore}/100\n`;
    }

    // Add detailed sections
    if (sections.includes('portfolio') && data.portfolio) {
      content += `\n## Portfolio Metrics
- Completeness Score: ${data.portfolio.completeness}%
- Total Portfolio Items: ${data.portfolio.metrics?.length || 0}
- Content Engagement Items: ${data.portfolio.engagement?.length || 0}
`;
    }

    if (sections.includes('contacts') && data.contacts) {
      content += `\n## Contact Analytics
- Total Messages: ${data.contacts.totalMessages || 0}
- Contact Types: ${JSON.stringify(data.contacts.contactTypes || {})}
- Popular Subjects: ${data.contacts.popularSubjects?.length || 0} topics tracked
`;
    }

    if (sections.includes('admin') && data.admin) {
      content += `\n## Admin Productivity
- Total Sessions: ${data.admin.totalSessions || 0}
- Total Active Time: ${data.admin.totalTime || 0} minutes
- Average Session: ${data.admin.avgSessionTime || 0} minutes
- Productivity Score: ${data.admin.productivityScore || 0}/100
- Most Used Section: ${data.admin.mostUsedSection || 'N/A'}
`;
    }

    if (sections.includes('content') && data.content) {
      content += `\n## Content Performance
- Content Items Tracked: ${data.content.length || 0}
- Total Engagement Score: ${data.content.reduce((sum, item) => sum + (item.avg_engagement || 0), 0)}
`;
    }

    if (sections.includes('trends') && data.trends) {
      content += `\n## Trends & Forecasts
- Portfolio Trend: ${data.trends.portfolio?.trend || 'stable'}
- Portfolio Change: ${data.trends.portfolio?.change || 0}%
- Contact Volume Trend: ${data.trends.contacts?.trend || 'stable'}
- Admin Productivity Trend: ${data.trends.admin?.trend || 'stable'}
`;
    }

    return content;
  };

  // Generate and download report
  const generateReport = async () => {
    try {
      setIsGenerating(true);
      setExportProgress(0);

      // Collect data
      const data = await collectAnalyticsData();
      setReportData(data);

      // Generate report based on format
      let exportResult;
      
      if (reportFormat === 'pdf') {
        // For PDF, we'd typically use a library like jsPDF or generate HTML for printing
        const reportContent = generateReportContent(data);
        exportResult = {
          success: true,
          data: reportContent,
          filename: `portfolio_analytics_${dateRange}_${Date.now()}.pdf`,
          format: 'pdf'
        };
        
        // Create a printable HTML version
        const printWindow = window.open('', '_blank');
        printWindow.document.write(`
          <html>
            <head>
              <title>RC Portfolio Analytics Report</title>
              <style>
                body { font-family: Arial, sans-serif; margin: 40px; line-height: 1.6; }
                h1 { color: #333; border-bottom: 2px solid #333; }
                h2 { color: #666; margin-top: 30px; }
                pre { background: #f5f5f5; padding: 15px; border-radius: 5px; }
              </style>
            </head>
            <body>
              <pre>${reportContent}</pre>
              <script>window.print();</script>
            </body>
          </html>
        `);
      } else {
        // For CSV/JSON, use existing export functionality
        exportResult = await analyticsService.exportAnalyticsData(
          reportFormat, 
          dateRange, 
          selectedSections
        );
      }

      if (exportResult.success) {
        // Save report info
        const reportInfo = {
          id: Date.now(),
          filename: exportResult.filename,
          format: reportFormat,
          type: reportType,
          sections: selectedSections,
          dateRange,
          generatedAt: new Date().toISOString(),
          size: exportResult.data?.length || 0
        };

        saveToRecentReports(reportInfo);

        // Download for CSV/JSON
        if (reportFormat !== 'pdf') {
          const blob = new Blob([exportResult.data], { 
            type: reportFormat === 'csv' ? 'text/csv' : 'application/json' 
          });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = exportResult.filename;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
        }

        setExportProgress(0);
      } else {
        throw new Error(exportResult.error || 'Export failed');
      }
    } catch (error) {
      console.error('Error generating report:', error);
      alert('Failed to generate report. Please try again.');
    } finally {
      setIsGenerating(false);
      setExportProgress(0);
    }
  };

  // Handle schedule settings change
  const handleScheduleChange = (field, value) => {
    setScheduleSettings(prev => ({
      ...prev,
      [field]: value
    }));
  };

  // Format file size
  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  // Format date
  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleString();
  };

  return (
    <div className="report-generator">
      {/* Header */}
      <div className="report-generator-header">
        <h2 className="report-title">
          <span className="report-icon">📄</span>
          Report Generator
        </h2>
        <p className="report-subtitle">
          Generate comprehensive analytics reports and export data
        </p>
      </div>

      <div className="report-generator-content">
        {/* Report Configuration */}
        <div className="report-config-section">
          <h3 className="config-title">Report Configuration</h3>
          
          {/* Report Type Selection */}
          <div className="config-group">
            <label className="config-label">Report Type</label>
            <div className="report-types">
              {reportTypes.map(type => (
                <button
                  key={type.id}
                  className={`report-type-btn ${reportType === type.id ? 'active' : ''}`}
                  onClick={() => setReportType(type.id)}
                >
                  <div className="type-name">{type.name}</div>
                  <div className="type-description">{type.description}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Format Selection */}
          <div className="config-group">
            <label className="config-label">Export Format</label>
            <div className="format-options">
              {reportFormats.map(format => (
                <button
                  key={format.id}
                  className={`format-btn ${reportFormat === format.id ? 'active' : ''}`}
                  onClick={() => setReportFormat(format.id)}
                >
                  <span className="format-icon">{format.icon}</span>
                  <div className="format-info">
                    <div className="format-name">{format.name}</div>
                    <div className="format-description">{format.description}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Section Selection */}
          <div className="config-group">
            <label className="config-label">Include Sections</label>
            <div className="section-selection">
              {reportSections.map(section => (
                <button
                  key={section.id}
                  className={`section-btn ${selectedSections.includes(section.id) ? 'active' : ''}`}
                  onClick={() => handleSectionToggle(section.id)}
                  disabled={reportType !== 'custom' && section.id !== 'all'}
                >
                  <span className="section-icon">{section.icon}</span>
                  <span className="section-name">{section.name}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Generate Button */}
          <div className="generate-section">
            <button
              className="generate-btn"
              onClick={generateReport}
              disabled={isGenerating || selectedSections.length === 0}
            >
              {isGenerating ? (
                <>
                  <span className="btn-icon spinner">⚙️</span>
                  Generating Report...
                </>
              ) : (
                <>
                  <span className="btn-icon">📊</span>
                  Generate Report
                </>
              )}
            </button>

            {/* Progress Bar */}
            {isGenerating && exportProgress > 0 && (
              <div className="progress-section">
                <div className="progress-bar">
                  <div 
                    className="progress-fill"
                    style={{ width: `${exportProgress}%` }}
                  ></div>
                </div>
                <div className="progress-text">{exportProgress}% Complete</div>
              </div>
            )}
          </div>
        </div>

        {/* Recent Reports */}
        {generatedReports.length > 0 && (
          <div className="recent-reports-section">
            <h3 className="recent-title">Recent Reports</h3>
            <div className="reports-list">
              {generatedReports.map(report => (
                <div key={report.id} className="report-item">
                  <div className="report-info">
                    <div className="report-name">{report.filename}</div>
                    <div className="report-meta">
                      <span className="report-format">{report.format.toUpperCase()}</span>
                      <span className="report-date">{formatDate(report.generatedAt)}</span>
                      <span className="report-size">{formatFileSize(report.size)}</span>
                    </div>
                  </div>
                  <div className="report-actions">
                    <button className="action-btn download">
                      <span className="action-icon">⬇️</span>
                      Download
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Scheduled Reports */}
        <div className="schedule-section">
          <h3 className="schedule-title">Automated Reports</h3>
          
          <div className="schedule-config">
            <div className="schedule-toggle">
              <label className="toggle-container">
                <input
                  type="checkbox"
                  checked={scheduleSettings.enabled}
                  onChange={(e) => handleScheduleChange('enabled', e.target.checked)}
                />
                <span className="toggle-slider"></span>
                <span className="toggle-label">Enable Scheduled Reports</span>
              </label>
            </div>

            {scheduleSettings.enabled && (
              <div className="schedule-options">
                <div className="schedule-group">
                  <label className="schedule-label">Frequency</label>
                  <select
                    value={scheduleSettings.frequency}
                    onChange={(e) => handleScheduleChange('frequency', e.target.value)}
                    className="schedule-select"
                  >
                    <option value="daily">Daily</option>
                    <option value="weekly">Weekly</option>
                    <option value="monthly">Monthly</option>
                    <option value="quarterly">Quarterly</option>
                  </select>
                </div>

                <div className="schedule-group">
                  <label className="schedule-label">Email Address</label>
                  <input
                    type="email"
                    value={scheduleSettings.email}
                    onChange={(e) => handleScheduleChange('email', e.target.value)}
                    placeholder="your.email@example.com"
                    className="schedule-input"
                  />
                </div>

                <button className="save-schedule-btn">
                  <span className="btn-icon">💾</span>
                  Save Schedule
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ReportGenerator;