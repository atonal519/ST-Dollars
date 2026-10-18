import type { ModelProfile, ModelRequester } from '../application/contracts';
import { getHostContext } from '../host/host-context';
import { jsonRequestHeaders } from '../host/request-headers';

export class ModelError extends Error {
  constructor(message: string, readonly httpStatus: number | undefined, readonly code: string) { super(message); this.name = 'ModelError'; }
}
export function normalizeApiUrl(value: string): string {
  const url = String(value || '').trim().replace(/\/+$/, '');
  if (!url) return '';
  if (/\/chat\/completions$/i.test(url)) return url.replace(/\/chat\/completions$/i, '');
  if (/^https?:\/\/[^/?#]+$/i.test(url)) return `${url}/v1`;
  return url;
}

export function createModelClient({ fetchImpl = (...args: Parameters<typeof fetch>) => fetch(...args), getHeaders = () => getHostContext()?.getRequestHeaders?.() ?? {} }: { fetchImpl?: typeof fetch; getHeaders?: () => HeadersInit } = {}) {
  return {
    async generate(profile: ModelProfile, messages: { role: string; content: string }[], maxTokens: number): Promise<string> {
      if (!profile.url || !profile.model || !profile.key) throw new ModelError('请先完整配置百面相模型 API。', undefined, 'api_not_configured');
      let response: Response;
      let raw: string;
      try {
        response = await fetchImpl('/api/backends/chat-completions/generate', { method: 'POST', headers: jsonRequestHeaders(getHeaders()), body: JSON.stringify({ chat_completion_source: 'openai', reverse_proxy: normalizeApiUrl(profile.url), proxy_password: profile.key, model: profile.model, messages, stream: false, max_tokens: maxTokens }) });
        raw = await response.text();
      } catch { throw new ModelError('连接模型接口失败，请检查网络和 API 配置。', undefined, 'network_error'); }
      let data: any;
      try { data = raw ? JSON.parse(raw) : {}; } catch { throw new ModelError(response.ok ? '模型接口返回了无法读取的结果。' : `模型接口返回 HTTP ${response.status}。`, response.status, response.ok ? 'invalid_json' : 'http_error'); }
      const content = data?.choices?.[0]?.message?.content ?? data?.choices?.[0]?.text;
      if (!response.ok || data?.error) {
        const detail = typeof data?.error?.message === 'string' ? data.error.message : typeof data?.error === 'string' ? data.error : typeof data?.message === 'string' ? data.message : '';
        throw new ModelError(detail || (response.status === 429 ? '模型服务暂时限流，请稍后再试。' : '模型请求失败，请检查 API 配置。'), response.status, response.status === 429 ? 'rate_limit' : 'http_error');
      }
      if (typeof content !== 'string' || !content.trim()) throw new ModelError('模型返回了空内容。', response.status, 'empty_response');
      return content.trim();
    },
  };
}

export function createModelRequester(profiles: { primary: ModelProfile; secondary: ModelProfile }, client = createModelClient()): ModelRequester {
  return { async request({ task, instructions, input }) {
    const profile = task === 'plan' ? profiles.secondary : profiles.primary;
    return client.generate(profile, [
      { role: 'system', content: instructions },
      { role: 'user', content: JSON.stringify(input) },
    ], task === 'plan' ? 2048 : 8192);
  } };
}
