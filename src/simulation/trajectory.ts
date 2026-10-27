import type { ModelRequest, ModelRequester, StoryTurn } from '../application/contracts';
import type { SourcePerson } from '../domain/source-people';
import type { ActivityStatus, SimulationWindow } from '../domain/world';
import type { NpcWorldState } from '../domain/world-state';
import { characterCount } from '../history/batches';
import { createPersonCodes, encodePersonReferences } from '../models/person-references';
import { extractJson } from './json';
import { TRAJECTORY_INSTRUCTIONS } from './prompts';
import { isEffectiveEvent } from '../domain/world-facts';
import { factEvidenceKind, historyFactSeqs } from './fact-sources';
import {foundationAsOf} from '../domain/world-foundation';

export interface AsOfBasis {
  backgrounds: Array<{ personId: string; text: string; eventIds: string[]; sourceSeqs: number[] }>;
  activities: Array<{ id: string; title: string; description: string; status: ActivityStatus; participantIds: string[]; eventIds: string[]; sourceSeqs: number[] }>;
  knowledge: Array<{ personId: string; eventId: string; reason: string; sourceSeqs: number[] }>;
}
export interface PreparedTrajectory {
  providedRawFloorSeqs: number[];
  currentBoundaryId?: string;
  initialBasis: AsOfBasis;
  windows: Array<SimulationWindow & { authorEventIds: string[]; authorFloorSeqs: number[]; rawFloorSeqs: number[] }>;
}
export const newId = () => globalThis.crypto?.randomUUID?.() ?? `bmx-${Date.now()}-${Math.random().toString(36).slice(2)}`;
export const asObject = (v: unknown): Record<string, any> | null => v !== null && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, any> : null;
export const list = (v: unknown): any[] => (Array.isArray(v) ? v : asObject(v) ? [v] : []).filter(item => asObject(item));
export const strings = (v: unknown): string[] => (Array.isArray(v) ? v : typeof v === 'string' ? [v] : []).filter((s): s is string => typeof s === 'string');
export function responseObject(value: unknown): Record<string, any> {
  let data = asObject(extractJson(value));
  for (let i = 0; i < 4 && data; i++) { const nested = asObject(data.result ?? data.data ?? data.output); if (!nested) break; data = nested; }
  if (!data) throw new Error('返回内容无法读取，本段未保存。');
  return data;
}

/** Count exactly the encoded payload sent to the model, separately from output tokens. */
export function requestCharacters(request: ModelRequest): number {
  const data = asObject(request.input) ?? {};
  const codes = createPersonCodes(data.people ?? data.knownPeople);
  return characterCount(request.instructions) + characterCount(JSON.stringify(encodePersonReferences(request.input, codes)));
}
export async function budgetedRequest(model: ModelRequester, request: ModelRequest, limit?: number): Promise<unknown> {
  const characters = requestCharacters(request);
  if (limit && characters > limit) throw new Error(`本次完整输入为 ${characters} 字符，超过所选 ${limit} 字符预算。请提高预算或缩小本次范围，本段未请求模型。`);
  return model.request(request);
}
type PreparationSource = { people: SourcePerson[]; state: NpcWorldState; turns: StoryTurn[]; fromSeq: number };
type PreparationMaterial = { fact: NpcWorldState['events'][number] } | { turn: StoryTurn };
const PREPARATION_PACKAGE_TARGET = 48000;
export function preparationInput(input: PreparationSource, facts = input.state.events, turns: StoryTurn[] = [], draft: unknown = null, moreMaterials = false) {
  return {
    people: input.people.map(p => ({ id: p.id, name: p.displayName, aliases: p.aliases })),
    fromSeq: input.fromSeq, throughSeq: input.turns.at(-1)?.seq ?? null,
    sourceFloors: input.turns.map(turn => ({ seq: turn.seq, isUser: turn.isUser })),
    facts: facts.map(fact => ({ ...fact, evidenceKind: factEvidenceKind(fact, input.state.scopeId) })), turns, savedWindows: input.state.simulationRanges ?? [], draft, moreMaterials,
  };
}
function materialPackage(input: PreparationSource, queue: PreparationMaterial[], draft: unknown) {
  const facts: NpcWorldState['events'] = []; const turns: StoryTurn[] = [];
  let taken = 0;
  for (const item of queue) {
    const nextFacts = 'fact' in item ? [...facts, item.fact] : facts;
    const nextTurns = 'turn' in item ? [...turns, item.turn] : turns;
    const characters = requestCharacters({ task: 'trajectory', instructions: TRAJECTORY_INSTRUCTIONS, input: preparationInput(input, nextFacts, nextTurns, draft, taken + 1 < queue.length) });
    // 运输目标不是模型上限；单条或固定草案较大时仍完整提供，不丢材料。
    if (taken && characters > PREPARATION_PACKAGE_TARGET) break;
    if ('fact' in item) facts.push(item.fact); else turns.push(item.turn);
    taken++;
  }
  return { facts, turns, taken };
}
export function preparationPackageCount(input: PreparationSource): number {
  let queue: PreparationMaterial[] = input.state.events.map(fact => ({ fact })); let count = 0;
  do { const pack = materialPackage(input, queue, null); queue = queue.slice(pack.taken); count++; } while (queue.length);
  return count;
}

