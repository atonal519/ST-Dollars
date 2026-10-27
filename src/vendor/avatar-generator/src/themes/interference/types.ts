/**
 * Interference theme types
 * Wave interference pattern generator
 */

import type {GeneratorOptions} from '../../core/types.js';
import type {ColorOptions} from '../../core/colors.js';

/**
 * Interference generator options
 */
export interface InterferenceOptions extends GeneratorOptions, ColorOptions {
    /** Number of wave source points (default: -1 for random 2-5, or specify exact number) */
    sources?: number;

    /** Wave length (default: 1) */
    wavelength?: number;

    /** Source point area bounds (default: 10) */
    sourceArea?: number;

    /** Distance scaling factor (default: 1) */
    sourceDistance?: number;
}

/**
 * Default Interference options
 */
export const DEFAULT_INTERFERENCE_OPTIONS = {
    sources: -1, // Random 2-5
    wavelength: 1,
    sourceArea: 10,
    sourceDistance: 1,
};
