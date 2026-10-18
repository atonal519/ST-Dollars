export interface HostContext {
  [key: string]: unknown;
  getRequestHeaders?: () => HeadersInit;
  extensionSettings?: Record<string, unknown>;
  saveSettingsDebounced?: () => void;
}

interface HostGlobal {
  getContext?: () => HostContext | undefined;
}

interface HostGlobals {
  SillyTavern?: HostGlobal;
  Luker?: HostGlobal;
}

export function getHostContext(globals: HostGlobals = globalThis as HostGlobals): HostContext | undefined {
  return globals.SillyTavern?.getContext?.() ?? globals.Luker?.getContext?.();
}
