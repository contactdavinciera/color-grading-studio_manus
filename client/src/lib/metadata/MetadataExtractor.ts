import * as exifr from 'exifr';

export interface ExtractedMetadata {
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
  
  // Raw data
  rawData?: any;
}

export class MetadataExtractor {
  /**
   * Extract metadata from image or video file
   */
  static async extract(file: File): Promise<ExtractedMetadata> {
    try {
      const data = await exifr.parse(file, true);

      if (!data) {
        return await this.extractBasicInfo(file);
      }

      return this.normalizeMetadata(data, file);
    } catch (error) {
      console.error('Failed to extract metadata:', error);
      return await this.extractBasicInfo(file);
    }
  }

  /**
   * Extract basic info when EXIF is not available
   */
  private static async extractBasicInfo(file: File): Promise<ExtractedMetadata> {
    const metadata: ExtractedMetadata = {};

    // Try to get dimensions from image/video
    if (file.type.startsWith('image/')) {
      const img = await this.loadImage(file);
      metadata.width = img.width;
      metadata.height = img.height;
    } else if (file.type.startsWith('video/')) {
      const video = await this.loadVideo(file);
      metadata.width = video.videoWidth;
      metadata.height = video.videoHeight;
      metadata.fps = this.estimateFPS(video);
    }

    return metadata;
  }

  /**
   * Normalize EXIF data to our metadata format
   */
  private static normalizeMetadata(exifData: any, file: File): ExtractedMetadata {
    const metadata: ExtractedMetadata = {
      rawData: exifData,
    };

    // Camera
    metadata.make = exifData.Make || exifData.CameraMake;
    metadata.model = exifData.Model || exifData.CameraModel;
    metadata.serialNumber = exifData.SerialNumber || exifData.InternalSerialNumber;

    // Exposure
    metadata.iso = exifData.ISO || exifData.ISOSpeedRatings;
    metadata.shutterSpeed = this.formatShutterSpeed(exifData.ExposureTime || exifData.ShutterSpeedValue);
    metadata.aperture = exifData.FNumber || exifData.ApertureValue;
    metadata.fps = exifData.FrameRate || exifData.VideoFrameRate;

    // Color
    metadata.whiteBalance = this.extractWhiteBalance(exifData);
    metadata.colorSpace = this.extractColorSpace(exifData);
    metadata.gamma = exifData.Gamma || exifData.GammaValue;
    
    // Check for LUT in XMP
    if (exifData.LookName || exifData.Look) {
      metadata.lut = exifData.LookName || exifData.Look;
    }

    // Lens
    metadata.lensModel = exifData.LensModel || exifData.Lens;
    metadata.focalLength = exifData.FocalLength;
    
    // Resolution
    metadata.width = exifData.ImageWidth || exifData.ExifImageWidth;
    metadata.height = exifData.ImageHeight || exifData.ExifImageHeight;
    metadata.bitDepth = exifData.BitsPerSample || this.estimateBitDepth(file);

    // Timecode (for video)
    metadata.timecode = exifData.TimeCode || exifData.StartTimecode;
    metadata.reelName = exifData.ReelName;
    metadata.clipName = exifData.ClipName || file.name;

    // Project metadata
    metadata.scene = exifData.Scene;
    metadata.take = exifData.Take;
    metadata.cameraRoll = exifData.CameraRoll;

    return metadata;
  }

  /**
   * Extract white balance from EXIF
   */
  private static extractWhiteBalance(exifData: any): number | undefined {
    // Try to get white balance in Kelvin
    if (exifData.WhiteBalance) {
      if (typeof exifData.WhiteBalance === 'number') {
        return exifData.WhiteBalance;
      }
      
      // Convert common WB modes to Kelvin
      const wbMap: Record<string, number> = {
        'Daylight': 5500,
        'Cloudy': 6500,
        'Shade': 7500,
        'Tungsten': 3200,
        'Fluorescent': 4000,
        'Flash': 5500,
        'Auto': 5500,
      };
      
      return wbMap[exifData.WhiteBalance] || 5500;
    }

    return exifData.ColorTemperature;
  }

  /**
   * Extract color space from EXIF
   */
  private static extractColorSpace(exifData: any): string | undefined {
    if (exifData.ColorSpace === 1 || exifData.ColorSpace === 'sRGB') {
      return 'sRGB';
    }
    if (exifData.ColorSpace === 2 || exifData.ColorSpace === 'Adobe RGB') {
      return 'Adobe RGB';
    }
    if (exifData.ColorSpace === 'Rec. 709') {
      return 'Rec. 709';
    }
    if (exifData.ColorSpace === 'Rec. 2020') {
      return 'Rec. 2020';
    }
    
    // Check for camera-specific color spaces
    if (exifData.Make?.toLowerCase().includes('red')) {
      return 'REDWideGamutRGB';
    }
    if (exifData.Make?.toLowerCase().includes('arri')) {
      return 'ALEXA Wide Gamut';
    }
    if (exifData.Make?.toLowerCase().includes('blackmagic')) {
      return 'Blackmagic Wide Gamut';
    }

    return exifData.ColorSpace || 'sRGB';
  }

  /**
   * Format shutter speed for display
   */
  private static formatShutterSpeed(value: number | undefined): string | undefined {
    if (!value) return undefined;
    
    if (value < 1) {
      return `1/${Math.round(1 / value)}`;
    }
    
    return `${value}s`;
  }

  /**
   * Estimate bit depth from file type
   */
  private static estimateBitDepth(file: File): number {
    const ext = file.name.split('.').pop()?.toLowerCase();
    
    // RAW formats typically 12-16 bit
    if (['cr2', 'cr3', 'nef', 'arw', 'dng', 'raf', 'orf', 'rw2'].includes(ext || '')) {
      return 14;
    }
    
    // Cinema formats
    if (['braw', 'r3d', 'arriraw'].includes(ext || '')) {
      return 16;
    }
    
    // Standard formats
    if (['jpg', 'jpeg', 'png'].includes(ext || '')) {
      return 8;
    }
    
    return 8;
  }

  /**
   * Load image to get dimensions
   */
  private static loadImage(file: File): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = URL.createObjectURL(file);
    });
  }

  /**
   * Load video to get dimensions and FPS
   */
  private static loadVideo(file: File): Promise<HTMLVideoElement> {
    return new Promise((resolve, reject) => {
      const video = document.createElement('video');
      video.onloadedmetadata = () => resolve(video);
      video.onerror = reject;
      video.src = URL.createObjectURL(file);
    });
  }

  /**
   * Estimate FPS from video
   */
  private static estimateFPS(video: HTMLVideoElement): number {
    // Common frame rates
    const duration = video.duration;
    if (duration > 0) {
      // This is a rough estimate, actual FPS would need frame counting
      return 30; // Default assumption
    }
    return 30;
  }

  /**
   * Check if file is a RAW format
   */
  static isRawFormat(file: File): boolean {
    const ext = file.name.split('.').pop()?.toLowerCase();
    const rawExtensions = [
      'cr2', 'cr3', 'nef', 'arw', 'dng', 'raf', 'orf', 'rw2',
      'braw', 'r3d', 'arriraw', 'ari',
      'raw', 'rwl', 'rw2', 'rwz'
    ];
    return rawExtensions.includes(ext || '');
  }

  /**
   * Check if file is a cinema RAW format
   */
  static isCinemaRaw(file: File): boolean {
    const ext = file.name.split('.').pop()?.toLowerCase();
    return ['braw', 'r3d', 'arriraw', 'ari'].includes(ext || '');
  }
}

