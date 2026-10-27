export interface GraphColors {
  ink: string;
  muted: string;
  line: string;
  star: string;
  selected: string;
  base: string;
}

/** Cytoscape renders the small star inside a normal 44px person hit target. */
export function createCytoscapeStyle(colors: GraphColors): Record<string, unknown>[] {
  return [
    { selector: 'node[type="person"]', style: { width: 44, height: 44, 'background-opacity': 0, 'pie-size': '11px', 'pie-1-background-size': 100, 'pie-1-background-color': colors.star, 'pie-1-background-opacity': 1, label: 'data(displayLabel)', 'text-valign': 'bottom', 'text-halign': 'center', 'text-margin-y': 5, 'font-family': 'system-ui, sans-serif', 'font-weight': 500, 'text-outline-width': 2, 'text-outline-color': colors.base } },
    { selector: 'node[type="activity"]', style: { width: 'label', height: 'label', padding: '5px', shape: 'round-rectangle', 'background-color': colors.muted, 'background-opacity': 0.18, label: 'data(displayLabel)', 'text-wrap': 'wrap', 'text-max-width': 132, 'text-valign': 'center', 'text-halign': 'center', 'font-family': 'system-ui, sans-serif', 'font-size': 11, 'line-height': 1.25, color: colors.ink, 'text-outline-width': 0 } },
    { selector: 'edge', style: { width: 1.2, 'curve-style': 'bezier', 'line-color': colors.line, 'target-arrow-shape': 'none', 'source-arrow-shape': 'none', opacity: 0.68, events: 'no', 'z-index': 0 } },
  ];
}
