import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'vite';

let server,generateDevelopment,applyDevelopment,applyCalibration,applyTrajectoryBatch,advanceBatch,projectAsOf;
test.before(async()=>{
 server=await createServer({configFile:false,server:{middlewareMode:true,hmr:false,ws:false},appType:'custom'});
 ({generateDevelopment,applyDevelopment}=await server.ssrLoadModule('/src/simulation/development.ts'));
 ({applyCalibration}=await server.ssrLoadModule('/src/simulation/calibration.ts'));
 ({applyTrajectoryBatch}=await server.ssrLoadModule('/src/simulation/trajectory-batch.ts'));
 ({advanceBatch}=await server.ssrLoadModule('/src/simulation/advance.ts'));
 ({projectAsOf}=await server.ssrLoadModule('/src/simulation/trajectory.ts'));
});
test.after(()=>server?.close());
const people=['p','q'].map((id,index)=>({id,displayName:index?'陈明':'林青',description:'店员',aliases:[],source:{kind:'plugin',id,label:'目录'}}));
const state=()=>({schemaVersion:1,scopeId:'s',storyTime:{text:'上午'},processedThroughSeq:1,activities:[],events:[],knowledge:[],simulationRanges:[]});
const turns=[{seq:2,isUser:false,text:'林青在店内清点货架；她和陈明已约定下午一起交接，故事user答应明天来取订货。'},{seq:3,isUser:false,text:'仅模拟时间到中午，无新增行动。',calibrationEligible:false}];
const empty=()=>({facts:[],activityUpdates:[],eventCorrections:[],knowledgeCorrections:[]});
const known=(key,participantIds=['p','q'],sourceSeqs=[2])=>({key,change:{title:'下午交接',description:'等待下午共同交接',status:'waiting',participantIds},sourceSeqs});
const boundary={stages:[{key:'shop',sourceSeqs:[2],onstagePersonIds:['p'],offstagePersonIds:[]}],storyTime:{text:'上午',sourceSeqs:[2],elapsed:false}};
const meta={stageKey:'shop',assertedPersonIds:['p'],assertsUser:false};
const material={async readForQuestion(){return{status:'empty',message:'',routerText:'',materials:[],coverage:{partial:false,cseStatus:'ready'}};}};

test('the formal hearing request prioritizes autonomous offscreen life and preserves onstage facts and shared activity identity',async()=>{
 let calls=0,sent,instructions;
 const {createModelClient,createModelRequester}=await server.ssrLoadModule('/src/models/client.ts');
 const current={...state(),developmentOnstagePersonIds:['p'],activities:[{id:'shared',title:'下午交接',description:'等待约定',status:'waiting',participantIds:['p','q'],sources:[{kind:'simulation',id:'previous',label:''}]}]};
 const model=createModelRequester({primary:{url:'https://fixture.invalid/v1',key:'fixture',model:'fixture'},secondary:{}},createModelClient({getHeaders:()=>({}),fetchImpl:async(_url,options)=>{calls++;const wire=JSON.parse(options.body);sent=JSON.parse(wire.messages[1].content);instructions=wire.messages[0].content;const response={...boundary,stages:[{...boundary.stages[0],onstagePersonIds:['P1']}],activities:[],events:[],knowledge:[],calibration:{...empty(),activityUpdates:[{...known('onstage',['P1']),change:{title:'店内清点',description:'林青在店内清点货架',status:'active',participantIds:['P1']}}]}};return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(response)},finish_reason:'stop'}]}),{status:200});}}));
 const result=await generateDevelopment({people,state:current,initial:false,story:{status:'ready',throughSeq:2,turns:[turns[0]],source:{kind:'chat',id:'s'}},dependencies:{materials:material,model}});
 assert.equal(calls,1);assert.deepEqual(sent.narrativeRoles.autonomous.map(person=>person.personId),['P2']);assert.deepEqual(sent.narrativeRoles.storyControlled.map(person=>person.personId),['P1']);assert.equal(sent.activities.find(activity=>activity.id==='shared').id,'shared');
 assert.match(instructions.slice(instructions.indexOf('你只负责“听觉”')).split('\n')[0],/首要.*narrativeRoles\.autonomous.*场外/);assert.match(instructions,/正文校准.*不能.*替代.*场外/);assert.match(instructions,/同一实际事项沿已有ID.*视角另建/);
 assert.equal(result.state.activities.length,2);assert.deepEqual(result.state.activities.find(activity=>activity.id==='shared').participantIds,['p','q']);assert.ok(result.state.activities.some(activity=>activity.title==='店内清点'));assert.deepEqual(result.state.developmentOnstagePersonIds,['p']);
});

