import { readonly, shallowRef } from 'vue';
import { createEmptyWorld } from '../domain/world';
import { createEmptyState, projectWorldState, type NpcWorldState } from '../domain/world-state';
import { projectSourcePerson } from '../domain/source-people';
import type { ControllerDependencies, ControllerState, PeopleDirectoryRead } from './contracts';

export function createPeopleWorld(deps: ControllerDependencies) {
  const state = shallowRef<ControllerState>({ world: createEmptyWorld(), source: { status: 'waiting', message: '尚未读取千千结人物目录。' }, processedThroughSeq: null, busy: false, report: null, diagnostics: null, error: '' });
  let directory: PeopleDirectoryRead | null = null;
  let ownState: NpcWorldState | null = null;
  let revision: number | null = null;

  async function refresh() {
    try {
      directory = deps.directory.readPeople();
      if (!directory.scopeId) {
        ownState = null; revision = null;
        state.value = { ...state.value, world: { ...createEmptyWorld(), people: directory.people.map(projectSourcePerson) }, processedThroughSeq: null, source: { status: directory.status, message: directory.message }, error: '' };
        return;
      }
      const loaded = await deps.repository.load(directory.scopeId);
      ownState = loaded?.state ?? createEmptyState(directory.scopeId);
      revision = loaded?.revision ?? null;
      state.value = { ...state.value, world: projectWorldState(directory.scopeId, directory.people.map(projectSourcePerson), ownState), processedThroughSeq: ownState.processedThroughSeq, source: { status: directory.status, message: directory.message }, error: '' };
    } catch (error) {
      ownState = null; revision = null;
      state.value = { ...state.value, world: { ...createEmptyWorld(), people: directory?.people.map(projectSourcePerson) ?? [] }, source: { status: directory?.status ?? 'error', message: directory?.message ?? '读取千千结人物目录失败。' }, error: error instanceof Error ? error.message : '读取百面相世界数据失败。' };
    }
  }

  async function advanceToCurrent() {
    if (state.value.busy) return;
    const startDirectory = directory;
    const startState = ownState;
    const startRevision = revision;
    if (!startDirectory?.scopeId || !startState) { state.value = { ...state.value, error: '尚未读取当前人物世界，请刷新后再推进。' }; return; }
    const startedAt = Date.now(); let stage = '读取正文'; let modelCalls = 0; let materialReads = 0;
    const diagnose = () => ({ stage, modelCalls, materialReads, elapsedMs: Math.max(0, Date.now() - startedAt) });
    state.value = { ...state.value, busy: true, error: '', report: null, diagnostics: null };
    try {
      const rawStory = deps.story.readStoryInput({ afterSeq: startState.processedThroughSeq });
      const story = rawStory.throughSeq === null ? rawStory : {
        ...rawStory,
        source: { ...rawStory.source, id: `${startDirectory.scopeId}:${rawStory.throughSeq}`, label: `第 ${rawStory.throughSeq} 楼正文` },
      };
      if (story.status !== 'ready') {
        state.value = { ...state.value, report: { message: story.message, modelCalls: 0, materialReads: 0, throughSeq: story.throughSeq }, diagnostics: diagnose() };
        return;
      }
      stage = '读取模型设置';
      const profiles = await deps.config.getProfiles();
      const actualModel = deps.createModelRequester(profiles);
      const model = { async request(request: Parameters<typeof actualModel.request>[0]) { modelCalls++; return actualModel.request(request); } };
      const materials = { async readForQuestion(request: Parameters<typeof deps.materials.readForQuestion>[0]) { materialReads++; return deps.materials.readForQuestion(request); } };
      stage = '读取人物资料并推演';
      const result = await deps.advancer.advance({ people: startDirectory.people, state: startState, story, dependencies: { model, materials } });
      stage = '保存本批世界记录';
      const saved = await deps.repository.save(startDirectory.scopeId, result.state, startRevision);
      ownState = saved.state; revision = saved.revision;
      stage = '完成';
      state.value = { ...state.value, world: projectWorldState(startDirectory.scopeId, startDirectory.people.map(projectSourcePerson), saved.state), processedThroughSeq: saved.state.processedThroughSeq, report: result.report, diagnostics: diagnose() };
    } catch (error) {
      state.value = { ...state.value, error: error instanceof Error ? error.message : '推进失败，请检查人物资料和模型设置。', diagnostics: diagnose() };
    } finally { state.value = { ...state.value, busy: false }; }
  }

  return { state: readonly(state), refresh, advanceToCurrent };
}
