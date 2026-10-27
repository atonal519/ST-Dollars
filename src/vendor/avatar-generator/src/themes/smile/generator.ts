/**
 * Smile avatar generator
 * Draws a cheerful smiley face on a colored background
 */

import {SeededRandom} from '../../core/seededRandom.js';
import type {AvatarContext} from '../../core/types.js';
import type {SmileOptions} from './types.js';
import {DEFAULT_SMILE_OPTIONS} from './types.js';
import {pickColors, colorToString, type Color, pickBackgroundColor} from '../../core/colors.js';

/**
 * Smile renderer - generates a cheerful smiley face
 */
export class SmileRenderer {
    private random: SeededRandom;
    private options: SmileOptions & typeof DEFAULT_SMILE_OPTIONS;
    private faceColor0: string;
    private faceColor1: string;
    private backgroundColor: string;
    private featureColor: string; // Color for eyes and mouth

    constructor(random: SeededRandom, options: SmileOptions) {
        this.random = random;
        this.options = {...DEFAULT_SMILE_OPTIONS, ...options};
        this.faceColor0 = '';
        this.faceColor1 = '';
        this.backgroundColor = '';
        this.featureColor = '#000000';
    }

    /**
     * Render avatar on canvas
     */
    render(ctx: AvatarContext): void {
        const {size} = this.options;

        // Pick two colors: background and face
        const colors = pickColors(this.options, new SeededRandom(this.options.id + ":colors"), 2);
        this.faceColor0 = colorToString(colors[0]);
        this.faceColor1 = colorToString(colors[1]);
        this.backgroundColor = colorToString(pickBackgroundColor(this.options, this.random));

        // Determine feature color based on face color luminance
        this.featureColor = this.isDarkColor(colors[1]) ? this.backgroundColor : '#000000';

        // Fill the entire canvas with the background color
        ctx.fillStyle = this.backgroundColor;
        ctx.fillRect(0, 0, size, size);

        const radius = Math.ceil(size / 2);

        ctx.fillStyle = this.faceColor0;
        ctx.beginPath();
        ctx.arc(size / 2, size / 2, radius, 0, Math.PI * 2);
        ctx.fill();

        // Create clipping mask with the circle
        ctx.save();
        ctx.beginPath();
        ctx.arc(size / 2, size / 2, radius, 0, Math.PI * 2);
        ctx.clip();

        // Draw smiley face (will be clipped to the circle)
        this.drawSmiley(ctx, size);

        // Restore context to remove clipping
        ctx.restore();
    }

    /**
     * Check if a color is dark based on its luminance
     */
    private isDarkColor(color: Color): boolean {
        // Calculate relative luminance (grayscale value)
        const luminance = (0.299 * color.r + 0.587 * color.g + 0.114 * color.b) / 255;
        return luminance < 0.35;
    }

    /**
     * Draw a cheerful smiley face
     */
    private drawSmiley(ctx: AvatarContext, size: number): void {
        const faceSize = size * 0.7;

        // Random variations
        const mouthWidth = this.random.randomFloat(0.11, 0.13); // Half width relative to the circle diameter
        const eyeOffset = this.random.randomFloat(0.2, 0.25); // Eye horizontal position variation
        const isWideSmile = this.random.randomBoolean(0.5); // :) or :D

        // Random positioning and rotation
        const translateX = (this.random.randomBoolean() ? 1 : -1) * this.random.randomFloat(size * 0.13, size * 0.18); // Random x offset
        const translateY = this.random.randomFloat(-size * 0.02, size * 0.02); // Small y offset
        const rotation = this.random.randomFloat(-Math.PI / 12, Math.PI / 12); // Random rotation (-15 to +15 degrees)

        // Save context and apply transforms
        ctx.save();
        ctx.translate(size / 2, size / 2);
        ctx.translate(translateX, translateY);
        ctx.rotate(rotation);

        // Draw face circle with second color
        ctx.fillStyle = this.faceColor1;
        ctx.beginPath();
        ctx.arc(0, translateY, size / 2, 0, Math.PI * 2);
        ctx.fill();

        // Set drawing style for eyes and mouth
        ctx.strokeStyle = this.featureColor;
        ctx.fillStyle = this.featureColor;
        ctx.lineWidth = size * 0.035;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        const expression = this.options.expression ?? (isWideSmile ? 'grin' : 'smile');
        this.drawEye(ctx, -faceSize * eyeOffset, -faceSize * 0.125, size, expression === 'thoughtful');
        this.drawEye(ctx, faceSize * eyeOffset, -faceSize * 0.125, size, expression === 'thoughtful');
        this.drawMouth(ctx, size, mouthWidth, expression);

        // Restore context
        ctx.restore();
    }

