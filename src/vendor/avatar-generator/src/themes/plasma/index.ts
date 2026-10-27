/**
 * Plasma theme
 * Classic plasma effect using combined sinusoids
 */

import {getCanvas} from '../../core/canvas.js';
import {SeededRandom} from '../../core/seededRandom.js';
import type {PlasmaOptions} from './types.js';
import {PlasmaRenderer} from './generator.js';

export type {PlasmaOptions} from './types.js';

/**
 * Generate a plasma pattern avatar
 */
export function generateAvatar(options: PlasmaOptions): HTMLCanvasElement {
    const {id, size, canvas: existingCanvas} = options;
    const {canvas, ctx} = getCanvas(size, existingCanvas);
    const random = new SeededRandom(id);

    const renderer = new PlasmaRenderer(random, options);
    renderer.render(ctx);

    return canvas as HTMLCanvasElement;
}
