import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';

let server;
let createQQJQuestionMaterialReader;
let encodeQQJPersonId;
test.before(async () => {
  server = await createServer({ configFile: false, server: { middlewareMode: true, hmr: false }, appType: 'custom' });
  ({ createQQJQuestionMaterialReader, encodeQQJPersonId } = await server.ssrLoadModule('/src/sources/qqj-context.ts'));
});
test.after(async () => { await server?.close(); });

const identity = { hostChatId: 'host-chat', qqjChatId: 'qqj-chat' };
function makeBridge(result, calls = { readContext: [] }) {
  const bridge = {
    schemaVersion: 1,
    kind: 'qqj-public-memory-bridge',
    async readContext(input) { calls.readContext.push(input); return structuredClone(result); },
  };
  return { getGlobals: () => ({ qqj_v3_public_bridge_v1: bridge }), calls };
}
const actorA = {
  entityId: 'a', profileText: '', stateText: '核心 / 本人私密状态：A的状态',
  memoryText: '本人私密想法（AI #3；记忆 m3）：A私藏了钥匙',
  refs: [{ floorIds: ['floor-3'], memoryId: 'm3' }],
};
const actorB = {
  entityId: 'b', profileText: '', stateText: '核心 / 本人私密状态：B的状态', memoryText: '', refs: [],
};
const response = overrides => ({
  status: 'ready', identity, routerText: '[作者侧背景] 摘要', actors: [actorB, actorA],
  coverage: { partial: true, cseStatus: 'ready', selectedCharacters: 70, maxCharacters: 120 },
  ...overrides,
});

test('maps stable person IDs to one batched readContext call and keeps same-name actor materials separate', async () => {
  const env = makeBridge(response());
  const reader = createQQJQuestionMaterialReader(env);
  const a = encodeQQJPersonId('qqj-chat', 'a');
  const b = encodeQQJPersonId('qqj-chat', 'b');
  const result = await reader.readForQuestion({ question: '谁拿着钥匙？', personIds: [a, b], maxCharacters: 12000 });
  assert.deepEqual(env.calls.readContext, [{ query: '谁拿着钥匙？', entityIds: ['a', 'b'], maxCharacters: 12000 }]);
  assert.equal(result.status, 'ready');
  assert.equal(result.routerText, '[作者侧背景] 摘要');
  assert.deepEqual(result.materials.map(item => item.personId), [a, b]);
  assert.match(result.materials[0].memoryText, /A私藏了钥匙/);
  assert.doesNotMatch(result.materials[1].memoryText + result.materials[1].stateText, /A私藏了钥匙|A的状态/);
  assert.match(result.materials[1].stateText, /B的状态/);
  assert.deepEqual(result.materials[0].refs, [{ memoryId: 'm3', floorIds: ['floor-3'] }]);
  assert.deepEqual(result.materials[0].sources, [{ kind: 'plugin', id: 'qqj-context:["qqj-chat","m3"]', label: '千千结相关经历（1 个来源楼）' }]);
  assert.deepEqual(result.coverage, { partial: true, cseStatus: 'ready' });
});

test('preserves profile, state, and memory separately, including unprofiled actors and missing CSE readiness', async () => {
  const env = makeBridge(response({ actors: [{ ...actorA, profileText: '年龄：31' }], coverage: { partial: false, cseStatus: 'not-ready' } }));
  const reader = createQQJQuestionMaterialReader(env);
  const id = encodeQQJPersonId('qqj-chat', 'a');
  const result = await reader.readForQuestion({ question: '', personIds: [id], maxCharacters: 12000 });
  assert.equal(result.materials[0].profileText, '年龄：31');
  assert.equal(result.materials[0].stateText, actorA.stateText);
  assert.equal(result.materials[0].memoryText, actorA.memoryText);
  assert.equal(result.coverage.cseStatus, 'not-ready');
  assert.match(result.message, /状态资料尚未准备好/);
});

