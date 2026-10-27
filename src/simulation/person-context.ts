import type { Activity, Knowledge, WorldEvent } from '../domain/world';
import { classifyKnowledge, isEffectiveEvent } from '../domain/world-facts';

export interface PersonWorldContext {
  personId: string;
  activityIds: string[];
  participatedEventIds: string[];
  knownEvents: Array<{ eventId: string; reason: string; classification?: 'fact' | 'retained-report' }>;
  continuingEventIds: string[];
}

export interface PersonContexts {
  personContexts: PersonWorldContext[];
  /** Recent objective facts with no participant or known person in this directory. */
  worldEventIds: string[];
  contextEvents: WorldEvent[];
}

/** Projects a small, identity-bound view of existing world facts for one model batch. */
export function buildPersonContexts(
  people: Array<{ id: string }>,
  state: { activities: Activity[]; events: WorldEvent[]; knowledge: Knowledge[] },
): PersonContexts {
  const ids = new Set(people.map(person => person.id));
  const activities = new Map<string, string[]>();
  for (const activity of state.activities) {
    if (activity.status === 'completed') continue;
    for (const personId of activity.participantIds) {
      if (!ids.has(personId)) continue;
      const values = activities.get(personId) ?? [];
      values.push(activity.id);
      activities.set(personId, values);
    }
  }

  const continuing = new Map<string, string[]>();
  for (const event of state.events) if (isEffectiveEvent(event)) for (const personId of event.continuingForPersonIds ?? []) { const values = continuing.get(personId) ?? []; values.push(event.id); continuing.set(personId, values); }
  const participated = new Map<string, string[]>();
  for (const event of state.events.filter(isEffectiveEvent)) for (const personId of event.participantIds) {
    if (!ids.has(personId)) continue;
    const values = participated.get(personId) ?? [];
    values.push(event.id);
    participated.set(personId, values);
  }
  const known = new Map<string, Array<{ eventId: string; reason: string; classification?: 'fact' | 'retained-report' }>>();
  const eventById = new Map(state.events.map(event => [event.id, event]));
  const knownEventIds = new Set<string>();
  for (const item of state.knowledge) {
    if (!ids.has(item.personId) || !eventById.has(item.eventId)) continue;
    const classification = classifyKnowledge(item, eventById.get(item.eventId)!);
    if (classification === 'invalidated') continue;
    knownEventIds.add(item.eventId);
    const values = known.get(item.personId) ?? [];
    values.push({ eventId: item.eventId, reason: item.reason, ...(classification === 'retained-report' ? { classification } : {}) });
    known.set(item.personId, values);
  }

  const personContexts = people.map(person => ({
    personId: person.id,
    activityIds: activities.get(person.id) ?? [],
    continuingEventIds: continuing.get(person.id) ?? [],
    participatedEventIds: (participated.get(person.id) ?? []).slice(-6),
    knownEvents: (known.get(person.id) ?? []).filter((item, index, all) => index >= all.length - 6 || eventById.get(item.eventId)?.continuingForPersonIds?.includes(person.id)),
  }));
  const wanted = new Set<string>();
  for (const context of personContexts) {
    context.continuingEventIds.forEach(id => wanted.add(id));
    context.participatedEventIds.forEach(id => wanted.add(id));
    context.knownEvents.forEach(item => wanted.add(item.eventId));
  }
  const worldEventIds = state.events.filter(event => isEffectiveEvent(event) && !event.participantIds.some(id => ids.has(id)) && !knownEventIds.has(event.id)).slice(-20).map(event => event.id);
  worldEventIds.forEach(id => wanted.add(id));
  const contextEvents = state.events.filter(event => wanted.has(event.id));
  return { personContexts, worldEventIds, contextEvents };
}
