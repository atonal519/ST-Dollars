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

test('individual action intentions reach one batch judgment, focused recall uses the action when question is empty, and existing summaries stay intact', async () => {
  const old = createEmptyState('chat');
  old.activities = [{ id: 'todo-p2', title: '准备交付', description: '权威活动概况', status: 'active', participantIds: ['p2'], sources: [] }];
  const calls = []; const reads = [];
  const result = await advanceBatch({ people, state: old, story, dependencies: {
    materials: { async readForQuestion(input) { reads.push(input); return { status: 'ready', message: '', routerText: '', materials: [], coverage: { partial: false, cseStatus: 'ready' } }; } },
    model: { async request(request) { calls.push(request); return request.task === 'plan'
      ? { intentions: [{ personId: 'p2', action: '按已有待办整理交付材料', activityId: 'todo-p2' }, { personId: 'p1', waitReason: '等待确认' }], question: '', storyTime: null }
      : { activities: [{ id: 'todo-p2', title: '准备交付', description: '更短进展', status: 'completed' }], events: [{ activityId: 'todo-p2', title: '材料已整理', description: '周岚按原待办整理完成', participantIds: ['p2'] }], knowledge: [] }; } },
  } });
  assert.equal(calls.length, 2);
  assert.equal(reads.length, 2);
  assert.equal(reads[1].question, '按已有待办整理交付材料');
  assert.deepEqual(calls[1].input.intentions, [{ personId: 'p2', action: '按已有待办整理交付材料', waitReason: '', activityId: 'todo-p2' }]);
  assert.deepEqual(calls[1].input.selectedPeople.map(person => person.id), ['p2']);
  assert.equal(result.state.activities[0].description, '权威活动概况');
  assert.equal(result.state.events[0].activityId, 'todo-p2');
  assert.match(result.report.message, /行动意图 1 位.*等待 1 位.*批次上下文 0 位/);
});

test('wait-only intentions do not select their linked unfinished activity and consume one model call', async () => {
  const old = createEmptyState('chat');
  old.activities = [{ id: 'todo-p2', title: '准备交付', description: '待办', status: 'active', participantIds: ['p2'], sources: [] }];
  let calls = 0;
  const result = await advanceBatch({ people, state: old, story, dependencies: { materials, model: { async request({ task }) { calls++; return task === 'plan'
    ? { intentions: [{ personId: 'p2', waitReason: '等待仓库开放', activityId: 'todo-p2' }], question: '' }
    : { activities: [], events: [], knowledge: [] }; } } } });
  assert.equal(calls, 1);
  assert.equal(result.state.activities[0].status, 'active');
  assert.match(result.report.message, /行动意图 0 位.*等待 1 位/);
});

test('a valid wait-only intention survives an unknown person row and reports the omission in one call', async () => {
  let calls = 0;
  const result = await advanceBatch({ people, state: createEmptyState('chat'), story, dependencies: { materials, model: { async request({ task }) { calls++; return task === 'plan'
    ? { intentions: [{ personId: 'p2', waitReason: '等待明确条件' }, { personId: 'P999', action: '未知行' }] }
    : { activities: [], events: [], knowledge: [] }; } } } });
  assert.equal(calls, 1);
  assert.equal(result.state.processedThroughSeq, 20);
  assert.match(result.report.message, /等待 1 位/);
  assert.match(result.report.message, /1 条意图或引用无法确认/);
});

test('a wait-only participant is included only when an active intention expands a shared activity context', async () => {
  const old = createEmptyState('chat');
  old.activities = [{ id: 'shared', title: '共同准备', description: '双方参与', status: 'active', participantIds: ['p1', 'p2'], sources: [] }];
  let batch;
  await advanceBatch({ people, state: old, story, dependencies: { materials, model: { async request(request) { if (request.task === 'advance') batch = request; return request.task === 'plan'
    ? { intentions: [{ personId: 'p1', action: '整理资料', activityId: 'shared' }, { personId: 'p2', waitReason: '等待确认' }] }
    : { activities: [], events: [], knowledge: [] }; } } } });
  assert.deepEqual(batch.input.selectedPeople.map(person => person.id), ['p1', 'p2']);
  assert.deepEqual(batch.input.intentions.map(item => [item.personId, item.action, item.waitReason]), [['p1', '整理资料', ''], ['p2', '', '等待确认']]);
});

