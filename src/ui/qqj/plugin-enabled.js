const pluginEnabledFlows = new WeakMap();
export async function applyPluginEnabledImmediately({ settings, enabled, onChange } = {}) {
  if (!settings || typeof settings.update !== 'function' || typeof settings.isEnabled !== 'function') throw new TypeError('百面相总开关设置存储无效');
  const previous = settings.isEnabled();
  const desired = enabled === true;
  const flow = pluginEnabledFlows.get(settings) ?? { sequence: 0, tail: Promise.resolve() };
  pluginEnabledFlows.set(settings, flow);
  const sequence = ++flow.sequence;
  try { settings.update({ pluginEnabled: desired }, { observeSaveFailure: true }); }
  catch (error) {
    try { settings.update({ pluginEnabled: previous }); } catch { /* restore the in-memory truth even if host scheduling also fails */ }
    throw error;
  }
  const task = flow.tail.catch(() => {}).then(async () => {
    if (sequence !== flow.sequence) return Object.freeze({ enabled: settings.isEnabled(), previous, persistence: 'scheduled', stale: true });
    try {
      await onChange?.(desired);
      if (sequence !== flow.sequence) return Object.freeze({ enabled: settings.isEnabled(), previous, persistence: 'scheduled', stale: true });
      return Object.freeze({ enabled: desired, previous, persistence: 'scheduled', stale: false });
    } catch (error) {
      if (sequence !== flow.sequence) return Object.freeze({ enabled: settings.isEnabled(), previous, persistence: 'scheduled', stale: true });
      if (sequence === flow.sequence) {
        try { settings.update({ pluginEnabled: previous }); } catch { /* in-memory rollback happens before host save scheduling */ }
        try { await onChange?.(previous); } catch { /* rollback is best effort */ }
      }
      throw error;
    }
  });
  flow.tail = task.catch(() => {});
  return task;
}

