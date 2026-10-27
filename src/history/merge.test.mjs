import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';
let server; let mergeHistoryBatch;
test.before(async () => { server = await createServer({ configFile: false, server: { middlewareMode: true, hmr: false }, appType: 'custom' }); ({ mergeHistoryBatch } = await server.ssrLoadModule('/src/history/merge.ts')); });
test.after(async () => { await server?.close(); });

test('adds sourced history events while preserving baseline object identity and resolves cross-batch activity updates', () => {
  const baseline = { schemaVersion: 1, scopeId: 'x', storyTime: null, processedThroughSeq: 1, historyRanges: [], activities: [{ id: 'base-a', title: 'existing', status: 'active', description: '', participantIds: ['p1'], sources: [] }], events: [], knowledge: [] };
  const first = mergeHistoryBatch({ baseline, candidate: baseline, batch: [{ seq: 2, text: '她答应去', isUser: false }], response: { result: { activities: [{ key: 'a', title: '赴约', status: 'planned', participantIds: ['p1'], sourceSeqs: [2] }], events: [{ key: 'e', activityId: 'a', title: '答应赴约', participantIds: ['p1'], sourceSeqs: ['2'] }], knowledge: [] } }, people: [{ id: 'p1' }] });
  const second = mergeHistoryBatch({ baseline, candidate: first.state, batch: [{ seq: 3, text: '后来赴约完成', isUser: false }], response: { activities: [{ id: first.activityKeys.get('a'), title: '赴约', status: 'completed', participantIds: ['p1'], sourceSeqs: [3] }], events: [{ activityId: 'base-a', title: '独立事件', participantIds: ['p1'], sourceSeqs: [3] }], knowledge: [] }, people: [{ id: 'p1' }] });
  assert.equal(second.state.activities[0], baseline.activities[0]);
  assert.equal(second.state.activities[1].status, 'completed');
  assert.equal(second.state.activities[1].sources.length, 2);
  assert.equal(second.state.events.length, 2);
  assert.equal(second.skipped, 0);
});

test('accepts JSON wrappers and single-object aliases, retains usable items, and rejects an entirely unconfirmed batch', () => {
  const baseline = { schemaVersion: 1, scopeId: 'x', storyTime: null, processedThroughSeq: null, activities: [], events: [], knowledge: [] };
  const partial = mergeHistoryBatch({ baseline, candidate: baseline, batch: [{ seq: 4, text: '公开了消息', isUser: false }], response: '整理结果：```json\n{"data":{"plans":{"key":"p","name":"调查","status":"planned","people":["p1"],"floorIds":["4"]},"results":[{"title":"独立消息","activityId":null,"personIds":["p1"],"sourceSeqs":[4]},{"title":"无来源事件","personIds":["p1"]}],"knowledges":[]}}\n```', people: [{ id: 'p1' }] });
  assert.equal(partial.state.activities.length, 1);
  assert.equal(partial.state.events.length, 1);
  assert.equal(partial.state.events[0].activityId, null);
  assert.equal(partial.skipped, 1);
  assert.equal(partial.partial, true);
  assert.throws(() => mergeHistoryBatch({ baseline, candidate: baseline, batch: [{ seq: 4, text: '正文', isUser: false }], response: {}, people: [{ id: 'p1' }] }), /缺少.*字段/);
  assert.throws(() => mergeHistoryBatch({ baseline, candidate: baseline, batch: [{ seq: 4, text: '事实', isUser: false }], response: { events: [{ title: '猜测', activityId: 'unknown', participantIds: ['unknown'], sourceSeqs: [99] }], activities: [], knowledge: [] }, people: [{ id: 'p1' }] }), /无法确认/);
});

