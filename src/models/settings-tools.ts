import type { ModelProfile } from '../application/contracts';
import { getHostContext } from '../host/host-context';
import { jsonRequestHeaders } from '../host/request-headers';
import { createModelClient, normalizeApiUrl } from './client';

export function createModelSettingsTools(fetchImpl: typeof fetch = (...args) => fetch(...args)) {
  return {
    async fetchModels(profile: ModelProfile): Promise<string[]> {
      if (!profile.url?.trim() || !profile.key?.trim()) throw new Error('请先填写API地址和Key。');
      let response: Response;
      try {
        response = await fetchImpl('/api/backends/chat-completions/status', {
          method: 'POST', headers: jsonRequestHeaders(getHostContext()?.getRequestHeaders?.() ?? {}),
          body: JSON.stringify({ chat_completion_source: 'openai', reverse_proxy: normalizeApiUrl(profile.url), proxy_password: profile.key }),
        });
        const raw = await response.text();
        const data = raw ? JSON.parse(raw) : {};
        if (!response.ok) throw new Error(`拉取模型列表失败（HTTP ${response.status}）。`);
        const rawNames: unknown[] = Array.isArray(data?.data) ? data.data : Array.isArray(data?.models) ? data.models : [];
        const names = rawNames.map((item: any) => typeof item === 'string' ? item : item?.id).filter((item: unknown): item is string => Boolean(item)).map(String);
        if (!names.length) throw new Error('没有读取到可用模型。');
        return [...new Set(names)].sort();
      } catch (error) { throw error instanceof Error ? error : new Error('拉取模型列表失败。'); }
    },
    async testConnection(profile: ModelProfile): Promise<void> {
      if (!profile.url || !profile.key || !profile.model) throw new Error('请先填写 API 地址、模型名和 Key。');
      try {
        await createModelClient({ fetchImpl }).generate(profile, [
          { role: 'system', content: 'This is a plain-text connection check. Reply with a short confirmation.' },
          { role: 'user', content: 'Reply with OK.' },
        ], 256);
      } catch (error) {
        if (error instanceof Error && error.message.includes(profile.key)) throw new Error('测试连接失败，请检查 API 配置。');
        throw error;
      }
    },
  };
}