test('valid action intentions survive malformed and unknown rows and report omitted rows', async () => {
  const calls = [];
  const result = await advanceBatch({ people, state: createEmptyState('chat'), story, dependencies: { materials, model: { async request(request) { calls.push(request); return request.task === 'plan'
    ? { intentions: [{ personId: 'p1', action: '检查本地清单', activityId: 'missing-activity' }, { action: '无归属' }, { personId: 'missing', action: '身份不明' }, null] }
    : { activities: [{ key: 'check', title: '检查清单', participantIds: ['p1'] }], events: [], knowledge: [] }; } } } });
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[1].input.intentions.map(item => item.personId), ['p1']);
  assert.equal(calls[1].input.intentions[0].activityId, null);
  assert.match(result.report.message, /格式或归属无法确认/);
  assert.match(result.report.message, /行动意图 1 位/);
});

test('an existing activity description alone is not adopted or counted as progress', async () => {
  const old = createEmptyState('chat');
  old.activities = [{ id: 'a1', title: '交付', description: '权威概况', status: 'active', participantIds: ['p1'], sources: [] }];
  await assert.rejects(advanceBatch({ people, state: old, story, dependencies: { materials, model: { async request(request) {
    if (request.task === 'plan') return { intentions: [{ personId: 'p1', action: '继续交付' }] };
    return { activities: [{ id: 'a1', description: '本轮的新进展' }], events: [], knowledge: [] };
  } } } }), /旧活动进展缺少结果记录，尚未保存；可重新推进/);
  assert.equal(old.processedThroughSeq, null);
});

test('a description-only existing activity is omitted while a separate valid status change is preserved', async () => {
  const old = createEmptyState('chat');
  old.activities = [
    { id: 'a1', title: '交付', description: '权威概况', status: 'active', participantIds: ['p1'], sources: [] },
    { id: 'a2', title: '复核', description: '原概况', status: 'waiting', participantIds: ['p1'], sources: [] },
  ];
  const result = await advanceBatch({ people, state: old, story, dependencies: { materials, model: { async request({ task }) {
    return task === 'plan' ? { intentions: [{ personId: 'p1', action: '继续两项工作' }] } : {
      activities: [{ id: 'a1', description: '不保存的进展' }, { id: 'a2', status: 'active' }], events: [], knowledge: [],
    };
  } } } });
  assert.equal(result.state.activities.find(item => item.id === 'a1').description, '权威概况');
  assert.equal(result.state.activities.find(item => item.id === 'a2').status, 'active');
  assert.match(result.report.message, /更新 1 项活动/);
  assert.match(result.report.message, /1 项旧活动进展未作为结果记录，已略过/);
  assert.doesNotMatch(result.report.message, /格式或归属无法确认/);
});

test('an unchanged existing activity is a normal zero-update result with no format warning', async () => {
  const old = createEmptyState('chat');
  old.activities = [{ id: 'a1', title: '等待许可', description: '等待确认后继续', status: 'waiting', participantIds: ['p1'], sources: [] }];
  const result = await advanceBatch({ people, state: old, story, dependencies: { materials, model: { async request({ task }) {
    return task === 'plan' ? { intentions: [{ personId: 'p1', action: '保持等待许可状态' }] } : {
      activities: [{ id: 'a1', title: '等待许可', status: 'waiting' }], events: [], knowledge: [],
    };
  } } } });
  assert.match(result.report.message, /更新 0 项活动/);
  assert.doesNotMatch(result.report.message, /格式或归属无法确认|旧活动进展未作为结果记录/);
  assert.equal(result.state.processedThroughSeq, 20);
});

