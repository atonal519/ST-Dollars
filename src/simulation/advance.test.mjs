import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';
let server; let advanceBatch; let createEmptyState;
test.before(async () => { server = await createServer({ configFile: false, server: { middlewareMode: true, hmr: false }, appType: 'custom' }); ({ advanceBatch } = await server.ssrLoadModule('/src/simulation/advance.ts')); ({ createEmptyState } = await server.ssrLoadModule('/src/domain/world-state.ts')); });
test.after(async () => { await server?.close(); });
const source = { kind: 'chat', id: 'current', label: '当前正文' };
const story = { status: 'ready', message: '', throughSeq: 20, turns: [{ seq: 20, text: '下周交付。', isUser: false }], source };
const people = [{ id: 'p1', displayName: '林叶', aliases: [], description: '', source }, { id: 'p2', displayName: '周岚', aliases: [], description: '', source }];
const materials = { async readForQuestion(input) { return { status: 'ready', message: '', routerText: '', materials: input.personIds.map(personId => ({ personId, profileText: '', stateText: '状态', memoryText: '经历', refs: [], sources: [] })), coverage: { partial: false, cseStatus: 'ready' } }; } };

test('one plan and one batch preserve activity continuity and link results/knowledge by explicit IDs', async () => {
  const calls = [];
  const model = { async request(request) { calls.push(request); return request.task === 'plan'
    ? '{"data":{"participants":["p1"],"activityIds":["old-a"],"question":"交付"}}'
    : { result: { activities: [{ id: 'old-a', title: '交付工作', description: '仍在推进。' }, { key: 'deliver', title: '下周交付', description: '准备交付。', participantIds: ['p1'], status: 'active' }], events: [{ key: 'done', activityId: 'deliver', title: '通知收到', description: '周岚收到通知。', participantIds: ['p2'] }], knowledge: [{ personId: 'p2', eventId: 'done', reason: '收到项目组消息。' }, { personId: 'p1', eventId: 'old-event', reason: '读到了既有记录。' }] } }; } };
  const old = createEmptyState('chat');
  old.activities = [{ id: 'old-a', title: '旧活动', description: '旧说明', status: 'waiting', participantIds: ['p1'], sources: [] }];
  old.events = [{ id: 'old-event', activityId: 'old-a', title: '旧结果', description: '之前发生', storyTime: null, participantIds: ['p1'], sources: [] }];
  const result = await advanceBatch({ people, state: old, story, dependencies: { model, materials } });
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[1].input.relevantEvents.map(event => event.id), ['old-event']);
  assert.equal(result.state.activities.find(activity => activity.id === 'old-a').status, 'waiting');
  assert.equal(result.state.events.at(-1).activityId, result.state.activities.find(activity => activity.title === '下周交付').id);
  assert.equal(result.state.knowledge.some(item => item.personId === 'p1' && item.eventId === old.events[0].id), true);
  assert.equal(result.state.knowledge.some(item => item.personId === 'p2' && item.eventId === result.state.events.at(-1).id), true);
});

test('unknown-only explicit selection fails instead of consuming the body; an empty selection is a one-call quiet turn', async () => {
  let calls = 0; const model = { async request({ task }) { calls++; return task === 'plan' ? { personIds: ['unknown'], activityIds: [] } : { activities: [], events: [], knowledge: [] }; } };
  await assert.rejects(advanceBatch({ people, state: createEmptyState('chat'), story, dependencies: { model, materials } }), /无法确认|未在/);
  assert.equal(calls, 1);
  calls = 0;
  const quiet = await advanceBatch({ people, state: createEmptyState('chat'), story, dependencies: { model: { async request({ task }) { calls++; return task === 'plan' ? { personIds: [], activityIds: [], storyTime: '下周' } : {}; } }, materials } });
  assert.equal(calls, 1); assert.equal(quiet.state.processedThroughSeq, 20); assert.equal(quiet.state.storyTime.text, '下周');
});

