import protocol from '../shared/protocol.json';
import { describeHealth } from './transport.logic.mjs';
import { getContext } from '@/st/context';

export const CLIENT_PROTOCOL = protocol.protocolVersion as number;

// 拉后端 /health（GET，免 CSRF；带上 ST 的请求头以防未来需要鉴权）
export async function fetchHealth(): Promise<any | null> {
  try {
    const headers = getContext()?.getRequestHeaders?.() ?? {};
    const res = await fetch('/api/plugins/dollars/health', { headers });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export function healthText(health: any | null): string {
  return describeHealth(CLIENT_PROTOCOL, health);
}