export async function prepareTrajectory(input: PreparationSource & { model: ModelRequester; shouldStop?: () => boolean; onProgress?: (value: { request: number; facts: number; rawFloors: number }) => void }): Promise<PreparedTrajectory | null> {
  let queue: PreparationMaterial[] = input.state.events.map(fact => ({ fact }));
  const rawBySeq = new Map(input.turns.map(turn => [turn.seq, turn]));
  const providedRaw = new Set<number>(); const providedFacts = new Set<string>();
  let draft: Record<string, any> | null = null; let requests = 0;
  do {
    if (input.shouldStop?.()) return null;
    const pack = materialPackage(input, queue, draft); queue = queue.slice(pack.taken);
    input.onProgress?.({ request: requests + 1, facts: providedFacts.size + pack.facts.length, rawFloors: providedRaw.size + pack.turns.length });
    const value = await input.model.request({ task: 'trajectory', instructions: TRAJECTORY_INSTRUCTIONS, input: preparationInput(input, pack.facts, pack.turns, draft, queue.length > 0) });
    requests++;
    if (input.shouldStop?.()) return null;
    const response = responseObject(value);
    for (const fact of pack.facts) providedFacts.add(fact.id);
    for (const turn of pack.turns) providedRaw.add(turn.seq);
    const proposed = asObject(response.draft) ?? response;
    draft = { initialBasis: proposed.initialBasis ?? proposed.initial_basis, boundaries: proposed.boundaries, windows: proposed.windows, message: proposed.message };
    const rawRequests = response.sourceRequests ?? response.needSources ?? proposed.sourceRequests ?? proposed.needSources ?? [];
    if (!Array.isArray(rawRequests)) throw new Error('时间准备没有说明需要核对哪些原楼，请重新准备。');
    const added: StoryTurn[] = [];
    for (const request of rawRequests) {
      const seqs = request?.seqs ?? request?.sourceSeqs;
      if (typeof request?.reason !== 'string' || !request.reason.trim() || !Array.isArray(seqs) || !seqs.length) throw new Error('时间准备缺少原楼核对的原因或楼号，请重新准备。');
      if (strings(request.eventIds).some(id => !providedFacts.has(id))) throw new Error('需要核对的事实未在本次材料中提供，请重新准备。');
      for (const seq of new Set<number>(seqs)) {
        const turn = rawBySeq.get(seq);
        if (!turn) throw new Error('时间准备返回的楼层不在本次读取范围内，请重新准备。');
        if (providedRaw.has(seq)) throw new Error(`第 ${seq - 1} 楼原文已提供，仍缺少可确认的依据。请补充相关正文事实后重新检查。`);
        if (!added.some(item => item.seq === seq) && !queue.some(item => 'turn' in item && item.turn.seq === seq)) added.push(turn);
      }
    }
    queue = [...added.map(turn => ({ turn })), ...queue];
  } while (queue.length);
  if (input.shouldStop?.()) return null;
  return parsePreparedTrajectory(draft!, input, providedFacts, providedRaw);
}

