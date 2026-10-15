import protocol from '../shared/protocol.json';
import { describeHealth } from './transport.logic.mjs';
import { getContext } from '@/st/context';

export const CLIENT_PROTOCOL = protocol.protocolVersion;
export class TransportError extends Error {
  constructor(public result: any, public httpStatus: number) { super(result.error || '请求失败'); }
}
async function request(path: string, body?: any, signal?: AbortSignal): Promise<any> {
  const res = await fetch('/api/plugins/dollars' + path, {
    method: body === undefined ? 'GET' : 'POST', signal,
    headers: { ...getContext()?.getRequestHeaders?.(), ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let result;
  try { result = await res.json(); }
  catch { throw new TransportError({ error: `服务器返回了无法读取的结果（HTTP ${res.status}）。请检查后端是否已更新。` }, res.status); }
  if (!res.ok || result?.ok === false) throw new TransportError(result, res.status);
  return result;
}
export async function fetchHealth(): Promise<any | null> { try { return await request('/health'); } catch { return null; } }
export function healthText(health: any | null): string { return describeHealth(CLIENT_PROTOCOL, health); }
export const getConfig = () => request('/config');
export const saveSecondary = (cfg: any) => request('/config/secondary', cfg);
export const savePrimary = (cfg: any) => request('/config/primary', cfg);
export const pingLlm = () => request('/llm/ping', {});
export const analyze = (payload: any) => request('/init/analyze', payload);
export const commitWorld = (payload: any) => request('/init/commit', payload);
export const getUniverse = (stChatId: string) => request('/universe?' + new URLSearchParams({ stChatId }));
export const getRoom = (scope: Record<string, string>) => request('/room?' + new URLSearchParams(scope));
export const sendPending = (payload: any) => request('/messages/pending', payload);
export const editPending = (payload: any) => request('/messages/pending/update', payload);
export const removePending = (payload: any) => request('/messages/pending/remove', payload);
export const runCycle = (payload: any) => request('/cycle/run', payload);
