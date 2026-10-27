import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';
let server; let createStoryHistoryReader;
test.before(async () => { server = await createServer({ configFile: false, server: { middlewareMode: true, hmr: false }, appType: 'custom' }); ({ createStoryHistoryReader } = await server.ssrLoadModule('/src/host/story-history.ts')); });
test.after(async () => { await server?.close(); });

const hidden = { schemaVersion: 1, chatId: 'qqj-chat' };
test('native history includes only same-scope QQJ hidden floors and restores their original user role', () => {
  const chat = [
    { mes: '隐藏的旧助手正文', is_user: false, is_system: true, extra: { qianqianjieAutoHide: hidden } },
    { mes: '隐藏的旧用户正文', is_user: true, is_system: true, extra: { qianqianjieAutoHide: hidden } },
    { mes: '其他scope不可读', is_user: false, is_system: true, extra: { qianqianjieAutoHide: { ...hidden, chatId: 'other' } } },
    { mes: '真实system不可读', is_user: false, is_system: true, extra: { type: 'system' } },
    { mes: '当前完成AI正文', is_user: false },
  ];
  const result = createStoryHistoryReader({ getContext: () => ({ chat }) }).readStoryHistory({ fromSeq: 1, scopeId: 'qqj-chat' });
  assert.deepEqual(result.turns.map(turn => [turn.seq, turn.isUser, turn.text]), [[1, false, '隐藏的旧助手正文'], [2, true, '隐藏的旧用户正文'], [5, false, '当前完成AI正文']]);
  assert.equal(result.throughSeq, 5);
});

test('Luker requests system floors and checks each cooked floor against its raw matching chat floor', () => {
  let args;
  const chat = [{ mes: 'hidden cooked body', is_user: false, is_system: true, extra: { qianqianjieAutoHide: hidden } }, { mes: 'latest AI', is_user: false }];
  const result = createStoryHistoryReader({ getContext: () => ({ chat, readPluginFloors(input) { args = input; return [{ seq: 1, mesCooked: '<content>正式旧正文。[DRAFT]去除[/DRAFT]</content>', is_system: true }, { seq: 2, mesCooked: 'latest AI', is_user: false }]; } }) }).readStoryHistory({ fromSeq: 1, scopeId: 'qqj-chat' });
  assert.deepEqual(args, { fromSeq: 1, toSeq: 2, roles: ['user', 'assistant', 'system'] });
  assert.deepEqual(result.turns.map(turn => [turn.seq, turn.isUser, turn.text]), [[1, false, '正式旧正文。'], [2, false, 'latest AI']]);
});

for (const host of ['ST', 'Luker']) test(host + ' development reads the previous stable AI while history keeps the latest by default', () => {
  const chat = [{mes:'旧正式正文',is_user:false,is_system:true,extra:{qianqianjieAutoHide:hidden}}, {mes:'我的选择',is_user:true}, {mes:'稳定正文',is_user:false}, {mes:'最新仍可改写',is_user:false}];
  const context = {chat};
  if (host === 'Luker') context.readPluginFloors = ({fromSeq,toSeq}) => chat.slice(fromSeq-1,toSeq).map((m,i)=>({...m,seq:fromSeq+i,mesCooked:m.mes+'（cooked）'}));
  const reader=createStoryHistoryReader({getContext:()=>context});
  const result=reader.readStoryHistory({fromSeq:1,scopeId:'qqj-chat',stableOnly:true});
  assert.equal(result.throughSeq,3); assert.deepEqual(result.turns.map(t=>[t.seq,t.isUser]),[[1,false],[2,true],[3,false]]);
  assert.equal(reader.readStoryHistory({fromSeq:1,scopeId:'qqj-chat'}).throughSeq,4);
  chat[3].mes='同楼重生成';
  assert.equal(reader.readStoryHistory({fromSeq:4,scopeId:'qqj-chat',stableOnly:true}).turns.length,0);
});
test('a streaming or empty newest AI is excluded once and a single AI quietly waits',()=>{
  const context={chat:[{mes:'第一条',is_user:false}],streamingProcessor:{isFinished:true,isStopped:false,messageId:0}};
  const reader=createStoryHistoryReader({getContext:()=>context});const read=()=>reader.readStoryHistory({fromSeq:1,scopeId:'s',stableOnly:true});
  assert.equal(read().status,'empty');assert.equal(read().throughSeq,null);
  context.chat.push({mes:'半句',is_user:false});context.streamingProcessor={isFinished:false,isStopped:false,messageId:1};
  assert.equal(read().throughSeq,1);
  context.chat[1].mes='';assert.equal(read().throughSeq,1);
  context.chat.push({mes:'无关系统',is_user:false,is_system:true,extra:{type:'system'}});
  assert.equal(read().throughSeq,1);
});
test('currentOnly initializes from the latest stable exchange rather than replaying the whole history',()=>{const chat=[{mes:'很久以前',is_user:false},{mes:'上一段正文',is_user:false},{mes:'当前用户选择',is_user:true},{mes:'当前稳定结果',is_user:false},{mes:'最新尚可改写',is_user:false}];const reader=createStoryHistoryReader({getContext:()=>({chat})});const current=reader.readStoryHistory({fromSeq:1,scopeId:'s',stableOnly:true,currentOnly:true});assert.deepEqual(current.turns.map(t=>t.seq),[3,4]);assert.equal(current.throughSeq,4);assert.deepEqual(reader.readStoryHistory({fromSeq:1,scopeId:'s',stableOnly:true}).turns.map(t=>t.seq),[1,2,3,4]);});
