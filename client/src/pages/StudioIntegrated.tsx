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
import { useColorGradingEngine } from '@/hooks/useColorGradingEngine';
import { SettingsDialog } from '@/components/SettingsDialog';
import { LUTManager } from '@/components/LUTManager';
import { NodeGraphEditor } from '@/components/NodeGraphEditor';
import { NodeType } from '@/lib/nodes/NodeSystem';
import { FILM_STOCKS } from '@/lib/webgl/cinematicShaders';

export default function StudioIntegrated() {
  const viewerRef = useRef<HTMLCanvasElement>(null);
  const waveformRef = useRef<HTMLCanvasElement>(null);
  const vectorscopeRef = useRef<HTMLCanvasElement>(null);
  const paradeRef = useRef<HTMLCanvasElement>(null);
  const histogramRef = useRef<HTMLCanvasElement>(null);
  
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [selectedTab, setSelectedTab] = useState('primary');
  const [showSettings, setShowSettings] = useState(false);
  const [selectedFilmStock, setSelectedFilmStock] = useState<number>(-1);
  
  // Primary controls state
  const [primaryParams, setPrimaryParams] = useState({
    contrast: 0,
    saturation: 0,
    hue: 0,
    temperature: 0,
    tint: 0,
    exposure: 0,
    highlights: 0,
    shadows: 0,
  });
  
  // Film grain state
  const [filmGrainParams, setFilmGrainParams] = useState({
    intensity: 0,
    size: 1,
    colorAmount: 0,
  });
  
  // Glow state
  const [glowParams, setGlowParams] = useState({
    intensity: 0,
    threshold: 0.7,
    radius: 1,
  });
  
  const engine = useColorGradingEngine(viewerRef, {
    waveform: waveformRef,
    vectorscope: vectorscopeRef,
    parade: paradeRef,
    histogram: histogramRef,
  });
  
  useEffect(() => {
    // Auto-enter fullscreen on load
    const enterFullscreen = async () => {
      try {
        await document.documentElement.requestFullscreen();
        setIsFullscreen(true);
      } catch (err) {
        console.log('Fullscreen not available');
      }
    };
    
    const timer = setTimeout(() => {
      enterFullscreen();
    }, 1000);
    
    return () => clearTimeout(timer);
  }, []);
  
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    await engine.loadFile(file);
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
  
  const handlePrimaryParamChange = (param: string, value: number) => {
    setPrimaryParams(prev => ({ ...prev, [param]: value }));
    
    if (engine.state.selectedNode) {
      engine.updateNodeParams(engine.state.selectedNode.id, {
        [param]: value,
      });
    }
  };
  
  const handleFilmStockChange = (stockId: number) => {
    setSelectedFilmStock(stockId);
    
    if (engine.state.selectedNode) {
      engine.updateNodeParams(engine.state.selectedNode.id, {
        stockType: stockId,
        intensity: 1,
      });
    }
  };
  
  const handleFilmGrainChange = (param: string, value: number) => {
    setFilmGrainParams(prev => ({ ...prev, [param]: value }));
    
    if (engine.state.selectedNode) {
      engine.updateNodeParams(engine.state.selectedNode.id, {
        ...filmGrainParams,
        [param]: value,
      });
    }
  };
  
  const handleGlowChange = (param: string, value: number) => {
    setGlowParams(prev => ({ ...prev, [param]: value }));
    
    if (engine.state.selectedNode) {
      engine.updateNodeParams(engine.state.selectedNode.id, {
        ...glowParams,
        [param]: value,
      });
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
        
        {engine.state.isProcessing && (
          <span className="text-xs text-yellow-500">Processing...</span>
        )}
        
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
          
          <Button variant="outline" size="sm" onClick={() => setShowSettings(true)}>
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
            
            {!engine.state.isInitialized && (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="text-center text-gray-500">
                  <Upload className="w-16 h-16 mx-auto mb-4 opacity-50" />
                  <p>Click Import to load an image or video</p>
                </div>
              </div>
            )}
            
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
                <Slider 
                  defaultValue={[0]} 
                  max={engine.state.totalFrames || 100} 
                  step={1}
                  value={[engine.state.currentFrame]}
                />
              </div>
              
              <span className="text-xs text-gray-400">
                {engine.state.currentFrame} / {engine.state.totalFrames}
              </span>
            </div>
          </div>
          
          {/* Scopes */}
          <div className="h-48 bg-[#0f0f0f] border-t border-[#2a2a2a] flex">
            <ScopePanel title="Waveform" canvasRef={waveformRef} />
            <ScopePanel title="Vectorscope" canvasRef={vectorscopeRef} />
            <ScopePanel title="Parade" canvasRef={paradeRef} />
            <ScopePanel title="Histogram" canvasRef={histogramRef} />
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
                <PrimaryControls 
                  params={primaryParams}
                  onChange={handlePrimaryParamChange}
                />
              </TabsContent>
              
              <TabsContent value="curves" className="mt-0">
                <CurvesControls />
              </TabsContent>
              
              <TabsContent value="secondary" className="mt-0">
                <SecondaryControls />
              </TabsContent>
              
              <TabsContent value="effects" className="mt-0">
                <EffectsControls 
                  selectedFilmStock={selectedFilmStock}
                  onFilmStockChange={handleFilmStockChange}
                  filmGrainParams={filmGrainParams}
                  onFilmGrainChange={handleFilmGrainChange}
                  glowParams={glowParams}
                  onGlowChange={handleGlowChange}
                />
              </TabsContent>
            </div>
          </Tabs>
        </div>
      </div>
      
      {/* Bottom Panel - Node Graph */}
      <div className="h-48 bg-[#0f0f0f] border-t border-[#2a2a2a]">
        <NodeGraphEditor
          nodes={[]}
          connections={[]}
          selectedNodeId={engine.state.selectedNode?.id || null}
          onAddNode={engine.addNode}
          onSelectNode={engine.selectNode}
          onConnectNodes={engine.connectNodes}
          onDeleteNode={engine.deleteNode}
        />
      </div>
      
      {/* Settings Dialog */}
      <SettingsDialog
        open={showSettings}
        onOpenChange={setShowSettings}
        currentMode={engine.state.renderMode}
        onModeChange={engine.setRenderMode}
        onRequestCacheDirectory={engine.requestCacheDirectory}
      />
    </div>
  );
}

function ScopePanel({ title, canvasRef }: { title: string; canvasRef: React.RefObject<HTMLCanvasElement | null> }) {
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

function PrimaryControls({ params, onChange }: { 
  params: any; 
  onChange: (param: string, value: number) => void;
}) {
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
          <SliderControl 
            label="Contrast" 
            value={params.contrast}
            onChange={(v) => onChange('contrast', v)}
          />
          <SliderControl 
            label="Saturation" 
            value={params.saturation}
            onChange={(v) => onChange('saturation', v)}
          />
          <SliderControl 
            label="Hue" 
            value={params.hue}
            onChange={(v) => onChange('hue', v)}
          />
          <SliderControl 
            label="Temperature" 
            value={params.temperature}
            onChange={(v) => onChange('temperature', v)}
          />
          <SliderControl 
            label="Tint" 
            value={params.tint}
            onChange={(v) => onChange('tint', v)}
          />
          <SliderControl 
            label="Exposure" 
            value={params.exposure}
            onChange={(v) => onChange('exposure', v)}
          />
          <SliderControl 
            label="Highlights" 
            value={params.highlights}
            onChange={(v) => onChange('highlights', v)}
          />
          <SliderControl 
            label="Shadows" 
            value={params.shadows}
            onChange={(v) => onChange('shadows', v)}
          />
        </div>
      </Card>
    </div>
  );
}

function ColorWheel({ label }: { label: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  useEffect(() => {
    if (!canvasRef.current) return;
    
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    const radius = Math.min(centerX, centerY) - 5;
    
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
    
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius * 0.3, 0, Math.PI * 2);
    ctx.fillStyle = '#1a1a1a';
    ctx.fill();
    
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

function SliderControl({ label, value, onChange }: { 
  label: string; 
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <div>
      <div className="flex justify-between mb-1">
        <label className="text-xs text-gray-400">{label}</label>
        <span className="text-xs text-gray-500">{value}</span>
      </div>
      <Slider 
        value={[value]} 
        min={-100} 
        max={100}
        onValueChange={(v) => onChange(v[0])}
      />
    </div>
  );
}

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

function SecondaryControls() {
  return (
    <div className="space-y-4">
      <Card className="p-4 bg-[#0f0f0f] border-[#2a2a2a]">
        <h3 className="text-sm font-semibold mb-4">Qualifier</h3>
        <div className="space-y-3">
          <SliderControl label="Hue Range" value={0} onChange={() => {}} />
          <SliderControl label="Saturation Range" value={0} onChange={() => {}} />
          <SliderControl label="Luminance Range" value={0} onChange={() => {}} />
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

function EffectsControls({ 
  selectedFilmStock,
  onFilmStockChange,
  filmGrainParams,
  onFilmGrainChange,
  glowParams,
  onGlowChange,
}: any) {
  return (
    <div className="space-y-4">
      <Card className="p-4 bg-[#0f0f0f] border-[#2a2a2a]">
        <h3 className="text-sm font-semibold mb-4">Film Stock</h3>
        <select 
          className="w-full bg-[#1a1a1a] border border-[#2a2a2a] rounded px-3 py-2 text-sm"
          value={selectedFilmStock}
          onChange={(e) => onFilmStockChange(Number(e.target.value))}
        >
          <option value={-1}>None</option>
          {Object.values(FILM_STOCKS).map(stock => (
            <option key={stock.id} value={stock.id}>
              {stock.name}
            </option>
          ))}
        </select>
      </Card>
      
      <Card className="p-4 bg-[#0f0f0f] border-[#2a2a2a]">
        <h3 className="text-sm font-semibold mb-4">Film Grain</h3>
        <div className="space-y-3">
          <SliderControl 
            label="Intensity" 
            value={filmGrainParams.intensity}
            onChange={(v) => onFilmGrainChange('intensity', v)}
          />
          <SliderControl 
            label="Size" 
            value={filmGrainParams.size}
            onChange={(v) => onFilmGrainChange('size', v)}
          />
          <SliderControl 
            label="Color Amount" 
            value={filmGrainParams.colorAmount}
            onChange={(v) => onFilmGrainChange('colorAmount', v)}
          />
        </div>
      </Card>
      
      <Card className="p-4 bg-[#0f0f0f] border-[#2a2a2a]">
        <h3 className="text-sm font-semibold mb-4">Glow</h3>
        <div className="space-y-3">
          <SliderControl 
            label="Intensity" 
            value={glowParams.intensity}
            onChange={(v) => onGlowChange('intensity', v)}
          />
          <SliderControl 
            label="Threshold" 
            value={glowParams.threshold}
            onChange={(v) => onGlowChange('threshold', v)}
          />
          <SliderControl 
            label="Radius" 
            value={glowParams.radius}
            onChange={(v) => onGlowChange('radius', v)}
          />
        </div>
      </Card>
      
      <Card className="p-4 bg-[#0f0f0f] border-[#2a2a2a]">
        <h3 className="text-sm font-semibold mb-4">LUTs</h3>
        <LUTManager onApplyLUT={() => {}} />
      </Card>
    </div>
  );
}

