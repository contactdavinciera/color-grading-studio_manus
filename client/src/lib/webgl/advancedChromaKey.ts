/**
 * Advanced Chroma Key Shader (Fusion-level quality)
 * Professional keying with edge refinement and spill suppression
 */

export const advancedChromaKeyShader = `#version 300 es
precision highp float;

in vec2 v_texCoord;
out vec4 fragColor;

uniform sampler2D u_image;

// Key color selection
uniform vec3 u_keyColor;        // RGB key color
uniform float u_hueRange;       // Hue tolerance
uniform float u_satRange;       // Saturation tolerance
uniform float u_lumRange;       // Luminance tolerance

// Core keying
uniform float u_threshold;      // Main threshold
uniform float u_tolerance;      // Softness
uniform float u_edgeThin;       // Edge thinning
uniform float u_edgeFeather;    // Edge softness

// Spill suppression
uniform float u_spillSuppress;  // Spill suppression amount
uniform float u_despillBias;    // Despill bias
uniform vec3 u_despillColor;    // Replacement color for spill

// Matte refinement
uniform float u_matteBlur;      // Matte blur amount
uniform float u_matteContrast;  // Matte contrast
uniform float u_matteGamma;     // Matte gamma
uniform float u_matteClipBlack; // Clip black point
uniform float u_matteClipWhite; // Clip white point

// Edge refinement
uniform bool u_edgeRefine;      // Enable edge refinement
uniform float u_edgeRadius;     // Edge detection radius

// RGB to HSV conversion
vec3 rgb2hsv(vec3 c) {
  vec4 K = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
  vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
  vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
  
  float d = q.x - min(q.w, q.y);
  float e = 1.0e-10;
  return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + e)), d / (q.x + e), q.x);
}

// HSV to RGB conversion
vec3 hsv2rgb(vec3 c) {
  vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
  vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
  return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}

// Calculate color distance in HSV space
float colorDistance(vec3 color, vec3 keyColor) {
  vec3 colorHSV = rgb2hsv(color);
  vec3 keyHSV = rgb2hsv(keyColor);
  
  // Hue distance (circular)
  float hueDist = abs(colorHSV.x - keyHSV.x);
  if (hueDist > 0.5) hueDist = 1.0 - hueDist;
  hueDist = hueDist / u_hueRange;
  
  // Saturation distance
  float satDist = abs(colorHSV.y - keyHSV.y) / u_satRange;
  
  // Luminance distance
  float lumDist = abs(colorHSV.z - keyHSV.z) / u_lumRange;
  
  // Combined distance
  return sqrt(hueDist * hueDist + satDist * satDist + lumDist * lumDist);
}

// Generate base alpha mask
float generateAlpha(vec3 color) {
  float dist = colorDistance(color, u_keyColor);
  
  // Smooth threshold
  float alpha = smoothstep(u_threshold - u_tolerance, u_threshold + u_tolerance, dist);
  
  return alpha;
}

// Edge detection for refinement
float detectEdge(sampler2D tex, vec2 uv, float radius) {
  float edge = 0.0;
  float total = 0.0;
  
  for (float x = -1.0; x <= 1.0; x += 1.0) {
    for (float y = -1.0; y <= 1.0; y += 1.0) {
      vec2 offset = vec2(x, y) * radius * 0.001;
      vec3 sample = texture(tex, uv + offset).rgb;
      float sampleAlpha = generateAlpha(sample);
      edge += abs(sampleAlpha - generateAlpha(texture(tex, uv).rgb));
      total += 1.0;
    }
  }
  
  return edge / total;
}

// Spill suppression
vec3 suppressSpill(vec3 color, float alpha) {
  vec3 keyHSV = rgb2hsv(u_keyColor);
  vec3 colorHSV = rgb2hsv(color);
  
  // Calculate spill amount
  float hueDiff = abs(colorHSV.x - keyHSV.x);
  if (hueDiff > 0.5) hueDiff = 1.0 - hueDiff;
  
  float spillMask = 1.0 - smoothstep(0.0, 0.2, hueDiff);
  spillMask *= (1.0 - alpha); // Only affect keyed areas
  
  // Reduce saturation of spill
  colorHSV.y *= 1.0 - (spillMask * u_spillSuppress);
  
  // Shift hue away from key
  if (u_despillBias > 0.0) {
    float hueShift = spillMask * u_despillBias * 0.1;
    colorHSV.x = fract(colorHSV.x + hueShift);
  }
  
  // Replace with despill color
  vec3 despilled = hsv2rgb(colorHSV);
  despilled = mix(despilled, u_despillColor, spillMask * u_despillBias);
  
  return despilled;
}

// Matte refinement
float refineMatte(float alpha) {
  // Apply contrast
  alpha = (alpha - 0.5) * (1.0 + u_matteContrast) + 0.5;
  
  // Apply gamma
  alpha = pow(max(alpha, 0.0), u_matteGamma);
  
  // Clip black and white points
  alpha = (alpha - u_matteClipBlack) / (u_matteClipWhite - u_matteClipBlack);
  
  return clamp(alpha, 0.0, 1.0);
}

// Edge thinning/growing
float adjustEdge(float alpha, float amount) {
  if (amount > 0.0) {
    // Thin (erode)
    alpha = pow(alpha, 1.0 + amount);
  } else if (amount < 0.0) {
    // Grow (dilate)
    alpha = 1.0 - pow(1.0 - alpha, 1.0 - amount);
  }
  return alpha;
}

void main() {
  vec4 texColor = texture(u_image, v_texCoord);
  vec3 color = texColor.rgb;
  
  // Generate base alpha
  float alpha = generateAlpha(color);
  
  // Edge refinement
  if (u_edgeRefine) {
    float edge = detectEdge(u_image, v_texCoord, u_edgeRadius);
    
    // Soften edges
    alpha = mix(alpha, smoothstep(0.3, 0.7, alpha), edge * u_edgeFeather);
  }
  
  // Edge thinning/growing
  alpha = adjustEdge(alpha, u_edgeThin);
  
  // Matte refinement
  alpha = refineMatte(alpha);
  
  // Spill suppression
  if (u_spillSuppress > 0.0) {
    color = suppressSpill(color, alpha);
  }
  
  fragColor = vec4(color, alpha * texColor.a);
}
`;

