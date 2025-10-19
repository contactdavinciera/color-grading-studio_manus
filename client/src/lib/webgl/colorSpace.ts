/**
 * Color Space Conversion System
 * Handles conversions between different color spaces and gamma curves
 * Supports: sRGB, Rec.709, Rec.2020, DCI-P3, HDR (PQ/ST.2084, HLG), Dolby Vision
 */

/**
 * Color space definitions
 */
export enum ColorSpace {
  SRGB = 'sRGB',
  REC709 = 'Rec.709',
  REC2020 = 'Rec.2020',
  DCIP3 = 'DCI-P3',
  ACES = 'ACES',
}

export enum TransferFunction {
  SRGB = 'sRGB',
  LINEAR = 'Linear',
  REC709 = 'Rec.709',
  PQ = 'PQ',           // Perceptual Quantizer (ST.2084) for HDR
  HLG = 'HLG',         // Hybrid Log-Gamma for HDR
  LOG = 'Log',
  DOLBY_PQ = 'Dolby PQ',
}

/**
 * Color space primaries (chromaticity coordinates)
 */
export const ColorPrimaries = {
  [ColorSpace.SRGB]: {
    red: [0.64, 0.33],
    green: [0.30, 0.60],
    blue: [0.15, 0.06],
    white: [0.3127, 0.3290], // D65
  },
  [ColorSpace.REC709]: {
    red: [0.64, 0.33],
    green: [0.30, 0.60],
    blue: [0.15, 0.06],
    white: [0.3127, 0.3290], // D65
  },
  [ColorSpace.REC2020]: {
    red: [0.708, 0.292],
    green: [0.170, 0.797],
    blue: [0.131, 0.046],
    white: [0.3127, 0.3290], // D65
  },
  [ColorSpace.DCIP3]: {
    red: [0.680, 0.320],
    green: [0.265, 0.690],
    blue: [0.150, 0.060],
    white: [0.3127, 0.3290], // D65
  },
};

/**
 * Generate WebGL shader code for color space conversion
 */
