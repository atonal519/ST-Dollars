import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';

let server; let createAppearanceSettings; let readSharedApiPresets; let getHostContext;
test.before(async () => {
  server = await createServer({ configFile: false, server: { middlewareMode: true, hmr: false }, appType: 'custom' });
  ({ createAppearanceSettings } = await server.ssrLoadModule('/src/host/appearance-settings.ts'));
  ({ readSharedApiPresets } = await server.ssrLoadModule('/src/host/api-pool.ts'));
  ({ getHostContext } = await server.ssrLoadModule('/src/host/host-context.ts'));
});
test.after(async () => { await server?.close(); });

test('theme preference defaults without writing and saves only its own namespace field', () => {
  let saves = 0;
  const context = { extensionSettings: { 'st-dollars': { existing: true }, unrelated: { intact: true } }, saveSettingsDebounced: () => saves++ };
  const settings = createAppearanceSettings(() => context);
  assert.deepEqual(settings.get(), { appearanceTheme: 'auto' }); assert.equal(saves, 0);
  settings.save('night');
  assert.deepEqual(context.extensionSettings['st-dollars'], { existing: true, appearanceTheme: 'night' });
  assert.deepEqual(context.extensionSettings.unrelated, { intact: true }); assert.equal(saves, 1);
});

test('shared API reader returns current id-addressed connection fields and ignores malformed entries', () => {
  const context = { extensionSettings: { 'schedule-planner': { apiPresets: [null, { name: 'no id', url: 'https://x' }, { id: 'p', name: 'Pool', url: ' https://pool/ ', key: 'secret', model: 'm' }] } } };
  assert.deepEqual(readSharedApiPresets(context), [{ id: 'p', name: 'Pool', url: 'https://pool/', key: 'secret', model: 'm' }]);
  assert.deepEqual(readSharedApiPresets({ extensionSettings: {} }), []);
});

test('theme and shared pool adapters use the existing SillyTavern and Luker context entries', () => {
  for (const hostName of ['SillyTavern', 'Luker']) {
    let saved = 0;
    const context = { extensionSettings: { 'schedule-planner': { apiPresets: [{ id: 'source', name: hostName, url: 'https://pool', key: 'private', model: 'm' }] }, 'st-dollars': {} }, saveSettingsDebounced: () => saved++ };
    const globals = { [hostName]: { getContext: () => context } };
    const resolved = getHostContext(globals);
    assert.equal(readSharedApiPresets(resolved)[0].id, 'source');
    const settings = createAppearanceSettings(() => getHostContext(globals));
    assert.equal(settings.get().appearanceTheme, 'auto'); settings.save('day');
    assert.equal(context.extensionSettings['st-dollars'].appearanceTheme, 'day'); assert.equal(saved, 1);
  }
});
