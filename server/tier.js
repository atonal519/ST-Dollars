// 用「设定体量」（角色名/别名在世界书条目里命中的总字数）+「有无专属 NSFW 条目」判 tier。
// 体量为主信号（重要角色字数多）；NSFW 为边界修正（主角一般有 NSFW、NPC 没有）。

const NSFW_HINT = /nsfw|r-?18|18\s*\+|成人|情色|色情|涩|性爱|做爱|性行为|裸|阴茎|阴道|高潮|自慰|情欲/i;

function nameHits(character) {
  return [character.display_name, ...(character.aliases || [])].filter(n => n && String(n).length >= 2);
}

function computeVolume(character, worldbook) {
  const names = nameHits(character);
  if (!names.length) return 0;
  let vol = 0;
  for (const e of worldbook) {
    const hay = (e.comment || '') + '\n' + (e.content || '');
    if (names.some(n => hay.includes(n))) vol += (e.content || '').length;
  }
  return vol;
}

// 只认「专属 NSFW 条目」：条目标题(comment)同时含 NSFW 标记 + 该角色名（如 NSFW-亚历克斯）。
// 不看 content——避免角色名被写进别人的 NSFW 条目而误判（交叉提及 bug）。
function hasNsfw(character, worldbook) {
  const names = nameHits(character);
  if (!names.length) return false;
  for (const e of worldbook) {
    const comment = e.comment || '';
    if (NSFW_HINT.test(comment) && names.some(n => comment.includes(n))) return true;
  }
  return false;
}

// 卡里有人带专属 NSFW（单人/多人卡）→ 有 NSFW=主，无则除非体量极高否则 NPC；
// 全卡无 NSFW（大世界/模拟器）→ 纯体量相对阈值。
function assignTiers(characters, worldbook) {
  const withMeta = characters.map(c => ({ ...c, volume: computeVolume(c, worldbook), nsfw: hasNsfw(c, worldbook) }));
  const max = withMeta.reduce((m, c) => Math.max(m, c.volume), 0);
  const anyNsfw = withMeta.some(c => c.nsfw);
  return withMeta.map(c => {
    let tier;
    if (anyNsfw) tier = (c.nsfw || c.volume >= max * 0.8) ? 'main' : 'npc';
    else tier = c.volume >= Math.max(1, max * 0.35) ? 'main' : 'npc';
    return { ...c, tier };
  });
}

module.exports = { computeVolume, hasNsfw, assignTiers };
