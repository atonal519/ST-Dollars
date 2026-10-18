import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';

let server; let createPeopleWorld; let createEmptyState; let advanceBatch; let createStoryInputReader;
test.before(async () => {
  server = await createServer({ configFile: false, server: { middlewareMode: true, hmr: false }, appType: 'custom' });
  ({ createPeopleWorld } = await server.ssrLoadModule('/src/application/people-world.ts'));
  ({ createEmptyState } = await server.ssrLoadModule('/src/domain/world-state.ts'));
  ({ advanceBatch } = await server.ssrLoadModule('/src/simulation/advance.ts'));
  ({ createStoryInputReader } = await server.ssrLoadModule('/src/host/story-input.ts'));
});
test.after(async () => { await server?.close(); });

const person = { id: 'p1', displayName: 'Mira', aliases: [], description: '长外部档案，不应写入百面相。', source: { kind: 'plugin', id: 'p1', label: '千千结资料' } };

test('refresh preserves own activities and a successful advance publishes one scoped CAS snapshot', async () => {
  let stored = null; let revision = 0; let saves = 0; let advances = 0;
  const state = createEmptyState('chat-1');
  const app = createPeopleWorld({
    directory: { readPeople: () => ({ status: 'ready', message: '已读取。', scopeId: 'chat-1', people: [person] }) },
    repository: {
      async load() { return stored ? { state: stored, revision } : null; },
      async save(scope, next, expected) { assert.equal(scope, 'chat-1'); assert.equal(expected, stored ? revision : null); saves++; stored = next; revision++; return { state: next, revision }; },
    },
    story: { readStoryInput: () => ({ status: 'ready', message: 'ready', throughSeq: 9, turns: [{ seq: 9, text: '她完成交付。', isUser: false }], source: { kind: 'chat', id: 'story', label: '当前正文' } }) },
    config: { async getProfiles() { return { primary: { url: 'x', model: 'p', key: 'secret' }, secondary: { url: 'x', model: 's', key: 'secret' }, secondaryFollowsPrimary: false }; } },
    createModelRequester: () => ({ async request() { return {}; } }),
    materials: { async readForQuestion() { return { status: 'empty', message: 'empty', routerText: '', materials: [], coverage: { partial: false, cseStatus: 'ready' } }; } },
    advancer: { async advance({ state: current }) { advances++; return { state: { ...current, processedThroughSeq: 9, activities: [{ id: 'a1', title: '交付工作', status: 'completed', description: '已完成。', participantIds: ['p1'], sources: [] }] }, report: { message: '推进完成。', modelCalls: 2, materialReads: 2, throughSeq: 9 } }; } },
  });
  await app.refresh();
  assert.equal(app.state.value.world.people[0].status, '尚无活动记录');
  await app.advanceToCurrent();
  assert.equal(saves, 1); assert.equal(advances, 1);
  assert.equal(app.state.value.world.activities[0].title, '交付工作');
  assert.equal(app.state.value.world.people[0].description, person.description);
  await app.refresh();
  assert.equal(app.state.value.world.activities.length, 1);
  assert.equal(app.state.value.processedThroughSeq, 9);
});

test('no new completed story does not call models or write the world', async () => {
  let saves = 0; let models = 0;
  const app = createPeopleWorld({
    directory: { readPeople: () => ({ status: 'ready', message: '', scopeId: 'chat', people: [person] }) },
    repository: { async load() { return null; }, async save() { saves++; throw new Error('unexpected'); } },
    story: { readStoryInput: () => ({ status: 'empty', message: '没有新的正文。', throughSeq: null, turns: [], source: { kind: 'chat', id: 'story', label: '当前正文' } }) },
    config: { async getProfiles() { models++; throw new Error('unexpected'); } }, createModelRequester: () => ({ async request() { models++; return {}; } }),
    materials: { async readForQuestion() { models++; throw new Error('unexpected'); } }, advancer: { async advance() { models++; throw new Error('unexpected'); } },
  });
  await app.refresh(); await app.advanceToCurrent();
  assert.equal(saves, 0); assert.equal(models, 0); assert.match(app.state.value.report.message, /没有新的正文/);
});

