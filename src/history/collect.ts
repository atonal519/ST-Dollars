import type { ModelRequester, QuestionMaterialRead, QuestionMaterialReader, StoryTurn } from '../application/contracts';
import type { SourcePerson } from '../domain/source-people';
import type { NpcWorldState } from '../domain/world-state';
import { buildBatches } from './batches';
import { HISTORY_INSTRUCTIONS } from './prompts';
import { mergeHistoryBatch } from './merge';

// The controller owns this one task until it is saved or discarded; only a merged batch advances nextBatch.
export interface HistoryCollectionSession {
  batches: StoryTurn[][];
  state: NpcWorldState;
  nextBatch: number;
  material: QuestionMaterialRead | null;
  modelCalls: number;
  materialReads: number;
  skipped: number;
  partial: boolean;
}

export function createHistoryCollectionSession(input: { baseline: NpcWorldState; turns: StoryTurn[]; batchCharacters?: number }): HistoryCollectionSession {
  return { batches: buildBatches(input.turns, input.batchCharacters), state: input.baseline, nextBatch: 0, material: null, modelCalls: 0, materialReads: 0, skipped: 0, partial: false };
}

export async function collectHistory(input: {
  people: SourcePerson[];
  baseline: NpcWorldState;
  turns: StoryTurn[];
  model: ModelRequester;
  materials: QuestionMaterialReader;
  batchCharacters?: number;
  session?: HistoryCollectionSession;
  shouldStop?: () => boolean;
  onProgress?: (progress: { completed: number; total: number; modelCalls: number; materialReads: number; currentBatch: number | null; stage: 'materials' | 'request' | 'merge' }) => void;
}) {
  const session = input.session ?? createHistoryCollectionSession(input);
  const batches = session.batches;
  if (!batches.length) return { state: input.baseline, batches: 0, modelCalls: 0, materialReads: 0, skipped: 0, partial: false };
  if (input.people.length > 100) throw new Error('当前人物超过千千结单次读取上限100人，尚未开始历史整理。');
  if (!session.material) {
    session.materialReads++;
    input.onProgress?.({ completed: session.nextBatch, total: batches.length, modelCalls: session.modelCalls, materialReads: session.materialReads, currentBatch: null, stage: 'materials' });
    const material = await input.materials.readForQuestion({ question: '帮助理解当前已确认人物的身份与现在资料；不要将当前状态推定为过去事实。', personIds: input.people.map(person => person.id), maxCharacters: 16000 });
    if (!['ready', 'empty'].includes(material.status)) throw new Error(material.message || '读取千千结当前人物资料失败，未整理历史。');
    session.material = material;
    session.partial = material.coverage.partial;
  }
  const material = session.material;
  while (session.nextBatch < batches.length) {
    const index = session.nextBatch;
    if (input.shouldStop?.()) throw Object.assign(new Error(`已取消历史整理；已完成 ${index} 批，已发出 ${session.modelCalls} 次模型请求，正式记录未改。`), { cancelled: true, modelCalls: session.modelCalls, completedBatches: index });
    const batch = batches[index];
    let response: unknown;
    try { response = await input.model.request({ task: 'history', instructions: HISTORY_INSTRUCTIONS, onStarted: () => { session.modelCalls++; input.onProgress?.({ completed: session.nextBatch, total: batches.length, modelCalls: session.modelCalls, materialReads: session.materialReads, currentBatch: index + 1, stage: 'request' }); }, input: {
      floors: batch.map(turn => ({ seq: turn.seq, role: turn.isUser ? 'user' : 'assistant', text: turn.text })),
      people: input.people.map(person => ({ id: person.id, name: person.displayName, aliases: person.aliases })),
      currentMaterials: material.materials, currentBackground: material.routerText, materialsPartial: material.coverage.partial,
      baselineNow: { storyTime: input.baseline.storyTime, activities: input.baseline.activities, events: input.baseline.events, knowledge: input.baseline.knowledge },
      historyDraft: { activities: session.state.activities.filter(item => !input.baseline.activities.some(base => base.id === item.id)), events: session.state.events.filter(item => !input.baseline.events.some(base => base.id === item.id)), knowledge: session.state.knowledge.filter(item => !input.baseline.knowledge.some(base => base.personId === item.personId && base.eventId === item.eventId)) },
    } }); } catch (error) { throw Object.assign(new Error(error instanceof Error ? error.message : '模型请求失败。'), { failedBatch: index + 1, modelCalls: session.modelCalls, completedBatches: session.nextBatch, cause: error }); }
    if (input.shouldStop?.()) throw Object.assign(new Error(`已取消历史整理；已完成 ${index} 批，已发出 ${session.modelCalls} 次模型请求，正式记录未改。`), { cancelled: true, modelCalls: session.modelCalls, completedBatches: index });
    let merged: ReturnType<typeof mergeHistoryBatch>;
    input.onProgress?.({ completed: session.nextBatch, total: batches.length, modelCalls: session.modelCalls, materialReads: session.materialReads, currentBatch: index + 1, stage: 'merge' });
    try { merged = mergeHistoryBatch({ baseline: input.baseline, candidate: session.state, batch, response, people: input.people }); }
    catch (error) { throw Object.assign(new Error(error instanceof Error ? error.message : '模型返回内容无法读取。'), { failedBatch: index + 1, modelCalls: session.modelCalls, completedBatches: session.nextBatch, cause: error }); }
    session.state = merged.state;
    session.nextBatch++;
    session.skipped += merged.skipped;
    session.partial ||= merged.partial;
    input.onProgress?.({ completed: session.nextBatch, total: batches.length, modelCalls: session.modelCalls, materialReads: session.materialReads, currentBatch: null, stage: 'merge' });
  }
  return { state: session.state, batches: batches.length, modelCalls: session.modelCalls, materialReads: session.materialReads, skipped: session.skipped, partial: session.partial };
}
