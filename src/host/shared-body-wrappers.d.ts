export interface BodyWrappers { keepTags: string; extraTags: string }
export function getSharedBodyWrappers(settings: Record<string, unknown>): BodyWrappers;
export function updateSharedBodyWrappers(settings: Record<string, unknown>, patch: Partial<BodyWrappers>): BodyWrappers;
export function sanitizeStoryBody(value: string, options?: Partial<BodyWrappers>): string;
