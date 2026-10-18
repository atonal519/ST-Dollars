export interface QQJPersonIdentity {
  qqjChatId: string;
  entityId: string;
}

export function encodeQQJPersonId(qqjChatId: string, entityId: string): string {
  return `qqj:${JSON.stringify([qqjChatId, entityId])}`;
}

export function decodeQQJPersonId(value: string): QQJPersonIdentity | null {
  if (!value.startsWith('qqj:')) return null;
  try {
    const identity: unknown = JSON.parse(value.slice(4));
    if (!Array.isArray(identity) || identity.length !== 2
      || typeof identity[0] !== 'string' || !identity[0].trim()
      || typeof identity[1] !== 'string' || !identity[1].trim()) return null;
    return { qqjChatId: identity[0], entityId: identity[1] };
  } catch {
    return null;
  }
}
