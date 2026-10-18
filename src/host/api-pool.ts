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