test('formal generation saves known onstage/shared and user-related tasks and carries their UUID into the next projection',async()=>{
 const {createModelClient,createModelRequester}=await server.ssrLoadModule('/src/models/client.ts');
 const {createWorldRepository}=await server.ssrLoadModule('/src/storage/world-repository.ts');
 let calls=0,stored={revision:4,data:state()};
 const reply={...boundary,stages:[{...boundary.stages[0],onstagePersonIds:['P1']}],activities:[],events:[],knowledge:[],calibration:{...empty(),activityUpdates:[known('handover',['P1','P2']),{...known('pickup',[]),change:{title:'约定取货',description:'故事user答应明天来取订货，尚未发生',status:'planned',participantIds:[]}}]}};
 const model=createModelRequester({primary:{url:'https://fixture.invalid/v1',key:'fixture',model:'fixture'},secondary:{}},createModelClient({getHeaders:()=>({}),fetchImpl:async()=>{calls++;return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(reply)},finish_reason:'stop'}]}),{status:200});}}));
 const result=await generateDevelopment({people,state:stored.data,initial:true,story:{status:'ready',throughSeq:2,turns:[turns[0]]},dependencies:{materials:material,model}});
 assert.equal(calls,1);assert.equal(result.state.activities.length,2);assert.equal(result.state.events.length,0);assert.equal(result.state.knowledge.length,0);
 const shared=result.state.activities.find(a=>a.title==='下午交接');assert.deepEqual(shared.participantIds,['p','q']);assert.equal(shared.sources[0].id,'history-floor:2');
 const repo=createWorldRepository({async get(){return stored;},async put(_c,_id,data,revision){assert.equal(revision,4);stored={revision:5,data};return stored;}});
 await repo.save('s',result.state,4);const saved=await repo.load('s');
 const nextWindow={id:'next',kind:'elapsed',from:result.window.to,to:{id:'noon',text:'中午',sourceSeqs:[3]},throughSeq:3};
 const past=projectAsOf(saved.state,{backgrounds:[],activities:[],knowledge:[]},nextWindow);
 assert.equal(past.activities.find(a=>a.id===shared.id).status,'waiting');
 assert.throws(()=>applyDevelopment({people,state:saved.state,initial:false,story:{status:'ready',throughSeq:3,turns:[turns[1]]}},{stages:[{key:'noon',sourceSeqs:[3],onstagePersonIds:[],offstagePersonIds:['p']}],storyTime:{text:'中午',sourceSeqs:[3],elapsed:true},activities:[],events:[],knowledge:[],calibration:{...empty(),activityUpdates:[{id:shared.id,change:{status:'completed'},sourceSeqs:[3]}]},quietReason:'仍等待约定交接'}),/未能接纳/);
 assert.equal(saved.state.activities.length,2);assert.equal(saved.state.activities.find(a=>a.id===shared.id).status,'waiting');assert.deepEqual(saved.state.developmentOnstagePersonIds,['p']);
});

test('new known tasks require eligible original sources without leaving rejected aliases or inventing knowledge',()=>{
 const refs=new Map();const updates=[known('mixed',['p'],[2,3]),known('missing',['q'],[]),known('outside',['q'],[99]),known('valid',['q'])];
 const next=applyCalibration({state:state(),people,turns,calibration:{...empty(),activityUpdates:updates},activityRefs:refs});
 assert.equal(next.activities.length,1);assert.equal(refs.size,1);assert.equal(refs.get('valid'),next.activities[0].id);
 assert.equal(next.events.length,0);assert.equal(next.knowledge.length,0);assert.deepEqual(next.activities[0].sources.map(s=>s.id),['history-floor:2']);
});

