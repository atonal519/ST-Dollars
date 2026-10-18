import { getHostContext } from './host-context';

export type AppearanceThemeMode = 'auto' | 'day' | 'night';
const modes = new Set<AppearanceThemeMode>(['auto', 'day', 'night']);

export function createAppearanceSettings(getContext = getHostContext) {
  return {
    get(): { appearanceTheme: AppearanceThemeMode } {
      const settings = getContext()?.extensionSettings as Record<string, unknown> | undefined;
      const own = settings?.['st-dollars'];
      const mode = own && typeof own === 'object' ? (own as Record<string, unknown>).appearanceTheme : undefined;
      return { appearanceTheme: modes.has(mode as AppearanceThemeMode) ? mode as AppearanceThemeMode : 'auto' };
    },
    save(mode: AppearanceThemeMode): void {
      const context = getContext();
      const settings = context?.extensionSettings as Record<string, unknown> | undefined;
      if (!context || !settings) throw new Error('无法读取酒馆扩展设置。');
      if (typeof context.saveSettingsDebounced !== 'function') throw new Error('酒馆当前未提供设置保存入口。');
      const current = settings['st-dollars'];
      const own = current && typeof current === 'object' ? current as Record<string, unknown> : {};
      settings['st-dollars'] = { ...own, appearanceTheme: modes.has(mode) ? mode : 'auto' };
      context.saveSettingsDebounced();
    },
  };
}
