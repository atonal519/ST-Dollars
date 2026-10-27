import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'vite';

let server,advanceBatch,runTrajectory,createModelRequester,createPeopleWorld,projectAsOf;
test.before(async()=>{server=await createServer({configFile:false,server:{middlewareMode:true,hmr:false,ws:false},appType:'custom'});({advanceBatch}=await server.ssrLoadModule('/src/simulation/advance.ts'));({runTrajectory}=await server.ssrLoadModule('/src/application/trajectory.ts'));({createModelRequester}=await server.ssrLoadModule('/src/models/client.ts'));({createPeopleWorld}=await server.ssrLoadModule('/src/application/people-world.ts'));({projectAsOf}=await server.ssrLoadModule('/src/simulation/trajectory.ts'));});
test.after(async()=>server?.close());
const people=[{id:'formal-person',displayName:'甲',aliases:[],description:'',source:{kind:'plugin',id:'p',label:'目录'}}];
const source=n=>({kind:'chat',id:`history-floor:${n}`,label:'正文'});
const baseline=()=>({schemaVersion:1,scopeId:'s',storyTime:null,processedThroughSeq:3,historyRanges:[{fromSeq:1,toSeq:3}],activities:[{id:'a',title:'现在的事项',description:'未来概况不得进过去',status:'completed',participantIds:['formal-person'],sources:[source(3)]}],events:[1,2,3].map(n=>({id:`f${n}`,activityId:'a',title:`事实${n}`,description:'已整理事实',participantIds:['formal-person'],storyTime:{text:'正文时间',source:source(n)},sources:[source(n)]})),knowledge:[]});
const boundary=n=>({id:`b${n}`,text:['起初','稍后','现在'][n-1],sourceSeqs:[n]});
const windows=[1,2].map(n=>({id:`w${n}`,kind:'elapsed',from:boundary(n),to:boundary(n+1),throughSeq:n+1,authorEventIds:['f1','f2','f3'],authorFloorSeqs:[1,2,3],rawFloorSeqs:[]}));
const emptyBasis={backgrounds:[],activities:[],knowledge:[]};
const profiles={primary:{url:'https://offline.invalid',key:'fictional',model:'primary'},secondary:{url:'https://offline.invalid',key:'fictional',model:'secondary'}};
const materials={async readForQuestion(){assert.fail('historical work must not read current materials');}};
function requester(response,onRequest=()=>{}){return createModelRequester(profiles,{async generate(_profile,messages,maxTokens){const input=JSON.parse(messages[1].content);onRequest(maxTokens===4096?'plan':'advance',input);return JSON.stringify(maxTokens===4096?{intentions:[{personId:'P1',action:'落实本段事务'}]}:response);}});}
const event=(extra={})=>({key:'result',activityId:'a',title:'本段结果',participantIds:['P1'],...extra});
const advance=(response,onRequest)=>advanceBatch({people,state:baseline(),story:{status:'ready',message:'',throughSeq:2,turns:[],source:source(2)},window:windows[0],basis:emptyBasis,authorConstraints:{events:baseline().events,turns:[]},dependencies:{model:requester(response,onRequest),materials}});

test('a visible saved activity identity can own a historical result without importing its current state',async()=>{
 const result=await advance({activities:[],events:[event()],knowledge:[]},(_task,input)=>{assert.equal(input.authorConstraints.currentActivities[0].id,'a');assert.equal((input.unfinishedActivities??input.selectedActivities).length,0);});
 assert.equal(result.state.events.length,4);assert.equal(result.state.events.at(-1).activityId,'a');assert.equal(result.state.activities.length,0);assert.equal(result.state.knowledge.length,0);assert.equal(result.state.events.at(-1).activityChange,undefined);
});

test('explicit historical fields keep the saved activity ID and carry through events without cloning or borrowing future fields',async()=>{
 const response={activities:[{id:'a',title:'过去事项',description:'过去概况',status:'active',participantIds:['P1']}],events:[event()],knowledge:[]};
 const result=await advance(response);
 assert.deepEqual(result.state.activities.map(a=>a.id),['a']);assert.equal(result.state.activities[0].description,'过去概况');assert.equal(result.state.events.at(-1).activityId,'a');assert.equal(result.state.events.at(-1).activityChange,undefined);
 const partial=await advance({activities:[{id:'a',status:'waiting'}],events:[event()],knowledge:[]});
 assert.equal(partial.state.activities.length,0);assert.equal(partial.state.events.at(-1).activityChange,undefined);
 const noDescription=await advance({activities:[{id:'a',title:'明确的过去标题',status:'active',participantIds:['P1']}],events:[event()],knowledge:[]});
 assert.equal(noDescription.state.activities[0].description,'');assert.equal(noDescription.state.events.at(-1).activityChange,undefined);
});

