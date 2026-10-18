import type { AdvanceDependencies, AdvanceResult, StoryInput } from '../application/contracts';
import type { SourcePerson } from '../domain/source-people';
import type { Activity, ActivityStatus, Knowledge, SourceRef } from '../domain/world';
import type { NpcWorldState } from '../domain/world-state';
import { ADVANCE_INSTRUCTIONS, PLAN_INSTRUCTIONS } from './prompts';
import { parseBatch, parsePlan } from './parse';

const record = (value: unknown): Record<string, any> | null => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, any> : null;
const stableId = (value: unknown): string | null => {
  if (typeof value === 'string') return value.trim() || null;
  const id = record(value)?.id;
  return typeof id === 'string' ? id.trim() || null : null;
};
const idList = (value: unknown) => {
  if (value === undefined) return { present: false, ids: [] as string[], invalidCount: 0 };
  const values = Array.isArray(value) ? value : typeof value === 'string' || record(value) ? [value] : null;
  if (!values) return { present: true, ids: [] as string[], invalidCount: 1 };
  const ids: string[] = []; let invalidCount = 0;
  for (const item of values) { const id = stableId(item); if (id) ids.push(id); else invalidCount++; }
  return { present: true, ids: [...new Set(ids)], invalidCount };
};
const uuid = () => globalThis.crypto?.randomUUID?.() ?? `dollars-${Date.now()}-${Math.random().toString(36).slice(2)}`;
const statuses: Record<string, ActivityStatus> = {
  planned: 'planned', active: 'active', waiting: 'waiting', completed: 'completed',
  in_progress: 'active', done: 'completed',
  '计划中': 'planned', '进行中': 'active', '等待中': 'waiting', '已完成': 'completed',
};
const status = (value: unknown): ActivityStatus | null => typeof value === 'string' ? statuses[value.trim().toLowerCase()] ?? null : null;
const storyText = (story: StoryInput) => story.turns.map(turn => `${turn.isUser ? '故事user' : '正文'}：${turn.text}`).join('\n');