    /**
     * Draw an oval eye
     */
    private drawEye(ctx: AvatarContext, x: number, y: number, size: number, closed: boolean): void {
        if (closed) {
            ctx.beginPath();
            ctx.moveTo(x - size * 0.045, y - size * 0.01);
            ctx.quadraticCurveTo(x, y + size * 0.035, x + size * 0.045, y - size * 0.01);
            ctx.stroke();
            return;
        }
        const eyeWidth = size * 0.0225;
        const eyeHeight = size * 0.058;

        ctx.beginPath();
        ctx.ellipse(x, y, eyeWidth, eyeHeight, 0, 0, Math.PI * 2);
        ctx.fill();
    }

    /**
     * Keep each expression small enough to read as the same simple face.
     * Assumes context is translated to center (0, 0)
     */
    private drawMouth(
        ctx: AvatarContext,
        size: number,
        mouthWidth: number,
        expression: NonNullable<SmileOptions['expression']>
    ): void {
        const mouthY = size * 0.15;
        const mouthLeft = -size * mouthWidth;
        const mouthRight = size * mouthWidth;

        if (expression === 'surprised') {
            ctx.beginPath();
            ctx.ellipse(0, mouthY + size * 0.025, size * 0.05, size * 0.075, 0, 0, Math.PI * 2);
            ctx.fill();
        } else if (expression === 'neutral' || expression === 'thoughtful') {
            const halfWidth = size * (expression === 'thoughtful' ? 0.045 : 0.075);
            ctx.beginPath();
            ctx.moveTo(-halfWidth, mouthY + size * 0.02);
            ctx.lineTo(halfWidth, mouthY + size * 0.02);
            ctx.stroke();
        } else if (expression === 'concerned') {
            ctx.beginPath();
            ctx.moveTo(mouthLeft, mouthY + size * 0.055);
            ctx.quadraticCurveTo(0, mouthY - size * 0.065, mouthRight, mouthY + size * 0.055);
            ctx.stroke();
        } else if (expression === 'grin') {
            // Draw open mouth :D with rounded corners
            const mouthDepth = size * 0.15;
            const cornerRadius = size * 0.025;

            ctx.beginPath();
            // Start at top left corner (after the curve)
            ctx.moveTo(mouthLeft + cornerRadius, mouthY);
            // Top line to right corner
            ctx.lineTo(mouthRight - cornerRadius, mouthY);
            // Rounded right corner
            ctx.quadraticCurveTo(mouthRight, mouthY, mouthRight, mouthY + cornerRadius);
            // Right side down
            ctx.lineTo(mouthRight, mouthY + cornerRadius);
            // Curved bottom from right to left
            const cp1x = size * (mouthWidth * 0.5);
            const cp1y = mouthY + mouthDepth;
            const cp2x = -size * (mouthWidth * 0.5);
            const cp2y = mouthY + mouthDepth;
            ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, mouthLeft, mouthY + cornerRadius);
            // Left side up
            ctx.lineTo(mouthLeft, mouthY + cornerRadius);
            // Rounded left corner
            ctx.quadraticCurveTo(mouthLeft, mouthY, mouthLeft + cornerRadius, mouthY);
            ctx.fill();
        } else {
            // Draw simple smile :)
            const mouthDepth = size * 0.105;

            ctx.beginPath();
            ctx.moveTo(mouthLeft, mouthY);

            // Bezier curve for smile
            const cp1x = -size * (mouthWidth * 0.5);
            const cp1y = mouthY + mouthDepth * 0.7;
            const cp2x = size * (mouthWidth * 0.5);
            const cp2y = mouthY + mouthDepth * 0.7;
            const endX = mouthRight;
            const endY = mouthY;

            ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, endX, endY);
            ctx.stroke();
        }
    }
}
