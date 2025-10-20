import { useEffect, useRef, useState } from 'react';
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
  Eye
} from 'lucide-react';
import { WebGLEngine } from '@/lib/webgl/WebGLEngine';

/**
 * Color Grading Studio - Working Version with Engine Integration
 */
export default function StudioWorking() {
  const viewerRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<WebGLEngine | null>(null);
  const sourceImageRef = useRef<HTMLImageElement | null>(null);
  
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [selectedTab, setSelectedTab] = useState('primary');
  const [hasImage, setHasImage] = useState(false);
  
  // Primary controls state
  const [contrast, setContrast] = useState(0);
  const [saturation, setSaturation] = useState(0);
  const [exposure, setExposure] = useState(0);
  
  // Initialize WebGL engine
  useEffect(() => {
    if (!viewerRef.current) return;
    
    try {
      engineRef.current = new WebGLEngine({ canvas: viewerRef.current });
      console.log('WebGL Engine initialized');
    } catch (error) {
      console.error('Failed to initialize WebGL:', error);
    }
    
    return () => {
      if (engineRef.current) {
        engineRef.current.dispose();
      }
    };
  }, []);
  
  // Auto-enter fullscreen
  useEffect(() => {
    const timer = setTimeout(async () => {
      try {
        await document.documentElement.requestFullscreen();
        setIsFullscreen(true);
      } catch (err) {
        console.log('Fullscreen not available');
      }
    }, 1000);
    
    return () => clearTimeout(timer);
  }, []);
  
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !engineRef.current || !viewerRef.current) return;
    
    try {
      const url = URL.createObjectURL(file);
      const img = new Image();
      
      img.onload = () => {
        sourceImageRef.current = img;
        setHasImage(true);
        
        // Resize canvas to match image
        if (viewerRef.current) {
          const maxWidth = viewerRef.current.parentElement?.clientWidth || 800;
          const maxHeight = viewerRef.current.parentElement?.clientHeight || 600;
          
          let width = img.width;
          let height = img.height;
          
          // Scale to fit
          if (width > maxWidth) {
            height = (height * maxWidth) / width;
            width = maxWidth;
          }
          if (height > maxHeight) {
            width = (width * maxHeight) / height;
            height = maxHeight;
          }
          
          viewerRef.current.width = width;
          viewerRef.current.height = height;
        }
        
        // Render initial image
        renderImage();
        
        URL.revokeObjectURL(url);
      };
      
      img.src = url;
    } catch (error) {
      console.error('Failed to load image:', error);
    }
  };
  
  const renderImage = () => {
    if (!engineRef.current || !sourceImageRef.current || !viewerRef.current) return;
    
    const gl = engineRef.current.getContext();
    const canvas = viewerRef.current;
    
    // Create texture from source image
    const texture = engineRef.current.createTexture(sourceImageRef.current);
    
    // Simple passthrough for now (will add effects later)
    gl.viewport(0, 0, canvas.width, canvas.height);
    
    // Clear
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    
    // Draw texture to canvas
    // For now, just draw the image directly
    const ctx = canvas.getContext('2d', { willReadFrequently: false });
    if (ctx) {
      ctx.drawImage(sourceImageRef.current, 0, 0, canvas.width, canvas.height);
      
      // Apply simple adjustments
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imageData.data;
      
      // Apply contrast, saturation, exposure
      for (let i = 0; i < data.length; i += 4) {
        let r = data[i];
        let g = data[i + 1];
        let b = data[i + 2];
        
        // Exposure
        const exposureFactor = Math.pow(2, exposure / 100);
        r *= exposureFactor;
        g *= exposureFactor;
        b *= exposureFactor;
        
        // Contrast
        const contrastFactor = (100 + contrast) / 100;
        r = ((r / 255 - 0.5) * contrastFactor + 0.5) * 255;
        g = ((g / 255 - 0.5) * contrastFactor + 0.5) * 255;
        b = ((b / 255 - 0.5) * contrastFactor + 0.5) * 255;
        
        // Saturation
        const gray = 0.2989 * r + 0.5870 * g + 0.1140 * b;
        const satFactor = (100 + saturation) / 100;
        r = gray + (r - gray) * satFactor;
        g = gray + (g - gray) * satFactor;
        b = gray + (b - gray) * satFactor;
        
        data[i] = Math.max(0, Math.min(255, r));
        data[i + 1] = Math.max(0, Math.min(255, g));
        data[i + 2] = Math.max(0, Math.min(255, b));
      }
      
      ctx.putImageData(imageData, 0, 0);
    }
  };
  
  // Re-render when parameters change
  useEffect(() => {
    if (hasImage) {
      renderImage();
    }
  }, [contrast, saturation, exposure, hasImage]);
  
  const toggleFullscreen = async () => {
    if (!isFullscreen) {
      await document.documentElement.requestFullscreen();
      setIsFullscreen(true);
    } else {
      await document.exitFullscreen();
      setIsFullscreen(false);
    }
  };
  
  return (
    <div className="h-screen w-screen bg-[#0a0a0a] text-white overflow-hidden flex flex-col">
      {/* Top Toolbar */}
      <div className="h-12 bg-[#1a1a1a] border-b border-[#2a2a2a] flex items-center px-4 gap-4">
        <div className="flex items-center gap-2">
          <Palette className="w-5 h-5 text-blue-500" />
          <span className="font-semibold">Color Grading Studio Pro</span>
        </div>
        
        <div className="flex-1" />
        
        <div className="flex items-center gap-2">
          <label htmlFor="file-upload">
            <Button variant="outline" size="sm" className="cursor-pointer" asChild>
              <span>
                <Upload className="w-4 h-4 mr-2" />
                Import
              </span>
            </Button>
          </label>
          <input
            id="file-upload"
            type="file"
            accept="image/*,video/*"
            className="hidden"
            onChange={handleFileUpload}
          />
          
          <Button variant="outline" size="sm">
            <Download className="w-4 h-4 mr-2" />
            Export
          </Button>
          
          <Button variant="outline" size="sm">
            <Settings className="w-4 h-4 mr-2" />
            Settings
          </Button>
          
          <Button variant="outline" size="sm" onClick={toggleFullscreen}>
            <Maximize className="w-4 h-4 mr-2" />
            {isFullscreen ? 'Exit' : 'Fullscreen'}
          </Button>
        </div>
      </div>
      
      {/* Main Content Area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Panel - Viewer & Scopes */}
        <div className="flex-1 flex flex-col">
          {/* Viewer */}
          <div className="flex-1 bg-black relative flex items-center justify-center">
            <canvas
              ref={viewerRef}
              className="max-w-full max-h-full"
            />
            
            {!hasImage && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="text-center text-gray-500">
                  <Upload className="w-16 h-16 mx-auto mb-4 opacity-50" />
                  <p>Click Import to load an image or video</p>
                  <p className="text-sm mt-2">Supports: JPG, PNG, MP4, MOV</p>
                </div>
              </div>
            )}
          </div>
          
          {/* Scopes */}
          <div className="h-48 bg-[#0f0f0f] border-t border-[#2a2a2a] flex">
            <ScopePanel title="Waveform" />
            <ScopePanel title="Vectorscope" />
            <ScopePanel title="Parade" />
            <ScopePanel title="Histogram" />
          </div>
        </div>
        
        {/* Right Panel - Controls */}
        <div className="w-96 bg-[#1a1a1a] border-l border-[#2a2a2a] flex flex-col">
          <Tabs value={selectedTab} onValueChange={setSelectedTab} className="flex-1 flex flex-col">
            <TabsList className="w-full justify-start bg-[#0f0f0f] rounded-none border-b border-[#2a2a2a]">
              <TabsTrigger value="primary" className="gap-2">
                <Palette className="w-4 h-4" />
                Primary
              </TabsTrigger>
              <TabsTrigger value="curves" className="gap-2">
                <Grid3x3 className="w-4 h-4" />
                Curves
              </TabsTrigger>
              <TabsTrigger value="secondary" className="gap-2">
                <Eye className="w-4 h-4" />
                Secondary
              </TabsTrigger>
              <TabsTrigger value="effects" className="gap-2">
                <Film className="w-4 h-4" />
                Effects
              </TabsTrigger>
            </TabsList>
            
            <div className="flex-1 overflow-y-auto p-4">
              <TabsContent value="primary" className="mt-0">
                <Card className="p-4 bg-[#0f0f0f] border-[#2a2a2a] mb-4">
                  <h3 className="text-sm font-semibold mb-4">Adjustments</h3>
                  <div className="space-y-4">
                    <div>
                      <div className="flex justify-between mb-2">
                        <label className="text-xs text-gray-400">Contrast</label>
                        <span className="text-xs text-gray-500">{contrast}</span>
                      </div>
                      <Slider 
                        value={[contrast]} 
                        min={-100} 
                        max={100}
                        onValueChange={(v) => setContrast(v[0])}
                      />
                    </div>
                    
                    <div>
                      <div className="flex justify-between mb-2">
                        <label className="text-xs text-gray-400">Saturation</label>
                        <span className="text-xs text-gray-500">{saturation}</span>
                      </div>
                      <Slider 
                        value={[saturation]} 
                        min={-100} 
                        max={100}
                        onValueChange={(v) => setSaturation(v[0])}
                      />
                    </div>
                    
                    <div>
                      <div className="flex justify-between mb-2">
                        <label className="text-xs text-gray-400">Exposure</label>
                        <span className="text-xs text-gray-500">{exposure}</span>
                      </div>
                      <Slider 
                        value={[exposure]} 
                        min={-100} 
                        max={100}
                        onValueChange={(v) => setExposure(v[0])}
                      />
                    </div>
                  </div>
                </Card>
                
                <Card className="p-4 bg-[#0f0f0f] border-[#2a2a2a]">
                  <h3 className="text-sm font-semibold mb-4">Color Wheels</h3>
                  <p className="text-xs text-gray-500">Color wheels coming soon...</p>
                </Card>
              </TabsContent>
              
              <TabsContent value="curves" className="mt-0">
                <Card className="p-4 bg-[#0f0f0f] border-[#2a2a2a]">
                  <h3 className="text-sm font-semibold mb-4">RGB Curves</h3>
                  <p className="text-xs text-gray-500">Curves editor coming soon...</p>
                </Card>
              </TabsContent>
              
              <TabsContent value="secondary" className="mt-0">
                <Card className="p-4 bg-[#0f0f0f] border-[#2a2a2a]">
                  <h3 className="text-sm font-semibold mb-4">Secondary Corrections</h3>
                  <p className="text-xs text-gray-500">Qualifiers and masks coming soon...</p>
                </Card>
              </TabsContent>
              
              <TabsContent value="effects" className="mt-0">
                <Card className="p-4 bg-[#0f0f0f] border-[#2a2a2a]">
                  <h3 className="text-sm font-semibold mb-4">Effects</h3>
                  <p className="text-xs text-gray-500">Film grain, glow, and LUTs coming soon...</p>
                </Card>
              </TabsContent>
            </div>
          </Tabs>
        </div>
      </div>
      
      {/* Bottom Panel - Node Graph */}
      <div className="h-48 bg-[#0f0f0f] border-t border-[#2a2a2a]">
        <div className="h-full flex flex-col">
          <div className="h-8 bg-[#1a1a1a] border-b border-[#2a2a2a] flex items-center px-3 gap-2">
            <Layers className="w-4 h-4 text-gray-400" />
            <span className="text-xs font-medium text-gray-400">Node Graph</span>
            <div className="flex-1" />
            <Button variant="ghost" size="sm" className="h-6 text-xs">
              Add Node
            </Button>
          </div>
          <div className="flex-1 bg-[#0a0a0a] relative">
            <div className="absolute inset-0 flex items-center justify-center text-gray-600 text-sm">
              Node graph editor
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ScopePanel({ title }: { title: string }) {
  return (
    <div className="flex-1 border-r border-[#2a2a2a] last:border-r-0">
      <div className="h-full flex flex-col">
        <div className="h-8 bg-[#1a1a1a] border-b border-[#2a2a2a] flex items-center px-3">
          <span className="text-xs font-medium text-gray-400">{title}</span>
        </div>
        <div className="flex-1 relative bg-black">
          <canvas className="absolute inset-0 w-full h-full" />
        </div>
      </div>
    </div>
  );
}

