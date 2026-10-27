/**
 * Smile theme types
 * Cheerful smiley face avatar generator
 */

import type {GeneratorOptions} from '../../core/types.js';
import type {ColorOptions} from '../../core/colors.js';

/**
 * Smile generator options
 */
export type SmileExpression='smile'|'grin'|'neutral'|'thoughtful'|'concerned'|'surprised';

export interface SmileOptions extends GeneratorOptions, ColorOptions {
    expression?: SmileExpression;
}

/**
 * Default Smile options
 */
export const DEFAULT_SMILE_OPTIONS = {
};
