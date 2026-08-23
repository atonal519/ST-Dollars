// 从 LLM 文本响应里稳健地抠出 JSON：去代码围栏 → 直接 parse → 抠第一个平衡的 {}/[]
function stripFence(s) {
  const m = String(s || '').match(/```(?:json)?\s*([\s\S]*?)```/i);
  return (m ? m[1] : s).trim();
}
function extractBalanced(s) {
  const start = s.search(/[{[]/);
  if (start < 0) return null;
  const open = s[start], close = open === '{' ? '}' : ']';
  let depth = 0, inStr = false, esc = false;
  for (let i = start; i < s.length; i++) {
    const ch = s[i];
    if (inStr) { if (esc) esc = false; else if (ch === '\\') esc = true; else if (ch === '"') inStr = false; continue; }
    if (ch === '"') inStr = true;
    else if (ch === open) depth++;
    else if (ch === close) { depth--; if (depth === 0) return s.slice(start, i + 1); }
  }
  return null;
}
function extractJson(text) {
  if (!text) throw new Error('空响应');
  const s = stripFence(text);
  try { return JSON.parse(s); } catch { /* 继续 */ }
  const ext = extractBalanced(s);
  if (ext) { try { return JSON.parse(ext); } catch { /* 落到报错 */ } }
  throw new Error('无法解析 JSON');
}
module.exports = { extractJson, extractBalanced, stripFence };