test('pre-registering a narrative activity does not exempt new actions involving its onstage participants',()=>{
 const result=applyDevelopment({people,state:state(),initial:true,story:{status:'ready',throughSeq:2,turns:[turns[0]]}},{...boundary,activities:[],events:[{key:'bad',activityId:'joint',title:'替在场者开始交接',participantIds:['q'],...meta,assertedPersonIds:['q']},{key:'good',activityId:'own',title:'整理个人工具',description:'陈明独自整理工具',participantIds:['q'],...meta,assertedPersonIds:['q'],activityChange:{status:'completed'}}],knowledge:[],calibration:{...empty(),activityUpdates:[known('joint'),known('own',['q'])]}});
 assert.equal(result.state.activities.length,2);assert.equal(result.addedEvents,1);assert.equal(result.state.events[0].title,'整理个人工具');
 assert.equal(result.state.activities.find(a=>a.id===result.state.events[0].activityId).status,'waiting');
 assert.deepEqual(result.state.events[0].activityChange,{status:'completed'});assert.ok(result.boundaryRejections.some(r=>r.key==='bad'));
});

test('known activity updates preserve manual content and reject an unknown explicit ID',()=>{
 const before=state();before.activities=[{id:'manual',title:'人工安排',description:'用户已修改',status:'waiting',participantIds:['p','q'],sources:[{kind:'manual',id:'m',label:'人工'}]}];
 const next=applyCalibration({state:before,people,turns,calibration:{...empty(),activityUpdates:[{id:'manual',change:{status:'completed',participantIds:['q']},sourceSeqs:[2]}]}});
 assert.deepEqual(next.activities,before.activities);
 assert.throws(()=>applyCalibration({state:before,people,turns,calibration:{...empty(),activityUpdates:[{id:'unknown',change:{status:'active'},sourceSeqs:[2]}]}}),/活动无法确认/);
 const rejections=[];const unknown=applyCalibration({state:before,people,turns,calibration:{...empty(),activityUpdates:[{id:'unknown',key:'not-new',change:{title:'不可猜新身份',status:'active',participantIds:['p']},sourceSeqs:[2]}]},rejections});assert.deepEqual(unknown.activities,before.activities);assert.deepEqual(rejections,[{kind:'activity',key:'unknown',reason:'unknown-activity'}]);
});

test('historical calibration creates one known identity before a later segment references it',()=>{
 const reply={initialBasis:{backgrounds:[],activities:[],knowledge:[]},boundaries:[{key:'start',text:'上午',sourceSeqs:[2]},{key:'middle',text:'午前',sourceSeqs:[2]},{key:'end',text:'中午',sourceSeqs:[3]}],segments:[{key:'one',kind:'elapsed',from:'start',to:'middle',throughSeq:2,activities:[],newEvents:[],knowledge:[],calibration:{...empty(),activityUpdates:[known('joint')]}},{key:'two',kind:'elapsed',from:'middle',to:'end',throughSeq:3,activities:[],newEvents:[{key:'e',activityId:'joint',title:'共同交接',participantIds:['p','q'],activityChange:{status:'completed'}}],knowledge:[]}]};
 const result=applyTrajectoryBatch(reply,{people,state:state(),turns,fromSeq:2,currentThroughSeq:3});
 assert.equal(result.addedActivities,1);assert.equal(result.state.activities.length,1);assert.equal(result.addedEvents,1);
 assert.equal(result.state.events[0].activityId,result.state.activities[0].id);assert.equal(result.state.activities[0].status,'completed');
 assert.deepEqual(result.state.events[0].activityChange,{status:'completed'});
 const next=projectAsOf(result.state,{backgrounds:[],activities:[],knowledge:[]});assert.equal(next.activities[0].status,'completed');
 // No first-event snapshot was supplied, so an earlier past state must stay unknown rather than copy the endpoint.
 const prior=projectAsOf(result.state,{backgrounds:[],activities:[],knowledge:[]},result.windows[1]);assert.equal(prior.activities.length,0);
});

test('ordinary advance resolves a plan-created known activity key through parsed intentions and its actual event consumer',async()=>{
 let secondInput;const result=await advanceBatch({people,state:state(),story:{status:'ready',throughSeq:2,turns:[turns[0]],source:{kind:'chat',id:'current'}},dependencies:{materials:material,model:{async request(request){if(request.task==='plan')return{intentions:[{personId:'q',action:'准备自己的工具',activityId:'own'}],calibration:{...empty(),activityUpdates:[known('own',['q'])]}};secondInput=request.input;return{activities:[{id:'own',status:'active'}],events:[{key:'e',activityId:'own',title:'整理个人工具',participantIds:['q']}],knowledge:[]};}}}});
 assert.equal(result.state.activities.length,1);assert.equal(result.state.events.length,1);assert.equal(result.state.events[0].activityId,result.state.activities[0].id);
 assert.equal(secondInput.intentions[0].activityId,result.state.activities[0].id);
});

