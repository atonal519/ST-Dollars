import type { StoryHistoryReader, StoryTurn } from '../application/contracts';
import type { SourceRef } from '../domain/world';
import { getHostContext, type HostContext } from './host-context';
import { cleanAssistantStoryText } from './story-text';

type Floor = { seq?: number; sourceIndex?: number; mesCooked?: string; text?: string; is_user?: boolean; isUser?: boolean; is_system?: boolean; isSystem?: boolean; role?: string; extra?: { qianqianjieAutoHide?: { schemaVersion?: number; chatId?: string }; type?: string } };
type HostMessage = Floor & { mes?: string; swipes?: string[]; swipe_id?: number };
const text = (value: unknown) => typeof value === 'string' ? value.trim() : '';
function floorTurn(floor: Floor, fallbackSeq: number, rawFloor: Floor | undefined, scopeId: string): StoryTurn | null {
  const seq = Number(floor.seq ?? (Number.isInteger(floor.sourceIndex) ? Number(floor.sourceIndex) + 1 : fallbackSeq));
  const hidden = rawFloor?.extra?.qianqianjieAutoHide?.schemaVersion === 1 && rawFloor.extra.qianqianjieAutoHide.chatId === scopeId;
  const system = floor.is_system === true || floor.isSystem === true || floor.role === 'system';
  if (system && (!hidden || rawFloor?.extra?.type === 'system' || rawFloor?.extra?.type === 'narrator')) return null;
  const identityFloor = hidden ? rawFloor! : floor;
  const isUser = identityFloor.is_user === true || identityFloor.isUser === true || identityFloor.role === 'user';
  const raw = text(floor.mesCooked ?? floor.text);
  if (!raw) return null;
  const cleaned = isUser ? null : cleanAssistantStoryText(raw);
  if (cleaned && !cleaned.hasNarrative) return null;
  return Number.isInteger(seq) && seq > 0 ? { seq, text: cleaned?.text ?? raw, isUser } : null;
}
function messageText(message: HostMessage): string { return text(message.mes) || text(message.swipes?.[message.swipe_id ?? 0]); }
function latestAiSlot(chat: unknown, scopeId: string): number | null {
  if (!Array.isArray(chat)) return null;
  for (let index = chat.length - 1; index >= 0; index--) {
    const message = chat[index] as HostMessage | null;
    if (!message) continue;
    const hidden = message.extra?.qianqianjieAutoHide?.schemaVersion === 1 && message.extra.qianqianjieAutoHide.chatId === scopeId;
    if ((message.is_system || message.isSystem || message.role === 'system') && (!hidden || ['system','narrator'].includes(message.extra?.type ?? ''))) continue;
    if (!message.is_user && !message.isUser && message.role !== 'user') return index + 1;
  }
  return null;
}
function latestCompletedAi(chat: unknown, scopeId: string, processor: any, beforeSeq?: number | null): number | null {
  if (!Array.isArray(chat)) return null;
  for (let index = chat.length - 1; index >= 0; index--) {
    if (beforeSeq !== undefined && (beforeSeq === null || index + 1 >= beforeSeq)) continue;
    const message = chat[index] as HostMessage | null;
    if (!message) continue;
    const active = processor?.isFinished === false && processor?.isStopped !== true;
    const streamingIndex = Number.isInteger(processor?.messageId) && processor.messageId >= 0 ? processor.messageId : chat.length - 1;
    if (active && index === streamingIndex) continue;
    const candidate = floorTurn({...message, text: messageText(message)}, index + 1, message, scopeId);
    if (candidate && !candidate.isUser) return index + 1;
  }
  return null;
}

export function createStoryHistoryReader({ getContext = getHostContext }: { getContext?: () => HostContext | undefined } = {}): StoryHistoryReader {
  return { readStoryHistory({ fromSeq, toSeq, scopeId, stableOnly = false, currentOnly = false }) {
    const context = getContext(); const source: SourceRef = { kind: 'chat', id: 'current-history', label: '已有剧情' };
    if (!context) return { status: 'waiting', message: '等待酒馆正文入口就绪。', fromSeq, throughSeq: null, floorCount: 0, excludedFloors: 0, turns: [], source };
    const latestAiSeq = latestAiSlot(context.chat, scopeId);
    let throughSeq = latestCompletedAi(context.chat, scopeId, context.streamingProcessor, stableOnly ? latestAiSeq : undefined);
    if (throughSeq !== null && toSeq !== undefined && toSeq < throughSeq) throughSeq = latestCompletedAi(context.chat, scopeId, context.streamingProcessor, toSeq + 1);
    const emptyMessage = stableOnly ? '等待新的稳定剧情；最新一条回复暂不处理。' : '所选范围内没有已完成的剧情正文。';
    if (throughSeq === null || throughSeq < fromSeq) return { status: 'empty', message: emptyMessage, fromSeq, throughSeq, latestAiSeq, floorCount: 0, excludedFloors: 0, turns: [], source };
    if(currentOnly){const previous=latestCompletedAi(context.chat,scopeId,context.streamingProcessor,throughSeq);fromSeq=Math.max(fromSeq,(previous??0)+1);}
    let turns: StoryTurn[];
    const read = (context as Record<string, unknown>).readPluginFloors;
    if (typeof read === 'function') {
      const floors = (read as (input: { fromSeq: number; toSeq: number; roles: string[] }) => unknown)({ fromSeq, toSeq: throughSeq, roles: ['user', 'assistant', 'system'] });
      const rawChat = (context as Record<string, unknown>).chat as HostMessage[];
      turns = Array.isArray(floors) ? floors.map((floor, index) => {
        const value = (floor ?? {}) as Floor; const seq = Number(value.seq ?? (Number.isInteger(value.sourceIndex) ? Number(value.sourceIndex) + 1 : fromSeq + index));
        return floorTurn(value, fromSeq + index, rawChat?.[seq - 1], scopeId);
      }).filter((item): item is StoryTurn => Boolean(item)) : [];
    } else {
      const chat = (context as Record<string, unknown>).chat as HostMessage[];
      turns = chat.slice(fromSeq - 1, throughSeq).map((message, index) => floorTurn({ ...message, text: messageText(message) }, fromSeq + index, message, scopeId)).filter((item): item is StoryTurn => Boolean(item));
    }
    turns = turns.filter(turn => turn.seq >= fromSeq && turn.seq <= throughSeq!);
    if (stableOnly) {
      throughSeq = turns.filter(turn => !turn.isUser).at(-1)?.seq ?? null;
      if (throughSeq === null) return { status: 'empty', message: emptyMessage, fromSeq, throughSeq, latestAiSeq, floorCount: 0, excludedFloors: 0, turns: [], source };
      turns = turns.filter(turn => turn.seq <= throughSeq!);
    }
    const floorCount = Math.max(0, Math.min(throughSeq, Array.isArray((context as Record<string, unknown>).chat) ? ((context as Record<string, unknown>).chat as unknown[]).length : 0) - fromSeq + 1);
    const includedFloors = new Set(turns.map(turn => turn.seq)).size;
    return { status: 'ready', message: '已读取所选范围的已完成剧情。', fromSeq, throughSeq, latestAiSeq, floorCount, excludedFloors: Math.max(0, floorCount - includedFloors), turns, source };
  } };
}
