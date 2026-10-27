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

/** Completed activities are positioned beside their participants and do not extend the default view. */
export function layoutGraph(graph: GraphData): GraphLayout {
  const openActivities = graph.nodes.filter(node => node.type === 'activity' && node.status !== 'completed');
  const openIds = new Set(openActivities.map(node => node.id));
  const current = layoutOpenGraph({
    nodes: graph.nodes.filter(node => node.type === 'person' || openIds.has(node.id)),
    edges: graph.edges.filter(edge => openIds.has(edge.target)),
  });
  const historical = graph.nodes.filter(node => node.type === 'activity' && node.status === 'completed').sort((a, b) => a.id.localeCompare(b.id));
  const points = new Map(current.points);
  historical.forEach((activity, index) => {
    const participantPoints = graph.edges
      .filter(edge => edge.target === activity.id)
      .map(edge => points.get(edge.source))
      .filter((point): point is GraphPoint => Boolean(point));
    const center = participantPoints.length
      ? participantPoints.reduce((sum, point) => ({ x: sum.x + point.x / participantPoints.length, y: sum.y + point.y / participantPoints.length }), { x: 0, y: 0 })
      : { x: 520, y: 36 + index * 72 };
    points.set(activity.id, { x: center.x + 210 + (index % 2) * 54, y: center.y + Math.floor(index / 2) * 62 });
  });
  return { ...current, points };
}

/** Stable cluster placement follows only explicit person/activity participation. */
function layoutOpenGraph(graph: GraphData): GraphLayout {
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

    const activeActivities = component.activities.filter(activity => activity.status === 'active');
    const activeActivityIds = new Set(activeActivities.map(activity => activity.id));
    const activePeople = component.people.filter(person => (adjacency.get(person.id) ?? []).some(id => activeActivityIds.has(id)))
      .sort((a, b) => a.id.localeCompare(b.id));
    const activePeopleIds = new Set(activePeople.map(person => person.id));
    const placedActivePeople: GraphPoint[] = [];
    for (const [personIndex, person] of activePeople.entries()) {
      const activeIds = (adjacency.get(person.id) ?? []).filter(id => activeActivityIds.has(id)).sort();
      const center = activityPositions.get(activeIds[0])!;
      const extraRing = Math.floor(personIndex / participantOffsets.length) * 58;
      let best: GraphPoint | undefined;
      let bestClearance = Number.NEGATIVE_INFINITY;
      for (const offset of participantOffsets) {
        const candidate = {
          x: center.x + offset.x + (offset.x === 0 ? extraRing : Math.sign(offset.x) * extraRing),
          y: center.y + offset.y + (offset.y === 0 ? extraRing : Math.sign(offset.y) * extraRing),
        };
        const activityClearance = Math.min(...activeActivities.map(activity => {
          const point = activityPositions.get(activity.id)!;
          return Math.hypot(point.x - candidate.x, point.y - candidate.y) - 90;
        }));
        const peopleClearance = placedActivePeople.length
          ? Math.min(...placedActivePeople.map(point => Math.hypot(point.x - candidate.x, point.y - candidate.y) - 55))
          : Number.POSITIVE_INFINITY;
        const clearance = Math.min(activityClearance, peopleClearance);
        if (clearance > bestClearance) { best = candidate; bestClearance = clearance; }
      }
      if (best) { local.set(person.id, best); placedActivePeople.push(best); }
    }

    const peopleByMembership = new Map<string, { ids: string[]; people: GraphNode[] }>();
    for (const person of component.people) {
      if (activePeopleIds.has(person.id)) continue;
      const ids = (adjacency.get(person.id) ?? []).filter(id => activityPositions.has(id)).sort();
      const anchors = ids;
      const key = `all:${anchors.join('\u0000')}`;
      const group = peopleByMembership.get(key) ?? { ids: anchors, people: [] };
      group.people.push(person);
      peopleByMembership.set(key, group);
    }

    for (const { ids, people } of peopleByMembership.values()) {
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
  const usedCandidates = new Set<number>();
  const clearances = new Float64Array(candidates.length).fill(Number.POSITIVE_INFINITY);
  for (const person of isolatedPeople) {
    let chosenIndex = -1;
    let greatestClearance = -1;
    candidates.forEach((candidate, candidateIndex) => {
      if (usedCandidates.has(candidateIndex)) return;
      const clearance = clearances[candidateIndex];
      if (clearance > greatestClearance) {
        chosenIndex = candidateIndex;
        greatestClearance = clearance;
      }
    });
    const point = candidates[chosenIndex];
    usedCandidates.add(chosenIndex);
    points.set(person.id, point);
    for (let candidateIndex = 0; candidateIndex < candidates.length; candidateIndex++) {
      if (usedCandidates.has(candidateIndex)) continue;
      const candidate = candidates[candidateIndex];
      clearances[candidateIndex] = Math.min(clearances[candidateIndex], Math.max(
        Math.abs(point.x - candidate.x) / 64,
        Math.abs(point.y - candidate.y) / 48,
      ));
    }
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
