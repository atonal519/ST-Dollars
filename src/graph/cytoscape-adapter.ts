import type { GraphData } from './project-world';
import { graphPresentation, graphStatusLabel, shortGraphLabel } from './presentation';
import { layoutGraph } from './layout';
import type { GraphColors } from './cytoscape-style';

type Cytoscape = any;

/** Applies changed world elements and preset positions without replacing the renderer. */
export function syncGraphElements(cy: Cytoscape, graph: GraphData): void {
  const layout = layoutGraph(graph);
  const nodeIds = new Set(graph.nodes.map(node => node.id));
  const edgeIds = new Set(graph.edges.map(edge => edge.id));
  cy.batch(() => {
    cy.elements().forEach((element: Cytoscape) => {
      const isEdge = element.data('source') !== undefined;
      if (!(isEdge ? edgeIds : nodeIds).has(element.id())) element.remove();
    });
    for (const node of graph.nodes) {
      const existing = cy.getElementById(node.id);
      const position = layout.points.get(node.id) ?? { x: 0, y: 0 };
      const label = node.type === 'activity' ? `${shortGraphLabel(node)}\n${graphStatusLabel(node)}` : shortGraphLabel(node);
      const active = node.type === 'activity' && node.status === 'active';
      if (existing.length) {
        const changes: Record<string, unknown> = {};
        if (existing.data('type') !== node.type) changes.type = node.type;
        if (existing.data('label') !== label) changes.label = label;
        if (existing.data('active') !== active) changes.active = active;
        if (Object.keys(changes).length) existing.data(changes);
        const prior = existing.position();
        if (prior.x !== position.x || prior.y !== position.y) existing.position(position);
      } else {
        cy.add({ group: 'nodes', data: { id: node.id, type: node.type, label, displayLabel: '', active }, position });
      }
    }
    for (const edge of graph.edges) {
      const existing = cy.getElementById(edge.id);
      if (existing.length) {
        const changes: Record<string, string> = {};
        if (existing.data('source') !== edge.source) changes.source = edge.source;
        if (existing.data('target') !== edge.target) changes.target = edge.target;
        if (Object.keys(changes).length) existing.data(changes);
      } else cy.add({ group: 'edges', data: { id: edge.id, source: edge.source, target: edge.target } });
    }
  });
}

/** Updates only selection/presentation fields; graph facts and positions stay fixed. */
export function syncGraphPresentation(cy: Cytoscape, graph: GraphData, selectedId: string | null, zoomedLabels: boolean, colors: GraphColors): void {
  const presentation = graphPresentation(graph, selectedId);
  const nodesById = new Map(graph.nodes.map(node => [node.id, node]));
  const foreground = new Set(presentation.foregroundPersonIds);
  const active = new Set(presentation.activeActivityIds);
  const visibleActivities = new Set(presentation.visibleActivityIds);
  const visible = new Set(presentation.visibleEdgeIds);
  cy.batch(() => {
    cy.nodes().forEach((node: Cytoscape) => {
      const selected = node.id() === selectedId;
      const isActive = active.has(node.id());
      const isForeground = foreground.has(node.id()) || selected || zoomedLabels;
      const changes: Record<string, unknown> = {};
      if (node.data('selected') !== selected) changes.selected = selected;
      if (node.data('active') !== isActive) changes.active = isActive;
      if (node.data('foreground') !== isForeground) changes.foreground = isForeground;
      const source = nodesById.get(node.id());
      const isNodeVisible = node.data('type') !== 'activity' || visibleActivities.has(node.id());
      if (node.style('display') !== (isNodeVisible ? 'element' : 'none')) node.style('display', isNodeVisible ? 'element' : 'none');
      const displayLabel = node.data('type') === 'person'
        ? (isForeground && source ? shortGraphLabel(source) : '')
        : (source?.type === 'activity' && visibleActivities.has(node.id()) ? `${shortGraphLabel(source)}\n${graphStatusLabel(source)}` : '');
      if (node.data('displayLabel') !== displayLabel) changes.displayLabel = displayLabel;
      if (Object.keys(changes).length) node.data(changes);
      if (selected && !node.hasClass('selected')) node.addClass('selected');
      else if (!selected && node.hasClass('selected')) node.removeClass('selected');
      if (isActive && !node.hasClass('active')) node.addClass('active');
      else if (!isActive && node.hasClass('active')) node.removeClass('active');
      if (node.data('type') === 'person') {
        node.style('pie-1-background-color', selected ? colors.selected : isActive ? colors.star : colors.muted);
        node.style('color', selected ? colors.selected : isForeground ? colors.ink : colors.muted);
        node.style('font-size', isForeground ? 12 : 10);
        node.style('text-outline-color', colors.base);
        node.style('opacity', isForeground ? 0.96 : 0.42);
      } else {
        node.style('background-color', selected ? colors.selected : isActive ? colors.star : colors.muted);
        node.style('color', selected ? colors.selected : isActive ? colors.ink : colors.muted);
        node.style('opacity', selected || isActive ? 1 : 0.54);
      }
    });
    cy.edges().forEach((edge: Cytoscape) => {
      const isVisible = visible.has(edge.id());
      const isSelected = Boolean(selectedId && (edge.data('source') === selectedId || edge.data('target') === selectedId));
      if (edge.style('display') !== (isVisible ? 'element' : 'none')) edge.style('display', isVisible ? 'element' : 'none');
      const changes: Record<string, boolean> = {};
      if (edge.data('visible') !== isVisible) changes.visible = isVisible;
      if (edge.data('selected') !== isSelected) changes.selected = isSelected;
      if (Object.keys(changes).length) edge.data(changes);
      edge.style('line-color', isSelected ? colors.selected : colors.line);
      edge.style('opacity', isVisible ? (isSelected ? 0.9 : 0.68) : 0);
      edge.style('width', isSelected ? 1.8 : 1.2);
    });
  });
}
