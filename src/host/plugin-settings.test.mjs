import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';

let server; let createPluginSettings;
test.before(async () => {
  server = await createServer({ configFile: false, server: { middlewareMode: true, hmr: false }, appType: 'custom' });
  ({ createPluginSettings } = await server.ssrLoadModule('/src/host/plugin-settings.ts'));
});
test.after(async () => { await server?.close(); });

test('enabled preference defaults without writing and saves alongside existing Dollars fields', () => {
  let saves = 0;
  const context = { extensionSettings: { 'st-dollars': { appearanceTheme: 'night', other: 'keep' } }, saveSettingsDebounced() { saves++; } };
  const settings = createPluginSettings(() => context);
  assert.equal(settings.isEnabled(), true);
  assert.equal(saves, 0);
  settings.saveEnabled(false);
  assert.deepEqual(context.extensionSettings['st-dollars'], { appearanceTheme: 'night', other: 'keep', pluginEnabled: false });
  assert.equal(saves, 1);
});
test('development interval defaults to one and saves only positive integers beside existing settings',()=>{let writes=0;const ctx={extensionSettings:{'st-dollars':{other:'keep'}},saveSettingsDebounced(){writes++;}};const prefs=createPluginSettings(()=>ctx);assert.equal(prefs.getEveryReplies(),1);assert.equal(writes,0);prefs.saveEveryReplies(10);assert.equal(prefs.getEveryReplies(),10);assert.equal(ctx.extensionSettings['st-dollars'].other,'keep');for(const n of [0,-1,1.5,NaN])assert.throws(()=>prefs.saveEveryReplies(n),/正整数/);assert.equal(writes,1);});
