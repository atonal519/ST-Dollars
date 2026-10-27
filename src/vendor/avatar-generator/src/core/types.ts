/**
 * Core types for avatar generator
 */

import type {SeededRandom} from './seededRandom.js';

/**
 * Canvas type for browser and Node.js compatibility
 */
export type AvatarCanvas = HTMLCanvasElement | any; // 'any' for node-canvas type

/**
 * Canvas context type
 */
export type AvatarContext = CanvasRenderingContext2D | any;

/**
 * Base options for avatar generation
 */
export interface GeneratorOptions {
    /** Unique identifier (seed for random generation) */
    id: string;
    /** Canvas size in pixels (square) */
    size: number;
    /** Optional existing canvas to render into (if not provided, a new one will be created) */
    canvas?: AvatarCanvas;
}

/**
 * Generator interface for themes
 */
export interface AvatarGenerator<TOptions extends GeneratorOptions = GeneratorOptions> {
    /**
     * Generate avatar on canvas
     * @param options Generator options
     * @returns Canvas with generated avatar
     */
    generate(options: TOptions): AvatarCanvas;
}

/**
 * Generator render function type
 */
export type GeneratorRenderFunction<TOptions extends GeneratorOptions = GeneratorOptions> = (
    ctx: AvatarContext,
    random: SeededRandom,
    options: TOptions
) => void;
