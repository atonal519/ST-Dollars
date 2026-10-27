import type { ModelProfile, ModelRequester } from '../application/contracts';
import { getHostContext } from '../host/host-context';
import { getSharedProcessingPrompt, prependProcessingPrompt, resolveSharedProcessingPrompt } from '../host/shared-processing-prompt.js';
import { jsonRequestHeaders } from '../host/request-headers';
import { createPersonCodes, decodeModelResponse, encodePersonReferences } from './person-references';
import {recordDiagnostic,protectDiagnostic,diagnosticError,type DiagnosticTrace} from '../diagnostics/development';

export class ModelError extends Error {
  constructor(message: string, readonly httpStatus: number | undefined, readonly code: string) { super(message); this.name = 'ModelError'; }
}
const serviceFailure = (status: number) => `模型服务暂时出错（HTTP ${status}），请稍后再试。`;
export function normalizeApiUrl(value: string): string {
  const url = String(value || '').trim().replace(/\/+$/, '');
  if (!url) return '';
  if (/\/chat\/completions$/i.test(url)) return url.replace(/\/chat\/completions$/i, '');
  if (/^https?:\/\/[^/?#]+$/i.test(url)) return `${url}/v1`;
  return url;
}

export function createModelClient({ fetchImpl = (...args: Parameters<typeof fetch>) => fetch(...args), getHeaders = () => getHostContext()?.getRequestHeaders?.() ?? {}, getProcessingPrompt = () => getSharedProcessingPrompt(getHostContext()?.extensionSettings) }: { fetchImpl?: typeof fetch; getHeaders?: () => HeadersInit; getProcessingPrompt?: () => string } = {}) {
  return {
    async generate(profile: ModelProfile, messages: { role: string; content: string }[], maxTokens: number, signal?: AbortSignal, onStarted?: () => void, diagnostic?:DiagnosticTrace): Promise<string> {
      protectDiagnostic(diagnostic,[profile.key,profile.url]);
      if (!profile.url || !profile.model || !profile.key) throw new ModelError('请先完整配置百面相模型 API。', undefined, 'api_not_configured');
      signal?.throwIfAborted();
      const prefix = resolveSharedProcessingPrompt(getProcessingPrompt());
      const systemIndex = messages.findIndex(message => message.role === 'system');
      messages = systemIndex >= 0 ? messages.map((message, index) => index === systemIndex ? { ...message, content: prependProcessingPrompt(message.content, prefix) } : message) : prefix.trim() ? [{ role: 'system', content: prefix }, ...messages] : messages;
      onStarted?.();
      recordDiagnostic(diagnostic,'model-dispatched',{model:profile.model,maxTokens});
      let response: Response;
      let raw: string;
      try {
        response = await fetchImpl('/api/backends/chat-completions/generate', { method: 'POST', headers: jsonRequestHeaders(getHeaders()), ...(signal ? { signal } : {}), body: JSON.stringify({ chat_completion_source: 'openai', reverse_proxy: normalizeApiUrl(profile.url), proxy_password: profile.key, model: profile.model, messages, stream: false, max_tokens: maxTokens }) });
        raw = await response.text();
        recordDiagnostic(diagnostic,'model-response',()=>({httpStatus:response.status,jobId:response.headers?.get?.('x-luker-generation-id'),responseCharacters:raw.length,rawResponse:raw}));
      } catch (error) { recordDiagnostic(diagnostic,'model-failed',diagnosticError(error)); if (signal?.aborted) throw error; throw new ModelError('连接模型接口失败，请检查网络和 API 配置。', undefined, 'network_error'); }
      let data: any;
      try { data = raw ? JSON.parse(raw) : {}; } catch { throw new ModelError(response.ok ? '模型接口返回了无法读取的结果。' : response.status >= 500 ? serviceFailure(response.status) : `模型接口返回 HTTP ${response.status}。`, response.status, response.ok ? 'invalid_json' : 'http_error'); }
      const content = data?.choices?.[0]?.message?.content ?? data?.choices?.[0]?.text;
      if (!response.ok || data?.error) {
        const detail = typeof data?.error?.message === 'string' ? data.error.message : typeof data?.error === 'string' ? data.error : typeof data?.message === 'string' ? data.message : '';
        throw new ModelError(detail || (response.status === 429 ? '模型服务暂时限流，请稍后再试。' : response.status >= 500 ? serviceFailure(response.status) : '模型请求失败，请检查 API 配置。'), response.status, response.status === 429 ? 'rate_limit' : 'http_error');
      }
      if (data?.choices?.[0]?.finish_reason === 'length') throw new ModelError('模型输出达到长度上限，结果不完整；可在设置中更换支持更长输出的模型后重新更新。', response.status, 'output_truncated');
      if (typeof content !== 'string' || !content.trim()) throw new ModelError('模型返回了空内容。', response.status, 'empty_response');
      return content.trim();
    },
  };
}

export function createModelRequester(profiles: { primary: ModelProfile; secondary: ModelProfile }, client = createModelClient()): ModelRequester {
  return { async request({ task, instructions, input, signal, onStarted, diagnostic }) {
    const profile = task === 'plan' ? profiles.secondary : profiles.primary;
    const record = input !== null && typeof input === 'object' && !Array.isArray(input) ? input as Record<string, unknown> : {};
    const people = record.people ?? record.knownPeople;
    const personCodes = createPersonCodes(people);
    recordDiagnostic(diagnostic,'model-encoding',{personCodes:Object.fromEntries([...personCodes].map(([id,code])=>[code,id]))});
    try {
    const response = await client.generate(profile, [
      { role: 'system', content: instructions },
      { role: 'user', content: JSON.stringify(encodePersonReferences(input, personCodes)) },
    ], ['trajectory-batch','development','atmosphere','world-construction'].includes(task) ? 65536 : task === 'plan' ? 4096 : 8192, signal, onStarted, diagnostic);
    const decoded=decodeModelResponse(response, personCodes, task);
    recordDiagnostic(diagnostic,'model-decoded',()=>({decodedKind:typeof decoded,recognizedFields:decoded&&typeof decoded==='object'?Object.keys(decoded):[]}));
    return decoded;
    } catch(error) {recordDiagnostic(diagnostic,'model-failed',diagnosticError(error));throw error;}
  } };
}