test('duplicate keys do not create guessed links and echoed existing event IDs are references only', () => {
  const existing = { id: 'event-1', activityId: null, title: '已记录', description: '', storyTime: null, participantIds: ['p1'], sources: [] };
  const baseline = { schemaVersion: 1, scopeId: 'x', storyTime: null, processedThroughSeq: null, activities: [], events: [existing], knowledge: [] };
  const result = mergeHistoryBatch({ baseline, candidate: baseline, batch: [{ seq: 7, text: '再次提到', isUser: false }], response: { activities: [{ key: 'same', title: '一', participantIds: ['p1'], sourceSeqs: [7] }, { key: 'same', title: '二', participantIds: ['p1'], sourceSeqs: [7] }], events: [{ id: 'event-1', key: 'echo', title: '忽略覆盖', sourceSeqs: [7], participantIds: ['p1'] }, { key: 'new-event', activityId: 'same', title: '关系不确定', participantIds: ['p1'], sourceSeqs: [7] }], knowledge: [] }, people: [{ id: 'p1' }] });
  assert.equal(result.state.events.length, 1);
  assert.equal(result.state.events[0], existing);
  assert.equal(result.state.activities.length, 2);
  assert.equal(result.state.events[0].title, '已记录');
});

test('repeated baseline knowledge is preserved as the exact existing object and new history knowledge accumulates separately', () => {
  const oldKnowledge = { personId: 'p1', eventId: 'base-event', reason: '旧人工说明', sources: [{ kind: 'manual', id: 'hand', label: '人工' }] };
  const baseline = { schemaVersion: 1, scopeId: 'x', storyTime: null, processedThroughSeq: 2, activities: [], events: [{ id: 'base-event', activityId: null, title: '既有事件', description: '', storyTime: null, participantIds: ['p1'], sources: [] }], knowledge: [oldKnowledge] };
  const candidate = { ...baseline, events: [...baseline.events, { id: 'new-event', activityId: null, title: '新事件', description: '', storyTime: null, participantIds: ['p1'], sources: [] }], knowledge: [...baseline.knowledge, { personId: 'p1', eventId: 'new-event', reason: '第一批知情', sources: [{ kind: 'chat', id: 'old-floor', label: '旧来源' }] }] };
  const result = mergeHistoryBatch({ baseline, candidate, batch: [{ seq: 3, text: '继续提及', isUser: false }], response: { activities: [], events: [], knowledge: [{ personId: 'p1', eventId: 'base-event', reason: '不应改baseline', sourceSeqs: [3] }, { personId: 'p1', eventId: 'new-event', reason: '新知情', sourceSeqs: [3] }] }, people: [{ id: 'p1' }] });
  assert.equal(result.state.knowledge[0], oldKnowledge);
  assert.deepEqual(result.state.knowledge[0].sources, oldKnowledge.sources);
  assert.deepEqual(result.state.knowledge[1].sources.map(source => source.id), ['old-floor', 'history-floor:3']);
});

test('maps explicit local activity and event IDs to assigned IDs for same-batch links and knowledge', () => {
  const baseline = { schemaVersion: 1, scopeId: 'x', storyTime: null, processedThroughSeq: null, activities: [], events: [], knowledge: [] };
  const result = mergeHistoryBatch({ baseline, candidate: baseline, batch: [{ seq: 10, text: '两人合作并获知消息', isUser: false }], response: { activities: [{ id: 'local-a', title: '合作', status: 'active', participantIds: ['p1', 'p2'], sourceSeqs: [10] }], events: [{ id: 'local-e', title: '合作完成', activityId: 'local-a', participantIds: ['p1'], sourceSeqs: [10] }], knowledge: [{ personId: 'p2', eventId: 'local-e', reason: '对方告知', sourceSeqs: [10] }] }, people: [{ id: 'p1' }, { id: 'p2' }] });
  assert.equal(result.state.activities.length, 1);
  assert.notEqual(result.state.activities[0].id, 'local-a');
  assert.equal(result.state.events.length, 1);
  assert.notEqual(result.state.events[0].id, 'local-e');
  assert.equal(result.state.events[0].activityId, result.state.activities[0].id);
  assert.equal(result.state.knowledge[0].eventId, result.state.events[0].id);
});

