import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { getRAWDecoder } from './rawDecoder';

const execAsync = promisify(exec);

export interface BRAWFrameRequest {
  fileId: string;
  timestamp: number; // in seconds
  quality?: 'low' | 'medium' | 'high';
}

export interface BRAWInfo {
  duration: number;
  width: number;
  height: number;
  fps: number;
  codec: string;
}

/**
 * BRAW Processor Service
 * Handles server-side BRAW decoding using native FFmpeg
 */
export class BRAWProcessor {
  private cacheDir: string;
  private uploadDir: string;
  private frameCache: Map<string, Buffer> = new Map();
  private maxCacheSize = 100; // Maximum frames in memory

  constructor() {
    this.cacheDir = path.join(process.cwd(), 'temp', 'braw-cache');
    this.uploadDir = path.join(process.cwd(), 'temp', 'braw-uploads');
  }

  /**
   * Initialize directories
   */
  async initialize(): Promise<void> {
    await fs.mkdir(this.cacheDir, { recursive: true });
    await fs.mkdir(this.uploadDir, { recursive: true });
    console.log('[BRAW] Processor initialized');
  }

  /**
   * Generate unique file ID
   */
  async generateFileId(): Promise<string> {
    return crypto.randomBytes(16).toString('hex');
  }

  /**
   * Save uploaded BRAW file
   */
  async saveUpload(buffer: Buffer, originalName: string): Promise<string> {
    const fileId = await this.generateFileId();
    const ext = path.extname(originalName);
    const filePath = path.join(this.uploadDir, `${fileId}${ext}`);
    
    await fs.writeFile(filePath, buffer);
    console.log(`[BRAW] Saved upload: ${fileId}`);
    
    return fileId;
  }

  /**
   * Get BRAW file info using FFprobe
   */
  async getInfo(fileId: string): Promise<BRAWInfo> {
    const filePath = await this.getFilePath(fileId);
    
    try {
      const { stdout } = await execAsync(
        `ffprobe -v quiet -print_format json -show_format -show_streams "${filePath}"`
      );
      
      const data = JSON.parse(stdout);
      const videoStream = data.streams.find((s: any) => s.codec_type === 'video');
      
      if (!videoStream) {
        throw new Error('No video stream found');
      }

      return {
        duration: parseFloat(data.format.duration || '0'),
        width: videoStream.width,
        height: videoStream.height,
        fps: eval(videoStream.r_frame_rate), // e.g., "24000/1001"
        codec: videoStream.codec_name,
      };
    } catch (error) {
      console.error('[BRAW] Failed to get info:', error);
      throw error;
    }
  }

