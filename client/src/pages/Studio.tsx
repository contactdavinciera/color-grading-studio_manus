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

/**
 * Color Grading Studio - Main Application
 * Professional color grading interface inspired by DaVinci Resolve
 */
export default function Studio() {
  const viewerRef = useRef<HTMLCanvasElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [selectedTab, setSelectedTab] = useState('primary');
  
  useEffect(() => {
    // Initialize WebGL engine
    if (viewerRef.current) {
      // TODO: Initialize engine
    }
    
    // Auto-enter fullscreen on load
    const enterFullscreen = async () => {
      try {
        await document.documentElement.requestFullscreen();
        setIsFullscreen(true);
      } catch (err) {
        console.log('Fullscreen not available');
      }
    };
    
    // Delay to allow user interaction
    const timer = setTimeout(() => {
      enterFullscreen();
    }, 1000);
    
    return () => clearTimeout(timer);
  }, []);
  
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    // TODO: Load file into engine
    console.log('Loading file:', file.name);
  };
  
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
              style={{ imageRendering: 'pixelated' }}
            />
            
            {/* Viewer Overlay Controls */}
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-black/80 px-4 py-2 rounded-lg">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsPlaying(!isPlaying)}
              >
                {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
              </Button>
              
              <div className="w-64">
                <Slider defaultValue={[0]} max={100} step={1} />
              </div>
              
              <span className="text-xs text-gray-400">00:00:00:00</span>
            </div>
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
                <PrimaryControls />
              </TabsContent>
              
              <TabsContent value="curves" className="mt-0">
                <CurvesControls />
              </TabsContent>
              
              <TabsContent value="secondary" className="mt-0">
                <SecondaryControls />
              </TabsContent>
              
              <TabsContent value="effects" className="mt-0">
                <EffectsControls />
              </TabsContent>
            </div>
          </Tabs>
        </div>
      </div>
      
      {/* Bottom Panel - Node Graph */}
      <div className="h-48 bg-[#0f0f0f] border-t border-[#2a2a2a]">
        <NodeGraph />
      </div>
    </div>
  );
}

/**
 * Scope Panel Component
 */
