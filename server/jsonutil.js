// 从 LLM 文本中解析 JSON：支持代码围栏、前后说明、多个括号片段及尾逗号容错。
function stripFence(s) {
  const m = String(s || '').match(/```(?:json)?\s*([\s\S]*?)```/i);
  return (m ? m[1] : s).trim();
}
function extractBalancedAt(s, start) {
  const stack = [];
  let inStr = false, esc = false;
  for (let i = start; i < s.length; i++) {
    const ch = s[i];
    if (inStr) { if (esc) esc = false; else if (ch === '\\') esc = true; else if (ch === '"') inStr = false; continue; }
    if (ch === '"') inStr = true;
    else if (ch === '{' || ch === '[') stack.push(ch === '{' ? '}' : ']');
    else if (ch === '}' || ch === ']') {
      if (stack.pop() !== ch) return null;
      if (!stack.length) return s.slice(start, i + 1);
    }
  }
  return null;
}
function extractBalanced(s) {
  const start = s.search(/[\[{]/);
  return start < 0 ? null : extractBalancedAt(s, start);
}
function removeTrailingCommas(s) {
  // 只删字符串外、紧邻容器结束符的逗号，避免改写台词正文。
  let out = '', inStr = false, esc = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (inStr) {
      out += ch;
      if (esc) esc = false;
      else if (ch === '\\') esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') { inStr = true; out += ch; }
    else if (ch === ',') {
      let next = i + 1;
      while (/\s/.test(s[next] || '') && next < s.length) next++;
      if (s[next] !== '}' && s[next] !== ']') out += ch;
    } else out += ch;
  }
  return out;
}
function extractJson(text) {
  if (!text) throw new Error('空响应');
  const s = stripFence(text);
  for (const candidate of [s, ...Array.from(s.matchAll(/[\[{]/g), m => extractBalancedAt(s, m.index)).filter(Boolean)]) {
    try { return JSON.parse(candidate); } catch { /* 尝试仅对 JSON 外的尾逗号做容错 */ }
    try { return JSON.parse(removeTrailingCommas(candidate)); } catch { /* 尝试后续括号片段 */ }
  }
  throw new Error('无法解析 JSON：' + s.slice(0, 300));
}
module.exports = { extractJson, extractBalanced, stripFence };
