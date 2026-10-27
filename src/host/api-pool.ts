import { getHostContext } from './host-context';

export interface SharedApiPreset { id: string; name: string; url: string; key: string; model: string }

const text = (value: unknown) => typeof value === 'string' ? value.trim() : '';

/** Read the shared pool from its owning extension settings; never copy or cache it. */
export function readSharedApiPresets(context = getHostContext()): SharedApiPreset[] {
  const settings = context?.extensionSettings as Record<string, unknown> | undefined;
  const shared = settings?.['schedule-planner'];
  const list = shared && typeof shared === 'object' ? (shared as { apiPresets?: unknown }).apiPresets : undefined;
  if (!Array.isArray(list)) return [];
  return list.flatMap(value => {
    if (!value || typeof value !== 'object') return [];
    const preset = value as Record<string, unknown>;
    const id = text(preset.id);
    return id ? [{ id, name: text(preset.name) || '未命名预设', url: text(preset.url), key: text(preset.key), model: text(preset.model) }] : [];
  });
}

function mutablePool(allowMissing = false) {
  const context = getHostContext();
  const extensionSettings = context?.extensionSettings;
  if (!context || !extensionSettings || typeof context.saveSettingsDebounced !== 'function') throw new Error('无法保存共享 API 池设置。');
  const current = extensionSettings['schedule-planner'];
  const shared = current && typeof current === 'object' ? current as Record<string, unknown> : {};
  if (!Array.isArray(shared.apiPresets) && (!allowMissing || Object.prototype.hasOwnProperty.call(shared, 'apiPresets'))) throw new Error('共享 API 池当前不可用，未修改设置。');
  const items = (Array.isArray(shared.apiPresets) ? shared.apiPresets : []).filter(item => item && typeof item === 'object') as Array<Record<string, unknown>>;
  return { context, extensionSettings, shared, items, save: context.saveSettingsDebounced.bind(context) };
}

export function updateSharedApiPreset(id: string, patch: { url: string; key: string; model: string }): void {
  const pool = mutablePool();
  let found = false;
  const apiPresets = pool.items.map(item => {
    if (text(item.id) !== id) return item;
    found = true;
    return { ...item, url: patch.url, key: patch.key, model: patch.model };
  });
  if (!found) throw new Error('所选共享 API 预设已失效，请重新选择。');
  pool.extensionSettings['schedule-planner'] = { ...pool.shared, apiPresets };
  pool.save();
}

export function createSharedApiPreset(preset: { id: string; name: string; url: string; key: string; model: string }, baseId = ''): void {
  const pool = mutablePool(true);
  const base = baseId ? pool.items.find(item => text(item.id) === baseId) : undefined;
  pool.extensionSettings['schedule-planner'] = { ...pool.shared, apiPresets: [...pool.items, { ...(base ?? {}), ...preset }] };
  pool.save();
}

export function deleteSharedApiPreset(id: string): void {
  const pool = mutablePool();
  if (!pool.items.some(item => text(item.id) === id)) throw new Error('这个共享预设已不存在。');
  pool.extensionSettings['schedule-planner'] = { ...pool.shared, apiPresets: pool.items.filter(item => text(item.id) !== id) };
  pool.save();
}
