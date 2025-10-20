/**
 * Cinematic Effects Shaders
 * Professional film emulation and cinematic effects
 */

/**
 * Film Grain Shader
 * Realistic film grain simulation with size and intensity control
 */
export const filmGrainShader = `#version 300 es
precision highp float;

in vec2 v_texCoord;
out vec4 fragColor;

uniform sampler2D u_image;
uniform float u_intensity;      // 0-1
uniform float u_size;           // Grain size
uniform float u_colorAmount;    // Color vs monochrome grain
uniform float u_time;           // For animation

// Pseudo-random function
float random(vec2 co) {
  return fract(sin(dot(co.xy, vec2(12.9898, 78.233))) * 43758.5453);
}

// Noise function
float noise(vec2 uv) {
  vec2 i = floor(uv);
  vec2 f = fract(uv);
  
  float a = random(i);
  float b = random(i + vec2(1.0, 0.0));
  float c = random(i + vec2(0.0, 1.0));
  float d = random(i + vec2(1.0, 1.0));
  
  vec2 u = f * f * (3.0 - 2.0 * f);
  
  return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
}

void main() {
  vec4 color = texture(u_image, v_texCoord);
  
  // Generate grain
  vec2 grainUV = v_texCoord * (1.0 / u_size) + u_time * 0.01;
  float grain = noise(grainUV) * 2.0 - 1.0;
  
  // Color grain (RGB channels with slight offset)
  vec3 colorGrain = vec3(
    noise(grainUV + vec2(0.1, 0.0)),
    noise(grainUV + vec2(0.0, 0.1)),
    noise(grainUV + vec2(0.1, 0.1))
  ) * 2.0 - 1.0;
  
  // Mix mono and color grain
  vec3 finalGrain = mix(vec3(grain), colorGrain, u_colorAmount);
  
  // Apply grain with intensity
  color.rgb += finalGrain * u_intensity;
  
  fragColor = vec4(clamp(color.rgb, 0.0, 1.0), color.a);
}
`;

/**
 * Halation Shader
 * Simulates light bleeding around bright areas (film characteristic)
 */
export const halationShader = `#version 300 es
precision highp float;

in vec2 v_texCoord;
out vec4 fragColor;

uniform sampler2D u_image;
uniform float u_intensity;      // 0-1
uniform float u_radius;         // Blur radius
uniform vec3 u_tint;           // Color tint for halation

// Gaussian blur weights
const float weights[5] = float[](0.227027, 0.1945946, 0.1216216, 0.054054, 0.016216);

vec3 gaussianBlur(sampler2D tex, vec2 uv, vec2 direction) {
  vec3 result = texture(tex, uv).rgb * weights[0];
  
  for (int i = 1; i < 5; i++) {
    vec2 offset = direction * float(i) * u_radius;
    result += texture(tex, uv + offset).rgb * weights[i];
    result += texture(tex, uv - offset).rgb * weights[i];
  }
  
  return result;
}

void main() {
  vec4 original = texture(u_image, v_texCoord);
  
  // Extract bright areas
  vec3 bright = max(original.rgb - 0.7, 0.0) * 3.0;
  
  // Blur bright areas horizontally
  vec3 blurH = gaussianBlur(u_image, v_texCoord, vec2(0.001, 0.0));
  
  // Blur vertically
  vec3 blurV = gaussianBlur(u_image, v_texCoord, vec2(0.0, 0.001));
  
  // Combine blurs
  vec3 halation = (blurH + blurV) * 0.5;
  
  // Apply tint
  halation *= u_tint;
  
  // Add halation to original
  vec3 result = original.rgb + halation * bright * u_intensity;
  
  fragColor = vec4(clamp(result, 0.0, 1.0), original.a);
}
`;

/**
 * Glow/Bloom Shader
 * Professional glow effect with threshold and intensity
 */
