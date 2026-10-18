import type { ConfigService, ModelProfile, SharedModelPresetSummary } from '../application/contracts';
import { readSharedApiPresets } from '../host/api-pool';
import { createBainiaoClient } from '../storage/bainiao-client';

type Settings = { primary?: Partial<ModelProfile>; secondary?: Partial<ModelProfile>; primaryPresetId?: string; secondaryPresetId?: string; secondaryFollowsPrimary?: boolean; [key: string]: unknown };
const clean = (value: unknown) => typeof value === 'string' ? value.trim() : '';
const usable = (profile: Partial<ModelProfile> | undefined): ModelProfile | null => profile && clean(profile.url) && clean(profile.model) && clean(profile.key) ? { url: clean(profile.url), model: clean(profile.model), key: clean(profile.key) } : null;
const summary = (preset: { id: string; name: string; url: string; model: string; key: string }): SharedModelPresetSummary => ({ id: preset.id, name: preset.name, url: preset.url, model: preset.model, hasUrl: Boolean(preset.url), hasModel: Boolean(preset.model), hasKey: Boolean(preset.key) });
const invalidPreset = () => new Error('所选共享 API 预设已失效或配置不完整，请重新选择或在共享 API 池中补齐。');

export function createConfigService(client = createBainiaoClient(), readPresets = readSharedApiPresets): ConfigService {
  async function read() {
    const envelope = await client.get('settings', 'api') as { data?: unknown; revision?: number } | null;
    return { settings: (envelope?.data && typeof envelope.data === 'object' ? envelope.data : {}) as Settings, revision: Number(envelope?.revision ?? 0), exists: Boolean(envelope) };
  }
  const resolvePreset = (id: string, presets: ReturnType<typeof readPresets>) => {
    const preset = presets.find(value => value.id === id);
    const profile = preset && usable(preset);
    if (!profile) throw invalidPreset();
    return profile;
  };
  return {
    async getProfiles() {
      const { settings } = await read();
      const presets = readPresets();
      const primary = clean(settings.primaryPresetId) ? resolvePreset(clean(settings.primaryPresetId), presets) : usable(settings.primary) ?? usable(settings.secondary);
      if (!primary) throw new Error('请先配置主模型的 API 地址、模型名和 Key。');
      const secondaryFollowsPrimary = settings.secondaryFollowsPrimary === true || (settings.secondaryFollowsPrimary !== false && !clean(settings.secondaryPresetId) && !settings.secondary);
      const secondary = secondaryFollowsPrimary ? primary : clean(settings.secondaryPresetId) ? resolvePreset(clean(settings.secondaryPresetId), presets) : usable(settings.secondary);
      if (!secondary) throw new Error('请先完整配置副模型，或启用副模型跟随主模型。');
      return { primary, secondary, secondaryFollowsPrimary };
    },
    async getConfig() {
      const { settings } = await read();
      const presets = readPresets();
      const independentPrimary = usable(settings.primary) ?? (!settings.primaryPresetId ? usable(settings.secondary) : null);
      const independentSecondary = usable(settings.secondary);
      const mask = (profile: ModelProfile | null) => ({ url: profile?.url ?? '', model: profile?.model ?? '', hasKey: Boolean(profile?.key) });
      const secondaryFollowsPrimary = settings.secondaryFollowsPrimary === true || (settings.secondaryFollowsPrimary !== false && !clean(settings.secondaryPresetId) && !settings.secondary);
      return {
        primary: mask(independentPrimary), secondary: mask(independentSecondary),
        primaryPresetId: clean(settings.primaryPresetId), secondaryPresetId: clean(settings.secondaryPresetId),
        presets: presets.map(summary), secondaryFollowsPrimary,
      };
    },
    async saveConfig(input) {
      const current = await read();
      const merge = (old: Partial<ModelProfile> | undefined, patch: Partial<ModelProfile> | undefined): ModelProfile => ({
        url: clean(patch?.url ?? old?.url), model: clean(patch?.model ?? old?.model), key: clean(patch?.key) || clean(old?.key),
      });
      const settings: Settings = { ...current.settings, secondaryFollowsPrimary: input.secondaryFollowsPrimary };
      const primaryPresetId = clean(input.primaryPresetId);
      if (primaryPresetId) { resolvePreset(primaryPresetId, readPresets()); settings.primaryPresetId = primaryPresetId; }
      else {
        delete settings.primaryPresetId;
        const primary = merge(current.settings.primary ?? current.settings.secondary, input.primary);
        if (!primary.url || !primary.model || !primary.key) throw new Error('请填写主模型 API 地址和模型名；首次保存还需要填写 Key。');
        settings.primary = primary;
      }
      if (!input.secondaryFollowsPrimary) {
        const secondaryPresetId = clean(input.secondaryPresetId);
        if (secondaryPresetId) { resolvePreset(secondaryPresetId, readPresets()); settings.secondaryPresetId = secondaryPresetId; }
        else {
          delete settings.secondaryPresetId;
          const secondary = merge(current.settings.secondary, input.secondary);
          if (!secondary.url || !secondary.model || !secondary.key) throw new Error('请填写副模型 API 地址和模型名；首次保存还需要填写 Key。');
          settings.secondary = secondary;
        }
      }
      await client.put('settings', 'api', settings, current.revision);
    },
  };
}
