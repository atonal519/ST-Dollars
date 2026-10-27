/**
 * Color utilities for avatar generation
 * Provides flexible color selection with palettes, gradients, and variations
 */

import {SeededRandom} from './seededRandom.js';

/**
 * Color value - hex string, CSS color, or RGB array
 */
export type ColorValue = string | [number, number, number];

/**
 * Color palette - single color, array of colors, or array of color arrays
 * Arrays support interpolation between colors
 */
export type ColorPalette =
    | ColorValue
    | ColorValue[]
    | ColorValue[][];

/**
 * Standard color options for themes
 */
export interface ColorOptions {
    /** Background color(s) - single color, array, or array of arrays */
    background?: ColorPalette;

    /** Foreground color(s) - single color, array, or array of arrays */
    foreground?: ColorPalette;

    /** Enable color interpolation for arrays (default: true) */
    interpolate?: boolean;

    /** Random hue variation in degrees 0-360 (default: 0) */
    hueVariation?: number;

    /** Random saturation variation 0-100 (default: 0) */
    saturationVariation?: number;

    /** Random lightness variation 0-100 (default: 0) */
    lightnessVariation?: number;
}

/**
 * Internal RGB color representation
 */
export interface Color {
    r: number; // 0-255
    g: number; // 0-255
    b: number; // 0-255
}

/**
 * Parse color value to RGB
 */
export function parseColor(value: ColorValue): Color {
    if (Array.isArray(value)) {
        return {r: value[0], g: value[1], b: value[2]};
    }

    // Parse hex color
    if (value.startsWith('#')) {
        const hex = value.slice(1);
        if (hex.length === 3) {
            return {
                r: parseInt(hex[0] + hex[0], 16),
                g: parseInt(hex[1] + hex[1], 16),
                b: parseInt(hex[2] + hex[2], 16),
            };
        }
        return {
            r: parseInt(hex.slice(0, 2), 16),
            g: parseInt(hex.slice(2, 4), 16),
            b: parseInt(hex.slice(4, 6), 16),
        };
    }

    // Parse rgb() or hsl() - basic implementation
    // For simplicity, just return a default if not recognized
    return {r: 128, g: 128, b: 128};
}

/**
 * Convert Color to CSS string
 */
export function colorToString(color: Color): string {
    return `rgb(${Math.round(color.r)}, ${Math.round(color.g)}, ${Math.round(color.b)})`;
}

/**
 * Convert RGB to HSL
 */
export function rgbToHsl(color: Color): { h: number; s: number; l: number } {
    const r = color.r / 255;
    const g = color.g / 255;
    const b = color.b / 255;

    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const l = (max + min) / 2;

    if (max === min) {
        return {h: 0, s: 0, l: l * 100};
    }

    const d = max - min;
    const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

    let h = 0;
    if (max === r) {
        h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
    } else if (max === g) {
        h = ((b - r) / d + 2) / 6;
    } else {
        h = ((r - g) / d + 4) / 6;
    }

    return {h: h * 360, s: s * 100, l: l * 100};
}

/**
 * Convert HSL to RGB
 */
export function hslToRgb(h: number, s: number, l: number): Color {
    h = h / 360;
    s = s / 100;
    l = l / 100;

    const hue2rgb = (p: number, q: number, t: number) => {
        if (t < 0) t += 1;
        if (t > 1) t -= 1;
        if (t < 1 / 6) return p + (q - p) * 6 * t;
        if (t < 1 / 2) return q;
        if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
        return p;
    };

    if (s === 0) {
        const gray = l * 255;
        return {r: gray, g: gray, b: gray};
    }

    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;

    return {
        r: hue2rgb(p, q, h + 1 / 3) * 255,
        g: hue2rgb(p, q, h) * 255,
        b: hue2rgb(p, q, h - 1 / 3) * 255,
    };
}

/**
 * Interpolate between two colors in RGB space
 */
export function interpolateColors(color1: Color, color2: Color, t: number): Color {
    return {
        r: color1.r + (color2.r - color1.r) * t,
        g: color1.g + (color2.g - color1.g) * t,
        b: color1.b + (color2.b - color1.b) * t,
    };
}

/**
 * Apply random variations to color
 */
