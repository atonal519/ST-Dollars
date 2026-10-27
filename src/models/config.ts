import type { ConfigService, ModelProfile, SharedModelPresetSummary } from '../application/contracts';
import { createSharedApiPreset, deleteSharedApiPreset, readSharedApiPresets, updateSharedApiPreset } from '../host/api-pool';
import { createBainiaoClient } from '../storage/bainiao-client';

type Settings = { primary?: Partial<ModelProfile>; secondary?: Partial<ModelProfile>; primaryPresetId?: string; secondaryPresetId?: string; secondaryFollowsPrimary?: boolean; [key: string]: unknown };
const clean = (value: unknown) => typeof value === 'string' ? value.trim() : '';
const usable = (profile: Partial<ModelProfile> | undefined): ModelProfile | null => profile && clean(profile.url) && clean(profile.model) && clean(profile.key) ? { url: clean(profile.url), model: clean(profile.model), key: clean(profile.key) } : null;
const summary = (preset: { id: string; name: string; url: string; model: string; key: string }): SharedModelPresetSummary => ({ id: preset.id, name: preset.name, url: preset.url, model: preset.model, hasUrl: Boolean(preset.url), hasModel: Boolean(preset.model), hasKey: Boolean(preset.key) });
const invalidPreset = () => new Error('所选共享 API 预设已失效或配置不完整，请重新选择或在共享 API 池中补齐。');

export function createConfigService(client = createBainiaoClient(), readPresets = readSharedApiPresets, pool = { update: updateSharedApiPreset, create: createSharedApiPreset, delete: deleteSharedApiPreset }): ConfigService {
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
  const findPreset = (id: string, presets: ReturnType<typeof readPresets>) => {
    const preset = presets.find(value => value.id === id);
    if (!preset) throw new Error('所选共享 API 预设已失效，请重新选择。');
    return preset;
  };
  const targetFor = (settings: Settings, role: 'primary' | 'secondary') => {
    if (role === 'secondary' && (settings.secondaryFollowsPrimary === true || (settings.secondaryFollowsPrimary !== false && !settings.secondaryPresetId && !settings.secondary))) return 'primary';
    return role;
  };
  return {
    async getProfile(role) {
      const { settings } = await read();
      const target = targetFor(settings, role);
      const presetId = clean(target === 'primary' ? settings.primaryPresetId : settings.secondaryPresetId);
      if (presetId) {
        const preset = findPreset(presetId, readPresets());
        return { url: clean(preset.url), model: clean(preset.model), key: clean(preset.key) };
      }
      const profile = target === 'primary' ? settings.primary ?? settings.secondary : settings.secondary;
      return { url: clean(profile?.url), model: clean(profile?.model), key: clean(profile?.key) };
    },
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
    async selectApi(role, selection) {
      const current = await read();
      const settings: Settings = { ...current.settings };
      if (role === 'primary') {
        if (selection.mode === 'preset') { const id = clean(selection.presetId); findPreset(id, readPresets()); settings.primaryPresetId = id; }
        else { delete settings.primaryPresetId; }
      } else if (selection.mode === 'follow') {
        settings.secondaryFollowsPrimary = true; delete settings.secondaryPresetId;
      } else {
        settings.secondaryFollowsPrimary = false;
        if (selection.mode === 'preset') { const id = clean(selection.presetId); findPreset(id, readPresets()); settings.secondaryPresetId = id; }
        else delete settings.secondaryPresetId;
      }
      await client.put('settings', 'api', settings, current.revision);
    },
    async saveEditor(role, input) {
      const current = await read();
      const target = targetFor(current.settings, role);
      const presetId = clean(target === 'primary' ? current.settings.primaryPresetId : current.settings.secondaryPresetId);
      if (presetId) {
        const currentProfile = findPreset(presetId, readPresets());
        const profile = { url: clean(input.url ?? currentProfile.url), model: clean(input.model ?? currentProfile.model), key: clean(input.key) || currentProfile.key };
        if (!profile.url || !profile.model || !profile.key) throw new Error('请填写 API 地址、模型名和 Key。');
        pool.update(presetId, profile);
        return;
      }
      const currentProfile = target === 'primary' ? current.settings.primary ?? current.settings.secondary : current.settings.secondary;
      const profile = { url: clean(input.url ?? currentProfile?.url), model: clean(input.model ?? currentProfile?.model), key: clean(input.key) || clean(currentProfile?.key) };
      if (!profile.url || !profile.model || !profile.key) throw new Error(`请填写${target === 'primary' ? '主' : '副'}模型 API 地址、模型名和首次使用所需的 Key。`);
      await client.put('settings', 'api', { ...current.settings, [target]: profile }, current.revision);
    },
    async savePresetAs(role, name, input) {
      const id = `dollars-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const cleanName = clean(name);
      if (!cleanName) throw new Error('请输入预设名称。');
      const current = await read();
      const target = targetFor(current.settings, role);
      const oldPresetId = clean(target === 'primary' ? current.settings.primaryPresetId : current.settings.secondaryPresetId);
      const old = oldPresetId ? findPreset(oldPresetId, readPresets()) : null;
      const oldOwn = target === 'primary' ? current.settings.primary ?? current.settings.secondary : current.settings.secondary;
      const profile = { url: clean(input.url), model: clean(input.model), key: clean(input.key) || clean(old?.key ?? oldOwn?.key) };
      if (!profile.url || !profile.model || !profile.key) throw new Error('请填写 API 地址、模型名和首次使用所需的 Key。');
      pool.create({ id, name: cleanName, ...profile }, oldPresetId);
      const settings: Settings = { ...current.settings };
      if (role === 'primary') settings.primaryPresetId = id;
      else { settings.secondaryFollowsPrimary = false; settings.secondaryPresetId = id; }
      await client.put('settings', 'api', settings, current.revision);
      return id;
    },
    async deletePreset(id) {
      const selected = clean(id);
      pool.delete(selected);
      const current = await read();
      const settings: Settings = { ...current.settings };
      if (clean(settings.primaryPresetId) === selected) delete settings.primaryPresetId;
      if (clean(settings.secondaryPresetId) === selected) { delete settings.secondaryPresetId; settings.secondaryFollowsPrimary = true; }
      await client.put('settings', 'api', settings, current.revision);
    },
  };
}
