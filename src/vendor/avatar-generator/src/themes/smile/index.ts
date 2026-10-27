/**
 * Smile theme
 * Cheerful smiley face avatar generator
 */

import {getCanvas} from '../../core/canvas.js';
import {SeededRandom} from '../../core/seededRandom.js';
import type {SmileOptions} from './types.js';
import {SmileRenderer} from './generator.js';

export type {SmileOptions} from './types.js';

/**
 * Generate a smile avatar
 */
export function generateAvatar(options: SmileOptions): HTMLCanvasElement {
    const {id, size, canvas: existingCanvas} = options;
    const {canvas, ctx} = getCanvas(size, existingCanvas);
    const random = new SeededRandom(id);

    const renderer = new SmileRenderer(random, options);
    renderer.render(ctx);

    return canvas as HTMLCanvasElement;
}
