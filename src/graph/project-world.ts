import type { Activity, Person, WorldSnapshot } from '../domain/world';

export interface PersonNode {
  id: string;
  type: 'person';
  label: string;
  status: string;
  description: string;
}

export interface ActivityNode {
  id: string;
  type: 'activity';
  label: string;
  status: Activity['status'];
  description: string;
}

export type GraphNode = PersonNode | ActivityNode;

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  type: 'participates';
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

/** Projects explicit participant IDs; it does not infer relationships from names or location. */
export function projectWorld(snapshot: WorldSnapshot): GraphData {
  const people: PersonNode[] = snapshot.people.map((person: Person) => ({
    id: person.id,
    type: 'person',
    label: person.name,
    status: person.status,
    description: person.description,
  }));
  const activities: ActivityNode[] = snapshot.activities.map(activity => ({
    id: activity.id,
    type: 'activity',
    label: activity.title,
    status: activity.status,
    description: activity.description,
  }));
  const personIds = new Set(people.map(person => person.id));
  const edges: GraphEdge[] = snapshot.activities.flatMap(activity =>
    activity.participantIds
      .filter(personId => personIds.has(personId))
      .map(personId => ({
        id: `${personId}:${activity.id}`,
        source: personId,
        target: activity.id,
        type: 'participates' as const,
      })),
  );

  return { nodes: [...people, ...activities], edges };
}