test('cross-batch history activity updates retain prior participants in order without duplicates', () => {
  const baseline = { schemaVersion: 1, scopeId: 'x', storyTime: null, processedThroughSeq: null, activities: [], events: [], knowledge: [] };
  const first = mergeHistoryBatch({ baseline, candidate: baseline, batch: [{ seq: 1, text: '甲乙共同参加', isUser: false }], response: { activities: [{ key: 'join', title: '共同活动', status: 'active', participantIds: ['p1', 'p2'], sourceSeqs: [1] }], events: [], knowledge: [] }, people: [{ id: 'p1' }, { id: 'p2' }] });
  const activity = first.state.activities[0];
  const second = mergeHistoryBatch({ baseline, candidate: first.state, batch: [{ seq: 2, text: '甲继续完成', isUser: false }], response: { activities: [{ id: activity.id, title: '共同活动', status: 'completed', participantIds: ['p1', 'p1'], sourceSeqs: [2] }], events: [], knowledge: [] }, people: [{ id: 'p1' }, { id: 'p2' }] });
  assert.deepEqual(second.state.activities[0].participantIds, ['p1', 'p2']);
  assert.equal(second.state.activities[0].status, 'completed');
  assert.deepEqual(second.state.activities[0].sources.map(source => source.id), ['history-floor:1', 'history-floor:2']);
});

test('story time requires an explicit source floor and an unprovable time cannot alone cover a batch', () => {
  const baseline = { schemaVersion: 1, scopeId: 'x', storyTime: null, processedThroughSeq: null, activities: [], events: [], knowledge: [] };
  const batch = [{ seq: 3, text: '今天', isUser: false }, { seq: 4, text: '之后', isUser: false }];
  const accepted = mergeHistoryBatch({ baseline, candidate: baseline, batch, response: { activities: [], events: [], knowledge: [], storyTime: '当晚', timeSourceSeqs: ['3'] }, people: [] });
  assert.equal(accepted.state.storyTime.text, '当晚');
  assert.equal(accepted.state.storyTime.source.id, 'history-floor:3');
  const partial = mergeHistoryBatch({ baseline, candidate: baseline, batch, response: { activities: [{ title: '真实活动', participantIds: ['p1'], sourceSeqs: [4] }], events: [], knowledge: [], storyTime: '无来源时间' }, people: [{ id: 'p1' }] });
  assert.equal(partial.state.storyTime, null);
  assert.equal(partial.partial, true);
  assert.throws(() => mergeHistoryBatch({ baseline, candidate: baseline, batch, response: { activities: [], events: [], knowledge: [], storyTime: '无来源时间' }, people: [] }), /无法确认/);
});

test('accepts a world-level event only with an explicit worldLevel marker', () => {
  const baseline = { schemaVersion: 1, scopeId: 'x', storyTime: null, processedThroughSeq: null, activities: [], events: [], knowledge: [] };
  const input = { baseline, candidate: baseline, batch: [{ seq: 5, text: '世界级公告', isUser: false }], people: [] };
  const event = { title: '面向世界的公告', activityId: null, participantIds: [], sourceSeqs: [5], worldLevel: true };
  const result = mergeHistoryBatch({ ...input, response: { activities: [], events: [event], knowledge: [] } });
  assert.equal(result.state.events.length, 1);
  assert.deepEqual(result.state.events[0].participantIds, []);
  assert.throws(() => mergeHistoryBatch({ ...input, response: { activities: [], events: [{ ...event, worldLevel: undefined }], knowledge: [] } }), /无法确认/);
});

test('ambiguous local id/key aliases do not link an event to either activity', () => {
  const baseline = { schemaVersion: 1, scopeId: 'x', storyTime: null, processedThroughSeq: null, activities: [], events: [], knowledge: [] };
  const result = mergeHistoryBatch({ baseline, candidate: baseline, batch: [{ seq: 6, text: '两项不同活动', isUser: false }], people: [{ id: 'p1' }], response: { activities: [{ id: 'same', title: '活动一', participantIds: ['p1'], sourceSeqs: [6] }, { key: 'same', title: '活动二', participantIds: ['p1'], sourceSeqs: [6] }], events: [{ title: '目标不明确', activityId: 'same', participantIds: ['p1'], sourceSeqs: [6] }], knowledge: [] } });
  assert.equal(result.state.activities.length, 2);
  assert.equal(result.state.events.length, 0);
  assert.ok(result.skipped > 0);
});