export const glowShader = `#version 300 es
precision highp float;

in vec2 v_texCoord;
out vec4 fragColor;

uniform sampler2D u_image;
uniform float u_threshold;      // Brightness threshold
uniform float u_intensity;      // Glow intensity
uniform float u_radius;         // Glow radius
uniform vec3 u_tint;           // Color tint

// Gaussian blur
vec3 gaussianBlur(sampler2D tex, vec2 uv, float radius) {
  vec3 result = vec3(0.0);
  float total = 0.0;
  
  for (float x = -4.0; x <= 4.0; x += 1.0) {
    for (float y = -4.0; y <= 4.0; y += 1.0) {
      vec2 offset = vec2(x, y) * radius * 0.001;
      float weight = exp(-(x*x + y*y) / 8.0);
      result += texture(tex, uv + offset).rgb * weight;
      total += weight;
    }
  }
  
  return result / total;
}

void main() {
  vec4 original = texture(u_image, v_texCoord);
  
  // Extract bright areas above threshold
  vec3 bright = max(original.rgb - u_threshold, 0.0);
  
  // Blur bright areas
  vec3 glow = gaussianBlur(u_image, v_texCoord, u_radius);
  
  // Apply threshold to glow
  glow = max(glow - u_threshold, 0.0);
  
  // Apply tint
  glow *= u_tint;
  
  // Add glow to original
  vec3 result = original.rgb + glow * u_intensity;
  
  fragColor = vec4(clamp(result, 0.0, 1.0), original.a);
}
`;

/**
 * Film Stock Emulation Shader
 * Emulates characteristics of specific film stocks
 */
export const filmStockShader = `#version 300 es
precision highp float;

in vec2 v_texCoord;
out vec4 fragColor;

uniform sampler2D u_image;
uniform int u_stockType;        // 0=Kodak Vision3, 1=Fuji Eterna, 2=Kodak Portra, etc
uniform float u_intensity;      // Mix amount

// Film response curves (simplified)
vec3 kodakVision3(vec3 color) {
  // Kodak Vision3 5219 characteristics
  // Slightly warm, high contrast in shadows
  color.r *= 1.05;
  color.b *= 0.98;
  
  // S-curve for contrast
  color = color / (color + 0.3);
  color = pow(color, vec3(1.1));
  
  return color;
}

vec3 fujiEterna(vec3 color) {
  // Fujifilm Eterna characteristics
  // Muted colors, lifted shadows
  color = mix(color, vec3(dot(color, vec3(0.299, 0.587, 0.114))), 0.15);
  color += 0.05; // Lift shadows
  
  // Reduce saturation slightly
  float lum = dot(color, vec3(0.299, 0.587, 0.114));
  color = mix(vec3(lum), color, 0.85);
  
  return color;
}

vec3 kodakPortra(vec3 color) {
  // Kodak Portra characteristics
  // Warm skin tones, pastel colors
  color.r *= 1.08;
  color.g *= 1.02;
  color.b *= 0.95;
  
  // Soft contrast
  color = pow(color, vec3(0.95));
  
  return color;
}

vec3 kodak2383(vec3 color) {
  // Kodak 2383 print film
  // Classic cinema look, crushed blacks
  color = pow(color, vec3(1.2));
  color *= 1.1;
  
  return color;
}

vec3 fujifilm250D(vec3 color) {
  // Fujifilm 250D
  // Vibrant colors, good for daylight
  float lum = dot(color, vec3(0.299, 0.587, 0.114));
  color = mix(vec3(lum), color, 1.15);
  
  return color;
}

void main() {
  vec4 texColor = texture(u_image, v_texCoord);
  vec3 color = texColor.rgb;
  vec3 processed = color;
  
  if (u_stockType == 0) {
    processed = kodakVision3(color);
  } else if (u_stockType == 1) {
    processed = fujiEterna(color);
  } else if (u_stockType == 2) {
    processed = kodakPortra(color);
  } else if (u_stockType == 3) {
    processed = kodak2383(color);
  } else if (u_stockType == 4) {
    processed = fujifilm250D(color);
  }
  
  // Mix with original based on intensity
  vec3 result = mix(color, processed, u_intensity);
  
  fragColor = vec4(clamp(result, 0.0, 1.0), texColor.a);
}
`;

/**
 * Chromatic Aberration Shader
 * Simulates lens chromatic aberration
 */