test('a user floor beside draft-only AI does not call models, write state, or consume progress', async () => {
  let saves = 0; let models = 0;
  const original = { ...createEmptyState('chat'), processedThroughSeq: 1 };
  const story = createStoryInputReader({ getContext: () => ({ chat: [
    { mes: '已处理正文', is_user: false },
    { mes: '后续 user 消息', is_user: true },
    { mes: '<content>[DRAFT]仅剩草稿[/DRAFT]</content>', is_user: false },
  ] }) });
  const app = createPeopleWorld({
    directory: { readPeople: () => ({ status: 'ready', message: '', scopeId: 'chat', people: [person] }) },
    repository: { async load() { return { state: original, revision: 3 }; }, async save() { saves++; throw new Error('unexpected save'); } },
    story,
    config: { async getProfiles() { models++; throw new Error('unexpected model'); } },
    createModelRequester: () => ({ async request() { models++; throw new Error('unexpected model'); } }),
    materials: { async readForQuestion() { models++; throw new Error('unexpected read'); } },
    advancer: { async advance() { models++; throw new Error('unexpected advance'); } },
  });
  await app.refresh(); await app.advanceToCurrent();
  assert.equal(models, 0);
  assert.equal(saves, 0);
  assert.equal(app.state.value.processedThroughSeq, 1);
  assert.match(app.state.value.report.message, /尚无新的|没有新的|没有可读取/);
});

test('model, parse, and revision failures never publish a partially advanced world', async () => {
  for (const failure of ['model', 'parse', 'revision']) {
    const original = { ...createEmptyState('chat-1'), processedThroughSeq: 1, activities: [{ id: 'a1', title: '原活动', status: 'waiting', description: '保留现状', participantIds: ['p1'], sources: [] }] };
    let saves = 0;
    const app = createPeopleWorld({
      directory: { readPeople: () => ({ status: 'ready', message: '', scopeId: 'chat-1', people: [person] }) },
      repository: { async load() { return { state: original, revision: 4 }; }, async save() { saves++; if (failure === 'revision') throw Object.assign(new Error('数据已被其他更新修改，请重新读取后再推进。'), { status: 409 }); throw new Error('unexpected save'); } },
      story: { readStoryInput: () => ({ status: 'ready', message: '', throughSeq: 2, turns: [{ seq: 2, text: '发生新事。', isUser: false }], source: { kind: 'chat', id: 'story', label: '当前正文' } }) },
      config: { async getProfiles() { return { primary: { url: 'x', model: 'p', key: 'k' }, secondary: { url: 'x', model: 's', key: 'k' }, secondaryFollowsPrimary: false }; } },
      createModelRequester: () => ({ async request() { if (failure === 'model') throw new Error('模型调用失败。'); return '无法解析的模型返回'; } }),
      materials: { async readForQuestion() { return { status: 'empty', message: '', routerText: '', materials: [], coverage: { partial: false, cseStatus: 'ready' } }; } },
      advancer: failure === 'revision'
        ? { async advance() { return { state: { ...original, processedThroughSeq: 2, activities: [{ ...original.activities[0], status: 'completed' }] }, report: { message: '完成', modelCalls: 2, materialReads: 2, throughSeq: 2 } }; } }
        : { advance: advanceBatch },
    });
    await app.refresh(); await app.advanceToCurrent();
    assert.equal(app.state.value.world.activities[0].description, '保留现状');
    assert.equal(app.state.value.processedThroughSeq, 1);
    assert.equal(saves, failure === 'revision' ? 1 : 0);
    assert.ok(app.state.value.error);
  }
});