test('local aliases colliding with official IDs remain ambiguous while independent facts survive', () => {
  const baseActivity = { id: 'activity-one', title: '既有活动', status: 'active', description: '', participantIds: ['p1'], sources: [] };
  const baseEvent = { id: 'event-one', activityId: 'activity-one', title: '既有事件', description: '', storyTime: null, participantIds: ['p1'], sources: [] };
  const baseline = { schemaVersion: 1, scopeId: 'x', storyTime: null, processedThroughSeq: null, activities: [baseActivity], events: [baseEvent], knowledge: [] };
  const result = mergeHistoryBatch({ baseline, candidate: baseline, batch: [{ seq: 9, text: '新的历史事实', isUser: false }], people: [{ id: 'p1' }], response: {
    activities: [
      { key: 'activity-one', title: '局部别名撞既有 ID', participantIds: ['p1'], sourceSeqs: [9] },
      { key: 'independent-activity', title: '独立活动', participantIds: ['p1'], sourceSeqs: [9] },
    ],
    events: [
      { key: 'depends-on-collision', title: '关联无法确认', activityId: 'activity-one', participantIds: ['p1'], sourceSeqs: [9] },
      { key: 'event-one', title: '事件别名撞既有 ID', activityId: null, participantIds: ['p1'], sourceSeqs: [9] },
      { key: 'independent-event', title: '独立结果', activityId: null, participantIds: ['p1'], sourceSeqs: [9] },
    ],
    knowledge: [
      { personId: 'p1', eventId: 'event-one', reason: '目标不明确', sourceSeqs: [9] },
      { personId: 'p1', eventId: 'independent-event', reason: '明确获知独立结果', sourceSeqs: [9] },
    ],
  } });
  assert.equal(result.state.activities[0], baseActivity);
  assert.equal(result.state.events[0], baseEvent);
  assert.equal(result.state.activities.length, 3);
  assert.equal(result.state.events.length, 3);
  assert.equal(result.state.events[2].title, '独立结果');
  assert.deepEqual(result.state.knowledge.map(item => item.eventId), [result.state.events[2].id]);
  assert.ok(result.skipped > 0);
  assert.equal(result.partial, true);
});

test('an existing item key matching its own official ID remains a valid target for new relations', () => {
  const baseActivity = { id: 'activity-one', title: '既有活动', status: 'active', description: '', participantIds: ['p1'], sources: [] };
  const baseEvent = { id: 'event-one', activityId: 'activity-one', title: '既有事件', description: '', storyTime: null, participantIds: ['p1'], sources: [] };
  const baseline = { schemaVersion: 1, scopeId: 'x', storyTime: null, processedThroughSeq: null, activities: [baseActivity], events: [baseEvent], knowledge: [] };
  const result = mergeHistoryBatch({ baseline, candidate: baseline, batch: [{ seq: 11, text: '新的结果和知情', isUser: false }], people: [{ id: 'p1' }], response: {
    activities: [{ id: 'activity-one', key: 'activity-one', title: '沿用既有活动', participantIds: ['p1'], sourceSeqs: [11] }],
    events: [
      { id: 'event-one', key: 'event-one', title: '沿用既有事件', activityId: 'activity-one', participantIds: ['p1'], sourceSeqs: [11] },
      { key: 'new-event', title: '新结果', activityId: 'activity-one', participantIds: ['p1'], sourceSeqs: [11] },
    ],
    knowledge: [{ personId: 'p1', eventId: 'event-one', reason: '从结果中得知', sourceSeqs: [11] }],
  } });
  assert.equal(result.state.activities.length, 1);
  assert.equal(result.state.activities[0], baseActivity);
  assert.equal(result.state.events.length, 2);
  assert.equal(result.state.events[0], baseEvent);
  assert.equal(result.state.events[1].activityId, baseActivity.id);
  assert.deepEqual(result.state.knowledge.map(item => item.eventId), [baseEvent.id]);
  assert.equal(result.partial, false);
});
