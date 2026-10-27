/**
 * Seeded random number generator for deterministic avatar generation
 * Uses MurmurHash3 for seed and LCG for random numbers
 */

/**
 * MurmurHash3 32-bit hash function
 */
function murmurhash3(str: string): number {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < str.length; i++) {
        h = Math.imul(h ^ str.charCodeAt(i), 16777619);
    }
    h += h << 13;
    h ^= h >>> 7;
    h += h << 3;
    h ^= h >>> 17;
    h += h << 5;
    return h >>> 0;
}

/**
 * Linear Congruential Generator (LCG)
 * Parameters based on Numerical Recipes
 */
export class SeededRandom {
    private seed: number;
    private state: number;

    constructor(seed: string | number) {
        this.seed = typeof seed === 'string' ? murmurhash3(seed) : seed;
        this.state = this.seed;
    }

    /**
     * Generate random number between 0 and 1 (exclusive)
     */
    random(): number {
        this.state = (this.state * 1664525 + 1013904223) >>> 0;
        return this.state / 0x100000000;
    }

    /**
     * Generate random integer between min (inclusive) and max (exclusive)
     */
    randomInt(min: number, max: number): number {
        return Math.floor(this.random() * (max - min)) + min;
    }

    /**
     * Generate random float between min and max
     */
    randomFloat(min: number, max: number): number {
        return this.random() * (max - min) + min;
    }

    /**
     * Choose random element from array
     */
    randomChoice<T>(array: T[]): T {
        return array[this.randomInt(0, array.length)];
    }

    /**
     * Generate random boolean with optional probability
     */
    randomBoolean(probability = 0.5): boolean {
        return this.random() < probability;
    }

    /**
     * Generate random HSL color
     */
    randomColor(options: {
        hue?: [number, number];
        saturation?: [number, number];
        lightness?: [number, number];
    } = {}): string {
        const hue = options.hue
            ? this.randomInt(options.hue[0], options.hue[1])
            : this.randomInt(0, 360);

        const saturation = options.saturation
            ? this.randomInt(options.saturation[0], options.saturation[1])
            : this.randomInt(50, 100);

        const lightness = options.lightness
            ? this.randomInt(options.lightness[0], options.lightness[1])
            : this.randomInt(40, 70);

        return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
    }

    /**
     * Generate random RGB color
     */
    randomRGB(): string {
        const r = this.randomInt(0, 256);
        const g = this.randomInt(0, 256);
        const b = this.randomInt(0, 256);
        return `rgb(${r}, ${g}, ${b})`;
    }

    /**
     * Reset seed to original value
     */
    reset(): void {
        this.state = this.seed;
    }
}
