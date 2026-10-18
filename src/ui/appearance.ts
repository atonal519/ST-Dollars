import type { AppearanceThemeMode } from '../host/appearance-settings';

type Palette = Record<string, string>;
type AppearanceSettings = { get(): { appearanceTheme: AppearanceThemeMode } };
const PALETTES: Record<'day' | 'night', Palette> = {
  day: { ink: '#222a2e', muted: '#637178', faint: '#929da2', base: '#f4f7f8', surface: '#ffffff', raised: '#e9eff1', border: '#d1dce0', line: '#bdcbd0', star: '#4b777c', selected: '#a34b42', action: '#426f73', onAction: '#ffffff', actionBorder: '#315b5f', danger: '#a63d42', hoverBorder: '#82979d', windowShadow: '0 18px 54px #18303a30', toolbarBorder: '#d1dce0dd', toolbarBg: '#f4f7f8e8', edgeFocus: '#a34b4288', starStroke: '#315359', starGlow: '#4b777c55', selectedStroke: '#7e302b', selectedGlow: '#a34b4266', overviewBg: '#fffffffa', overviewShadow: '0 8px 28px #18303a24', excerpt: '#53666c', sectionBorder: '#d1dce0', articleBg: '#edf2f3', inputBg: '#ffffff' },
  night: { ink: '#d9e2e7', muted: '#8396a2', faint: '#61727d', base: '#141f28', surface: '#1a2832', raised: '#20313b', border: '#344651', line: '#52636e', star: '#afc9d8', selected: '#c3aa8e', action: '#42646b', onAction: '#ffffff', actionBorder: '#52717a', danger: '#d88c83', hoverBorder: '#718691', windowShadow: '0 18px 54px #07101855', toolbarBorder: '#344651aa', toolbarBg: '#141f28d9', edgeFocus: '#c3aa8e88', starStroke: '#e0edf3', starGlow: '#a9d0e5aa', selectedStroke: '#f0dfcc', selectedGlow: '#d8b48fcc', overviewBg: '#1a2832f5', overviewShadow: '0 8px 28px #080f14aa', excerpt: '#b8c5cc', sectionBorder: '#283a45', articleBg: '#192630', inputBg: '#101a21' },
};

function color(documentRef: Document | undefined, raw: string): { css: string; rgb: number[]; alpha: number } | null {
  const value = raw.trim();
  if (!value || value.toLowerCase() === 'transparent') return null;
  const hex = /^#([\da-f]{3,8})$/i.exec(value);
  if (hex) {
    const body = hex[1].length <= 4 ? [...hex[1]].map(char => char + char).join('') : hex[1];
    if (body.length !== 6 && body.length !== 8) return null;
    return { css: `#${body.slice(0, 6)}`, rgb: [0, 2, 4].map(index => Number.parseInt(body.slice(index, index + 2), 16)), alpha: body.length === 8 ? Number.parseInt(body.slice(6), 16) / 255 : 1 };
  }
  const rgb = /^rgba?\(\s*([-+]?(?:\d*\.)?\d+%?)\s*(?:,|\s)\s*([-+]?(?:\d*\.)?\d+%?)\s*(?:,|\s)\s*([-+]?(?:\d*\.)?\d+%?)(?:\s*(?:,|\/)\s*([-+]?(?:\d*\.)?\d+%?))?\s*\)$/i.exec(value);
  if (rgb) {
    const channels = rgb.slice(1, 4).map(channel => {
      const parsed = Number.parseFloat(channel);
      return channel.endsWith('%') ? Math.round(Math.min(100, Math.max(0, parsed)) * 2.55) : Math.round(Math.min(255, Math.max(0, parsed)));
    });
    const alpha = rgb[4] ? Math.min(1, Math.max(0, Number.parseFloat(rgb[4]) / (rgb[4].endsWith('%') ? 100 : 1))) : 1;
    return { css: `rgb(${channels.join(', ')})`, rgb: channels, alpha };
  }
  try {
    const context = documentRef?.createElement('canvas').getContext('2d');
    if (!context) return null;
    context.fillStyle = '#010203'; context.fillStyle = value;
    if (context.fillStyle === '#010203' && value.toLowerCase() !== '#010203') return null;
    context.fillRect(0, 0, 1, 1); const sample = context.getImageData(0, 0, 1, 1).data;
    return { css: `rgb(${sample[0]}, ${sample[1]}, ${sample[2]})`, rgb: [sample[0], sample[1], sample[2]], alpha: sample[3] / 255 };
  } catch { return null; }
}
const blend = (documentRef: Document | undefined, overlay: string, base: string) => {
  const top = color(documentRef, overlay), under = color(documentRef, base);
  if (!top || !under || top.alpha >= 1) return top?.css ?? base;
  return `rgb(${top.rgb.map((channel, index) => Math.round(channel * top.alpha + under.rgb[index] * (1 - top.alpha))).join(', ')})`;
};
const relativeLuminance = (rgb: number[]) => rgb.reduce((sum, channel, index) => {
  const value = channel / 255, linear = value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4;
  return sum + linear * [.2126, .7152, .0722][index];
}, 0);
const foregroundFor = (accent: string, documentRef?: Document) => {
  const parsed = color(documentRef, accent);
  if (!parsed) return '#ffffff';
  const accentLuminance = relativeLuminance(parsed.rgb), darkLuminance = relativeLuminance([34, 40, 43]);
  const darkContrast = (accentLuminance + .05) / (darkLuminance + .05), lightContrast = 1.05 / (accentLuminance + .05);
  return darkContrast >= lightContrast ? '#222a2e' : '#ffffff';
};

