/**
 * BRAW Extractor Wrapper
 * 
 * TypeScript wrapper for the C++ BRAW frame extractor
 */

import { spawn } from 'child_process';
import { join } from 'path';
import { promises as fs } from 'fs';

const BRAW_EXTRACTOR_PATH = join(__dirname, 'braw-extractor');

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
  path: string;
  width: number;
  height: number;
  error?: string;
}

/**
 * Extract metadata from BRAW file
 */
export async function extractMetadata(brawPath: string): Promise<BRAWMetadata> {
  return new Promise((resolve, reject) => {
    const process = spawn(BRAW_EXTRACTOR_PATH, ['metadata', brawPath]);
    
    let stdout = '';
    let stderr = '';
    
    process.stdout.on('data', (data) => {
      stdout += data.toString();
    });
    
    process.stderr.on('data', (data) => {
      stderr += data.toString();
    });
    
    process.on('close', (code) => {
      if (code !== 0) {
        try {
          const error = JSON.parse(stderr);
          resolve(error);
        } catch {
          reject(new Error(`BRAW extractor failed with code ${code}: ${stderr}`));
        }
        return;
      }
      
      try {
        const metadata = JSON.parse(stdout);
        resolve(metadata);
      } catch (error) {
        reject(new Error(`Failed to parse metadata JSON: ${error}`));
      }
    });
    
    process.on('error', (error) => {
      reject(new Error(`Failed to spawn BRAW extractor: ${error.message}`));
    });
  });
}

/**
 * Extract a single frame from BRAW file
 */
export async function extractFrame(
  brawPath: string,
  frameIndex: number,
  outputPath: string
): Promise<BRAWFrameResult> {
  return new Promise((resolve, reject) => {
    const process = spawn(BRAW_EXTRACTOR_PATH, [
      'extract',
      brawPath,
      frameIndex.toString(),
      outputPath
    ]);
    
    let stdout = '';
    let stderr = '';
    
    process.stdout.on('data', (data) => {
      stdout += data.toString();
    });
    
    process.stderr.on('data', (data) => {
      stderr += data.toString();
    });
    
    process.on('close', (code) => {
      if (code !== 0) {
        try {
          const error = JSON.parse(stderr);
          resolve(error);
        } catch {
          reject(new Error(`BRAW extractor failed with code ${code}: ${stderr}`));
        }
        return;
      }
      
      try {
        const result = JSON.parse(stdout);
        resolve(result);
      } catch (error) {
        reject(new Error(`Failed to parse result JSON: ${error}`));
      }
    });
    
    process.on('error', (error) => {
      reject(new Error(`Failed to spawn BRAW extractor: ${error.message}`));
    });
  });
}

/**
 * Convert PPM to JPEG using ffmpeg
 */
export async function convertPPMToJPEG(ppmPath: string, jpegPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const process = spawn('ffmpeg', [
      '-i', ppmPath,
      '-q:v', '2',
      '-y',
      jpegPath
    ]);
    
    let stderr = '';
    
    process.stderr.on('data', (data) => {
      stderr += data.toString();
    });
    
    process.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`FFmpeg failed with code ${code}: ${stderr}`));
        return;
      }
      resolve();
    });
    
    process.on('error', (error) => {
      reject(new Error(`Failed to spawn FFmpeg: ${error.message}`));
    });
  });
}

/**
 * Extract frame and convert to JPEG in one step
 */
export async function extractFrameAsJPEG(
  brawPath: string,
  frameIndex: number,
  outputJpegPath: string
): Promise<BRAWFrameResult> {
  const tempPpmPath = outputJpegPath.replace(/\.jpe?g$/i, '.ppm');
  
  try {
    // Extract frame as PPM
    const result = await extractFrame(brawPath, frameIndex, tempPpmPath);
    
    if (!result.success) {
      return result;
    }
    
    // Convert PPM to JPEG
    await convertPPMToJPEG(tempPpmPath, outputJpegPath);
    
    // Clean up PPM file
    await fs.unlink(tempPpmPath).catch(() => {});
    
    // Return result with JPEG path
    return {
      ...result,
      path: outputJpegPath
    };
  } catch (error) {
    // Clean up temp file on error
    await fs.unlink(tempPpmPath).catch(() => {});
    throw error;
  }
}

