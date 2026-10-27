/**
 * Interference theme
 * Wave interference pattern generator
 */

import {getCanvas} from '../../core/canvas.js';
import {SeededRandom} from '../../core/seededRandom.js';
import type {InterferenceOptions} from './types.js';
import {InterferenceRenderer} from './generator.js';

export type {InterferenceOptions} from './types.js';

/**
 * Generate an interference pattern avatar
 */
export function generateAvatar(options: InterferenceOptions): HTMLCanvasElement {
    const {id, size, canvas: existingCanvas} = options;
    const {canvas, ctx} = getCanvas(size, existingCanvas);
    const random = new SeededRandom(id);

    const renderer = new InterferenceRenderer(random, options);
    renderer.render(ctx);

    return canvas as HTMLCanvasElement;
}
