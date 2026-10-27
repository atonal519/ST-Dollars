import type { ModelRequester, StoryTurn } from '../application/contracts';
import type { SourcePerson } from '../domain/source-people';
import type { Activity, ActivityChange, SimulationWindow, WorldEvent } from '../domain/world';
import type { NpcWorldState } from '../domain/world-state';
import { activityChange, applyCalibration, eligibleCalibration, modelReferenceContract, type Calibration } from './calibration';
import { asObject, list, newId, parsePreparedTrajectory, priorWindowIds, projectAsOf, responseObject, savedWindowChain, strings } from './trajectory';
import { mergeRanges, subtractRanges, type HistoryRange } from '../history/batches';
import { factEvidenceKind } from './fact-sources';
import {returnedIdentity} from './returned-identity';

export const BATCH_TRAJECTORY_INSTRUCTIONS = `创作所选历史范围内正文镜头外的人物生活，一次回答完成过去起点、故事时间分段、人物选择、校准和实际结果。这是创作，不是抽取漏记：正文未写不等于没有发生，允许依据人物身份、性格、关系和动机，在时间段内创作新的事务、行动及后果。考虑所有人物各自的生活，允许平静；不要代替故事user回应，不把所有未出镜人物都安排等待。不输出思考过程。
正式正文优先；正文中的草稿、HTML注释、参考/图片说明不能冒充已发生事实。输入turn.calibrationEligible=false只供时间/镜头参考，不作正文校准依据；幕后新进展不改标正文来源。people.description是当前已加载档案，仅作作者参考；历史依据支持的身份和背景才可用于过去，不能把当前档案直接填入initialBasis。当前活动不搬回过去，不让人物提前知道未来；既定背景和过去知情缺依据时保持未知，这不禁止创作镜头外的新行动。既有正文场景不要重写成新增幕后，不捏造或改写原文事实。人工内容保留。初始过去状态须有已提供正文事实或原文来源；旧generated记录不能独立证明正文。
返回JSON：{initialBasis:{backgrounds:[{personId,text,eventIds,sourceSeqs}],activities:[{id,title,description,status,participantIds,eventIds,sourceSeqs}],knowledge:[{personId,eventId,reason,sourceSeqs}]},boundaries:[{key,id?,text,sourceSeqs}],segments:[{id?,key,kind:"elapsed|current",from,to,throughSeq,usedFactIds:[],activities:[],newEvents:[],knowledge:[],quietReason?,calibration?,continuingEffects:[],currentActivityUpdates:[]}]}。
selected.mode=rework表示重补全部requiredRanges/requiredWindowIds，savedWindows只表示旧处理位置，不代表已有人物生活；不得跳过旧窗从末端续写。每个要求旧窗都返回实际结果或明确quietReason，不省略。initialBasis只针对firstRequiredBoundary之前，允许空；不得把后窗事实或状态填成该起点的过去。继续任务仍只完成列明的requiredRanges，不重复刚保存的部分。
边界按故事顺序，时间保留原文相对表述；每段from/to引用边界key或ID，前后连续，throughSeq是本段依据截止楼，覆盖所选范围。重补旧段沿用原窗ID和原切点；所选结束在旧窗内部时仍用原窗id，to可为所选范围内新边界，仅补局部结果，不改变旧窗覆盖。最后段不必然是当前；仅selected.isCurrent允许currentActivityUpdates。
activities中既有活动用id，新活动用key，含title/description/status(planned|active|waiting|completed)/participantIds；不要克隆已有活动。newEvents仅填真正新增结果：{key,activityId,title,description,participantIds,storyTime?,activityChange?,continuingForPersonIds?}，description交代行动、原因与实际后果；activityChange只填该时点明确变化。旧事件仅列usedFactIds，不把旧ID/正文原句放newEvents冒充新结果。knowledge:{personId,eventId,reason}须有实际获知途径，允许引用旧事件；参与不自动等于知情，世界事实也不自动公开。
同一回答活动/事件key全批唯一，仅可引用本段或前段，知识可引用旧事件或新事件key。没有新变化的段明确quietReason，不为凑条数强造情节；但不能只因正文没有记载镜头外行动就判断整段平静。initialBasis.activities仅引用已知活动ID。校准格式沿input.calibrationContract：正文新增事实须有实际原楼，只纠正被正文明确推翻的部分，保留已真实发生的内容，不因摘要未提细节就整条作废；保留旧说法及知情的作废/报告性质，不自动知道真相。不要重复已有知情。
只输出完整JSON，不省略后段，不加额外请求或材料申请。`;