test('a selected person brings their unfinished activity, direct participants, and knowledge-linked context into the batch', async () => {
  const calls = [];
  const old = createEmptyState('chat');
  old.activities = [{ id: 'a1', title: '交付', description: '待完成', status: 'active', participantIds: ['p1', 'p2'], sources: [] }];
  old.events = [
    { id: 'e-activity', activityId: 'a1', title: '交付前情', description: '与活动相关', storyTime: null, participantIds: ['p2'], sources: [] },
    { id: 'e-knowledge', activityId: null, title: '通知', description: '只有知情关系', storyTime: null, participantIds: ['p2'], sources: [] },
  ];
  old.knowledge = [{ personId: 'p1', eventId: 'e-knowledge', reason: '收到通知', sources: [] }];
  const result = await advanceBatch({ people, state: old, story, dependencies: { materials, model: { async request(request) {
    calls.push(request);
    return request.task === 'plan' ? { personIds: ['p1'], activityIds: [], question: '交付' } : { activities: [], events: [], knowledge: [] };
  } } } });
  assert.deepEqual(calls[1].input.selectedPeople.map(person => person.id), ['p1', 'p2']);
  assert.deepEqual(calls[1].input.selectedActivities.map(activity => activity.id), ['a1']);
  assert.deepEqual(calls[1].input.relevantEvents.map(event => event.id), ['e-activity', 'e-knowledge']);
  assert.deepEqual(calls[1].input.relevantKnowledge.map(item => item.eventId), ['e-knowledge']);
  assert.equal(result.state.processedThroughSeq, 20);
});

test('an explicit activity participant list replaces prior membership and reports unknown people; omitted lists preserve membership', async () => {
  const old = createEmptyState('chat');
  old.activities = [{ id: 'a1', title: '交付', description: '待完成', status: 'active', participantIds: ['p1', 'p2'], sources: [] }];
  const run = (batch) => advanceBatch({ people, state: old, story, dependencies: { materials, model: { async request({ task }) { return task === 'plan' ? { personIds: [], activityIds: ['a1'] } : batch; } } } });
  const explicit = await run({ activities: [{ id: 'a1', title: '交付', participantIds: ['p1', 'unknown'] }], events: [], knowledge: [] });
  assert.deepEqual(explicit.state.activities[0].participantIds, ['p1']);
  assert.match(explicit.report.message, /格式或归属无法确认/);
  const omitted = await run({ activities: [{ id: 'a1', title: '交付', description: '继续' }], events: [], knowledge: [] });
  assert.deepEqual(omitted.state.activities[0].participantIds, ['p1', 'p2']);
});

test('non-empty batches with no adoptable item fail without advancing the sequence', async () => {
  let calls = 0;
  const old = createEmptyState('chat');
  await assert.rejects(advanceBatch({ people, state: old, story, dependencies: { materials, model: { async request({ task }) {
    calls++;
    return task === 'plan' ? { personIds: ['p1'], activityIds: [] } : { activities: [null], events: [{ title: '没有活动归属', activityId: 'missing' }], knowledge: [] };
  } } } }), /未能确认|未记录/);
  assert.equal(calls, 2);
  assert.equal(old.processedThroughSeq, null);
});

test('single stable-ID strings and objects normalize, while unsupported choices do not consume the floor', async () => {
  for (const personChoice of ['p1', { id: 'p1' }]) {
    let calls = 0;
    const result = await advanceBatch({ people, state: createEmptyState('chat'), story, dependencies: { materials, model: { async request({ task }) { calls++; return task === 'plan' ? { personIds: personChoice, activityIds: [] } : { activities: [], events: [], knowledge: [] }; } } } });
    assert.equal(calls, 2);
    assert.equal(result.report.throughSeq, 20);
  }
  let calls = 0;
  await assert.rejects(advanceBatch({ people, state: createEmptyState('chat'), story, dependencies: { materials, model: { async request() { calls++; return { personIds: 42, activityIds: [] }; } } } }), /选择|范围/);
  assert.equal(calls, 1);
});

