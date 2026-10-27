// World-book catalog copied from QQJ world-info-scanner; listing reads names only.
const LIMITS = Object.freeze({ books: 500, entries: 5000, contentCharacters: 40000 });
const SCOPE_ORDER = Object.freeze(['char', 'chat', 'persona', 'global']);

function text(value) { return typeof value === 'string' ? value.trim() : ''; }
function currentCharacter(ctx) { return Array.isArray(ctx?.characters) ? ctx.characters[ctx.characterId] : ctx?.characters?.[ctx.characterId]; }
function uniqueNames(values, { complete = false } = {}) {
  const names = [...new Set(values.map(text).filter(Boolean))];
  return complete ? names : names.slice(0, LIMITS.books);
}
function safeValue(callback, fallback = null) { try { return callback() ?? fallback; } catch { return fallback; } }

function characterFilename(ctx, character) {
  const hostName = safeValue(() => ctx?.getCharaFilename?.(ctx.characterId), '');
  if (text(hostName)) return text(hostName);
  return text(character?.avatar ?? character?.data?.avatar).replace(/\.[^.]+$/u, '');
}

function linkedWorldNames(ctx, bindings = {}, options = {}) {
  const names = [];
  const helperBooks = safeValue(() => bindings.getCharLorebooks?.(), null)
    ?? safeValue(() => globalThis.TavernHelper?.getCharLorebooks?.(), null);
  if (helperBooks?.primary) names.push(helperBooks.primary);
  if (Array.isArray(helperBooks?.additional)) names.push(...helperBooks.additional);
  const character = currentCharacter(ctx) ?? {};
  names.push(character.data?.extensions?.world, character.extensions?.world);
  const filename = characterFilename(ctx, character);
  const auxiliary = safeValue(() => ctx?.getCharaAuxWorlds?.(filename), null);
  if (Array.isArray(auxiliary)) names.push(...auxiliary);
  else {
    const settings = safeValue(() => bindings.getWorldInfoSettings?.(), null);
    const extra = settings?.charLore?.find?.(entry => text(entry?.name) === filename)?.extraBooks;
    if (Array.isArray(extra)) names.push(...extra);
  }
  return uniqueNames(names, options);
}

function chatWorldNames(ctx, options = {}) {
  const fromApi = safeValue(() => ctx?.chatWorldInfo?.getNames?.(), null);
  const raw = Array.isArray(fromApi) ? fromApi : ctx?.chatMetadata?.world_info;
  return uniqueNames(Array.isArray(raw) ? raw : [raw], options);
}

function globalWorldNames(ctx, bindings = {}, options = {}) {
  const helperNames = safeValue(() => bindings.getGlobalWorldInfoSelection?.(), null)
    ?? safeValue(() => globalThis.TavernHelper?.getLorebookSettings?.()?.selected_global_lorebooks, null);
  if (Array.isArray(helperNames)) return uniqueNames(helperNames, options);
  if (Array.isArray(ctx?.chatWorldInfo?.globalSelection)) return uniqueNames(ctx.chatWorldInfo.globalSelection, options);
  const moduleNames = safeValue(() => bindings.getSelectedWorldInfo?.(), null);
  return Array.isArray(moduleNames) ? uniqueNames(moduleNames, options) : [];
}

async function allWorldNames(ctx, bindings, known, options = {}) {
  const fallback = [...known];
  const moduleNames = safeValue(() => bindings.getWorldInfoNames?.(), null);
  if (Array.isArray(moduleNames) && moduleNames.length) return uniqueNames([...fallback, ...moduleNames], options);
  const cached = safeValue(() => ctx?.getWorldInfoNames?.(), null);
  if (Array.isArray(cached) && cached.length) return uniqueNames([...fallback, ...cached], options);
  const helper = globalThis.TavernHelper;
  try {
    const fn = helper?.getWorldbookNames ?? helper?.getLorebooks;
    const names = typeof fn === 'function' ? await fn.call(helper) : null;
    if (Array.isArray(names) && names.length) return uniqueNames([...fallback, ...names], options);
  } catch { /* 助手目录读取失败仍继续尝试宿主目录。 */ }
  if (typeof ctx?.updateWorldInfoList === 'function') {
    try {
      await ctx.updateWorldInfoList();
      const refreshed = ctx?.getWorldInfoNames?.();
      if (Array.isArray(refreshed) && refreshed.length) return uniqueNames([...fallback, ...refreshed], options);
    } catch { /* an unavailable catalog does not change linked-source reads */ }
  }
  return uniqueNames(fallback, options);
}

export function scopedWorldNames(ctx, bindings = {}, options = {}) {
  return new Map([
    ['char', linkedWorldNames(ctx, bindings, options)],
    ['chat', chatWorldNames(ctx, options)],
    ['persona', uniqueNames([ctx?.powerUserSettings?.persona_description_lorebook], options)],
    ['global', globalWorldNames(ctx, bindings, options)],
  ]);
}

export async function listWorldInfoBookNames(ctx, { bindings = {} } = {}) {
  if (!ctx || typeof ctx !== 'object') throw new TypeError('世界书扫描上下文无效');
  const scopedNames = scopedWorldNames(ctx, bindings);
  const embedded = currentCharacter(ctx)?.data?.character_book;
  const embeddedBook = text(embedded?.name) || '角色内置世界书';
  const embeddedRows = Array.isArray(embedded?.entries) ? embedded.entries : [];
  return Object.freeze(await allWorldNames(ctx, bindings, [
    ...[...scopedNames.values()].flat(),
    ...(embeddedRows.length ? [embeddedBook] : []),
  ]));
}