/**
 * Garbage Matte Shader
 * For excluding areas from keying
 */
export const garbageMatteShader = `#version 300 es
precision highp float;

in vec2 v_texCoord;
out vec4 fragColor;

uniform sampler2D u_image;
uniform sampler2D u_matte;      // Garbage matte texture
uniform bool u_invert;          // Invert matte

void main() {
  vec4 texColor = texture(u_image, v_texCoord);
  float matte = texture(u_matte, v_texCoord).r;
  
  if (u_invert) {
    matte = 1.0 - matte;
  }
  
  fragColor = vec4(texColor.rgb, texColor.a * matte);
}
`;

/**
 * Core Matte Shader
 * Creates a core matte (guaranteed opaque areas)
 */
export const coreMatteShader = `#version 300 es
precision highp float;

in vec2 v_texCoord;
out vec4 fragColor;

uniform sampler2D u_image;
uniform vec3 u_keyColor;
uniform float u_coreThreshold;  // Stricter threshold for core

// RGB to HSV
vec3 rgb2hsv(vec3 c) {
  vec4 K = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
  vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
  vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
  
  float d = q.x - min(q.w, q.y);
  float e = 1.0e-10;
  return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + e)), d / (q.x + e), q.x);
}

float colorDistance(vec3 color, vec3 keyColor) {
  vec3 diff = color - keyColor;
  return length(diff);
}

void main() {
  vec4 texColor = texture(u_image, v_texCoord);
  
  float dist = colorDistance(texColor.rgb, u_keyColor);
  
  // Core matte is 1.0 for definitely foreground, 0.0 for definitely background
  float core = 1.0 - smoothstep(u_coreThreshold * 0.5, u_coreThreshold, dist);
  
  fragColor = vec4(vec3(core), 1.0);
}
`;

/**
 * Chroma key presets
 */
export interface ChromaKeyPreset {
  name: string;
  keyColor: [number, number, number];
  threshold: number;
  tolerance: number;
  spillSuppress: number;
}

export const CHROMA_KEY_PRESETS: Record<string, ChromaKeyPreset> = {
  GREEN_SCREEN: {
    name: 'Green Screen',
    keyColor: [0, 177, 64],
    threshold: 0.3,
    tolerance: 0.1,
    spillSuppress: 0.5,
  },
  BLUE_SCREEN: {
    name: 'Blue Screen',
    keyColor: [0, 71, 187],
    threshold: 0.3,
    tolerance: 0.1,
    spillSuppress: 0.5,
  },
  GREEN_SCREEN_BRIGHT: {
    name: 'Green Screen (Bright)',
    keyColor: [0, 255, 0],
    threshold: 0.25,
    tolerance: 0.15,
    spillSuppress: 0.6,
  },
  BLUE_SCREEN_DARK: {
    name: 'Blue Screen (Dark)',
    keyColor: [0, 0, 128],
    threshold: 0.35,
    tolerance: 0.12,
    spillSuppress: 0.4,
  },
};