export const chromaticAberrationShader = `#version 300 es
precision highp float;

in vec2 v_texCoord;
out vec4 fragColor;

uniform sampler2D u_image;
uniform float u_intensity;      // Aberration amount
uniform vec2 u_direction;       // Direction of aberration

void main() {
  vec2 center = vec2(0.5, 0.5);
  vec2 offset = (v_texCoord - center) * u_intensity * u_direction;
  
  // Sample RGB channels with offset
  float r = texture(u_image, v_texCoord + offset).r;
  float g = texture(u_image, v_texCoord).g;
  float b = texture(u_image, v_texCoord - offset).b;
  float a = texture(u_image, v_texCoord).a;
  
  fragColor = vec4(r, g, b, a);
}
`;

/**
 * Vignette Shader
 * Professional vignette effect
 */
export const vignetteShader = `#version 300 es
precision highp float;

in vec2 v_texCoord;
out vec4 fragColor;

uniform sampler2D u_image;
uniform float u_intensity;      // Vignette strength
uniform float u_radius;         // Vignette size
uniform float u_softness;       // Edge softness
uniform vec3 u_color;          // Vignette color

void main() {
  vec4 texColor = texture(u_image, v_texCoord);
  
  // Calculate distance from center
  vec2 center = vec2(0.5, 0.5);
  float dist = distance(v_texCoord, center);
  
  // Create vignette mask
  float vignette = smoothstep(u_radius, u_radius - u_softness, dist);
  
  // Apply vignette
  vec3 result = mix(u_color, texColor.rgb, vignette);
  result = mix(texColor.rgb, result, u_intensity);
  
  fragColor = vec4(result, texColor.a);
}
`;

/**
 * LUT Application Shader
 * Applies 3D LUT for color grading
 */
export const lutShader = `#version 300 es
precision highp float;

in vec2 v_texCoord;
out vec4 fragColor;

uniform sampler2D u_image;
uniform sampler2D u_lut;        // 3D LUT as 2D texture
uniform float u_lutSize;        // LUT dimension (e.g., 32 for 32x32x32)
uniform float u_intensity;      // Mix amount

vec3 applyLUT(vec3 color, sampler2D lut, float lutSize) {
  // Scale color to LUT coordinates
  float scale = (lutSize - 1.0) / lutSize;
  float offset = 1.0 / (2.0 * lutSize);
  
  color = clamp(color, 0.0, 1.0);
  
  // Calculate LUT coordinates
  float blueSlice = floor(color.b * (lutSize - 1.0));
  float blueOffset = (blueSlice + offset) / lutSize;
  float blueOffset2 = (blueSlice + 1.0 + offset) / lutSize;
  
  vec2 uv1 = vec2(
    (color.r * scale + offset) / lutSize + blueOffset,
    color.g * scale + offset
  );
  
  vec2 uv2 = vec2(
    (color.r * scale + offset) / lutSize + blueOffset2,
    color.g * scale + offset
  );
  
  // Sample LUT
  vec3 color1 = texture(lut, uv1).rgb;
  vec3 color2 = texture(lut, uv2).rgb;
  
  // Interpolate between slices
  float blueBlend = fract(color.b * (lutSize - 1.0));
  return mix(color1, color2, blueBlend);
}

void main() {
  vec4 texColor = texture(u_image, v_texCoord);
  vec3 color = texColor.rgb;
  
  // Apply LUT
  vec3 graded = applyLUT(color, u_lut, u_lutSize);
  
  // Mix with original
  vec3 result = mix(color, graded, u_intensity);
  
  fragColor = vec4(result, texColor.a);
}
`;

/**
 * Film stock presets
 */
export const FILM_STOCKS = {
  KODAK_VISION3_5219: { id: 0, name: 'Kodak Vision3 5219', description: 'Modern cinema standard' },
  FUJI_ETERNA: { id: 1, name: 'Fujifilm Eterna', description: 'Muted, lifted shadows' },
  KODAK_PORTRA: { id: 2, name: 'Kodak Portra', description: 'Warm skin tones' },
  KODAK_2383: { id: 3, name: 'Kodak 2383', description: 'Classic print film' },
  FUJI_250D: { id: 4, name: 'Fujifilm 250D', description: 'Vibrant daylight' },
};