test('historical new identities cannot cite a later segment floor while an independent earlier result is preserved',()=>{
 const allTurns=[turns[0],{seq:4,isUser:false,text:'下午才约定次日交接。'}];
 const reply={initialBasis:{backgrounds:[],activities:[],knowledge:[]},boundaries:[{key:'start',text:'上午',sourceSeqs:[2]},{key:'middle',text:'午前',sourceSeqs:[2]},{key:'end',text:'下午',sourceSeqs:[4]}],segments:[{kind:'elapsed',from:'start',to:'middle',throughSeq:2,activities:[],newEvents:[{key:'valid',activityId:null,title:'独立清点完成',participantIds:['q']}],knowledge:[],calibration:{...empty(),activityUpdates:[known('future',['q'],[4])]}},{kind:'elapsed',from:'middle',to:'end',throughSeq:4,activities:[],newEvents:[{key:'bad-ref',activityId:'future',title:'不能引用未接纳身份',participantIds:['q']}],knowledge:[],quietReason:'本段休息'}]};
 const result=applyTrajectoryBatch(reply,{people,state:state(),turns:allTurns,fromSeq:2,currentThroughSeq:4});
 assert.equal(result.state.activities.length,0);assert.equal(result.addedActivities,0);assert.deepEqual(result.state.events.map(e=>e.title),['独立清点完成']);
});

test('the legacy window coordinator anchors newly synchronized narrative tasks before its next plan and repository readback',async()=>{
 const {runTrajectory}=await server.ssrLoadModule('/src/application/trajectory.ts');
 const {createWorldRepository}=await server.ssrLoadModule('/src/storage/world-repository.ts');
 let stored={revision:1,data:state()},calls=0;const seen=[];
 const repo=createWorldRepository({async get(){return stored;},async put(_c,_i,data,revision){assert.equal(revision,stored.revision);stored={revision:revision+1,data};return stored;}});
 const start={id:'start',text:'上午',sourceSeqs:[2]},middle={id:'middle',text:'午前',sourceSeqs:[2]},end={id:'end',text:'中午',sourceSeqs:[3]};
 const prepared={initialBasis:{backgrounds:[],activities:[],knowledge:[]},windows:[{id:'first',kind:'elapsed',from:start,to:middle,throughSeq:2,authorEventIds:[],rawFloorSeqs:[2]},{id:'second',kind:'elapsed',from:middle,to:end,throughSeq:3,authorEventIds:[],rawFloorSeqs:[3]}],providedRawFloorSeqs:[2,3]};
 const result=await runTrajectory({prepared,people,state:stored.data,turns,revision:1,repository:repo,shouldStop:()=>false,onSaved:ack=>seen.push(ack),dependencies:{materials:{async readForQuestion(){assert.fail('historical plans reuse provided material');}},model:{async request(request){calls++;assert.equal(request.task,'plan');if(calls===2){assert.equal(request.input.unfinishedActivities.length,1);assert.equal(request.input.unfinishedActivities[0].id,seen[0].state.activities[0].id);}return{intentions:[{personId:'q',waitReason:'等待下午交接'}],...(calls===1?{calibration:{...empty(),activityUpdates:[known('joint')]}}:{})};}}}});
 assert.equal(calls,2);assert.equal(result.completed,2);assert.equal(seen[0].state.activities[0].currentStateWindowId,'first');
 const saved=await repo.load('s');assert.equal(saved.revision,3);assert.equal(saved.state.activities.length,1);assert.equal(saved.state.activities[0].id,seen[0].state.activities[0].id);assert.equal(saved.state.events.length,0);
});

