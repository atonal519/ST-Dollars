/**
 * Plasma theme types
 * Classic plasma effect using sinusoids
 */

import type {GeneratorOptions} from '../../core/types.js';
import type {ColorOptions} from '../../core/colors.js';

/**
 * Plasma generator options
 */
export interface PlasmaOptions extends GeneratorOptions, ColorOptions {
    /** Time offset for animation (default: random) */
    timeOffset?: number;

    /** Scale factor for angled sinusoid (default: random 2-4) */
    scale1?: number;

    /** Scale factor for rotating sinusoid (default: random 2-4) */
    scale2?: number;

    /** Scale factor for concentric sinusoid (default: random 15-30) */
    scale3?: number;

    /** Weight for angled sinusoid (default: random 0.5-1.5) */
    weight1?: number;

    /** Weight for rotating sinusoid (default: random 0.5-1.5) */
    weight2?: number;

    /** Weight for concentric sinusoid (default: random 0.5-1.5) */
    weight3?: number;

    /** Number of colors in palette (default: 256) */
    paletteSize?: number;
}

/**
 * Default Plasma options
 */
export const DEFAULT_PLASMA_OPTIONS = {
    timeOffset: -1,      // -1 = random
    scale1: -1,          // -1 = random 2-4
    scale2: -1,          // -1 = random 2-4
    scale3: -1,          // -1 = random 15-30
    weight1: -1,         // -1 = random 0.5-1.5
    weight2: -1,         // -1 = random 0.5-1.5
    weight3: -1,         // -1 = random 0.5-1.5
    paletteSize: 256,
};