export function generateColorSpaceShader(
  sourceSpace: ColorSpace,
  targetSpace: ColorSpace,
  sourceTransfer: TransferFunction,
  targetTransfer: TransferFunction
): string {
  return `#version 300 es
precision highp float;

in vec2 v_texCoord;
out vec4 fragColor;

uniform sampler2D u_image;
uniform float u_exposure;  // HDR exposure adjustment

// ============= Transfer Functions =============

// sRGB EOTF (Electro-Optical Transfer Function)
vec3 srgb_to_linear(vec3 color) {
  vec3 linear;
  for (int i = 0; i < 3; i++) {
    if (color[i] <= 0.04045) {
      linear[i] = color[i] / 12.92;
    } else {
      linear[i] = pow((color[i] + 0.055) / 1.055, 2.4);
    }
  }
  return linear;
}

// sRGB inverse EOTF
vec3 linear_to_srgb(vec3 color) {
  vec3 srgb;
  for (int i = 0; i < 3; i++) {
    if (color[i] <= 0.0031308) {
      srgb[i] = color[i] * 12.92;
    } else {
      srgb[i] = 1.055 * pow(color[i], 1.0 / 2.4) - 0.055;
    }
  }
  return srgb;
}

// Rec.709 EOTF (same as sRGB for practical purposes)
vec3 rec709_to_linear(vec3 color) {
  return srgb_to_linear(color);
}

vec3 linear_to_rec709(vec3 color) {
  return linear_to_srgb(color);
}

// PQ (Perceptual Quantizer) ST.2084 EOTF for HDR
vec3 pq_to_linear(vec3 pq) {
  const float m1 = 0.1593017578125;      // 2610 / 16384
  const float m2 = 78.84375;              // 2523 / 32
  const float c1 = 0.8359375;             // 3424 / 4096
  const float c2 = 18.8515625;            // 2413 / 128
  const float c3 = 18.6875;               // 2392 / 128
  
  vec3 linear;
  for (int i = 0; i < 3; i++) {
    float Np = pow(pq[i], 1.0 / m2);
    float num = max(Np - c1, 0.0);
    float den = c2 - c3 * Np;
    linear[i] = pow(num / den, 1.0 / m1);
  }
  
  // Scale to 10000 nits reference
  return linear * 10000.0;
}

// PQ inverse EOTF
vec3 linear_to_pq(vec3 linear) {
  const float m1 = 0.1593017578125;
  const float m2 = 78.84375;
  const float c1 = 0.8359375;
  const float c2 = 18.8515625;
  const float c3 = 18.6875;
  
  // Normalize to 10000 nits
  linear = linear / 10000.0;
  
  vec3 pq;
  for (int i = 0; i < 3; i++) {
    float Y = pow(linear[i], m1);
    float num = c1 + c2 * Y;
    float den = 1.0 + c3 * Y;
    pq[i] = pow(num / den, m2);
  }
  
  return pq;
}

// HLG (Hybrid Log-Gamma) EOTF
vec3 hlg_to_linear(vec3 hlg) {
  const float a = 0.17883277;
  const float b = 0.28466892;
  const float c = 0.55991073;
  
  vec3 linear;
  for (int i = 0; i < 3; i++) {
    if (hlg[i] <= 0.5) {
      linear[i] = pow(hlg[i], 2.0) / 3.0;
    } else {
      linear[i] = (exp((hlg[i] - c) / a) + b) / 12.0;
    }
  }
  
  return linear;
}

// HLG inverse EOTF
vec3 linear_to_hlg(vec3 linear) {
  const float a = 0.17883277;
  const float b = 0.28466892;
  const float c = 0.55991073;
  
  vec3 hlg;
  for (int i = 0; i < 3; i++) {
    if (linear[i] <= 1.0 / 12.0) {
      hlg[i] = sqrt(3.0 * linear[i]);
    } else {
      hlg[i] = a * log(12.0 * linear[i] - b) + c;
    }
  }
  
  return hlg;
}

// ============= Color Space Matrices =============

// sRGB/Rec.709 to XYZ
mat3 srgb_to_xyz = mat3(
  0.4124564, 0.3575761, 0.1804375,
  0.2126729, 0.7151522, 0.0721750,
  0.0193339, 0.1191920, 0.9503041
);

// XYZ to sRGB/Rec.709
mat3 xyz_to_srgb = mat3(
   3.2404542, -1.5371385, -0.4985314,
  -0.9692660,  1.8760108,  0.0415560,
   0.0556434, -0.2040259,  1.0572252
);

// Rec.2020 to XYZ
mat3 rec2020_to_xyz = mat3(
  0.6369580, 0.1446169, 0.1688810,
  0.2627002, 0.6779981, 0.0593017,
  0.0000000, 0.0280727, 1.0609851
);

// XYZ to Rec.2020
mat3 xyz_to_rec2020 = mat3(
   1.7166512, -0.3556708, -0.2533663,
  -0.6666844,  1.6164812,  0.0157685,
   0.0176399, -0.0427706,  0.9421031
);

// DCI-P3 to XYZ (D65 white point)
mat3 dcip3_to_xyz = mat3(
  0.4865709, 0.2656677, 0.1982173,
  0.2289746, 0.6917385, 0.0792869,
  0.0000000, 0.0451134, 1.0439444
);

// XYZ to DCI-P3
mat3 xyz_to_dcip3 = mat3(
   2.4934969, -0.9313836, -0.4027108,
  -0.8294890,  1.7626641,  0.0236247,
   0.0358458, -0.0761724,  0.9568845
);

// ============= Main Conversion =============

vec3 convertColorSpace(vec3 color) {
  // Step 1: Convert from source transfer function to linear
  ${getTransferToLinear(sourceTransfer)}
  
  // Step 2: Convert from source color space to XYZ
  ${getColorSpaceToXYZ(sourceSpace)}
  
  // Step 3: Convert from XYZ to target color space
  ${getXYZToColorSpace(targetSpace)}
  
  // Step 4: Apply exposure adjustment for HDR
  color *= u_exposure;
  
  // Step 5: Convert from linear to target transfer function
  ${getLinearToTransfer(targetTransfer)}
  
  return clamp(color, 0.0, 1.0);
}

void main() {
  vec4 texColor = texture(u_image, v_texCoord);
  vec3 color = texColor.rgb;
  
  color = convertColorSpace(color);
  
  fragColor = vec4(color, texColor.a);
}
`;
}

