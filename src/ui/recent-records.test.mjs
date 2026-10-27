import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'vite';
let server,deriveRecentRecords;
test.before(async()=>{server=await createServer({configFile:false,server:{middlewareMode:true,hmr:false,ws:false},appType:'custom'});({deriveRecentRecords}=await server.ssrLoadModule('/src/ui/recent-records.ts'));});
test.after(async()=>server?.close());
const people=['p','q','empty'].map(id=>({id,name:id,description:'档案不是行动',status:'旧活动',sources:[]}));
const event=(id,time,personIds=['p'],extra={})=>({id,activityId:'shared',title:id,description:'完整内容 '+id,storyTime:time?{text:time}:null,participantIds:personIds,sources:[],...extra});
const world=events=>({id:'s',storyTime:null,people,activities:[{id:'shared',title:'不能当成现在',status:'completed',participantIds:['p','q','empty'],description:'旧活动',sources:[]}],events,knowledge:[]});

test('explicit story time selects the latest direct record regardless of append order or activity membership',()=>{
 const data=world([event('latest','2026-01-02T12:20:00'),event('q-only','2026-01-02T11:00:00',['q'],{activityId:null}),event('appended-old','2026-01-01T23:59:00')]);
 assert.deepEqual(deriveRecentRecords(data).map(p=>({id:p.person.id,ids:p.records.map(r=>r.event.id)})),[{id:'p',ids:['latest']},{id:'q',ids:['q-only']}]);
 assert.equal(deriveRecentRecords(data)[0].records[0].content,'完整内容 latest');
});

test('corrected records are excluded and equal latest times retain their original full content',()=>{
 const rows=deriveRecentRecords(world([event('one','2026-01-02T12:00:00'),event('two','2026-01-02T12:00:00'),event('invalid','2026-01-03T12:00:00',['p'],{correction:{byEventId:'truth',reason:'正文纠正'}})]));
 assert.deepEqual(rows[0].records.map(r=>r.event.id),['one','two']);assert.equal(rows[0].records[0].time,'2026-01-02T12:00:00');
});

test('relative records use only explicit source order and never invent dates or people without content',()=>{
 const data=world([event('later','随后',['p'],{sources:[{kind:'chat',id:'history-floor:4',label:'正文'}]}),event('earlier','次日',['p'],{sources:[{kind:'chat',id:'history-floor:2',label:'正文'}]}),event('undated',null,['q'],{sources:[{kind:'chat',id:'history-floor:3',label:'正文'}]}),event('no-content',null,['empty'],{title:'',description:''})]);
 const rows=deriveRecentRecords(data);assert.deepEqual(rows.map(p=>p.person.id),['p','q']);assert.equal(rows[0].records[0].event.id,'later');assert.equal(rows[0].records[0].time,'随后');assert.equal(rows[1].records[0].time,'未注明时间');
});

test('explicitly owned content without a timestamp or sortable source is preserved without guessing a date',()=>{
 const rows=deriveRecentRecords(world([event('manual',null,['p'],{sources:[{kind:'manual',id:'note',label:'人工记录'}]})]));
 assert.equal(rows.length,1);assert.equal(rows[0].person.id,'p');assert.equal(rows[0].records[0].time,'未注明时间');assert.equal(rows[0].records[0].content,'完整内容 manual');
});

test('an earlier precise time is not replaced by a later-appended record from a later source window',()=>{
 const data=world([event('true-latest','2026-01-02T23:30:00',['p'],{simulationWindowId:'first'}),event('older-time','2026-01-02T21:00:00',['p'],{simulationWindowId:'last'})]);
 data.simulationRanges=[{id:'first',kind:'elapsed',from:{id:'a',text:'稍早',sourceSeqs:[1]},to:{id:'b',text:'随后',sourceSeqs:[2]},throughSeq:2},{id:'last',kind:'elapsed',from:{id:'b',text:'随后',sourceSeqs:[2]},to:{id:'c',text:'最后',sourceSeqs:[3]},throughSeq:3}];
 assert.equal(deriveRecentRecords(data)[0].records[0].event.id,'true-latest');
});

test('all explicitly owned unfinished work is visible even without events, while completed-only people remain absent',()=>{const data=world([]);data.activities=[{id:'a',title:'第一项',description:'当前事务',status:'active',participantIds:['p'],sources:[]},{id:'b',title:'第二项',description:'等待条件',status:'waiting',participantIds:['p','q'],sources:[]},{id:'done',title:'已完成',description:'',status:'completed',participantIds:['empty'],sources:[]}];const rows=deriveRecentRecords(data);assert.deepEqual(rows.map(row=>[row.person.id,row.activities.map(a=>a.id)]),[['p',['a','b']],['q',['b']]]);assert.ok(rows.every(row=>row.records.length===0));});
