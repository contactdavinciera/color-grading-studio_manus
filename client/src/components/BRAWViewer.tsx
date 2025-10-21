/**
 * BRAW Viewer Component
 * 
 * React component for uploading, viewing, and processing BRAW files
 * with frame extraction and color grading capabilities
 */

import React, { useState, useRef, useEffect } from 'react';
import { useBRAW } from '../hooks/useBRAW';
import '../styles/braw-viewer.css';

export interface BRAWViewerProps {
  onFrameSelect?: (dataUrl: string, timestamp: number) => void;
  maxFileSize?: number; // in MB
}

/**
 * BRAW Viewer Component
 */
export const BRAWViewer: React.FC<BRAWViewerProps> = ({
  onFrameSelect,
  maxFileSize = 2000, // 2GB default
}) => {
  const {
    file,
    isUploading,
    uploadProgress,
    uploadError,
    currentFrame,
    isExtracting,
    extractError,
    uploadFile,
    extractFrame,
    extractFrames,
    cleanup,
  } = useBRAW();

  const [quality, setQuality] = useState<'low' | 'medium' | 'high'>('medium');
  const [currentTimestamp, setCurrentTimestamp] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const playbackIntervalRef = useRef<NodeJS.Timeout | null>(null);

  /**
   * Handle file selection
   */
  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    // Validate file type
    if (!selectedFile.name.toLowerCase().endsWith('.braw')) {
      alert('Please select a BRAW file');
      return;
    }

    // Validate file size
    const fileSizeMB = selectedFile.size / (1024 * 1024);
    if (fileSizeMB > maxFileSize) {
      alert(`File size exceeds ${maxFileSize}MB limit`);
      return;
    }

    await uploadFile(selectedFile);
  };

  /**
   * Handle frame extraction
   */
  const handleExtractFrame = async () => {
    await extractFrame(currentTimestamp, quality);
    if (onFrameSelect && currentFrame) {
      onFrameSelect(currentFrame, currentTimestamp);
    }
  };

  /**
   * Handle playback
   */
  useEffect(() => {
    if (!isPlaying || !file) {
      if (playbackIntervalRef.current) {
        clearInterval(playbackIntervalRef.current);
      }
      return;
    }

    playbackIntervalRef.current = setInterval(() => {
      setCurrentTimestamp((prev) => {
        const nextTime = prev + 1 / file.metadata.fps;
        if (nextTime >= file.metadata.duration) {
          setIsPlaying(false);
          return file.metadata.duration;
        }
        return nextTime;
      });
    }, 1000 / file.metadata.fps);

    return () => {
      if (playbackIntervalRef.current) {
        clearInterval(playbackIntervalRef.current);
      }
    };
  }, [isPlaying, file]);

  /**
   * Handle slider change
   */
  const handleTimelineChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newTime = parseFloat(e.target.value);
    setCurrentTimestamp(newTime);
    setIsPlaying(false);
  };

  /**
   * Format time for display
   */
  const formatTime = (seconds: number): string => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 100);

    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
    }
    return `${minutes}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
  };

  return (
    <div className="braw-viewer">
      <div className="braw-viewer__container">
        {/* File Upload Section */}
        {!file ? (
          <div className="braw-viewer__upload">
            <div className="braw-viewer__upload-box">
              <input
                ref={fileInputRef}
                type="file"
                accept=".braw"
                onChange={handleFileSelect}
                disabled={isUploading}
                style={{ display: 'none' }}
              />
              <button
                className="braw-viewer__upload-button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading}
              >
                {isUploading ? (
                  <>
                    <span className="braw-viewer__spinner"></span>
                    Uploading... {Math.round(uploadProgress)}%
                  </>
                ) : (
                  <>
                    <span className="braw-viewer__upload-icon">📁</span>
                    Click to select BRAW file
                  </>
                )}
              </button>
              {uploadError && (
                <div className="braw-viewer__error">{uploadError}</div>
              )}
              <p className="braw-viewer__upload-hint">
                Max file size: {maxFileSize}MB
              </p>
            </div>
          </div>
        ) : (
          <>
            {/* File Info */}
            <div className="braw-viewer__info">
              <div className="braw-viewer__info-header">
                <h3>{file.name}</h3>
                <button
                  className="braw-viewer__close-button"
                  onClick={cleanup}
                  title="Close file"
                >
                  ✕
                </button>
              </div>
              <div className="braw-viewer__info-grid">
                <div className="braw-viewer__info-item">
                  <span className="braw-viewer__info-label">Resolution</span>
                  <span className="braw-viewer__info-value">
                    {file.metadata.width}×{file.metadata.height}
                  </span>
                </div>
                <div className="braw-viewer__info-item">
                  <span className="braw-viewer__info-label">Frame Rate</span>
                  <span className="braw-viewer__info-value">{file.metadata.fps} fps</span>
                </div>
                <div className="braw-viewer__info-item">
                  <span className="braw-viewer__info-label">Duration</span>
                  <span className="braw-viewer__info-value">
                    {formatTime(file.metadata.duration)}
                  </span>
                </div>
                <div className="braw-viewer__info-item">
                  <span className="braw-viewer__info-label">Frames</span>
                  <span className="braw-viewer__info-value">{file.metadata.frameCount}</span>
                </div>
              </div>
            </div>

            {/* Frame Viewer */}
            <div className="braw-viewer__frame-section">
              {currentFrame ? (
                <div className="braw-viewer__frame-container">
                  <img
                    src={currentFrame}
                    alt="Current frame"
                    className="braw-viewer__frame-image"
                  />
                </div>
              ) : (
                <div className="braw-viewer__frame-placeholder">
                  <span>No frame extracted</span>
                </div>
              )}
            </div>

            {/* Timeline Controls */}
            <div className="braw-viewer__timeline-section">
              <div className="braw-viewer__timeline-info">
                <span className="braw-viewer__time-current">
                  {formatTime(currentTimestamp)}
                </span>
                <span className="braw-viewer__time-separator">/</span>
                <span className="braw-viewer__time-total">
                  {formatTime(file.metadata.duration)}
                </span>
              </div>

              <input
                type="range"
                min="0"
                max={file.metadata.duration}
                step={1 / file.metadata.fps}
                value={currentTimestamp}
                onChange={handleTimelineChange}
                className="braw-viewer__timeline"
              />

              <div className="braw-viewer__playback-controls">
                <button
                  className={`braw-viewer__play-button ${isPlaying ? 'playing' : ''}`}
                  onClick={() => setIsPlaying(!isPlaying)}
                  disabled={isExtracting}
                  title={isPlaying ? 'Pause' : 'Play'}
                >
                  {isPlaying ? '⏸' : '▶'}
                </button>

                <select
                  value={quality}
                  onChange={(e) => setQuality(e.target.value as any)}
                  className="braw-viewer__quality-select"
                  disabled={isExtracting}
                >
                  <option value="low">Low (640p)</option>
                  <option value="medium">Medium (1920p)</option>
                  <option value="high">High (4K)</option>
                </select>

                <button
                  className="braw-viewer__extract-button"
                  onClick={handleExtractFrame}
                  disabled={isExtracting}
                >
                  {isExtracting ? (
                    <>
                      <span className="braw-viewer__spinner-small"></span>
                      Extracting...
                    </>
                  ) : (
                    'Extract Frame'
                  )}
                </button>
              </div>

              {extractError && (
                <div className="braw-viewer__error">{extractError}</div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default BRAWViewer;