function getTransferToLinear(transfer: TransferFunction): string {
  switch (transfer) {
    case TransferFunction.SRGB:
      return 'color = srgb_to_linear(color);';
    case TransferFunction.REC709:
      return 'color = rec709_to_linear(color);';
    case TransferFunction.PQ:
    case TransferFunction.DOLBY_PQ:
      return 'color = pq_to_linear(color);';
    case TransferFunction.HLG:
      return 'color = hlg_to_linear(color);';
    case TransferFunction.LINEAR:
      return '// Already linear';
    default:
      return 'color = srgb_to_linear(color);';
  }
}

function getLinearToTransfer(transfer: TransferFunction): string {
  switch (transfer) {
    case TransferFunction.SRGB:
      return 'color = linear_to_srgb(color);';
    case TransferFunction.REC709:
      return 'color = linear_to_rec709(color);';
    case TransferFunction.PQ:
    case TransferFunction.DOLBY_PQ:
      return 'color = linear_to_pq(color);';
    case TransferFunction.HLG:
      return 'color = linear_to_hlg(color);';
    case TransferFunction.LINEAR:
      return '// Keep linear';
    default:
      return 'color = linear_to_srgb(color);';
  }
}

function getColorSpaceToXYZ(space: ColorSpace): string {
  switch (space) {
    case ColorSpace.SRGB:
    case ColorSpace.REC709:
      return 'color = srgb_to_xyz * color;';
    case ColorSpace.REC2020:
      return 'color = rec2020_to_xyz * color;';
    case ColorSpace.DCIP3:
      return 'color = dcip3_to_xyz * color;';
    default:
      return 'color = srgb_to_xyz * color;';
  }
}

function getXYZToColorSpace(space: ColorSpace): string {
  switch (space) {
    case ColorSpace.SRGB:
    case ColorSpace.REC709:
      return 'color = xyz_to_srgb * color;';
    case ColorSpace.REC2020:
      return 'color = xyz_to_rec2020 * color;';
    case ColorSpace.DCIP3:
      return 'color = xyz_to_dcip3 * color;';
    default:
      return 'color = xyz_to_srgb * color;';
  }
}

/**
 * Color space conversion presets
 */
export const ColorSpacePresets = {
  // SDR workflows
  'sRGB': {
    space: ColorSpace.SRGB,
    transfer: TransferFunction.SRGB,
    exposure: 1.0,
  },
  'Rec.709': {
    space: ColorSpace.REC709,
    transfer: TransferFunction.REC709,
    exposure: 1.0,
  },
  
  // HDR workflows
  'HDR10 (Rec.2020 PQ)': {
    space: ColorSpace.REC2020,
    transfer: TransferFunction.PQ,
    exposure: 1.0,
  },
  'HDR10+ (Rec.2020 PQ)': {
    space: ColorSpace.REC2020,
    transfer: TransferFunction.PQ,
    exposure: 1.0,
  },
  'Dolby Vision (Rec.2020 PQ)': {
    space: ColorSpace.REC2020,
    transfer: TransferFunction.DOLBY_PQ,
    exposure: 1.0,
  },
  'HLG (Rec.2020 HLG)': {
    space: ColorSpace.REC2020,
    transfer: TransferFunction.HLG,
    exposure: 1.0,
  },
  
  // Cinema
  'DCI-P3': {
    space: ColorSpace.DCIP3,
    transfer: TransferFunction.SRGB,
    exposure: 1.0,
  },
  'DCI-P3 PQ': {
    space: ColorSpace.DCIP3,
    transfer: TransferFunction.PQ,
    exposure: 1.0,
  },
};

/**
 * Get common conversion pairs
 */
export function getCommonConversions() {
  return [
    { name: 'SDR to HDR10', source: 'sRGB', target: 'HDR10 (Rec.2020 PQ)' },
    { name: 'SDR to Dolby Vision', source: 'sRGB', target: 'Dolby Vision (Rec.2020 PQ)' },
    { name: 'HDR10 to SDR', source: 'HDR10 (Rec.2020 PQ)', target: 'sRGB' },
    { name: 'Rec.709 to Rec.2020', source: 'Rec.709', target: 'HDR10 (Rec.2020 PQ)' },
    { name: 'DCI-P3 to Rec.709', source: 'DCI-P3', target: 'Rec.709' },
  ];
}

