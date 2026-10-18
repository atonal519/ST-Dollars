export interface Point { x: number; y: number }
export interface ViewportTransform extends Point { scale: number }

export const MIN_GRAPH_SCALE = 0.55;
export const MAX_GRAPH_SCALE = 2.4;

export function zoomAt(transform: ViewportTransform, factor: number, anchor: Point): ViewportTransform {
  const scale = Math.min(MAX_GRAPH_SCALE, Math.max(MIN_GRAPH_SCALE, transform.scale * factor));
  const ratio = scale / transform.scale;
  return { scale, x: anchor.x - (anchor.x - transform.x) * ratio, y: anchor.y - (anchor.y - transform.y) * ratio };
}

export function fitGraph(width: number, height: number, viewport: Point): ViewportTransform {
  const scale = Math.min(MAX_GRAPH_SCALE, Math.max(MIN_GRAPH_SCALE, Math.min(viewport.x / width, viewport.y / height) * 0.92));
  return { scale, x: (viewport.x - width * scale) / 2, y: (viewport.y - height * scale) / 2 };
}

export function centerPoint(point: Point, transform: ViewportTransform, viewport: Point): ViewportTransform {
  return { ...transform, x: viewport.x / 2 - point.x * transform.scale, y: viewport.y / 2 - point.y * transform.scale };
}
