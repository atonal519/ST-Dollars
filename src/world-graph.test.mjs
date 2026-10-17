import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';

let server;
let worldModule;
let graphModule;
test.before(async () => {
  server = await createServer({ configFile: false, server: { middlewareMode: true, hmr: false }, appType: 'custom' });
  worldModule = await server.ssrLoadModule('/src/domain/world.ts');
  graphModule = await server.ssrLoadModule('/src/graph/project-world.ts');
});
test.after(async () => { await server?.close(); });

test('empty world carries no people, activities, events, or story time', () => {
  const world = worldModule.createEmptyWorld();
  assert.deepEqual(world.people, []);
  assert.deepEqual(world.activities, []);
  assert.deepEqual(world.events, []);
  assert.deepEqual(world.knowledge, []);
  assert.equal(world.storyTime, null);
});

test('projectWorld maps two equal people to one shared activity by stable IDs', () => {
  const world = worldModule.createEmptyWorld();
  world.people = [
    { id: 'person-1', name: 'Mira', status: 'Present', description: 'A merchant.', sources: [] },
    { id: 'person-2', name: 'Niko', status: 'Present', description: 'A courier.', sources: [] },
  ];
  world.activities = [
    { id: 'activity-1', title: 'Late delivery', status: 'active', participantIds: ['person-1', 'person-2'], description: 'A parcel is delayed.', sources: [] },
  ];
  const before = structuredClone(world);
  const graph = graphModule.projectWorld(world);
  assert.deepEqual(graph.nodes.map(({ id, type }) => [id, type]), [
    ['person-1', 'person'], ['person-2', 'person'], ['activity-1', 'activity'],
  ]);
  assert.deepEqual(graph.edges, [
    { id: 'person-1:activity-1', source: 'person-1', target: 'activity-1', type: 'participates' },
    { id: 'person-2:activity-1', source: 'person-2', target: 'activity-1', type: 'participates' },
  ]);
  assert.deepEqual(world, before);
});
