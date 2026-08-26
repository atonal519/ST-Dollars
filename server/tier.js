// 用「设定体量」+「专属 NSFW 条目」判 tier，但最终由「用户选的卡类型」决定策略。
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
function hasNsfw(character, worldbook) {
  const names = nameHits(character);
  if (!names.length) return false;
  for (const e of worldbook) {
    const comment = e.comment || '';
    if (NSFW_HINT.test(comment) && names.some(n => comment.includes(n))) return true;
  }
  return false;
}

// cardType 决定策略：
// - bigworld / single → 识别出的全部 main（大家都重要 / 单人主角）
// - multi（默认）→ 体量 + 专属 NSFW：有 NSFW 或体量极高=main，否则 npc
function assignTiers(characters, worldbook, cardType = 'multi') {
  const withMeta = characters.map(c => ({ ...c, volume: computeVolume(c, worldbook), nsfw: hasNsfw(c, worldbook) }));
  if (cardType === 'bigworld' || cardType === 'single') {
    return withMeta.map(c => ({ ...c, tier: 'main' }));
  }
  const max = withMeta.reduce((m, c) => Math.max(m, c.volume), 0);
  const anyNsfw = withMeta.some(c => c.nsfw);
  return withMeta.map(c => {
    const tier = anyNsfw
      ? ((c.nsfw || c.volume >= max * 0.8) ? 'main' : 'npc')
      : (c.volume >= Math.max(1, max * 0.35) ? 'main' : 'npc');
    return { ...c, tier };
  });
}

module.exports = { computeVolume, hasNsfw, assignTiers };
