import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { createSSRApp } from 'vue';
import { renderToString } from 'vue/server-renderer';
import vue from '@vitejs/plugin-vue';

let server;
let deriveCurrentActivities;
let createEmptyWorld;
let CurrentActivities;
test.before(async () => {
  server = await createServer({ configFile: false, plugins: [vue()], server: { middlewareMode: true, hmr: false }, appType: 'custom' });
  ({ deriveCurrentActivities } = await server.ssrLoadModule('/src/ui/current-activities.ts'));
  ({ createEmptyWorld } = await server.ssrLoadModule('/src/domain/world.ts'));
  ({ default: CurrentActivities } = await server.ssrLoadModule('/src/ui/CurrentActivities.vue'));
});
test.after(async () => { await server?.close(); });

const person = (id, name) => ({ id, name, status: '', description: '', sources: [] });
const activity = (id, status, participantIds = []) => ({ id, title: id, status, description: `描述 ${id}`, participantIds, sources: [] });
const event = (id, activityId) => ({ id, activityId, title: id, description: id, storyTime: null, participantIds: [], sources: [] });

test('current activities exclude completed and attach the last explicitly related event with full participants', () => {
  const world = createEmptyWorld();
  world.people = [person('p1', '完整姓名一'), person('p2', '完整姓名二')];
  world.activities = [activity('past', 'completed'), activity('waiting', 'waiting', ['p1', 'p2']), activity('active', 'active')];
  world.events = [event('unrelated-later', 'other'), event('waiting-first', 'waiting'), event('active-event', 'active'), event('waiting-latest', 'waiting')];
  const items = deriveCurrentActivities(world);
  assert.deepEqual(items.map(item => item.activity.id), ['active', 'waiting']);
  assert.deepEqual(items[1].participants, ['完整姓名一', '完整姓名二']);
  assert.equal(items[1].recentEvent.id, 'waiting-latest');
  assert.equal(items[0].recentEvent.id, 'active-event');
});

test('current activities are empty when there are no activities or only completed activities', () => {
  const world = createEmptyWorld();
  assert.deepEqual(deriveCurrentActivities(world), []);
  world.activities = [activity('past', 'completed')];
  assert.deepEqual(deriveCurrentActivities(world), []);
});


test('activity list renders full names, recent related record and direct actions without completed cards', async () => {
  const world = createEmptyWorld();
  world.people = [person('p1', '完整姓名一')];
  world.activities = [activity('past', 'completed'), activity('live', 'active', ['p1'])];
  world.events = [event('结果记录', 'live')];
  const state = { world, source: { status: 'ready', message: '' } };
  const html = await renderToString(createSSRApp(CurrentActivities, { state }));
  assert.match(html, /完整姓名一/);
  assert.match(html, /结果记录/);
  assert.match(html, /在图谱中查看/);
  assert.doesNotMatch(html, /past/);
});

test('current cards exclude corrected events from recent objective results',()=>{const world=createEmptyWorld();world.activities=[activity('live','active')];world.events=[event('有效结果','live'),{...event('错误结果','live'),correction:{byEventId:'truth',reason:'已纠正'}}];assert.equal(deriveCurrentActivities(world)[0].recentEvent.id,'有效结果');});
