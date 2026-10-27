import type { AppearanceThemeMode } from '../host/appearance-settings';

type Palette = Record<string, string>;
type AppearanceSettings = { get(): { appearanceTheme: AppearanceThemeMode } };
const PALETTES: Record<'day' | 'night', Palette> = {
  "day": {
    "ink": "#302e2d",
    "muted": "#746d67",
    "faint": "#746d67",
    "base": "#faf8f4",
    "surface": "#fffdfa",
    "raised": "#f0ede7",
    "border": "#e1dbd3",
    "line": "#e1dbd3",
    "star": "#71617e",
    "selected": "#71617e",
    "action": "#71617e",
    "onAction": "#fff",
    "actionBorder": "#71617e",
    "danger": "#a34e4b",
    "hoverBorder": "#71617e",
    "windowShadow": "0 18px 54px #30282c24",
    "toolbarBorder": "#e1dbd3",
    "toolbarBg": "#faf8f4e6",
    "edgeFocus": "#71617e88",
    "starStroke": "#71617e",
    "starGlow": "#71617e55",
    "selectedStroke": "#71617e",
    "selectedGlow": "#71617e66",
    "overviewBg": "#fffdfaf5",
    "overviewShadow": "0 8px 28px #30282c20",
    "excerpt": "#746d67",
    "sectionBorder": "#e1dbd3",
    "articleBg": "#f0ede7",
    "inputBg": "#fffdfa",
    "success": "#557364"
  },
  "night": {
    "ink": "#eee8e2",
    "muted": "#b6aca5",
    "faint": "#b6aca5",
    "base": "#252325",
    "surface": "#2d2a2c",
    "raised": "#353034",
    "border": "#464044",
    "line": "#464044",
    "star": "#c3afcf",
    "selected": "#c3afcf",
    "action": "#c3afcf",
    "onAction": "#29222d",
    "actionBorder": "#c3afcf",
    "danger": "#e6a19a",
    "hoverBorder": "#c3afcf",
    "windowShadow": "0 18px 54px #00000055",
    "toolbarBorder": "#464044",
    "toolbarBg": "#252325e6",
    "edgeFocus": "#c3afcf88",
    "starStroke": "#c3afcf",
    "starGlow": "#c3afcf55",
    "selectedStroke": "#c3afcf",
    "selectedGlow": "#c3afcf66",
    "overviewBg": "#2d2a2cf5",
    "overviewShadow": "0 8px 28px #00000055",
    "excerpt": "#b6aca5",
    "sectionBorder": "#464044",
    "articleBg": "#353034",
    "inputBg": "#2d2a2c",
    "success": "#a0c4ae"
  }
};

// API 专用色板直接沿用千千结 appearance.js；同一主题控制器读取信号并应用，不影响其它页面。
const API_PALETTES: Record<'day' | 'night', Palette> = {
  day: { paper: '#f7f8fa', panel: '#ffffff', ink: '#22282b', soft: '#637077', faint: '#929da2', line: '#dce2e5', thread: '#cbd4d8', crimson: '#b63745', knot: '#b63745', onPrimary: '#fff', blue: '#4f8781', success: '#4b7d63' },
  night: { paper: '#13181b', panel: '#1c2327', ink: '#e7ecee', soft: '#9db0b5', faint: '#6c7c81', line: '#2b363b', thread: '#33424a', crimson: '#d9707a', knot: '#d9707a', onPrimary: '#fff', blue: '#77b0aa', success: '#77b193' },
};
const API_AUTO_FALLBACK_PALETTES: Record<'day' | 'night', Palette> = {
  day: { paper: '#e8ecec', panel: '#f6f8f8', ink: '#22282b', soft: '#5c6a70', faint: '#93a1a5', line: '#d0d9db', thread: '#c1ccce', crimson: '#a8322f', knot: '#a8322f', blue: '#4f8781', success: '#4b7d63' },
  night: API_PALETTES.night,
};
type ParsedColor = { css: string; rgb: number[]; alpha: number };

