import type { SourcePerson } from '../domain/source-people';
import type { Activity, SourceRef } from '../domain/world';
import type { NpcWorldState } from '../domain/world-state';
import type { StoryTurn } from '../application/contracts';
import { extractJson } from '../simulation/json';

type Item = Record<string, any>;
const obj = (value: unknown): Item | null => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Item : null;
const text = (value: unknown) => typeof value === 'string' ? value.trim() : '';
const idOf = (value: unknown) => typeof value === 'string' ? value.trim() : text(obj(value)?.id);
const uuid = () => globalThis.crypto?.randomUUID?.() ?? `history-${Date.now()}-${Math.random().toString(36).slice(2)}`;
const statuses: Record<string, Activity['status']> = { planned: 'planned', active: 'active', waiting: 'waiting', completed: 'completed', in_progress: 'active', done: 'completed', '计划中': 'planned', '进行中': 'active', '等待中': 'waiting', '已完成': 'completed' };

function payload(value: unknown): Item {
  let current = obj(extractJson(value));
  for (let i = 0; i < 4 && current; i++) { const nested = obj(current.result ?? current.data ?? current.output ?? current.history); if (!nested) break; current = nested; }
  if (!current) throw new Error('历史整理结果无法读取。');
  return current;
}
function refs(value: unknown, batch: StoryTurn[]): SourceRef[] {
  const entries = Array.isArray(value) ? value : value === undefined ? [] : [value];
  const bySeq = new Map(batch.map(turn => [turn.seq, turn])); const used = new Set<number>();
  for (const entry of entries) {
    const raw = typeof entry === 'number' ? entry : typeof entry === 'string' && /^\d+$/.test(entry.trim()) ? Number(entry) : NaN;
    if (Number.isInteger(raw) && bySeq.has(raw)) used.add(raw);
  }
  return [...used].sort((a, b) => a - b).map(seq => ({ kind: 'chat', id: `history-floor:${seq}`, label: `第 ${seq} 楼正文` }));
}
function arrayAt(data: Item, ...keys: string[]): { items: unknown[]; invalid: number; present: boolean } {
  const key = keys.find(name => Object.hasOwn(data, name));
  if (!key) return { items: [], invalid: 0, present: false };
  const value = data[key];
  if (Array.isArray(value)) return { items: value, invalid: 0, present: true };
  if (obj(value)) return { items: [value], invalid: 0, present: true };
  if (value === null) return { items: [], invalid: 0, present: true };
  return { items: [], invalid: 1, present: true };
}
function aliasesFor(items: unknown[], knownIds: Set<string>) {
  const uses = new Map<string, Set<string>>();
  const add = (alias: string, target: string) => { const targets = uses.get(alias) ?? new Set<string>(); targets.add(target); uses.set(alias, targets); };
  for (const id of knownIds) add(id, JSON.stringify(['known', id]));
  items.forEach((value, index) => {
    const item = obj(value); if (!item) return;
    const id = idOf(item.id); const target = JSON.stringify(knownIds.has(id) ? ['known', id] : ['new', index]);
    const aliases = new Set([text(item.key), id].filter(Boolean));
    for (const alias of aliases) add(alias, target);
  });
  const ambiguous = new Set([...uses].filter(([, targets]) => targets.size > 1).map(([alias]) => alias));
  const map = new Map<string, string>();
  const bind = (item: Item, id: string) => {
    const aliases = new Set([text(item.key), idOf(item.id)].filter(Boolean));
    for (const alias of aliases) if (!ambiguous.has(alias)) map.set(alias, id);
  };
  return { map, ambiguous, bind };
}
function appendSources(existing: SourceRef[], added: SourceRef[]): SourceRef[] {
  const byId = new Map(existing.map(source => [source.id, source]));
  for (const source of added) if (!byId.has(source.id)) byId.set(source.id, source);
  return [...byId.values()];
}

