/**
 * CIEDE2000 perceptual color distance.
 * Converts sRGB → CIELab → ΔE*00 for human-perception-accurate color matching.
 * Reference: Sharma, Wu, Dalal (2005) "The CIEDE2000 Color-Difference Formula"
 */

export interface Lab {
  L: number;
  a: number;
  b: number;
}

export interface RGB {
  r: number;
  g: number;
  b: number;
}

/** sRGB (0-1) → linear RGB → XYZ (D65) → CIELab */
export function srgbToLab(r: number, g: number, b: number): Lab {
  // sRGB to linear
  const linearize = (c: number) => c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  const lr = linearize(r);
  const lg = linearize(g);
  const lb = linearize(b);

  // Linear RGB to XYZ (D65 reference white)
  const x = (lr * 0.4124564 + lg * 0.3575761 + lb * 0.1804375) / 0.95047;
  const y = (lr * 0.2126729 + lg * 0.7151522 + lb * 0.0721750);
  const z = (lr * 0.0193339 + lg * 0.1191920 + lb * 0.9503041) / 1.08883;

  // XYZ to Lab
  const f = (t: number) => t > 0.008856 ? Math.cbrt(t) : (7.787 * t) + 16 / 116;
  const fx = f(x);
  const fy = f(y);
  const fz = f(z);

  return {
    L: 116 * fy - 16,
    a: 500 * (fx - fy),
    b: 200 * (fy - fz),
  };
}

/** CIEDE2000 ΔE*00 — perceptual color difference */
export function ciede2000(lab1: Lab, lab2: Lab): number {
  const { L: L1, a: a1, b: b1 } = lab1;
  const { L: L2, a: a2, b: b2 } = lab2;

  const kL = 1, kC = 1, kH = 1;

  const C1 = Math.sqrt(a1 * a1 + b1 * b1);
  const C2 = Math.sqrt(a2 * a2 + b2 * b2);
  const Cab = (C1 + C2) / 2;

  const Cab7 = Math.pow(Cab, 7);
  const G = 0.5 * (1 - Math.sqrt(Cab7 / (Cab7 + 6103515625))); // 25^7

  const a1p = a1 * (1 + G);
  const a2p = a2 * (1 + G);

  const C1p = Math.sqrt(a1p * a1p + b1 * b1);
  const C2p = Math.sqrt(a2p * a2p + b2 * b2);

  const h1p = Math.atan2(b1, a1p) * 180 / Math.PI;
  const h2p = Math.atan2(b2, a2p) * 180 / Math.PI;
  const h1pn = ((h1p % 360) + 360) % 360;
  const h2pn = ((h2p % 360) + 360) % 360;

  const dLp = L2 - L1;
  const dCp = C2p - C1p;

  let dhp: number;
  if (C1p * C2p === 0) {
    dhp = 0;
  } else if (Math.abs(h2pn - h1pn) <= 180) {
    dhp = h2pn - h1pn;
  } else if (h2pn - h1pn > 180) {
    dhp = h2pn - h1pn - 360;
  } else {
    dhp = h2pn - h1pn + 360;
  }

  const dHp = 2 * Math.sqrt(C1p * C2p) * Math.sin(dhp * Math.PI / 360);

  const Lp = (L1 + L2) / 2;
  const Cp = (C1p + C2p) / 2;

  let hp: number;
  if (C1p * C2p === 0) {
    hp = h1pn + h2pn;
  } else if (Math.abs(h1pn - h2pn) <= 180) {
    hp = (h1pn + h2pn) / 2;
  } else if (h1pn + h2pn < 360) {
    hp = (h1pn + h2pn + 360) / 2;
  } else {
    hp = (h1pn + h2pn - 360) / 2;
  }

  const T = 1
    - 0.17 * Math.cos((hp - 30) * Math.PI / 180)
    + 0.24 * Math.cos((2 * hp) * Math.PI / 180)
    + 0.32 * Math.cos((3 * hp + 6) * Math.PI / 180)
    - 0.20 * Math.cos((4 * hp - 63) * Math.PI / 180);

  const SL = 1 + 0.015 * Math.pow(Lp - 50, 2) / Math.sqrt(20 + Math.pow(Lp - 50, 2));
  const SC = 1 + 0.045 * Cp;
  const SH = 1 + 0.015 * Cp * T;

  const Cp7 = Math.pow(Cp, 7);
  const RT = -2 * Math.sqrt(Cp7 / (Cp7 + 6103515625))
    * Math.sin(60 * Math.exp(-Math.pow((hp - 275) / 25, 2)) * Math.PI / 180);

  const dE = Math.sqrt(
    Math.pow(dLp / (kL * SL), 2) +
    Math.pow(dCp / (kC * SC), 2) +
    Math.pow(dHp / (kH * SH), 2) +
    RT * (dCp / (kC * SC)) * (dHp / (kH * SH))
  );

  return dE;
}

/** Composite foreground color with alpha over a background */
export function compositeAlpha(fg: RGB, alpha: number, bg: RGB): RGB {
  return {
    r: fg.r * alpha + bg.r * (1 - alpha),
    g: fg.g * alpha + bg.g * (1 - alpha),
    b: fg.b * alpha + bg.b * (1 - alpha),
  };
}