test('unknown-only explicit selection fails instead of consuming the body; an empty selection is a one-call quiet turn', async () => {
  let calls = 0; const model = { async request({ task }) { calls++; return task === 'plan' ? { personIds: ['unknown'], activityIds: [] } : { activities: [], events: [], knowledge: [] }; } };
  await assert.rejects(advanceBatch({ people, state: createEmptyState('chat'), story, dependencies: { model, materials } }), /无法确认|未在/);
  assert.equal(calls, 1);
  calls = 0;
  const quiet = await advanceBatch({ people, state: createEmptyState('chat'), story, dependencies: { model: { async request({ task }) { calls++; return task === 'plan' ? { personIds: [], activityIds: [], storyTime: '下周' } : {}; } }, materials } });
  assert.equal(calls, 1); assert.equal(quiet.state.processedThroughSeq, 20); assert.equal(quiet.state.storyTime.text, '下周');
});

test('start mode gives the plan each person’s world context and general QQJ material, then preserves it when focused recall is empty', async () => {
  const old = createEmptyState('chat');
  old.storyTime = { text: '当前时点', source };
  old.activities = [{ id: 'a1', title: '场外待办', description: '准备交付', status: 'active', participantIds: ['p2'], sources: [] }];
  old.events = [{ id: 'e1', activityId: 'a1', title: '私事', description: 'p2独自整理材料', storyTime: null, participantIds: ['p2'], sources: [] },
    ...Array.from({ length: 24 }, (_, index) => ({ id: `p1-${index}`, activityId: null, title: '其他人物经历', description: '不得变成p2的经历', storyTime: null, participantIds: ['p1'], sources: [] }))];
  old.knowledge = [{ personId: 'p2', eventId: 'e1', reason: '本人经历', sources: [] }];
  const reads = []; const calls = [];
  const general = people.map(person => ({ personId: person.id, profileText: '', stateText: `general-${person.id}`, memoryText: '', refs: [], sources: [] }));
  const result = await advanceBatch({ people, state: old, story, mode: 'start', dependencies: {
    materials: { async readForQuestion(input) { reads.push(input); return reads.length === 1
      ? { status: 'ready', message: '', routerText: '', materials: general, coverage: { partial: false, cseStatus: 'ready' } }
      : { status: 'empty', message: '', routerText: '', materials: [], coverage: { partial: false, cseStatus: 'ready' } }; } },
    model: { async request(request) { calls.push(request); return request.task === 'plan'
      ? { personIds: ['p2'], activityIds: ['a1'], question: '继续待办', storyTime: '未来时间' }
      : { activities: [], events: [], knowledge: [] }; } },
  } });
  assert.equal(reads.length, 2); assert.equal(reads[0].question, '');
  assert.equal(calls.length, 2);
  assert.equal(calls[0].input.personContexts.find(item => item.personId === 'p2').activityIds[0], 'a1');
  assert.equal(calls[0].input.contextEvents.find(item => item.id === 'e1').description, 'p2独自整理材料');
  assert.ok(calls[1].input.relevantEvents.some(item => item.id === 'e1'));
  assert.equal(Object.hasOwn(calls[1].input, 'contextEvents'), false);
  assert.ok(!calls[1].input.relevantEvents.some(item => item.id === 'p1-23'));
  assert.equal(calls[1].input.materials.find(item => item.personId === 'p2').stateText, 'general-p2');
  assert.equal(calls[1].input.relevantKnowledge[0].personId, 'p2');
  assert.equal(result.state.storyTime.text, '当前时点');
  assert.equal(result.state.events.length, 25);
});

