import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'vite';
import {createSSRApp} from 'vue';
import {renderToString} from 'vue/server-renderer';
import vue from '@vitejs/plugin-vue';
let server,HistoryIntake;
test.before(async()=>{server=await createServer({configFile:false,plugins:[vue()],server:{middlewareMode:true,hmr:false,ws:false},appType:'custom'});({default:HistoryIntake}=await server.ssrLoadModule('/src/ui/HistoryIntake.vue'));});
test.after(async()=>server?.close());
const view={status:'idle',fromSeq:1,throughSeq:null,batchCharacters:24000,floors:0,excludedFloors:0,characters:0,batches:0,skipped:0,partial:false,progress:0,modelCalls:0,materialReads:0,message:''};
const world={id:'x',storyTime:null,people:[],activities:[],events:[],knowledge:[]};
const windows=[{id:'w1',from:{text:'INTERNAL_START'},to:{text:'INTERNAL_MIDDLE'},authorFloorSeqs:[1,2],authorEventIds:['f'],rawFloorSeqs:[]},{id:'w2',from:{text:'INTERNAL_MIDDLE'},to:{text:'INTERNAL_END'},authorFloorSeqs:[3],authorEventIds:['f'],rawFloorSeqs:[]}];
const check={fromSeq:1,throughSeq:3,peopleCount:3,coveredWindows:0,missingHistoryRanges:[],characters:100,factsCount:3,preparationRequests:1,canPrepare:true,message:''};
const render=extra=>renderToString(createSSRApp(HistoryIntake,{view,world,busy:false,enabled:true,...extra}));

test('body preview hides intermediate records and retains explicit confirmation with the three request counts',async()=>{
 const candidate={schemaVersion:1,scopeId:'x',storyTime:{text:'INTERNAL_TIME'},processedThroughSeq:null,activities:[{id:'a',title:'INTERNAL_ACTIVITY',description:'INTERNAL_DESCRIPTION',participantIds:[],sources:[],status:'active'}],events:[{id:'f',title:'INTERNAL_EVENT',description:'INTERNAL_DESCRIPTION',participantIds:[],sources:[],activityId:'a'}],knowledge:[]};
 const html=await render({view:{...view,status:'preview',batches:1,progress:1,modelCalls:1,candidate}});
 assert.match(html,/预计总次数：1 次/);assert.match(html,/当前请求：第 1 次已返回/);assert.match(html,/预计还需：0 次/);assert.match(html,/>确认接入<\/button>/);assert.doesNotMatch(html,/INTERNAL_|<details|<article|token|字符/);
});

test('checked body retains the zero-based start input and an explicit start rather than auto-generating',async()=>{
 const html=await render({view:{...view,status:'checked',batches:3,throughSeq:131}});
 assert.match(html,/value="0"/);assert.match(html,/预计总次数：3 次/);assert.match(html,/当前请求：尚未开始/);assert.match(html,/>开始整理<\/button>/);
});

test('history batch check offers one direct request and clearly labels re-supplementing covered records',async()=>{
 const html=await render({trajectoryView:{status:'checked',check,completed:0,modelCalls:0,message:'INTERNAL_MESSAGE'}});
 assert.match(html,/预计总次数：1 次/);assert.match(html,/预计还需：1 次/);assert.match(html,/>开始补写（整批保存）<\/button>/);assert.doesNotMatch(html,/INTERNAL_|<details|时间段|逐段保存|trajectory-prepare/);
 const rework=await render({trajectoryView:{status:'checked',check:{...check,isRework:true},completed:0,modelCalls:0,message:''}});assert.match(rework,/>重新补写所选范围（保留已有记录）<\/button>/);
});
test('failed save has a nearby save-only action, conflict a real reload, and failed generation an explicit new request',async()=>{
 const base={status:'error',check,completed:0,modelCalls:1,error:'保存失败。',message:'INTERNAL_MESSAGE'};
 const failed=await render({trajectoryView:{...base,canSave:true}});assert.match(failed,/>重新保存<\/button>/);assert.match(failed,/预计还需：0 次/);assert.doesNotMatch(failed,/INTERNAL_|<details|重试未完成/);
 const conflict=await render({trajectoryView:{...base,conflict:true}});assert.match(conflict,/>重新读取并检查<\/button>/);assert.doesNotMatch(conflict,/>重新保存<\/button>/);
 const regenerate=await render({trajectoryView:base});assert.match(regenerate,/>重新生成<\/button>/);assert.match(regenerate,/预计总次数：2 次/);
});
test('one actual request is counted once while waiting and saving',async()=>{
 const base={status:'running',requestPending:true,check,completed:0,modelCalls:1,message:'INTERNAL_PHASE'};
 const waiting=await render({busy:true,trajectoryView:base});assert.match(waiting,/当前请求：第 1 次，等待返回/);assert.match(waiting,/预计总次数：1 次/);assert.match(waiting,/预计还需：0 次/);assert.match(waiting,/>停止补写<\/button>/);assert.doesNotMatch(waiting,/INTERNAL_|安排人物行动|生成本段经历/);
 const saving=await render({busy:true,trajectoryView:{...base,requestPending:false,progress:{windowIndex:0,stage:'save'}}});assert.match(saving,/当前请求：第 1 次已返回，正在保存/);assert.match(saving,/>保存后停止<\/button>/);
});

test('an unavailable story read keeps its necessary one-line reason beside the existing check action',async()=>{
 const body=await render({view:{...view,status:'error',message:'正文还未完成。'}});assert.match(body,/正文还未完成。/);assert.match(body,/>检查范围<\/button>/);
 const behind=await render({trajectoryView:{status:'checked',completed:0,modelCalls:0,message:'暂时没有可读取的正文。'}});assert.match(behind,/暂时没有可读取的正文。/);assert.match(behind,/>检查幕后范围<\/button>/);
});

test('a partial ACK shows the actual saved result and one explicit continuation without internal material',async()=>{const html=await render({trajectoryView:{status:'checked',check,completed:2,modelCalls:1,message:'已保存，新增 3 条幕后经历。所选范围尚未补全，可继续补写未完成部分。'}});assert.match(html,/预计总次数：2 次/);assert.match(html,/预计还需：1 次/);assert.match(html,/新增 3 条幕后经历/);assert.match(html,/>继续补写未完成部分<\/button>/);assert.doesNotMatch(html,/requiredWindow|INTERNAL_|<details|<article/);});
