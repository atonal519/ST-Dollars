import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';

let server;
let createQQJPeopleReader;
test.before(async () => {
  server = await createServer({ configFile: false, server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom' });
  ({ createQQJPeopleReader } = await server.ssrLoadModule('/src/sources/qqj-people.ts'));
});
test.after(async () => { await server?.close(); });

const bridgeFor = (snapshot, calls = { snapshot: 0, status: 0 }) => ({
  bridge: {
    schemaVersion: 1,
    kind: 'qqj-public-memory-bridge',
    getStatus() { calls.status += 1; throw new Error('must not read status first'); },
    getPeopleSnapshot() { calls.snapshot += 1; return snapshot; },
  },
  calls,
});
const identity = qqjChatId => ({ qqjChatId, hostChatId: 'host-chat' });
const item = (entityId, displayName, options = {}) => ({
  entityId, displayName, entityDisplayName: displayName, aliases: options.aliases ?? [],
  selected: options.selected ?? false, profiled: options.profile !== null,
  profile: options.profile ?? null,
});
const readySnapshot = (qqjChatId, items, peopleStatus = 'ready') => ({
  status: 'ready', identity: identity(qqjChatId),
  people: { status: peopleStatus, revision: 7, items },
});

test('reads once and keeps same-name entities and unselected unprofiled people by stable source IDs', () => {
  const first = item('entity-1', 'River', { aliases: ['River', 'Riv'], profile: { name: 'River', age: '29', background: 'Lives near the coast.' } });
  const second = item('entity-2', 'River', { profile: null });
  const original = structuredClone([first, second]);
  const { bridge, calls } = bridgeFor(readySnapshot('chat-uuid-1', [first, second]));
  const reader = createQQJPeopleReader({ getGlobals: () => ({ qqj_v3_public_bridge_v1: bridge }) });
  const result = reader.readPeople();
  assert.equal(calls.snapshot, 1);
  assert.equal(calls.status, 0);
  assert.equal(result.status, 'ready');
  assert.equal(result.people.length, 2);
  assert.deepEqual(result.people.map(person => person.id), [
    `qqj:${JSON.stringify(['chat-uuid-1', 'entity-1'])}`,
    `qqj:${JSON.stringify(['chat-uuid-1', 'entity-2'])}`,
  ]);
  assert.equal(result.people[0].displayName, 'River');
  assert.match(result.people[0].description, /年龄：29/);
  assert.doesNotMatch(result.people[0].description, /Lives near the coast/);
  assert.match(result.people[0].description, /别名：Riv/);
  assert.match(result.people[1].description, /尚无档案正文/);
  assert.equal(result.people[0].source.id, result.people[0].id);
  assert.equal(result.people[0].source.label, '千千结人物档案');
  assert.deepEqual([first, second], original);
});

test('keeps the no-profile explanation when a directory person has aliases', () => {
  const { bridge } = bridgeFor(readySnapshot('chat-uuid-1', [item('entity-3', 'Ash', { aliases: ['Aster'], profile: null })]));
  const person = createQQJPeopleReader({ getGlobals: () => ({ qqj_v3_public_bridge_v1: bridge }) }).readPeople().people[0];
  assert.match(person.description, /别名：Aster/);
  assert.match(person.description, /尚无档案正文/);
});

test('reads identity fields from the same loaded profile without exposing unrelated profile sections', () => {
  const profile = { name: 'River', occupation: ' 教师 ', socialIdentity: '社区志愿者', organization: '第二中学', identityRelations: '林青的同事\n周宁的老师', background: '完整背景保留给既有消费者', appearance: '外貌资料', nsfw: '其他档案资料' };
  const snapshot = readySnapshot('chat-uuid-1', [item('npc-1', 'River', { selected: false, profile }), item('npc-2', 'Ash', { profile: null })]);
  const original = structuredClone(snapshot);
  const { bridge, calls } = bridgeFor(snapshot);
  const result = createQQJPeopleReader({ getGlobals: () => ({ qqj_v3_public_bridge_v1: bridge }) }).readPeople();
  assert.equal(calls.snapshot, 1);
  assert.equal(result.people[0].identityDescription, '职业：教师\n身份：社区志愿者\n所属组织：第二中学\n重要关系：林青的同事\n周宁的老师');
  assert.equal(result.people[1].identityDescription, undefined);
  assert.equal(result.people[0].description, '身份\n职业：教师\n所属组织：第二中学\n社会身份：社区志愿者\n重要身份关系：林青的同事\n周宁的老师');
  assert.deepEqual(snapshot, original);
});

test('does not conflate one entity ID across different QQJ chat identities', () => {
  const get = chatId => {
    const { bridge } = bridgeFor(readySnapshot(chatId, [item('entity-1', 'River', { profile: null })]));
    return createQQJPeopleReader({ getGlobals: () => ({ qqj_v3_public_bridge_v1: bridge }) }).readPeople().people[0].id;
  };
  assert.notEqual(get('chat-a'), get('chat-b'));
});

test('keeps loaded items while QQJ people status is processing', () => {
  const { bridge } = bridgeFor(readySnapshot('chat-uuid-1', [item('entity-1', 'River', { profile: null })], 'savingProfile'));
  const result = createQQJPeopleReader({ getGlobals: () => ({ qqj_v3_public_bridge_v1: bridge }) }).readPeople();
  assert.equal(result.status, 'ready');
  assert.equal(result.people.length, 1);
  assert.match(result.message, /正在处理/);
});

test('distinguishes normal waiting and ready-empty states', () => {
  const waitingBridge = bridgeFor(readySnapshot('chat-uuid-1', [], 'idle')).bridge;
  const emptyBridge = bridgeFor(readySnapshot('chat-uuid-1', [], 'ready')).bridge;
  const read = bridge => createQQJPeopleReader({ getGlobals: () => ({ qqj_v3_public_bridge_v1: bridge }) }).readPeople();
  assert.equal(read(waitingBridge).status, 'waiting');
  assert.equal(read(waitingBridge).scopeId, 'chat-uuid-1');
  const unconfirmed = bridgeFor({status:'not-ready',identity:{qqjChatId:'unconfirmed'},people:{status:'idle',items:[]}}).bridge;
  assert.equal(read(unconfirmed).scopeId, null);
  assert.equal(read(emptyBridge).status, 'empty');
});

test('reports unavailable bridge and explicit disabled status', () => {
  const unavailable = createQQJPeopleReader({ getGlobals: () => ({}) }).readPeople();
  const disabled = bridgeFor({ status: 'disabled', message: '千千结当前已关闭。', people: { status: 'disabled', items: [] } }).bridge;
  const disabledResult = createQQJPeopleReader({ getGlobals: () => ({ qqj_v3_public_bridge_v1: disabled }) }).readPeople();
  assert.equal(unavailable.status, 'unavailable');
  assert.equal(disabledResult.status, 'unavailable');
});

test('reports bridge and invocation failures without inventing people', () => {
  const failed = { schemaVersion: 1, kind: 'qqj-public-memory-bridge', getPeopleSnapshot: () => ({ status: 'error', message: '人物分区失败。' }) };
  const thrown = { schemaVersion: 1, kind: 'qqj-public-memory-bridge', getPeopleSnapshot() { throw new Error('读取失败'); } };
  const read = bridge => createQQJPeopleReader({ getGlobals: () => ({ qqj_v3_public_bridge_v1: bridge }) }).readPeople();
  assert.equal(read(failed).status, 'error');
  assert.equal(read(failed).people.length, 0);
  assert.equal(read(thrown).status, 'error');
});
test('preserves the public user role without excluding ordinary NPC directory entries',()=>{const entries=[{...item('user-1','林青',{profile:null}),specialRole:'user'},{...item('npc-1','周宁',{profile:null}),specialRole:null}];const {bridge}=bridgeFor(readySnapshot('chat',entries));const result=createQQJPeopleReader({getGlobals:()=>({qqj_v3_public_bridge_v1:bridge})}).readPeople();assert.equal(result.people.length,2);assert.equal(result.people[0].specialRole,'user');assert.equal(result.people[1].specialRole,undefined);});
test('structured display and classification sources come from the same public profile, not occupation or relationship guesses',()=>{
 const profile={name:'River',occupation:'教师',socialIdentity:'志愿者',organization:'学校',personality:'温和而敏感',conduct:'先倾听再决定',expression:'言简意赅',identityRelations:'Ash是River的学生',background:'长年住在海边'};
 const {bridge,calls}=bridgeFor(readySnapshot('chat',[item('p','River',{profile})]));const p=createQQJPeopleReader({getGlobals:()=>({qqj_v3_public_bridge_v1:bridge})}).readPeople().people[0];
 assert.equal(calls.snapshot,1);assert.equal(p.identitySummary,'职业：教师\n身份：志愿者\n所属组织：学校');assert.equal(p.presentationSource.relations,profile.identityRelations);assert.match(p.presentationSource.personality,/温和而敏感/);assert.doesNotMatch(p.presentationSource.personality,/教师|志愿者|学生/);assert.equal('profileDetails' in p,false);assert.doesNotMatch(p.description,/长年住在海边/);assert.match(p.description,/Ash是River的学生/);
});
