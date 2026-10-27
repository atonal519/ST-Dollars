/**
 * Plasma avatar generator
 * Classic plasma effect using combined sinusoids
 */

import {SeededRandom} from '../../core/seededRandom.js';
import type {AvatarContext} from '../../core/types.js';
import type {PlasmaOptions} from './types.js';
import {DEFAULT_PLASMA_OPTIONS} from './types.js';
import {pickColors, interpolateColors, type Color} from '../../core/colors.js';

/**
 * Plasma renderer - generates classic plasma patterns
 */
export class PlasmaRenderer {
    private random: SeededRandom;
    private options: PlasmaOptions & typeof DEFAULT_PLASMA_OPTIONS;
    private palette: Color[];
    private time: number;
    private scale1: number;
    private scale2: number;
    private scale3: number;
    private angle1: number;
    private weight1: number;
    private weight2: number;
    private weight3: number;
    private zoom: number;

    constructor(random: SeededRandom, options: PlasmaOptions) {
        this.random = random;
        this.options = {...DEFAULT_PLASMA_OPTIONS, ...options};
        this.palette = [];
        this.time = 0;
        this.scale1 = 0;
        this.scale2 = 0;
        this.scale3 = 0;
        this.angle1 = 0;
        this.weight1 = 0;
        this.weight2 = 0;
        this.weight3 = 0;
        this.zoom = 1;
    }

    /**
     * Render avatar on canvas
     */
    render(ctx: AvatarContext): void {
        const {size, paletteSize} = this.options;
        let {timeOffset, scale1, scale2, scale3, weight1, weight2, weight3} = this.options;

        // Randomize parameters if set to -1
        if (timeOffset === -1) {
            this.time = this.random.randomFloat(0, Math.PI * 2);
        } else {
            this.time = timeOffset;
        }

        if (scale1 === -1) {
            this.scale1 = this.random.randomFloat(2, 4);
        } else {
            this.scale1 = scale1;
        }

        if (scale2 === -1) {
            this.scale2 = this.random.randomFloat(2, 4);
        } else {
            this.scale2 = scale2;
        }

        if (scale3 === -1) {
            this.scale3 = this.random.randomFloat(15, 30);
        } else {
            this.scale3 = scale3;
        }

        // Random angle for first sinusoid
        this.angle1 = this.random.randomFloat(0, Math.PI * 2);

        // Randomize weights if set to -1
        if (weight1 === -1) {
            this.weight1 = this.random.randomFloat(0.5, 1.5);
        } else {
            this.weight1 = weight1;
        }

        if (weight2 === -1) {
            this.weight2 = this.random.randomFloat(0.5, 1.5);
        } else {
            this.weight2 = weight2;
        }

        if (weight3 === -1) {
            this.weight3 = this.random.randomFloat(0.5, 1.5);
        } else {
            this.weight3 = weight3;
        }

        // Generate color palette
        this.generatePalette(paletteSize);

        // Create image data for pixel manipulation
        const imageData = ctx.createImageData(size, size);

        // Calculate plasma for each pixel
        for (let py = 0; py < size; py++) {
            for (let px = 0; px < size; px++) {
                // Convert pixel coordinates to -0.5 to 0.5 range
                const x = (px / size) - 0.5;
                const y = (py / size) - 0.5;

                // Calculate combined plasma value
                const plasmaValue = this.calculatePlasma(x * this.zoom, y * this.zoom);

                // Map to palette (normalize to 0-1 and then to palette index)
                const normalizedValue = (plasmaValue + 3) / 6; // Approx range -3 to 3
                const paletteIndex = Math.floor(normalizedValue * (paletteSize - 1)) % paletteSize;
                const color = this.palette[Math.max(0, Math.min(paletteSize - 1, paletteIndex))];

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
     * Generate color palette by interpolating between picked colors
     */
    private generatePalette(size: number): void {
        // Pick base colors (at least 2 for gradient)
        const baseColors = pickColors(this.options, this.random, Math.max(2, 3));

        this.palette = [];

        // Create looping palette by interpolating between colors
        for (let i = 0; i < size; i++) {
            const t = i / size;
            const scaledT = t * baseColors.length;
            const index1 = Math.floor(scaledT) % baseColors.length;
            const index2 = (index1 + 1) % baseColors.length;
            const localT = scaledT - Math.floor(scaledT);

            const color = interpolateColors(baseColors[index1], baseColors[index2], localT);
            this.palette.push(color);
        }
    }

    /**
     * Calculate plasma value at point (x, y)
     * Combines three types of sinusoids with weights
     */
    private calculatePlasma(x: number, y: number): number {
        // Type 1: Angled sinusoid with random direction
        const v1 = Math.sin(
            Math.PI * this.scale1 * (Math.cos(this.angle1) * x + Math.sin(this.angle1) * y) + this.time
        );

        // Type 2: Rotating diagonal sinusoid
        const angle = this.time / 2;
        const v2 = Math.sin(
            this.scale2 * (Math.PI * Math.sin(angle) * x + y * Math.cos(angle)) + this.time
        );

        // Type 3: Concentric sinusoid (Lissajous)
        const cx = x + 0.5 * Math.sin(this.time / 5);
        const cy = y + 0.5 * Math.cos(this.time / 3);
        const distance = Math.sqrt(cx * cx + cy * cy);
        const v3 = Math.sin(Math.sqrt(this.scale3 * distance * distance + 1) + this.time);

        // Combine with weights
        return this.weight1 * v1 + this.weight2 * v2 + this.weight3 * v3;
    }
}
