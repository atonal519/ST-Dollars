export const MEMORY_BRIDGE_KEY = 'qqj_v3_public_bridge_v1';
const identityKey = identity => JSON.stringify([identity?.hostChatId, identity?.qqjChatId, identity?.characterLocator, identity?.personaLocator]);

// M4 的 External Story Memory provider 接口。M2-B 仅调用 status，不读取或注入业务材料。
export function createMyriadKnotsProvider({ globals = globalThis, currentChatId }) {
  function status() {
    const bridge = globals[MEMORY_BRIDGE_KEY];
    if (!bridge) return { status: 'unavailable', message: '未检测到千千结。' };
    if (bridge.schemaVersion !== 1 || typeof bridge.getStatus !== 'function') return { status: 'unsupported', message: '千千结读取接口版本不兼容。' };
    try {
      const value = bridge.getStatus();
      if (value?.status === 'ready' && String(value.identity?.hostChatId) !== String(currentChatId())) return { status: 'stale', message: '千千结正在切换聊天。' };
      return { ...value, promptSnapshotAvailable: typeof bridge.getPromptSnapshot === 'function' };
    } catch { return { status: 'error', message: '千千结读取接口暂不可用。' }; }
  }
  async function read(method) {
    const bridge = globals[MEMORY_BRIDGE_KEY];
    const before = status();
    if (before.status !== 'ready') return before;
    if (typeof bridge?.[method] !== 'function') return { status: 'unsupported', message: '此版本千千结不提供该读取方法。' };
    try {
      const value = await bridge[method]();
      const after = status();
      if (globals[MEMORY_BRIDGE_KEY] !== bridge || after.status !== 'ready' || identityKey(before.identity) !== identityKey(after.identity)
        || value?.identity && identityKey(value.identity) !== identityKey(before.identity)) return { status: 'stale', message: '读取期间聊天身份已变化。' };
      return structuredClone(value);
    } catch { return { status: 'error', message: '千千结记忆读取失败。' }; }
  }
  return { status, readSnapshot: () => read('getSnapshot'), readMemory: () => read('readMemory'), readPromptSnapshot: () => read('getPromptSnapshot') };
}
