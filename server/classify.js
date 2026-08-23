const { callSecondary } = require('./llm.js');

function batchEntries(entries, size = 12) {
  const out = [];
  for (let i = 0; i < entries.length; i += size) out.push(entries.slice(i, i + size));
  return out;
}
function stripFence(s) {
  const m = String(s || '').match(/```(?:json)?\s*([\s\S]*?)```/i);
  return (m ? m[1] : s).trim();
}
function parseClassify(text) {
  const obj = JSON.parse(stripFence(text));
  if (!Array.isArray(obj.items)) throw new Error('分类响应缺少 items');
  return obj.items;
}
function buildClassifyPrompt(batch) {
  const list = batch.map(e => `- uid=${e.uid} comment=${JSON.stringify(e.comment)} 内容前120字=${JSON.stringify((e.content || '').slice(0, 120))}`).join('\n');
  return [
    { role: 'system', content: '你是世界书条目分类器。判断每个条目属于哪类，严格只输出 JSON，不要解释、不要代码围栏。type 取值：character(角色定义) / setting(世界设定) / rule(规则或系统指令) / lore(背景传说) / other。若是角色，给 candidate_name（角色名）。' },
    { role: 'user', content: `条目：\n${list}\n\n只输出 JSON：{"items":[{"uid":"...","type":"character|setting|rule|lore|other","candidate_name":"角色名或空","confidence":0~1}]}` },
  ];
}
function mergeClassified(results) {
  const chMap = new Map(); let others = 0;
  for (const items of results) for (const it of items) {
    if (it.type === 'character') { if (!chMap.has(it.uid)) chMap.set(it.uid, { uid: it.uid, candidate_name: it.candidate_name || '' }); }
    else others++;
  }
  return { characters: [...chMap.values()], others };
}
async function classifyEntries(cfg, entries) {
  const batches = batchEntries(entries);
  const results = [];
  for (const b of batches) {   // 顺序分批（质量优先/避免限流）
    const text = await callSecondary(cfg, buildClassifyPrompt(b), { maxTokens: 2048, temperature: 0 });
    results.push(parseClassify(text));
  }
  return mergeClassified(results);
}
module.exports = { batchEntries, buildClassifyPrompt, parseClassify, mergeClassified, classifyEntries };