function color(documentRef: Document | undefined, raw: string, qqjApi = false): ParsedColor | null {
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
      return channel.endsWith('%') ? (qqjApi ? Math.round(Math.min(100, Math.max(0, parsed))) * 2.55 : Math.round(Math.min(100, Math.max(0, parsed)) * 2.55)) : Math.round(Math.min(255, Math.max(0, parsed)));
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
const blend = (documentRef: Document | undefined, overlay: string, base: string, qqjApi = false) => {
  const top = color(documentRef, overlay, qqjApi), under = color(documentRef, base, qqjApi);
  if (qqjApi && (!top || !under || top.alpha <= 0)) return base;
  if (!top || !under || top.alpha >= 1) return top?.css ?? base;
  return `rgb(${top.rgb.map((channel, index) => Math.round(channel * top.alpha + under.rgb[index] * (1 - top.alpha))).join(', ')})`;
};
const relativeLuminance = (rgb: number[]) => rgb.reduce((sum, channel, index) => {
  const value = channel / 255, linear = value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4;
  return sum + linear * [.2126, .7152, .0722][index];
}, 0);
const foregroundForColor = (parsed: ParsedColor | null, qqjApi = false) => {
  if (!parsed) return qqjApi ? '#fff' : '#ffffff';
  const accentLuminance = relativeLuminance(parsed.rgb), darkLuminance = relativeLuminance([34, 40, 43]);
  const darkContrast = (accentLuminance + .05) / (darkLuminance + .05), lightContrast = 1.05 / (accentLuminance + .05);
  return darkContrast >= lightContrast ? (qqjApi ? '#22282b' : '#222a2e') : (qqjApi ? '#fff' : '#ffffff');
};
const foregroundFor = (accent: string, documentRef?: Document) => foregroundForColor(color(documentRef, accent));

function apiPaletteFor(mode: AppearanceThemeMode, effectiveTheme: 'day' | 'night', signals: Record<string, string>, documentRef?: Document): Palette {
  if (mode !== 'auto') return API_PALETTES[effectiveTheme];
  const palette = API_AUTO_FALLBACK_PALETTES[effectiveTheme];
  const opaque = (raw: string, fallback: string) => color(documentRef, raw, true)?.css ?? fallback;
  const accent = color(documentRef, signals.quote ?? '', true) ?? color(documentRef, palette.crimson, true);
  return {
    ...palette,
    ink: opaque(signals.body ?? '', palette.ink), knot: opaque(signals.quote ?? '', palette.knot), crimson: opaque(signals.quote ?? '', palette.crimson), blue: opaque(signals.quote ?? '', palette.blue),
    paper: blend(documentRef, signals.chat ?? '', palette.paper, true), panel: blend(documentRef, signals.bot ?? '', palette.panel, true), thread: blend(documentRef, signals.user ?? '', palette.thread, true),
    onPrimary: foregroundForColor(accent, true),
  };
}

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
  return { mode, effectiveTheme, palette, apiPalette: apiPaletteFor(mode, effectiveTheme, signals, documentRef), hasHostSignal: Boolean(body) };
}

export function applyAppearance(host: HTMLElement, mode: AppearanceThemeMode, documentRef: Document = document, windowRef: Window = window): ReturnType<typeof resolveAppearance> {
  const appearance = resolveAppearance({ mode, documentRef, windowRef });
  host.setAttribute('data-bmx-theme', appearance.effectiveTheme);
  host.setAttribute('data-bmx-theme-mode', appearance.mode);
  host.style.colorScheme = appearance.effectiveTheme === 'day' ? 'light' : 'dark';
  for (const [key, value] of Object.entries(appearance.palette)) host.style.setProperty(`--bmx-${key.replace(/[A-Z]/g, char => `-${char.toLowerCase()}`)}`, value);
  for (const [key, value] of Object.entries(appearance.apiPalette)) host.style.setProperty(`--bmx-api-${key.replace(/[A-Z]/g, char => `-${char.toLowerCase()}`)}`, value);
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