test('an unadoptable non-empty batch does not save or consume the story floor and can be retried', async () => {
  let saves = 0; let modelCalls = 0;
  const app = createPeopleWorld({
    directory: { readPeople: () => ({ status: 'ready', message: '', scopeId: 'chat-1', people: [person] }) },
    repository: { async load() { return null; }, async save() { saves++; throw new Error('unexpected save'); } },
    story: { readStoryInput: () => ({ status: 'ready', message: '', throughSeq: 9, turns: [{ seq: 9, text: '她完成交付。', isUser: false }], source: { kind: 'chat', id: 'story', label: '当前正文' } }) },
    config: { async getProfiles() { return { primary: { url: 'x', model: 'p', key: 'secret' }, secondary: { url: 'x', model: 's', key: 'secret' }, secondaryFollowsPrimary: false }; } },
    createModelRequester: () => ({ async request({ task }) { modelCalls++; return task === 'plan' ? { personIds: ['p1'], activityIds: [] } : { activities: [null], events: [], knowledge: [] }; } }),
    materials: { async readForQuestion() { return { status: 'ready', message: '', routerText: '', materials: [], coverage: { partial: false, cseStatus: 'ready' } }; } },
    advancer: { advance: advanceBatch },
  });
  await app.refresh(); await app.advanceToCurrent();
  assert.match(app.state.value.error, /尚未记录本段/);
  assert.equal(app.state.value.processedThroughSeq, null);
  await app.advanceToCurrent();
  assert.equal(modelCalls, 4);
  assert.equal(saves, 0);
  assert.equal(app.state.value.processedThroughSeq, null);
});

test('the production story reader sends one cleaned body to both material reads and both model phases, then publishes once', async () => {
  const chat = [{ mes: 'older history not read on first advance', is_user: false }, { mes: '<date>2026-10-17</date><content>正式正文。 [DRAFT]审核草稿不得出现。[/DRAFT] 正式正文后续。<!-- QQJ-start 18:00 --></content>作者评论不得出现。', is_user: false }];
  const story = createStoryInputReader({ getContext: () => ({ chat }) });
  const modelCalls = []; const materialReads = []; let saves = 0; let stored = null;
  const app = createPeopleWorld({
    directory: { readPeople: () => ({ status: 'ready', message: '', scopeId: 'chat-story', people: [person] }) },
    repository: { async load() { return stored ? { state: stored, revision: 1 } : null; }, async save(scope, state, expectedRevision) { assert.equal(scope, 'chat-story'); assert.equal(expectedRevision, null); saves++; stored = state; return { state, revision: 1 }; } },
    story,
    config: { async getProfiles() { return { primary: { url: 'x', model: 'p', key: 'k' }, secondary: { url: 'x', model: 's', key: 'k' }, secondaryFollowsPrimary: false }; } },
    createModelRequester: () => ({ async request(request) { modelCalls.push(request); return request.task === 'plan' ? { personIds: ['p1'], activityIds: [], question: '继续' } : { activities: [], events: [], knowledge: [] }; } }),
    materials: { async readForQuestion(request) { materialReads.push(request); return { status: 'empty', message: '', routerText: '', materials: [], coverage: { partial: false, cseStatus: 'ready' } }; } },
    advancer: { advance: advanceBatch },
  });
  await app.refresh(); await app.advanceToCurrent();
  assert.equal(modelCalls.length, 2);
  assert.equal(materialReads.length, 2);
  const inputs = [materialReads[0].question, modelCalls[0].input.story, materialReads[1].question, modelCalls[1].input.story];
  assert.match(materialReads[0].question, /正式正文/); assert.match(modelCalls[0].input.story, /正式正文/); assert.match(modelCalls[1].input.story, /正式正文/);
  for (const input of inputs) assert.doesNotMatch(input, /审核草稿|作者评论不得出现/);
  assert.equal(saves, 1);
  assert.equal(app.state.value.processedThroughSeq, 2);
});
