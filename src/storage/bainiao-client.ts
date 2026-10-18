import { getHostContext } from '../host/host-context';
import { jsonRequestHeaders } from '../host/request-headers';

export class StorageError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) { super(message); this.name = 'StorageError'; }
}

export function createBainiaoClient({ fetchImpl = (...args: Parameters<typeof fetch>) => fetch(...args), getHeaders = () => getHostContext()?.getRequestHeaders?.() as HeadersInit ?? {}, baseUrl = '' }: { fetchImpl?: typeof fetch; getHeaders?: () => HeadersInit; baseUrl?: string } = {}) {
  async function request(collection: string, id: string, method: 'GET' | 'PUT', body?: unknown) {
    const url = `${baseUrl.replace(/\/$/, '')}/api/plugins/st-bainiaodata/v1/records/st-dollars/${encodeURIComponent(collection)}/${encodeURIComponent(id)}`;
    let response: Response;
    let raw: string;
    try {
      response = await fetchImpl(url, { method, headers: body === undefined ? getHeaders() : jsonRequestHeaders(getHeaders()), ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
      raw = await response.text();
    } catch { throw new StorageError(0, 'network_error', '白鳥数据连接失败，请重新读取当前数据后再继续。'); }
    let payload: Record<string, unknown> = {};
    try { payload = raw ? JSON.parse(raw) as Record<string, unknown> : {}; }
    catch { if (response.ok) throw new StorageError(response.status, 'invalid_response', '白鳥返回的数据无法读取。'); }
    if (!response.ok) {
      const code = String(payload.error ?? (response.status === 409 ? 'conflict' : 'storage_error'));
      const message = response.status === 409 ? '数据已被其他更新修改，请重新读取后再推进。' : method === 'GET' ? '读取百面相数据失败，请重新打开页面后再试。' : response.status === 0 ? '保存结果暂时无法确认，请重新读取当前数据。' : '保存百面相数据失败，请重新读取当前数据后再决定下一步。';
      throw new StorageError(response.status, code, message);
    }
    return payload;
  }
  return {
    async get(collection: string, id: string) {
      try { return await request(collection, id, 'GET'); }
      catch (error) { if (error instanceof StorageError && error.status === 404) return null; throw error; }
    },
    put(collection: string, id: string, data: unknown, expectedRevision: number) { return request(collection, id, 'PUT', { data, expectedRevision }); },
  };
}
