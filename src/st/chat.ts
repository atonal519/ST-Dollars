import { getContext } from '@/st/context';

export function currentChatId(): string {
  const ctx: any = getContext();
  return String(ctx?.chatId ?? ctx?.getCurrentChatId?.() ?? '');
}

export function currentChatScope() {
  const ctx = getContext();
  const id = currentChatId();
  const locator = ctx?.groupId ?? ctx?.characters?.[ctx.characterId]?.avatar ?? ctx?.characterId ?? '';
  return { id, key: JSON.stringify([locator, id]) };
}

export async function saveUniverseBinding(universeId: string, expectedKey = currentChatScope().key) {
  if (currentChatScope().key !== expectedKey) return;
  const ctx: any = getContext();
  if (!ctx) return;
  ctx.chatMetadata = ctx.chatMetadata || {};
  ctx.chatMetadata['dollars'] = { universe_id: universeId, schema_version: 1 };
  await ctx.saveMetadata?.();
}

export function readUniverseBinding(): { universe_id: string } | null {
  const ctx: any = getContext();
  return ctx?.chatMetadata?.['dollars'] ?? null;
}
