/**
 * WebGL Shaders for Color Grading
 * Collection of vertex and fragment shaders for various color operations
 */

/**
 * Basic vertex shader for full-screen quad rendering
 */
export const vertexShader = `#version 300 es
precision highp float;

in vec2 a_position;
in vec2 a_texCoord;

out vec2 v_texCoord;

void main() {
  gl_Position = vec4(a_position, 0.0, 1.0);
  v_texCoord = a_texCoord;
}
`;

/**
 * Passthrough fragment shader
 */
export const passthroughShader = `#version 300 es
precision highp float;

in vec2 v_texCoord;
out vec4 fragColor;

uniform sampler2D u_image;

void main() {
  fragColor = texture(u_image, v_texCoord);
}
`;

/**
 * Primary color correction shader (Lift, Gamma, Gain)
 */
export const primaryColorShader = `#version 300 es
precision highp float;

in vec2 v_texCoord;
out vec4 fragColor;

uniform sampler2D u_image;

// Color wheels
uniform vec3 u_lift;      // Shadows
uniform vec3 u_gamma;     // Midtones
uniform vec3 u_gain;      // Highlights
uniform vec3 u_offset;    // Overall offset

// Master controls
uniform float u_liftMaster;
uniform float u_gammaMaster;
uniform float u_gainMaster;
uniform float u_offsetMaster;

// Primary adjustments
uniform float u_contrast;
uniform float u_saturation;
uniform float u_hue;
uniform float u_temperature;
uniform float u_tint;
uniform float u_exposure;
uniform float u_highlights;
uniform float u_shadows;
uniform float u_whites;
uniform float u_blacks;

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

// Apply lift, gamma, gain
vec3 applyLGG(vec3 color) {
  // Lift (shadows) - adds offset to dark areas
  vec3 lifted = color + (u_lift * (1.0 - color) * u_liftMaster);
  
  // Gamma (midtones) - power function
  vec3 gammaAdjusted = pow(max(lifted, vec3(0.0)), vec3(1.0) / (u_gamma * u_gammaMaster + vec3(1.0)));
  
  // Gain (highlights) - multiplies bright areas
  vec3 gained = gammaAdjusted * (vec3(1.0) + u_gain * u_gainMaster);
  
  // Offset - overall shift
  vec3 result = gained + u_offset * u_offsetMaster;
  
  return result;
}

// Apply contrast
vec3 applyContrast(vec3 color, float contrast) {
  return (color - 0.5) * (1.0 + contrast) + 0.5;
}

// Apply temperature and tint
vec3 applyTemperatureTint(vec3 color, float temp, float tint) {
  // Temperature: blue to orange
  color.r += temp * 0.1;
  color.b -= temp * 0.1;
  
  // Tint: green to magenta
  color.g += tint * 0.1;
  
  return color;
}

// Apply exposure
vec3 applyExposure(vec3 color, float exposure) {
  return color * pow(2.0, exposure);
}

// Apply highlights and shadows
vec3 applyHighlightsShadows(vec3 color, float highlights, float shadows) {
  float luminance = dot(color, vec3(0.299, 0.587, 0.114));
  
  // Shadows affect dark areas
  float shadowMask = 1.0 - smoothstep(0.0, 0.5, luminance);
  color += shadowMask * shadows * 0.1;
  
  // Highlights affect bright areas
  float highlightMask = smoothstep(0.5, 1.0, luminance);
  color += highlightMask * highlights * 0.1;
  
  return color;
}

// Apply whites and blacks (clip points)
vec3 applyWhitesBlacks(vec3 color, float whites, float blacks) {
  // Blacks - adjust lower clip point
  color = (color - blacks * 0.1) / (1.0 - blacks * 0.1);
  
  // Whites - adjust upper clip point
  color = color / (1.0 + whites * 0.1);
  
  return color;
}

void main() {
  vec4 texColor = texture(u_image, v_texCoord);
  vec3 color = texColor.rgb;
  
  // Apply exposure first
  color = applyExposure(color, u_exposure);
  
  // Apply lift, gamma, gain
  color = applyLGG(color);
  
  // Apply contrast
  color = applyContrast(color, u_contrast);
  
  // Apply temperature and tint
  color = applyTemperatureTint(color, u_temperature, u_tint);
  
  // Apply highlights and shadows
  color = applyHighlightsShadows(color, u_highlights, u_shadows);
  
  // Apply whites and blacks
  color = applyWhitesBlacks(color, u_whites, u_blacks);
  
  // Apply saturation
  vec3 hsv = rgb2hsv(color);
  hsv.y *= (1.0 + u_saturation);
  
  // Apply hue shift
  hsv.x = fract(hsv.x + u_hue / 360.0);
  
  color = hsv2rgb(hsv);
  
  // Clamp to valid range
  color = clamp(color, 0.0, 1.0);
  
  fragColor = vec4(color, texColor.a);
}
`;

