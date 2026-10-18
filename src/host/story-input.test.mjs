import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';

let server; let createStoryInputReader;
test.before(async () => { server = await createServer({ configFile: false, server: { middlewareMode: true, hmr: false }, appType: 'custom' }); ({ createStoryInputReader } = await server.ssrLoadModule('/src/host/story-input.ts')); });
test.after(async () => { await server?.close(); });

test('native ST starts at the latest completed selected swipe and later reads only new turns through a completed AI floor', () => {
  const ctx = { chat: [
    { mes: 'system prompt must not be used', is_system: true },
    { mes: 'ignored older text', is_user: false },
    { mes: 'user content', is_user: true, send_date: '2020-01-01' },
    { mes: 'selected swipe', swipes: ['old swipe', 'selected swipe'], swipe_id: 1, is_user: false, send_date: '2020-01-02' },
    { mes: 'unfinished user', is_user: true, send_date: '2099-01-01' },
  ] };
  const reader = createStoryInputReader({ getContext: () => ctx });
  const first = reader.readStoryInput({ afterSeq: null });
  assert.equal(first.status, 'ready'); assert.deepEqual(first.turns.map(item => item.text), ['selected swipe']); assert.equal(first.throughSeq, 4);
  ctx.chat.push({ mes: 'new completed AI', is_user: false, send_date: '1900-01-01' });
  const later = reader.readStoryInput({ afterSeq: 4 });
  assert.deepEqual(later.turns.map(item => [item.seq, item.isUser]), [[5, true], [6, false]]);
  assert.equal(later.throughSeq, 6);
  assert.match(later.turns.map(item => item.text).join(' '), /unfinished user/);
});

test('Luker uses its cooked plugin floors and reports no completed body as empty', () => {
  let args; const floors = [
    { seq: 7, mesCooked: '加工后的用户正文', is_user: true },
    { seq: 8, mesCooked: '加工后的AI正文', is_user: false },
  ];
  const chat = [...Array.from({ length: 6 }, () => ({ is_user: false, mes: '旧楼' })), { is_user: true, mes: '用户' }, { is_user: false, mes: 'AI' }];
  const reader = createStoryInputReader({ getContext: () => ({ chat, readPluginFloors(input) { args = input; return floors.filter(floor => floor.seq >= input.fromSeq && floor.seq <= input.toSeq); } }) });
  const value = reader.readStoryInput({ afterSeq: 6 });
  assert.deepEqual(args, { fromSeq: 7, toSeq: 8, roles: ['user', 'assistant'] });
  assert.deepEqual(value.turns.map(item => item.text), ['加工后的用户正文', '加工后的AI正文']);
  const empty = createStoryInputReader({ getContext: () => ({ chat: [{ mes: '等回应', is_user: true }] }) }).readStoryInput({ afterSeq: null });
  assert.equal(empty.status, 'empty'); assert.equal(empty.throughSeq, null);

  chat.push({ mes: '用户补充', is_user: true }, { mes: '新AI正文', is_user: false }, { mes: '<content>[DRAFT]仅有草稿[/DRAFT]</content>', is_user: false }, { mes: 'AI之后的用户消息', is_user: true });
  floors.push({ seq: 9, mesCooked: '加工后的用户补充', is_user: true }, { seq: 10, mesCooked: '后续有效AI正文', is_user: false }, { seq: 11, mesCooked: '<content>[DRAFT]仅有草稿[/DRAFT]</content>', is_user: false }, { seq: 12, mesCooked: 'AI之后的用户消息', is_user: true });
  const later = reader.readStoryInput({ afterSeq: 6 });
  assert.deepEqual(args, { fromSeq: 7, toSeq: 10, roles: ['user', 'assistant'] });
  assert.equal(later.throughSeq, 10);
  assert.deepEqual(later.turns.map(turn => [turn.seq, turn.isUser]), [[7, true], [8, false], [9, true], [10, false]]);
  assert.doesNotMatch(later.turns.map(turn => turn.text).join('\n'), /仅有草稿|AI之后的用户消息/);
});