/** Shared time/source validation; history batches also revisit existing window identities. */
export function parsePreparedTrajectory(draft: Record<string, any>, input: PreparationSource, providedFacts: Set<string>, providedRaw: Set<number>, includeCovered = false): PreparedTrajectory {
  // 所有材料送达后才解析一次；新边界的 UUID 不随材料包重复生成。
  const raw = draft;
  const suppliedSeqs = new Set([...providedRaw, ...input.state.events.filter(event => providedFacts.has(event.id)).flatMap(historyFactSeqs)]);
  const fail = (detail: string): never => { throw new Error(includeCovered ? `${detail}，结果的时间或来源无法确认，请重新生成。` : `${detail}，无法准备幕后时间段。请补充有时间依据的正文后重新检查。`); };
  const seqs = suppliedSeqs;
  const rawSeqs = new Set(input.turns.map(t => t.seq));
  const events = new Map(input.state.events.filter(event => providedFacts.has(event.id)).map(e => [e.id, e]));
  const people = new Set(input.people.map(p => p.id));
  const validSeqs = (v: unknown) => (Array.isArray(v) ? v : []).filter((n): n is number => Number.isInteger(n) && seqs.has(n));
  const saved = input.state.simulationRanges ?? [];
  const boundaries = new Map(saved.flatMap(w => [[w.from.id, w.from] as const, [w.to.id, w.to] as const]));
  const order: string[] = [];
  const savedOrder = new Map((includeCovered ? savedWindowChain(input.state) ?? [] : []).flatMap(w => [w.from.id, w.to.id]).filter((id, index, ids) => ids.indexOf(id) === index).map((id, index) => [id, index]));
  const refs = new Map<string, string>();
  for (const item of list(raw.boundaries)) {
    const suppliedSources = item.sourceSeqs ?? item.source_seqs;
    const identical = typeof item.text === 'string' && Array.isArray(suppliedSources) ? [...boundaries.values()].filter(boundary => boundary.text === item.text.trim() && JSON.stringify(boundary.sourceSeqs) === JSON.stringify(suppliedSources)) : [];
    if (!item.id && identical.length > 1) fail('返回的时间边界对应多条已有记录');
    // Repeating the exact supplied boundary is a definite alias, not a new time point.
    const old = typeof item.id === 'string' ? boundaries.get(item.id) : identical[0];
    const sourceSeqs = validSeqs(item.sourceSeqs ?? item.source_seqs);
    if (item.id && !old) fail('时间边界引用不属于已保存范围');
    if (!old && (typeof item.text !== 'string' || !item.text.trim() || !sourceSeqs.length)) fail('时间边界缺少明确文字或正文来源');
    const boundary = old ?? { id: newId(), text: item.text.trim(), sourceSeqs };
    if (typeof item.key !== 'string' || !item.key) fail('时间边界缺少引用');
    boundaries.set(boundary.id, boundary); refs.set(item.key, boundary.id); refs.set(boundary.id, boundary.id); order.push(boundary.id);
  }
  for (const w of saved) for (const boundary of [w.from, w.to]) refs.set(boundary.id, boundary.id);
  const windows: PreparedTrajectory['windows'] = [];
  let last: string | undefined;
  for (const item of list(raw.windows)) {
    const from = boundaries.get(refs.get(item.fromBoundary ?? item.from) ?? '') ?? fail('时间段起点无法确认');
    const to = boundaries.get(refs.get(item.toBoundary ?? item.to) ?? '') ?? fail('时间段终点无法确认');
    if (!from || !to || !['elapsed', 'current'].includes(item.kind) || !rawSeqs.has(item.throughSeq)) fail('时间段的起止或正文依据无法确认');
    if (![from, to].every(boundary => order.includes(boundary.id) || savedOrder.has(boundary.id))) fail('请在时间顺序中列出本段需要的已保存边界');
    // Known identities already have an order; new points retain the answer's explicit links.
    const reversed = savedOrder.has(from.id) && savedOrder.has(to.id) ? savedOrder.get(from.id)! >= savedOrder.get(to.id)! : order.includes(from.id) && order.includes(to.id) && order.indexOf(from.id) >= order.indexOf(to.id);
    if (item.kind === 'elapsed' && (from.id === to.id || reversed)) fail('时间段顺序无法确认');
    if (last && last !== from.id && !(savedOrder.has(last) && savedOrder.has(from.id) && savedOrder.get(last)! < savedOrder.get(from.id)!)) fail('时间段之间不连续');
    last = to.id;
    const authorEventIds = strings(item.authorEventIds);
    const floorRaw = Array.isArray(item.authorFloorSeqs) ? item.authorFloorSeqs : [];
    const rawFloorSeqs = Array.isArray(item.rawFloorSeqs) ? item.rawFloorSeqs : [];
    if (rawFloorSeqs.some((seq: number) => !providedRaw.has(seq))) fail('本段需要的原文尚未提供，请先按楼号核对原文');
    if (authorEventIds.some(id => !events.has(id)) || floorRaw.some((n: number) => !seqs.has(n))) fail('时间段引用了无法读取的事实');
    const start = order.indexOf(from.id), end = order.indexOf(to.id);
    const overlap = saved.some(w => w.kind === item.kind && order.includes(w.from.id) && order.includes(w.to.id) && order.indexOf(w.from.id) <= start && order.indexOf(w.to.id) >= end);
    if (overlap && !includeCovered) continue;
    const exact = saved.find(w => w.from.id === from.id && w.to.id === to.id && w.kind === item.kind);
    const named = typeof item.id === 'string' ? saved.find(w => w.id === item.id) : undefined;
    const existing = includeCovered ? named ?? exact : undefined;
    if (includeCovered && item.id && !named) fail('模型未沿用已有时间段，请重新生成');
    if (existing && !exact && item.throughSeq > existing.throughSeq) fail('重补结果超出了原时间段，请重新生成');
    if (includeCovered && !existing && (overlap || saved.some(w => w.from.id === from.id || w.to.id === to.id && w.from.id !== w.to.id))) fail('模型未沿用已有时间段，请重新生成');
    if (!existing && saved.some(w => w.kind === 'elapsed' && order.indexOf(w.from.id) > start && order.indexOf(w.from.id) < end || w.kind === 'elapsed' && order.indexOf(w.to.id) > start && order.indexOf(w.to.id) < end)) fail('新时间段跨越了已保存边界，需按原边界分段');
    windows.push({ id: existing?.id ?? newId(), kind: item.kind, from, to, throughSeq: item.throughSeq, authorEventIds, authorFloorSeqs: validSeqs(floorRaw), rawFloorSeqs: [...new Set<number>(rawFloorSeqs)] });
  }
  if (!windows.length && !list(raw.windows).length) fail(typeof raw.message === 'string' ? raw.message : '正文缺少可确认的故事时间');
  const basis = asObject(raw.initialBasis ?? raw.initial_basis) ?? {};
  const evidence = (item: any) => { const eventIds = strings(item.eventIds).filter(id => events.has(id) && isEffectiveEvent(events.get(id)!) && (!includeCovered || historyFactSeqs(events.get(id)!).length)); const sourceSeqs = validSeqs(item.sourceSeqs); return { eventIds, sourceSeqs }; };
  const backgrounds: AsOfBasis['backgrounds'] = [];
  for (const item of list(basis.backgrounds)) { const refs = evidence(item); if (people.has(item.personId) && typeof item.text === 'string' && (refs.eventIds.length || refs.sourceSeqs.length)) backgrounds.push({ personId: item.personId, text: item.text, ...refs }); }
  const activities: AsOfBasis['activities'] = [];
  for (const item of list(basis.activities)) {
    const refs = evidence(item); const participantIds = strings(item.participantIds).filter(id => people.has(id));
    if (typeof item.id !== 'string' || !input.state.activities.some(a => a.id === item.id) || !item.title || !participantIds.length || !['planned', 'active', 'waiting', 'completed'].includes(item.status) || !(refs.eventIds.length || refs.sourceSeqs.length)) continue;
    activities.push({ id: item.id, title: item.title, description: typeof item.description === 'string' ? item.description : item.title, status: item.status, participantIds, ...refs });
  }
  const knowledge: AsOfBasis['knowledge'] = [];
  for (const item of list(basis.knowledge)) if (people.has(item.personId) && events.has(item.eventId) && typeof item.reason === 'string' && (validSeqs(item.sourceSeqs).length || evidence(item).eventIds.length)) knowledge.push({ personId: item.personId, eventId: item.eventId, reason: item.reason, sourceSeqs: validSeqs(item.sourceSeqs) });
  return { initialBasis: { backgrounds, activities, knowledge }, windows, providedRawFloorSeqs: [...providedRaw], currentBoundaryId: savedEndpoint({ ...input.state, simulationRanges: [...saved, ...windows] })?.id ?? '' };
}

