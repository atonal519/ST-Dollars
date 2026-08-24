const { callSecondary } = require('./llm.js');
const { extractJson } = require('./jsonutil.js');

function batchEntries(entries, size = 8) {
  const out = [];
  for (let i = 0; i < entries.length; i += size) out.push(entries.slice(i, i + size));
  return out;
}
function parseClassify(text) {
  const obj = extractJson(text);
  const items = Array.isArray(obj) ? obj
    : (Array.isArray(obj.items) ? obj.items : (Array.isArray(obj.result) ? obj.result : null));
  if (!items) throw new Error('分类响应缺少 items，原文：' + String(text).slice(0, 200));
  return items;
}
function buildClassifyPrompt(batch) {
  const list = batch.map(e => `- uid=${e.uid} comment=${JSON.stringify(e.comment)} 内容前160字=${JSON.stringify((e.content || '').slice(0, 160))}`).join('\n');
  return [
    { role: 'system', content: '你是世界书条目分类器，任务是找出「拥有专属人物设定档的主要角色」。严格只输出 JSON，不要解释、不要代码围栏。\ntype 取值：\n- character_profile：围绕单个角色的完整设定档（含姓名/外貌/性格/身份等，标题常形如「角色_某某」或含 <Character_某某>）\n- character_supplement：某个已有角色的补充（如 NSFW、单独的关系/癖好），附属主角色而非新角色\n- setting：世界观/势力/地理等设定\n- rule：系统规则/指令/输出格式\n- lore：背景传说/事件\n- other：其它（含仅在剧情里被顺带提到、没有专属设定档的路人）\n只有 character_profile 算主要角色；仅被提及的人名不要标 character_profile。' },
    { role: 'user', content: `条目：\n${list}\n\n输出 JSON（name 填该条目涉及的角色名、无则空字符串）：{"items":[{"uid":"<uid>","type":"character_profile|character_supplement|setting|rule|lore|other","name":"","confidence":0}]}` },
  ];
}
function mergeClassified(results) {
  const chMap = new Map(); let others = 0;
  for (const items of results) for (const it of items) {
    if (it.type === 'character_profile') { if (!chMap.has(it.uid)) chMap.set(it.uid, { uid: it.uid, name: it.name || '' }); }
    else others++;
  }
  return { characters: [...chMap.values()], others };
}
async function classifyEntries(cfg, entries) {
  const batches = batchEntries(entries);
  const results = [];
  for (const b of batches) {
    let lastErr;
    for (let attempt = 0; attempt < 3; attempt++) {   // 每批带重试，防 LLM 偶发坏格式
      try {
        const text = await callSecondary(cfg, buildClassifyPrompt(b), { maxTokens: 4096, temperature: 0 });
        results.push(parseClassify(text));
        lastErr = null;
        break;
      } catch (e) { lastErr = e; }
    }
    if (lastErr) throw lastErr;
  }
  return mergeClassified(results);
}
module.exports = { batchEntries, buildClassifyPrompt, parseClassify, mergeClassified, classifyEntries };