export function resolveAppearance({ mode = 'auto', documentRef = globalThis.document, windowRef = documentRef?.defaultView ?? (globalThis as unknown as Window) }: { mode?: AppearanceThemeMode; documentRef?: Document; windowRef?: Window } = {}) {
  const root = documentRef?.documentElement;
  let signals: Record<string, string> = {};
  try {
    const computed = windowRef?.getComputedStyle(root);
    const read = (name: string) => computed?.getPropertyValue(name).trim() ?? '';
    signals = { body: read('--SmartThemeBodyColor'), quote: read('--SmartThemeQuoteColor'), chat: read('--SmartThemeChatTintColor'), bot: read('--SmartThemeBotMesBlurTintColor'), user: read('--SmartThemeUserMesBlurTintColor') };
  } catch { /* Missing host theme values use the system palette. */ }
  const body = color(documentRef, signals.body);
  const hostTheme = body ? ((.2126 * body.rgb[0] + .7152 * body.rgb[1] + .0722 * body.rgb[2]) > 127 ? 'night' : 'day') : null;
  const systemTheme = windowRef?.matchMedia?.('(prefers-color-scheme: light)')?.matches ? 'day' : 'night';
  const effectiveTheme = mode === 'auto' ? hostTheme ?? systemTheme : mode;
  const palette = { ...PALETTES[effectiveTheme] };
  if (mode === 'auto') {
    const quote = color(documentRef, signals.quote)?.css ?? palette.selected;
    palette.ink = body?.css ?? palette.ink;
    palette.selected = quote; palette.action = quote; palette.actionBorder = quote; palette.onAction = foregroundFor(quote, documentRef);
    palette.base = blend(documentRef, signals.chat, palette.base);
    palette.surface = blend(documentRef, signals.bot, palette.surface);
    palette.line = blend(documentRef, signals.user, palette.line);
  }
  return { mode, effectiveTheme, palette, hasHostSignal: Boolean(body) };
}

export function applyAppearance(host: HTMLElement, mode: AppearanceThemeMode, documentRef: Document = document, windowRef: Window = window): ReturnType<typeof resolveAppearance> {
  const appearance = resolveAppearance({ mode, documentRef, windowRef });
  host.setAttribute('data-bmx-theme', appearance.effectiveTheme);
  host.setAttribute('data-bmx-theme-mode', appearance.mode);
  host.style.colorScheme = appearance.effectiveTheme === 'day' ? 'light' : 'dark';
  for (const [key, value] of Object.entries(appearance.palette)) host.style.setProperty(`--bmx-${key.replace(/[A-Z]/g, char => `-${char.toLowerCase()}`)}`, value);
  return appearance;
}

export function createAppearanceController({ host, settings, documentRef = globalThis.document, windowRef = documentRef?.defaultView ?? (globalThis as unknown as Window), onChange }: { host: HTMLElement; settings: AppearanceSettings; documentRef?: Document; windowRef?: Window; onChange?: (value: ReturnType<typeof resolveAppearance>) => void }) {
  let destroyed = false;
  const currentMode = () => settings.get().appearanceTheme;
  const apply = () => { if (!destroyed) { const value = applyAppearance(host, currentMode(), documentRef, windowRef); onChange?.(value); } };
  const Observer = (windowRef as Window & { MutationObserver?: typeof MutationObserver })?.MutationObserver ?? globalThis.MutationObserver;
  const observer = documentRef?.documentElement && typeof Observer === 'function' ? new Observer(() => { if (currentMode() === 'auto') apply(); }) : null;
  observer?.observe(documentRef.documentElement, { attributes: true, attributeFilter: ['style', 'class'] });
  const media = windowRef?.matchMedia?.('(prefers-color-scheme: light)');
  const onSystem = () => { if (currentMode() === 'auto' && !resolveAppearance({ mode: 'auto', documentRef, windowRef }).hasHostSignal) apply(); };
  media?.addEventListener?.('change', onSystem);
  apply();
  return { apply, destroy() { destroyed = true; observer?.disconnect(); media?.removeEventListener?.('change', onSystem); } };
}