export interface TrajectoryBatchInput { people: SourcePerson[]; state: NpcWorldState; turns: StoryTurn[]; fromSeq: number; currentThroughSeq: number; targetRanges?: HistoryRange[] }
export interface TrajectoryCandidate { state: NpcWorldState; windows: SimulationWindow[]; addedEvents: number; addedActivities: number; addedKnowledge: number; remainingRanges: HistoryRange[] }
function batchRequirements(input: TrajectoryBatchInput) {
  const throughSeq = input.turns.at(-1)?.seq ?? input.fromSeq;
  const ranges = mergeRanges(input.targetRanges ?? [{ fromSeq: input.fromSeq, toSeq: throughSeq }]);
  const chain = savedWindowChain(input.state) ?? [];
  const spans = new Map<string, HistoryRange>();
  chain.forEach((window, index) => spans.set(window.id, { fromSeq: index ? chain[index - 1].throughSeq + 1 : Math.min(...window.from.sourceSeqs), toSeq: window.throughSeq }));
  const required = chain.filter(window => { const span = spans.get(window.id)!; return ranges.some(range => span.fromSeq <= range.toSeq && span.toSeq >= range.fromSeq); });
  const prior = chain.filter(window => window.throughSeq < ranges[0]?.fromSeq).at(-1);
  return { ranges, chain, spans, required, firstBoundary: required[0]?.from ?? prior?.to };
}

export function trajectoryBatchInput(input: TrajectoryBatchInput) {
  const requirements = batchRequirements(input);
  return {
    people: input.people.map(p => ({ id: p.id, name: p.displayName, aliases: p.aliases, description: p.description })),
    selected: { fromSeq: input.fromSeq, throughSeq: input.turns.at(-1)?.seq, isCurrent: input.turns.at(-1)?.seq === input.currentThroughSeq && requirements.ranges.some(range => range.toSeq === input.currentThroughSeq), mode: requirements.required.length ? 'rework' : 'extend', requiredRanges: requirements.ranges, requiredWindowIds: requirements.required.map(window => window.id), firstRequiredBoundary: requirements.firstBoundary ?? null },
    turns: input.turns,
    facts: input.state.events.map(e => ({ ...e, evidenceKind: factEvidenceKind(e, input.state.scopeId) })),
    currentActivities: input.state.activities, knowledge: input.state.knowledge, savedWindows: input.state.simulationRanges ?? [],
    ...modelReferenceContract(input.state,input.turns),
  };
}

/** One model answer; all temporal application below is local and has no persistence side effect. */
export async function generateTrajectoryBatch(input: TrajectoryBatchInput & { model: ModelRequester; shouldStop?: () => boolean }): Promise<TrajectoryCandidate | null> {
  if (input.shouldStop?.()) return null;
  const value = await input.model.request({ task: 'trajectory-batch', instructions: BATCH_TRAJECTORY_INSTRUCTIONS, input: trajectoryBatchInput(input) });
  if (input.shouldStop?.()) return null;
  return applyTrajectoryBatch(value, input);
}

