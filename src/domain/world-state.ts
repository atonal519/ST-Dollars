import type { Activity, Knowledge, StoryTime, WorldEvent, WorldSnapshot } from './world';

export interface NpcWorldState {
  schemaVersion: 1;
  scopeId: string;
  storyTime: StoryTime | null;
  processedThroughSeq: number | null;
  activities: Activity[];
  events: WorldEvent[];
  knowledge: Knowledge[];
}

export function createEmptyState(scopeId: string): NpcWorldState {
  return { schemaVersion: 1, scopeId, storyTime: null, processedThroughSeq: null, activities: [], events: [], knowledge: [] };
}

export function projectWorldState(scopeId: string, people: WorldSnapshot['people'], state: NpcWorldState): WorldSnapshot {
  const activityByPerson = new Map<string, Activity[]>();
  for (const activity of state.activities) for (const id of activity.participantIds) {
    const list = activityByPerson.get(id) ?? [];
    list.push(activity); activityByPerson.set(id, list);
  }
  const projectedPeople = people.map(person => {
    const activities = activityByPerson.get(person.id) ?? [];
    const current = activities.find(activity => activity.status === 'active') ?? activities.find(activity => activity.status === 'waiting') ?? activities.find(activity => activity.status === 'planned');
    return { ...person, status: current?.title ?? (activities.length ? '暂无进行中的活动' : '尚无活动记录') };
  });
  return { id: scopeId, storyTime: state.storyTime, people: projectedPeople, activities: state.activities, events: state.events, knowledge: state.knowledge };
}