test('native ST cleans assistant draft blocks and keeps one formal content body with its prefixed clock', () => {
  const wrapped = '<date>2026-10-17</date><time>18:20</time><weekday>Saturday</weekday><!-- QQJ-start 2026-10-17T18:20 --><content>正式剧情。 [DRAFT]第一份草稿。[/DRAFT]\n[DRAFT]第二份草稿。[/DRAFT]正式剧情继续。<!-- QQJ-end 2026-10-17T18:20 --></content><date>2099-01-01</date>外围作者评论。';
  const reader = createStoryInputReader({ getContext: () => ({ chat: [{ mes: wrapped, is_user: false }] }) });
  const value = reader.readStoryInput({ afterSeq: null });
  assert.equal(value.status, 'ready');
  const story = value.turns[0].text;
  assert.match(story, /故事时间参考/);
  assert.match(story, /<date>2026-10-17<\/date>/);
  assert.match(story, /<time>18:20<\/time>/);
  assert.match(story, /<weekday>Saturday<\/weekday>/);
  assert.match(story, /<!-- QQJ-start 2026-10-17T18:20 -->/);
  assert.match(story, /正式剧情。/);
  assert.match(story, /正式剧情继续。/);
  assert.doesNotMatch(story, /第一份草稿|第二份草稿|2099-01-01|外围作者评论/);
});

test('a draft-only latest floor is empty, preserves afterSeq, and later ranges stop at their last valid AI body', () => {
  const ctx = { chat: [
    { mes: '已消费的旧正文', is_user: false },
    { mes: 'user message', is_user: true },
    { mes: '<content>[DRAFT]仅有草稿[/DRAFT]</content>', is_user: false },
  ] };
  const reader = createStoryInputReader({ getContext: () => ctx });
  const first = reader.readStoryInput({ afterSeq: null });
  assert.equal(first.status, 'empty');
  assert.equal(first.throughSeq, null);
  const empty = reader.readStoryInput({ afterSeq: 1 });
  assert.equal(empty.status, 'empty');
  assert.equal(empty.throughSeq, 1);
  assert.deepEqual(empty.turns, []);

  const timeOnly = createStoryInputReader({ getContext: () => ({ chat: [
    { mes: 'already handled', is_user: false },
    { mes: '<PreStatus><date>2026-10-17</date><time>18:20</time></PreStatus>', is_user: false },
  ] }) }).readStoryInput({ afterSeq: 1 });
  assert.equal(timeOnly.status, 'empty');
  assert.equal(timeOnly.throughSeq, 1);

  ctx.chat.push(
    { mes: 'user before new AI', is_user: true },
    { mes: '<date>2026-10-17</date><content>有效的新正文。</content>', is_user: false },
    { mes: '<content>[DRAFT]之后的草稿楼[/DRAFT]</content>', is_user: false },
    { mes: 'user after the final valid AI', is_user: true },
  );
  const later = reader.readStoryInput({ afterSeq: 1 });
  assert.equal(later.status, 'ready');
  assert.equal(later.throughSeq, 5);
  assert.deepEqual(later.turns.map(turn => [turn.seq, turn.isUser]), [[2, true], [4, true], [5, false]]);
  assert.deepEqual(later.turns.map(turn => turn.text), ['user message', 'user before new AI', '故事时间参考：<date>2026-10-17</date>\n\n有效的新正文。']);
});

test('user floors are left unchanged while Luker cooked floors use the same assistant cleaner', () => {
  const wrapped = '<date>2026-10-17</date><content>Luker正式剧情。[DRAFT]Luker草稿[/DRAFT]</content>作者评论。';
  let args;
  const reader = createStoryInputReader({ getContext: () => ({
    chat: [{ mes: 'user text <content>原样保留</content> [DRAFT]用户文本[/DRAFT]', is_user: true }, { mes: wrapped, is_user: false }],
    readPluginFloors(input) { args = input; return [
      { seq: 1, mesCooked: 'user text <content>原样保留</content> [DRAFT]用户文本[/DRAFT]', is_user: true },
      { seq: 2, mesCooked: wrapped, is_user: false },
    ]; },
  }) });
  const value = reader.readStoryInput({ afterSeq: null });
  assert.deepEqual(args, { fromSeq: 2, toSeq: 2, roles: ['user', 'assistant'] });
  assert.equal(value.turns[0].text, '故事时间参考：<date>2026-10-17</date>\n\nLuker正式剧情。');

  const later = reader.readStoryInput({ afterSeq: 0 });
  assert.equal(later.turns[0].text, 'user text <content>原样保留</content> [DRAFT]用户文本[/DRAFT]');
  assert.doesNotMatch(later.turns[1].text, /Luker草稿|作者评论/);
});