test('complete local activity id and key refer to the same program-owned ID while ambiguous aliases remain unusable',async()=>{
 const result=await advance({activities:[{id:'local',key:'alias',title:'独立事项',participantIds:['P1']}],events:[event({activityId:'local',key:'one'}),event({activityId:'alias',key:'two'})],knowledge:[]});
 const created=result.state.activities[0];assert.notEqual(created.id,'local');assert.notEqual(created.id,'alias');assert.equal(result.state.events.length,5);assert.ok(result.state.events.slice(-2).every(e=>e.activityId===created.id));
 const ambiguous=await advance({activities:[{id:'local',title:'事项甲',participantIds:['P1']},{id:'local',title:'事项乙',participantIds:['P1']}],events:[event({activityId:'local'})],knowledge:[]});
 assert.equal(ambiguous.state.events.length,3);assert.equal(ambiguous.state.activities.length,2);
});

test('saved event identities can be explicitly reused outside the past projection without creating duplicates or automatic knowledge',async()=>{
 const result=await advance({activities:[],events:[{id:'f3',key:'known'}],knowledge:[{personId:'P1',eventId:'known',reason:'本段实际收到报告'}]});
 assert.equal(result.state.events.length,3);assert.equal(result.state.knowledge.length,1);assert.equal(result.state.knowledge[0].eventId,'f3');assert.equal(result.state.events[2].description,'已整理事实');
 for(const response of [{activities:[],events:[event({activityId:'missing'})],knowledge:[]},{activities:[],events:[event({id:'unknown-explicit-event'})],knowledge:[]}])await assert.rejects(advance(response),/模型结果|未能确认|未能关联/);
});

test('two historical windows preserve the current summary until an explicit final reconciliation and keep manual content',async()=>{
 for(const manual of [false,true]){
  const state=baseline();if(manual)state.activities[0].sources=[{kind:'manual',id:'m',label:'人工'}];let stored=state,revision=6;const snapshots=[];let requests=0;
  const model=createModelRequester(profiles,{async generate(_profile,messages,maxTokens){requests++;const input=JSON.parse(messages[1].content);if(maxTokens===4096){if(input.window.id==='w2'){if(manual)assert.equal(input.unfinishedActivities.length,0);else{assert.equal(input.unfinishedActivities[0].description,'过去概况');assert.equal(input.unfinishedActivities[0].status,'active');}}return JSON.stringify({intentions:[{personId:'P1',action:'落实事务',activityId:'a'}]});}return JSON.stringify({activities:input.window.id==='w1'?[{id:'a',title:'过去事项',description:'过去概况',status:'active',participantIds:['P1']}]:[],events:[event({key:input.window.id,...(input.window.id==='w1'?{activityChange:{title:'过去事项',description:'过去概况',status:'active',participantIds:['P1']}}:{})})],knowledge:[],currentActivityUpdates:[{id:'a',change:{description:input.window.id==='w1'?'不应提前合拢':'明确终窗概况',status:'completed'}}]});}});
  const result=await runTrajectory({prepared:{initialBasis:emptyBasis,windows,providedRawFloorSeqs:[],currentBoundaryId:'b3'},people,state,turns:[],revision,repository:{async save(_scope,next,expected){assert.equal(expected,revision);stored=structuredClone(next);snapshots.push(stored);return{state:stored,revision:++revision};}},dependencies:{model,materials},shouldStop:()=>false,onSaved(){}});
  assert.equal(requests,4);assert.equal(result.completed,2);assert.equal(snapshots[0].activities.length,1);assert.equal(snapshots[0].activities[0].description,'未来概况不得进过去');assert.equal(stored.activities[0].description,manual?'未来概况不得进过去':'明确终窗概况');assert.ok(stored.events.slice(3).every(e=>e.activityId==='a'));
 }
});

test('partial historical fields accumulate from prior results without substituting a current or default status',()=>{
 const state=baseline();state.simulationRanges=windows;state.events.push({...state.events[0],id:'past-status',sources:[],simulationWindowId:'w1',activityChange:{status:'waiting'}},{...state.events[0],id:'past-details',sources:[],simulationWindowId:'w2',activityChange:{title:'过去事项',description:'已给的过去概况',participantIds:['formal-person']}});
 const projected=projectAsOf(state,emptyBasis,{id:'next',kind:'current',from:boundary(3),to:boundary(3),throughSeq:3});
 assert.equal(projected.activities.length,1);assert.equal(projected.activities[0].status,'waiting');assert.equal(projected.activities[0].description,'已给的过去概况');
});

test('legacy advance restores misplaced saved activity/event keys without cloning either table',async()=>{const result=await advance({activities:[{key:'a',title:'过去事项',description:'过去已给概况',status:'active',participantIds:['P1']}],events:[{key:'f3'}],knowledge:[{personId:'P1',eventId:'f3',reason:'本段实际收到既有说法'}]});assert.deepEqual(result.state.activities.map(a=>a.id),['a']);assert.equal(result.state.events.length,3);assert.equal(result.state.knowledge[0].eventId,'f3');});