test('distinguishes successful empty materials, waiting and bridge failures', async () => {
  const read = async result => createQQJQuestionMaterialReader(makeBridge(result)).readForQuestion({ question: '', personIds: [encodeQQJPersonId('qqj-chat', 'a')], maxCharacters: 12000 });
  const unavailable = await createQQJQuestionMaterialReader({ getGlobals: () => ({}) }).readForQuestion({ question: '', personIds: [encodeQQJPersonId('qqj-chat', 'a')], maxCharacters: 12000 });
  const empty = await read(response({ routerText: '', actors: [{ entityId: 'a', profileText: '', stateText: '', memoryText: '', refs: [] }], coverage: { partial: false, cseStatus: 'ready' } }));
  const waiting = await read({ status: 'not-ready', message: '千千结尚未准备好。', identity, actors: [], routerText: '', coverage: {} });
  const disabled = await read({ status: 'disabled', message: '千千结当前已关闭。', identity, actors: [], routerText: '', coverage: {} });
  const error = await read({ status: 'error', message: '读取失败。', identity, actors: [], routerText: '', coverage: {} });
  assert.equal(unavailable.status, 'unavailable');
  assert.equal(empty.status, 'empty');
  assert.match(empty.message, /没有可读取的状态或相关经历/);
  assert.equal(waiting.status, 'waiting');
  assert.match(waiting.message, /尚未准备好/);
  assert.equal(disabled.status, 'unavailable');
  assert.equal(error.status, 'error');
  assert.match(error.message, /读取失败/);
});

test('reports profile-only and router-only results without claiming there are personal memories', async () => {
  const read = async result => createQQJQuestionMaterialReader(makeBridge(result)).readForQuestion({ question: '', personIds: [encodeQQJPersonId('qqj-chat', 'a')], maxCharacters: 12000 });
  const actor = { entityId: 'a', profileText: '仍有档案字段', stateText: '', memoryText: '', refs: [] };
  const profileOnly = await read(response({ routerText: '', actors: [actor] }));
  const routerOnly = await read(response({ actors: [{ ...actor, profileText: '' }] }));
  assert.equal(profileOnly.status, 'ready');
  assert.match(profileOnly.message, /有档案资料，但没有可读取的当前状态或相关经历/);
  assert.equal(routerOnly.status, 'ready');
  assert.match(routerOnly.message, /已读取作者侧背景，但没有返回所选人物的状态或相关经历/);
  assert.match(routerOnly.routerText, /作者侧背景/);
  assert.equal(routerOnly.materials[0].stateText, '');
});

test('rejects identity mismatch and requests over the public 100-person limit without calling QQJ', async () => {
  const env = makeBridge(response({ identity: { ...identity, qqjChatId: 'another-chat' } }));
  const reader = createQQJQuestionMaterialReader(env);
  const one = encodeQQJPersonId('qqj-chat', 'a');
  const mismatch = await reader.readForQuestion({ question: '', personIds: [one], maxCharacters: 12000 });
  assert.equal(mismatch.status, 'error');
  assert.equal(env.calls.readContext.length, 1);
  const tooMany = await reader.readForQuestion({ question: '', personIds: Array.from({ length: 101 }, (_, index) => encodeQQJPersonId('qqj-chat', `p${index}`)), maxCharacters: 12000 });
  assert.equal(tooMany.status, 'error');
  assert.match(tooMany.message, /一次最多读取100人/);
  assert.equal(env.calls.readContext.length, 1);
});

test('does not guess malformed IDs, missing actors, or missing actor identity', async () => {
  const env = makeBridge(response({ routerText: '', actors: [{ profileText: '', stateText: 'unknown', memoryText: '', refs: [] }] }));
  const reader = createQQJQuestionMaterialReader(env);
  const malformed = await reader.readForQuestion({ question: '', personIds: ['not-an-qqj-id'], maxCharacters: 12000 });
  assert.equal(malformed.status, 'error');
  assert.equal(env.calls.readContext.length, 0);
  const missing = await reader.readForQuestion({ question: '', personIds: [encodeQQJPersonId('qqj-chat', 'a')], maxCharacters: 12000 });
  assert.equal(missing.status, 'empty');
  assert.match(missing.message, /部分所选人物没有返回可确认的资料/);
  assert.doesNotMatch(missing.message, /person-a|entity-a/);
  assert.equal(missing.materials.length, 0);
});

test('omits duplicate actor results instead of choosing an ambiguous version', async () => {
  const env = makeBridge(response({ actors: [actorA, { ...actorA, stateText: 'conflicting duplicate' }, actorB] }));
  const reader = createQQJQuestionMaterialReader(env);
  const result = await reader.readForQuestion({
    question: '',
    personIds: [encodeQQJPersonId('qqj-chat', 'a'), encodeQQJPersonId('qqj-chat', 'b')],
    maxCharacters: 12000,
  });
  assert.deepEqual(result.materials.map(material => material.personId), [encodeQQJPersonId('qqj-chat', 'b')]);
  assert.equal(result.coverage.partial, true);
  assert.match(result.message, /重复且归属不明确/);
});
