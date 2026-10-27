import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';

let server; let buildPersonContexts;
test.before(async () => {
  server = await createServer({ configFile: false, server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom' });
  ({ buildPersonContexts } = await server.ssrLoadModule('/src/simulation/person-context.ts'));
});
test.after(async () => { await server?.close(); });

test('projects bounded person facts by explicit IDs without treating participation as knowledge', () => {
  const people = [{ id: 'p1' }, { id: 'p2' }, { id: 'p3' }];
  const state = {
    activities: [
      { id: 'open', status: 'active', participantIds: ['p1', 'p2'] },
      { id: 'done', status: 'completed', participantIds: ['p1'] },
    ],
    events: [
      { id: 'event-private', participantIds: ['p1'], activityId: 'open' },
      { id: 'event-known', participantIds: ['p2'], activityId: null },
      ...Array.from({ length: 22 }, (_, index) => ({ id: `other-${index}`, participantIds: [], activityId: null })),
      { id: 'world', participantIds: [], activityId: null },
      { id: 'external', participantIds: ['outside-roster'], activityId: null },
    ],
    knowledge: [{ personId: 'p1', eventId: 'event-known', reason: '收到转告' }],
  };
  const result = buildPersonContexts(people, state);
  const p1 = result.personContexts.find(item => item.personId === 'p1');
  const p2 = result.personContexts.find(item => item.personId === 'p2');
  const p3 = result.personContexts.find(item => item.personId === 'p3');
  assert.deepEqual(p1.activityIds, ['open']);
  assert.deepEqual(p1.participatedEventIds, ['event-private']);
  assert.deepEqual(p1.knownEvents, [{ eventId: 'event-known', reason: '收到转告' }]);
  assert.ok(!p1.participatedEventIds.includes('event-known'));
  assert.equal(p2.participatedEventIds.length, 1);
  assert.ok(p3);
  assert.deepEqual(result.worldEventIds, [...Array.from({ length: 18 }, (_, index) => `other-${index + 4}`), 'world', 'external']);
  assert.deepEqual(result.contextEvents.map(event => event.id), ['event-private', 'event-known', ...result.worldEventIds]);
  assert.deepEqual(p1.knownEvents, [{ eventId: 'event-known', reason: '收到转告' }]);
});