test('a malformed batch field is reported without losing a valid single-object item', async () => {
  const result = await advanceBatch({ people, state: createEmptyState('chat'), story, dependencies: { materials, model: { async request({ task }) {
    return task === 'plan' ? { personIds: ['p1'], activityIds: [] } : { activities: { key: 'new', title: '新活动', participantIds: ['p1'] }, events: {}, knowledge: [] };
  } } } });
  assert.equal(result.state.activities.length, 1);
  assert.equal(result.state.activities[0].title, '新活动');
  assert.match(result.report.message, /格式或归属无法确认/);
  await assert.rejects(advanceBatch({ people, state: createEmptyState('chat'), story, dependencies: { materials, model: { async request({ task }) { return task === 'plan' ? { personIds: ['p1'], activityIds: [] } : { activities: [], events: '无法识别', knowledge: [] }; } } } }), /未记录本段/);
});

test('duplicate temporary keys never decide event or knowledge ownership', async () => {
  const old = createEmptyState('chat');
  old.activities = [{ id: 'existing', title: '旧活动', description: '待办', status: 'active', participantIds: ['p1'], sources: [] }];
  const result = await advanceBatch({ people, state: old, story, dependencies: { materials, model: { async request({ task }) {
    return task === 'plan' ? { personIds: [], activityIds: ['existing'] } : {
      activities: [{ key: 'same', title: '活动甲', participantIds: ['p1'] }, { key: 'same', title: '活动乙', participantIds: ['p1'] }],
      events: [{ key: 'event-same', activityId: 'existing', title: '结果甲', description: '事实甲', participantIds: ['p1'] }, { key: 'event-same', activityId: 'existing', title: '结果乙', description: '事实乙', participantIds: ['p1'] }, { key: 'other', activityId: 'same', title: '归属不明', description: '事实丙', participantIds: ['p1'] }],
      knowledge: [{ personId: 'p1', eventId: 'event-same', reason: '得知该事件' }],
    };
  } } } });
  assert.equal(result.state.activities.length, 3);
  assert.equal(result.state.events.length, 2);
  assert.equal(result.state.knowledge.length, 0);
  assert.match(result.report.message, /无法确认/);
});

test('recognized Chinese statuses map correctly, invalid statuses preserve old values and report omissions', async () => {
  const old = createEmptyState('chat');
  old.activities = [{ id: 'old-a', title: '旧活动', description: '进行中', status: 'active', participantIds: ['p1'], sources: [] }];
  const result = await advanceBatch({ people, state: old, story, dependencies: { materials, model: { async request({ task }) {
    return task === 'plan' ? { personIds: ['p1'], activityIds: ['old-a'] } : { activities: [{ id: 'old-a', status: '无法理解' }, { key: 'new', title: '新活动', status: '已完成', participantIds: ['p1'] }, { id: 'old-a', status: '进行中' }], events: [], knowledge: [] };
  } } } });
  assert.equal(result.state.activities.find(item => item.id === 'old-a').status, 'active');
  assert.equal(result.state.activities.find(item => item.title === '新活动').status, 'completed');
  assert.match(result.report.message, /状态无法确认/);
});

test('unknown event participants are reported but known participants and title fallback remain', async () => {
  const result = await advanceBatch({ people, state: createEmptyState('chat'), story, dependencies: { materials, model: { async request({ task }) {
    return task === 'plan' ? { personIds: ['p1'], activityIds: [] } : { activities: [{ key: 'new', title: '新活动', participantIds: ['p1'] }], events: [{ activityId: 'new', title: '结果标题', description: '  ', participantIds: ['p2', 'unknown'] }], knowledge: [] };
  } } } });
  assert.deepEqual(result.state.events[0].participantIds, ['p2']);
  assert.equal(result.state.events[0].description, '结果标题');
  assert.match(result.report.message, /格式或归属无法确认/);
});
