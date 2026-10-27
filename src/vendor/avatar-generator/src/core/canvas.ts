import type {AvatarCanvas, AvatarContext} from './types.js';

export function isBrowser(): boolean {
    return typeof window !== 'undefined' && typeof document !== 'undefined';
}

let createCanvasHandle: any = null;

export function setCreateCanvasHandle(handle: any) {
    createCanvasHandle = handle;
}

export function getCanvas(size: number, existingCanvas?: AvatarCanvas): { canvas: AvatarCanvas; ctx: AvatarContext } {
    if (existingCanvas) {
        existingCanvas.width = size;
        existingCanvas.height = size;
        const ctx = existingCanvas.getContext('2d');

        if (!ctx) {
            throw new Error('Failed to get 2D context from existing canvas');
        }

        return {canvas: existingCanvas, ctx};
    }

    return createCanvas(size);
}

export function createCanvas(size: number): { canvas: AvatarCanvas; ctx: AvatarContext } {
    if (isBrowser()) {
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');

        if (!ctx) {
            throw new Error('Failed to get 2D context from canvas');
        }

        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';

        return {canvas, ctx};
    } else if (createCanvasHandle) {
        const canvas = createCanvasHandle(size, size);
        const ctx = canvas.getContext('2d');
        return {canvas, ctx};
    }

    throw new Error('Unsupported environment: not browser, createCanvasHandle not set');
}

export function canvasToBuffer(canvas: AvatarCanvas, mimeType: 'image/png' | 'image/jpeg' = 'image/png'): Buffer {
    return canvas.toBuffer(mimeType);
}

export function canvasToDataURL(canvas: AvatarCanvas, mimeType: 'image/png' | 'image/jpeg' = 'image/png'): string {
    return canvas.toDataURL(mimeType);
}
