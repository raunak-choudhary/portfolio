import React, { useCallback, useEffect, useMemo, useState } from 'react';
import mediaLibraryService, { MEDIA_LIBRARY_BUCKETS } from '../../../services/mediaLibraryService';
import './MediaUpload.css';

const KIND_LABELS = {
  image: 'Image',
  pdf: 'PDF',
  document: 'Document',
  file: 'File'
};

const MediaUpload = () => {
  const [snapshot, setSnapshot] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedBucket, setSelectedBucket] = useState('all');
  const [selectedStatus, setSelectedStatus] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');

  const loadMediaLibrary = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const nextSnapshot = await mediaLibraryService.getMediaLibrarySnapshot();
      setSnapshot(nextSnapshot);
    } catch (loadError) {
      console.error('Error loading media library:', loadError);
      setError(loadError.message || 'Unable to load media library.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadMediaLibrary();
  }, [loadMediaLibrary]);

  const filteredItems = useMemo(() => {
    const items = snapshot?.items || [];
    const query = searchTerm.trim().toLowerCase();

    return items.filter(item => {
      const matchesBucket = selectedBucket === 'all' || item.bucketId === selectedBucket;
      const matchesStatus = selectedStatus === 'all' || item.status === selectedStatus;
      const matchesSearch = !query ||
        item.name.toLowerCase().includes(query) ||
        item.path.toLowerCase().includes(query) ||
        item.bucketLabel.toLowerCase().includes(query);

      return matchesBucket && matchesStatus && matchesSearch;
    });
  }, [snapshot, selectedBucket, selectedStatus, searchTerm]);

  const handleOpenPreview = (item) => {
    if (!item.previewUrl) {
      return;
    }

    window.open(item.previewUrl, '_blank', 'noopener,noreferrer');
  };

  if (isLoading) {
    return (
      <div className="media-library media-library--loading">
        <div className="media-library-loader"></div>
        <p>Loading Supabase media library...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="media-library media-library--error">
        <h2>Media Library</h2>
        <p>{error}</p>
        <button type="button" onClick={loadMediaLibrary} className="media-action-button">
          Retry
        </button>
      </div>
    );
  }

  const summary = snapshot?.summary || {};

  return (
    <div className="media-library">
      <div className="media-library-header">
        <div>
          <p className="media-library-kicker">Supabase Storage</p>
          <h2>Media Library</h2>
          <p>
            Review uploaded portfolio files, bucket privacy, and whether each file is referenced by current content.
            Unknown files are not automatically safe to delete.
          </p>
        </div>
        <button type="button" onClick={loadMediaLibrary} className="media-action-button">
          Refresh
        </button>
      </div>

      <div className="media-summary-grid">
        <div className="media-summary-card">
          <strong>{summary.totalFiles || 0}</strong>
          <span>Total Files</span>
        </div>
        <div className="media-summary-card">
          <strong>{summary.referencedFiles || 0}</strong>
          <span>Referenced</span>
        </div>
        <div className="media-summary-card">
          <strong>{summary.unknownFiles || 0}</strong>
          <span>Unknown</span>
        </div>
        <div className="media-summary-card">
          <strong>{summary.privateFiles || 0}</strong>
          <span>Private</span>
        </div>
      </div>

      <div className="media-bucket-strip">
        {(snapshot?.buckets || []).map(bucket => (
          <div key={bucket.id} className={`media-bucket-pill media-bucket-pill--${bucket.status}`}>
            <span>{bucket.label}</span>
            <strong>{bucket.fileCount}</strong>
            <small>{bucket.isPublic ? 'Public' : 'Private'}</small>
          </div>
        ))}
      </div>

      <div className="media-filters">
        <label>
          <span>Bucket</span>
          <select value={selectedBucket} onChange={(event) => setSelectedBucket(event.target.value)}>
            <option value="all">All Buckets</option>
            {MEDIA_LIBRARY_BUCKETS.map(bucket => (
              <option key={bucket.id} value={bucket.id}>{bucket.label}</option>
            ))}
          </select>
        </label>

        <label>
          <span>Status</span>
          <select value={selectedStatus} onChange={(event) => setSelectedStatus(event.target.value)}>
            <option value="all">All Statuses</option>
            <option value="referenced">Referenced</option>
            <option value="unknown">Unknown</option>
          </select>
        </label>

        <label className="media-search">
          <span>Search</span>
          <input
            type="search"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder="Search name, path, or bucket"
          />
        </label>
      </div>

      {filteredItems.length === 0 ? (
        <div className="media-empty-state">
          <h3>No files match these filters</h3>
          <p>Try another bucket, status, or search term.</p>
        </div>
      ) : (
        <div className="media-file-grid">
          {filteredItems.map(item => (
            <article key={item.id} className={`media-file-card media-file-card--${item.status}`}>
              <div className="media-preview">
                {item.kind === 'image' && item.previewUrl ? (
                  <img src={item.previewUrl} alt={item.name} loading="lazy" />
                ) : (
                  <span>{KIND_LABELS[item.kind] || 'File'}</span>
                )}
              </div>

              <div className="media-file-content">
                <div className="media-file-title-row">
                  <h3 title={item.name}>{item.name}</h3>
                  <span className={`media-status media-status--${item.status}`}>
                    {item.status}
                  </span>
                </div>
                <p title={item.path}>{item.path}</p>

                <div className="media-file-meta">
                  <span>{item.bucketLabel}</span>
                  <span>{item.sizeLabel}</span>
                  <span>{item.isPrivate ? 'Private' : 'Public'}</span>
                </div>

                {item.isPrivate && item.previewExpiresIn && (
                  <small className="media-private-note">
                    Preview uses a signed URL that expires in {item.previewExpiresIn} seconds.
                  </small>
                )}

                <div className="media-card-actions">
                  <button
                    type="button"
                    onClick={() => handleOpenPreview(item)}
                    disabled={!item.previewUrl}
                  >
                    Open Preview
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      <div className="media-safety-note">
        <strong>Safety note:</strong> Delete and replace workflows are intentionally not enabled in this first media library batch.
        Unknown means the current reference scan did not find a match, not that the file is guaranteed unused.
      </div>
    </div>
  );
};

export default MediaUpload;
