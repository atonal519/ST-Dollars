import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';
let server; let extractJson; let parsePlan;
test.before(async () => { server = await createServer({ configFile: false, server: { middlewareMode: true, hmr: false }, appType: 'custom' }); ({ extractJson } = await server.ssrLoadModule('/src/simulation/json.ts')); ({ parsePlan } = await server.ssrLoadModule('/src/simulation/parse.ts')); });
test.after(async () => { await server?.close(); });

test('extracts wrapped and fenced model JSON while preserving commas inside strings', () => {
  const value = extractJson('模型说明：```json\n{"description":"逗号,右括号}，继续","items":["a",],}\n``` 完成');
  assert.deepEqual(value, { description: '逗号,右括号}，继续', items: ['a'] });
});

test('does not accept an inner array from a malformed outer answer', () => {
  assert.throws(() => extractJson('{"events":[{"title":"可疑片段"}], broken: true}'), /无法解析/);
});

test('plan parser keeps explicitly attributed actions and wait reasons while counting invalid entries', () => {
  const parsed = parsePlan({ result: { intentions: [
    { personId: 'p1', action: '整理交付材料', activityId: 'a1' },
    { personId: 'p2', wait_reason: '等待许可' },
    { action: '不猜归属' }, { personId: 'unknown', waitReason: '未知人物' }, null,
  ], question: '', storyTime: null } });
  assert.deepEqual(parsed.intentions, [
    { personId: 'p1', action: '整理交付材料', waitReason: '', activityId: 'a1' },
    { personId: 'p2', action: '', waitReason: '等待许可', activityId: null },
    { personId: 'unknown', action: '', waitReason: '未知人物', activityId: null },
  ]);
  assert.equal(parsed.invalidSelectionCount, 2);
  assert.equal(parsed.question, '');
});

test('plan parser retains the legacy explicit selection format', () => {
  const parsed = parsePlan({ personIds: ['p1'], activityIds: [], question: '旧格式' });
  assert.equal(parsed.legacy, true);
  assert.deepEqual(parsed.personIds, ['p1']);
  assert.deepEqual(parsed.activityIds, []);
});

test('plan parser accepts a single explicitly attributed intention object alias', () => {
  const parsed = parsePlan({ intent: { personId: 'p1', intent: '查看任务条件' } });
  assert.deepEqual(parsed.intentions, [{ personId: 'p1', action: '查看任务条件', waitReason: '', activityId: null }]);
});
