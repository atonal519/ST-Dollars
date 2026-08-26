import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { computeVolume, hasNsfw, assignTiers } = require('./tier.js');

test('体量统计命中名字/别名', () => {
  const wb = [{ content: '伊泽尔是二皇子' }, { content: '西里尔·维克' }, { content: '二皇子的佩剑' }];
  assert.equal(computeVolume({ display_name: '伊泽尔', aliases: ['二皇子'] }, wb), '伊泽尔是二皇子'.length + '二皇子的佩剑'.length);
});
test('NSFW 只认专属条目（标题含 NSFW+角色名）', () => {
  const wb = [{ comment: 'NSFW-亚历克斯', content: '...' }, { comment: '角色_亚历山大', content: '亚历山大是宫廷侍卫' }];
  assert.equal(hasNsfw({ display_name: '亚历克斯' }, wb), true);
  assert.equal(hasNsfw({ display_name: '亚历山大' }, wb), false);
});
test('交叉提及不误判', () => {
  const wb = [{ comment: 'NSFW-伊泽尔', content: '伊泽尔和卡塔琳娜纠缠……性爱' }];
  assert.equal(hasNsfw({ display_name: '伊泽尔' }, wb), true);
  assert.equal(hasNsfw({ display_name: '卡塔琳娜' }, wb), false);
});
test('多人卡：体量相近靠专属 NSFW 分主/NPC', () => {
  const wb = [
    { comment: '角色_伊泽尔', content: '伊'.repeat(300) },
    { comment: 'NSFW-亚历克斯', content: '涩'.repeat(90) },
    { comment: '角色_亚历克斯', content: '亚历克斯' + '文'.repeat(86) },
    { comment: '角色_亚历山大', content: '亚历山大' + '文'.repeat(90) },
  ];
  const r = assignTiers([{ display_name: '伊泽尔' }, { display_name: '亚历克斯' }, { display_name: '亚历山大' }], wb, 'multi');
  assert.equal(r.find(c => c.display_name === '亚历克斯').tier, 'main');
  assert.equal(r.find(c => c.display_name === '亚历山大').tier, 'npc');
});
test('多人卡全卡无 NSFW → 纯体量', () => {
  const wb = [{ content: '甲甲'.repeat(50) }, { content: '乙乙' }];
  const r = assignTiers([{ display_name: '甲甲' }, { display_name: '乙乙' }], wb, 'multi');
  assert.equal(r.find(c => c.display_name === '甲甲').tier, 'main');
  assert.equal(r.find(c => c.display_name === '乙乙').tier, 'npc');
});
test('大世界卡：全部 main（忽略 NSFW/体量差）', () => {
  const wb = [{ comment: 'NSFW-A', content: '涩'.repeat(50) }, { comment: '角色_B', content: 'B' }];
  const r = assignTiers([{ display_name: 'A' }, { display_name: 'B' }], wb, 'bigworld');
  assert.ok(r.every(c => c.tier === 'main'));
});
