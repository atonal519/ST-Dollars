import type { SourceRef } from '../domain/world';

export function displaySourceLabel(source: SourceRef, scopeId = ''): string {
  if (source.kind === 'simulation') return source.label;
  if (source.kind !== 'chat') return source.label;
  const sequenceText = source.id.startsWith('history-floor:')
    ? source.id.slice('history-floor:'.length)
    : scopeId && source.id.startsWith(`${scopeId}:`) ? source.id.slice(`${scopeId}:`.length) : '';
  if (!/^[1-9]\d*$/.test(sequenceText)) return source.label;
  const sequence = Number(sequenceText);
  return Number.isSafeInteger(sequence) ? `第 ${sequence - 1} 楼正文` : source.label;
}
