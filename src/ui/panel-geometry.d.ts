export const DESKTOP_PANEL_BREAKPOINT: 641;
export const PANEL_SAFETY_MARGIN: 10;
export const PANEL_MIN_WIDTH: 320;
export const PANEL_MIN_HEIGHT: 300;
export const PANEL_POSITION_KEY: string;
export const PANEL_SIZE_KEY: string;
export interface PanelPosition { left: number; top: number }
export interface PanelSize { width: number; height: number }
export function mobilePanelRect(width: number, height: number, safeTop?: number, safeBottom?: number): PanelPosition & PanelSize & { right: number; bottom: number };
export function desktopPanelSize(width: number, height: number, saved?: Partial<PanelSize> | null): PanelSize & { minWidth: number; minHeight: number; maxWidth: number; maxHeight: number };
export function desktopPanelPosition(width: number, height: number, panelWidth: number, panelHeight: number, saved?: Partial<PanelPosition> | null): PanelPosition;
export interface PanelGeometryController { restore(): void; cancelGesture(): void; destroy(): void }
export function createPanelGeometryController(options: {
  panel: HTMLElement;
  dragHandle: HTMLElement;
  resizeHandle: HTMLElement;
  storage?: Pick<Storage, 'getItem' | 'setItem'>;
  viewport?: Pick<Window, 'innerWidth' | 'innerHeight' | 'requestAnimationFrame' | 'cancelAnimationFrame' | 'addEventListener' | 'removeEventListener'>;
}): PanelGeometryController;
