import { useEffect, useRef, useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Slider } from '@/components/ui/slider';
import {
  Play,
  Pause,
  Upload,
  Download,
  Settings,
  Maximize,
  Grid3x3,
  Layers,
  Palette,
  Film,
  Eye,
  SkipBack,
  SkipForward
} from 'lucide-react';
import { WebGLEngine } from '@/lib/webgl/WebGLEngine';
import MetadataPanel from '@/components/MetadataPanel';
import { MetadataExtractor, type ExtractedMetadata } from '@/lib/metadata/MetadataExtractor';
import { BRAWMetadata } from '@/lib/raw/braw';
import { MetadataOverrides } from '@/components/MetadataPanel';
import { trpc } from '@/lib/trpc';
import { useBRAW } from '@/hooks/useBRAW';
import { toast } from 'sonner';

export default function StudioWorking() {
  const viewerRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<WebGLEngine | null>(null);
  const sourceImageRef = useRef<HTMLImageElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [hasImage, setHasImage] = useState(false);
  const [isVideo, setIsVideo] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isBRAWFile, setIsBRAWFile] = useState(false);
  const [currentBRAWFrame, setCurrentBRAWFrame] = useState(0);

  const [contrast, setContrast] = useState(0);
  const [saturation, setSaturation] = useState(0);
  const [exposure, setExposure] = useState(0);

  const [rawOverrides, setRawOverrides] = useState<MetadataOverrides>({});

  const [metadata, setMetadata] = useState<ExtractedMetadata | BRAWMetadata | null>(null);

  const { 
    file: brawFile, 
    currentFrame: brawFrameData, 
    isUploading, 
    uploadError,
    isExtracting,
    extractError,
    uploadFile,
    extractFrame,
    cleanup
  } = useBRAW();

  useEffect(() => {
    if (viewerRef.current && !engineRef.current) {
      engineRef.current = new WebGLEngine({ canvas: viewerRef.current });
    }
  }, []);

  const renderCurrentFrame = useCallback(() => {
    if (!engineRef.current) return;
    if (isBRAWFile && brawFrameData) {
      const img = new Image();
      img.onload = () => {
        engineRef.current?.renderImage(img);
        engineRef.current?.applyAdjustments({ contrast, saturation, exposure });
      };
      img.src = brawFrameData;
    } else if (videoRef.current) {
      engineRef.current.renderImage(videoRef.current);
      engineRef.current.applyAdjustments({ contrast, saturation, exposure });
    } else if (sourceImageRef.current) {
      engineRef.current.renderImage(sourceImageRef.current);
      engineRef.current.applyAdjustments({ contrast, saturation, exposure });
    }
  }, [isBRAWFile, brawFrameData, contrast, saturation, exposure]);

  useEffect(() => {
    renderCurrentFrame();
  }, [renderCurrentFrame]);

  useEffect(() => {
    let playbackInterval: number;
    if (isPlaying && isBRAWFile && metadata && 'frameCount' in metadata) {
      const fps = metadata.fps > 0 ? metadata.fps : 24;
      playbackInterval = window.setInterval(() => {
        setCurrentBRAWFrame(prev => {
          const nextFrame = prev + 1;
          if (nextFrame >= metadata.frameCount) {
            setIsPlaying(false);
            return prev;
          }
          extractFrame(nextFrame, 'medium');
          return nextFrame;
        });
      }, 1000 / fps);
    }
    return () => clearInterval(playbackInterval);
  }, [isPlaying, isBRAWFile, metadata, extractFrame]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsPlaying(false);
    setHasImage(false);
    setIsVideo(false);
    setIsBRAWFile(false);
    setMetadata(null);
    cleanup();

    if (file.name.toLowerCase().endsWith('.braw')) {
      setIsBRAWFile(true);
      toast.info('Uploading BRAW file...');
      const uploaded = await uploadFile(file);
      if (uploaded) {
        toast.success('BRAW file ready!');
        setMetadata(uploaded.metadata);
        setDuration(uploaded.metadata.duration);
        setCurrentBRAWFrame(0);
        extractFrame(0, 'medium');
        setHasImage(true);
        setIsVideo(true);
      } else {
        toast.error(`BRAW Upload Failed: ${uploadError}`);
      }
    } else {
      // Handle other file types
    }
  };

  const handlePlayPause = () => {
    if (isBRAWFile || videoRef.current) {
      setIsPlaying(!isPlaying);
    }
  };

  const handleSeek = (value: number[]) => {
    const percentage = value[0] / 100;
    if (isBRAWFile && metadata && 'frameCount' in metadata) {
      const frame = Math.floor(percentage * metadata.frameCount);
      setCurrentBRAWFrame(frame);
      extractFrame(frame, 'medium');
      setIsPlaying(false);
    } else if (videoRef.current) {
      videoRef.current.currentTime = percentage * duration;
      setIsPlaying(false);
    }
  };

  const stepFrame = (direction: 'forward' | 'backward') => {
    if (isBRAWFile && metadata && 'frameCount' in metadata) {
      const newFrame = currentBRAWFrame + (direction === 'forward' ? 1 : -1);
      if (newFrame >= 0 && newFrame < metadata.frameCount) {
        setCurrentBRAWFrame(newFrame);
        extractFrame(newFrame, 'medium');
        setIsPlaying(false);
      }
    }
  };

  return (
    <div className="flex h-screen bg-black text-white">
      <main className="flex-1 flex flex-col">
        <header className="flex items-center justify-between p-2 border-b border-gray-800">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={() => fileInputRef.current?.click()}><Upload className="w-5 h-5" /></Button>
            <input type="file" ref={fileInputRef} onChange={handleFileUpload} style={{ display: 'none' }} />
            <Button variant="ghost" size="icon"><Download className="w-5 h-5" /></Button>
            <Button variant="ghost" size="icon"><Settings className="w-5 h-5" /></Button>
          </div>
          <div className="flex-1 flex justify-center">
            <span className="text-sm font-semibold">Color Grading Studio</span>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon"><Maximize className="w-5 h-5" /></Button>
          </div>
        </header>
        <div className="flex-1 flex items-center justify-center p-4 bg-gray-900/50">
          <canvas ref={viewerRef} className="max-w-full max-h-full" width="1920" height="1080" />
        </div>
        <footer className="p-4 border-t border-gray-800">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={handlePlayPause}>{isPlaying ? <Pause /> : <Play />}</Button>
            <Button variant="ghost" size="icon" onClick={() => stepFrame('backward')}><SkipBack /></Button>
            <Button variant="ghost" size="icon" onClick={() => stepFrame('forward')}><SkipForward /></Button>
            <Slider 
              value={[isBRAWFile ? (currentBRAWFrame / (metadata && 'frameCount' in metadata && metadata.frameCount > 0 ? metadata.frameCount : 1)) * 100 : (currentTime / duration) * 100]}
              onValueChange={handleSeek} 
              className="w-full" 
            />
            <div className="text-sm min-w-[100px] text-center">{(isBRAWFile ? `${currentBRAWFrame} / ${metadata && 'frameCount' in metadata ? metadata.frameCount : 0}` : `${currentTime.toFixed(1)}s / ${duration.toFixed(1)}s`)}</div>
          </div>
        </footer>
      </main>
      <aside className="w-80 bg-gray-900 border-l border-gray-800 flex flex-col">
        <Tabs defaultValue="primary" className="flex-1 flex flex-col">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="primary"><Palette /></TabsTrigger>
            <TabsTrigger value="curves"><Grid3x3 /></TabsTrigger>
            <TabsTrigger value="secondary"><Layers /></TabsTrigger>
            <TabsTrigger value="effects"><Film /></TabsTrigger>
          </TabsList>
          <TabsContent value="primary" className="flex-1 p-4 overflow-y-auto">
            <div className="space-y-6">
              <div>
                <h3 className="text-sm font-medium mb-2">Adjustments</h3>
                <div className="space-y-4">
                  <div className="grid gap-2">
                    <label className="text-xs">Contrast</label>
                    <Slider value={[contrast]} onValueChange={v => setContrast(v[0])} min={-100} max={100} />
                  </div>
                  <div className="grid gap-2">
                    <label className="text-xs">Saturation</label>
                    <Slider value={[saturation]} onValueChange={v => setSaturation(v[0])} min={-100} max={100} />
                  </div>
                  <div className="grid gap-2">
                    <label className="text-xs">Exposure</label>
                    <Slider value={[exposure]} onValueChange={v => setExposure(v[0])} min={-100} max={100} />
                  </div>
                </div>
              </div>
              <div>
                <h3 className="text-sm font-medium mb-2">Color Wheels</h3>
                <p className="text-xs text-gray-500">Color wheels coming soon...</p>
              </div>
            </div>
          </TabsContent>
        </Tabs>
        {metadata && <MetadataPanel metadata={metadata} overrides={rawOverrides} onOverrideChange={setRawOverrides} />}  
      </aside>
    </div>
  );
}

