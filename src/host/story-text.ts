import {getHostContext} from './host-context';
import {getSharedBodyWrappers,sanitizeStoryBody} from './shared-body-wrappers.js';
const draftToken = /\[\/?DRAFT\]/gi;
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

/** Shared wrapper rules clean the narrative copy; the original story clock remains a separate reference. */
export function cleanAssistantStoryText(input: string): { text: string; hasNarrative: boolean } {
  const source = removeCompleteDrafts(input);
  const shared=getSharedBodyWrappers(getHostContext()?.extensionSettings??{});
  const body=sanitizeStoryBody(source,shared);
  const content=[...source.matchAll(/<\s*\/?\s*content\s*>/gi)];
  const singleContent=content.length===2&&!content[0][0].startsWith('</')&&content[1][0].startsWith('</');
  const clockFields=[...(singleContent?source.slice(0,content[0].index):source).matchAll(clockField)];
  const clocks=[...clockFields,...source.matchAll(clockComment)].sort((left,right)=>(left.index??0)-(right.index??0)).map(match=>match[0]);
  const narrative=hasNarrative(body);
  return {text:narrative?(clocks.length?`故事时间参考：${clocks.join(' ')}\n\n${body}`:body):source,hasNarrative:narrative};
}
