/**
 * Professional Scopes Renderer
 * Waveform, Vectorscope, Parade, Histogram, CIE Chromaticity
 */

export enum ScopeType {
  WAVEFORM = 'waveform',
  VECTORSCOPE = 'vectorscope',
  PARADE = 'parade',
  HISTOGRAM = 'histogram',
  CIE_CHROMATICITY = 'cie_chromaticity',
}

export interface ScopeConfig {
  type: ScopeType;
  width: number;
  height: number;
  backgroundColor: string;
  foregroundColor: string;
  gridColor: string;
  showGrid: boolean;
}

export class ScopeRenderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private config: ScopeConfig;
  
  constructor(canvas: HTMLCanvasElement, config: Partial<ScopeConfig> = {}) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Failed to get 2D context');
    }
    this.ctx = ctx;
    
    this.config = {
      type: config.type ?? ScopeType.WAVEFORM,
      width: config.width ?? 512,
      height: config.height ?? 512,
      backgroundColor: config.backgroundColor ?? '#1a1a1a',
      foregroundColor: config.foregroundColor ?? '#00ff00',
      gridColor: config.gridColor ?? '#333333',
      showGrid: config.showGrid ?? true,
    };
    
    this.canvas.width = this.config.width;
    this.canvas.height = this.config.height;
  }
  
  /**
   * Render scope from image data
   */
  render(imageData: ImageData): void {
    switch (this.config.type) {
      case ScopeType.WAVEFORM:
        this.renderWaveform(imageData);
        break;
      case ScopeType.VECTORSCOPE:
        this.renderVectorscope(imageData);
        break;
      case ScopeType.PARADE:
        this.renderParade(imageData);
        break;
      case ScopeType.HISTOGRAM:
        this.renderHistogram(imageData);
        break;
      case ScopeType.CIE_CHROMATICITY:
        this.renderCIEChromaticity(imageData);
        break;
    }
  }
  
  /**
   * Clear canvas
   */
  private clear(): void {
    this.ctx.fillStyle = this.config.backgroundColor;
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
  }
  
  /**
   * Draw grid
   */
  private drawGrid(divisions: number = 10): void {
    if (!this.config.showGrid) return;
    
    this.ctx.strokeStyle = this.config.gridColor;
    this.ctx.lineWidth = 1;
    
    const stepX = this.canvas.width / divisions;
    const stepY = this.canvas.height / divisions;
    
    // Vertical lines
    for (let i = 0; i <= divisions; i++) {
      const x = i * stepX;
      this.ctx.beginPath();
      this.ctx.moveTo(x, 0);
      this.ctx.lineTo(x, this.canvas.height);
      this.ctx.stroke();
    }
    
    // Horizontal lines
    for (let i = 0; i <= divisions; i++) {
      const y = i * stepY;
      this.ctx.beginPath();
      this.ctx.moveTo(0, y);
      this.ctx.lineTo(this.canvas.width, y);
      this.ctx.stroke();
    }
  }
  
  /**
   * Render Waveform (Luminance)
   */
  private renderWaveform(imageData: ImageData): void {
    this.clear();
    this.drawGrid();
    
    const { data, width, height } = imageData;
    const scopeWidth = this.canvas.width;
    const scopeHeight = this.canvas.height;
    
    // Create accumulation buffer
    const buffer = new Uint32Array(scopeWidth * scopeHeight);
    
    // Accumulate luminance values
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 4;
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        
        // Calculate luminance (Rec. 709)
        const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
        
        // Map to scope coordinates
        const scopeX = Math.floor((x / width) * scopeWidth);
        const scopeY = scopeHeight - 1 - Math.floor((lum / 255) * scopeHeight);
        
        if (scopeX >= 0 && scopeX < scopeWidth && scopeY >= 0 && scopeY < scopeHeight) {
          buffer[scopeY * scopeWidth + scopeX]++;
        }
      }
    }
    
    // Find max value for normalization
    let maxValue = 0;
    for (let i = 0; i < buffer.length; i++) {
      if (buffer[i] > maxValue) maxValue = buffer[i];
    }
    
    // Draw waveform
    const imageDataOut = this.ctx.createImageData(scopeWidth, scopeHeight);
    for (let i = 0; i < buffer.length; i++) {
      const intensity = Math.min(255, (buffer[i] / maxValue) * 255);
      imageDataOut.data[i * 4] = 0;
      imageDataOut.data[i * 4 + 1] = intensity;
      imageDataOut.data[i * 4 + 2] = 0;
      imageDataOut.data[i * 4 + 3] = 255;
    }
    
    this.ctx.putImageData(imageDataOut, 0, 0);
  }
  
  /**
   * Render Vectorscope
   */
  private renderVectorscope(imageData: ImageData): void {
    this.clear();
    
    const { data, width, height } = imageData;
    const centerX = this.canvas.width / 2;
    const centerY = this.canvas.height / 2;
    const radius = Math.min(centerX, centerY) * 0.9;
    
    // Draw graticule (circular grid)
    this.ctx.strokeStyle = this.config.gridColor;
    this.ctx.lineWidth = 1;
    
    // Circles
    for (let i = 1; i <= 5; i++) {
      this.ctx.beginPath();
      this.ctx.arc(centerX, centerY, (radius / 5) * i, 0, Math.PI * 2);
      this.ctx.stroke();
    }
    
    // Target boxes for standard colors (75% bars)
    const targets = [
      { angle: 103, label: 'R', color: '#ff0000' },
      { angle: 167, label: 'Mg', color: '#ff00ff' },
      { angle: 241, label: 'B', color: '#0000ff' },
      { angle: 299, label: 'Cy', color: '#00ffff' },
      { angle: 12, label: 'G', color: '#00ff00' },
      { angle: 76, label: 'Yl', color: '#ffff00' },
    ];
    
    targets.forEach(target => {
      const angle = (target.angle - 90) * (Math.PI / 180);
      const x = centerX + Math.cos(angle) * radius * 0.75;
      const y = centerY + Math.sin(angle) * radius * 0.75;
      
      this.ctx.fillStyle = target.color;
      this.ctx.fillRect(x - 3, y - 3, 6, 6);
    });
    
    // Create accumulation buffer
    const buffer = new Uint32Array(this.canvas.width * this.canvas.height);
    
    // Plot pixels
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 4;
        const r = data[i] / 255;
        const g = data[i + 1] / 255;
        const b = data[i + 2] / 255;
        
        // Convert to YUV
        const y_val = 0.299 * r + 0.587 * g + 0.114 * b;
        const u = (b - y_val) * 0.565;
        const v = (r - y_val) * 0.713;
        
        // Map to scope coordinates
        const scopeX = Math.floor(centerX + u * radius);
        const scopeY = Math.floor(centerY - v * radius);
        
        if (scopeX >= 0 && scopeX < this.canvas.width && 
            scopeY >= 0 && scopeY < this.canvas.height) {
          buffer[scopeY * this.canvas.width + scopeX]++;
        }
      }
    }
    
    // Find max for normalization
    let maxValue = 0;
    for (let i = 0; i < buffer.length; i++) {
      if (buffer[i] > maxValue) maxValue = buffer[i];
    }
    
    // Draw vectorscope
    const imageDataOut = this.ctx.createImageData(this.canvas.width, this.canvas.height);
    for (let i = 0; i < buffer.length; i++) {
      const intensity = Math.min(255, (buffer[i] / maxValue) * 255);
      imageDataOut.data[i * 4] = 0;
      imageDataOut.data[i * 4 + 1] = intensity;
      imageDataOut.data[i * 4 + 2] = 0;
      imageDataOut.data[i * 4 + 3] = intensity > 0 ? 255 : 0;
    }
    
    this.ctx.putImageData(imageDataOut, 0, 0);
  }
  
  /**
   * Render RGB Parade
   */
  private renderParade(imageData: ImageData): void {
    this.clear();
    
    const { data, width, height } = imageData;
    const scopeWidth = this.canvas.width / 3;
    const scopeHeight = this.canvas.height;
    
    // Create buffers for R, G, B
    const buffers = [
      new Uint32Array(scopeWidth * scopeHeight),
      new Uint32Array(scopeWidth * scopeHeight),
      new Uint32Array(scopeWidth * scopeHeight),
    ];
    
    // Accumulate values
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 4;
        const channels = [data[i], data[i + 1], data[i + 2]];
        
        channels.forEach((value, channel) => {
          const scopeX = Math.floor((x / width) * scopeWidth);
          const scopeY = scopeHeight - 1 - Math.floor((value / 255) * scopeHeight);
          
          if (scopeX >= 0 && scopeX < scopeWidth && scopeY >= 0 && scopeY < scopeHeight) {
            buffers[channel][scopeY * scopeWidth + scopeX]++;
          }
        });
      }
    }
    
    // Find max values
    const maxValues = buffers.map(buffer => {
      let max = 0;
      for (let i = 0; i < buffer.length; i++) {
        if (buffer[i] > max) max = buffer[i];
      }
      return max;
    });
    
    // Draw parades
    const colors = [
      [255, 0, 0],    // Red
      [0, 255, 0],    // Green
      [0, 0, 255],    // Blue
    ];
    
    buffers.forEach((buffer, channel) => {
      const offsetX = channel * scopeWidth;
      const imageDataOut = this.ctx.createImageData(scopeWidth, scopeHeight);
      
      for (let i = 0; i < buffer.length; i++) {
        const intensity = Math.min(255, (buffer[i] / maxValues[channel]) * 255);
        imageDataOut.data[i * 4] = (colors[channel][0] * intensity) / 255;
        imageDataOut.data[i * 4 + 1] = (colors[channel][1] * intensity) / 255;
        imageDataOut.data[i * 4 + 2] = (colors[channel][2] * intensity) / 255;
        imageDataOut.data[i * 4 + 3] = 255;
      }
      
      this.ctx.putImageData(imageDataOut, offsetX, 0);
    });
    
    // Draw dividers
    this.ctx.strokeStyle = this.config.gridColor;
    this.ctx.lineWidth = 2;
    this.ctx.beginPath();
    this.ctx.moveTo(scopeWidth, 0);
    this.ctx.lineTo(scopeWidth, scopeHeight);
    this.ctx.moveTo(scopeWidth * 2, 0);
    this.ctx.lineTo(scopeWidth * 2, scopeHeight);
    this.ctx.stroke();
  }
  
  /**
   * Render Histogram
   */
  private renderHistogram(imageData: ImageData): void {
    this.clear();
    this.drawGrid();
    
    const { data } = imageData;
    const histograms = [
      new Uint32Array(256),  // Red
      new Uint32Array(256),  // Green
      new Uint32Array(256),  // Blue
      new Uint32Array(256),  // Luminance
    ];
    
    // Build histograms
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      
      histograms[0][r]++;
      histograms[1][g]++;
      histograms[2][b]++;
      
      const lum = Math.floor(0.2126 * r + 0.7152 * g + 0.0722 * b);
      histograms[3][lum]++;
    }
    
    // Find max value
    let maxValue = 0;
    for (let i = 0; i < 256; i++) {
      maxValue = Math.max(maxValue, histograms[0][i], histograms[1][i], histograms[2][i], histograms[3][i]);
    }
    
    // Draw histograms
    const colors = [
      'rgba(255, 0, 0, 0.5)',
      'rgba(0, 255, 0, 0.5)',
      'rgba(0, 0, 255, 0.5)',
      'rgba(255, 255, 255, 0.3)',
    ];
    
    const barWidth = this.canvas.width / 256;
    
    histograms.forEach((histogram, channel) => {
      this.ctx.fillStyle = colors[channel];
      
      for (let i = 0; i < 256; i++) {
        const height = (histogram[i] / maxValue) * this.canvas.height;
        const x = i * barWidth;
        const y = this.canvas.height - height;
        
        this.ctx.fillRect(x, y, barWidth, height);
      }
    });
  }
  
  /**
   * Render CIE Chromaticity Diagram
   */
  private renderCIEChromaticity(imageData: ImageData): void {
    this.clear();
    
    // Draw CIE 1931 chromaticity diagram outline
    // This is a simplified version
    const centerX = this.canvas.width / 2;
    const centerY = this.canvas.height / 2;
    const scale = Math.min(this.canvas.width, this.canvas.height) * 0.4;
    
    // Draw triangle for Rec.709 gamut
    this.ctx.strokeStyle = '#666666';
    this.ctx.lineWidth = 2;
    this.ctx.beginPath();
    
    const rec709 = [
      [0.64, 0.33],   // Red
      [0.30, 0.60],   // Green
      [0.15, 0.06],   // Blue
    ];
    
    rec709.forEach((point, i) => {
      const x = centerX + (point[0] - 0.33) * scale * 2;
      const y = centerY - (point[1] - 0.33) * scale * 2;
      
      if (i === 0) {
        this.ctx.moveTo(x, y);
      } else {
        this.ctx.lineTo(x, y);
      }
    });
    this.ctx.closePath();
    this.ctx.stroke();
    
    // Plot image colors
    // (Simplified - would need full XYZ conversion)
    this.ctx.fillStyle = 'rgba(0, 255, 0, 0.5)';
    this.ctx.fillRect(centerX - 2, centerY - 2, 4, 4);
  }
  
  /**
   * Update scope type
   */
  setScopeType(type: ScopeType): void {
    this.config.type = type;
  }
}

