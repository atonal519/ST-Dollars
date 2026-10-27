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

/** Normalize only explicit floor-reference arrays; identity and prose stay untouched. */
function normalizeSourceSeqs(value:unknown):unknown {
  if(Array.isArray(value)){const next=value.map(normalizeSourceSeqs);return next.some((item,index)=>item!==value[index])?next:value;}
  if(!value||typeof value!=='object')return value;
  let changed=false;const next=Object.fromEntries(Object.entries(value).map(([key,item])=>{
    let normalized=normalizeSourceSeqs(item);
    if(key==='sourceSeqs'&&Array.isArray(item))normalized=item.map(seq=>typeof seq==='string'&&/^\d+$/.test(seq.trim())&&Number.isSafeInteger(Number(seq.trim()))?Number(seq.trim()):seq);
    if(Array.isArray(normalized)&&Array.isArray(item)&&normalized.every((seq,index)=>seq===item[index]))normalized=item;
    changed ||= normalized!==item;return[key,normalized];
  }));return changed?next:value;
}
/** Extract one balanced JSON value without changing punctuation inside quoted story text. */
export function extractJson(value: unknown): unknown {
  if (typeof value !== 'string') return normalizeSourceSeqs(value);
  const source = stripFence(value);
  const first = source.search(/[\[{]/);
  const candidate = first < 0 ? source : balancedAt(source, first);
  if (!candidate) throw new Error('模型返回内容无法解析为JSON。');
  try { return normalizeSourceSeqs(JSON.parse(candidate)); } catch { /* Try tolerant trailing-comma parsing. */ }
  try { return normalizeSourceSeqs(JSON.parse(removeTrailingCommas(candidate))); } catch { /* The outer value is malformed; do not accept an inner fragment. */ }
  throw new Error('模型返回内容无法解析为JSON。');
}
