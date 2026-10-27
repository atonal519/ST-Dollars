/**
 * Interference avatar generator
 * Creates wave interference patterns
 */

import {SeededRandom} from '../../core/seededRandom.js';
import type {AvatarContext} from '../../core/types.js';
import type {InterferenceOptions} from './types.js';
import {DEFAULT_INTERFERENCE_OPTIONS} from './types.js';
import {pickColors, colorToString, interpolateColors, type Color} from '../../core/colors.js';

/**
 * Source point for wave generation
 */
interface SourcePoint {
    x: number;
    y: number;
}

/**
 * Interference renderer - generates wave interference patterns
 */
export class InterferenceRenderer {
    private random: SeededRandom;
    private options: InterferenceOptions & typeof DEFAULT_INTERFERENCE_OPTIONS;
    private sourcePoints: SourcePoint[];
    private colors: Color[];

    constructor(random: SeededRandom, options: InterferenceOptions) {
        this.random = random;
        this.options = {...DEFAULT_INTERFERENCE_OPTIONS, ...options};
        this.sourcePoints = [];
        this.colors = [];
    }

    /**
     * Render avatar on canvas
     */
    render(ctx: AvatarContext): void {
        const {size, wavelength, sourceArea} = this.options;
        let {sources} = this.options;

        // If sources is -1, pick random number between 2-5
        if (sources === -1) {
            sources = this.random.randomInt(2, 5);
        }

        // Pick two colors for interpolation
        this.colors = pickColors(this.options, this.random, 2);

        // Generate random source points
        this.generateSourcePoints(sources, sourceArea);

        // Create image data for pixel manipulation
        const imageData = ctx.createImageData(size, size);

        // Calculate interference pattern for each pixel
        for (let py = 0; py < size; py++) {
            for (let px = 0; px < size; px++) {
                // Convert pixel coordinates to world coordinates (-1 to 1)
                const x = (px / size) * 2 - 1;
                const y = (py / size) * 2 - 1;

                // Calculate interference value
                const interferenceValue = this.calculateInterference(x, y, wavelength);

                // Normalize to 0-1 range
                const maxValue = sources * sources;
                const normalizedValue = Math.min(1, interferenceValue / maxValue);

                // Interpolate between colors
                const color = interpolateColors(this.colors[0], this.colors[1], normalizedValue);

                // Set pixel color
                const index = (py * size + px) * 4;
                imageData.data[index] = color.r;
                imageData.data[index + 1] = color.g;
                imageData.data[index + 2] = color.b;
                imageData.data[index + 3] = 255; // Alpha
            }
        }

        // Put image data to canvas
        ctx.putImageData(imageData, 0, 0);
    }

    /**
     * Generate random source points
     */
    private generateSourcePoints(count: number, area: number): void {
        this.sourcePoints = [];
        for (let i = 0; i < count; i++) {
            this.sourcePoints.push({
                x: this.random.randomFloat(-area, area),
                y: this.random.randomFloat(-area, area),
            });
        }
    }

    /**
     * Calculate interference pattern at point (x, y)
     */
    private calculateInterference(x: number, y: number, wavelength: number): number {
        const {sourceDistance} = this.options;
        let sum = 0;

        // Calculate contribution from each source
        for (const source of this.sourcePoints) {
            // Calculate distance to source using Pythagoras
            const dx = x - source.x;
            const dy = y - source.y;
            const distance = Math.sqrt(dx * dx + dy * dy + sourceDistance * sourceDistance);

            // Calculate wave value: sin(distance / wavelength * 2π)
            const phase = (distance / wavelength) * Math.PI * 2;
            const wave = Math.sin(phase);

            // Add to sum
            sum += wave;
        }

        // Return squared sum (interference pattern)
        return sum * sum;
    }
}
