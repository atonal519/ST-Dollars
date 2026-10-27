import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';
let server; let createConfigService;
test.before(async () => { server = await createServer({ configFile: false, server: { middlewareMode: true, hmr: false }, appType: 'custom' }); ({ createConfigService } = await server.ssrLoadModule('/src/models/config.ts')); });
test.after(async () => { await server?.close(); });

test('settings mask keys, follow primary by default, preserve unrelated fields and retain a key when its input is blank', async () => {
  let record = { data: { marker: 'preserve', primary: { url: 'https://p', model: 'p', key: 'secret' } }, revision: 3 };
  const client = { async get() { return record; }, async put(collection, id, data, revision) { assert.equal(collection, 'settings'); assert.equal(id, 'api'); assert.equal(revision, 3); record = { data, revision: 4 }; return record; } };
  const config = createConfigService(client);
  assert.deepEqual(await config.getConfig(), { primary: { url: 'https://p', model: 'p', hasKey: true }, secondary: { url: '', model: '', hasKey: false }, primaryPresetId: '', secondaryPresetId: '', presets: [], secondaryFollowsPrimary: true });
  assert.equal((await config.getProfiles()).secondary.key, 'secret');
  await config.saveConfig({ primary: { url: 'https://p2', model: 'p2', key: '' }, secondaryFollowsPrimary: true });
  assert.equal(record.data.marker, 'preserve'); assert.equal(record.data.primary.key, 'secret');
  assert.equal(JSON.stringify(await config.getConfig()).includes('secret'), false);
});

test('shared references save only IDs and resolve the latest pool values for each model batch', async () => {
  let record = { data: { primary: { url: 'https://old', model: 'old', key: 'old-secret' }, marker: 'keep' }, revision: 4 };
  let pool = [{ id: 'p1', name: '共享主', url: 'https://one', model: 'model-one', key: 'pool-secret' }, { id: 'p2', name: '共享副', url: 'https://two', model: 'model-two', key: 'pool-secret-2' }];
  const client = { async get() { return record; }, async put(_collection, _id, data, revision) { record = { data, revision: revision + 1 }; } };
  const config = createConfigService(client, () => pool);
  await config.saveConfig({ primary: {}, primaryPresetId: 'p1', secondaryFollowsPrimary: false, secondary: {}, secondaryPresetId: 'p2' });
  assert.deepEqual(Object.keys(record.data).sort(), ['marker', 'primary', 'primaryPresetId', 'secondaryFollowsPrimary', 'secondaryPresetId'].sort());
  assert.equal(record.data.primary.key, 'old-secret');
  const publicConfig = await config.getConfig();
  assert.equal(publicConfig.presets[0].hasKey, true); assert.equal(publicConfig.presets.length, 2);
  assert.equal(publicConfig.presets[0].url, 'https://one'); assert.equal(publicConfig.presets[0].model, 'model-one');
  assert.equal(JSON.stringify(publicConfig).includes('pool-secret'), false);
  let resolved = await config.getProfiles();
  assert.equal(resolved.primary.key, 'pool-secret'); assert.equal(resolved.secondary.model, 'model-two');
  pool = pool.map(item => item.id === 'p1' ? { ...item, url: 'https://changed', key: 'rotated' } : item);
  resolved = await config.getProfiles();
  assert.equal(resolved.primary.url, 'https://changed'); assert.equal(resolved.primary.key, 'rotated');
  assert.equal((await config.getConfig()).presets.find(item => item.id === 'p1').url, 'https://changed');
  pool = pool.filter(item => item.id !== 'p1');
  await assert.rejects(config.getProfiles(), /所选共享 API 预设已失效或配置不完整/);
  const beforeInvalidSave = record;
  await assert.rejects(config.saveConfig({ primary: {}, primaryPresetId: 'p1', secondaryFollowsPrimary: false, secondary: {}, secondaryPresetId: 'p2' }), /所选共享 API 预设已失效或配置不完整/);
  assert.equal(record, beforeInvalidSave);
});

test('a following secondary resolves the primary preset while retaining the secondary route', async () => {
  let record = { data: { primaryPresetId: 'p1', secondaryPresetId: 'p2', secondary: { url: 'https://independent', model: 'old', key: 'old-key' }, secondaryFollowsPrimary: true }, revision: 1 };
  const client = { async get() { return record; }, async put(_collection, _id, data, revision) { record = { data, revision: revision + 1 }; } };
  const config = createConfigService(client, () => [{ id: 'p1', name: 'P1', url: 'https://p1', model: 'm1', key: 'k1' }, { id: 'p2', name: 'P2', url: 'https://p2', model: 'm2', key: 'k2' }]);
  const profiles = await config.getProfiles();
  assert.equal(profiles.secondaryFollowsPrimary, true); assert.equal(profiles.secondary.key, 'k1');
  await config.saveConfig({ primary: {}, primaryPresetId: 'p1', secondaryFollowsPrimary: true, secondaryPresetId: 'p2' });
  assert.equal(record.data.secondaryPresetId, 'p2'); assert.equal(record.data.secondary.key, 'old-key');
});

