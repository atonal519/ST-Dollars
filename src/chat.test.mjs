import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initialChatState, createChatController, displayMessage } from './chat.logic.mjs';
const defer = () => { let resolve, reject; const promise = new Promise((yes,no) => { resolve=yes; reject=no; }); return { promise, resolve, reject }; };
function fixture(overrides = {}) {
  let current = { id: 'chat-a', key: 'card/chat-a' }, seq=0;
  const state = initialChatState();
  const api = {
    fetchHealth: async () => ({ ok:true, protocolVersion:3, db:'ok' }),
    getUniverse: async id => ({ universe:{ universe_id:id }, rooms:[{ room_id: id+'-room', name:'大厅' }], userAccount:{ account_id:'acc_user', nickname:'我' } }),
    getRoom: async scope => ({ room:{ room_id:scope.roomId }, userAccount:{ account_id:'acc_user', nickname:'我' }, members:[], messages:[], pending:[], hasMore:false, activeCycle:null }),
    ...overrides,
  };
  const controller = createChatController({ state, api, currentChat: () => current, clientProtocol:3, healthText: () => 'health', id: () => String(++seq) });
  return { state, controller, api, setChat: value => { current = value; } };
}
test('迟到的旧聊天读取不覆盖新聊天，即使 UI 事件稍晚才送达', async () => {
  const waiting=defer(); const f=fixture({ getUniverse: id => id === 'chat-a' ? waiting.promise : Promise.resolve({ universe:{ universe_id:id }, rooms:[], userAccount:null }) });
  const old=f.controller.loadChat(); await Promise.resolve();
  f.setChat({ id:'chat-b', key:'card/chat-b' }); await f.controller.loadChat();
  waiting.resolve({ universe:{ universe_id:'chat-a' }, rooms:[], userAccount:null }); await old;
  assert.equal(f.state.universe.universe_id, 'chat-b'); assert.equal(f.state.loading,false);
});
test('协议或 DB 不兼容时不读取世界、不允许发送', async () => {
  let read=false; const f=fixture({ fetchHealth:async () => ({ ok:true, protocolVersion:2, db:'ok' }), getUniverse:async () => { read=true; } });
  await f.controller.loadChat(); assert.equal(read,false); assert.equal(f.state.compatible,false);
});
test('保存未确认的消息保留内容与原 ID，重试保存不会重复', async () => {
  let count=0; const seen=[];
  const f=fixture({ sendPending:async payload => { seen.push(payload.messageId); if (++count===1) throw new Error('网络断开'); return { message:{ message_id:payload.messageId, content:payload.content, status:'pending_trigger' } }; } });
  await f.controller.loadChat(); f.state.draft='还在吗'; await f.controller.send();
  assert.equal(f.state.pending[0].content,'还在吗'); assert.equal(f.state.unconfirmed.length,1);
  await f.controller.send(f.state.pending[0]); assert.equal(f.state.pending.length,1); assert.equal(f.state.unconfirmed.length,0);
  assert.deepEqual(seen,['msg_1','msg_1']);
});
test('Continue 结果未确认时复用原 request ID；空轮与错误区分', async () => {
  let count=0; const seen=[]; const f=fixture({ runCycle:async payload => { seen.push(payload.requestId); if (++count===1) throw new Error('请求结果丢失'); return { produced:0, status:'cycle_completed_empty' }; } });
  await f.controller.loadChat(); await f.controller.continueCycle(); assert.ok(f.state.retryCycle);
  await f.controller.continueCycle(); assert.equal(f.state.retryCycle,null); assert.match(f.state.notice,/没人/); assert.deepEqual(seen,['cyc_1','cyc_1']);
});
test('切聊天后旧生成回执不会写入新房间', async () => {
  const waiting=defer(); const f=fixture({ runCycle:() => waiting.promise });
  await f.controller.loadChat(); const old=f.controller.continueCycle();
  f.setChat({ id:'chat-b', key:'card/chat-b' }); await f.controller.loadChat();
  waiting.resolve({ produced:6,status:'cycle_completed' }); await old;
  assert.equal(f.state.universe.universe_id,'chat-b'); assert.equal(f.state.notice,''); assert.equal(f.state.running,false);
});
test('显示文本以匿名昵称替换账号 ID，未知 ID 不泄露', () => {
  assert.equal(displayMessage('@acc_123 你好，acc_unknown', [{ account_id:'acc_123', nickname:'夜行' }]), '@夜行 你好，匿名');
});
