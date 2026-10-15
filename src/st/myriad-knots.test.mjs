import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMyriadKnotsProvider, MEMORY_BRIDGE_KEY } from './myriad-knots.mjs';
const identity = { hostChatId:'chat', qqjChatId:'uuid', characterLocator:'card', personaLocator:'user' };
test('未安装、关闭、版本不兼容和错误聊天分别返回状态', () => {
  const globals={}; const provider=createMyriadKnotsProvider({ globals,currentChatId:() => 'chat' });
  assert.equal(provider.status().status,'unavailable');
  globals[MEMORY_BRIDGE_KEY]={ schemaVersion:2 }; assert.equal(provider.status().status,'unsupported');
  globals[MEMORY_BRIDGE_KEY]={ schemaVersion:1,getStatus:() => ({ status:'disabled' }) }; assert.equal(provider.status().status,'disabled');
  globals[MEMORY_BRIDGE_KEY].getStatus=() => ({ status:'ready',identity:{ ...identity,hostChatId:'wrong' } }); assert.equal(provider.status().status,'stale');
});
test('旧桥无需 getPromptSnapshot；快照保留私密边界、来源与分区不完整状态', async () => {
  const snapshot={ status:'ready',identity,memory:{ status:'ready',headCheckpointId:'cp',floors:[] },cse:{ ready:false,currentSubjects:[{ core:[{ text:'秘密',visibility:'private',sourceFloorId:'floor' }] }] } };
  const globals={ [MEMORY_BRIDGE_KEY]:{ schemaVersion:1,getStatus:() => ({ status:'ready',identity }),getSnapshot:() => snapshot } };
  const provider=createMyriadKnotsProvider({ globals,currentChatId:() => 'chat' });
  assert.equal(provider.status().promptSnapshotAvailable,false);
  assert.equal((await provider.readPromptSnapshot()).status,'unsupported');
  const result=await provider.readSnapshot(); assert.deepEqual(result,snapshot);
  result.cse.currentSubjects[0].core[0].text='改动'; assert.equal(snapshot.cse.currentSubjects[0].core[0].text,'秘密');
});
test('异步读取期间 Persona 或桥替换，拒绝迟到材料', async () => {
  let current=identity, finish;
  const globals={ [MEMORY_BRIDGE_KEY]:{ schemaVersion:1,getStatus:() => ({ status:'ready',identity:current }),readMemory:() => new Promise(resolve => { finish=resolve; }) } };
  const provider=createMyriadKnotsProvider({ globals,currentChatId:() => 'chat' });
  const reading=provider.readMemory(); current={ ...identity,personaLocator:'other' };
  finish({ status:'ready',identity,text:'旧材料' }); assert.equal((await reading).status,'stale');
});
