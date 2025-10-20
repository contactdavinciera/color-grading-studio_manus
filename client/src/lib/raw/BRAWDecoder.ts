import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';

export interface BRAWFrame {
  data: Uint8Array;
  width: number;
  height: number;
  timestamp: number;
}

export class BRAWDecoder {
  private ffmpeg: FFmpeg | null = null;
  private initialized = false;

  /**
   * Initialize FFmpeg.wasm
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      this.ffmpeg = new FFmpeg();
      
      const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd';
      
      await this.ffmpeg.load({
        coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
        wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
      });

      this.initialized = true;
      console.log('FFmpeg.wasm initialized successfully');
    } catch (error) {
      console.error('Failed to initialize FFmpeg.wasm:', error);
      throw error;
    }
  }

  /**
   * Decode BRAW file and extract first frame as image
   */
  async decodeFirstFrame(file: File): Promise<HTMLImageElement> {
    if (!this.ffmpeg) {
      await this.initialize();
    }

    if (!this.ffmpeg) {
      throw new Error('FFmpeg not initialized');
    }

    try {
      console.log('Decoding BRAW file:', file.name);

      // Write input file to FFmpeg virtual filesystem
      await this.ffmpeg.writeFile('input.braw', await fetchFile(file));

      // Extract first frame as PNG
      // BRAW is supported by FFmpeg if compiled with the right codecs
      await this.ffmpeg.exec([
        '-i', 'input.braw',
        '-vframes', '1',
        '-f', 'image2',
        'output.png'
      ]);

      // Read output
      const data = await this.ffmpeg.readFile('output.png');
      
      // Clean up
      await this.ffmpeg.deleteFile('input.braw');
      await this.ffmpeg.deleteFile('output.png');

      // Convert to image
      const blob = new Blob([data as BlobPart], { type: 'image/png' });
      const url = URL.createObjectURL(blob);
      
      return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
          URL.revokeObjectURL(url);
          resolve(img);
        };
        img.onerror = reject;
        img.src = url;
      });
    } catch (error) {
      console.error('Failed to decode BRAW:', error);
      throw error;
    }
  }

  /**
   * Decode BRAW file and extract frame at specific time
   */
  async decodeFrameAtTime(file: File, timeInSeconds: number): Promise<HTMLImageElement> {
    if (!this.ffmpeg) {
      await this.initialize();
    }

    if (!this.ffmpeg) {
      throw new Error('FFmpeg not initialized');
    }

    try {
      console.log(`Decoding BRAW frame at ${timeInSeconds}s`);

      await this.ffmpeg.writeFile('input.braw', await fetchFile(file));

      // Seek to specific time and extract frame
      await this.ffmpeg.exec([
        '-ss', timeInSeconds.toString(),
        '-i', 'input.braw',
        '-vframes', '1',
        '-f', 'image2',
        'output.png'
      ]);

      const data = await this.ffmpeg.readFile('output.png');
      
      await this.ffmpeg.deleteFile('input.braw');
      await this.ffmpeg.deleteFile('output.png');

      const blob = new Blob([data as BlobPart], { type: 'image/png' });
      const url = URL.createObjectURL(blob);
      
      return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
          URL.revokeObjectURL(url);
          resolve(img);
        };
        img.onerror = reject;
        img.src = url;
      });
    } catch (error) {
      console.error('Failed to decode BRAW frame:', error);
      throw error;
    }
  }

  /**
   * Get video duration from BRAW file
   */
  async getDuration(file: File): Promise<number> {
    if (!this.ffmpeg) {
      await this.initialize();
    }

    if (!this.ffmpeg) {
      throw new Error('FFmpeg not initialized');
    }

    try {
      await this.ffmpeg.writeFile('input.braw', await fetchFile(file));

      // Get video info
      let duration = 0;
      this.ffmpeg.on('log', ({ message }) => {
        // Parse duration from FFmpeg output
        const match = message.match(/Duration: (\d{2}):(\d{2}):(\d{2}\.\d{2})/);
        if (match) {
          const hours = parseInt(match[1]);
          const minutes = parseInt(match[2]);
          const seconds = parseFloat(match[3]);
          duration = hours * 3600 + minutes * 60 + seconds;
        }
      });

      await this.ffmpeg.exec(['-i', 'input.braw']);
      
      await this.ffmpeg.deleteFile('input.braw');

      return duration;
    } catch (error) {
      console.error('Failed to get BRAW duration:', error);
      return 0;
    }
  }

  /**
   * Convert BRAW to video element for playback
   */
  async convertToVideo(file: File): Promise<HTMLVideoElement> {
    if (!this.ffmpeg) {
      await this.initialize();
    }

    if (!this.ffmpeg) {
      throw new Error('FFmpeg not initialized');
    }

    try {
      console.log('Converting BRAW to MP4 for playback...');

      await this.ffmpeg.writeFile('input.braw', await fetchFile(file));

      // Convert to MP4 with high quality
      await this.ffmpeg.exec([
        '-i', 'input.braw',
        '-c:v', 'libx264',
        '-preset', 'ultrafast',
        '-crf', '18',
        '-pix_fmt', 'yuv420p',
        'output.mp4'
      ]);

      const data = await this.ffmpeg.readFile('output.mp4');
      
      await this.ffmpeg.deleteFile('input.braw');
      await this.ffmpeg.deleteFile('output.mp4');

      const blob = new Blob([data as BlobPart], { type: 'video/mp4' });
      const url = URL.createObjectURL(blob);
      
      const video = document.createElement('video');
      video.src = url;
      video.preload = 'auto';
      video.muted = true;
      
      return new Promise((resolve, reject) => {
        video.onloadedmetadata = () => resolve(video);
        video.onerror = reject;
      });
    } catch (error) {
      console.error('Failed to convert BRAW to video:', error);
      throw error;
    }
  }

  /**
   * Dispose FFmpeg instance
   */
  dispose(): void {
    if (this.ffmpeg) {
      this.ffmpeg.terminate();
      this.ffmpeg = null;
      this.initialized = false;
    }
  }
}

// Singleton instance
let decoderInstance: BRAWDecoder | null = null;

export function getBRAWDecoder(): BRAWDecoder {
  if (!decoderInstance) {
    decoderInstance = new BRAWDecoder();
  }
  return decoderInstance;
}

