import type { StoryTurn } from '../application/contracts';

export interface HistoryRange { fromSeq: number; toSeq: number }
export const HISTORY_BATCH_CHARACTERS = 12000;

export function subtractRanges(fromSeq: number, toSeq: number, covered: HistoryRange[] = []): HistoryRange[] {
  let remaining: HistoryRange[] = [{ fromSeq, toSeq }];
  for (const range of [...covered].sort((a, b) => a.fromSeq - b.fromSeq)) {
    remaining = remaining.flatMap(part => {
      if (range.toSeq < part.fromSeq || range.fromSeq > part.toSeq) return [part];
      const result: HistoryRange[] = [];
      if (range.fromSeq > part.fromSeq) result.push({ fromSeq: part.fromSeq, toSeq: range.fromSeq - 1 });
      if (range.toSeq < part.toSeq) result.push({ fromSeq: range.toSeq + 1, toSeq: part.toSeq });
      return result;
    });
  }
  return remaining;
}

function safeEnd(value: string, start: number, max: number): number {
  let end = start; let count = 0;
  while (end < value.length && count < max) { const code = value.codePointAt(end)!; end += code > 0xffff ? 2 : 1; count++; }
  return end;
}
export function characterCount(value: string): number { let count = 0; for (const _character of value) count++; return count; }

export function buildBatches(turns: StoryTurn[], maxCharacters = HISTORY_BATCH_CHARACTERS): StoryTurn[][] {
  const batches: StoryTurn[][] = []; let current: StoryTurn[] = []; let size = 0;
  const flush = () => { if (current.length) batches.push(current); current = []; size = 0; };
  for (const turn of turns) {
    if (!turn.text) continue;
    let offset = 0;
    while (offset < turn.text.length) {
      if (size === maxCharacters) flush();
      const end = safeEnd(turn.text, offset, maxCharacters - size);
      const piece = turn.text.slice(offset, end);
      current.push({ ...turn, text: piece }); size += characterCount(piece); offset = end;
      if (size === maxCharacters) flush();
    }
  }
  flush(); return batches;
}

export function mergeRanges(ranges: HistoryRange[]): HistoryRange[] {
  const sorted = [...ranges].sort((a, b) => a.fromSeq - b.fromSeq); const result: HistoryRange[] = [];
  for (const range of sorted) {
    const last = result[result.length - 1];
    if (last && range.fromSeq <= last.toSeq + 1) last.toSeq = Math.max(last.toSeq, range.toSeq);
    else result.push({ ...range });
  }
  return result;
}
