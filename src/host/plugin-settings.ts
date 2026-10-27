import { getHostContext } from './host-context';

export function createPluginSettings(getContext = getHostContext) {
  return {
    getEveryReplies(): number {
      const own = getContext()?.extensionSettings?.['st-dollars'] as Record<string, unknown> | undefined;
      const value = own?.developmentEveryReplies;
      return typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? value : 1;
    },
    saveEveryReplies(value: number): void {
      if (!Number.isSafeInteger(value) || value < 1) throw new Error('请输入正整数回复数。');
      const context = getContext(); const settings = context?.extensionSettings;
      if (!settings || typeof context?.saveSettingsDebounced !== 'function') throw new Error('无法保存更新间隔，请重新输入。');
      const own = settings['st-dollars'];
      settings['st-dollars'] = {...(own && typeof own === 'object' ? own : {}), developmentEveryReplies: value};
      context.saveSettingsDebounced();
    },
    isEnabled(): boolean {
      const own = getContext()?.extensionSettings?.['st-dollars'];
      return !(own && typeof own === 'object' && (own as Record<string, unknown>).pluginEnabled === false);
    },
    saveEnabled(enabled: boolean): void {
      const context = getContext();
      const settings = context?.extensionSettings;
      if (!context || !settings || typeof context.saveSettingsDebounced !== 'function') throw new Error('无法保存百面相开关设置。');
      const current = settings['st-dollars'];
      const own = current && typeof current === 'object' ? current as Record<string, unknown> : {};
      settings['st-dollars'] = { ...own, pluginEnabled: enabled };
      context.saveSettingsDebounced();
    },
  };
}
