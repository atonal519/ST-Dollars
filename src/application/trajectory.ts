import type { AdvanceDependencies, ModelRequest, StoryTurn, WorldRepository } from './contracts';
import type { SourcePerson } from '../domain/source-people';
import type { SimulationWindow, StoryBoundary } from '../domain/world';
import type { NpcWorldState } from '../domain/world-state';
import type { HistoryRange } from '../history/batches';
import { subtractRanges } from '../history/batches';
import { advanceBatch } from '../simulation/advance';
import { preparationInput, preparationPackageCount, requestCharacters, priorWindowIds, savedWindowChain, type PreparedTrajectory } from '../simulation/trajectory';
import { factEvidenceKind } from '../simulation/fact-sources';
import { trajectoryBatchInput, BATCH_TRAJECTORY_INSTRUCTIONS } from '../simulation/trajectory-batch';

export interface TrajectoryCheck { fromSeq: number; throughSeq: number | null; peopleCount: number; coveredWindows: number; isRework?: boolean; requestedToSeq?: number; missingHistoryRanges: HistoryRange[]; characters: number; factsCount: number; preparationRequests: number; canPrepare: boolean; message: string }
export function checkTrajectory(input: {people: SourcePerson[]; state: NpcWorldState; turns: StoryTurn[]; fromSeq: number}): TrajectoryCheck {
  const throughSeq = input.turns.length ? Math.max(...input.turns.map(t => t.seq)) : null;
  const missingHistoryRanges = throughSeq === null ? [] : subtractRanges(input.fromSeq, throughSeq, input.state.historyRanges);
  const characters = requestCharacters({ task: 'trajectory-batch', instructions: BATCH_TRAJECTORY_INSTRUCTIONS, input: trajectoryBatchInput({ ...input, currentThroughSeq: throughSeq ?? 0 }) });
  const coveredWindows = input.state.simulationRanges?.filter(window=>window.purpose!=='baseline').length ?? 0;
  const chain = savedWindowChain(input.state);
  const latest = chain?.at(-1);
  const earliest = chain?.find(w => w.kind === 'elapsed');
  const covered = !chain?.some(window=>window.purpose==='baseline') && earliest && latest && throughSeq !== null && latest.throughSeq >= throughSeq && input.fromSeq >= Math.min(...earliest.from.sourceSeqs);
  const message = !throughSeq ? '所选范围没有可读取的已完成正文。' : missingHistoryRanges.length ? '部分正文事实尚未整理，请先在“整理正文事实”中补齐并确认保存。' : '本地检查完成，可以整批补写幕后经历。';
  return {fromSeq: input.fromSeq, throughSeq, peopleCount: input.people.length, coveredWindows, isRework: !!covered || !!input.state.simulationRanges?.some(w => w.throughSeq >= input.fromSeq), missingHistoryRanges, characters, factsCount: input.state.events.length, preparationRequests: 1, canPrepare: !!throughSeq && !missingHistoryRanges.length, message};
}

/** Only the repository's acknowledged snapshot advances the next window. */
export async function runTrajectory(input: {prepared: PreparedTrajectory; people: SourcePerson[]; state: NpcWorldState; turns: StoryTurn[]; revision: number | null; repository: WorldRepository; dependencies: AdvanceDependencies; shouldStop: () => boolean; onProgress?: (value: {window: SimulationWindow; index: number; stage: 'plan' | 'advance' | 'save'}) => void; onSaved: (value: {state: NpcWorldState; revision: number; window: SimulationWindow}) => void}): Promise<{state: NpcWorldState; revision: number | null; completed: number}> {
  let state = input.state; let revision = input.revision; let completed = 0;
  const windows = input.prepared.windows;
  for (let index = 0; index < windows.length; index++) {
    if (input.shouldStop()) break;
    const window = windows[index];
    const rawSeqs = window.rawFloorSeqs ?? [];
    if (rawSeqs.some(seq => !input.prepared.providedRawFloorSeqs?.includes(seq))) throw new Error('本段所需原文尚未核对，请重新准备时间方案。');
    const turns = input.turns.filter(t => rawSeqs.includes(t.seq));
    const authorEvents = state.events.filter(e => window.authorEventIds.includes(e.id)).map(event => ({ ...event, evidenceKind: factEvidenceKind(event, state.scopeId) }));
    if (turns.length !== new Set(rawSeqs).size || authorEvents.length !== new Set(window.authorEventIds).size) throw new Error('本段正文依据无法读取，本段未保存。请重新检查范围。');
    const dependencies = { ...input.dependencies, model: { async request(request: ModelRequest) { return input.dependencies.model.request({ ...request, onStarted: () => { input.onProgress?.({ window, index, stage: request.task === 'advance' ? 'advance' : 'plan' }); request.onStarted?.(); } }); } } };
    const result = await advanceBatch({ people: input.people, state, story: { status: 'ready', message: '', throughSeq: window.throughSeq, turns, source: { kind: 'simulation', id: window.id, label: `${window.from.text} → ${window.to.text}` } }, window, basis: input.prepared.initialBasis, authorConstraints: {events: authorEvents, turns}, dependencies, shouldStop: input.shouldStop });
    if (input.shouldStop()) break;
    const authority = result.calibratedState ?? state;
    const savedRanges = state.simulationRanges ?? [];
    const beforeIds = priorWindowIds(state, window);
    const previousActivityIds = new Set(state.activities.map(activity => activity.id));
    // Newly synchronized narrative tasks need this save anchor even when no autonomous event is warranted.
    const activities = new Map(authority.activities.map(activity => [activity.id, !previousActivityIds.has(activity.id) && !activity.sources.some(source => source.kind === 'manual') ? {...activity,currentStateWindowId:window.id} : activity]));
    for (const proposed of result.state.activities) {
      const old = activities.get(proposed.id);
      if (old?.sources.some(s => s.kind === 'manual')) continue;
      if (!old || old.currentStateWindowId && beforeIds.has(old.currentStateWindowId)) activities.set(proposed.id, { ...proposed, currentStateWindowId: window.id });
    }
    // Only the final window may reconcile a timeless legacy current summary.
    if (window.to.id === (input.prepared.currentBoundaryId ?? windows.at(-1)?.to.id)) for (const update of result.currentActivityUpdates ?? []) {
      const old = activities.get(update.id); if (old && !old.sources.some(s => s.kind === 'manual')) activities.set(old.id, { ...old, ...update.change, currentStateWindowId: window.id });
    }
    const next: NpcWorldState = { ...state, activities: [...activities.values()], events: result.state.events, knowledge: result.state.knowledge, processedThroughSeq: Math.max(state.processedThroughSeq ?? 0, ...turns.map(t => t.seq)), simulationRanges: [...savedRanges, window] };
    input.onProgress?.({ window, index, stage: 'save' });
    const saved = await input.repository.save(state.scopeId, next, revision);
    state = saved.state; revision = saved.revision; completed++;
    input.onSaved({state, revision: saved.revision, window});
  }
  return { state, revision, completed };
}