test('a windowed advance uses later author context for old corrections but cannot establish a new past identity from it',async()=>{
 const before=state();before.activities=[{id:'old',title:'既有事务',description:'等待确认',status:'waiting',participantIds:['q'],sources:[{kind:'simulation',id:'previous',label:'原记录'}]}];
 const future={seq:4,isUser:false,text:'下午确认旧事完成并约定明天交接。'};
 const result=await advanceBatch({people,state:before,window:{id:'early',kind:'elapsed',from:{id:'start',text:'早晨',sourceSeqs:[2]},to:{id:'end',text:'上午',sourceSeqs:[2]},throughSeq:2},authorConstraints:{events:[],turns:[turns[0],future]},story:{status:'ready',throughSeq:2,turns:[turns[0]],source:{kind:'chat',id:'current'}},dependencies:{materials:material,model:{async request(){return{intentions:[{personId:'q',waitReason:'休息'}],calibration:{...empty(),activityUpdates:[known('future',['q'],[4]),{id:'old',change:{status:'completed'},sourceSeqs:[4]}]}};}}}});
 assert.equal(result.state.activities.length,1);assert.equal(result.state.activities[0].id,'old');assert.equal(result.state.activities[0].status,'completed');
});

test('known activity aliases cannot shadow a saved identity or bind the same key to two targets',()=>{
 const before=state();before.activities=['a','b'].map(id=>({id,title:'事务'+id,description:'等待确认',status:'waiting',participantIds:['q'],sources:[{kind:'simulation',id:'previous',label:'原记录'}]}));
 const cases=[
  [{id:'b',key:'a',change:{status:'active'},sourceSeqs:[2]},{id:'a',change:{status:'completed'},sourceSeqs:[2]}],
  [{id:'a',key:'joint',change:{status:'active'},sourceSeqs:[2]},{id:'b',key:'joint',change:{status:'completed'},sourceSeqs:[2]}],
 ];
 for(const activityUpdates of cases)assert.throws(()=>applyCalibration({state:before,people,turns,calibration:{...empty(),activityUpdates},activityRefs:new Map()}),/临时引用重复/);
 const restored=applyCalibration({state:before,people,turns,calibration:{...empty(),activityUpdates:[known('a',['q'])]},activityRefs:new Map()});
 assert.deepEqual(restored.activities.map(a=>a.id),['a','b']);assert.equal(restored.activities[0].title,'下午交接');
 assert.deepEqual(before.activities.map(a=>a.status),['waiting','waiting']);
 const refs=new Map([['a','b']]);const next=applyCalibration({state:before,people,turns,calibration:{...empty(),activityUpdates:[{id:'a',change:{status:'completed'},sourceSeqs:[2]}]},activityRefs:refs});
 assert.deepEqual(next.activities.map(a=>a.status),['completed','waiting']);
});

test('a repeated display of a calibrated key keeps one factual identity and still rejects its onstage creative update',()=>{
 const result=applyDevelopment({people,state:state(),initial:true,story:{status:'ready',throughSeq:2,turns:[turns[0]]}},{...boundary,activities:[{key:'joint',title:'另写概况',description:'不应覆盖正文',status:'active',participantIds:['q'],...meta,assertedPersonIds:['q']}],events:[],knowledge:[],calibration:{...empty(),activityUpdates:[known('joint')]}});
 assert.equal(result.state.activities.length,1);assert.equal(result.state.activities[0].title,'下午交接');assert.equal(result.state.activities[0].status,'waiting');assert.deepEqual(result.state.activities[0].participantIds,['p','q']);
 assert.ok(result.boundaryRejections.some(r=>r.kind==='activity'&&r.key==='joint'&&r.reason==='onstage'));
});

test('historical duplicate display of a calibrated key neither clones nor overrides the authoritative endpoint',()=>{
 const reply={initialBasis:{backgrounds:[],activities:[],knowledge:[]},boundaries:[{key:'start',text:'上午',sourceSeqs:[2]},{key:'end',text:'午前',sourceSeqs:[2]}],segments:[{kind:'elapsed',from:'start',to:'end',throughSeq:2,activities:[{key:'joint',title:'重复概况',description:'不应覆盖正文',status:'active',participantIds:['q']}],newEvents:[],knowledge:[],calibration:{...empty(),activityUpdates:[known('joint')]}}]};
 const result=applyTrajectoryBatch(reply,{people,state:state(),turns:[turns[0]],fromSeq:2,currentThroughSeq:2});
 assert.equal(result.addedActivities,1);assert.equal(result.state.activities.length,1);assert.equal(result.state.activities[0].status,'waiting');assert.deepEqual(result.state.activities[0].participantIds,['p','q']);
});
