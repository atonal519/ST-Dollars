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

const headers = () => getContext()?.getRequestHeaders?.() ?? {};

export async function getConfig(): Promise<any> {
  const res = await fetch('/api/plugins/dollars/config', { headers: headers() });
  return res.ok ? res.json() : null;
}

export async function saveSecondary(cfg: { url: string; model: string; key: string }): Promise<any> {
  const res = await fetch('/api/plugins/dollars/config/secondary', {
    method: 'POST',
    headers: { ...headers(), 'Content-Type': 'application/json' },
    body: JSON.stringify(cfg),
  });
  if (!res.ok) throw new Error('保存失败 ' + res.status);
  return res.json();
}

export async function pingLlm(): Promise<any> {
  const res = await fetch('/api/plugins/dollars/llm/ping', { method: 'POST', headers: headers() });
  const text = await res.text();
  try { return JSON.parse(text); }
  catch { return { ok: false, error: `HTTP ${res.status}: ${text.slice(0, 120) || '(空响应)'}` }; }
}

export async function analyze(payload: any): Promise<any> {
  const res = await fetch('/api/plugins/dollars/init/analyze', {
    method: 'POST',
    headers: { ...headers(), 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const text = await res.text();
  try { return JSON.parse(text); }
  catch { return { ok: false, error: `HTTP ${res.status}: ${text.slice(0, 160)}` }; }
}

export async function commitWorld(payload: any): Promise<any> {
  const res = await fetch('/api/plugins/dollars/init/commit', {
    method: 'POST',
    headers: { ...headers(), 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const t = await res.text();
  try { return JSON.parse(t); } catch { return { ok: false, error: `HTTP ${res.status}: ${t.slice(0, 160)}` }; }
}

export async function getUniverse(stChatId: string): Promise<any> {
  const res = await fetch('/api/plugins/dollars/universe?stChatId=' + encodeURIComponent(stChatId), { headers: headers() });
  return res.ok ? res.json() : null;
}