function ScopePanel({ title }: { title: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  return (
    <div className="flex-1 border-r border-[#2a2a2a] last:border-r-0">
      <div className="h-full flex flex-col">
        <div className="h-8 bg-[#1a1a1a] border-b border-[#2a2a2a] flex items-center px-3">
          <span className="text-xs font-medium text-gray-400">{title}</span>
        </div>
        <div className="flex-1 relative">
          <canvas
            ref={canvasRef}
            className="absolute inset-0 w-full h-full"
          />
        </div>
      </div>
    </div>
  );
}

/**
 * Primary Controls Component
 */
function PrimaryControls() {
  return (
    <div className="space-y-6">
      <Card className="p-4 bg-[#0f0f0f] border-[#2a2a2a]">
        <h3 className="text-sm font-semibold mb-4">Color Wheels</h3>
        <div className="grid grid-cols-2 gap-4">
          <ColorWheel label="Lift" />
          <ColorWheel label="Gamma" />
          <ColorWheel label="Gain" />
          <ColorWheel label="Offset" />
        </div>
      </Card>
      
      <Card className="p-4 bg-[#0f0f0f] border-[#2a2a2a]">
        <h3 className="text-sm font-semibold mb-4">Adjustments</h3>
        <div className="space-y-3">
          <SliderControl label="Contrast" />
          <SliderControl label="Saturation" />
          <SliderControl label="Hue" />
          <SliderControl label="Temperature" />
          <SliderControl label="Tint" />
          <SliderControl label="Exposure" />
          <SliderControl label="Highlights" />
          <SliderControl label="Shadows" />
        </div>
      </Card>
    </div>
  );
}

/**
 * Color Wheel Component
 */
function ColorWheel({ label }: { label: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  useEffect(() => {
    if (!canvasRef.current) return;
    
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    // Draw color wheel
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    const radius = Math.min(centerX, centerY) - 5;
    
    // Gradient
    for (let angle = 0; angle < 360; angle += 1) {
      const startAngle = (angle - 90) * Math.PI / 180;
      const endAngle = (angle - 89) * Math.PI / 180;
      
      ctx.beginPath();
      ctx.moveTo(centerX, centerY);
      ctx.arc(centerX, centerY, radius, startAngle, endAngle);
      ctx.closePath();
      
      ctx.fillStyle = `hsl(${angle}, 100%, 50%)`;
      ctx.fill();
    }
    
    // Center circle
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius * 0.3, 0, Math.PI * 2);
    ctx.fillStyle = '#1a1a1a';
    ctx.fill();
    
    // Indicator
    ctx.beginPath();
    ctx.arc(centerX, centerY, 5, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
  }, []);
  
  return (
    <div className="flex flex-col items-center">
      <canvas
        ref={canvasRef}
        width={120}
        height={120}
        className="cursor-pointer"
      />
      <span className="text-xs text-gray-400 mt-2">{label}</span>
      <Slider defaultValue={[0]} min={-100} max={100} className="w-full mt-2" />
    </div>
  );
}

/**
 * Slider Control Component
 */
function SliderControl({ label }: { label: string }) {
  return (
    <div>
      <div className="flex justify-between mb-1">
        <label className="text-xs text-gray-400">{label}</label>
        <span className="text-xs text-gray-500">0</span>
      </div>
      <Slider defaultValue={[0]} min={-100} max={100} />
    </div>
  );
}

/**
 * Curves Controls Component
 */
function CurvesControls() {
  return (
    <div className="space-y-4">
      <Card className="p-4 bg-[#0f0f0f] border-[#2a2a2a]">
        <h3 className="text-sm font-semibold mb-4">RGB Curves</h3>
        <div className="h-64 bg-black rounded border border-[#2a2a2a]">
          {/* Curve editor will go here */}
        </div>
      </Card>
    </div>
  );
}

/**
 * Secondary Controls Component
 */
function SecondaryControls() {
  return (
    <div className="space-y-4">
      <Card className="p-4 bg-[#0f0f0f] border-[#2a2a2a]">
        <h3 className="text-sm font-semibold mb-4">Qualifier</h3>
        <div className="space-y-3">
          <SliderControl label="Hue Range" />
          <SliderControl label="Saturation Range" />
          <SliderControl label="Luminance Range" />
        </div>
      </Card>
      
      <Card className="p-4 bg-[#0f0f0f] border-[#2a2a2a]">
        <h3 className="text-sm font-semibold mb-4">Power Window</h3>
        <div className="space-y-3">
          <Button variant="outline" size="sm" className="w-full">
            Add Circle
          </Button>
          <Button variant="outline" size="sm" className="w-full">
            Add Rectangle
          </Button>
        </div>
      </Card>
    </div>
  );
}

/**
 * Effects Controls Component
 */
function EffectsControls() {
  return (
    <div className="space-y-4">
      <Card className="p-4 bg-[#0f0f0f] border-[#2a2a2a]">
        <h3 className="text-sm font-semibold mb-4">Film Stock</h3>
        <select className="w-full bg-[#1a1a1a] border border-[#2a2a2a] rounded px-3 py-2 text-sm">
          <option>None</option>
          <option>Kodak Vision3 5219</option>
          <option>Fujifilm Eterna</option>
          <option>Kodak Portra</option>
        </select>
      </Card>
      
      <Card className="p-4 bg-[#0f0f0f] border-[#2a2a2a]">
        <h3 className="text-sm font-semibold mb-4">Film Grain</h3>
        <div className="space-y-3">
          <SliderControl label="Intensity" />
          <SliderControl label="Size" />
          <SliderControl label="Color Amount" />
        </div>
      </Card>
      
      <Card className="p-4 bg-[#0f0f0f] border-[#2a2a2a]">
        <h3 className="text-sm font-semibold mb-4">Glow</h3>
        <div className="space-y-3">
          <SliderControl label="Intensity" />
          <SliderControl label="Threshold" />
          <SliderControl label="Radius" />
        </div>
      </Card>
    </div>
  );
}

/**
 * Node Graph Component
 */
function NodeGraph() {
  return (
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
        {/* Node graph canvas will go here */}
        <div className="absolute inset-0 flex items-center justify-center text-gray-600 text-sm">
          Node graph editor
        </div>
      </div>
    </div>
  );
}

