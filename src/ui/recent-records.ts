import type { Activity, Person, WorldEvent, WorldSnapshot } from '../domain/world';
import { isEffectiveEvent } from '../domain/world-facts';
import { formatStoryTime } from './story-time';

export interface PersonRecentRecords {
  person: Person;
  activities: Activity[];
  records: Array<{ event: WorldEvent; time: string; content: string }>;
}

export function deriveRecentRecords(world: WorldSnapshot): PersonRecentRecords[] {
  const windows = new Map((world.simulationRanges ?? []).map(window => [window.id, window]));
  const candidates = world.events.filter(isEffectiveEvent).flatMap(event => {
    const content = event.description?.trim() ? event.description : event.title;
    if (!content?.trim()) return [];
    const window = windows.get(event.simulationWindowId ?? '') ?? event.sources.map(source => windows.get(source.id)).find(Boolean);
    const sources = [...event.sources, ...(event.storyTime?.source ? [event.storyTime.source] : [])];
    const floors = sources.flatMap(source => {
      if (source.kind !== 'chat') return [];
      const prefix = source.id.startsWith('history-floor:') ? 'history-floor:' : world.id && source.id.startsWith(`${world.id}:`) ? `${world.id}:` : '';
      const value = prefix ? source.id.slice(prefix.length) : '';
      return /^[1-9]\d*$/.test(value) && Number.isSafeInteger(Number(value)) ? [Number(value)] : [];
    });
    const sourceOrder = window?.throughSeq ?? (floors.length ? Math.max(...floors) : null);
    const time = event.storyTime?.text?.trim() || (window ? `${window.from.text} → ${window.to.text}` : '未注明时间');
    // Only complete, validated ISO text is comparable as a date. Relative text stays literal.
    const explicit = formatStoryTime(time) !== time;
    const zoned = /(?:Z|[+-]\d{2}:\d{2})$/.test(time);
    const rank = explicit ? Date.parse(zoned ? time : `${time}Z`) : sourceOrder;
    const group = explicit ? zoned ? 'dated-zone' : 'dated-local' : sourceOrder === null ? `unranked:${event.id}` : 'source';
    return [{ event, time, content, group, rank: rank ?? 0 }];
  });
  return world.people.flatMap(person => {
    const groups = new Map<string, typeof candidates>();
    for (const candidate of candidates) {
      if (!candidate.event.participantIds.includes(person.id)) continue;
      const previous = groups.get(candidate.group);
      if (!previous || candidate.rank > previous[0].rank) groups.set(candidate.group, [candidate]);
      else if (candidate.rank === previous[0].rank) previous.push(candidate);
    }
    // Incomparable precision/relative records are retained, rather than assigned an invented date.
    const records = [...groups.values()].flat().sort((left, right) => left.group.localeCompare(right.group) || left.event.id.localeCompare(right.event.id)).map(({event,time,content}) => ({event,time,content}));
    const activities = world.activities.filter(activity => activity.status !== 'completed' && activity.participantIds.includes(person.id));
    return records.length || activities.length ? [{ person, activities, records }] : [];
  });
}
