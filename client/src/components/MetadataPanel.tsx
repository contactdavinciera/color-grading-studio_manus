import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

interface MetadataInfo {
  // Camera
  make?: string;
  model?: string;
  serialNumber?: string;
  
  // Exposure
  iso?: number;
  shutterSpeed?: string;
  aperture?: string;
  fps?: number;
  
  // Color
  whiteBalance?: number;
  colorSpace?: string;
  gamma?: string;
  lut?: string;
  
  // Lens
  lensModel?: string;
  focalLength?: number;
  tStop?: string;
  
  // Resolution
  width?: number;
  height?: number;
  bitDepth?: number;
  
  // Timecode
  timecode?: string;
  reelName?: string;
  clipName?: string;
  
  // Project
  scene?: string;
  take?: string;
  cameraRoll?: string;
}

interface MetadataOverrides {
  whiteBalance?: number;
  iso?: number;
  colorSpace?: string;
  debayerQuality?: 'draft' | 'good' | 'best';
  highlightRecovery?: number;
  shadowDetail?: number;
}

interface MetadataPanelProps {
  metadata: MetadataInfo | null;
  overrides: MetadataOverrides;
  onOverrideChange: (overrides: MetadataOverrides) => void;
}

export default function MetadataPanel({ metadata, overrides, onOverrideChange }: MetadataPanelProps) {
  if (!metadata) {
    return (
      <div className="h-full flex items-center justify-center text-muted-foreground">
        <p>No metadata available. Import a file to view metadata.</p>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto p-4 space-y-6">
      {/* Camera Information */}
      <Card className="p-4">
        <h3 className="font-semibold mb-3 flex items-center gap-2">
          <span className="text-blue-500">📷</span> Camera Information
        </h3>
        <div className="grid grid-cols-2 gap-3 text-sm">
          {metadata.make && (
            <div>
              <Label className="text-muted-foreground">Make</Label>
              <p className="font-medium">{metadata.make}</p>
            </div>
          )}
          {metadata.model && (
            <div>
              <Label className="text-muted-foreground">Model</Label>
              <p className="font-medium">{metadata.model}</p>
            </div>
          )}
          {metadata.serialNumber && (
            <div>
              <Label className="text-muted-foreground">Serial Number</Label>
              <p className="font-mono text-xs">{metadata.serialNumber}</p>
            </div>
          )}
        </div>
      </Card>

      {/* Exposure Settings */}
      <Card className="p-4">
        <h3 className="font-semibold mb-3 flex items-center gap-2">
          <span className="text-yellow-500">☀️</span> Exposure
        </h3>
        <div className="grid grid-cols-2 gap-3 text-sm">
          {metadata.iso && (
            <div>
              <Label className="text-muted-foreground">ISO</Label>
              <p className="font-medium">{metadata.iso}</p>
            </div>
          )}
          {metadata.shutterSpeed && (
            <div>
              <Label className="text-muted-foreground">Shutter Speed</Label>
              <p className="font-medium">{metadata.shutterSpeed}</p>
            </div>
          )}
          {metadata.aperture && (
            <div>
              <Label className="text-muted-foreground">Aperture</Label>
              <p className="font-medium">f/{metadata.aperture}</p>
            </div>
          )}
          {metadata.fps && (
            <div>
              <Label className="text-muted-foreground">Frame Rate</Label>
              <p className="font-medium">{metadata.fps} fps</p>
            </div>
          )}
        </div>
      </Card>

      {/* Color Information */}
      <Card className="p-4">
        <h3 className="font-semibold mb-3 flex items-center gap-2">
          <span className="text-purple-500">🎨</span> Color Settings
        </h3>
        <div className="space-y-3">
          {metadata.whiteBalance && (
            <div>
              <Label className="text-muted-foreground">White Balance</Label>
              <p className="font-medium">{metadata.whiteBalance}K</p>
            </div>
          )}
          {metadata.colorSpace && (
            <div>
              <Label className="text-muted-foreground">Color Space</Label>
              <Badge variant="outline">{metadata.colorSpace}</Badge>
            </div>
          )}
          {metadata.gamma && (
            <div>
              <Label className="text-muted-foreground">Gamma</Label>
              <Badge variant="outline">{metadata.gamma}</Badge>
            </div>
          )}
          {metadata.lut && (
            <div>
              <Label className="text-muted-foreground">Applied LUT</Label>
              <p className="font-medium text-xs">{metadata.lut}</p>
            </div>
          )}
        </div>
      </Card>

      {/* Resolution */}
      <Card className="p-4">
        <h3 className="font-semibold mb-3 flex items-center gap-2">
          <span className="text-green-500">📐</span> Resolution
        </h3>
        <div className="grid grid-cols-2 gap-3 text-sm">
          {metadata.width && metadata.height && (
            <div>
              <Label className="text-muted-foreground">Dimensions</Label>
              <p className="font-medium">{metadata.width} × {metadata.height}</p>
            </div>
          )}
          {metadata.bitDepth && (
            <div>
              <Label className="text-muted-foreground">Bit Depth</Label>
              <p className="font-medium">{metadata.bitDepth}-bit</p>
            </div>
          )}
        </div>
      </Card>

      {/* Lens Information */}
      {metadata.lensModel && (
        <Card className="p-4">
          <h3 className="font-semibold mb-3 flex items-center gap-2">
            <span className="text-cyan-500">🔍</span> Lens
          </h3>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <Label className="text-muted-foreground">Model</Label>
              <p className="font-medium text-xs">{metadata.lensModel}</p>
            </div>
            {metadata.focalLength && (
              <div>
                <Label className="text-muted-foreground">Focal Length</Label>
                <p className="font-medium">{metadata.focalLength}mm</p>
              </div>
            )}
            {metadata.tStop && (
              <div>
                <Label className="text-muted-foreground">T-Stop</Label>
                <p className="font-medium">T{metadata.tStop}</p>
              </div>
            )}
          </div>
        </Card>
      )}

      <Separator />

      {/* RAW Overrides */}
      <Card className="p-4 bg-slate-900/50 border-blue-500/30">
        <h3 className="font-semibold mb-4 flex items-center gap-2">
          <span className="text-blue-400">⚙️</span> RAW Processing Overrides
        </h3>
        
        <div className="space-y-4">
          {/* White Balance Override */}
          <div>
            <div className="flex justify-between mb-2">
              <Label>White Balance Override</Label>
              <span className="text-xs text-muted-foreground">
                {overrides.whiteBalance || metadata.whiteBalance || 5500}K
              </span>
            </div>
            <Slider
              value={[overrides.whiteBalance || metadata.whiteBalance || 5500]}
              onValueChange={(v) => onOverrideChange({ ...overrides, whiteBalance: v[0] })}
              min={2000}
              max={10000}
              step={100}
              className="w-full"
            />
          </div>

          {/* ISO Override */}
          <div>
            <div className="flex justify-between mb-2">
              <Label>ISO Override</Label>
              <span className="text-xs text-muted-foreground">
                {overrides.iso || metadata.iso || 800}
              </span>
            </div>
            <Slider
              value={[overrides.iso || metadata.iso || 800]}
              onValueChange={(v) => onOverrideChange({ ...overrides, iso: v[0] })}
              min={100}
              max={12800}
              step={100}
              className="w-full"
            />
          </div>

          {/* Color Space */}
          <div>
            <Label className="mb-2 block">Color Space Interpretation</Label>
            <Select
              value={overrides.colorSpace || metadata.colorSpace || 'sRGB'}
              onValueChange={(v) => onOverrideChange({ ...overrides, colorSpace: v })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="sRGB">sRGB</SelectItem>
                <SelectItem value="Rec.709">Rec. 709</SelectItem>
                <SelectItem value="Rec.2020">Rec. 2020</SelectItem>
                <SelectItem value="DCI-P3">DCI-P3</SelectItem>
                <SelectItem value="ACES">ACES</SelectItem>
                <SelectItem value="Log">Log (Generic)</SelectItem>
                <SelectItem value="LogC">ARRI LogC</SelectItem>
                <SelectItem value="RedLog">RED Log</SelectItem>
                <SelectItem value="BMDFilm">Blackmagic Film</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Debayer Quality */}
          <div>
            <Label className="mb-2 block">Debayer Quality</Label>
            <Select
              value={overrides.debayerQuality || 'good'}
              onValueChange={(v) => onOverrideChange({ ...overrides, debayerQuality: v as any })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="draft">Draft (Fast)</SelectItem>
                <SelectItem value="good">Good (Balanced)</SelectItem>
                <SelectItem value="best">Best (Slow)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Highlight Recovery */}
          <div>
            <div className="flex justify-between mb-2">
              <Label>Highlight Recovery</Label>
              <span className="text-xs text-muted-foreground">
                {overrides.highlightRecovery || 0}
              </span>
            </div>
            <Slider
              value={[overrides.highlightRecovery || 0]}
              onValueChange={(v) => onOverrideChange({ ...overrides, highlightRecovery: v[0] })}
              min={0}
              max={100}
              step={1}
              className="w-full"
            />
          </div>

          {/* Shadow Detail */}
          <div>
            <div className="flex justify-between mb-2">
              <Label>Shadow Detail</Label>
              <span className="text-xs text-muted-foreground">
                {overrides.shadowDetail || 0}
              </span>
            </div>
            <Slider
              value={[overrides.shadowDetail || 0]}
              onValueChange={(v) => onOverrideChange({ ...overrides, shadowDetail: v[0] })}
              min={0}
              max={100}
              step={1}
              className="w-full"
            />
          </div>
        </div>
      </Card>
    </div>
  );
}