test('roles can be configured independently, and shared-pool edits preserve other entries and never copy keys to Dollars settings', async () => {
  const oldST = globalThis.SillyTavern; const oldLuker = globalThis.Luker;
  try {
    const context = { extensionSettings: {
      'st-dollars': { appearanceTheme: 'night' },
      'schedule-planner': { marker: 'keep-pool', apiPresets: [
        { id: 'main', name: '主', url: 'https://old.example/v1', key: 'pool-secret', model: 'old-model', extra: 'preserve' },
        { id: 'other', name: '其它', url: 'https://other.example/v1', key: 'other-secret', model: 'other-model', vendor: true },
      ] },
    }, saveSettingsDebounced() {} };
    globalThis.SillyTavern = { getContext: () => context };
    let record = { data: { marker: 'keep-record', primary: { url: 'https://local.example/v1', model: 'local', key: 'local-secret' } }, revision: 1 };
    const client = { async get() { return record; }, async put(_collection, _id, data, revision) { record = { data, revision: revision + 1 }; } };
    const readPool = () => context.extensionSettings['schedule-planner'].apiPresets.map(({ id, name, url, key, model }) => ({ id, name, url, key, model }));
    const config = createConfigService(client, readPool);
    await config.saveEditor('primary', { url: 'https://local.example/v1', model: 'main-only', key: '' });
    assert.equal(record.data.primary.model, 'main-only');
    assert.equal(record.data.primary.key, 'local-secret');
    assert.equal(record.data.marker, 'keep-record');
    assert.equal(record.data.secondary, undefined);
    await config.selectApi('primary', { mode: 'preset', presetId: 'main' });
    await config.saveEditor('primary', { url: 'https://updated.example/v1', model: 'updated-model', key: '' });
    const pool = context.extensionSettings['schedule-planner'].apiPresets;
    assert.equal(pool[0].key, 'pool-secret');
    assert.equal(pool[0].extra, 'preserve');
    assert.deepEqual(pool[1], { id: 'other', name: '其它', url: 'https://other.example/v1', key: 'other-secret', model: 'other-model', vendor: true });
    assert.equal(context.extensionSettings['schedule-planner'].marker, 'keep-pool');
    assert.equal(JSON.stringify(record.data).includes('pool-secret'), false);
    const newId = await config.savePresetAs('primary', '副本', { url: 'https://copy.example', model: 'copy-model', key: '' });
    assert.equal(context.extensionSettings['schedule-planner'].apiPresets.find(item => item.id === newId).key, 'pool-secret');
    await config.deletePreset(newId);
    assert.equal(context.extensionSettings['schedule-planner'].apiPresets.some(item => item.id === newId), false);
    assert.equal(record.data.primaryPresetId, undefined);
    assert.equal(record.data.appearanceTheme, undefined);
    assert.equal(context.extensionSettings['st-dollars'].appearanceTheme, 'night');
  } finally {
    if (oldST === undefined) delete globalThis.SillyTavern; else globalThis.SillyTavern = oldST;
    if (oldLuker === undefined) delete globalThis.Luker; else globalThis.Luker = oldLuker;
  }
});

test('reading an absent shared pool is pure, while confirmed preset creation initializes it', async () => {
  const oldST = globalThis.SillyTavern; const oldLuker = globalThis.Luker;
  try {
    const context = { extensionSettings: { 'schedule-planner': { marker: 'keep' } }, writes: 0, saveSettingsDebounced() { this.writes++; } };
    globalThis.SillyTavern = { getContext: () => context };
    let record = null;
    const client = { async get() { return record; }, async put(_collection, _id, data, revision) { record = { data, revision: revision + 1 }; } };
    const config = createConfigService(client);
    assert.deepEqual((await config.getConfig()).presets, []);
    assert.deepEqual(context.extensionSettings['schedule-planner'], { marker: 'keep' });
    assert.equal(context.writes, 0);
    const id = await config.savePresetAs('primary', '首次预设', { url: 'https://models.example', model: 'model-a', key: 'stub-key' });
    assert.deepEqual(context.extensionSettings['schedule-planner'].apiPresets.map(item => item.id), [id]);
    assert.equal(context.extensionSettings['schedule-planner'].marker, 'keep');
    assert.equal(context.writes, 1);
  } finally {
    if (oldST === undefined) delete globalThis.SillyTavern; else globalThis.SillyTavern = oldST;
    if (oldLuker === undefined) delete globalThis.Luker; else globalThis.Luker = oldLuker;
  }
});
