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
