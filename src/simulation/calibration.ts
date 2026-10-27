import type { StoryTurn } from '../application/contracts';
import type { SourcePerson } from '../domain/source-people';
import type { ActivityChange, ActivityStatus, KnowledgeCorrection, SourceRef, WorldEvent } from '../domain/world';
import type { NpcWorldState } from '../domain/world-state';
import {discardInvalidAtmospheres} from '../domain/world-state';
import { asObject, list, newId, strings } from './trajectory';
import { historyFactSeqs } from './fact-sources';
import {returnedIdentity} from './returned-identity';

export interface Calibration {
  facts: Array<{ key?: string; id?: string; title: string; description: string; participantIds: string[]; sourceSeqs: number[]; storyTime?: string }>;
  eventCorrections: Array<{eventId: string; byEventId: string; reason: string}>;
  activityUpdates: Array<{id?: string; key?: string; change: ActivityChange; sourceSeqs: number[]}>;
  knowledgeCorrections: Array<{personId: string; eventId: string; byEventId: string; treatment: 'invalidated' | 'retained-report'; reason: string}>;
}
export interface CalibrationRejection {kind:'activity';key:string|null;reason:'unknown-activity'|'activity-fields'|'activity-source'}
export function modelReferenceContract(state:NpcWorldState,turns:StoryTurn[]) {
  return {
    sourceContract:{storySeqs:turns.map(turn=>turn.seq),calibrationSeqs:turns.filter(turn=>turn.calibrationEligible!==false).map(turn=>turn.seq),activityIds:state.activities.map(row=>row.id),eventIds:state.events.map(row=>row.id),factIds:state.events.filter(event=>historyFactSeqs(event).length).map(row=>row.id)},
    calibrationContract:{
      shape:'facts、eventCorrections、activityUpdates、knowledgeCorrections均为数组；以下描述每项字段，不是返回数据或可照抄的ID',
      facts:{newFields:['key','title','description','participantIds','sourceSeqs'],existing:'id必须来自sourceContract.factIds'},
      activityUpdates:{existing:'id必须是sourceContract.activityIds或本答已有效建立的活动key；change只填实际变化，并给sourceSeqs',newFields:['key','change.title','change.description','change.status','change.participantIds','sourceSeqs']},
      eventCorrections:{fields:['eventId','byEventId','reason'],references:'eventId来自sourceContract.eventIds，byEventId来自合格正文事实或本答facts.key'},
      knowledgeCorrections:{fields:['personId','eventId','byEventId','treatment','reason'],treatment:['invalidated','retained-report']},
      sourceSeqs:'逐字选用sourceContract.calibrationSeqs，不填本批相对序号；空数组不能建立正文事实',
    },
  };
}
export function activityChange(value: unknown, people: Set<string>): ActivityChange {
  const item = asObject(value); const change: ActivityChange = {};
  if (!item) return change;
  for (const key of ['title', 'description'] as const) if (typeof item[key] === 'string' && item[key].trim()) change[key] = item[key].trim();
  if (['planned', 'active', 'waiting', 'completed'].includes(item.status)) change.status = item.status as ActivityStatus;
  if (Array.isArray(item.participantIds) && item.participantIds.every((id: string) => people.has(id))) change.participantIds = [...new Set(strings(item.participantIds))];
  return change;
}

/** A reference-only floor cannot become a narrative claim by dropping it from a mixed citation. */
export function eligibleCalibration(calibration: Calibration, turns: StoryTurn[], knowledge: NpcWorldState['knowledge'], newActivityThroughSeq?: number): Calibration {
  const referenceOnly = new Set(turns.filter(turn => turn.calibrationEligible === false).map(turn => turn.seq));
  if (!referenceOnly.size && newActivityThroughSeq === undefined) return calibration;
  const excludedFacts = new Set<string>();
  const citesReference = (item: { sourceSeqs?: number[] }) => Array.isArray(item.sourceSeqs) && item.sourceSeqs.some(seq => referenceOnly.has(seq));
  const facts = list(calibration.facts).filter(item => {
    if (!citesReference(item)) return true;
    if (item.id) excludedFacts.add(item.id);
    if (item.key) excludedFacts.add(item.key);
    return false;
  });
  const originalKnowledge = list(calibration.knowledgeCorrections);
  const knowledgeCorrections = originalKnowledge.filter(item => !excludedFacts.has(item.byEventId));
  const eventCorrections = list(calibration.eventCorrections).filter(item => {
    if (excludedFacts.has(item.byEventId)) return false;
    const known = knowledge.filter(known => known.eventId === item.eventId);
    const handled = (items: Calibration['knowledgeCorrections'], personId: string) => items.some(correction => correction.personId === personId && correction.eventId === item.eventId && ['invalidated', 'retained-report'].includes(correction.treatment));
    // Only a dependency removed for its reference-only source may disable an otherwise complete correction.
    return !known.every(known => handled(originalKnowledge, known.personId)) || known.every(known => handled(knowledgeCorrections, known.personId));
  });
  const citesFutureNewActivity = (item: Calibration['activityUpdates'][number]) => newActivityThroughSeq !== undefined && !(typeof item.id === 'string' && item.id.trim()) && Array.isArray(item.sourceSeqs) && item.sourceSeqs.some(seq => seq > newActivityThroughSeq);
  return { ...calibration, facts, activityUpdates: list(calibration.activityUpdates).filter(item => !citesReference(item) && !citesFutureNewActivity(item)), eventCorrections, knowledgeCorrections };
}