test('unprofiled people can act with a world fact without inheriting its knowledge, and the advance event catalog is single-copy', async () => {
  const old = createEmptyState('chat');
  old.events = [
    { id: 'world-weather', activityId: null, title: '道路封闭', description: '暴雨使北桥无法通行', storyTime: null, participantIds: [], sources: [] },
    { id: 'private-p1', activityId: null, title: '私下消息', description: '只有p1收到', storyTime: null, participantIds: ['p1'], sources: [] },
  ];
  const requests = []; const reads = [];
  const result = await advanceBatch({ people, state: old, story, dependencies: {
    materials: { async readForQuestion(request) { reads.push(request); return { status: 'empty', message: '', routerText: '', materials: [], coverage: { partial: false, cseStatus: 'ready' } }; } },
    model: { async request(request) {
      requests.push(request);
      if (request.task === 'plan') {
        assert.ok(request.input.contextEvents.some(event => event.id === 'world-weather'));
        assert.ok(request.input.personContexts.find(context => context.personId === 'p2').knownEvents.length === 0);
        assert.deepEqual(request.input.worldEventIds, ['world-weather']);
        return { personIds: ['p2'], activityIds: [], question: '避開封橋' };
      }
      assert.ok(request.input.relevantEvents.some(event => event.id === 'world-weather'));
      assert.ok(!Object.hasOwn(request.input, 'contextEvents'));
      assert.ok(!request.input.relevantKnowledge.some(item => item.eventId === 'world-weather'));
      return { activities: [{ key: 'reroute', title: '改走南路', description: '暴雨封橋後調整路線', participantIds: ['p2'], status: 'active' }], events: [], knowledge: [] };
    } },
  } });
  assert.equal(reads.length, 2); assert.equal(reads[0].question, '');
  assert.equal(requests.length, 2);
  assert.equal(requests[1].input.relevantEvents.filter(event => event.id === 'world-weather').length, 1);
  assert.equal(requests[1].input.relevantEvents.some(event => event.id === 'private-p1'), false);
  assert.equal(result.state.activities[0].participantIds[0], 'p2');
});

test('an explicitly referenced stored event remains the same fact and is not appended twice', async () => {
  const old = createEmptyState('chat');
  old.events = [{ id: 'stored-event', activityId: null, title: '旧结果', description: '原文不可覆盖', storyTime: null, participantIds: ['p1'], sources: [] }];
  old.activities = [{ id: 'a1', title: '活動', description: 'current', status: 'active', participantIds: ['p1'], sources: [] }];
  const result = await advanceBatch({ people, state: old, story, dependencies: { materials, model: { async request({ task }) {
    return task === 'plan' ? { personIds: ['p1'], activityIds: ['a1'] } : {
      activities: [], events: [
        { id: 'stored-event', key: 'old', activityId: 'a1', title: '改写结果', description: '不应写回', participantIds: ['p1'] },
        { id: 'not-stored', key: 'unknown', activityId: 'a1', title: '不能猜作新事实', description: '缺少可确认引用', participantIds: ['p1'] },
      ],
      knowledge: [{ personId: 'p2', eventId: 'old', reason: '确认已知' }, { personId: 'p1', eventId: 'unknown', reason: '无效事件不可引用' }],
    };
  } } } });
  assert.equal(result.state.events.length, 1);
  assert.equal(result.state.events[0].description, '原文不可覆盖');
  assert.ok(result.state.knowledge.some(item => item.personId === 'p2' && item.eventId === 'stored-event'));
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
  const omitted = await run({ activities: [{ id: 'a1', title: '继续交付' }], events: [], knowledge: [] });
  assert.equal(omitted.state.activities[0].title, '继续交付');
  assert.deepEqual(omitted.state.activities[0].participantIds, ['p1', 'p2']);
});