/** Temporary past projection; the current world remains the persistence baseline. */
/** Resolve the one saved chain by explicit boundary links, independent of insertion order. */
export function savedWindowChain(state: NpcWorldState): SimulationWindow[] | null {
  const ranges = state.simulationRanges ?? [];
  if (!ranges.length) return [];
  const starts = new Set(ranges.filter(w => w.from.id !== w.to.id).map(w => w.from.id));
  const ends = new Map(ranges.filter(w => !starts.has(w.to.id)).map(w => [w.to.id, w.to]));
  if (ends.size !== 1) return null;
  let cursor = [...ends.keys()][0]; const backward: SimulationWindow[] = []; const seen = new Set<string>();
  for (;;) {
    const previous = ranges.filter(w => w.to.id === cursor && w.from.id !== w.to.id && !seen.has(w.id));
    if (previous.length > 1) return null;
    for (const point of ranges.filter(w => w.from.id === cursor && w.to.id === cursor).reverse()) { if (!seen.has(point.id)) { backward.push(point); seen.add(point.id); } }
    if (!previous.length) break;
    backward.push(previous[0]); seen.add(previous[0].id); cursor = previous[0].from.id;
  }
  return seen.size === ranges.length ? backward.reverse() : null;
}
export function savedEndpoint(state: NpcWorldState) { return savedWindowChain(state)?.at(-1)?.to ?? null; }

