import { readonly, shallowRef, ref } from 'vue';
import { createDevelopmentController } from './development';
import { createEmptyWorld } from '../domain/world';
import { createEmptyState, projectWorldState, type NpcWorldState } from '../domain/world-state';
import { projectSourcePerson } from '../domain/source-people';
import {mergeWorldPeople} from '../domain/world-foundation';
import type { ControllerDependencies, ControllerState, PeopleDirectoryRead } from './contracts';
import type { ModelRequest, StoryTurn, TrajectoryView } from './contracts';
import { checkTrajectory as inspectTrajectory } from './trajectory';
import { generateTrajectoryBatch, type TrajectoryCandidate } from '../simulation/trajectory-batch';
import { newId, savedEndpoint } from '../simulation/trajectory';
import type { SimulationWindow } from '../domain/world';
import type { HistoryIntakeView } from './contracts';
import { buildBatches, characterCount, subtractRanges, mergeRanges } from '../history/batches';
import { collectHistory, createHistoryCollectionSession, type HistoryCollectionSession } from '../history/collect';

export function createPeopleWorld(deps: ControllerDependencies) {
  const state = shallowRef<ControllerState>({ world: createEmptyWorld(), source: { status: 'waiting', message: '尚未读取千千结人物目录。' }, processedThroughSeq: null, currentTimeStarted: false, busy: false, report: null, diagnostics: null, error: '' });
  const historyView = ref<HistoryIntakeView>({ status: 'idle', fromSeq: 1, throughSeq: null, batchCharacters: 24000, floors: 0, excludedFloors: 0, characters: 0, batches: 0, skipped: 0, partial: false, progress: 0, modelCalls: 0, materialReads: 0, message: '' });
  const trajectoryView = shallowRef<TrajectoryView>({ status: 'idle', completed: 0, modelCalls: 0, message: '' });
  let trajectoryChecked: { people: PeopleDirectoryRead['people']; baseline: NpcWorldState; revision: number | null; turns: StoryTurn[]; fromSeq: number; currentThroughSeq: number; targetRanges?: Array<{fromSeq: number; toSeq: number}> } | null = null;
  let trajectoryCandidate: { result: TrajectoryCandidate; revision: number | null; people: PeopleDirectoryRead['people'] } | null = null;
  let stopTrajectory: (() => void) | null = null;
  let directory: PeopleDirectoryRead | null = null;
  let ownState: NpcWorldState | null = null;
  let revision: number | null = null;
  let checked: { scopeId: string; people: PeopleDirectoryRead['people']; baseline: NpcWorldState; revision: number | null; fromSeq: number; throughSeq: number; turns: import('./contracts').StoryTurn[]; uncovered: Array<{ fromSeq: number; toSeq: number }>; batchCharacters: 12000 | 24000 | 48000 } | null = null;
  let pending: { scopeId: string; people: PeopleDirectoryRead['people']; baseline: NpcWorldState; revision: number | null; candidate: NpcWorldState; throughSeq: number; ranges: Array<{ fromSeq: number; toSeq: number }> } | null = null;
  let historySession: HistoryCollectionSession | null = null;
  let stopHistory: (() => void) | null = null;

  const development = createDevelopmentController({ deps, state, refresh, snapshot: () => ({directory, state: ownState, revision}), publish(saved, nextRevision, people) {
    ownState = saved; revision = nextRevision;
    const unified=mergeWorldPeople(people,saved);
    if(directory)directory={...directory,people:unified,status:unified.length?'ready':directory.status};
    state.value = {...state.value, source:directory?{status:directory.status,message:directory.message}:state.value.source, world: projectWorldState(saved.scopeId, unified.map(projectSourcePerson), saved), processedThroughSeq: saved.processedThroughSeq, currentTimeStarted: saved.currentTimeStartedThroughSeq !== undefined};
  }});

  async function requestCurrentModel(request: ModelRequest) {
    request.signal?.throwIfAborted();
    const profiles = await deps.config.getProfiles();
    request.signal?.throwIfAborted();
    const model = deps.createModelRequester(profiles);
    const { onStarted, ...dispatch } = request;
    // 配置属于每次请求；计数从实际派发开始，不把读取设置或已停止的等待算作模型调用。
    onStarted?.();
    return model.request(dispatch);
  }

  async function refresh() {
    try {
      directory = deps.directory.readPeople();
      if (!directory.scopeId) {
        ownState = null; revision = null;
        state.value = { ...state.value, world: { ...createEmptyWorld(), people: directory.people.map(projectSourcePerson) }, processedThroughSeq: null, currentTimeStarted: false, source: { status: directory.status, message: directory.message }, error: '' };
        return;
      }
      const scopeId=directory.scopeId;
      const loaded = await deps.repository.load(scopeId);
      ownState = loaded?.state ?? createEmptyState(scopeId);
      revision = loaded?.revision ?? null;
      directory={...directory,people:mergeWorldPeople(directory.people,ownState)};
      if(directory.people.length&&['empty','waiting'].includes(directory.status))directory.status='ready';
      state.value = { ...state.value, world: projectWorldState(scopeId, directory.people.map(projectSourcePerson), ownState), processedThroughSeq: ownState.processedThroughSeq, currentTimeStarted: ownState.currentTimeStartedThroughSeq !== undefined, source: { status: directory.status, message: directory.message }, error: '' };
    } catch (error) {
      ownState = null; revision = null;
      state.value = { ...state.value, world: { ...createEmptyWorld(), people: directory?.people.map(projectSourcePerson) ?? [] }, source: { status: directory?.status ?? 'error', message: directory?.message ?? '读取千千结人物目录失败。' }, error: error instanceof Error ? error.message : '读取百面相世界数据失败。' };
    }
  }

  async function advanceToCurrent() {
    if (state.value.busy || pending || historySession || trajectoryView.value.status === 'ready') return;
    if (checked) {
      checked = null;
      historyView.value = { status: 'idle', fromSeq: 1, throughSeq: null, batchCharacters: 24000, floors: 0, excludedFloors: 0, characters: 0, batches: 0, skipped: 0, partial: false, progress: 0, modelCalls: 0, materialReads: 0, message: '' };
    }
    const startDirectory = directory;
    const startState = ownState;
    const startRevision = revision;
    if (!startDirectory?.scopeId || !startState) { state.value = { ...state.value, error: '尚未读取当前人物世界，请刷新后再推进。' }; return; }
    const startedAt = Date.now(); let stage = '读取正文'; let modelCalls = 0; let materialReads = 0;
    const diagnose = () => ({ stage, modelCalls, materialReads, elapsedMs: Math.max(0, Date.now() - startedAt) });
    state.value = { ...state.value, busy: true, error: '', report: null, diagnostics: null };
    try {
      const rawStory = deps.story.readStoryInput({ afterSeq: startState.processedThroughSeq });
      let story = rawStory.throughSeq === null ? rawStory : {
        ...rawStory,
        source: { ...rawStory.source, id: `${startDirectory.scopeId}:${rawStory.throughSeq}`, label: `第 ${rawStory.throughSeq} 楼正文` },
      };
      let mode: 'start' | 'advance' = 'advance';
      if (story.status === 'empty' && startState.currentTimeStartedThroughSeq === undefined && startState.processedThroughSeq !== null) {
        const current = deps.story.readStoryInput({ afterSeq: null });
        if (current.status === 'ready' && current.throughSeq === startState.processedThroughSeq) {
          story = { ...current, source: { ...current.source, id: `${startDirectory.scopeId}:${current.throughSeq}`, label: `第 ${current.throughSeq} 楼正文` } };
          mode = 'start';
        }
      }
      if (story.status !== 'ready') {
        state.value = { ...state.value, report: { message: story.message, modelCalls: 0, materialReads: 0, throughSeq: story.throughSeq }, diagnostics: diagnose() };
        return;
      }
      stage = '读取模型设置';
      const model = { async request(request: ModelRequest) { return requestCurrentModel({ ...request, onStarted: () => { modelCalls++; request.onStarted?.(); } }); } };
      const materials = { async readForQuestion(request: Parameters<typeof deps.materials.readForQuestion>[0]) { materialReads++; return deps.materials.readForQuestion(request); } };
      stage = '读取人物资料并推演';
      const prior = savedEndpoint(startState);
      const from = prior ?? { id: newId(), text: !startState.simulationRanges?.length && startState.storyTime?.text ? startState.storyTime.text : '当前时点（过去未补写）', sourceSeqs: story.turns.map(t => t.seq) };
      const window: SimulationWindow = { id: newId(), kind: 'current', from, to: from, throughSeq: story.throughSeq! };
      const result = await deps.advancer.advance({ people: startDirectory.people, state: startState, story, mode, window, dependencies: { model, materials } });
      stage = '保存本批世界记录';
      const saved = await deps.repository.save(startDirectory.scopeId, { ...result.state, ...(result.window ? { simulationRanges: [...(startState.simulationRanges ?? []), result.window], activities: result.state.activities.map(a => a.sources.some(s => s.kind === 'manual') || JSON.stringify(a) === JSON.stringify(startState.activities.find(old => old.id === a.id)) ? a : { ...a, currentStateWindowId: result.window!.id }) } : {}), currentTimeStartedThroughSeq: result.state.currentTimeStartedThroughSeq ?? story.throughSeq ?? startState.processedThroughSeq ?? undefined }, startRevision);
      ownState = saved.state; revision = saved.revision;
      stage = '完成';
      state.value = { ...state.value, world: projectWorldState(startDirectory.scopeId, startDirectory.people.map(projectSourcePerson), saved.state), processedThroughSeq: saved.state.processedThroughSeq, currentTimeStarted: saved.state.currentTimeStartedThroughSeq !== undefined, report: result.report, diagnostics: diagnose() };
    } catch (error) {
      state.value = { ...state.value, error: error instanceof Error ? error.message : '推进失败，请检查人物资料和模型设置。', diagnostics: diagnose() };
    } finally { state.value = { ...state.value, busy: false }; }
  }

  function checkTrajectory(fromSeq = 1, toSeq?: number) {
    if (state.value.busy || pending || historySession || !deps.history) return;
    const baseline = ownState; const startDirectory = directory;
    trajectoryChecked = null; trajectoryCandidate = null;
    if (!baseline || !startDirectory?.scopeId) { trajectoryView.value = { status: 'error', completed: 0, modelCalls: 0, message: '', error: '请先返回图谱刷新人物，再检查幕后范围。' }; return; }
    const start = Math.max(1, Math.floor(fromSeq));
    const read = deps.history.readStoryHistory({ fromSeq: start, scopeId: startDirectory.scopeId });
    if (read.status !== 'ready' || read.throughSeq === null) { trajectoryView.value = { status: 'checked', completed: 0, modelCalls: 0, message: read.message }; return; }
    const end = toSeq === undefined ? read.throughSeq : Math.min(read.throughSeq, Math.floor(toSeq));
    const turns = read.turns.filter(t => t.seq <= end);
    const check = inspectTrajectory({ people: startDirectory.people, state: baseline, turns, fromSeq: start });
    check.requestedToSeq = toSeq;
    if (check.canPrepare) trajectoryChecked = { people: startDirectory.people, baseline, revision, turns, fromSeq: start, currentThroughSeq: read.throughSeq };
    trajectoryView.value = { status: 'checked', check, completed: 0, modelCalls: 0, message: check.message };
  }

  async function reloadTrajectory(fromSeq = 1, toSeq?: number) {
    if (state.value.busy) return;
    const candidate = trajectoryView.value.conflict ? trajectoryCandidate : null;
    await refresh();
    if (!ownState) { trajectoryView.value = { ...trajectoryView.value, error: '读取记录失败，请再次点击“重新读取并检查”。' }; return; }
    if (candidate && revision === candidate.revision) {
      trajectoryView.value = { ...trajectoryView.value, status: 'error', canSave: true, conflict: false, error: '已确认原版本未变化，可重新保存保留的结果，不会再次调用模型。' };
      return;
    }
    checkTrajectory(fromSeq, toSeq);
  }

  async function persistTrajectory() {
    const candidate = trajectoryCandidate;
    if (!candidate) return;
    trajectoryView.value = { ...trajectoryView.value, progress: {windowIndex: 0, stage: 'save'}, canSave: false, error: undefined };
    try {
      const saved = await deps.repository.save(candidate.result.state.scopeId, candidate.result.state, candidate.revision);
      ownState = saved.state; revision = saved.revision;
      if (trajectoryChecked) { trajectoryChecked.baseline = saved.state; trajectoryChecked.revision = saved.revision; }
      state.value = { ...state.value, world: projectWorldState(saved.state.scopeId, candidate.people.map(projectSourcePerson), saved.state), processedThroughSeq: saved.state.processedThroughSeq, currentTimeStarted: saved.state.currentTimeStartedThroughSeq !== undefined };
      const remaining = candidate.result.remainingRanges;
      if (trajectoryChecked) trajectoryChecked.targetRanges = remaining;
      trajectoryCandidate = null; if (!remaining.length) trajectoryChecked = null;
      trajectoryView.value = { ...trajectoryView.value, status: remaining.length ? 'checked' : 'saved', progress: undefined, completed: trajectoryView.value.completed + candidate.result.windows.length, canSave: false, savedThrough: candidate.result.windows.at(-1)?.to, message: `已保存，新增 ${candidate.result.addedEvents} 条幕后经历、${candidate.result.addedActivities} 项事务、${candidate.result.addedKnowledge} 条知情。${remaining.length ? `${remaining.map(range => `第 ${range.fromSeq - 1}—${range.toSeq - 1} 楼`).join('、')}尚未补全，可继续补写未完成部分。` : ''}` };
    } catch (error) {
      const detail = error as Error & {status?: number; code?: string};
      const conflict = detail.status === 409 || detail.code === 'conflict';
      const uncertain = detail.status === 0 || detail.code === 'network_error';
      if (conflict) trajectoryCandidate = null;
      trajectoryView.value = { ...trajectoryView.value, status: 'error', progress: undefined, canSave: !conflict && !uncertain, conflict: conflict || uncertain, error: conflict ? '记录已发生变化，请重新读取并检查后生成；不会覆盖新的记录。' : uncertain ? '未收到保存确认，请重新读取并检查实际记录。' : '保存失败，结果仍保留，可点击“重新保存”且不会再次调用模型。', message: detail.message || '' };
    }
  }

  async function startTrajectory() {
    if (state.value.busy || !trajectoryChecked || trajectoryCandidate || !['checked', 'ready', 'error', 'stopped'].includes(trajectoryView.value.status)) return;
    const current = trajectoryChecked;
    const stop = {value: false}; const modelAbort = new AbortController();
    stopTrajectory = () => { stop.value = true; modelAbort.abort(); };
    state.value = { ...state.value, busy: true, error: '' };
    trajectoryView.value = { ...trajectoryView.value, status: 'running', progress: undefined, canSave: false, conflict: false, error: undefined, message: '' };
    try {
      const result = await generateTrajectoryBatch({ ...current, state: current.baseline, model: {async request(request: ModelRequest) {
        try { return await requestCurrentModel({ ...request, signal: modelAbort.signal, onStarted: () => { trajectoryView.value = { ...trajectoryView.value, requestPending: true, modelCalls: trajectoryView.value.modelCalls + 1 }; request.onStarted?.(); } }); }
        finally { trajectoryView.value = { ...trajectoryView.value, requestPending: false }; }
      }}, shouldStop: () => stop.value });
      if (stop.value || !result) { trajectoryView.value = { ...trajectoryView.value, status: 'stopped', progress: undefined, message: '已停止，本次没有提交保存。' }; return; }
      trajectoryCandidate = {result, revision: current.revision, people: current.people};
      await persistTrajectory();
    } catch (error) {
      trajectoryView.value = stop.value ? { ...trajectoryView.value, status: 'stopped', error: undefined, message: '已停止，本次没有提交保存。' } : { ...trajectoryView.value, status: 'error', error: error instanceof Error ? error.message : '补写结果无法读取，请重新生成。', message: '' };
    } finally { stopTrajectory = null; state.value = { ...state.value, busy: false }; }
  }
  async function saveTrajectory() {
    if (state.value.busy || !trajectoryCandidate || !trajectoryView.value.canSave) return;
    state.value = { ...state.value, busy: true };
    trajectoryView.value = { ...trajectoryView.value, status: 'running' };
    stopTrajectory = () => {};
    try { await persistTrajectory(); }
    finally { stopTrajectory = null; state.value = { ...state.value, busy: false }; }
  }
  function cancelTrajectory() { stopTrajectory?.(); }
  function discardTrajectory() { if (state.value.busy) return; trajectoryChecked = null; trajectoryCandidate = null; trajectoryView.value = { status: 'idle', completed: 0, modelCalls: 0, message: '' }; }

  function checkHistory(fromSeq = 1, batchCharacters: 12000 | 24000 | 48000 = 24000) {
    if (state.value.busy || pending || historySession || trajectoryView.value.status === 'ready' || !deps.history) return;
    const startDirectory = directory; const baseline = ownState; const startRevision = revision;
    if (!startDirectory?.scopeId || !baseline) { historyView.value = { ...historyView.value, status: 'error', error: '尚未读取当前人物世界。请返回图谱点击“刷新人物”，再检查范围。' }; return; }
    const start = Math.max(1, Math.floor(fromSeq));
    const result = deps.history.readStoryHistory({ fromSeq: start, scopeId: startDirectory.scopeId });
    if (result.status !== 'ready' || result.throughSeq === null) { checked = null; historyView.value = { status: result.status === 'waiting' ? 'error' : 'checked', fromSeq: start, throughSeq: result.throughSeq, batchCharacters, floors: result.floorCount ?? 0, excludedFloors: result.excludedFloors ?? 0, characters: 0, batches: 0, skipped: 0, partial: false, progress: 0, modelCalls: 0, materialReads: 0, message: result.message }; return; }
    const covered = baseline.historyRanges ?? [];
    const uncovered = subtractRanges(start, result.throughSeq, covered);
    const turns = result.turns.filter(turn => uncovered.some(range => turn.seq >= range.fromSeq && turn.seq <= range.toSeq));
    const batches = buildBatches(turns, batchCharacters);
    checked = batches.length ? { scopeId: startDirectory.scopeId, people: startDirectory.people, baseline, revision: startRevision, fromSeq: start, throughSeq: result.throughSeq, turns, uncovered, batchCharacters } : null;
    const skipped = covered.reduce((sum, range) => sum + Math.max(0, Math.min(range.toSeq, result.throughSeq!) - Math.max(range.fromSeq, start) + 1), 0);
    historyView.value = { status: 'checked', fromSeq: start, throughSeq: result.throughSeq, batchCharacters, floors: result.floorCount ?? new Set(result.turns.map(turn => turn.seq)).size, excludedFloors: result.excludedFloors ?? 0, characters: turns.reduce((sum, turn) => sum + characterCount(turn.text), 0), batches: batches.length, skipped, partial: false, progress: 0, modelCalls: 0, materialReads: 0, message: batches.length ? '已完成本地范围检查。' : '所选范围已覆盖或没有可读取正文，无需请求模型。' };
  }

  async function startHistory() {
    if (state.value.busy || !checked || !historyView.value.batches || historyView.value.status === 'preview') return;
    const current = checked;
    historySession ??= createHistoryCollectionSession({ baseline: current.baseline, turns: current.turns, batchCharacters: current.batchCharacters });
    const session = historySession; const stop = { value: false }; stopHistory = () => { stop.value = true; };
    state.value = { ...state.value, busy: true, error: '' };
    historyView.value = { ...historyView.value, status: 'collecting', canContinue: false, currentBatch: undefined, stage: undefined, error: undefined, message: '正在准备历史整理。' };
    try {
      const model = { request: requestCurrentModel };
      const result = await collectHistory({ people: current.people, baseline: current.baseline, turns: current.turns, batchCharacters: current.batchCharacters, session, model, materials: deps.materials, shouldStop: () => stop.value, onProgress: progress => {
        const message = progress.stage === 'materials' ? '正在读取人物资料。' : progress.currentBatch
          ? `正在等待第 ${progress.currentBatch}/${progress.total} 批返回；已完成 ${progress.completed} 批、已发出 ${progress.modelCalls} 次请求。`
          : `已完成 ${progress.completed}/${progress.total} 批；已发出 ${progress.modelCalls} 次请求，正在整理本批结果。`;
        historyView.value = { ...historyView.value, progress: progress.completed, modelCalls: progress.modelCalls, materialReads: progress.materialReads, currentBatch: progress.currentBatch ?? undefined, stage: progress.stage, message };
      } });
      const candidate = historyCandidateForSave(result.state, current.baseline, current.throughSeq);
      pending = { scopeId: current.scopeId, people: current.people, baseline: current.baseline, revision: current.revision, candidate, throughSeq: current.throughSeq, ranges: current.uncovered };
      historySession = null; checked = null;
      historyView.value = { ...historyView.value, status: 'preview', canContinue: false, currentBatch: undefined, stage: undefined, progress: result.batches, modelCalls: result.modelCalls, materialReads: result.materialReads, skipped: result.skipped, partial: result.partial, candidate, error: undefined, message: `历史整理完成，${result.modelCalls} 次模型请求；请预览后确认。` };
    } catch (error) {
      const detail = error as Error & { cancelled?: boolean; failedBatch?: number; modelCalls?: number; completedBatches?: number };
      const completed = detail.completedBatches ?? session.nextBatch;
      const failure = detail.message || '历史整理失败。';
      const modelCalls = detail.modelCalls ?? session.modelCalls;
      const stoppedMessage = completed > 0
        ? `已取消历史整理；已完成 ${completed} 批、已发出 ${modelCalls} 次模型请求。已完成批次的草稿已保留，可手动继续或放弃。正式记录未改。`
        : `已取消历史整理；尚未完成任何批，已发出 ${modelCalls} 次模型请求。可手动重试或放弃本次整理。正式记录未改。`;
      historyView.value = detail.cancelled
        ? { ...historyView.value, status: 'cancelled', canContinue: true, currentBatch: undefined, modelCalls: detail.modelCalls ?? session.modelCalls, progress: completed, materialReads: session.materialReads, error: undefined, message: stoppedMessage }
        : { ...historyView.value, status: 'error', canContinue: true, currentBatch: undefined, modelCalls: detail.modelCalls ?? session.modelCalls, progress: completed, materialReads: session.materialReads, error: failure, message: '' };
    } finally { stopHistory = null; state.value = { ...state.value, busy: false }; }
  }

  function cancelHistory() { stopHistory?.(); }

  async function confirmHistory() {
    if (!pending || state.value.busy) return;
    const current = pending; state.value = { ...state.value, busy: true, error: '' };
    const merged: NpcWorldState = { ...historyCandidateForSave(current.candidate, current.baseline, current.throughSeq), scopeId: current.scopeId, processedThroughSeq: Math.max(current.baseline.processedThroughSeq ?? 0, current.throughSeq), historyRanges: mergeRanges([...(current.baseline.historyRanges ?? []), ...current.ranges]) };
    try {
      const saved = await deps.repository.save(current.scopeId, merged, current.revision);
      ownState = saved.state; revision = saved.revision; pending = null; checked = null;
      state.value = { ...state.value, world: projectWorldState(current.scopeId, current.people.map(projectSourcePerson), saved.state), processedThroughSeq: saved.state.processedThroughSeq, error: '' };
      historyView.value = { ...historyView.value, status: 'saved', candidate: undefined, error: undefined, message: '历史接续已保存到当前世界记录。' };
    } catch (error) {
      historyView.value = { ...historyView.value, status: 'preview', error: error instanceof Error ? error.message : '保存历史接入失败；候选仍保留，可查看冲突原因。' };
    } finally { state.value = { ...state.value, busy: false }; }
  }

  function discardHistory() { pending = null; checked = null; historySession = null; historyView.value = { status: 'idle', fromSeq: 1, throughSeq: null, batchCharacters: 24000, floors: 0, excludedFloors: 0, characters: 0, batches: 0, skipped: 0, partial: false, progress: 0, modelCalls: 0, materialReads: 0, message: '已放弃本次历史草稿，正式记录未改。' }; }

  return { developmentView: development.view, constructWorld: development.construct, configureDevelopment: development.configure, inspectDevelopment: development.inspect, startDevelopment: development.start, onStoryCompleted: development.onCompleted, stopDevelopment: development.stop, saveDevelopment: development.save, reloadDevelopment: development.reload, trajectoryView: readonly(trajectoryView), checkTrajectory, reloadTrajectory, saveTrajectory, startTrajectory, cancelTrajectory, discardTrajectory, state: readonly(state), historyView: readonly(historyView), refresh, advanceToCurrent, checkHistory, startHistory, cancelHistory, confirmHistory, discardHistory };
}

function historyCandidateForSave(candidate: NpcWorldState, baseline: NpcWorldState, throughSeq: number): NpcWorldState {
  const keepCurrentTime = baseline.storyTime && baseline.processedThroughSeq !== null && baseline.processedThroughSeq >= throughSeq;
  return { ...candidate, storyTime: keepCurrentTime ? baseline.storyTime : candidate.storyTime ?? baseline.storyTime };
}
