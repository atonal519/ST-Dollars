import type { AdvanceDependencies, AdvanceResult, QuestionMaterial, StoryInput } from '../application/contracts';
import type { SourcePerson } from '../domain/source-people';
import type { Activity, ActivityStatus, Knowledge, SourceRef } from '../domain/world';
import type { NpcWorldState } from '../domain/world-state';
import { isEffectiveEvent } from '../domain/world-facts';
import { applyCalibration, activityChange } from './calibration';
import { budgetedRequest, newId, projectAsOf, type AsOfBasis } from './trajectory';
import type { SimulationWindow, WorldEvent } from '../domain/world';
import type { StoryTurn } from '../application/contracts';
import { buildPersonContexts } from './person-context';
import { ADVANCE_INSTRUCTIONS, PLAN_INSTRUCTIONS } from './prompts';
import { parseBatch, parsePlan } from './parse';
import {returnedIdentity} from './returned-identity';

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
const storyText = (story: StoryInput) => story.turns.map(turn => `[seq:${turn.seq}] ${turn.isUser ? '故事user' : '正文'}：${turn.text}`).join('\n');

export async function advanceBatch(input: { people: SourcePerson[]; state: NpcWorldState; story: StoryInput; mode?: 'start' | 'advance'; window?: SimulationWindow; basis?: AsOfBasis; authorConstraints?: {events: WorldEvent[]; turns: StoryTurn[]}; inputCharacters?: number; shouldStop?: () => boolean; dependencies: AdvanceDependencies }): Promise<AdvanceResult> {
  const { people, story, dependencies } = input;
  let authority = input.state;
  const knownActivityRefs = new Map<string,string>();
  let state = input.basis ? projectAsOf(authority, input.basis, input.window) : authority;
  const savedActivityIds = new Set(authority.activities.map(activity => activity.id));
  const emptyMaterials = { status: 'empty' as const, message: '', routerText: '', materials: [] as QuestionMaterial[], coverage: { partial: false, cseStatus: 'ready' } };
  const readMaterials = (request: Parameters<AdvanceDependencies['materials']['readForQuestion']>[0]) => input.basis ? Promise.resolve(emptyMaterials) : dependencies.materials.readForQuestion(request);
  const mode = input.mode ?? 'advance';
  let actualWindow = input.window;
  const storyBody = input.basis ? '' : storyText(story);
  let source: SourceRef = input.window ? { kind: 'simulation', id: input.window.id, label: `${input.window.from.text} → ${input.window.to.text}` } : { ...story.source };
  const allIds = people.map(person => person.id);
  let personContext = buildPersonContexts(people, state);
  const planMaterial = await readMaterials({ question: '', personIds: allIds, maxCharacters: 16000 });
  if (!['ready', 'empty'].includes(planMaterial.status)) throw new Error(planMaterial.message || '读取人物资料失败，未推进本批活动。');
  if (allIds.length > 100) throw new Error('当前人物超过单次资料读取上限，未推进本批活动。');
  const rawPlan = await budgetedRequest(dependencies.model, { task: 'plan', instructions: PLAN_INSTRUCTIONS, input: {
    mode, window: input.window, authorConstraints: input.basis ? { ...input.authorConstraints, currentActivities: authority.activities } : input.authorConstraints, pastBackgrounds: input.basis?.backgrounds,
    people: people.map(person => ({ id: person.id, name: person.displayName })), story: storyBody, previousStoryTime: state.storyTime,
    unfinishedActivities: state.activities.filter(item => item.status !== 'completed'),
    personContexts: personContext.personContexts, worldEventIds: personContext.worldEventIds, contextEvents: personContext.contextEvents,
    routerBackground: planMaterial.routerText, personMaterials: planMaterial.materials, partial: planMaterial.coverage.partial,
  } }, input.inputCharacters);
  if (input.shouldStop?.()) return { state: authority, window: actualWindow, report: { message: '已停止后续段，本段未保存。', modelCalls: 1, materialReads: input.basis ? 0 : 1, throughSeq: story.throughSeq } };
  const plan = parsePlan(rawPlan);
  if (!input.basis && actualWindow && mode !== 'start' && plan.windowEnd) {
    const end = plan.windowEnd;
    if (typeof end.text === 'string' && end.text.trim() && Array.isArray(end.sourceSeqs) && end.sourceSeqs.length && end.sourceSeqs.every((seq: number) => story.turns.some(t => t.seq === seq))) {
      const to = { id: newId(), text: end.text.trim(), sourceSeqs: [...new Set(end.sourceSeqs)] as number[] };
      actualWindow = { ...actualWindow, kind: end.elapsed === true && actualWindow.from.text !== '当前时点（过去未补写）' ? 'elapsed' : 'current', to };
      source = { kind: 'simulation', id: actualWindow.id, label: actualWindow.kind === 'elapsed' ? `${actualWindow.from.text} → ${to.text}` : to.text };
    }
  }
  if (plan.calibration) {
    authority = applyCalibration({ state: authority, calibration: plan.calibration, people, turns: input.authorConstraints?.turns ?? story.turns, authorFacts: input.basis ? input.authorConstraints?.events : undefined, activityRefs: knownActivityRefs, newActivityThroughSeq: input.window?.throughSeq });
    state = input.basis ? projectAsOf(authority, input.basis, input.window) : authority;
    for(const activity of authority.activities) savedActivityIds.add(activity.id);
    for(const intention of plan.intentions) if(intention.activityId) intention.activityId=knownActivityRefs.get(intention.activityId)??intention.activityId;
    plan.activityIds=plan.activityIds.map(id=>knownActivityRefs.get(id)??id);
    plan.rawActivityIds=plan.rawActivityIds.map(id=>knownActivityRefs.get(id)??id);
  }
  if (plan.continuingEffects.length) {
    const updates = new Map(plan.continuingEffects.filter((e: any) => state.events.some(v => v.id === e.eventId) && Array.isArray(e.personIds) && e.personIds.every((id: string) => allIds.includes(id))).map((e: any) => [e.eventId, e.personIds]));
    authority = { ...authority, events: authority.events.map(e => updates.has(e.id) ? { ...e, continuingForPersonIds: updates.get(e.id) as string[] } : e) };
    state = { ...state, events: state.events.map(e => authority.events.find(a => a.id === e.id) ?? e) };
  }
  personContext = buildPersonContexts(people, state);
  const keptManual = (plan.calibration?.activityUpdates ?? []).some(item => authority.activities.find(a => a.id === item.id)?.sources.some(s => s.kind === 'manual')) || (plan.calibration?.eventCorrections ?? []).some(item => authority.events.find(e => e.id === item.eventId)?.sources.some(s => s.kind === 'manual'));
  const validIntentions = plan.intentions.filter(item => allIds.includes(item.personId));
  const unknownIntentions = plan.intentions.filter(item => !allIds.includes(item.personId));
  const actionIntentions = validIntentions.filter(item => item.action);
  const waitIntentions = validIntentions.filter(item => !item.action && item.waitReason);
  const requestedPeople = new Set(plan.legacy ? plan.personIds.filter(id => allIds.includes(id)) : actionIntentions.flatMap(item => [item.personId, ...(item.interactionPersonIds ?? []).filter(id => allIds.includes(id))]));
  const requestedActivityIds = new Set(plan.legacy ? plan.activityIds : actionIntentions.map(item => item.activityId).filter((id): id is string => !!id));
  const selectedActivities = state.activities.filter(activity => activity.status !== 'completed' && (
    requestedActivityIds.has(activity.id) || activity.participantIds.some(id => requestedPeople.has(id))
  ));
  const unknownSelections = [...plan.rawPersonIds.filter(id => !allIds.includes(id)), ...plan.rawActivityIds.filter(id => !savedActivityIds.has(id)), ...unknownIntentions.map(item => item.personId), ...actionIntentions.map(item => item.activityId).filter((id): id is string => !!id && !savedActivityIds.has(id))];
  const personIds = [...new Set([...requestedPeople, ...selectedActivities.flatMap(activity => activity.participantIds)])].filter(id => allIds.includes(id));
  if (!personIds.length && (plan.rawPersonIds.length || plan.rawActivityIds.length || actionIntentions.length || (unknownIntentions.length || plan.invalidSelectionCount) && !waitIntentions.length)) throw new Error('范围判断引用的人物或活动无法确认，未推进本段正文。');
  let next: NpcWorldState = { ...authority, storyTime: input.basis ? { text: source.label, source } : mode === 'start' ? state.storyTime : actualWindow && !input.basis && plan.windowEnd ? { text: actualWindow.to.text, source } : plan.storyTime ? { text: plan.storyTime, source } : state.storyTime, processedThroughSeq: story.throughSeq };
  if (!personIds.length) {
    if (story.throughSeq !== null) next.currentTimeStartedThroughSeq = Math.max(state.currentTimeStartedThroughSeq ?? 0, story.throughSeq);
    const message = plan.legacy
      ? `检查了 ${people.length} 位人物，选择 0 位；更新 0 项活动，新增 0 项结果。本轮未选择行动。`
      : `行动意图 0 位，等待 ${new Set(waitIntentions.map(item => item.personId)).size} 位，扩入批次上下文 0 位；更新 0 项活动，新增 0 项结果。${unknownSelections.length + plan.invalidSelectionCount ? `另有 ${unknownSelections.length + plan.invalidSelectionCount} 条意图或引用无法确认，未采用。` : ''}`;
    return { state: next, calibration: plan.calibration, calibratedState: authority, window: actualWindow, report: { message: message + (keptManual ? ' 已保留人工修订内容。' : ''), modelCalls: 1, materialReads: input.basis ? 0 : 1, throughSeq: story.throughSeq } };
  }
  const intentionQuestion = actionIntentions.map(item => item.action).join('；');
  const read = await readMaterials({ question: plan.question || (plan.legacy ? storyBody : intentionQuestion), personIds, maxCharacters: 40000 });
  if (!['ready', 'empty'].includes(read.status)) throw new Error(read.message || '读取本批人物资料失败，未推进本批活动。');
  const selectedPeople = new Set(personIds);
  const selectedContexts = personContext.personContexts.filter(context => selectedPeople.has(context.personId));
  const knownBySelected = new Set(selectedContexts.flatMap(context => context.knownEvents.map(item => JSON.stringify([context.personId, item.eventId]))));
  const relevantKnowledge = state.knowledge.filter(item => knownBySelected.has(JSON.stringify([item.personId, item.eventId])));
  const knowledgeEventIds = new Set(relevantKnowledge.map(item => item.eventId));
  const selectedActivityIds = new Set(selectedActivities.map(activity => activity.id));
  const selectedEventIds = new Set(selectedContexts.flatMap(context => [...context.participatedEventIds, ...context.continuingEventIds]));
  const relatedActivityEventIds = new Set<string>(); const counts = new Map<string, number>();
  for (let index = state.events.length - 1; index >= 0; index--) {
    const event = state.events[index]; const activityId = event.activityId;
    if (!isEffectiveEvent(event) || !activityId || !selectedActivityIds.has(activityId)) continue;
    const count = counts.get(activityId) ?? 0;
    if (count < 6) { relatedActivityEventIds.add(event.id); counts.set(activityId, count + 1); }
  }
  const relevantEventIds = new Set([...selectedEventIds, ...knowledgeEventIds, ...relatedActivityEventIds, ...personContext.worldEventIds]);
  const relevantEvents = state.events.filter(event => relevantEventIds.has(event.id));
  const selectedMaterials = mergeMaterials(read.materials, planMaterial.materials.filter(item => personIds.includes(item.personId)));
  if (input.shouldStop?.()) return { state: authority, window: actualWindow, report: { message: '已停止后续段，本段未保存。', modelCalls: 1, materialReads: input.basis ? 0 : 2, throughSeq: story.throughSeq } };
  const rawBatch = await budgetedRequest(dependencies.model, { task: 'advance', instructions: ADVANCE_INSTRUCTIONS, input: {
    mode, window: actualWindow, authorConstraints: input.basis ? { ...input.authorConstraints, currentActivities: authority.activities } : input.authorConstraints, pastBackgrounds: input.basis?.backgrounds.filter(item => personIds.includes(item.personId)), story: storyBody, storyTime: next.storyTime, selectedPeople: people.filter(person => personIds.includes(person.id)).map(person => ({ id: person.id, name: person.displayName })),
    ...(plan.legacy ? {} : { intentions: validIntentions.filter(item => personIds.includes(item.personId)).map(item => ({ ...item, activityId: item.activityId && savedActivityIds.has(item.activityId) ? item.activityId : null })) }),
    knownPeople: people.map(person => ({ id: person.id, name: person.displayName })),
    selectedActivities: selectedActivities.filter(activity => activity.participantIds.some(id => personIds.includes(id))),
    personContexts: selectedContexts, worldEventIds: personContext.worldEventIds,
    materials: selectedMaterials,
    relevantEvents,
    relevantKnowledge: relevantKnowledge.filter(item => relevantEventIds.has(item.eventId)),
    routerBackground: joinMaterial(read.routerText, planMaterial.routerText), partial: planMaterial.coverage.partial || read.coverage.partial,
  } }, input.inputCharacters);
  if (input.shouldStop?.()) return { state: authority, window: actualWindow, report: { message: '已停止后续段，本段未保存。', modelCalls: 2, materialReads: input.basis ? 0 : 2, throughSeq: story.throughSeq } };
  const result = parseBatch(rawBatch);
  const existingEventIds = new Set(authority.events.map(event => event.id));
  for(const table of ['activities','events'] as const)result[table]=result[table].flatMap(value=>{
    const row=record(value);if(!row)return [value];
    const normalized=returnedIdentity(row,table==='activities'?savedActivityIds:existingEventIds);
    if(!normalized){result.invalidCount++;return [];}return [normalized];
  });
  const allowedPeople = new Set(personIds);
  const activityIds = new Map<string, string>(knownActivityRefs);
  const duplicateKeys = (items: unknown[], field: string) => {
    const counts = new Map<string, number>();
    for (const value of items) { const key = record(value)?.[field]; if (typeof key === 'string' && key.trim()) counts.set(key.trim(), (counts.get(key.trim()) ?? 0) + 1); }
    return new Set([...counts].filter(([, count]) => count > 1).map(([key]) => key));
  };
  // 身份可跨时点引用；同批 id/key 只是明确别名，不能遮蔽另一项真实身份。
  const activityAliases = new Map<string, Set<string>>([...savedActivityIds].map(id => [id, new Set([`saved:${id}`])]));
  for(const [key,id] of knownActivityRefs) activityAliases.set(key,new Set([`saved:${id}`]));
  result.activities.forEach((value, index) => {
    const item = record(value); if (!item) return;
    const reference = typeof item.id === 'string' ? item.id.trim() : '';
    const id = knownActivityRefs.get(reference) ?? reference;
    const target = savedActivityIds.has(id) ? `saved:${id}` : `new:${index}`;
    for (const alias of [id, typeof item.key === 'string' ? item.key.trim() : ''].filter(Boolean)) {
      const targets = activityAliases.get(alias) ?? new Set<string>(); targets.add(target); activityAliases.set(alias, targets);
    }
  });
  const duplicateActivityKeys = new Set([...activityAliases].filter(([, targets]) => targets.size > 1).map(([alias]) => alias));
  const duplicateEventKeys = duplicateKeys(result.events, 'key');
  const byId = new Map(state.activities.map(activity => [activity.id, { ...activity }]));
  const historicalChanges = new Map<string, import('../domain/world').ActivityChange>();
  const changedActivities = new Set<string>();
  let unrecordedProgress = 0;
  let unchangedActivities = 0;
  let skipped = unknownSelections.length + plan.invalidSelectionCount + result.invalidCount;
  let statusNotices = 0;
  let adopted = false;
  for (const value of result.activities) {
    const item = record(value); if (!item) { skipped++; continue; }
    const reference = typeof item.id === 'string' ? item.id.trim() : '';
    const resolved = knownActivityRefs.get(reference) ?? reference;
    const existingId = savedActivityIds.has(resolved) ? resolved : '';
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
    for (const alias of [key, reference].filter(Boolean)) if (!duplicateActivityKeys.has(alias)) activityIds.set(alias, id);
    const old = byId.get(id);
    if (authority.activities.find(a => a.id === id)?.sources.some(s => s.kind === 'manual')) continue;
    if (old?.sources.some(s => s.kind === 'manual')) continue;
    const rawDescription = typeof item.description === 'string' ? item.description.trim() : '';
    const statusProvided = Object.hasOwn(item, 'status');
    const parsedStatus = statusProvided ? status(item.status) : null;
    if (statusProvided && parsedStatus === null) statusNotices++;
    if (input.basis && existingId && !old) {
      const change = activityChange({ ...item, ...(parsedStatus ? { status: parsedStatus } : {}), ...(explicitParticipants ? { participantIds: participants } : {}) }, new Set(allIds));
      if (Object.keys(change).length) historicalChanges.set(id, change);
      // 未知的过去字段不从当前概况补齐；已知身份仍能关联本段结果。
      if (!title || !participants.length || !parsedStatus) continue;
    }
    const description = existingId ? old?.description?.trim() || title || old?.title || '未命名活动' : rawDescription || title || '未命名活动';
    const historicalDescription = input.basis && existingId && !old ? rawDescription : description;
    const progressOnlyDescription = !!existingId && !!rawDescription && rawDescription !== old?.description?.trim();
    if (progressOnlyDescription) unrecordedProgress++;
    const activity: Activity = { ...old, id, title: title || old?.title || '未命名活动', description: historicalDescription, status: statusProvided && parsedStatus ? parsedStatus : old?.status ?? 'planned', participantIds: explicitParticipants ? participants : old?.participantIds ?? [], sources: old?.sources ?? [source] };
    const changed = !old || activity.title !== old.title || activity.status !== old.status || !sameIds(activity.participantIds, old.participantIds);
    if (!changed) { if (!progressOnlyDescription) unchangedActivities++; continue; }
    byId.set(id, activity); changedActivities.add(id);
    if (!historicalChanges.has(id)) adopted = true;
  }
  const eventIds = new Map<string, string>();
  const addedEvents = [] as NpcWorldState['events'];
  for (const value of result.events) {
    const item = record(value); if (!item) { skipped++; continue; }
    const title = typeof item.title === 'string' ? item.title.trim() : '';
    const key = typeof item.key === 'string' ? item.key.trim() : '';
    const hasExplicitId = typeof item.id === 'string' && !!item.id.trim();
    const explicitId = typeof item.id === 'string' ? item.id.trim() : '';
    if (hasExplicitId && (!explicitId || !existingEventIds.has(explicitId))) { skipped++; continue; }
    if (hasExplicitId) { if (key && !duplicateEventKeys.has(key)) eventIds.set(key, explicitId); continue; }
    const activityReference = typeof item.activityId === 'string' ? item.activityId.trim() : '';
    const activityId = duplicateActivityKeys.has(activityReference) ? null : (activityIds.get(activityReference) ?? activityReference) || null;
    if (!title || !activityId || !byId.has(activityId) && !savedActivityIds.has(activityId)) { skipped++; continue; }
    const normalizedParticipants = idList(item.participantIds ?? item.personIds);
    const participants = normalizedParticipants.ids.filter(id => allIds.includes(id));
    skipped += normalizedParticipants.invalidCount + normalizedParticipants.ids.filter(id => !allIds.includes(id)).length;
    const id = uuid(); if (key && !duplicateEventKeys.has(key)) eventIds.set(key, id);
    const description = typeof item.description === 'string' && item.description.trim() ? item.description.trim() : title;
    const change = (byId.get(activityId) ?? authority.activities.find(a => a.id === activityId))?.sources.some(s => s.kind === 'manual') ? {} : activityChange(item.activityChange, new Set(allIds));
    const actualTime = typeof item.storyTime === 'string' && item.storyTime.trim() ? item.storyTime.trim() : actualWindow ? source.label : next.storyTime?.text;
    addedEvents.push({ id, activityId, title, description, storyTime: actualTime ? { text: actualTime, source } : null, participantIds: participants, sources: [source], ...(input.window ? { simulationWindowId: input.window.id } : {}), ...(Object.keys(change).length ? { activityChange: change } : {}), ...(Array.isArray(item.continuingForPersonIds) ? { continuingForPersonIds: stringsForPeople(item.continuingForPersonIds, allIds) } : {}) });
    adopted = true;
  }
  const knowledge: Knowledge[] = [...authority.knowledge];
  for (const value of result.knowledge) {
    const item = record(value); if (!item) { skipped++; continue; }
    const personId = typeof item.personId === 'string' ? item.personId : '';
    const eventReference = typeof item.eventId === 'string' ? item.eventId.trim() : '';
    const eventId = duplicateEventKeys.has(eventReference) ? '' : eventIds.get(eventReference) ?? eventReference;
    const event = addedEvents.find(candidate => candidate.id === eventId);
    const knownEvent = event ?? authority.events.find(candidate => candidate.id === eventId);
    if (!allIds.includes(personId) || !knownEvent || typeof item.reason !== 'string' || !item.reason.trim()) { skipped++; continue; }
    if (knowledge.some(previous => previous.personId === personId && previous.eventId === eventId)) continue;
    adopted = true;
    knowledge.push({ personId, eventId, reason: item.reason.trim(), sources: [source] });
  }
  unrecordedProgress += [...historicalChanges.keys()].filter(id => !addedEvents.some(event => event.activityId === id)).length;
  const modelReturnedItems = result.activities.length - unchangedActivities + result.events.length + result.knowledge.length + result.invalidCount;
  if (modelReturnedItems > 0 && !adopted) {
    if (unrecordedProgress > 0 && skipped === 0 && statusNotices === 0 && !result.events.length && !result.knowledge.length && !result.invalidCount) throw new Error('本轮旧活动进展缺少结果记录，尚未保存；可重新推进。');
    throw new Error('本段模型结果未能读取或关联到人物、活动及事件，尚未保存。');
  }
  next = { ...next, activities: [...byId.values()], events: [...authority.events, ...addedEvents], knowledge };
  if (story.throughSeq !== null) next.currentTimeStartedThroughSeq = Math.max(state.currentTimeStartedThroughSeq ?? 0, story.throughSeq);
  const note = [keptManual ? ' 已保留人工修订内容。' : '', skipped ? ` 有 ${skipped} 条格式或归属无法确认的内容未记录。` : '', unrecordedProgress ? ` 有 ${unrecordedProgress} 项旧活动进展未作为结果记录，已略过。` : '', (duplicateActivityKeys.size || duplicateEventKeys.size) ? ' 临时引用键有重复，对应引用未采用。' : '', statusNotices ? ` 有 ${statusNotices} 个活动状态无法确认，旧活动已保留原状态，新活动按默认计划中处理。` : ''].filter(Boolean).join('');
  const actionPeopleCount = new Set(actionIntentions.flatMap(item => [item.personId, ...(item.interactionPersonIds ?? []).filter(id => allIds.includes(id))])).size;
  const waitOnlyPeopleCount = new Set(waitIntentions.filter(item => !actionIntentions.some(action => action.personId === item.personId)).map(item => item.personId)).size;
  const contextPeopleCount = personIds.filter(id => !actionIntentions.some(item => item.personId === id)).length;
  const summary = plan.legacy ? `检查了 ${people.length} 位人物，选择 ${personIds.length} 位` : `行动意图 ${actionPeopleCount} 位，等待 ${waitOnlyPeopleCount} 位，扩入批次上下文 ${contextPeopleCount} 位`;
  const currentActivityUpdates = result.currentActivityUpdates.flatMap(value => { const item = record(value); if (!item || !authority.activities.some(a => a.id === item.id) || authority.activities.find(a => a.id === item.id)!.sources.some(s => s.kind === 'manual')) return []; const change = activityChange(item.change, new Set(allIds)); return Object.keys(change).length ? [{id: item.id as string, change}] : []; });
  // Event changes are explicit; the activity endpoint is never a past-event snapshot.
  if (input.window) for (const event of addedEvents) {
    const activity = byId.get(event.activityId ?? '');
    if (activity && event.activityChange) byId.set(activity.id, { ...activity, ...event.activityChange });
  }
  if (!input.basis) for (const update of currentActivityUpdates) { const old = byId.get(update.id); if (old) byId.set(old.id, {...old, ...update.change}); }
  next = { ...next, activities: [...byId.values()] };
  return { state: next, currentActivityUpdates, calibration: plan.calibration, calibratedState: authority, window: actualWindow, report: { message: `${summary}；更新 ${changedActivities.size} 项活动，新增 ${addedEvents.length} 项结果。${note}`, modelCalls: 2, materialReads: input.basis ? 0 : 2, throughSeq: story.throughSeq } };
}

function mergeMaterials(focused: QuestionMaterial[], general: QuestionMaterial[]) {
  const byId = new Map(general.map(item => [item.personId, item]));
  for (const item of focused) {
    const previous = byId.get(item.personId);
    if (!previous) { byId.set(item.personId, item); continue; }
    byId.set(item.personId, {
      ...previous,
      profileText: joinMaterial(item.profileText, previous.profileText),
      stateText: joinMaterial(item.stateText, previous.stateText),
      memoryText: joinMaterial(item.memoryText, previous.memoryText),
      refs: [...previous.refs, ...item.refs],
      sources: [...previous.sources, ...item.sources],
    });
  }
  return [...byId.values()];
}

function joinMaterial(primary: string, fallback: string) {
  if (!primary) return fallback;
  if (!fallback || primary === fallback || primary.includes(fallback)) return primary;
  if (fallback.includes(primary)) return fallback;
  return `${primary}\n${fallback}`;
}

function sameIds(left: string[], right: string[]) {
  return left.length === right.length && left.every((id, index) => id === right[index]);
}

function stringsForPeople(value: unknown[], allIds: string[]) { return [...new Set(value.filter((id): id is string => typeof id === 'string' && allIds.includes(id)))]; }