export function varyColor(
    color: Color,
    random: SeededRandom,
    options: Pick<ColorOptions, 'hueVariation' | 'saturationVariation' | 'lightnessVariation'>
): Color {
    const {hueVariation = 0, saturationVariation = 0, lightnessVariation = 0} = options;

    if (hueVariation === 0 && saturationVariation === 0 && lightnessVariation === 0) {
        return color;
    }

    const hsl = rgbToHsl(color);

    if (hueVariation > 0) {
        hsl.h = (hsl.h + random.randomFloat(-hueVariation, hueVariation) + 360) % 360;
    }

    if (saturationVariation > 0) {
        hsl.s = Math.max(0, Math.min(100, hsl.s + random.randomFloat(-saturationVariation, saturationVariation)));
    }

    if (lightnessVariation > 0) {
        hsl.l = Math.max(0, Math.min(100, hsl.l + random.randomFloat(-lightnessVariation, lightnessVariation)));
    }

    return hslToRgb(hsl.h, hsl.s, hsl.l);
}

/**
 * Check if value is a single color (not an array of colors)
 */
function isSingleColor(value: any): boolean {
    if (typeof value === 'string') return true;
    if (Array.isArray(value) && value.length === 3 && typeof value[0] === 'number') return true;
    return false;
}

/**
 * Pick a single color from a palette
 */
function pickFromPalette(palette: ColorPalette, random: SeededRandom, interpolate: boolean): Color {
    // Single color
    if (isSingleColor(palette)) {
        return parseColor(palette as ColorValue);
    }

    // Check if array of arrays or array of colors
    if (Array.isArray(palette) && palette.length > 0) {
        const first = palette[0];

        // Array of arrays - pick random array
        if (Array.isArray(first)) {
            const colorArray = random.randomChoice(palette as ColorValue[][]) as ColorValue[];
            return pickFromColorArray(colorArray, random, interpolate);
        }

        // Array of colors
        return pickFromColorArray(palette as ColorValue[], random, interpolate);
    }

    // Fallback
    return {r: 128, g: 128, b: 128};
}

/**
 * Pick a color from an array of colors, with optional interpolation
 */
function pickFromColorArray(colors: ColorValue[], random: SeededRandom, interpolate: boolean): Color {
    if (colors.length === 0) {
        return {r: 128, g: 128, b: 128};
    }

    if (colors.length === 1 || !interpolate) {
        return parseColor(random.randomChoice(colors));
    }

    // Interpolate between two adjacent colors
    const index = random.randomInt(0, colors.length - 1);
    const color1 = parseColor(colors[index]);
    const color2 = parseColor(colors[(index + 1) % colors.length]);
    const t = random.random();

    return interpolateColors(color1, color2, t);
}

/**
 * Pick background color
 */
export function pickBackgroundColor(options: ColorOptions, random: SeededRandom): Color {
    const palette = options.background || '#ffffff';
    const interpolate = options.interpolate !== false; // default true
    const color = pickFromPalette(palette, random, interpolate);
    return varyColor(color, random, options);
}

/**
 * Pick foreground color
 */
export function pickForegroundColor(options: ColorOptions, random: SeededRandom): Color {
    const interpolate = options.interpolate !== false; // default true
    const color = options.foreground ? pickFromPalette(options.foreground, random, interpolate) : hslToRgb(
        random.randomFloat(0, 360),
        random.randomFloat(60, 90),
        random.randomFloat(40, 70)
    );
    return varyColor(color, random, options);
}

/**
 * Pick multiple colors from palette
 * @param count - Number of colors to pick
 * @param source - Pick from 'foreground' or 'background' (default: 'foreground')
 */
export function pickColors(
    options: ColorOptions,
    random: SeededRandom,
    count: number,
    source: 'foreground' | 'background' = 'foreground'
): Color[] {
    if (count === 1) return source === 'background' ? [pickBackgroundColor(options, random)] : [pickForegroundColor(options, random)];

    const palette = source === 'background' ? options.background : options.foreground;
    const interpolate = options.interpolate !== false;

    if (!palette) {
        // Generate contrasting colors
        return generateContrastingColors(random, count, options);
    }

    // Single color - generate variations
    if (isSingleColor(palette)) {
        const baseColor = parseColor(palette as ColorValue);
        return generateColorVariations(baseColor, random, count, options);
    }

    // Array check
    if (!Array.isArray(palette) || palette.length === 0) {
        return generateContrastingColors(random, count, options);
    }

    const first = palette[0];

    // Array of arrays - interpolate between arrays element-wise
    if (Array.isArray(first) && !isSingleColor(first)) {
        return pickColorsFromArrayOfArrays(palette as ColorValue[][], random, count, interpolate, options);
    }

    // Array of colors
    return pickColorsFromArray(palette as ColorValue[], random, count, interpolate, options);
}

