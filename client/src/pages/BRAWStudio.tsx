import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Slider } from '@/components/ui/slider';
import { Progress } from '@/components/ui/progress';
import { Upload, Play, Pause, SkipBack, SkipForward, Loader2 } from 'lucide-react';
import { BRAWFile, BRAWMetadata } from '@/hooks/useBRAW';
import { toast } from 'sonner';

/**
 * BRAW Studio - Dedicated page for BRAW file processing and viewing
 * Now with H.264 conversion for smooth playback and real-time progress
 */
export default function BRAWStudio() {
  const [file, setFile] = useState<BRAWFile | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadError, setUploadError] = useState<string | null>(null);
  
  // H.264 conversion states
  const [isConverting, setIsConverting] = useState(false);
  const [conversionProgress, setConversionProgress] = useState(0);
  const [conversionFrames, setConversionFrames] = useState({ current: 0, total: 0 });
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  
  const [currentFrame, setCurrentFrame] = useState<string | null>(null);
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractError, setExtractError] = useState<string | null>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  // Extract first frame for preview
  const extractFrame = async (timestamp: number, quality: 'low' | 'medium' | 'high' = 'medium') => {
    if (!file) return;

    try {
      setIsExtracting(true);
      setExtractError(null);

      const response = await fetch(`/api/braw/frame/${file.fileId}/${timestamp}?quality=${quality}`);
      
      if (!response.ok) {
        throw new Error('Failed to extract frame');
      }

      const blob = await response.blob();
      const dataUrl = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.readAsDataURL(blob);
      });

      setCurrentFrame(dataUrl);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Frame extraction failed';
      setExtractError(message);
      console.error('[BRAW Frame] Extraction failed:', error);
    } finally {
      setIsExtracting(false);
    }
  };

  // Convert BRAW to H.264 MP4 with real-time progress
  const convertToH264 = async (fileId: string) => {
    try {
      setIsConverting(true);
      setConversionProgress(0);
      setConversionFrames({ current: 0, total: 0 });
      
      const convertUrl = `/api/braw/convert/${fileId}`;
      console.log(`[BRAW Convert] Starting conversion for ${fileId} at URL: ${convertUrl}`);
      toast.info('Converting BRAW to H.264 for smooth playback...');

      // Connect to SSE endpoint for progress updates
      const eventSource = new EventSource(`/api/braw/convert-progress/${fileId}`);
      eventSourceRef.current = eventSource;

      eventSource.onmessage = (event) => {
        const data = JSON.parse(event.data);
        
        if (data.complete) {
          eventSource.close();
          eventSourceRef.current = null;
          
          if (data.success) {
            setVideoUrl(data.videoPath);
            setIsConverting(false);
            toast.success('Conversion complete! Ready for playback.');
            console.log(`[BRAW Convert] Success: ${data.videoPath}`);
          } else {
            setIsConverting(false);
            toast.error(data.error || 'Conversion failed');
            console.error('[BRAW Convert] Failed:', data.error);
          }
        } else {
          // Update progress
          setConversionProgress(data.progress);
          setConversionFrames({ current: data.current, total: data.total });
        }
      };

      eventSource.onerror = () => {
        eventSource.close();
        eventSourceRef.current = null;
        setIsConverting(false);
        toast.error('Connection to server lost');
      };

      // Start conversion
      const response = await fetch(convertUrl, {
        method: 'POST',
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[BRAW Convert] Server responded with error: ${response.status} - ${errorText}`);
        throw new Error(`Failed to start conversion: ${response.status} ${response.statusText}`);
      }

    } catch (error) {
      const message = error instanceof Error ? error.message : 'Conversion failed';
      console.error('[BRAW Convert] Error:', error);
      toast.error(message);
      setIsConverting(false);
      
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
    }
  };

  const cleanup = () => {
    setFile(null);
    setCurrentFrame(null);
    setVideoUrl(null);
    setCurrentTime(0);
    setIsPlaying(false);
    setUploadError(null);
    setExtractError(null);
    setIsConverting(false);
    setConversionProgress(0);
    setConversionFrames({ current: 0, total: 0 });
    
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    if (!selectedFile.name.toLowerCase().endsWith('.braw')) {
      toast.error('Please select a BRAW file');
      return;
    }

    toast.info('Uploading BRAW file...');
    
    try {
      setIsUploading(true);
      setUploadError(null);
      setUploadProgress(0);

      const formData = new FormData();
      formData.append('file', selectedFile);

      const xhr = new XMLHttpRequest();
      xhr.open('POST', '/api/braw/upload', true);

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
        xhr.onerror = () => reject(new Error('Upload failed'));
        xhr.send(formData);
      });

      setFile({
        fileId: result.fileId,
        name: selectedFile.name,
        size: selectedFile.size,
        metadata: {
          duration: result.info.duration,
          width: result.info.width,
          height: result.info.height,
          fps: result.info.fps,
          frameCount: result.info.frameCount || Math.ceil(result.info.duration * result.info.fps),
        },
        uploadedAt: new Date(),
      });

      setUploadProgress(100);
      toast.success('BRAW file uploaded successfully!');
      
      // Extract first frame for preview
      await extractFrame(0, 'medium');
      
      // Start H.264 conversion
      await convertToH264(result.fileId);
      
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Upload failed';
      setUploadError(message);
      console.error('[BRAW Upload] Failed:', error);
      toast.error(message);
    } finally {
      setIsUploading(false);
    }
  };

  // Sync video element with state
  useEffect(() => {
    if (!videoRef.current || !videoUrl) return;

    const video = videoRef.current;
    
    const handleTimeUpdate = () => {
      setCurrentTime(video.currentTime);
    };

    const handlePlay = () => {
      setIsPlaying(true);
    };

    const handlePause = () => {
      setIsPlaying(false);
    };

    video.addEventListener('timeupdate', handleTimeUpdate);
    video.addEventListener('play', handlePlay);
    video.addEventListener('pause', handlePause);

    return () => {
      video.removeEventListener('timeupdate', handleTimeUpdate);
      video.removeEventListener('play', handlePlay);
      video.removeEventListener('pause', handlePause);
    };
  }, [videoUrl]);

  // Handle playback speed
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.playbackRate = playbackSpeed;
    }
  }, [playbackSpeed]);

  // Render frame on canvas (for preview before conversion)
  useEffect(() => {
    if (!currentFrame || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const img = new Image();
    img.onload = () => {
      // Resize canvas to match image aspect ratio
      const maxWidth = canvas.parentElement?.clientWidth || 800;
      const maxHeight = canvas.parentElement?.clientHeight || 600;

      let width = img.width;
      let height = img.height;

      if (width > maxWidth) {
        height = (height * maxWidth) / width;
        width = maxWidth;
      }
      if (height > maxHeight) {
        width = (width * maxHeight) / height;
        height = maxHeight;
      }

      canvas.width = width;
      canvas.height = height;

      // Draw image
      ctx.drawImage(img, 0, 0, width, height);
    };
    img.src = currentFrame;
  }, [currentFrame]);

  // Handle play/pause
  const togglePlayback = () => {
    if (!videoRef.current) return;
    
    if (isPlaying) {
      videoRef.current.pause();
    } else {
      videoRef.current.play();
    }
  };

  // Handle seek
  const handleSeek = (value: number[]) => {
    if (!file || !videoRef.current) return;
    const time = (value[0] / 100) * file.metadata.duration;
    videoRef.current.currentTime = time;
    setCurrentTime(time);
  };

  // Handle frame step
  const stepFrame = (direction: 'forward' | 'backward') => {
    if (!file || !videoRef.current) return;
    const frameTime = 1 / file.metadata.fps;
    const newTime = currentTime + (direction === 'forward' ? frameTime : -frameTime);
    videoRef.current.currentTime = Math.max(0, Math.min(newTime, file.metadata.duration));
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-black text-white p-4">
      <div className="max-w-7xl mx-auto space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-400 to-purple-600 bg-clip-text text-transparent">
            BRAW Studio
          </h1>
          {file && (
            <Button variant="outline" onClick={cleanup}>
              Clear
            </Button>
          )}
        </div>

        {/* Upload Section */}
        {!file && (
          <Card className="p-8 bg-gray-800/50 border-gray-700">
            <div className="flex flex-col items-center justify-center space-y-4">
              <Upload className="w-16 h-16 text-gray-400" />
              <h2 className="text-xl font-semibold">Upload BRAW File</h2>
              <p className="text-gray-400 text-center">
                Select a Blackmagic RAW file to begin processing
              </p>
              <input
                type="file"
                accept=".braw"
                onChange={handleFileUpload}
                className="hidden"
                disabled={isUploading}
                ref={fileInputRef}
              />
              <Button
                disabled={isUploading}
                onClick={() => fileInputRef.current?.click()}
              >
                {isUploading ? `Uploading... ${Math.round(uploadProgress)}%` : 'Select File'}
              </Button>
              {uploadError && (
                <p className="text-red-500 text-sm">{uploadError}</p>
              )}
            </div>
          </Card>
        )}

        {/* Viewer Section */}
        {file && (
          <div className="space-y-4">
            {/* File Info */}
            <Card className="p-4 bg-gray-800/50 border-gray-700">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div>
                  <p className="text-gray-400">Resolution</p>
                  <p className="font-semibold">{file.metadata.width} × {file.metadata.height}</p>
                </div>
                <div>
                  <p className="text-gray-400">Frame Rate</p>
                  <p className="font-semibold">{file.metadata.fps} fps</p>
                </div>
                <div>
                  <p className="text-gray-400">Duration</p>
                  <p className="font-semibold">{file.metadata.duration.toFixed(2)}s</p>
                </div>
                <div>
                  <p className="text-gray-400">Frames</p>
                  <p className="font-semibold">{file.metadata.frameCount}</p>
                </div>
              </div>
            </Card>

            {/* Conversion Status */}
            {isConverting && (
              <Card className="p-4 bg-blue-900/30 border-blue-700">
                <div className="space-y-3">
                  <div className="flex items-center space-x-3">
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <div className="flex-1">
                      <p className="font-semibold">Converting to H.264...</p>
                      <p className="text-sm text-gray-400">
                        Frame {conversionFrames.current} of {conversionFrames.total} ({conversionProgress.toFixed(1)}%)
                      </p>
                    </div>
                  </div>
                  <Progress value={conversionProgress} className="w-full" />
                </div>
              </Card>
            )}

            {/* Video Viewer */}
            <Card className="p-4 bg-black border-gray-700">
              <div className="flex items-center justify-center min-h-[400px]">
                {isConverting || isExtracting ? (
                  <div className="text-center space-y-2">
                    <Loader2 className="w-8 h-8 animate-spin mx-auto text-blue-400" />
                    <div className="text-gray-400">
                      {isConverting ? 'Converting video...' : 'Extracting frame...'}
                    </div>
                  </div>
                ) : videoUrl ? (
                  <video
                    ref={videoRef}
                    src={videoUrl}
                    className="max-w-full max-h-[600px]"
                    style={{ display: 'block' }}
                  />
                ) : (
                  <canvas ref={canvasRef} className="max-w-full max-h-[600px]" />
                )}
              </div>
            </Card>

            {/* Playback Controls */}
            <Card className="p-4 bg-gray-800/50 border-gray-700 space-y-4">
              {/* Timeline */}
              <div className="space-y-2">
                <Slider
                  value={[file ? (currentTime / file.metadata.duration) * 100 : 0]}
                  onValueChange={handleSeek}
                  max={100}
                  step={0.1}
                  className="w-full"
                  disabled={!videoUrl}
                />
                <div className="flex justify-between text-xs text-gray-400">
                  <span>{currentTime.toFixed(2)}s</span>
                  <span>{file.metadata.duration.toFixed(2)}s</span>
                </div>
              </div>

              {/* Transport Controls */}
              <div className="flex items-center justify-center space-x-4">
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => stepFrame('backward')}
                  disabled={isPlaying || !videoUrl}
                >
                  <SkipBack className="w-4 h-4" />
                </Button>
                <Button
                  size="icon"
                  onClick={togglePlayback}
                  className="w-12 h-12"
                  disabled={!videoUrl}
                >
                  {isPlaying ? (
                    <Pause className="w-6 h-6" />
                  ) : (
                    <Play className="w-6 h-6" />
                  )}
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => stepFrame('forward')}
                  disabled={isPlaying || !videoUrl}
                >
                  <SkipForward className="w-4 h-4" />
                </Button>
              </div>

              {/* Playback Speed */}
              <div className="flex items-center justify-center space-x-4">
                <span className="text-sm text-gray-400">Speed:</span>
                {[0.25, 0.5, 1, 2].map((speed) => (
                  <Button
                    key={speed}
                    variant={playbackSpeed === speed ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setPlaybackSpeed(speed)}
                    disabled={!videoUrl}
                  >
                    {speed}x
                  </Button>
                ))}
              </div>

              {extractError && (
                <p className="text-red-500 text-sm text-center">{extractError}</p>
              )}
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}

