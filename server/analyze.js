const { classifyEntries } = require('./classify.js');
const { extractCharacter } = require('./extract.js');
const { mergeCharacters } = require('./merge.js');
const { assignTiers } = require('./tier.js');

// 四阶段：A 分类 → B 并发抽取(skip/重试) → C 合并归一 → D 按卡类型分层(main/npc)。不落库。
async function runAnalyze(cfg, { card, worldbook, cardType }) {
  const entries = Array.isArray(worldbook) ? worldbook : [];
  const byUid = new Map(entries.map(e => [String(e.uid), e]));
  const merged = await classifyEntries(cfg, entries);
  const extracted = await Promise.all(merged.characters.map(c => {
    const entry = byUid.get(String(c.uid));
    if (!entry) return Promise.resolve({ _error: '找不到条目', name: c.name });
    return extractCharacter(cfg, entry)
      .then(r => (r && r.skip ? { skip: true } : r))
      .catch(e => ({ _error: e.message, name: c.name }));
  }));
  const raw = extracted.filter(x => x && !x._error && !x.skip);
  const skipped = extracted.filter(x => x && x.skip).length;
  const failures = extracted.filter(x => x && x._error).map(x => ({ name: x.name || '?', error: String(x._error).slice(0, 100) }));
  const mergedChars = await mergeCharacters(cfg, raw);
  const characters = assignTiers(mergedChars, entries, cardType);
  const mains = characters.filter(c => c.tier === 'main').length;
  return {
    counts: {
      worldbook: entries.length,
      profile_candidates: merged.characters.length,
      extracted: raw.length,
      skipped,
      extract_failed: failures.length,
      characters: characters.length,
      main: mains,
      npc: characters.length - mains,
      others: merged.others,
    },
    characters,
    failures,
  };
}
module.exports = { runAnalyze };
