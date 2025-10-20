import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs/promises';
import * as path from 'path';

const execAsync = promisify(exec);

export interface RAWInfo {
  width: number;
  height: number;
  make?: string;
  model?: string;
  iso?: number;
  shutter?: string;
  aperture?: string;
  whiteBalance?: string;
  colorSpace?: string;
}

/**
 * Universal RAW decoder supporting multiple formats
 */
export class RAWDecoder {
  /**
   * Detect RAW format and extract info
   */
  async getInfo(filePath: string): Promise<RAWInfo> {
    const ext = path.extname(filePath).toLowerCase();
    
    // Try libraw first (supports DNG, CR2, NEF, ARW, etc)
    if (['.dng', '.cr2', '.cr3', '.nef', '.arw', '.raf', '.orf', '.rw2'].includes(ext)) {
      return await this.getInfoLibRaw(filePath);
    }
    
    // For BRAW, try to extract embedded preview
    if (ext === '.braw') {
      return await this.getInfoBRAW(filePath);
    }
    
    // Fallback
    throw new Error(`Unsupported RAW format: ${ext}`);
  }
  
  /**
   * Get info using LibRaw
   */
  private async getInfoLibRaw(filePath: string): Promise<RAWInfo> {
    try {
      const { stdout } = await execAsync(`raw-identify -v "${filePath}"`);
      
      // Parse output
      const lines = stdout.split('\n');
      const info: Partial<RAWInfo> = {};
      
      for (const line of lines) {
        if (line.includes('Image size:')) {
          const match = line.match(/(\d+)\s*x\s*(\d+)/);
          if (match) {
            info.width = parseInt(match[1]);
            info.height = parseInt(match[2]);
          }
        }
        if (line.includes('Camera:')) {
          const parts = line.split(':')[1]?.trim().split(' ');
          if (parts) {
            info.make = parts[0];
            info.model = parts.slice(1).join(' ');
          }
        }
        if (line.includes('ISO speed:')) {
          info.iso = parseInt(line.split(':')[1]);
        }
        if (line.includes('Shutter:')) {
          info.shutter = line.split(':')[1]?.trim();
        }
        if (line.includes('Aperture:')) {
          info.aperture = line.split(':')[1]?.trim();
        }
      }
      
      return info as RAWInfo;
    } catch (error) {
      console.error('[RAW Decoder] LibRaw failed:', error);
      throw error;
    }
  }
  
  /**
   * Get info from BRAW (extract embedded preview)
   */
  private async getInfoBRAW(filePath: string): Promise<RAWInfo> {
    try {
      // Try to get video stream info from BRAW
      const { stdout } = await execAsync(`ffprobe -v quiet -print_format json -show_streams "${filePath}"`);
      const data = JSON.parse(stdout);
      
      if (data.streams && data.streams.length > 0) {
        const videoStream = data.streams.find((s: any) => s.codec_type === 'video');
        if (videoStream) {
          return {
            width: videoStream.width || 3840,
            height: videoStream.height || 2160,
            make: 'Blackmagic Design',
            model: 'BRAW',
          };
        }
      }
      
      // Fallback to default BRAW resolution
      return {
        width: 3840,
        height: 2160,
        make: 'Blackmagic Design',
        model: 'BRAW',
      };
    } catch (error) {
      console.error('[RAW Decoder] BRAW probe failed:', error);
      // Return default
      return {
        width: 3840,
        height: 2160,
        make: 'Blackmagic Design',
        model: 'BRAW',
      };
    }
  }
  
  /**
   * Decode RAW file to JPEG
   */
  async decodeToJPEG(filePath: string, outputPath: string, options: {
    quality?: number;
    whiteBalance?: number; // Temperature in Kelvin
    exposure?: number; // EV compensation
  } = {}): Promise<void> {
    const ext = path.extname(filePath).toLowerCase();
    
    // Use dcraw for photo RAW formats
    if (['.dng', '.cr2', '.cr3', '.nef', '.arw', '.raf', '.orf', '.rw2'].includes(ext)) {
      await this.decodeWithDcraw(filePath, outputPath, options);
      return;
    }
    
    // For BRAW, extract frame with FFmpeg
    if (ext === '.braw') {
      await this.decodeBRAWFrame(filePath, outputPath, options);
      return;
    }
    
    throw new Error(`Unsupported RAW format: ${ext}`);
  }
  
  /**
   * Decode using dcraw
   */
  private async decodeWithDcraw(filePath: string, outputPath: string, options: any): Promise<void> {
    try {
      const tempPPM = outputPath.replace(/\.\w+$/, '.ppm');
      
      // dcraw options:
      // -c: write to stdout
      // -w: use camera white balance
      // -q 3: high quality interpolation
      // -T: output TIFF
      // -6: 16-bit output
      let cmd = `dcraw -c -w -q 3 "${filePath}" > "${tempPPM}"`;
      
      // Apply exposure compensation if specified
      if (options.exposure) {
        const brightness = Math.pow(2, options.exposure);
        cmd = `dcraw -c -w -q 3 -b ${brightness} "${filePath}" > "${tempPPM}"`;
      }
      
      await execAsync(cmd);
      
      // Convert PPM to JPEG using FFmpeg
      const quality = options.quality || 95;
      await execAsync(`ffmpeg -i "${tempPPM}" -q:v ${100 - quality} "${outputPath}" -y`);
      
      // Cleanup temp file
      await fs.unlink(tempPPM).catch(() => {});
    } catch (error) {
      console.error('[RAW Decoder] dcraw failed:', error);
      throw error;
    }
  }
  
  /**
   * Decode BRAW frame using FFmpeg
   */
  private async decodeBRAWFrame(filePath: string, outputPath: string, options: any): Promise<void> {
    try {
      // Try to extract first frame
      // BRAW might have embedded preview or we can try rawvideo
      const quality = options.quality || 95;
      
      // Method 1: Try to extract embedded preview/thumbnail
      try {
        await execAsync(`ffmpeg -i "${filePath}" -vframes 1 -q:v ${100 - quality} "${outputPath}" -y`);
        return;
      } catch (e) {
        console.log('[RAW Decoder] BRAW preview extraction failed, trying alternative...');
      }
      
      // Method 2: Try to decode as raw video
      try {
        await execAsync(`ffmpeg -f rawvideo -pix_fmt rgb24 -s 3840x2160 -i "${filePath}" -vframes 1 -q:v ${100 - quality} "${outputPath}" -y`);
        return;
      } catch (e) {
        console.log('[RAW Decoder] BRAW rawvideo decode failed');
      }
      
      throw new Error('BRAW decoding failed. Please convert to DNG or use a proxy file.');
    } catch (error) {
      console.error('[RAW Decoder] BRAW decode failed:', error);
      throw error;
    }
  }
  
  /**
   * Extract frame from BRAW at specific timestamp
   */
  async extractBRAWFrameAtTime(filePath: string, outputPath: string, timestamp: number, quality: number = 95): Promise<void> {
    try {
      // Try to seek to timestamp and extract frame
      await execAsync(`ffmpeg -ss ${timestamp} -i "${filePath}" -vframes 1 -q:v ${100 - quality} "${outputPath}" -y`);
    } catch (error) {
      console.error('[RAW Decoder] BRAW frame extraction at timestamp failed:', error);
      throw new Error('Failed to extract BRAW frame. The file may use unsupported codec.');
    }
  }
}

// Singleton instance
let decoderInstance: RAWDecoder | null = null;

export async function getRAWDecoder(): Promise<RAWDecoder> {
  if (!decoderInstance) {
    decoderInstance = new RAWDecoder();
  }
  return decoderInstance;
}

