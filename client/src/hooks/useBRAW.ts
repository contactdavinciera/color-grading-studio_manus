/**
 * BRAW Processing Hook
 * 
 * React hook for handling BRAW file upload, metadata extraction,
 * and frame extraction with caching and progress tracking
 */

import { useState, useCallback } from 'react';
import { trpc } from '../lib/trpc';

export interface BRAWMetadata {
  duration: number;
  width: number;
  height: number;
  fps: number;
  frameCount: number;
}

export interface BRAWFile {
  fileId: string;
  name: string;
  size: number;
  metadata: BRAWMetadata;
  uploadedAt: Date;
}

export interface UseBRAWState {
  // File state
  file: BRAWFile | null;
  isUploading: boolean;
  uploadProgress: number;
  uploadError: string | null;

  // Frame extraction state
  currentFrame: string | null; // base64 encoded image
  isExtracting: boolean;
  extractError: string | null;

  // Methods
  uploadFile: (file: File) => Promise<void>;
  extractFrame: (timestamp: number, quality?: 'low' | 'medium' | 'high') => Promise<void>;
  extractFrames: (timestamps: number[], quality?: 'low' | 'medium' | 'high') => Promise<Array<{ timestamp: number; dataUrl: string }>>;
  cleanup: () => Promise<void>;
}

/**
 * Hook for BRAW file processing
 */
export function useBRAW(): UseBRAWState {
  const [file, setFile] = useState<BRAWFile | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const [currentFrame, setCurrentFrame] = useState<string | null>(null);
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractError, setExtractError] = useState<string | null>(null);

  // tRPC mutations and queries
  
  const getInfoQuery = trpc.braw.getInfo.useQuery;
  const extractFrameQuery = trpc.braw.extractFrame.useQuery;
  const cleanupMutation = trpc.braw.cleanup.useMutation();

  /**
   * Upload BRAW file
   */
  const uploadFile = useCallback(
    async (fileInput: File) => {
      try {
        setIsUploading(true);
        setUploadError(null);
        setUploadProgress(0);

        // Read file as base64
        const reader = new FileReader();
        reader.onprogress = (event) => {
          if (event.lengthComputable) {
            setUploadProgress((event.loaded / event.total) * 100);
          }
        };



        // Upload to server
        const formData = new FormData();
        formData.append("file", fileInput);

        const xhr = new XMLHttpRequest();
        xhr.open("POST", "/api/braw/upload", true);

        xhr.upload.onprogress = (event) => {
          if (event.lengthComputable) {
            setUploadProgress((event.loaded / event.total) * 100);
          }
        };

        const result = await new Promise<any>((resolve, reject) => {
          xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) {
              resolve(JSON.parse(xhr.responseText));
            } else {
              reject(new Error(xhr.statusText));
            }
          };
          xhr.onerror = () => reject(new Error("Upload failed"));
          xhr.send(formData);
        });

        // Get metadata using tRPC query
        // Note: In a real app, you'd use useQuery hook in a component
        // For now, we'll fetch it directly
        const infoResult = await fetch('/api/trpc/braw.getInfo', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fileId: result.fileId }),
        }).then(r => r.json());

        const info = infoResult.result?.data || result.info;

        setFile({
          fileId: result.fileId,
          name: fileInput.name,
          size: fileInput.size,
          metadata: {
            duration: info.duration,
            width: info.width,
            height: info.height,
            fps: info.fps,
            frameCount: info.frameCount || Math.ceil(info.duration * info.fps),
          },
          uploadedAt: new Date(),
        });

        setUploadProgress(100);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Upload failed';
        setUploadError(message);
        console.error('[BRAW Hook] Upload failed:', error);
      } finally {
        setIsUploading(false);
      }
    },
    []
  );

  /**
   * Extract single frame
   */
  const extractFrame = useCallback(
    async (timestamp: number, quality: 'low' | 'medium' | 'high' = 'medium') => {
      if (!file) {
        setExtractError('No file loaded');
        return;
      }

      try {
        setIsExtracting(true);
        setExtractError(null);

        // Call extractFrame query
        const result = await fetch('/api/trpc/braw.extractFrame', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fileId: file.fileId,
            timestamp,
            quality,
          }),
        }).then(r => r.json());

        const frameData = result.result?.data || result;

        // Convert base64 to data URL
        setCurrentFrame(`data:image/jpeg;base64,${frameData.data}`);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Frame extraction failed';
        setExtractError(message);
        console.error('[BRAW Hook] Frame extraction failed:', error);
      } finally {
        setIsExtracting(false);
      }
    },
    [file]
  );

  /**
   * Extract multiple frames
   */
  const extractFrames = useCallback(
    async (timestamps: number[], quality: 'low' | 'medium' | 'high' = 'medium') => {
      if (!file) {
        setExtractError('No file loaded');
        return [];
      }

      try {
        setIsExtracting(true);
        setExtractError(null);

        // Extract frames one by one
        const results = await Promise.all(
          timestamps.map((timestamp) =>
            fetch('/api/trpc/braw.extractFrame', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                fileId: file.fileId,
                timestamp,
                quality,
              }),
            }).then(r => r.json())
          )
        );

        // Return array of data URLs
        return results.map((result: any, index: number) => {
          const frameData = result.result?.data || result;
          return {
            timestamp: timestamps[index],
            dataUrl: `data:image/jpeg;base64,${frameData.data}`,
          };
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Frame extraction failed';
        setExtractError(message);
        console.error('[BRAW Hook] Frame extraction failed:', error);
        return [];
      } finally {
        setIsExtracting(false);
      }
    },
    [file]
  );

  /**
   * Cleanup file and cache
   */
  const cleanup = useCallback(async () => {
    if (!file) return;

    try {
      await cleanupMutation.mutateAsync({
        fileId: file.fileId,
      });

      setFile(null);
      setCurrentFrame(null);
      setUploadProgress(0);
    } catch (error) {
      console.error('[BRAW Hook] Cleanup failed:', error);
    }
  }, [file, cleanupMutation]);

  return {
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
  };
}