export function applyTrajectoryBatch(value: unknown, input: TrajectoryBatchInput): TrajectoryCandidate {
  const raw = responseObject(value); const returnedRows = list(raw.segments ?? raw.windows);
  if (!returnedRows.length) throw new Error('没有读到完整的幕后结果，请重新生成。');
  // An old window cannot be extended under its identity, including its attached calibration.
  const saved = new Map((input.state.simulationRanges ?? []).map(window => [window.id, window]));
  const rows = returnedRows.filter(row => { const old = saved.get(row.id); return !old || !Number.isInteger(row.throughSeq) || row.throughSeq <= old.throughSeq; });
  if (!rows.length) throw new Error('返回的旧时间段超出了原范围，原记录未改；请重新生成。');
  const prepared = parsePreparedTrajectory({ ...raw, windows: rows.map(row => ({ ...row, authorEventIds: strings(row.usedFactIds), authorFloorSeqs: [], rawFloorSeqs: [] })) }, input, new Set(input.state.events.map(e => e.id)), new Set(input.turns.map(t => t.seq)), true);
  const selectedThrough = input.turns.at(-1)?.seq;
  const requirements = batchRequirements(input);
  const covered: HistoryRange[] = []; const acceptedWindows: SimulationWindow[] = [];
  if (prepared.windows.length !== rows.length) throw new Error('幕后结果的时间段无法确认，请重新生成。');
  // A late answer's basis cannot be moved back to the requested missing beginning.
  if (requirements.firstBoundary && prepared.windows[0]?.from.id !== requirements.firstBoundary.id) prepared.initialBasis = { backgrounds: [], activities: [], knowledge: [] };
  let state = input.state;
  const originalActivityIds = new Set(input.state.activities.map(a => a.id));
  const originalEventIds = new Set(input.state.events.map(event=>event.id));
  const people = new Set(input.people.map(p => p.id)); const activityRefs = new Map<string, string>(); const eventRefs = new Map<string, string>();
  const calibratedActivityKeys = new Set<string>();
  const factRefs = new Map<string, string>();
  const allKeys = new Map<string, number>();
  const declaredActivities = new Set(input.state.activities.map(a => a.id));
  const declare = (aliases: unknown[]) => { for (const alias of new Set(aliases.filter((v): v is string => typeof v === 'string' && !!v.trim()).map(v => v.trim()))) allKeys.set(alias, (allKeys.get(alias) ?? 0) + 1); };
  for (const row of rows) {
    for (const value of list(row.activities)) {
      const item=returnedIdentity(value,originalActivityIds);if(!item)continue;
      declare([item.key, ...(typeof item.id === 'string' && !declaredActivities.has(item.id) ? [item.id] : [])]);
      if (typeof item.key === 'string') declaredActivities.add(item.key);
      if (typeof item.id === 'string') declaredActivities.add(item.id);
    }
    for (const value of list(row.newEvents ?? row.events)) {const item=returnedIdentity(value,originalEventIds);if(item)declare([item.key]);}
  }
  const bind = (map: Map<string, string>, key: unknown, id: string) => { if (typeof key === 'string' && key.trim() && allKeys.get(key.trim()) === 1 && !input.state.activities.some(a => a.id === key) && !input.state.events.some(e => e.id === key)) map.set(key.trim(), id); };
  let addedEvents = 0, addedActivities = 0, addedKnowledge = 0, inScopeRows = 0;
  for (let index = 0; index < rows.length; index++) {
    const row = rows[index]; const window = prepared.windows[index];
    const oldSpan = requirements.spans.get(window.id);
    const previous = [...(state.simulationRanges ?? [])].filter(previous => previous.to.id === window.from.id && previous.id !== window.id);
    const fromSeq = oldSpan?.fromSeq ?? (previous.length ? Math.max(...previous.map(previous => previous.throughSeq)) + 1 : Math.min(...window.from.sourceSeqs));
    const actualRange = { fromSeq, toSeq: window.throughSeq };
    if (oldSpan && window.throughSeq > oldSpan.toSeq || !requirements.ranges.some(range => actualRange.fromSeq <= range.toSeq && actualRange.toSeq >= range.fromSeq && window.throughSeq >= range.fromSeq && window.throughSeq <= range.toSeq)) continue;
    inScopeRows++;
    const source = { kind: 'simulation' as const, id: window.id, label: `${window.from.text} → ${window.to.text}` };
    const isCurrent = window.throughSeq === input.currentThroughSeq && requirements.ranges.some(range => range.toSeq === input.currentThroughSeq);
    let calibrationChanges = 0;
    const calibrationActivities = new Map<string, ActivityChange>();
    const normalizedCalibration = asObject(row.calibration);
    if (normalizedCalibration) {
      let calibration = Object.fromEntries(['facts', 'eventCorrections', 'activityUpdates', 'knowledgeCorrections'].map(key => [key, list(normalizedCalibration[key])])) as unknown as Calibration;
      for (const fact of calibration.facts) if (fact.id) fact.id = factRefs.get(fact.id) ?? fact.id;
      calibration.activityUpdates=calibration.activityUpdates.map(update=>{
        const row=returnedIdentity(update,originalActivityIds)??update;
        return row.id?{...row,id:activityRefs.get(row.id)??row.id}:row;
      });
      for (const correction of [...calibration.eventCorrections, ...calibration.knowledgeCorrections]) correction.eventId = eventRefs.get(correction.eventId) ?? correction.eventId;
      calibration = eligibleCalibration(calibration, input.turns, state.knowledge, window.throughSeq);
      const corrected = applyCalibration({ state, calibration, people: input.people, turns: input.turns, authorFacts: input.state.events, refs: factRefs, activityRefs, newActivityThroughSeq: window.throughSeq });
      const newKnown = corrected.activities.filter(activity => !state.activities.some(old => old.id === activity.id));
      addedActivities += newKnown.length;
      if (newKnown.length || JSON.stringify(corrected.events) !== JSON.stringify(state.events) || JSON.stringify(corrected.knowledge) !== JSON.stringify(state.knowledge) || isCurrent && JSON.stringify(corrected.activities) !== JSON.stringify(state.activities)) calibrationChanges++;
      for (const update of calibration.activityUpdates) {
        const id = update.id ?? activityRefs.get(update.key ?? '');
        if (id && corrected.activities.some(a => a.id === id)) {
          if(update.key && activityRefs.get(update.key) === id) calibratedActivityKeys.add(update.key);
          if(!state.activities.find(a => a.id === id)?.sources.some(s => s.kind === 'manual')) calibrationActivities.set(id, activityChange(update.change, people));
        }
      }
      // Historical corrections must not replace the later/current activity summary.
      state = { ...corrected, activities: isCurrent ? corrected.activities : [...state.activities,...newKnown] };
    }
    for (const effect of list(row.continuingEffects)) {
      if (!Array.isArray(effect.personIds) || !effect.personIds.every((id: string) => people.has(id))) continue;
      const id = eventRefs.get(effect.eventId) ?? effect.eventId;
      const personIds = [...new Set<string>(effect.personIds)];
      if (state.events.some(e => e.id === id && !e.sources.some(s => s.kind === 'manual') && JSON.stringify(e.continuingForPersonIds ?? []) !== JSON.stringify(personIds))) calibrationChanges++;
      state = { ...state, events: state.events.map(e => e.id === id && !e.sources.some(s => s.kind === 'manual') ? { ...e, continuingForPersonIds: personIds } : e) };
    }
    const past = projectAsOf(state, prepared.initialBasis, window);
    const activities = new Map(state.activities.map(a => [a.id, a]));
    const pastActivities = new Map(past.activities.map(a => [a.id, a]));
    const changes = new Map<string, ActivityChange>(calibrationActivities); let segmentChanges = calibrationChanges;
    for (const value of list(row.activities)) {
      const item=returnedIdentity(value,originalActivityIds);if(!item)continue;
      const reference = typeof item.id === 'string' ? item.id.trim() : '';
      const key = typeof item.key === 'string' ? item.key.trim() : '';
      const resolved = reference ? activities.has(reference) ? reference : activityRefs.get(reference) ?? reference : calibratedActivityKeys.has(key) ? activityRefs.get(key) : undefined;
      const known = resolved ? activities.get(resolved) : undefined;
      const participants = strings(item.participantIds ?? item.personIds);
      if (participants.some(id => !people.has(id))) continue;
      if (known) {
        bind(activityRefs, item.key, known.id);
        if (known.sources.some(s => s.kind === 'manual')) continue;
        const change = activityChange({ ...item, ...(item.personIds ? { participantIds: participants } : {}) }, people);
        if (Object.keys(change).length && !calibrationActivities.has(known.id)) changes.set(known.id, change);
      } else {
        if (typeof item.title !== 'string' || !item.title.trim() || !participants.length) continue;
        if (![item.key, reference].some(alias => typeof alias === 'string' && allKeys.get(alias.trim()) === 1)) continue;
        const id = newId(); const change = activityChange(item, people);
        const activity: Activity = { id, title: item.title.trim(), description: typeof item.description === 'string' ? item.description.trim() : '', status: change.status ?? 'planned', participantIds: participants, sources: [source], currentStateWindowId: window.id };
        activities.set(id, activity); pastActivities.set(id, activity); bind(activityRefs, item.key, id); if (reference) bind(activityRefs, reference, id);
        changes.set(id, { title: activity.title, description: activity.description, status: activity.status, participantIds: participants });
        segmentChanges++; addedActivities++;
      }
    }
    const events: WorldEvent[] = [...state.events];
    for (const value of list(row.newEvents ?? row.events)) {
      const item=returnedIdentity(value,originalEventIds);if(!item)continue;
      // An explicit existing ID is evidence, never a new outcome or permission to duplicate it.
      if (Object.hasOwn(item, 'id')) { if (typeof item.id === 'string' && events.some(e => e.id === item.id)) bind(eventRefs, item.key, item.id); continue; }
      const reference = item.activityId ?? item.activityRef ?? null;
      const activityId = typeof reference === 'string' ? activityRefs.get(reference) ?? reference : null;
      if (reference !== null && (!activityId || !activities.has(activityId))) continue;
      if (typeof item.title !== 'string' || !item.title.trim()) continue;
      const participants = strings(item.participantIds ?? item.personIds); if (participants.some(id => !people.has(id))) continue;
      if (typeof item.key === 'string' && allKeys.get(item.key.trim()) !== 1) continue;
      const id = newId(); bind(eventRefs, item.key, id);
      const manual = activityId && activities.get(activityId)?.sources.some(s => s.kind === 'manual');
      const change = manual ? {} : activityChange(item.activityChange, people);
      const statedTime = asObject(item.storyTime)?.text ?? item.storyTime;
      const event: WorldEvent = { id, activityId, title: item.title.trim(), description: typeof item.description === 'string' && item.description.trim() ? item.description.trim() : item.title.trim(), participantIds: participants, storyTime: { text: typeof statedTime === 'string' && statedTime.trim() ? statedTime.trim() : source.label, source }, sources: [source], simulationWindowId: window.id, ...(Object.keys(change).length ? { activityChange: change } : {}), ...(Array.isArray(item.continuingForPersonIds) ? { continuingForPersonIds: strings(item.continuingForPersonIds).filter(id => people.has(id)) } : {}) };
      events.push(event); segmentChanges++; addedEvents++;
      if (activityId && Object.keys(change).length) {
        const current = activities.get(activityId);
        const endChange = changes.get(activityId);
        const revisedEndpoint = current && endChange && Object.keys(endChange).some(key => JSON.stringify(current[key as keyof Activity]) !== JSON.stringify(endChange[key as keyof ActivityChange]));
        if (!isCurrent && current?.currentStateWindowId === window.id && originalActivityIds.has(activityId) && revisedEndpoint) {
          // Reworked past changes invalidate this old anchor, while its later current summary stays intact.
          const {currentStateWindowId, ...unanchored} = current;
          activities.set(activityId, unanchored);
        }
        const old = pastActivities.get(activityId);
        if (old) pastActivities.set(activityId, { ...old, ...change });
        else if (change.title && change.status && change.participantIds) pastActivities.set(activityId, { id: activityId, title: change.title, description: change.description ?? '', status: change.status, participantIds: change.participantIds, sources: [source] });
      }
    }
    for (const [id, change] of changes) {
      const old = activities.get(id);
      if (old && !old.sources.some(s => s.kind === 'manual') && (isCurrent || !originalActivityIds.has(id))) activities.set(id, {...old, ...change, currentStateWindowId: window.id});
    }
    const before = priorWindowIds(state, window);
    for (const [id, pastActivity] of pastActivities) {
      const old = activities.get(id);
      if (old?.sources.some(s => s.kind === 'manual')) continue;
      if (!changes.has(id) && !originalActivityIds.has(id) && (!old || old.currentStateWindowId && (old.currentStateWindowId === window.id || before.has(old.currentStateWindowId)))) activities.set(id, { ...pastActivity, currentStateWindowId: window.id });
    }
    if (isCurrent) for (const update of list(row.currentActivityUpdates)) {
      const id = activityRefs.get(update.id) ?? update.id; const old = activities.get(id);
      if (!old || old.sources.some(s => s.kind === 'manual')) continue;
      const change = activityChange(asObject(update.change) ?? update, people);
      if (Object.keys(change).some(key => JSON.stringify(old[key as keyof Activity]) !== JSON.stringify(change[key as keyof ActivityChange]))) { activities.set(id, { ...old, ...change, currentStateWindowId: window.id }); segmentChanges++; }
    }
    const knowledge = [...state.knowledge];
    for (const item of list(row.knowledge)) {
      const eventId = eventRefs.get(item.eventId ?? item.eventRef) ?? factRefs.get(item.eventId) ?? item.eventId;
      if (!people.has(item.personId) || !events.some(e => e.id === eventId) || typeof item.reason !== 'string' || !item.reason.trim()) continue;
      if (knowledge.some(k => k.personId === item.personId && k.eventId === eventId)) continue;
      knowledge.push({ personId: item.personId, eventId, reason: item.reason.trim(), sources: [source] }); segmentChanges++; addedKnowledge++;
    }
    if (!segmentChanges && !(typeof row.quietReason === 'string' && row.quietReason.trim())) continue;
    covered.push(actualRange);
    acceptedWindows.push(window);
    const ranges = state.simulationRanges ?? [];
    state = { ...state, activities: [...activities.values()], events, knowledge, simulationRanges: ranges.some(w => w.id === window.id) ? ranges : [...ranges, window] };
  }
  if (!acceptedWindows.length) throw new Error(inScopeRows ? '本次只返回了旧记录或无法确认的结果，没有新增变化或平静说明；请重新生成。' : '本次没有补到尚未完成的范围，已保存结果保留；可继续补写未完成部分。');
  if (!savedWindowChain(state)) throw new Error('返回的时间段与已有记录无法连贯承接，请重新生成。');
  return { state, windows: acceptedWindows, addedEvents, addedActivities, addedKnowledge, remainingRanges: requirements.ranges.flatMap(range => subtractRanges(range.fromSeq, range.toSeq, covered)) };
}
