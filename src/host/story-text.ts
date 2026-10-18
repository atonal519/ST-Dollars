const draftToken = /\[\/?DRAFT\]/gi;
const contentToken = /<\s*\/?\s*content\s*>/gi;
const clockComment = /<!--\s*(?:QQJ|SDC|myknots)-(?:start|end)\b[\s\S]*?-->/gi;
const clockField = /<(date|time|weekday)>([\s\S]*?)<\/\1\s*>/gi;

function removeCompleteDrafts(value: string): string {
  const stack: number[] = [];
  const ranges: Array<[number, number]> = [];
  for (const match of value.matchAll(draftToken)) {
    const start = match.index ?? 0;
    if (match[0][1] === '/') {
      const opening = stack.pop();
      if (opening !== undefined) ranges.push([opening, start + match[0].length]);
    } else stack.push(start);
  }
  if (!ranges.length) return value;
  ranges.sort((a, b) => a[0] - b[0]);
  let result = ''; let cursor = 0;
  for (const [start, end] of ranges) {
    if (start > cursor) result += value.slice(cursor, start);
    if (end > cursor) cursor = end;
  }
  return result + value.slice(cursor);
}

function hasNarrative(value: string): boolean {
  let remaining = value.replace(clockComment, '').replace(clockField, '');
  let withoutEmptyWrappers = '';
  while (remaining !== withoutEmptyWrappers) {
    withoutEmptyWrappers = remaining;
    remaining = remaining.replace(/<([a-z][\w:.-]*)\b[^>]*>\s*<\/\1\s*>/gi, '');
  }
  return remaining.trim().length > 0;
}

/**
 * Removes only complete named DRAFT pairs, using the nested-pair behavior
 * established by SevenDaysCal's tag sanitizer. Dollars owns this story input;
 * unknown wrappers and unpaired draft markers remain ordinary source text.
 */
export function cleanAssistantStoryText(input: string): { text: string; hasNarrative: boolean } {
  const source = removeCompleteDrafts(input);
  const contentMatches = [...source.matchAll(contentToken)];
  const open = contentMatches[0]; const close = contentMatches[1];
  const isSingleContent = contentMatches.length === 2 && open && close
    && !open[0].startsWith('</') && close[0].startsWith('</')
    && (open.index ?? 0) < (close.index ?? 0);
  if (!isSingleContent) return { text: source, hasNarrative: hasNarrative(source) };

  const contentStart = (open.index ?? 0) + open[0].length;
  const contentEnd = close.index ?? source.length;
  // Match the reader's existing trim behavior at the wrapper boundary while
  // preserving every character inside the formal body after DRAFT removal.
  const body = source.slice(contentStart, contentEnd).trim();
  const references: Array<{ index: number; text: string }> = [];
  const prefix = source.slice(0, open.index ?? 0);
  for (const match of prefix.matchAll(clockField)) {
    references.push({ index: match.index ?? 0, text: match[0] });
  }
  for (const match of source.matchAll(clockComment)) {
    const index = match.index ?? 0;
    const end = index + match[0].length;
    if (index >= (open.index ?? 0) && end <= contentEnd + close[0].length) continue;
    references.push({ index, text: match[0] });
  }
  references.sort((a, b) => a.index - b.index);
  const clock = references.length ? `故事时间参考：${references.map(item => item.text).join(' ')}` : '';
  const text = clock ? `${clock}\n\n${body}` : body;
  return { text, hasNarrative: hasNarrative(body) };
}
