import { getContext } from '@/st/context';

export function currentChatId(): string {
  const ctx: any = getContext();
  return ctx?.chatId ?? ctx?.getCurrentChatId?.() ?? '';
}

export function saveUniverseBinding(universeId: string) {
  const ctx: any = getContext();
  if (!ctx) return;
  ctx.chatMetadata = ctx.chatMetadata || {};
  ctx.chatMetadata['dollars'] = { universe_id: universeId, schema_version: 1 };
  ctx.saveMetadata?.();
}

export function readUniverseBinding(): { universe_id: string } | null {
  const ctx: any = getContext();
  return ctx?.chatMetadata?.['dollars'] ?? null;
}
