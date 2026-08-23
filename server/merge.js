const { callSecondary } = require('./llm.js');
const { extractJson } = require('./jsonutil.js');

function parseMerge(text) {
  const o = extractJson(text);
  if (!Array.isArray(o.characters)) throw new Error('合并缺 characters，原文：' + String(text).slice(0, 160));
  return o.characters
    .map(c => ({ display_name: c.display_name, aliases: Array.isArray(c.aliases) ? c.aliases : [], summary: c.summary || '' }))
    .filter(c => c.display_name && typeof c.display_name === 'string');
}
function buildMergePrompt(characters) {
  const list = characters.map((c, i) => `${i}. ${c.display_name}（别称：${(c.aliases || []).join('/')}）— ${c.summary || ''}`).join('\n');
  return [
    { role: 'system', content: '下面是从同一部作品抽取的角色列表，可能有重复：同一个人被全名和简称分开列（如「伊泽尔·洛兰德」和「伊泽尔」），或同一角色的不同设定条目各列一次。请把指向同一个人的合并成一个：正式全名作 display_name，其余称呼并入 aliases。严格只输出 JSON，不要解释、不要代码围栏。' },
    { role: 'user', content: `角色列表：\n${list}\n\n只输出 JSON：{"characters":[{"display_name":"正式全名","aliases":["简称/别称"],"summary":"一句话"}]}` },
  ];
}
async function mergeCharacters(cfg, characters) {
  if (characters.length <= 1) return characters;
  const text = await callSecondary(cfg, buildMergePrompt(characters), { maxTokens: 2048, temperature: 0 });
  return parseMerge(text);
}
module.exports = { parseMerge, buildMergePrompt, mergeCharacters };
