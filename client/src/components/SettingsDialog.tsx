import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Card } from '@/components/ui/card';
import { RenderMode } from '@/lib/render/RenderEngine';
import { FolderOpen, Cloud, Zap, HardDrive } from 'lucide-react';

interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentMode: RenderMode;
  onModeChange: (mode: RenderMode) => void;
  onRequestCacheDirectory: () => Promise<boolean>;
}

export function SettingsDialog({
  open,
  onOpenChange,
  currentMode,
  onModeChange,
  onRequestCacheDirectory,
}: SettingsDialogProps) {
  const [selectedMode, setSelectedMode] = useState(currentMode);
  const [cacheDirectorySelected, setCacheDirectorySelected] = useState(false);
  
  const handleSelectCacheDirectory = async () => {
    const success = await onRequestCacheDirectory();
    setCacheDirectorySelected(success);
  };
  
  const handleSave = () => {
    onModeChange(selectedMode);
    onOpenChange(false);
  };
  
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl bg-[#1a1a1a] border-[#2a2a2a] text-white">
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription className="text-gray-400">
            Configure render mode and cache settings
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-6 py-4">
          <div>
            <Label className="text-base font-semibold mb-4 block">Render Mode</Label>
            <RadioGroup value={selectedMode} onValueChange={(value) => setSelectedMode(value as RenderMode)}>
              <Card className="p-4 bg-[#0f0f0f] border-[#2a2a2a] mb-3">
                <div className="flex items-start gap-3">
                  <RadioGroupItem value={RenderMode.REALTIME} id="realtime" />
                  <div className="flex-1">
                    <Label htmlFor="realtime" className="flex items-center gap-2 cursor-pointer">
                      <Zap className="w-5 h-5 text-yellow-500" />
                      <span className="font-semibold">Real-time Mode</span>
                    </Label>
                    <p className="text-sm text-gray-400 mt-1">
                      No cache, immediate WebGL rendering. Best for quick previews and low memory usage.
                    </p>
                    <div className="mt-2 text-xs text-gray-500">
                      ✓ Fastest preview<br />
                      ✓ No disk usage<br />
                      ✗ Re-renders on every change
                    </div>
                  </div>
                </div>
              </Card>
              
              <Card className="p-4 bg-[#0f0f0f] border-[#2a2a2a] mb-3">
                <div className="flex items-start gap-3">
                  <RadioGroupItem value={RenderMode.STANDALONE} id="standalone" />
                  <div className="flex-1">
                    <Label htmlFor="standalone" className="flex items-center gap-2 cursor-pointer">
                      <HardDrive className="w-5 h-5 text-blue-500" />
                      <span className="font-semibold">Standalone Mode</span>
                    </Label>
                    <p className="text-sm text-gray-400 mt-1">
                      Local cache with IndexedDB + File System API. Works 100% offline.
                    </p>
                    <div className="mt-2 text-xs text-gray-500">
                      ✓ Persistent cache<br />
                      ✓ Choose fast SSD/NVMe for cache<br />
                      ✓ Works offline<br />
                      ✓ Unlimited cache size (depends on disk)
                    </div>
                    
                    {selectedMode === RenderMode.STANDALONE && (
                      <div className="mt-3">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={handleSelectCacheDirectory}
                          className="gap-2"
                        >
                          <FolderOpen className="w-4 h-4" />
                          {cacheDirectorySelected ? 'Change Cache Directory' : 'Select Cache Directory'}
                        </Button>
                        {cacheDirectorySelected && (
                          <p className="text-xs text-green-500 mt-2">
                            ✓ Cache directory selected
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </Card>
              
              <Card className="p-4 bg-[#0f0f0f] border-[#2a2a2a]">
                <div className="flex items-start gap-3">
                  <RadioGroupItem value={RenderMode.CLOUD} id="cloud" />
                  <div className="flex-1">
                    <Label htmlFor="cloud" className="flex items-center gap-2 cursor-pointer">
                      <Cloud className="w-5 h-5 text-purple-500" />
                      <span className="font-semibold">Cloud-Accelerated Mode</span>
                    </Label>
                    <p className="text-sm text-gray-400 mt-1">
                      Local WebGL rendering + optional S3 upload. Access from anywhere.
                    </p>
                    <div className="mt-2 text-xs text-gray-500">
                      ✓ Local real-time rendering<br />
                      ✓ Cloud backup<br />
                      ✓ Access from multiple devices<br />
                      ✓ Collaboration ready
                    </div>
                  </div>
                </div>
              </Card>
            </RadioGroup>
          </div>
          
          <div className="pt-4 border-t border-[#2a2a2a]">
            <h3 className="text-sm font-semibold mb-2">Color Space Settings</h3>
            <div className="space-y-2 text-sm text-gray-400">
              <div className="flex justify-between">
                <span>Working Color Space:</span>
                <span className="text-white">Linear Rec. 2020</span>
              </div>
              <div className="flex justify-between">
                <span>Output Color Space:</span>
                <span className="text-white">Rec. 709</span>
              </div>
              <div className="flex justify-between">
                <span>HDR Support:</span>
                <span className="text-white">PQ (ST.2084) / HLG</span>
              </div>
            </div>
          </div>
        </div>
        
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave}>
            Save Changes
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