/**
 * Curves shader for custom tone mapping
 */
export const curvesShader = `#version 300 es
precision highp float;

in vec2 v_texCoord;
out vec4 fragColor;

uniform sampler2D u_image;
uniform sampler2D u_curveLUT;  // 1D LUT texture for curve

uniform int u_curveType;  // 0=RGB, 1=Red, 2=Green, 3=Blue, 4=Luminance

vec3 applyCurve(vec3 color, int channel) {
  if (channel == 0) {
    // RGB - apply to all channels
    return vec3(
      texture(u_curveLUT, vec2(color.r, 0.5)).r,
      texture(u_curveLUT, vec2(color.g, 0.5)).r,
      texture(u_curveLUT, vec2(color.b, 0.5)).r
    );
  } else if (channel == 1) {
    // Red only
    color.r = texture(u_curveLUT, vec2(color.r, 0.5)).r;
    return color;
  } else if (channel == 2) {
    // Green only
    color.g = texture(u_curveLUT, vec2(color.g, 0.5)).r;
    return color;
  } else if (channel == 3) {
    // Blue only
    color.b = texture(u_curveLUT, vec2(color.b, 0.5)).r;
    return color;
  } else if (channel == 4) {
    // Luminance
    float lum = dot(color, vec3(0.299, 0.587, 0.114));
    float newLum = texture(u_curveLUT, vec2(lum, 0.5)).r;
    return color * (newLum / max(lum, 0.001));
  }
  return color;
}

void main() {
  vec4 texColor = texture(u_image, v_texCoord);
  vec3 color = texColor.rgb;
  
  color = applyCurve(color, u_curveType);
  
  fragColor = vec4(clamp(color, 0.0, 1.0), texColor.a);
}
`;

/**
 * Hue vs Hue/Sat/Lum curves shader
 */
export const hueVsShader = `#version 300 es
precision highp float;

in vec2 v_texCoord;
out vec4 fragColor;

uniform sampler2D u_image;
uniform sampler2D u_hueCurveLUT;  // Curve lookup texture

uniform int u_curveMode;  // 0=HueVsHue, 1=HueVsSat, 2=HueVsLum

// RGB to HSV
vec3 rgb2hsv(vec3 c) {
  vec4 K = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
  vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
  vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
  
  float d = q.x - min(q.w, q.y);
  float e = 1.0e-10;
  return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + e)), d / (q.x + e), q.x);
}

// HSV to RGB
vec3 hsv2rgb(vec3 c) {
  vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
  vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
  return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}

void main() {
  vec4 texColor = texture(u_image, v_texCoord);
  vec3 color = texColor.rgb;
  vec3 hsv = rgb2hsv(color);
  
  // Sample curve based on hue
  float curveValue = texture(u_hueCurveLUT, vec2(hsv.x, 0.5)).r;
  
  if (u_curveMode == 0) {
    // Hue vs Hue
    hsv.x = curveValue;
  } else if (u_curveMode == 1) {
    // Hue vs Sat
    hsv.y = curveValue;
  } else if (u_curveMode == 2) {
    // Hue vs Lum
    hsv.z = curveValue;
  }
  
  color = hsv2rgb(hsv);
  
  fragColor = vec4(clamp(color, 0.0, 1.0), texColor.a);
}
`;

/**
 * Qualifier shader for secondary color correction
 */
