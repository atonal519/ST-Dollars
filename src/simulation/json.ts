function stripFence(source: string): string {
  const match = source.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return (match ? match[1] : source).trim();
}

function balancedAt(source: string, start: number): string | null {
  const stack: string[] = []; let inString = false; let escaped = false;
  for (let index = start; index < source.length; index++) {
    const char = source[index];
    if (inString) { if (escaped) escaped = false; else if (char === '\\') escaped = true; else if (char === '"') inString = false; continue; }
    if (char === '"') inString = true;
    else if (char === '{' || char === '[') stack.push(char === '{' ? '}' : ']');
    else if (char === '}' || char === ']') { if (stack.pop() !== char) return null; if (!stack.length) return source.slice(start, index + 1); }
  }
  return null;
}

function removeTrailingCommas(source: string): string {
  let output = ''; let inString = false; let escaped = false;
  for (let index = 0; index < source.length; index++) {
    const char = source[index];
    if (inString) { output += char; if (escaped) escaped = false; else if (char === '\\') escaped = true; else if (char === '"') inString = false; continue; }
    if (char === '"') { inString = true; output += char; }
    else if (char === ',') { let next = index + 1; while (/\s/.test(source[next] || '') && next < source.length) next++; if (source[next] !== '}' && source[next] !== ']') output += char; }
    else output += char;
  }
  return output;
}

/** Extract one balanced JSON value without changing punctuation inside quoted story text. */
export function extractJson(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  const source = stripFence(value);
  const candidates = [source, ...Array.from(source.matchAll(/[\[{]/g), match => balancedAt(source, match.index!)).filter((item): item is string => Boolean(item))];
  for (const candidate of candidates) {
    try { return JSON.parse(candidate); } catch { /* Try tolerant trailing-comma parsing. */ }
    try { return JSON.parse(removeTrailingCommas(candidate)); } catch { /* Try a later balanced object. */ }
  }
  throw new Error('模型返回内容无法解析为JSON。');
}