  /**
   * Extract frame at specific timestamp
   */
  async extractFrame(request: BRAWFrameRequest): Promise<Buffer> {
    const { fileId, timestamp, quality = 'medium' } = request;
    
    // Check memory cache first
    const cacheKey = `${fileId}_${timestamp}_${quality}`;
    if (this.frameCache.has(cacheKey)) {
      console.log(`[BRAW] Cache hit: ${cacheKey}`);
      return this.frameCache.get(cacheKey)!;
    }

    // Check disk cache
    const diskCachePath = path.join(this.cacheDir, `${cacheKey}.jpg`);
    try {
      const cached = await fs.readFile(diskCachePath);
      this.addToCache(cacheKey, cached);
      console.log(`[BRAW] Disk cache hit: ${cacheKey}`);
      return cached;
    } catch {
      // Not in cache, extract frame
    }

    const filePath = await this.getFilePath(fileId);
    
    // Quality settings
    const qualityMap = {
      low: { scale: '640:-1', quality: 5 },
      medium: { scale: '1920:-1', quality: 3 },
      high: { scale: '-1:-1', quality: 2 },
    };
    
    const { scale, quality: qValue } = qualityMap[quality];

    try {
      console.log(`[BRAW] Extracting frame at ${timestamp}s from ${fileId}`);
      
      const outputPath = path.join(this.cacheDir, `${cacheKey}.jpg`);
      const decoder = await getRAWDecoder();
      const jpegQuality = quality === 'low' ? 70 : quality === 'medium' ? 85 : 95;
      
      // Try RAW decoder first (supports BRAW, DNG, CR2, etc)
      try {
        if (timestamp > 0) {
          await decoder.extractBRAWFrameAtTime(filePath, outputPath, timestamp, jpegQuality);
        } else {
          await decoder.decodeToJPEG(filePath, outputPath, { quality: jpegQuality });
        }
        
        // If scale is needed, apply it
        if (scale !== '-1:-1') {
          const scaledPath = outputPath.replace('.jpg', '_scaled.jpg');
          await execAsync(`ffmpeg -i "${outputPath}" -vf scale=${scale} -q:v ${qValue} "${scaledPath}" -y`);
          await fs.rename(scaledPath, outputPath);
        }
      } catch (decoderError) {
        console.log('[BRAW] RAW decoder failed, trying FFmpeg fallback:', decoderError);
        
        // Fallback to FFmpeg
        await execAsync(
          `ffmpeg -ss ${timestamp} -i "${filePath}" -vframes 1 -vf scale=${scale} -q:v ${qValue} "${outputPath}" -y`
        );
      }

      const frameBuffer = await fs.readFile(outputPath);
      this.addToCache(cacheKey, frameBuffer);
      
      console.log(`[BRAW] Frame extracted: ${cacheKey} (${frameBuffer.length} bytes)`);
      return frameBuffer;
    } catch (error) {
      console.error('[BRAW] Failed to extract frame:', error);
      throw new Error(`Frame extraction failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Extract multiple frames for buffering
   */
  async extractFrames(
    fileId: string,
    timestamps: number[],
    quality?: 'low' | 'medium' | 'high'
  ): Promise<Map<number, Buffer>> {
    const frames = new Map<number, Buffer>();
    
    // Extract frames in parallel (limit concurrency)
    const concurrency = 4;
    for (let i = 0; i < timestamps.length; i += concurrency) {
      const batch = timestamps.slice(i, i + concurrency);
      const results = await Promise.all(
        batch.map(async (timestamp) => {
          try {
            const buffer = await this.extractFrame({ fileId, timestamp, quality });
            return { timestamp, buffer };
          } catch (error) {
            console.error(`[BRAW] Failed to extract frame at ${timestamp}:`, error);
            return null;
          }
        })
      );
      
      results.forEach((result) => {
        if (result) {
          frames.set(result.timestamp, result.buffer);
        }
      });
    }
    
    return frames;
  }

  /**
   * Clean up uploaded file and cache
   */
  async cleanup(fileId: string): Promise<void> {
    try {
      const filePath = await this.getFilePath(fileId);
      await fs.unlink(filePath);
      
      // Remove from memory cache
      const keysToDelete = Array.from(this.frameCache.keys()).filter(key => key.startsWith(fileId));
      keysToDelete.forEach(key => this.frameCache.delete(key));
      
      // Remove from disk cache
      const files = await fs.readdir(this.cacheDir);
      for (const file of files) {
        if (file.startsWith(fileId)) {
          await fs.unlink(path.join(this.cacheDir, file));
        }
      }
      
      console.log(`[BRAW] Cleaned up: ${fileId}`);
    } catch (error) {
      console.error('[BRAW] Cleanup failed:', error);
    }
  }

  /**
   * Get file path by ID
   */
  private async getFilePath(fileId: string): Promise<string> {
    const files = await fs.readdir(this.uploadDir);
    const file = files.find((f) => f.startsWith(fileId));
    
    if (!file) {
      throw new Error(`File not found: ${fileId}`);
    }
    
    return path.join(this.uploadDir, file as string);
  }

  /**
   * Add frame to memory cache with LRU eviction
   */
  private addToCache(key: string, buffer: Buffer): void {
    if (this.frameCache.size >= this.maxCacheSize) {
      // Remove oldest entry (first key)
      const firstKey = Array.from(this.frameCache.keys())[0];
      if (firstKey) {
        this.frameCache.delete(firstKey);
      }
    }
    
    this.frameCache.set(key, buffer);
  }
}

// Singleton instance
let processorInstance: BRAWProcessor | null = null;

export async function getBRAWProcessor(): Promise<BRAWProcessor> {
  if (!processorInstance) {
    processorInstance = new BRAWProcessor();
    await processorInstance.initialize();
  }
  return processorInstance;
}

