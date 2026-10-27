import type { GraphData } from './project-world';

export interface GraphPresentation {
  activeActivityIds: string[];
  foregroundPersonIds: string[];
  visibleActivityIds: string[];
  visibleEdgeIds: string[];
}

export function shortGraphLabel(node: GraphData['nodes'][number]): string {
  const characters = Array.from(node.label);
  if (node.type === 'person') return characters.length > 3 ? `${characters.slice(0, 3).join('')}…` : node.label;
  return characters.length > 15 ? `${characters.slice(0, 14).join('')}…` : node.label;
}

export function graphStatusLabel(node: GraphData['nodes'][number]): string {
  if (node.type === 'person') return node.status;
  return { planned: '计划中', active: '进行中', waiting: '等待中', completed: '已完成' }[node.status];
}

/** Activity status and explicit participant IDs are the only foreground signals. */
export function graphPresentation(graph: GraphData, selectedId: string | null): GraphPresentation {
  const activities = graph.nodes.filter(node => node.type === 'activity');
  const active = activities.filter(node => node.status === 'active');
  const activeIds = new Set(active.map(node => node.id));
  const activePeople = new Set(graph.edges.filter(edge => activeIds.has(edge.target)).map(edge => edge.source));
  const selected = graph.nodes.find(node => node.id === selectedId);
  const selectedEdges = selected?.type === 'person'
    ? graph.edges.filter(edge => edge.source === selected.id)
    : selected?.type === 'activity'
      ? graph.edges.filter(edge => edge.target === selected.id)
      : [];
  const selectedEdgeIds = new Set(selectedEdges.map(edge => edge.id));
  const selectedParticipantIds = new Set(selectedEdges.map(edge => edge.source));
  const visibleEdges = graph.edges.filter(edge => activeIds.has(edge.target)
    || selectedEdgeIds.has(edge.id));
  const visibleActivities = new Set(activities.filter(activity => activity.status !== 'completed').map(activity => activity.id));
  for (const edge of selectedEdges) visibleActivities.add(edge.target);
  if (selected?.type === 'activity') visibleActivities.add(selected.id);
  const noActive = active.length === 0;
  return {
    activeActivityIds: active.map(node => node.id),
    foregroundPersonIds: graph.nodes
      .filter(node => node.type === 'person' && (activePeople.has(node.id) || selectedParticipantIds.has(node.id) || noActive || selectedId === node.id))
      .map(node => node.id),
    visibleActivityIds: activities.filter(activity => visibleActivities.has(activity.id)).map(activity => activity.id),
    visibleEdgeIds: visibleEdges.map(edge => edge.id),
  };
}