test('non-empty batches with no adoptable item fail without advancing the sequence', async () => {
  let calls = 0;
  const old = createEmptyState('chat');
  await assert.rejects(advanceBatch({ people, state: old, story, dependencies: { materials, model: { async request({ task }) {
    calls++;
    return task === 'plan' ? { personIds: ['p1'], activityIds: [] } : { activities: [null], events: [{ title: '没有活动归属', activityId: 'missing' }], knowledge: [] };
  } } } }), /未能读取或关联|尚未保存/);
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
  await assert.rejects(advanceBatch({ people, state: createEmptyState('chat'), story, dependencies: { materials, model: { async request({ task }) { return task === 'plan' ? { personIds: ['p1'], activityIds: [] } : { activities: [], events: '无法识别', knowledge: [] }; } } } }), /尚未保存/);
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

test('historical joint window brings an interaction partner with past evidence, shares one result and reads no current QQJ', async () => {
 const third = { ...people[0],id:'p3',displayName:'唐禾' }; const all = [...people,third]; const calls=[]; let reads=0;
 const window={id:'w',kind:'elapsed',from:{id:'b1',text:'早些时候',sourceSeqs:[1]},to:{id:'b2',text:'随后',sourceSeqs:[20]},throughSeq:20};
 const basis={backgrounds:[{personId:'p2',text:'当时正在值班',eventIds:[],sourceSeqs:[1]}],activities:[],knowledge:[]};
 const output=await advanceBatch({people:all,state:createEmptyState('chat'),story,window,basis,authorConstraints:{events:[],turns:story.turns},inputCharacters:12000,dependencies:{materials:{async readForQuestion(){reads++;throw Error('不得读取现在资料');}},model:{async request(req){calls.push(req);return req.task==='plan'?{intentions:[{personId:'p1',action:'向值班同事询问',interactionPersonIds:['p2']},{personId:'p2',waitReason:'值班'},{personId:'p3',action:'整理花园'}]}:{activities:[{key:'talk',title:'询问',participantIds:['p1','p2'],status:'completed'},{key:'garden',title:'花园事务',participantIds:['p3'],status:'active'}],events:[{key:'joint',activityId:'talk',title:'交流完成',participantIds:['p1','p2'],continuingForPersonIds:['p1'],activityChange:{status:'completed'}}],knowledge:[{personId:'p1',eventId:'joint',reason:'亲自交流'},{personId:'p2',eventId:'joint',reason:'亲自交流'}]};}}}});
 assert.equal(reads,0);assert.equal(calls.length,2);assert.deepEqual(calls[1].input.selectedPeople.map(p=>p.id),['p1','p2','p3']);assert.equal(calls[1].input.pastBackgrounds[0].text,'当时正在值班');assert.equal(output.state.events.length,1);assert.equal(output.state.events[0].simulationWindowId,'w');assert.equal(output.state.events[0].storyTime.text,'早些时候 → 随后');assert.equal(output.state.knowledge[0].eventId,output.state.knowledge[1].eventId);
});
test('whole-window input budget stops before a model request and never drops a person', async()=>{let calls=0;await assert.rejects(advanceBatch({people,state:createEmptyState('chat'),story,inputCharacters:100,dependencies:{materials,model:{async request(){calls++;return {};}}}}),/字符预算/);assert.equal(calls,0);});

test('normal plan identifies sourced elapsed story time in the same two-call path; an ungrounded endpoint cannot fabricate elapsed time', async()=>{
 const window={id:'normal',kind:'current',from:{id:'old-end',text:'上午',sourceSeqs:[1]},to:{id:'old-end',text:'上午',sourceSeqs:[1]},throughSeq:20};let calls=0;
 const result=await advanceBatch({people,state:createEmptyState('chat'),story,window,dependencies:{materials,model:{async request(req){calls++;assert.equal(req.task,'plan');return{windowEnd:{text:'当天傍晚',sourceSeqs:[20],elapsed:true},intentions:people.map(p=>({personId:p.id,waitReason:'等待'}))};}}}});
 assert.equal(calls,1);assert.equal(result.window.kind,'elapsed');assert.equal(result.window.from.text,'上午');assert.equal(result.window.to.text,'当天傍晚');
 const unknown=await advanceBatch({people,state:createEmptyState('chat'),story,window,dependencies:{materials,model:{async request(){return{windowEnd:{text:'凭空明天',sourceSeqs:[999],elapsed:true},intentions:people.map(p=>({personId:p.id,waitReason:'等待'}))};}}}});assert.equal(unknown.window.kind,'current');
});

test('normal multi-floor model input exposes each actual one-based source sequence for same-call time and calibration citations',async()=>{let seen;await advanceBatch({people,state:createEmptyState('chat'),story:{...story,turns:[{seq:7,text:'稍早正文',isUser:false},{seq:13,text:'随后正文',isUser:false}]},dependencies:{materials,model:{async request(req){seen=req.input;return{intentions:people.map(p=>({personId:p.id,waitReason:'等待'}))};}}}});assert.match(seen.story,/7[^\n]*稍早正文/);assert.match(seen.story,/13[^\n]*随后正文/);});

test('the production requester decodes the supported snake-case interaction alias before joint selection',async()=>{const {createModelRequester}=await server.ssrLoadModule('/src/models/client.ts');let batch;const profile={url:'https://fixture.invalid',key:'offline',model:'offline'};const model=createModelRequester({primary:profile,secondary:profile},{async generate(_p,messages,maxTokens){if(maxTokens===4096)return{intentions:[{personId:'P1',action:'与同事交流',interaction_person_ids:['P2']},{personId:'P2',waitReason:'等候交流'}]};batch=JSON.parse(messages[1].content);return{activities:[{key:'a',title:'交流',participantIds:['P1','P2']}],events:[{activityId:'a',title:'共同交流',participantIds:['P1','P2']}],knowledge:[]};}});const result=await advanceBatch({people,state:createEmptyState('s'),story,dependencies:{model,materials}});assert.deepEqual(batch.selectedPeople.map(p=>p.id),['P1','P2']);assert.deepEqual(result.state.events[0].participantIds,['p1','p2']);});

test('single-object calibration rows survive the real plan parser and preserve manual current content with a readable notice',async()=>{const state=createEmptyState('chat');state.activities=[{id:'a',title:'人工事项',description:'人工概况',status:'active',participantIds:['p1'],sources:[{kind:'manual',id:'m',label:'人工'}]}];const result=await advanceBatch({people,state,story,dependencies:{materials,model:{async request(){return{intentions:{personId:'p1',waitReason:'等待'},calibration:{facts:{key:'fact',title:'正文事实',participantIds:['p1'],sourceSeqs:[20]},activityUpdates:{id:'a',change:{description:'模型概况'},sourceSeqs:[20]},eventCorrections:[],knowledgeCorrections:[]}};}}}});assert.equal(result.state.activities[0].description,'人工概况');assert.equal(result.state.events[0].sources[0].id,'history-floor:20');assert.match(result.report.message,/保留人工/);});
test('ordinary events preserve only explicit changes and never repeat a newly declared activity snapshot',async()=>{const window={id:'w',kind:'current',from:{id:'b',text:'当前',sourceSeqs:[20]},to:{id:'b',text:'当前',sourceSeqs:[20]},throughSeq:20};const result=await advanceBatch({people,state:createEmptyState('chat'),story,window,dependencies:{materials,model:{async request(r){return r.task==='plan'?{intentions:[{personId:'p1',action:'整理材料'}]}:{activities:[{key:'task',title:'整理材料',description:'稍后已收好',status:'completed',participantIds:['p1']}],events:[{key:'first',activityId:'task',title:'先检查',participantIds:['p1'],activityChange:{title:'整理材料',description:'开始检查',status:'active',participantIds:['p1']}},{key:'second',activityId:'task',title:'后收好',participantIds:['p1']}],knowledge:[]};}}}});assert.equal(result.state.events[0].activityChange.description,'开始检查');assert.equal(result.state.events[1].activityChange,undefined);});
