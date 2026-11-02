// =====================================================
// CertificateModal.js - Certificate Viewer Modal
// Yellow/Gold Theme with PDF/Image Viewer and Download
// =====================================================

import React, { useEffect, useRef, useState } from 'react';

const CertificateModal = ({ certification, onClose }) => {
  console.log('📄 Rendering CertificateModal for:', certification?.title);

  const modalRef = useRef(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [fileType, setFileType] = useState('unknown');

  // Determine file type from URL
  useEffect(() => {
    if (certification?.certificate_pdf_url) {
      const url = certification.certificate_pdf_url.toLowerCase();
      if (url.includes('.pdf')) {
        setFileType('pdf');
      } else if (url.match(/\.(jpg|jpeg|png|gif|webp)$/)) {
        setFileType('image');
      } else {
        setFileType('unknown');
      }
    }
  }, [certification]);

  // Handle click outside modal to close
  const handleOverlayClick = (e) => {
    if (e.target === modalRef.current) {
      onClose();
    }
  };

  // Handle escape key
  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [onClose]);

  // Focus trap for accessibility
  useEffect(() => {
    const modal = modalRef.current;
    if (modal) {
      const focusableElements = modal.querySelectorAll(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];

      const handleTabKey = (e) => {
        if (e.key === 'Tab') {
          if (e.shiftKey && document.activeElement === firstElement) {
            e.preventDefault();
            lastElement.focus();
          } else if (!e.shiftKey && document.activeElement === lastElement) {
            e.preventDefault();
            firstElement.focus();
          }
        }
      };

      modal.addEventListener('keydown', handleTabKey);
      firstElement?.focus();

      return () => modal.removeEventListener('keydown', handleTabKey);
    }
  }, []);

  // Handle download
  const handleDownload = () => {
    console.log('📥 Downloading certificate:', certification.certificate_pdf_url);
    
    // Extract filename from URL or create one
    const urlParts = certification.certificate_pdf_url.split('/');
    const filename = urlParts[urlParts.length - 1] || 
      `${certification.title.replace(/[^a-z0-9]/gi, '-').toLowerCase()}-certificate.${fileType === 'pdf' ? 'pdf' : 'jpg'}`;
    
    // Create temporary download link
    const link = document.createElement('a');
    link.href = certification.certificate_pdf_url;
    link.download = filename;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    
    // Trigger download
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    // Add haptic feedback
    if (navigator.vibrate) {
      navigator.vibrate(100);
    }
  };

  // Handle content load
  const handleContentLoad = () => {
    setIsLoading(false);
    setLoadError(false);
  };

  // Handle content error
  const handleContentError = () => {
    console.error('Failed to load certificate content:', certification.certificate_pdf_url);
    setIsLoading(false);
    setLoadError(true);
  };

  // Handle print
  const handlePrint = () => {
    if (fileType === 'pdf') {
      // For PDF, open in new window for printing
      window.open(certification.certificate_pdf_url, '_blank');
    } else if (fileType === 'image') {
      // For images, open in new window for printing
      const printWindow = window.open('', '_blank');
      printWindow.document.write(`
        <html>
          <head>
            <title>Print Certificate - ${certification.title}</title>
            <style>
              body { margin: 0; padding: 20px; text-align: center; }
              img { max-width: 100%; height: auto; }
              @media print { body { padding: 0; } }
            </style>
          </head>
          <body>
            <img src="${certification.certificate_pdf_url}" alt="${certification.title}" />
            <script>window.onload = () => window.print();</script>
          </body>
        </html>
      `);
      printWindow.document.close();
    }
  };

  if (!certification?.certificate_pdf_url) {
    return null;
  }

  return (
    <div 
      className="certificate-modal-overlay" 
      ref={modalRef}
      onClick={handleOverlayClick}
      role="dialog"
      aria-modal="true"
      aria-labelledby="certificate-modal-title"
    >
      <div className="certificate-modal">
        {/* Modal Header */}
        <div className="certificate-modal-header">
          <div className="certificate-header-content">
            <h2 id="certificate-modal-title" className="certificate-modal-title">
              {certification.title}
            </h2>
            <div className="certificate-meta">
              <span className="certificate-issuer">
                Issued by {certification.issuer}
                {certification.issue_date && (
                  <> on {new Date(certification.issue_date + 'T00:00:00').toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'long', 
                    day: 'numeric'
                  })}</>
                )}
              </span>
          </div>
          </div>

          {/* Close Button */}
          <button 
            className="certificate-modal-close"
            onClick={onClose}
            aria-label="Close certificate viewer"
          >
            <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M18 6L6 18M6 6L18 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        </div>

        {/* Modal Content - Certificate Viewer */}
        <div className="certificate-modal-content">
          {isLoading && (
            <div className="certificate-loading">
              <div className="loading-spinner">
                <div className="spinner-ring">
                  <div className="spinner-ring-inner"></div>
                </div>
              </div>
              <p className="loading-message">Loading certificate...</p>
            </div>
          )}

          {loadError && (
            <div className="certificate-error">
              <div className="error-icon">
                <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2"/>
                  <path d="M15 9l-6 6M9 9l6 6" stroke="currentColor" strokeWidth="2"/>
                </svg>
              </div>
              <h3 className="error-title">Failed to Load Certificate</h3>
              <p className="error-message">
                The certificate file could not be displayed. You can still download it using the button below.
              </p>
              <button className="retry-btn" onClick={() => {
                setLoadError(false);
                setIsLoading(true);
              }}>
                <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M1 4v6h6M23 20v-6h-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                <span>Retry</span>
              </button>
            </div>
          )}

          {!loadError && (
            <div className="certificate-viewer">
              {fileType === 'pdf' ? (
                <iframe
                  src={certification.certificate_pdf_url}
                  className="certificate-pdf-viewer"
                  title={`Certificate: ${certification.title}`}
                  onLoad={handleContentLoad}
                  onError={handleContentError}
                />
              ) : fileType === 'image' ? (
                <img
                  src={certification.certificate_pdf_url}
                  alt={`Certificate: ${certification.title}`}
                  className="certificate-image-viewer"
                  onLoad={handleContentLoad}
                  onError={handleContentError}
                />
              ) : (
                <div className="unsupported-format">
                  <div className="unsupported-icon">
                    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" stroke="currentColor" strokeWidth="2"/>
                      <polyline points="14,2 14,8 20,8" stroke="currentColor" strokeWidth="2"/>
                      <path d="M12 11v6M12 11V9" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                    </svg>
                  </div>
                  <h3 className="unsupported-title">Preview Not Available</h3>
                  <p className="unsupported-message">
                    This file format cannot be previewed in the browser. You can download it to view the certificate.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Modal Footer - Action Buttons */}
        <div className="certificate-modal-footer">
          <div className="certificate-actions">
            {/* Download Button */}
            <button 
              className="action-btn download-btn primary"
              onClick={handleDownload}
              aria-label="Download certificate"
            >
              <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              <span>Download</span>
            </button>

            {/* Print Button */}
            <button 
              className="action-btn print-btn secondary"
              onClick={handlePrint}
              aria-label="Print certificate"
            >
              <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <polyline points="6,9 6,2 18,2 18,9" stroke="currentColor" strokeWidth="2"/>
                <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" stroke="currentColor" strokeWidth="2"/>
                <rect x="6" y="14" width="12" height="8" stroke="currentColor" strokeWidth="2"/>
              </svg>
              <span>Print</span>
            </button>

            {/* Open in New Tab Button */}
            <button 
              className="action-btn external-btn secondary"
              onClick={() => window.open(certification.certificate_pdf_url, '_blank')}
              aria-label="Open certificate in new tab"
            >
              <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14L21 3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              <span>Open External</span>
            </button>

            {/* Close Button */}
            <button 
              className="action-btn close-btn tertiary"
              onClick={onClose}
            >
              <span>Close</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CertificateModal;