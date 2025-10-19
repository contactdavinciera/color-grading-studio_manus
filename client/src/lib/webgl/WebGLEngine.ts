/**
 * WebGL Engine for Real-time Color Grading
 * Core rendering engine that processes images through shader pipelines
 */

export interface WebGLEngineOptions {
  canvas: HTMLCanvasElement;
  preserveDrawingBuffer?: boolean;
}

export class WebGLEngine {
  private canvas: HTMLCanvasElement;
  private gl: WebGL2RenderingContext;
  private framebuffers: WebGLFramebuffer[] = [];
  private textures: WebGLTexture[] = [];
  private currentProgram: WebGLProgram | null = null;
  
  // Quad vertices for full-screen rendering
  private quadBuffer: WebGLBuffer | null = null;
  
  constructor(options: WebGLEngineOptions) {
    this.canvas = options.canvas;
    
    const gl = this.canvas.getContext('webgl2', {
      premultipliedAlpha: false,
      preserveDrawingBuffer: options.preserveDrawingBuffer ?? true,
      antialias: false,
      depth: false,
      stencil: false,
    });
    
    if (!gl) {
      throw new Error('WebGL2 not supported');
    }
    
    this.gl = gl;
    this.initializeQuad();
  }
  
  /**
   * Initialize full-screen quad for rendering
   */
  private initializeQuad(): void {
    const vertices = new Float32Array([
      -1, -1,  0, 0,
       1, -1,  1, 0,
      -1,  1,  0, 1,
       1,  1,  1, 1,
    ]);
    
    this.quadBuffer = this.gl.createBuffer();
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.quadBuffer);
    this.gl.bufferData(this.gl.ARRAY_BUFFER, vertices, this.gl.STATIC_DRAW);
  }
  
  /**
   * Create and compile shader
   */
  createShader(type: number, source: string): WebGLShader {
    const shader = this.gl.createShader(type);
    if (!shader) {
      throw new Error('Failed to create shader');
    }
    
    this.gl.shaderSource(shader, source);
    this.gl.compileShader(shader);
    
    if (!this.gl.getShaderParameter(shader, this.gl.COMPILE_STATUS)) {
      const info = this.gl.getShaderInfoLog(shader);
      this.gl.deleteShader(shader);
      throw new Error(`Shader compilation failed: ${info}`);
    }
    
    return shader;
  }
  
  /**
   * Create shader program from vertex and fragment shaders
   */
  createProgram(vertexSource: string, fragmentSource: string): WebGLProgram {
    const vertexShader = this.createShader(this.gl.VERTEX_SHADER, vertexSource);
    const fragmentShader = this.createShader(this.gl.FRAGMENT_SHADER, fragmentSource);
    
    const program = this.gl.createProgram();
    if (!program) {
      throw new Error('Failed to create program');
    }
    
    this.gl.attachShader(program, vertexShader);
    this.gl.attachShader(program, fragmentShader);
    this.gl.linkProgram(program);
    
    if (!this.gl.getProgramParameter(program, this.gl.LINK_STATUS)) {
      const info = this.gl.getProgramInfoLog(program);
      this.gl.deleteProgram(program);
      throw new Error(`Program linking failed: ${info}`);
    }
    
    // Clean up shaders after linking
    this.gl.deleteShader(vertexShader);
    this.gl.deleteShader(fragmentShader);
    
    return program;
  }
  
  /**
   * Create texture from image or video element
   */
  createTexture(source: TexImageSource, options?: {
    wrapS?: number;
    wrapT?: number;
    minFilter?: number;
    magFilter?: number;
  }): WebGLTexture {
    const texture = this.gl.createTexture();
    if (!texture) {
      throw new Error('Failed to create texture');
    }
    
    this.gl.bindTexture(this.gl.TEXTURE_2D, texture);
    
    // Set texture parameters
    const wrapS = options?.wrapS ?? this.gl.CLAMP_TO_EDGE;
    const wrapT = options?.wrapT ?? this.gl.CLAMP_TO_EDGE;
    const minFilter = options?.minFilter ?? this.gl.LINEAR;
    const magFilter = options?.magFilter ?? this.gl.LINEAR;
    
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_S, wrapS);
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_T, wrapT);
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MIN_FILTER, minFilter);
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MAG_FILTER, magFilter);
    
    // Upload texture data
    this.gl.texImage2D(
      this.gl.TEXTURE_2D,
      0,
      this.gl.RGBA,
      this.gl.RGBA,
      this.gl.UNSIGNED_BYTE,
      source
    );
    
    this.textures.push(texture);
    return texture;
  }
  
  /**
   * Create empty texture for render targets
   */
  createEmptyTexture(width: number, height: number): WebGLTexture {
    const texture = this.gl.createTexture();
    if (!texture) {
      throw new Error('Failed to create texture');
    }
    
    this.gl.bindTexture(this.gl.TEXTURE_2D, texture);
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_S, this.gl.CLAMP_TO_EDGE);
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_T, this.gl.CLAMP_TO_EDGE);
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MIN_FILTER, this.gl.LINEAR);
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MAG_FILTER, this.gl.LINEAR);
    
    this.gl.texImage2D(
      this.gl.TEXTURE_2D,
      0,
      this.gl.RGBA16F,
      width,
      height,
      0,
      this.gl.RGBA,
      this.gl.FLOAT,
      null
    );
    
    this.textures.push(texture);
    return texture;
  }
  
  /**
   * Create framebuffer for render-to-texture
   */
  createFramebuffer(texture: WebGLTexture): WebGLFramebuffer {
    const framebuffer = this.gl.createFramebuffer();
    if (!framebuffer) {
      throw new Error('Failed to create framebuffer');
    }
    
    this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, framebuffer);
    this.gl.framebufferTexture2D(
      this.gl.FRAMEBUFFER,
      this.gl.COLOR_ATTACHMENT0,
      this.gl.TEXTURE_2D,
      texture,
      0
    );
    
    const status = this.gl.checkFramebufferStatus(this.gl.FRAMEBUFFER);
    if (status !== this.gl.FRAMEBUFFER_COMPLETE) {
      throw new Error(`Framebuffer incomplete: ${status}`);
    }
    
    this.framebuffers.push(framebuffer);
    return framebuffer;
  }
  
  /**
   * Render with a specific program
   */
  render(
    program: WebGLProgram,
    uniforms: Record<string, any>,
    framebuffer: WebGLFramebuffer | null = null
  ): void {
    this.gl.useProgram(program);
    this.currentProgram = program;
    
    // Bind framebuffer (null for screen)
    this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, framebuffer);
    
    // Set viewport
    if (framebuffer) {
      // For framebuffer, we'll track dimensions separately or use canvas size
      this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    } else {
      this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    }
    
    // Set uniforms
    this.setUniforms(program, uniforms);
    
    // Bind quad buffer
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.quadBuffer);
    
    const positionLoc = this.gl.getAttribLocation(program, 'a_position');
    const texCoordLoc = this.gl.getAttribLocation(program, 'a_texCoord');
    
    if (positionLoc !== -1) {
      this.gl.enableVertexAttribArray(positionLoc);
      this.gl.vertexAttribPointer(positionLoc, 2, this.gl.FLOAT, false, 16, 0);
    }
    
    if (texCoordLoc !== -1) {
      this.gl.enableVertexAttribArray(texCoordLoc);
      this.gl.vertexAttribPointer(texCoordLoc, 2, this.gl.FLOAT, false, 16, 8);
    }
    
    // Draw
    this.gl.drawArrays(this.gl.TRIANGLE_STRIP, 0, 4);
  }
  
  /**
   * Set uniforms for current program
   */
  private setUniforms(program: WebGLProgram, uniforms: Record<string, any>): void {
    let textureUnit = 0;
    
    for (const [name, value] of Object.entries(uniforms)) {
      const location = this.gl.getUniformLocation(program, name);
      if (!location) continue;
      
      if (value instanceof WebGLTexture) {
        this.gl.activeTexture(this.gl.TEXTURE0 + textureUnit);
        this.gl.bindTexture(this.gl.TEXTURE_2D, value);
        this.gl.uniform1i(location, textureUnit);
        textureUnit++;
      } else if (typeof value === 'number') {
        this.gl.uniform1f(location, value);
      } else if (Array.isArray(value)) {
        switch (value.length) {
          case 2:
            this.gl.uniform2fv(location, value);
            break;
          case 3:
            this.gl.uniform3fv(location, value);
            break;
          case 4:
            this.gl.uniform4fv(location, value);
            break;
          case 9:
            this.gl.uniformMatrix3fv(location, false, value);
            break;
          case 16:
            this.gl.uniformMatrix4fv(location, false, value);
            break;
        }
      }
    }
  }
  
  /**
   * Resize canvas and update viewport
   */
  resize(width: number, height: number): void {
    this.canvas.width = width;
    this.canvas.height = height;
    this.gl.viewport(0, 0, width, height);
  }
  
  /**
   * Clean up resources
   */
  dispose(): void {
    this.textures.forEach(texture => this.gl.deleteTexture(texture));
    this.framebuffers.forEach(fb => this.gl.deleteFramebuffer(fb));
    if (this.quadBuffer) {
      this.gl.deleteBuffer(this.quadBuffer);
    }
    
    this.textures = [];
    this.framebuffers = [];
    this.quadBuffer = null;
    this.currentProgram = null;
  }
  
  getContext(): WebGL2RenderingContext {
    return this.gl;
  }
  
  getCanvas(): HTMLCanvasElement {
    return this.canvas;
  }
}

