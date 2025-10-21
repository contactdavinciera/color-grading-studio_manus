import * as fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
import { extractMetadata, extractFrameBuffer, initBRAWNative } from './braw';

export interface BRAWFrameRequest {
  fileId: string;
  timestamp: number;
  quality?: 'low' | 'medium' | 'high';
}

export interface BRAWInfo {
  duration: number;
  width: number;
  height: number;
  fps: number;
  codec: string;
  frameCount: number;
}

export class BRAWProcessor {
  private cacheDir: string;
  private uploadDir: string;
  // private frameCache: Map<string, Buffer> = new Map(); // Remove frame cache for raw buffers
  // private maxCacheSize = 100;
  private fileMetadataCache: Map<string, BRAWInfo> = new Map();

  constructor() {
    this.cacheDir = path.resolve(__dirname, '..', 'temp', 'braw-cache');
    this.uploadDir = path.resolve(__dirname, '..', 'temp', 'braw-uploads');
  }

  async initialize(): Promise<void> {
    console.log("[BRAW] Initializing BRAWProcessor...");
    await fs.mkdir(this.cacheDir, { recursive: true });
    await fs.mkdir(this.uploadDir, { recursive: true });
    console.log("[BRAW] Initializing native BRAW module...");
    initBRAWNative(); // Explicitly initialize the native module
    console.log("[BRAW] Processor initialized. Upload Dir: " + this.uploadDir + ", Cache Dir: " + this.cacheDir);
  }

  async generateFileId(): Promise<string> {
    return crypto.randomBytes(16).toString('hex');
  }

  async saveUpload(buffer: Buffer, originalName: string): Promise<string> {
    const fileId = await this.generateFileId();
    const ext = path.extname(originalName);
    const filePath = path.join(this.uploadDir, `${fileId}${ext}`);
    await fs.writeFile(filePath, buffer);
    return fileId;
  }

  async getInfo(fileId: string): Promise<BRAWInfo> {
    if (this.fileMetadataCache.has(fileId)) {
      return this.fileMetadataCache.get(fileId)!;
    }

    const filePath = await this.getFilePath(fileId);
    const metadata = extractMetadata(filePath);

    if (!metadata.success) {
      throw new Error(metadata.error || 'Failed to extract metadata');
    }

    const info: BRAWInfo = {
      duration: metadata.duration,
      width: metadata.width,
      height: metadata.height,
      fps: metadata.frame_rate,
      codec: 'BRAW',
      frameCount: metadata.frame_count,
    };

    this.fileMetadataCache.set(fileId, info);
    return info;
  }

  private async timestampToFrameIndex(fileId: string, timestamp: number): Promise<number> {
    const info = await this.getInfo(fileId);
    const frameIndex = Math.floor(timestamp * info.fps);
    return Math.min(frameIndex, info.frameCount - 1);
  }

  async extractFrame(request: BRAWFrameRequest): Promise<Buffer> {
    const { fileId, timestamp, quality = 'medium' } = request;
    const cacheKey = `${fileId}_${timestamp}_${quality}`;

    // Removed frame cache for raw buffers, as they are large and not easily cacheable as JPEGs
    // if (this.frameCache.has(cacheKey)) {
    //   return this.frameCache.get(cacheKey)!;
    // }

    // Removed disk cache for raw buffers
    // const diskCachePath = path.join(this.cacheDir, `${cacheKey}.jpg`);
    // try {
    //   const cached = await fs.readFile(diskCachePath);
    //   this.addToCache(cacheKey, cached);
    //   return cached;
    // } catch {}

    const filePath = await this.getFilePath(fileId);
    const frameIndex = await this.timestampToFrameIndex(fileId, timestamp);
    
    // The `quality` parameter for extractFrameBuffer is not directly used for raw formats,
    // but we can still pass it if the native module expects it.
    // For now, we'll just pass the quality string.
    const frameBuffer = await extractFrameBuffer(filePath, frameIndex, {
      format: 'bgr24', // Request raw BGR24 pixel format
      // quality: jpegQuality, // Not applicable for raw format
      // resizeWidth: resizeWidth, // Not applicable for raw format, unless native module handles it
    });

    // Do not cache raw frame buffers, as they are large and not easily cacheable.
    // await fs.writeFile(diskCachePath, frameBuffer);
    // this.addToCache(cacheKey, frameBuffer);
    return frameBuffer;
  }

  // private addToCache(key: string, buffer: Buffer): void {
  //   if (this.frameCache.size >= this.maxCacheSize) {
  //     const firstKey = this.frameCache.keys().next().value;
  //     if (firstKey) {
  //       this.frameCache.delete(firstKey);
  //     }
  //   }
  //   this.frameCache.set(key, buffer);
  // }

  private async getFilePath(fileId: string): Promise<string> {
    const files = await fs.readdir(this.uploadDir);
    const file = files.find((f) => f.startsWith(fileId));
    if (!file) {
      throw new Error(`File not found: ${fileId}`);
    }
    return path.join(this.uploadDir, file);
  }

  async cleanup(fileId: string): Promise<void> {
    const filePath = await this.getFilePath(fileId);
    await fs.unlink(filePath);
    this.fileMetadataCache.delete(fileId);
    // Implement more cleanup logic if needed (e.g., clearing frame cache)
  }

  getCacheStats() {
    return {
      memoryFrames: 0, // this.frameCache.size,
      maxMemoryFrames: 0, // this.maxCacheSize,
      cachedFiles: new Set(this.fileMetadataCache.keys()),
    };
  }
}

let processorInstance: BRAWProcessor | null = null;

export async function getBRAWProcessor(): Promise<BRAWProcessor> {
  if (!processorInstance) {
    processorInstance = new BRAWProcessor();
    await processorInstance.initialize();
  }
  return processorInstance;
}

