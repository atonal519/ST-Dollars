import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createServer } from 'vite';

const require = createRequire(import.meta.url);
const cytoscape = require('./vendor/cytoscape.min.cjs');

let server;
let worldModule;
let graphModule;
let layoutModule;
let presentationModule;
let cytoscapeAdapterModule;
let cytoscapeStyleModule;
test.before(async () => {
  server = await createServer({ configFile: false, server: { middlewareMode: true, hmr: false }, appType: 'custom' });
  worldModule = await server.ssrLoadModule('/src/domain/world.ts');
  graphModule = await server.ssrLoadModule('/src/graph/project-world.ts');
  layoutModule = await server.ssrLoadModule('/src/graph/layout.ts');
  presentationModule = await server.ssrLoadModule('/src/graph/presentation.ts');
  cytoscapeAdapterModule = await server.ssrLoadModule('/src/graph/cytoscape-adapter.ts');
  cytoscapeStyleModule = await server.ssrLoadModule('/src/graph/cytoscape-style.ts');
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

test('graph presentation foregrounds only active activities and explicit participants, then reveals selected relationships', () => {
  const world = worldModule.createEmptyWorld();
  world.people = [
    { id: 'p1', name: '安安一号', status: 'model status says active', description: '', sources: [] },
    { id: 'p2', name: '安安二号', status: 'unknown', description: '', sources: [] },
    { id: 'p3', name: '独立人物', status: 'unknown', description: '', sources: [] },
  ];
  world.activities = [
    { id: 'current', title: '当前', status: 'active', participantIds: ['p1'], description: '', sources: [] },
    { id: 'waiting', title: '等待', status: 'waiting', participantIds: ['p2'], description: '', sources: [] },
    { id: 'past', title: '历史', status: 'completed', participantIds: ['p1', 'p2'], description: '', sources: [] },
  ];
  const graph = graphModule.projectWorld(world);
  const initial = presentationModule.graphPresentation(graph, null);
  assert.deepEqual(initial.activeActivityIds, ['current']);
  assert.deepEqual(initial.foregroundPersonIds, ['p1']);
  assert.deepEqual(initial.visibleActivityIds, ['current', 'waiting']);
  assert.deepEqual(initial.visibleEdgeIds, ['p1:current']);
  assert.deepEqual(presentationModule.graphPresentation(graph, 'p2').visibleActivityIds, ['current', 'waiting', 'past']);
  assert.deepEqual(presentationModule.graphPresentation(graph, 'p2').visibleEdgeIds, ['p1:current', 'p2:waiting', 'p2:past']);
  assert.deepEqual(presentationModule.graphPresentation(graph, 'past').visibleActivityIds, ['current', 'waiting', 'past']);
  assert.deepEqual(presentationModule.graphPresentation(graph, 'past').visibleEdgeIds, ['p1:current', 'p1:past', 'p2:past']);
  assert.deepEqual(presentationModule.graphPresentation(graph, 'past').foregroundPersonIds, ['p1', 'p2']);
  const noActive = graphModule.projectWorld({ ...world, activities: world.activities.map(activity => ({ ...activity, status: 'completed' })) });
  const browseAll = presentationModule.graphPresentation(noActive, null);
  assert.deepEqual(browseAll.foregroundPersonIds, ['p1', 'p2', 'p3']);
  assert.deepEqual(browseAll.visibleActivityIds, []);
  assert.deepEqual(browseAll.visibleEdgeIds, []);
  assert.deepEqual(noActive.nodes.filter(node => node.type === 'person').map(node => node.id), ['p1', 'p2', 'p3']);
});

test('real Cytoscape hides completed titles by default and restores a selected person activity title', () => {
  const graph = {
    nodes: [
      { id: 'p1', type: 'person', label: '安安一号', status: '', description: '' },
      { id: 'active', type: 'activity', label: '当前事项', status: 'active', description: '' },
      { id: 'past', type: 'activity', label: '已完成事项', status: 'completed', description: '' },
    ],
    edges: [
      { id: 'p1:active', source: 'p1', target: 'active', type: 'participates' },
      { id: 'p1:past', source: 'p1', target: 'past', type: 'participates' },
    ],
  };
  const colors = { ink: '#eee', muted: '#999', line: '#666', star: '#ccd', selected: '#c86', base: '#111' };
  const cy = cytoscape({ headless: true, styleEnabled: true, layout: { name: 'preset' }, style: cytoscapeStyleModule.createCytoscapeStyle(colors) });
  try {
    cytoscapeAdapterModule.syncGraphElements(cy, graph);
    cytoscapeAdapterModule.syncGraphPresentation(cy, graph, null, false, colors);
    const past = cy.getElementById('past');
    assert.equal(past.style('label'), '');
    assert.equal(past.data('displayLabel'), '');
    assert.equal(past.style('display'), 'none');
    assert.equal(cy.getElementById('p1:past').style('display'), 'none');

    cytoscapeAdapterModule.syncGraphPresentation(cy, graph, 'p1', false, colors);
    assert.match(past.style('label'), /已完成/);
    assert.match(past.data('displayLabel'), /已完成/);
    assert.equal(past.style('display'), 'element');

    cytoscapeAdapterModule.syncGraphPresentation(cy, graph, null, false, colors);
    assert.equal(past.style('label'), '');
    assert.equal(past.data('displayLabel'), '');
    assert.equal(past.style('display'), 'none');
  } finally {
    cy.destroy();
  }
});

test('selecting a completed activity reveals its full title and explicit participants only for that selection', () => {
  const graph = {
    nodes: [
      { id: 'p1', type: 'person', label: '历史参与者全名', status: '', description: '' },
      { id: 'live', type: 'activity', label: '当前活动', status: 'active', description: '' },
      { id: 'past', type: 'activity', label: '完成活动全名', status: 'completed', description: '' },
    ],
    edges: [{ id: 'p1:past', source: 'p1', target: 'past', type: 'participates' }],
  };
  const colors = { ink: '#eee', muted: '#999', line: '#666', star: '#ccd', selected: '#c86', base: '#111' };
  const cy = cytoscape({ headless: true, styleEnabled: true, layout: { name: 'preset' }, style: cytoscapeStyleModule.createCytoscapeStyle(colors) });
  try {
    cytoscapeAdapterModule.syncGraphElements(cy, graph);
    cytoscapeAdapterModule.syncGraphPresentation(cy, graph, null, false, colors);
    assert.equal(cy.getElementById('past').style('display'), 'none');
    assert.equal(cy.getElementById('p1').data('displayLabel'), '');
    cytoscapeAdapterModule.syncGraphPresentation(cy, graph, 'past', false, colors);
    assert.equal(cy.getElementById('past').style('display'), 'element');
    assert.match(cy.getElementById('past').data('displayLabel'), /完成活动全名/);
    assert.equal(cy.getElementById('p1:past').style('display'), 'element');
    assert.equal(cy.getElementById('p1').data('displayLabel'), '历史参…');
    cytoscapeAdapterModule.syncGraphPresentation(cy, graph, null, false, colors);
    assert.equal(cy.getElementById('past').style('display'), 'none');
    assert.equal(cy.getElementById('p1:past').style('display'), 'none');
  } finally { cy.destroy(); }
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
  assert.ok(distance(first.points.get('p1'), first.points.get('a1')) > 44);
  assert.ok(distance(first.points.get('p2'), first.points.get('a1')) > 44);
  assert.ok(first.points.get('p3').y > Math.max(first.points.get('a1').y, first.points.get('a2').y));
  const withHistory = {
    nodes: [...graph.nodes, ...Array.from({ length: 12 }, (_, index) => ({ id: `past-${index}`, type: 'activity', label: `Past ${index}`, status: 'completed', description: '' }))],
    edges: [...graph.edges],
  };
  withHistory.edges.push(...Array.from({ length: 12 }, (_, index) => ({ id: `p3:past-${index}`, source: 'p3', target: `past-${index}`, type: 'participates' })));
  const historyLayout = layoutModule.layoutGraph(withHistory);
  assert.equal(historyLayout.height, first.height);
  assert.equal(historyLayout.width, first.width);
  assert.deepEqual(graph, before);
});

test('isolated people use a stable scattered layout for twenty, forty, and one hundred people', () => {
  for (const count of [20, 40, 100]) {
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

test('people shared by multiple active activities keep separated touch centers', () => {
  const graph = {
    nodes: [
      { id: 'p1', type: 'person', label: '共享人物', status: '', description: '' },
      { id: 'p2', type: 'person', label: '活动一人物', status: '', description: '' },
      { id: 'p3', type: 'person', label: '活动二人物', status: '', description: '' },
      { id: 'a1', type: 'activity', label: '当前活动一', status: 'active', description: '' },
      { id: 'a2', type: 'activity', label: '当前活动二', status: 'active', description: '' },
    ],
    edges: [
      { id: 'p1:a1', source: 'p1', target: 'a1', type: 'participates' },
      { id: 'p1:a2', source: 'p1', target: 'a2', type: 'participates' },
      { id: 'p2:a1', source: 'p2', target: 'a1', type: 'participates' },
      { id: 'p3:a2', source: 'p3', target: 'a2', type: 'participates' },
    ],
  };
  const layout = layoutModule.layoutGraph(graph);
  for (const personId of ['p1', 'p2', 'p3']) {
    for (const activityId of ['a1', 'a2']) {
      const person = layout.points.get(personId), activity = layout.points.get(activityId);
      assert.ok(Math.hypot(person.x - activity.x, person.y - activity.y) > 44, `${personId} should not overlap ${activityId}`);
    }
  }
});