/**
 * Pick colors from array of color arrays
 * Interpolates element-wise between two adjacent arrays
 */
function pickColorsFromArrayOfArrays(
    colorArrays: ColorValue[][],
    random: SeededRandom,
    count: number,
    interpolate: boolean,
    options: ColorOptions
): Color[] {
    if (colorArrays.length === 0) {
        return generateContrastingColors(random, count, options);
    }

    // Single array - use it directly
    if (colorArrays.length === 1) {
        return pickColorsFromArray(colorArrays[0], random, count, interpolate, options);
    }

    // No interpolation - pick one random array
    if (!interpolate) {
        const selectedArray = random.randomChoice(colorArrays);
        return pickColorsFromArray(selectedArray, random, count, false, options);
    }

    // With interpolation - pick two adjacent arrays and interpolate element-wise
    const idx1 = random.randomInt(0, colorArrays.length - 1);
    const idx2 = (idx1 + 1) % colorArrays.length;

    const array1 = colorArrays[idx1];
    const array2 = colorArrays[idx2];
    const t = random.random(); // Same t for all elements

    const result: Color[] = [];
    const maxLength = Math.max(array1.length, array2.length);

    for (let i = 0; i < count; i++) {
        // Get corresponding elements (circular if needed)
        const color1 = parseColor(array1[i % array1.length]);
        const color2 = parseColor(array2[i % array2.length]);

        // Interpolate with same t
        const interpolated = interpolateColors(color1, color2, t);
        result.push(varyColor(interpolated, random, options));
    }

    return result;
}

/**
 * Pick colors from a color array
 */
function pickColorsFromArray(
    colors: ColorValue[],
    random: SeededRandom,
    count: number,
    interpolate: boolean,
    options: ColorOptions
): Color[] {
    const result: Color[] = [];

    if (colors.length === 0) {
        return generateContrastingColors(random, count, options);
    }

    // Single color - generate variations
    if (colors.length === 1) {
        const baseColor = parseColor(colors[0]);
        return generateColorVariations(baseColor, random, count, options);
    }

    const randomOffset = random.randomInt(0, colors.length - 1);
    const t = random.random();

    // No interpolation - pick directly from array in order
    if (!interpolate) {
        for (let i = 0; i < count; i++) {
            const colorValue = colors[(i + randomOffset) % colors.length];
            result.push(varyColor(parseColor(colorValue), random, options));
        }
        return result;
    }

    // With interpolation - interpolate between two adjacent colors (circular)
    for (let i = 0; i < count; i++) {
        // Pick two adjacent indices (circular)
        const idx1 = (i + randomOffset) % colors.length;
        const idx2 = (idx1 + 1) % colors.length;

        const color1 = parseColor(colors[idx1]);
        const color2 = parseColor(colors[idx2]);

        result.push(varyColor(interpolateColors(color1, color2, t), random, options));
    }

    return result;
}

/**
 * Generate contrasting colors
 */
function generateContrastingColors(random: SeededRandom, count: number, options: ColorOptions): Color[] {
    const colors: Color[] = [];
    const baseHue = random.randomFloat(0, 360);
    const hueStep = 360 / count;

    for (let i = 0; i < count; i++) {
        const hue = (baseHue + i * hueStep) % 360;
        const color = hslToRgb(
            hue,
            random.randomFloat(60, 90),
            random.randomFloat(40, 70)
        );
        colors.push(varyColor(color, random, options));
    }

    return colors;
}

/**
 * Generate variations of a single color
 */
function generateColorVariations(baseColor: Color, random: SeededRandom, count: number, options: ColorOptions): Color[] {
    const colors: Color[] = [];
    const hsl = rgbToHsl(baseColor);

    for (let i = 0; i < count; i++) {
        const hueShift = (i - Math.floor(count / 2)) * 30;
        const newHue = (hsl.h + hueShift + 360) % 360;
        const color = hslToRgb(newHue, hsl.s, hsl.l);
        colors.push(varyColor(color, random, options));
    }

    return colors;
}
