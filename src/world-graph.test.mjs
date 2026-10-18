import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';

let server;
let worldModule;
let graphModule;
let layoutModule;
let viewportModule;
test.before(async () => {
  server = await createServer({ configFile: false, server: { middlewareMode: true, hmr: false }, appType: 'custom' });
  worldModule = await server.ssrLoadModule('/src/domain/world.ts');
  graphModule = await server.ssrLoadModule('/src/graph/project-world.ts');
  layoutModule = await server.ssrLoadModule('/src/graph/layout.ts');
  viewportModule = await server.ssrLoadModule('/src/graph/viewport.ts');
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

test('layout is stable by ID, retains isolated people and activity nodes, and leaves graph facts unchanged', () => {
  const graph = {
    nodes: [
      { id: 'p2', type: 'person', label: '同名', status: '暂无活动记录', description: '' },
      { id: 'p1', type: 'person', label: '同名', status: '暂无活动记录', description: '' },
      { id: 'p3', type: 'person', label: '孤立人物', status: '暂无活动记录', description: '' },
      { id: 'a1', type: 'activity', label: '共享活动', status: 'active', description: '' },
      { id: 'a2', type: 'activity', label: '单人活动', status: 'planned', description: '' },
    ],
    edges: [
      { id: 'p1:a1', source: 'p1', target: 'a1', type: 'participates' },
      { id: 'p2:a1', source: 'p2', target: 'a1', type: 'participates' },
      { id: 'p1:a2', source: 'p1', target: 'a2', type: 'participates' },
    ],
  };
  const before = structuredClone(graph);
  const first = layoutModule.layoutGraph(graph);
  const reordered = layoutModule.layoutGraph({ nodes: [...graph.nodes].reverse(), edges: [...graph.edges].reverse() });
  assert.deepEqual([...first.points], [...reordered.points]);
  assert.ok(first.points.has('p3'));
  assert.notDeepEqual(first.points.get('p1'), first.points.get('p2'));
  assert.ok(first.points.has('a1'));
  assert.ok(first.points.has('a2'));
  assert.equal(first.width, 420);
  const distance = (left, right) => Math.hypot(left.x - right.x, left.y - right.y);
  assert.ok(distance(first.points.get('p1'), first.points.get('a1')) < 180);
  assert.ok(distance(first.points.get('p2'), first.points.get('a1')) < 180);
  assert.ok(first.points.get('p3').y > Math.max(first.points.get('a1').y, first.points.get('a2').y));
  assert.deepEqual(graph, before);
});

test('isolated people use a stable scattered layout for twenty and forty people', () => {
  for (const count of [20, 40]) {
    const graph = {
      nodes: Array.from({ length: count }, (_, index) => ({
        id: `person-${String(index).padStart(2, '0')}`,
        type: 'person',
        label: index % 2 ? 'Jessica Morgan' : '布雷克·莱德',
        status: '暂无活动记录',
        description: '',
      })),
      edges: [],
    };
    const layout = layoutModule.layoutGraph(graph);
    const repeated = layoutModule.layoutGraph({ nodes: [...graph.nodes].reverse(), edges: [] });
    const points = [...layout.points.values()];
    assert.equal(points.length, count);
    assert.deepEqual([...layout.points], [...repeated.points]);
    assert.ok(new Set(points.map(point => point.x)).size > 3);
    assert.ok(new Set(points.map(point => point.y)).size > Math.ceil(count / 5));
    for (let left = 0; left < points.length; left++) {
      for (let right = left + 1; right < points.length; right++) {
        assert.ok(
          Math.abs(points[left].x - points[right].x) >= 64 || Math.abs(points[left].y - points[right].y) >= 48,
          `person labels overlap at ${left} and ${right}`,
        );
      }
    }
    assert.ok(layout.height > 400);
  }
});

test('viewport zoom keeps the anchor fixed, clamps scale, and centers a fitted graph', () => {
  const initial = { x: -80, y: 12, scale: 1 };
  const anchor = { x: 140, y: 90 };
  const before = { x: (anchor.x - initial.x) / initial.scale, y: (anchor.y - initial.y) / initial.scale };
  const zoomed = viewportModule.zoomAt(initial, 1.4, anchor);
  assert.ok(Math.abs((anchor.x - zoomed.x) / zoomed.scale - before.x) < 1e-9);
  assert.ok(Math.abs((anchor.y - zoomed.y) / zoomed.scale - before.y) < 1e-9);
  assert.equal(viewportModule.zoomAt(initial, 99, anchor).scale, viewportModule.MAX_GRAPH_SCALE);
  assert.equal(viewportModule.zoomAt(initial, 0.001, anchor).scale, viewportModule.MIN_GRAPH_SCALE);
  const fitted = viewportModule.fitGraph(520, 400, { x: 360, y: 600 });
  assert.ok(fitted.scale <= 0.92);
  assert.ok(Math.abs((fitted.x + 520 * fitted.scale / 2) - 180) < 1e-9);
  assert.ok(Math.abs((fitted.y + 400 * fitted.scale / 2) - 300) < 1e-9);
});
