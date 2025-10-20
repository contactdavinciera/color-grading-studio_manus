import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Slider } from '@/components/ui/slider';
import { Upload, Film, Trash2 } from 'lucide-react';

interface LUT {
  id: string;
  name: string;
  category: string;
  intensity: number;
  data?: ArrayBuffer;
}

const PRESET_LUTS: LUT[] = [
  // Cinema LUTs
  { id: 'cinema_1', name: 'Cinematic Teal & Orange', category: 'Cinema', intensity: 1 },
  { id: 'cinema_2', name: 'Blockbuster', category: 'Cinema', intensity: 1 },
  { id: 'cinema_3', name: 'Film Noir', category: 'Cinema', intensity: 1 },
  { id: 'cinema_4', name: 'Sci-Fi Blue', category: 'Cinema', intensity: 1 },
  
  // Film Emulation
  { id: 'kodak_vision3', name: 'Kodak Vision3 5219', category: 'Film Emulation', intensity: 1 },
  { id: 'kodak_portra', name: 'Kodak Portra 400', category: 'Film Emulation', intensity: 1 },
  { id: 'fuji_eterna', name: 'Fujifilm Eterna', category: 'Film Emulation', intensity: 1 },
  { id: 'fuji_250d', name: 'Fujifilm 250D', category: 'Film Emulation', intensity: 1 },
  { id: 'kodak_2383', name: 'Kodak 2383 Print', category: 'Film Emulation', intensity: 1 },
  
  // ARRI
  { id: 'arri_alexa', name: 'ARRI Alexa Natural', category: 'ARRI', intensity: 1 },
  { id: 'arri_k1s1', name: 'ARRI K1S1', category: 'ARRI', intensity: 1 },
  
  // RED
  { id: 'red_dragon', name: 'RED Dragon Natural', category: 'RED', intensity: 1 },
  { id: 'red_ipp2', name: 'RED IPP2', category: 'RED', intensity: 1 },
  
  // Commercial
  { id: 'commercial_1', name: 'Fashion Magazine', category: 'Commercial', intensity: 1 },
  { id: 'commercial_2', name: 'Product Shot', category: 'Commercial', intensity: 1 },
  { id: 'commercial_3', name: 'Beauty', category: 'Commercial', intensity: 1 },
  
  // Instagram/Social
  { id: 'instagram_1', name: 'Instagram Warm', category: 'Social Media', intensity: 1 },
  { id: 'instagram_2', name: 'Instagram Cool', category: 'Social Media', intensity: 1 },
  { id: 'instagram_3', name: 'VSCO Film', category: 'Social Media', intensity: 1 },
];

interface LUTManagerProps {
  onApplyLUT: (lut: LUT) => void;
}

export function LUTManager({ onApplyLUT }: LUTManagerProps) {
  const [luts, setLuts] = useState<LUT[]>(PRESET_LUTS);
  const [selectedLUT, setSelectedLUT] = useState<LUT | null>(null);
  const [intensity, setIntensity] = useState(100);
  
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    try {
      const data = await file.arrayBuffer();
      const newLUT: LUT = {
        id: `custom_${Date.now()}`,
        name: file.name.replace(/\.(cube|3dl)$/i, ''),
        category: 'Custom',
        intensity: 1,
        data,
      };
      
      setLuts(prev => [...prev, newLUT]);
    } catch (error) {
      console.error('Failed to load LUT:', error);
    }
  };
  
  const handleApplyLUT = (lut: LUT) => {
    setSelectedLUT(lut);
    onApplyLUT({ ...lut, intensity: intensity / 100 });
  };
  
  const handleIntensityChange = (value: number[]) => {
    setIntensity(value[0]);
    if (selectedLUT) {
      onApplyLUT({ ...selectedLUT, intensity: value[0] / 100 });
    }
  };
  
  const handleDeleteLUT = (id: string) => {
    setLuts(prev => prev.filter(lut => lut.id !== id));
    if (selectedLUT?.id === id) {
      setSelectedLUT(null);
    }
  };
  
  const categories = Array.from(new Set(luts.map(lut => lut.category)));
  
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">LUT Library</h3>
        <label htmlFor="lut-upload">
          <Button variant="outline" size="sm" className="cursor-pointer gap-2" asChild>
            <span>
              <Upload className="w-4 h-4" />
              Import LUT
            </span>
          </Button>
        </label>
        <input
          id="lut-upload"
          type="file"
          accept=".cube,.3dl"
          className="hidden"
          onChange={handleFileUpload}
        />
      </div>
      
      {selectedLUT && (
        <Card className="p-4 bg-[#0f0f0f] border-[#2a2a2a]">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">{selectedLUT.name}</span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSelectedLUT(null)}
              >
                Clear
              </Button>
            </div>
            <div>
              <div className="flex justify-between mb-2">
                <label className="text-xs text-gray-400">Intensity</label>
                <span className="text-xs text-gray-500">{intensity}%</span>
              </div>
              <Slider
                value={[intensity]}
                onValueChange={handleIntensityChange}
                min={0}
                max={100}
                step={1}
              />
            </div>
          </div>
        </Card>
      )}
      
      <ScrollArea className="h-96">
        <div className="space-y-4">
          {categories.map(category => (
            <div key={category}>
              <h4 className="text-xs font-semibold text-gray-400 mb-2 flex items-center gap-2">
                <Film className="w-3 h-3" />
                {category}
              </h4>
              <div className="grid grid-cols-2 gap-2">
                {luts
                  .filter(lut => lut.category === category)
                  .map(lut => (
                    <Card
                      key={lut.id}
                      className={`p-3 bg-[#0f0f0f] border-[#2a2a2a] cursor-pointer hover:border-blue-500 transition-colors ${
                        selectedLUT?.id === lut.id ? 'border-blue-500' : ''
                      }`}
                      onClick={() => handleApplyLUT(lut)}
                    >
                      <div className="flex items-start justify-between">
                        <span className="text-xs font-medium">{lut.name}</span>
                        {category === 'Custom' && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-4 w-4 p-0"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteLUT(lut.id);
                            }}
                          >
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        )}
                      </div>
                    </Card>
                  ))}
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}

