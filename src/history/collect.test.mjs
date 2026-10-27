import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';
let server; let collectHistory; let createEmptyState; let createModelRequester;
test.before(async () => { server = await createServer({ configFile: false, server: { middlewareMode: true, hmr: false }, appType: 'custom' }); ({ collectHistory } = await server.ssrLoadModule('/src/history/collect.ts')); ({ createEmptyState } = await server.ssrLoadModule('/src/domain/world-state.ts')); ({ createModelRequester } = await server.ssrLoadModule('/src/models/client.ts')); });
test.after(async () => { await server?.close(); });
const person = { id: 'p1', displayName: '人物甲', aliases: [], description: '', source: { kind: 'plugin', id: 'p1', label: '' } };
const materials = { async readForQuestion() { this.calls++; return { status: 'ready', message: '', routerText: '', materials: [], coverage: { partial: false, cseStatus: 'ready' } }; }, calls: 0 };

test('uses one QQJ read and exactly one primary history request per character batch', async () => {
  materials.calls = 0; const requests = [];
  const result = await collectHistory({ people: [person], baseline: createEmptyState('chat'), turns: [{ seq: 1, text: 'a'.repeat(12001), isUser: false }], materials, model: { async request(value) { value.onStarted?.(); requests.push(value); return { activities: [], events: [], knowledge: [] }; } } });
  assert.equal(result.batches, 2); assert.equal(result.modelCalls, 2); assert.equal(materials.calls, 1); assert.ok(requests.every(request => request.task === 'history'));
});

test('stops after an incomplete second batch or a user cancellation between requests', async () => {
  materials.calls = 0; let calls = 0;
  await assert.rejects(() => collectHistory({ people: [person], baseline: createEmptyState('chat'), turns: [{ seq: 1, text: 'a'.repeat(24001), isUser: false }], materials, model: { async request(request) { request.onStarted?.(); calls++; if (calls === 2) throw new Error('429'); return { activities: [], events: [], knowledge: [] }; } } }), error => error.message === '429' && error.failedBatch === 2 && error.modelCalls === 2);
  assert.equal(calls, 2); assert.equal(materials.calls, 1);
  materials.calls = 0; calls = 0; let stop = false;
  await assert.rejects(() => collectHistory({ people: [person], baseline: createEmptyState('chat'), turns: [{ seq: 1, text: 'a'.repeat(24001), isUser: false }], materials, model: { async request(request) { request.onStarted?.(); calls++; return { activities: [], events: [], knowledge: [] }; } }, shouldStop: () => stop, onProgress(progress) { if (progress.completed === 1) stop = true; } }), /已取消/);
  assert.equal(calls, 1); assert.equal(materials.calls, 1);
});

test('reports a second-batch response parse failure with its batch number and request count', async () => {
  materials.calls = 0; let calls = 0;
  await assert.rejects(() => collectHistory({ people: [person], baseline: createEmptyState('chat'), turns: [{ seq: 1, text: 'a'.repeat(24001), isUser: false }], materials, model: { async request(request) { request.onStarted?.();
    calls++;
    return calls === 1 ? { activities: [], events: [], knowledge: [] } : '{"events":[{"title":"内层"}], broken: true}';
  } } }), error => error.failedBatch === 2 && error.modelCalls === 2 && /无法解析/.test(error.message));
  assert.equal(calls, 2);
  assert.equal(materials.calls, 1);
});

test('history model codes restore through the real collector and a missing participant quote', async () => {
  const officialId = 'qqj-chat-c/person-"complex"'; let requestInput;
  const requester = createModelRequester({ primary: { url: 'https://model', model: 'main', key: 'key' }, secondary: { url: 'https://model', model: 'small', key: 'key' } }, { async generate(_profile, messages, _tokens, _signal, onStarted) {
    onStarted?.();
    requestInput = JSON.parse(messages[1].content);
    return '{"activities":[{"key":"P1","title":"P1仍是正文","participantIds":["P1\n  ],"sourceSeqs":[4]}],"events":[{"activityId":"P1","title":"已完成","participantIds":["P1"],"sourceSeqs":[4]}],"knowledge":[]}';
  } });
  const result = await collectHistory({ people: [{ ...person, id: officialId }], baseline: createEmptyState('chat'), turns: [{ seq: 4, text: '已完成约定', isUser: false }], materials, model: requester });
  assert.equal(requestInput.people[0].id, 'P1');
  assert.equal(result.modelCalls, 1);
  assert.deepEqual(result.state.activities[0].participantIds, [officialId]);
  assert.equal(result.state.activities[0].title, 'P1仍是正文');
  assert.equal(result.state.events[0].activityId, result.state.activities[0].id);
  assert.deepEqual(result.state.events[0].participantIds, [officialId]);
});

test('cancellation requested while the final model request is in flight does not produce a candidate', async () => {
  materials.calls = 0; let stop = false; let calls = 0;
  await assert.rejects(() => collectHistory({ people: [person], baseline: createEmptyState('chat'), turns: [{ seq: 1, text: '短正文', isUser: false }], materials, model: { async request(request) { request.onStarted?.(); calls++; stop = true; return { activities: [], events: [], knowledge: [] }; } }, shouldStop: () => stop }), error => error.cancelled === true && error.modelCalls === 1);
  assert.equal(calls, 1); assert.equal(materials.calls, 1);
});
