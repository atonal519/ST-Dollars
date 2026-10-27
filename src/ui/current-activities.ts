import { isEffectiveEvent } from '../domain/world-facts';
import type { Activity, WorldEvent, WorldSnapshot } from '../domain/world';

export interface CurrentActivityItem {
  activity: Activity;
  participants: string[];
  recentEvent: WorldEvent | null;
}

/** Current activity cards are a view over the loaded world; event order is only used as stored. */
export function deriveCurrentActivities(world: WorldSnapshot): CurrentActivityItem[] {
  const people = new Map(world.people.map(person => [person.id, person]));
  return world.activities
    .filter(activity => activity.status !== 'completed')
    .map(activity => ({
      activity,
      participants: activity.participantIds.map(id => people.get(id)?.name ?? '人物资料不可用'),
      recentEvent: world.events.filter(event => isEffectiveEvent(event) && event.activityId === activity.id).at(-1) ?? null,
    }))
    .sort((left, right) => Number(right.activity.status === 'active') - Number(left.activity.status === 'active'));
}

export function activityStatusLabel(activity: Activity): string {
  return { planned: '计划中', active: '进行中', waiting: '等待中', completed: '已完成' }[activity.status];
}

