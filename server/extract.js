const { callSecondary } = require('./llm.js');
const { extractJson } = require('./jsonutil.js');

function parseExtract(text) {
  const o = extractJson(text);
  if (o.skip === true) return { skip: true };
  if (!o.display_name || typeof o.display_name !== 'string') throw new Error('抽取缺 display_name，原文：' + String(text).slice(0, 160));
  return { display_name: o.display_name, aliases: Array.isArray(o.aliases) ? o.aliases : [], summary: o.summary || '' };
}
function buildExtractPrompt(entry, extras = []) {
  const extra = extras.length ? '\n\n该角色的补充条目：\n' + extras.map(e => e.content).join('\n---\n') : '';
  return [
    { role: 'system', content: '你从世界书条目中抽取一个角色的结构化信息。只有当条目确实是某个具名角色的设定档时才抽取；若无法确定明确的角色姓名（例如这其实是设定/规则/泛指），返回 {"skip":true}。严格只输出 JSON，不要解释、不要代码围栏。姓名要用角色的正式全名或最完整称呼，不要用「哥哥」这类称谓或占位词。' },
    { role: 'user', content: `角色条目：\n${entry.content}${extra}\n\n输出 JSON（能确定角色则用下面结构，否则 {"skip":true}）：{"display_name":"角色正式姓名","aliases":["别称/简称"],"summary":"一句话身份+性格"}` },
  ];
}
// 抽取带重试：救回超时/限流/偶发格式错的瞬时失败（最多 3 次尝试）
async function extractCharacter(cfg, entry, extras = []) {
  let lastErr;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const text = await callSecondary(cfg, buildExtractPrompt(entry, extras), { maxTokens: 1024, temperature: 0.2 });
      return parseExtract(text);
    } catch (e) { lastErr = e; }
  }
  throw lastErr;
}
module.exports = { parseExtract, buildExtractPrompt, extractCharacter };
