import type { WorldEvent } from '../domain/world';

// 正文整理的 history-floor 来源是已确认事实；旧 scope:seq 也可能是早版幕后生成。
export function historyFactSeqs(event: WorldEvent): number[] {
  return event.sources.flatMap(source => {
    if (source.kind !== 'chat' || !source.id.startsWith('history-floor:')) return [];
    const value = source.id.slice('history-floor:'.length);
    return /^[1-9]\d*$/.test(value) && Number.isSafeInteger(Number(value)) ? [Number(value)] : [];
  });
}

export function factEvidenceKind(event: WorldEvent, scopeId: string): 'body-fact' | 'prior-generated' | 'other-record' {
  if (historyFactSeqs(event).length) return 'body-fact';
  return event.sources.some(source => source.kind === 'simulation' || source.kind === 'chat' && source.id.startsWith(`${scopeId}:`)) ? 'prior-generated' : 'other-record';
}