/** Author corrections preserve the old account and never create a person's knowledge of the truth. */
export function applyCalibration(input: {state: NpcWorldState; calibration: Calibration; people: SourcePerson[]; turns: StoryTurn[]; authorFacts?: WorldEvent[]; refs?: Map<string, string>; activityRefs?: Map<string, string>; newActivityThroughSeq?: number; rejections?:CalibrationRejection[]; onAccepted?:()=>void; onReference?:()=>void}): NpcWorldState {
  const { state, turns } = input;
  const knownActivityIds=new Set(state.activities.map(activity=>activity.id));
  const calibration = eligibleCalibration({...input.calibration,activityUpdates:list(input.calibration.activityUpdates).map(row=>returnedIdentity(row,knownActivityIds)??row)}, turns, state.knowledge, input.newActivityThroughSeq);
  const people = new Set(input.people.map(p => p.id)); const seqs = new Set(turns.filter(turn => turn.calibrationEligible !== false).map(t => t.seq));
  const sourceSequence = (source: SourceRef): number | null => {
    if (source.kind !== 'chat') return null;
    const value = source.id.startsWith('history-floor:') ? source.id.slice('history-floor:'.length) : source.id.startsWith(`${state.scopeId}:`) ? source.id.slice(state.scopeId.length + 1) : '';
    return /^[1-9]\d*$/.test(value) && Number.isSafeInteger(Number(value)) ? Number(value) : null;
  };
  // Earlier advance outputs used scope:seq chat refs; history extraction owns history-floor:seq.
  const protectedSource = (source: SourceRef) => source.kind === 'manual' || source.kind === 'chat' && !(source.id.startsWith(`${state.scopeId}:`) && sourceSequence(source) !== null);
  const providedFacts = new Map((input.authorFacts ?? []).filter(event => historyFactSeqs(event).length).map(event => [event.id, event]));
  const authorSeqs = new Set([...providedFacts.values()].flatMap(historyFactSeqs));
  // 新事实必须有本次原文；既有概况也可据本次已提供的正文事实校准。
  const sources = (v: unknown, existingActivity = false) => { const values = Array.isArray(v) ? v : []; if (!values.length || values.some(n => !seqs.has(n) && !(existingActivity && authorSeqs.has(n)))) throw new Error('正文校准缺少可核对的正文来源，本段未保存。'); return values.map(seq => ({ kind: 'chat' as const, id: `history-floor:${seq}`, label: `第 ${seq} 楼正文` })); };
  const events = new Map(state.events.map(e => [e.id, e])); const refs = input.refs ?? new Map<string, string>();
  for (const raw of list(calibration.facts)) {
    const item=returnedIdentity(raw,events);if(!item)throw new Error('正文纠正事实的引用冲突，本段未保存。');
    if (item.id) {
      const old = events.get(item.id);
      const authoritative = providedFacts.get(item.id);
      const provided = authoritative ? authoritative.sources.filter(source => source.kind === 'chat' && source.id.startsWith('history-floor:')) : sources(item.sourceSeqs);
      if (!old || !old.sources.some(s => s.kind === 'chat' && s.id.startsWith('history-floor:') && provided.some(p => sourceSequence(p) === sourceSequence(s)))) throw new Error('纠正事实引用的正文记录无法确认，本段未保存。');
      if(item.key&&refs.has(item.key)&&refs.get(item.key)!==item.id)throw new Error('正文纠正事实的引用重复，本段未保存。');
      refs.set(item.id, item.id); if (item.key) refs.set(item.key, item.id); input.onReference?.(); continue;
    }
    if (typeof item.title !== 'string' || !item.title.trim()) continue;
    const participantIds = strings(item.participantIds); if (participantIds.some(id => !people.has(id))) continue;
    const factSources = sources(item.sourceSeqs); const id = newId();
    if (item.key && refs.has(item.key)) throw new Error('正文纠正事实的引用重复，本段未保存。');
    if (item.key) refs.set(item.key, id);
    events.set(id, { id, activityId: null, title: item.title, description: typeof item.description === 'string' ? item.description : item.title, participantIds, sources: factSources, storyTime: typeof item.storyTime === 'string' ? { text: item.storyTime, source: factSources[0] } : null });
    input.onAccepted?.();
  }
  const resolve = (id: string) => {
    const resolved = refs.get(id) ?? id; const event = events.get(resolved);
    if (!event || !event.sources.some(s => s.kind === 'chat' && s.id.startsWith('history-floor:') && (providedFacts.has(event.id) || seqs.has(sourceSequence(s)!)))) throw new Error('校准所依据的正文事实无法确认，本段未保存。');
    return resolved;
  };
  const knowledge = state.knowledge.map(k => ({ ...k }));
  for (const item of list(calibration.eventCorrections)) {
    const old = events.get(item.eventId); if (!old) throw new Error('待纠正的旧事件无法确认，本段未保存。');
    if (old.sources.some(protectedSource)) {input.onAccepted?.();continue;}
    const byEventId = resolve(item.byEventId); if (byEventId === old.id || !item.reason) throw new Error('旧事件的纠正依据不完整，本段未保存。');
    for (const known of knowledge.filter(k => k.eventId === old.id)) if (!list(calibration.knowledgeCorrections).some(k => k.personId === known.personId && k.eventId === old.id && ['invalidated', 'retained-report'].includes(k.treatment))) throw new Error('旧知情尚未说明应保留为报告还是作废，本段未保存。');
    events.set(old.id, { ...old, correction: { byEventId, reason: item.reason } });
    input.onAccepted?.();
  }
  for (const item of list(calibration.knowledgeCorrections)) {
    if (!people.has(item.personId)) continue;
    const known = knowledge.find(k => k.personId === item.personId && k.eventId === item.eventId);
    if (!known) continue;
    if (known.sources.some(protectedSource)) { if (events.get(item.eventId)?.correction) throw new Error('旧知情包含人工或正文依据，无法用本次校准覆盖，本段未保存。'); input.onAccepted?.();continue; }
    if (!['invalidated', 'retained-report'].includes(item.treatment) || !item.reason) throw new Error('旧知情的纠正处理无法确认，本段未保存。');
    const byEventId = resolve(item.byEventId);
    const correction: KnowledgeCorrection = { byEventId, treatment: item.treatment, reason: item.reason };
    known.correction = correction;
    input.onAccepted?.();
  }
  const activities = new Map(state.activities.map(activity => [activity.id, activity]));
  const activityRefs = input.activityRefs ?? new Map<string, string>();
  const bindActivity = (key: string, id: string) => {
    if (!key) return;
    const bound = activities.has(key) ? key : activityRefs.get(key);
    if (bound && bound !== id) throw new Error('返回的临时引用重复，结果未保存，请重新更新。');
    activityRefs.set(key, id);
  };
  for (const raw of list(calibration.activityUpdates)) {
    const item=returnedIdentity(raw,activities);
    if(!item){if(!input.rejections)throw new Error('返回的临时引用重复，结果未保存，请重新更新。');input.rejections.push({kind:'activity',key:typeof raw.key==='string'?raw.key:null,reason:'unknown-activity'});continue;}
    const reference = typeof item.id === 'string' ? item.id.trim() : '';
    const key = typeof item.key === 'string' ? item.key.trim() : '';
    const reject=(reason:CalibrationRejection['reason'])=>input.rejections?.push({kind:'activity',key:reference||key||null,reason});
    const id = reference ? activities.has(reference) ? reference : activityRefs.get(reference) ?? reference : activityRefs.get(key);
    const old = id ? activities.get(id) : undefined;
    // Partial acceptance is explicit; historical callers retain their strict completion contract.
    if (reference && !old) {if(!input.rejections)throw new Error('待校准的活动无法确认，本段未保存。');reject('unknown-activity');continue;}
    if (old) {
      bindActivity(key, old.id);
      if (old.sources.some(source => source.kind === 'manual')) {input.onAccepted?.();continue;}
      if(!Array.isArray(item.sourceSeqs)||!item.sourceSeqs.length||item.sourceSeqs.some((seq:number)=>!seqs.has(seq)&&!authorSeqs.has(seq))){if(!input.rejections)sources(item.sourceSeqs,true);reject('activity-source');continue;}
      const evidence = sources(item.sourceSeqs, true);
      const added = evidence.filter(source => !old.sources.some(previous => previous.kind === source.kind && previous.id === source.id));
      activities.set(old.id, { ...old, ...activityChange(item.change, people), currentStateWindowId: undefined, sources: [...old.sources, ...added] });
      input.onAccepted?.();
      continue;
    }
    // A new factual identity needs actual narrative floors; an invalid row leaves no alias behind.
    const change = activityChange(item.change, people);
    if (!key || !change.title || !change.status || !Array.isArray(item.change?.participantIds) || !change.participantIds) {reject('activity-fields');continue;}
    if(!Array.isArray(item.sourceSeqs)||!item.sourceSeqs.length||item.sourceSeqs.some((seq:number)=>!seqs.has(seq))){reject('activity-source');continue;}
    const createdId = newId();
    bindActivity(key, createdId);
    activities.set(createdId, { id: createdId, title: change.title, description: change.description ?? '', status: change.status, participantIds: change.participantIds, sources: sources(item.sourceSeqs) });
    input.onAccepted?.();
  }
  return discardInvalidAtmospheres({ ...state, activities: [...activities.values()], events: [...events.values()], knowledge });
}