export function priorWindowIds(state: NpcWorldState, window?: SimulationWindow): Set<string> {
  if (!window) return new Set((state.simulationRanges ?? []).map(w => w.id));
  const chain=savedWindowChain(state);
  if(!chain)return new Set<string>();
  const own=chain.findIndex(saved=>saved.id===window.id);
  if(own>=0)return new Set(chain.slice(0,own).map(saved=>saved.id));
  // A new segment starts after the last saved checkpoint at its explicit origin.
  const origin=chain.findLastIndex(saved=>saved.to.id===window.from.id);
  return new Set(chain.slice(0,origin+1).map(saved=>saved.id));
}
export function projectAsOf(state: NpcWorldState, basis: AsOfBasis, window?: SimulationWindow): NpcWorldState {
  const before = priorWindowIds(state, window);
  const basisEvents = new Set([...basis.backgrounds.flatMap(b => b.eventIds), ...basis.activities.flatMap(a => a.eventIds), ...basis.knowledge.map(k => k.eventId)]);
  const ranks = new Map([...before].map((id, index) => [id, index]));
  const pastKnowledge = state.knowledge.filter(k => k.sources.some(s => s.kind === 'simulation' && before.has(s.id)));
  const knownIds = new Set(pastKnowledge.map(k => k.eventId));
  const events = state.events.filter(e => basisEvents.has(e.id) || knownIds.has(e.id) || !!e.simulationWindowId && before.has(e.simulationWindowId)).sort((a, b) => (ranks.get(a.simulationWindowId ?? '') ?? -1) - (ranks.get(b.simulationWindowId ?? '') ?? -1));
  const activities = new Map(basis.activities.map(a => [a.id, { id: a.id, title: a.title, description: a.description, status: a.status, participantIds: a.participantIds, sources: [] as import('../domain/world').SourceRef[] }]));
  const pastChanges = new Map<string, import('../domain/world').ActivityChange>();
  const applyEvent = (event: typeof events[number]) => {
    if (!isEffectiveEvent(event) || !event.activityId || !event.activityChange) return;
    const old = activities.get(event.activityId); const change = { ...pastChanges.get(event.activityId), ...event.activityChange };
    pastChanges.set(event.activityId, change);
    if (old) activities.set(old.id, { ...old, ...change });
    else if (change.title && change.participantIds && change.status) activities.set(event.activityId, { id: event.activityId, title: change.title, description: change.description ?? '', status: change.status, participantIds: change.participantIds, sources: event.sources });
  };
  for (const event of events.filter(e => !e.simulationWindowId || !before.has(e.simulationWindowId))) applyEvent(event);
  for (const windowId of before) {
    for (const event of events.filter(e => e.simulationWindowId === windowId)) applyEvent(event);
    // A period's final checkpoint follows its events; later periods may then change it.
    for (const activity of state.activities) if (activity.currentStateWindowId === windowId) { activities.set(activity.id, activity); pastChanges.delete(activity.id); }
  }
  const known = [...basis.knowledge.map(k => { const authority = state.knowledge.find(item => item.personId === k.personId && item.eventId === k.eventId); return { personId: k.personId, eventId: k.eventId, reason: k.reason, sources: [], ...(authority?.correction ? { correction: authority.correction } : {}) }; }), ...pastKnowledge.filter(k => events.some(e => e.id === k.eventId))];
  return { ...state, foundation:foundationAsOf(state.foundation,before), storyTime: window ? { text: window.from.text, source: { kind: 'simulation', id: window.id, label: window.from.text } } : null, activities: [...activities.values()], events, knowledge: known };
}