export const qualifierShader = `#version 300 es
precision highp float;

in vec2 v_texCoord;
out vec4 fragColor;

uniform sampler2D u_image;

// Qualifier ranges
uniform vec2 u_hueRange;        // min, max (0-1)
uniform vec2 u_satRange;        // min, max (0-1)
uniform vec2 u_lumRange;        // min, max (0-1)

uniform float u_hueSoftness;
uniform float u_satSoftness;
uniform float u_lumSoftness;

uniform bool u_invertMask;

// RGB to HSV
vec3 rgb2hsv(vec3 c) {
  vec4 K = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
  vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
  vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
  
  float d = q.x - min(q.w, q.y);
  float e = 1.0e-10;
  return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + e)), d / (q.x + e), q.x);
}

// Smooth range mask
float rangeMask(float value, vec2 range, float softness) {
  float center = (range.x + range.y) * 0.5;
  float width = (range.y - range.x) * 0.5;
  float dist = abs(value - center);
  
  return 1.0 - smoothstep(width, width + softness, dist);
}

// Circular hue range (handles wrap-around)
float hueRangeMask(float hue, vec2 range, float softness) {
  float center = (range.x + range.y) * 0.5;
  float width = (range.y - range.x) * 0.5;
  
  // Handle wrap-around
  float dist = abs(hue - center);
  if (dist > 0.5) {
    dist = 1.0 - dist;
  }
  
  return 1.0 - smoothstep(width, width + softness, dist);
}

void main() {
  vec4 texColor = texture(u_image, v_texCoord);
  vec3 hsv = rgb2hsv(texColor.rgb);
  
  // Calculate masks for each component
  float hueMask = hueRangeMask(hsv.x, u_hueRange, u_hueSoftness);
  float satMask = rangeMask(hsv.y, u_satRange, u_satSoftness);
  float lumMask = rangeMask(hsv.z, u_lumRange, u_lumSoftness);
  
  // Combine masks
  float mask = hueMask * satMask * lumMask;
  
  if (u_invertMask) {
    mask = 1.0 - mask;
  }
  
  // Output mask as grayscale
  fragColor = vec4(vec3(mask), 1.0);
}
`;

/**
 * Chroma key shader
 */
export const chromaKeyShader = `#version 300 es
precision highp float;

in vec2 v_texCoord;
out vec4 fragColor;

uniform sampler2D u_image;
uniform vec3 u_keyColor;        // Key color in RGB
uniform float u_threshold;      // Color similarity threshold
uniform float u_smoothness;     // Edge smoothness
uniform float u_spillSuppression; // Spill suppression amount

// RGB to HSV
vec3 rgb2hsv(vec3 c) {
  vec4 K = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
  vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
  vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
  
  float d = q.x - min(q.w, q.y);
  float e = 1.0e-10;
  return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + e)), d / (q.x + e), q.x);
}

// Color distance in RGB space
float colorDistance(vec3 c1, vec3 c2) {
  vec3 diff = c1 - c2;
  return length(diff);
}

// Spill suppression
vec3 suppressSpill(vec3 color, vec3 keyColor, float amount) {
  vec3 keyHSV = rgb2hsv(keyColor);
  vec3 colorHSV = rgb2hsv(color);
  
  // Reduce saturation of colors similar to key
  float hueDiff = abs(colorHSV.x - keyHSV.x);
  if (hueDiff > 0.5) hueDiff = 1.0 - hueDiff;
  
  float spillMask = 1.0 - smoothstep(0.0, 0.2, hueDiff);
  colorHSV.y *= 1.0 - (spillMask * amount);
  
  // Convert back to RGB
  vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
  vec3 p = abs(fract(colorHSV.xxx + K.xyz) * 6.0 - K.www);
  return colorHSV.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), colorHSV.y);
}

void main() {
  vec4 texColor = texture(u_image, v_texCoord);
  vec3 color = texColor.rgb;
  
  // Calculate color distance from key
  float dist = colorDistance(color, u_keyColor);
  
  // Generate alpha mask
  float alpha = smoothstep(u_threshold, u_threshold + u_smoothness, dist);
  
  // Apply spill suppression
  if (u_spillSuppression > 0.0) {
    color = suppressSpill(color, u_keyColor, u_spillSuppression);
  }
  
  fragColor = vec4(color, alpha * texColor.a);
}
`;

