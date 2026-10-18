import type { GraphData, GraphNode } from './project-world';

export interface GraphPoint { x: number; y: number }
export interface GraphLayout { width: number; height: number; points: Map<string, GraphPoint> }

interface Component { people: GraphNode[]; activities: GraphNode[] }

const activityAnchors: GraphPoint[] = [
  { x: 140, y: 100 }, { x: 300, y: 165 }, { x: 210, y: 300 },
  { x: 120, y: 390 }, { x: 300, y: 455 },
];
const participantOffsets: GraphPoint[] = [
  { x: -78, y: -68 }, { x: 78, y: -68 }, { x: -78, y: 68 }, { x: 78, y: 68 },
  { x: 0, y: -108 }, { x: 0, y: 108 }, { x: -122, y: 0 }, { x: 122, y: 0 },
];

/** Stable cluster placement follows only explicit person/activity participation. */
export function layoutGraph(graph: GraphData): GraphLayout {
  const nodes = graph.nodes.slice().sort((a, b) => a.id.localeCompare(b.id));
  const byId = new Map(nodes.map(node => [node.id, node]));
  const adjacency = new Map(nodes.map(node => [node.id, [] as string[]]));
  for (const edge of graph.edges) {
    if (!adjacency.has(edge.source) || !adjacency.has(edge.target)) continue;
    adjacency.get(edge.source)!.push(edge.target);
    adjacency.get(edge.target)!.push(edge.source);
  }

  const components: Component[] = [];
  const visited = new Set<string>();
  for (const node of nodes) {
    if (visited.has(node.id) || !adjacency.get(node.id)?.length) continue;
    const queue = [node.id];
    visited.add(node.id);
    const members: GraphNode[] = [];
    for (let cursor = 0; cursor < queue.length; cursor++) {
      const current = queue[cursor];
      const member = byId.get(current);
      if (member) members.push(member);
      for (const neighbor of adjacency.get(current) ?? []) {
        if (!visited.has(neighbor)) { visited.add(neighbor); queue.push(neighbor); }
      }
    }
    components.push({
      people: members.filter(member => member.type === 'person').sort((a, b) => a.id.localeCompare(b.id)),
      activities: members.filter(member => member.type === 'activity').sort((a, b) => a.id.localeCompare(b.id)),
    });
  }

  // Unconnected activities remain visible as their own small groups.
  for (const activity of nodes.filter(node => node.type === 'activity' && !adjacency.get(node.id)?.length)) {
    components.push({ people: [], activities: [activity] });
  }
  components.sort((a, b) => groupId(a).localeCompare(groupId(b)));

  const points = new Map<string, GraphPoint>();
  let groupTop = 36;
  for (const component of components) {
    const local = new Map<string, GraphPoint>();
    const activityPositions = new Map<string, GraphPoint>();
    component.activities.forEach((activity, index) => {
      const anchor = activityAnchors[index];
      activityPositions.set(activity.id, anchor ?? { x: index % 2 ? 300 : 120, y: 520 + Math.floor((index - activityAnchors.length) / 2) * 90 });
    });

    const peopleByMembership = new Map<string, GraphNode[]>();
    for (const person of component.people) {
      const ids = (adjacency.get(person.id) ?? []).filter(id => activityPositions.has(id)).sort();
      const key = ids.join('\u0000');
      const group = peopleByMembership.get(key) ?? [];
      group.push(person);
      peopleByMembership.set(key, group);
    }

    for (const [membership, people] of peopleByMembership) {
      const ids = membership.split('\u0000').filter(Boolean);
      const centers = ids.map(id => activityPositions.get(id)!).filter(Boolean);
      const center = {
        x: centers.reduce((sum, point) => sum + point.x, 0) / centers.length,
        y: centers.reduce((sum, point) => sum + point.y, 0) / centers.length,
      };
      people.sort((a, b) => a.id.localeCompare(b.id)).forEach((person, index) => {
        const offset = participantOffsets[index % participantOffsets.length];
        const extraRing = Math.floor(index / participantOffsets.length) * 46;
        local.set(person.id, { x: center.x + offset.x + (offset.x === 0 ? extraRing : Math.sign(offset.x) * extraRing), y: center.y + offset.y + (offset.y === 0 ? extraRing : Math.sign(offset.y) * extraRing) });
      });
    }
    for (const [id, point] of activityPositions) local.set(id, point);

    const minY = Math.min(...[...local.values()].map(point => point.y));
    const maxY = Math.max(...[...local.values()].map(point => point.y));
    const shiftY = groupTop - minY;
    for (const [id, point] of local) points.set(id, { x: point.x, y: point.y + shiftY });
    groupTop += maxY - minY + 112;
  }

  const isolatedPeople = nodes.filter(node => node.type === 'person' && !adjacency.get(node.id)?.length);
  const isolatedFieldHeight = Math.max(320, isolatedPeople.length * 22);
  const candidateCount = Math.max(128, isolatedPeople.length * 10);
  const candidates = Array.from({ length: candidateCount }, (_, index) => ({
    x: 60 + radicalInverse(index + 1, 2) * 300,
    y: groupTop + 24 + radicalInverse(index + 1, 3) * isolatedFieldHeight,
  }));
  const occupied: GraphPoint[] = [];
  const usedCandidates = new Set<number>();
  for (const person of isolatedPeople) {
    let chosenIndex = -1;
    let greatestClearance = -1;
    candidates.forEach((candidate, candidateIndex) => {
      if (usedCandidates.has(candidateIndex)) return;
      const clearance = occupied.length
        ? Math.min(...occupied.map(point => Math.max(Math.abs(point.x - candidate.x) / 64, Math.abs(point.y - candidate.y) / 48)))
        : Number.POSITIVE_INFINITY;
      if (clearance > greatestClearance) {
        chosenIndex = candidateIndex;
        greatestClearance = clearance;
      }
    });
    const point = candidates[chosenIndex];
    usedCandidates.add(chosenIndex);
    occupied.push(point);
    points.set(person.id, point);
  }

  const lastY = Math.max(120, ...[...points.values()].map(point => point.y));
  return { width: 420, height: lastY + 44, points };
}

function groupId(component: Component): string {
  return [...component.people, ...component.activities].map(node => node.id).sort()[0] ?? '';
}

function radicalInverse(index: number, base: number): number {
  let value = 0;
  let factor = 1 / base;
  for (let remainder = index; remainder > 0; remainder = Math.floor(remainder / base)) {
    value += (remainder % base) * factor;
    factor /= base;
  }
  return value;
}
