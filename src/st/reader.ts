import { getContext } from '@/st/context';

function normalize(e: any) {
  return {
    uid: e.uid ?? e.id ?? null,
    comment: e.comment ?? '',
    keys: e.key ?? e.keys ?? [],
    content: e.content ?? '',
    constant: !!e.constant,
    position: e.position ?? null,
  };
}

// 读当前卡字段 + 世界书条目（内嵌 character_book + 绑定 extensions.world），按 comment+content 去重
export async function readSource(): Promise<{ card: any; worldbook: any[] }> {
  const ctx = getContext();
  if (!ctx) throw new Error('SillyTavern 上下文不可用');
  const card = ctx.characters?.[ctx.characterId];
  const d = card?.data ?? card ?? {};
  const cardFields = {
    name: d.name ?? '', description: d.description ?? '', personality: d.personality ?? '',
    scenario: d.scenario ?? '', first_mes: d.first_mes ?? '', mes_example: d.mes_example ?? '',
  };
  const entries: any[] = [];
  if (d.character_book?.entries) entries.push(...d.character_book.entries);
  const worldName = d.extensions?.world;
  if (worldName && ctx.loadWorldInfo) {
    const wb = await ctx.loadWorldInfo(worldName);
    if (wb?.entries) entries.push(...Object.values(wb.entries));
  }
  const seen = new Set<string>();
  const worldbook = entries.map(normalize).filter((e) => {
    const k = e.comment + ' ' + e.content;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  return { card: cardFields, worldbook };
}