export async function advanceBatch(input: { people: SourcePerson[]; state: NpcWorldState; story: StoryInput; dependencies: AdvanceDependencies }): Promise<AdvanceResult> {
  const { people, state, story, dependencies } = input;
  const storyBody = storyText(story);
  const source: SourceRef = { ...story.source };
  const allIds = people.map(person => person.id);
  const planMaterial = await dependencies.materials.readForQuestion({ question: storyBody, personIds: allIds, maxCharacters: 16000 });
  if (!['ready', 'empty'].includes(planMaterial.status)) throw new Error(planMaterial.message || '读取人物资料失败，未推进本批活动。');
  if (allIds.length > 100) throw new Error('当前人物超过单次资料读取上限，未推进本批活动。');
  const rawPlan = await dependencies.model.request({ task: 'plan', instructions: PLAN_INSTRUCTIONS, input: {
    people: people.map(person => ({ id: person.id, name: person.displayName })), story: storyBody, previousStoryTime: state.storyTime,
    unfinishedActivities: state.activities.filter(item => item.status !== 'completed'), recentEvents: state.events.slice(-20).map(event => ({ ...event, knownBy: state.knowledge.filter(item => item.eventId === event.id) })),
    routerBackground: planMaterial.routerText, personMaterials: planMaterial.materials, partial: planMaterial.coverage.partial,
  } });
  const plan = parsePlan(rawPlan);
  const requestedPeople = new Set(plan.personIds.filter(id => allIds.includes(id)));
  const requestedActivityIds = new Set(plan.activityIds);
  const selectedActivities = state.activities.filter(activity => activity.status !== 'completed' && (
    requestedActivityIds.has(activity.id) || activity.participantIds.some(id => requestedPeople.has(id))
  ));
  const unknownSelections = [...plan.rawPersonIds.filter(id => !allIds.includes(id)), ...plan.rawActivityIds.filter(id => !state.activities.some(activity => activity.id === id))];
  const personIds = [...new Set([...plan.personIds, ...selectedActivities.flatMap(activity => activity.participantIds)])].filter(id => allIds.includes(id));
  if (!personIds.length && (plan.rawPersonIds.length || plan.rawActivityIds.length || plan.invalidSelectionCount)) throw new Error('范围判断引用的人物或活动无法确认，未推进本段正文。');
  let next: NpcWorldState = { ...state, storyTime: plan.storyTime ? { text: plan.storyTime, source } : state.storyTime, processedThroughSeq: story.throughSeq };
  if (!personIds.length) return { state: next, report: { message: '本段没有需要推进的活动。', modelCalls: 1, materialReads: 1, throughSeq: story.throughSeq } };
  const read = await dependencies.materials.readForQuestion({ question: plan.question || storyBody, personIds, maxCharacters: 40000 });
  if (!['ready', 'empty'].includes(read.status)) throw new Error(read.message || '读取本批人物资料失败，未推进本批活动。');
  const relevantKnowledge = state.knowledge.filter(item => personIds.includes(item.personId) && state.events.some(event => event.id === item.eventId)).slice(-40);
  const knowledgeEventIds = new Set(relevantKnowledge.map(item => item.eventId));
  const selectedActivityIds = new Set(selectedActivities.map(activity => activity.id));
  const relevantEvents = state.events.filter(event => event.participantIds.some(id => personIds.includes(id)) || knowledgeEventIds.has(event.id) || (event.activityId !== null && selectedActivityIds.has(event.activityId))).slice(-20);
  const relevantEventIds = new Set(relevantEvents.map(event => event.id));
  const result = parseBatch(await dependencies.model.request({ task: 'advance', instructions: ADVANCE_INSTRUCTIONS, input: {
    story: storyBody, storyTime: next.storyTime, selectedPeople: people.filter(person => personIds.includes(person.id)).map(person => ({ id: person.id, name: person.displayName })),
    knownPeople: people.map(person => ({ id: person.id, name: person.displayName })),
    selectedActivities: selectedActivities.filter(activity => activity.participantIds.some(id => personIds.includes(id))),
    relevantEvents,
    relevantKnowledge: relevantKnowledge.filter(item => relevantEventIds.has(item.eventId)),
    materials: read.materials, routerBackground: read.routerText, partial: read.coverage.partial,
  } }));
  const allowedPeople = new Set(personIds);
  const activityIds = new Map<string, string>();
  const duplicateKeys = (items: unknown[], field: string) => {
    const counts = new Map<string, number>();
    for (const value of items) { const key = record(value)?.[field]; if (typeof key === 'string' && key.trim()) counts.set(key.trim(), (counts.get(key.trim()) ?? 0) + 1); }
    return new Set([...counts].filter(([, count]) => count > 1).map(([key]) => key));
  };
  const duplicateActivityKeys = duplicateKeys(result.activities, 'key');
  const duplicateEventKeys = duplicateKeys(result.events, 'key');
  const byId = new Map(state.activities.map(activity => [activity.id, { ...activity }]));
  const changedActivities = new Set<string>();
  let skipped = unknownSelections.length + plan.invalidSelectionCount + result.invalidCount;
  let statusNotices = 0;
  let adopted = false;
  for (const value of result.activities) {
    const item = record(value); if (!item) { skipped++; continue; }
    const existingId = typeof item.id === 'string' && byId.has(item.id) ? item.id : '';
    const title = typeof item.title === 'string' ? item.title.trim() : '';
    const key = typeof item.key === 'string' ? item.key.trim() : '';
    const participantValue = item.participantIds ?? item.personIds;
    const normalizedParticipants = idList(participantValue);
    const explicitParticipants = normalizedParticipants.present;
    const participants = normalizedParticipants.ids.filter(personId => allIds.includes(personId));
    skipped += normalizedParticipants.invalidCount + normalizedParticipants.ids.filter(personId => !allIds.includes(personId)).length;
    if (!existingId && (!title || !participants.some(personId => allowedPeople.has(personId)))) { skipped++; continue; }
    if (existingId && explicitParticipants && normalizedParticipants.ids.length > 0 && !participants.length) { skipped++; continue; }
    const id = existingId || uuid();
    if (key && !duplicateActivityKeys.has(key)) activityIds.set(key, id);
    const old = byId.get(id);
    const rawDescription = typeof item.description === 'string' ? item.description.trim() : '';
    const description = rawDescription || old?.description?.trim() || title || old?.title || '未命名活动';
    const statusProvided = Object.hasOwn(item, 'status');
    const parsedStatus = statusProvided ? status(item.status) : null;
    if (statusProvided && parsedStatus === null) statusNotices++;
    const activity: Activity = { id, title: title || old?.title || '未命名活动', description, status: statusProvided && parsedStatus ? parsedStatus : old?.status ?? 'planned', participantIds: explicitParticipants ? participants : old?.participantIds ?? [], sources: old?.sources ?? [source] };
    byId.set(id, activity); changedActivities.add(id);
    adopted = true;
  }
  const eventIds = new Map<string, string>();
  const addedEvents = [] as NpcWorldState['events'];
  for (const value of result.events) {
    const item = record(value); if (!item) { skipped++; continue; }
    const title = typeof item.title === 'string' ? item.title.trim() : '';
    const key = typeof item.key === 'string' ? item.key.trim() : '';
    const activityReference = typeof item.activityId === 'string' ? item.activityId.trim() : '';
    const activityId = duplicateActivityKeys.has(activityReference) ? null : (activityIds.get(activityReference) ?? activityReference) || null;
    if (!title || !activityId || !byId.has(activityId)) { skipped++; continue; }
    const normalizedParticipants = idList(item.participantIds ?? item.personIds);
    const participants = normalizedParticipants.ids.filter(id => allIds.includes(id));
    skipped += normalizedParticipants.invalidCount + normalizedParticipants.ids.filter(id => !allIds.includes(id)).length;
    const id = uuid(); if (key && !duplicateEventKeys.has(key)) eventIds.set(key, id);
    const description = typeof item.description === 'string' && item.description.trim() ? item.description.trim() : title;
    addedEvents.push({ id, activityId, title, description, storyTime: next.storyTime, participantIds: participants, sources: [source] });
    adopted = true;
  }
  const knowledge: Knowledge[] = [...state.knowledge];
  for (const value of result.knowledge) {
    const item = record(value); if (!item) { skipped++; continue; }
    const personId = typeof item.personId === 'string' ? item.personId : '';
    const eventReference = typeof item.eventId === 'string' ? item.eventId.trim() : '';
    const eventId = duplicateEventKeys.has(eventReference) ? '' : eventIds.get(eventReference) ?? eventReference;
    const event = addedEvents.find(candidate => candidate.id === eventId);
    const knownEvent = event ?? state.events.find(candidate => candidate.id === eventId);
    if (!allIds.includes(personId) || !knownEvent || typeof item.reason !== 'string' || !item.reason.trim()) { skipped++; continue; }
    adopted = true;
    if (knowledge.some(previous => previous.personId === personId && previous.eventId === eventId)) continue;
    knowledge.push({ personId, eventId, reason: item.reason.trim(), sources: [source] });
  }
  const modelReturnedItems = result.activities.length + result.events.length + result.knowledge.length + result.invalidCount;
  if (modelReturnedItems > 0 && !adopted) throw new Error('本段返回内容未能确认有效活动、结果或知情归属，尚未记录本段；请修正后重试。');
  next = { ...next, activities: [...byId.values()], events: [...state.events, ...addedEvents], knowledge };
  const note = [skipped ? ` 有 ${skipped} 条格式或归属无法确认的内容未记录。` : '', (duplicateActivityKeys.size || duplicateEventKeys.size) ? ' 临时引用键有重复，对应引用未采用。' : '', statusNotices ? ` 有 ${statusNotices} 个活动状态无法确认，旧活动已保留原状态，新活动按默认计划中处理。` : ''].filter(Boolean).join('');
  return { state: next, report: { message: `本段更新了 ${changedActivities.size} 项活动，记录 ${addedEvents.length} 项结果。${note}`, modelCalls: 2, materialReads: 2, throughSeq: story.throughSeq } };
}
