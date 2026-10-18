import type { StoryInput, StoryInputReader, StoryTurn } from '../application/contracts';
import type { SourceRef } from '../domain/world';
import { getHostContext, type HostContext } from './host-context';
import { cleanAssistantStoryText } from './story-text';

type Floor = { seq?: number; sourceIndex?: number; mesCooked?: string; text?: string; is_user?: boolean; isUser?: boolean; is_system?: boolean; isSystem?: boolean; role?: string };
type HostMessage = Floor & { mes?: string; swipes?: string[]; swipe_id?: number };
const text = (value: unknown) => typeof value === 'string' ? value.trim() : '';
function turn(floor: Floor, fallbackSeq: number): StoryTurn | null {
  if (floor.is_system === true || floor.isSystem === true || floor.role === 'system') return null;
  const raw = text(floor.mesCooked ?? floor.text);
  const isUser = floor.is_user === true || floor.isUser === true || floor.role === 'user';
  const cleaned = isUser ? null : cleanAssistantStoryText(raw);
  if (!raw || (cleaned && !cleaned.hasNarrative)) return null;
  const value = cleaned?.text ?? raw;
  const seq = Number(floor.seq ?? (Number.isInteger(floor.sourceIndex) ? Number(floor.sourceIndex) + 1 : fallbackSeq));
  if (!Number.isInteger(seq) || seq < 1) return null;
  return { seq, text: value, isUser };
}
function hostFloorText(message: HostMessage): string {
  return text(message.mes) || text(message.swipes?.[message.swipe_id ?? 0]);
}
function latestCompletedAi(chat: unknown, afterSeq: number | null): number | null {
  if (!Array.isArray(chat)) return null;
  for (let index = chat.length - 1; index >= 0; index--) {
    const seq = index + 1;
    if (afterSeq !== null && seq <= afterSeq) break;
    const message = chat[index] as HostMessage | null;
    if (!message || message.is_system === true || message.isSystem === true || message.is_user === true || message.isUser === true || message.role === 'system' || message.role === 'user') continue;
    const value = hostFloorText(message);
    if (!value) continue;
    if (cleanAssistantStoryText(value).hasNarrative) return seq;
    // A first read starts at the newest nonempty assistant floor, not by
    // searching old history when that floor contains only draft/time material.
    if (afterSeq === null) return null;
  }
  return null;
}

export function createStoryInputReader({ getContext = getHostContext }: { getContext?: () => HostContext | undefined } = {}): StoryInputReader {
  return { readStoryInput({ afterSeq }): StoryInput {
    const context = getContext();
    const source: SourceRef = { kind: 'chat', id: 'current-story', label: '当前正文' };
    if (!context) return { status: 'waiting', message: '等待酒馆正文入口就绪。', throughSeq: null, turns: [], source };
    const ctx = context as Record<string, unknown>;
    const latest = latestCompletedAi(ctx.chat, afterSeq);
    if (latest === null) return { status: 'empty', message: '尚无新的已完成剧情正文。', throughSeq: afterSeq, turns: [], source };
    const fromSeq = afterSeq === null ? latest : afterSeq + 1;
    let turns: StoryTurn[] = [];
    const readFloors = ctx.readPluginFloors;
    if (typeof readFloors === 'function') {
      const floors = (readFloors as (input: { fromSeq: number; toSeq: number; roles: string[] }) => unknown)({ fromSeq, toSeq: latest, roles: ['user', 'assistant'] });
      if (Array.isArray(floors)) turns = floors.map((value, index) => turn((value ?? {}) as Floor, fromSeq + index)).filter((value): value is StoryTurn => Boolean(value));
    } else {
      const chat = ctx.chat as HostMessage[];
      turns = chat.slice(fromSeq - 1, latest).map((message, index) => turn({ ...message, text: hostFloorText(message) }, fromSeq + index)).filter((value): value is StoryTurn => Boolean(value));
    }
    turns = turns.filter(item => item.seq <= latest);
    if (afterSeq === null) turns = turns.filter(item => !item.isUser && item.seq === latest);
    if (!turns.some(item => !item.isUser)) return { status: 'empty', message: '没有可读取的已完成剧情正文。', throughSeq: afterSeq, turns: [], source };
    return { status: 'ready', message: '已读取当前完成的剧情正文。', throughSeq: latest, turns, source };
  } };
}
