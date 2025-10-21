import { createRequire } from 'module';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';

// Get __dirname equivalent in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Create require function for loading native addon
const require = createRequire(import.meta.url);

// Load native addon using require
const nativeAddon = require(join(__dirname, 'native/build/Release/braw.node'));

export interface BRAWMetadata {
  success: boolean;
  frame_count: number;
  width: number;
  height: number;
  frame_rate: number;
  duration: number;
  error?: string;
}

export interface BRAWFrameResult {
  success: boolean;
  width: number;
  height: number;
  buffer: Buffer;
  error?: string;
}

export interface BRAWFrameOptions {
  format?: 'jpeg' | 'png' | 'webp' | 'bgr24'; // Changed 'raw' to 'bgr24'
  quality?: number;
  resizeWidth?: number;
  resizeHeight?: number;
}

export function extractMetadata(filePath: string): BRAWMetadata {
  return nativeAddon.extractMetadata(filePath);
}

export function initBRAWNative(): void {
  if (nativeAddon.initialize) {
    nativeAddon.initialize();
  }
}

export function extractFrameRaw(filePath: string, frameIndex: number): BRAWFrameResult {
  return nativeAddon.extractFrame(filePath, frameIndex);
}

export async function extractFrameBuffer(
  filePath: string,
  frameIndex: number,
  options: BRAWFrameOptions = {}
): Promise<Buffer> {
  const { format = 'jpeg', quality = 90, resizeWidth, resizeHeight } = options;
  const frameResult = extractFrameRaw(filePath, frameIndex);

  if (!frameResult.success) {
    console.error("Error from native addon:", frameResult.error);
    throw new Error(frameResult.error || 'Failed to extract frame');
  }
  if (!frameResult.buffer) {
    console.error("Native addon returned no buffer for frame", frameIndex);
    throw new Error('Native addon returned no buffer');
  }
  const expectedBufferSize = frameResult.width * frameResult.height * 3;
  console.log("Frame buffer received from native addon. Dimensions:", frameResult.width, "x", frameResult.height, ", Buffer Length:", frameResult.buffer.length, ", Expected BGR24 Size:", expectedBufferSize);


  // If format is bgr24, return the raw buffer directly
  if (format === 'bgr24') {
    return frameResult.buffer;
  }

  // Otherwise, process with sharp for image formats
  let image = sharp(frameResult.buffer, {
    raw: {
      width: frameResult.width,
      height: frameResult.height,
      channels: 3, // BGR24 has 3 channels
    },
  });

  if (resizeWidth || resizeHeight) {
    image = image.resize(resizeWidth, resizeHeight, {
      fit: 'inside',
      withoutEnlargement: true,
    });
  }

  switch (format) {
    case 'jpeg':
      return image.jpeg({ quality }).toBuffer();
    case 'png':
      return image.png({ compressionLevel: 9 }).toBuffer();
    case 'webp':
      return image.webp({ quality }).toBuffer();
    default:
      throw new Error(`Unsupported format: ${format}`);
  }
}