export function mergeHistoryBatch(input: { baseline: NpcWorldState; candidate: NpcWorldState; batch: StoryTurn[]; response: unknown; people: SourcePerson[] }) {
  const data = payload(input.response);
  const activityField = arrayAt(data, 'activities', 'plans'); const eventField = arrayAt(data, 'events', 'results'); const knowledgeField = arrayAt(data, 'knowledge', 'knowledges');
  const activities = activityField.items; const events = eventField.items; const knowledgeItems = knowledgeField.items;
  const hasStoryTime = ['storyTime', 'story_time'].some(key => Object.hasOwn(data, key));
  if (!activityField.present && !eventField.present && !knowledgeField.present && !hasStoryTime) throw new Error('历史整理结果缺少活动、事件、知情或故事时间字段，已停止整理。');
  const candidateActivities = [...input.candidate.activities]; const candidateEvents = [...input.candidate.events]; const candidateKnowledge = [...input.candidate.knowledge];
  const personIds = new Set(input.people.map(person => person.id)); const baseActivityIds = new Set(input.baseline.activities.map(item => item.id)); const baseEventIds = new Set(input.baseline.events.map(item => item.id));
  const baselineKnowledgePairs = new Set(input.baseline.knowledge.map(item => `${item.personId}\u0000${item.eventId}`));
  const knownActivityIds = new Set([...input.baseline.activities, ...input.candidate.activities].map(item => item.id));
  const knownEventIds = new Set([...input.baseline.events, ...input.candidate.events].map(item => item.id));
  const activityAliases = aliasesFor(activities, knownActivityIds); const eventAliases = aliasesFor(events, knownEventIds);
  const activityKeys = activityAliases.map; const eventKeys = eventAliases.map;
  let skipped = activityField.invalid + eventField.invalid + knowledgeField.invalid + activityAliases.ambiguous.size + eventAliases.ambiguous.size; let adopted = false;
  const normalizePeople = (value: unknown) => {
    const values = Array.isArray(value) ? value : value === undefined ? [] : [value]; const ids = values.map(idOf).filter(Boolean);
    skipped += ids.filter(id => !personIds.has(id)).length;
    return [...new Set(ids.filter(id => personIds.has(id)))];
  };
  const sourceFor = (value: unknown) => { const sources = refs(value, input.batch); skipped += (Array.isArray(value) ? value.length : value === undefined ? 0 : 1) - sources.length; return sources; };
  const historyActivityIds = new Set(candidateActivities.filter(item => !baseActivityIds.has(item.id)).map(item => item.id));
  for (const raw of activities) {
    const item = obj(raw); if (!item) { skipped++; continue; }
    const key = text(item.key); const existingId = idOf(item.id); const existing = candidateActivities.find(activity => activity.id === existingId && historyActivityIds.has(activity.id));
    const title = text(item.title ?? item.name); const participants = normalizePeople(item.participantIds ?? item.personIds ?? item.people); const sources = sourceFor(item.sourceSeqs ?? item.floorIds);
    if (existingId && baseActivityIds.has(existingId)) { activityAliases.bind(item, existingId); adopted = true; continue; }
    if (!sources.length || (!existing && (!title || !participants.length))) { skipped++; continue; }
    const id = existing?.id ?? uuid(); activityAliases.bind(item, id);
    const status = statuses[text(item.status).toLowerCase()];
    const participantIds = existing ? [...new Set([...existing.participantIds.filter(personId => personIds.has(personId)), ...participants])] : participants;
    const next: Activity = existing ? { ...existing, title: title || existing.title, description: text(item.description) || existing.description, status: status ?? existing.status, participantIds, sources: appendSources(existing.sources, sources) } : { id, title, description: text(item.description) || title, status: status ?? 'planned', participantIds, sources };
    const index = candidateActivities.findIndex(entry => entry.id === id); if (index >= 0) candidateActivities[index] = next; else candidateActivities.push(next);
    historyActivityIds.add(id); adopted = true;
  }
  const activityIdFor = (reference: string) => activityAliases.ambiguous.has(reference) ? '' : knownActivityIds.has(reference) ? reference : activityKeys.get(reference) ?? '';
  const eventIdFor = (reference: string) => eventAliases.ambiguous.has(reference) ? '' : knownEventIds.has(reference) ? reference : eventKeys.get(reference) ?? '';
  for (const raw of events) {
    const item = obj(raw); if (!item) { skipped++; continue; }
    const title = text(item.title ?? item.name); const sources = sourceFor(item.sourceSeqs ?? item.floorIds); const participants = normalizePeople(item.participantIds ?? item.personIds ?? item.people);
    const providedId = idOf(item.id);
    if (providedId && baseEventIds.has(providedId)) { eventAliases.bind(item, providedId); adopted = true; continue; }
    const existingEvent = providedId && candidateEvents.find(event => event.id === providedId);
    if (existingEvent) { eventAliases.bind(item, existingEvent.id); adopted = true; continue; }
    const reference = idOf(item.activityId ?? item.activity); const activityId = reference ? activityIdFor(reference) : null;
    const validActivity = activityId === null ? !reference : candidateActivities.some(activity => activity.id === activityId);
    const worldLevel = item.worldLevel === true || item.worldEvent === true;
    if (!title || !sources.length || !validActivity || (!participants.length && !worldLevel)) { skipped++; continue; }
    const id = uuid(); eventAliases.bind(item, id);
    candidateEvents.push({ id, activityId, title, description: text(item.description) || title, storyTime: text(item.storyTime ?? item.story_time) ? { text: text(item.storyTime ?? item.story_time), source: sources[0] } : null, participantIds: participants, sources }); adopted = true;
  }
  for (const raw of knowledgeItems) {
    const item = obj(raw); if (!item) { skipped++; continue; }
    const personId = idOf(item.personId ?? item.person); const eventId = eventIdFor(idOf(item.eventId ?? item.event)); const eventKnown = candidateEvents.some(event => event.id === eventId) || baseEventIds.has(eventId); const sources = sourceFor(item.sourceSeqs ?? item.floorIds); const reason = text(item.reason);
    if (!personIds.has(personId) || !eventKnown || !reason || !sources.length) { skipped++; continue; }
    adopted = true;
    if (baselineKnowledgePairs.has(`${personId}\u0000${eventId}`)) continue;
    const existing = candidateKnowledge.findIndex(entry => entry.personId === personId && entry.eventId === eventId);
    if (existing < 0) candidateKnowledge.push({ personId, eventId, reason, sources });
    else candidateKnowledge[existing] = { ...candidateKnowledge[existing], sources: appendSources(candidateKnowledge[existing].sources, sources) };
  }
  const storyTime = text(data.storyTime ?? data.story_time);
  let nextStoryTime: NpcWorldState['storyTime'] | undefined;
  let invalidStoryTime = 0;
  if (storyTime) {
    const timeSourcesValue = data.storyTimeSourceSeqs ?? data.timeSourceSeqs;
    const timeSources = refs(timeSourcesValue, input.batch);
    skipped += (Array.isArray(timeSourcesValue) ? timeSourcesValue.length : timeSourcesValue === undefined ? 0 : 1) - timeSources.length;
    if (timeSources.length) { nextStoryTime = { text: storyTime, source: timeSources[0] }; adopted = true; }
    else { invalidStoryTime++; skipped++; }
  }
  const count = activities.length + events.length + knowledgeItems.length + activityField.invalid + eventField.invalid + knowledgeField.invalid + invalidStoryTime;
  if (count && !adopted) throw new Error('本批历史结果均无法确认人物、事件或正文来源，已停止整理。');
  const state: NpcWorldState = { ...input.candidate, activities: candidateActivities, events: candidateEvents, knowledge: candidateKnowledge, ...(nextStoryTime ? { storyTime: nextStoryTime } : {}) };
  return { state, activityKeys, eventKeys, skipped, adopted, partial: skipped > 0 };
}
