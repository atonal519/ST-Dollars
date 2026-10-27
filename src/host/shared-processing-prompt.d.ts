export const BASE_PROCESSING_PROMPT: string;
export function initializeSharedProcessingPrompt(settings: Record<string, unknown>, save?: () => void): boolean;
export function getSharedProcessingPrompt(settings?: Record<string, unknown>): string;
export function updateSharedProcessingPrompt(settings: Record<string, unknown>, value: unknown): string;
export function resolveSharedProcessingPrompt(value: unknown): string;
export function prependProcessingPrompt(task: string, processing: string): string;
