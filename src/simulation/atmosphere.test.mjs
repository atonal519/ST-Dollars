import test from 'node:test';import assert from 'node:assert/strict';import {createServer} from 'vite';
let server;test.before(async()=>{server=await createServer({configFile:false,server:{middlewareMode:true,hmr:false,ws:false},appType:'custom'});});test.after(()=>server?.close());
const people=['p','q','u'].map(id=>({id,displayName:id,description:'普通人物',aliases:[],specialRole:id==='u'?'user':undefined,source:{kind:'plugin',id,label:''}}));
const event={id:'old',activityId:null,title:'订货确认',description:'已经确认普通订单',participantIds:['p'],storyTime:null,sources:[{kind:'simulation',id:'prior',label:'既有经历'}]};
const state=()=>({schemaVersion:1,scopeId:'s',foundation:{people:[],groups:[{id:'shop-circle',name:'街区经营组',description:'长期协作',members:['p','q'].map(personId=>({personId,fromWindowId:'base'})),sources:[],establishedWindowId:'base',currentStateWindowId:'base'}],relations:[]},storyTime:{text:'2027-03-20T08:00'},processedThroughSeq:1,automaticDevelopmentEnabled:false,developmentOnstagePersonIds:['q'],activities:[],events:[event],knowledge:[]});
const story={status:'ready',throughSeq:2,turns:[{seq:2,isUser:false,text:'q明确离场，p进入镜头。'}],source:{kind:'chat',id:'s',label:''}};
const stage={key:'now',sourceSeqs:[2],onstagePersonIds:['p'],offstagePersonIds:['q']};
const row={key:'shop',circleRef:'foundation:group:shop-circle',title:'小店的备货节奏',personIds:['p','q'],description:'在既定进货安排下，店内似乎偏向按原计划处理杂务。',basisEventIds:['old'],basisMaterialRefs:[],stageKey:'now',assertedPersonIds:[],assertsUser:false};
async function apply(stateValue,response,storyValue=story){const {applyAtmosphere}=await server.ssrLoadModule('/src/simulation/atmosphere.ts');return applyAtmosphere({people,state:stateValue,story:storyValue,initial:false,prepared:{materials:[],currentClock:'2027-03-20T09:00'}},response);}
test('an independent valid event keeps a useful atmosphere despite a misplaced auxiliary source and advances no personal field',async()=>{
 const before=state(),out=await apply(before,{stages:[stage],atmosphereUpdates:[{...row,basisMaterialRefs:['prior']}]});assert.equal(out.state.developmentAtmospheres.length,1);assert.equal(out.state.developmentAtmospheres[0].description,row.description);assert.deepEqual(out.state.developmentAtmospheres[0].basisEventIds,['old']);assert.ok(out.referenceNormalizations.length);
 for(const field of ['storyTime','processedThroughSeq','automaticDevelopmentEnabled','developmentOnstagePersonIds','activities','events','knowledge'])assert.deepEqual(out.state[field],before[field]);
});
test('scope membership does not assert actions but new assertions honor real new-body entry and departure',async()=>{
 assert.equal((await apply(state(),{stages:[stage],atmosphereUpdates:[row]})).state.developmentAtmospheres.length,1);
 assert.equal((await apply(state(),{stages:[stage],atmosphereUpdates:[{...row,assertedPersonIds:['p']}]})).state.developmentAtmospheres.length,0);
 assert.equal((await apply(state(),{stages:[stage],atmosphereUpdates:[{...row,assertedPersonIds:['q']}]})).state.developmentAtmospheres.length,1);
 assert.equal((await apply(state(),{stages:[stage],atmosphereUpdates:[{...row,assertsUser:true}]})).state.developmentAtmospheres.length,0);
 const reference={...story,turns:[{...story.turns[0],calibrationEligible:false}]};assert.equal((await apply(state(),{stages:[stage],atmosphereUpdates:[{...row,assertedPersonIds:['q']}]},reference)).state.developmentAtmospheres.length,0);
});
test('unknown sole evidence is rejected while settled removes an existing current atmosphere without creating events',async()=>{
 assert.equal((await apply(state(),{stages:[stage],atmosphereUpdates:[{...row,basisEventIds:['future-hearing-key']}]})).state.developmentAtmospheres.length,0);
 const prior=state();prior.developmentAtmospheres=[{id:'wind',title:'旧风向',description:'既有摘要',personIds:['p'],basisEventIds:['old'],sources:[]}];const result=await apply(prior,{atmosphereUpdates:[{id:'wind',status:'settled'}]});assert.deepEqual(result.state.developmentAtmospheres,[]);assert.deepEqual(result.state.events,prior.events);
});
test('calibration invalidates the whole old summary and input/projection consumers no longer see it',async()=>{
 const {applyCalibration}=await server.ssrLoadModule('/src/simulation/calibration.ts'),{projectWorldState}=await server.ssrLoadModule('/src/domain/world-state.ts');
 const prior=state();prior.developmentAtmospheres=[{id:'wind',title:'旧风向',description:'错误基础上的摘要',personIds:['p'],basisEventIds:['old'],sources:[]}];
 const next=applyCalibration({state:prior,people,turns:story.turns,calibration:{facts:[{key:'fact',title:'正确事实',description:'正文明确纠正',participantIds:['p'],sourceSeqs:[2]}],eventCorrections:[{eventId:'old',byEventId:'fact',reason:'正文明确推翻'}],activityUpdates:[],knowledgeCorrections:[]}});
 assert.deepEqual(next.developmentAtmospheres,[]);assert.deepEqual(projectWorldState('s',[],next).atmospheres,[]);
 const {generateAtmosphere}=await server.ssrLoadModule('/src/simulation/atmosphere.ts'),{generateDevelopment}=await server.ssrLoadModule('/src/simulation/development.ts');
 const rawPersisted={...next,developmentAtmospheres:prior.developmentAtmospheres},requests=[],dependencies={model:{async request(request){requests.push(request);return request.task==='atmosphere'?{atmosphereUpdates:[]}:{quietReason:'仍在等候'};}}},prepared={materials:[],currentClock:null};
 await generateAtmosphere({people,state:rawPersisted,story,initial:false,prepared,dependencies});await generateDevelopment({people,state:rawPersisted,story,initial:false,prepared,dependencies});
 assert.equal(requests.length,2);for(const request of requests)assert.deepEqual((request.task==='atmosphere'?request.input.background.atmospheres:request.input.atmospheres),[]);
});
test('unchanged known atmosphere and frame allow hearing without an empty first save',async()=>{
 const first=await apply(state(),{atmosphereUpdates:[row]}),second=await apply(first.state,{atmosphereUpdates:[]});
 assert.equal(second.changed,false);assert.deepEqual(second.state.developmentAtmospheres,first.state.developmentAtmospheres);
});

test('visual classification is optional, accepts one good dimension, and visual-only updates save',async()=>{
 const first=await apply(state(),{atmosphereUpdates:[{...row,visual:{temperature:'warm',rhythm:'bad'}}]});
 assert.deepEqual(first.state.developmentAtmospheres[0].visual,{temperature:'warm',rhythm:'flowing'});
 const old=first.state.developmentAtmospheres[0];
 const next=await apply(first.state,{atmosphereUpdates:[{...row,id:old.id,visual:{temperature:'cold',rhythm:'calm'}}]});
 assert.equal(next.changed,true);assert.deepEqual(next.state.developmentAtmospheres[0].visual,{temperature:'cold',rhythm:'calm'});
 const bad=await apply(state(),{atmosphereUpdates:[{...row,visual:{temperature:'nonsense',rhythm:4}}]});assert.equal(bad.state.developmentAtmospheres.length,1);
});
test('presentation-only answer uses source-owner basis and invalid optional items never discard valid business',async()=>{
 const {applyAtmosphere}=await server.ssrLoadModule('/src/simulation/atmosphere.ts');const {projectSourcePerson}=await server.ssrLoadModule('/src/domain/source-people.ts');const {projectWorldState}=await server.ssrLoadModule('/src/domain/world-state.ts');
 const ps=people.map(p=>({...p,presentationSource:p.id==='p'?{personality:'温和，习惯倾听',relations:'q是p的下属'}:undefined}));
 const input={people:ps,state:state(),story,initial:false,prepared:{materials:[],currentClock:'2027-03-20T09:00'}};
 const result=applyAtmosphere(input,{presentationUpdates:[{personId:'p',temperament:'gentle',profileRelations:[{fromPersonId:'p',toPersonId:'q',fromRole:'上级',toRole:'下属',directed:true},{fromPersonId:'p',toPersonId:'unknown',fromRole:'好友',toRole:'好友',directed:false}]},{personId:'q',temperament:'sharp'},{personId:'unknown',temperament:'gentle'}]});
 assert.equal(result.changed,true);assert.equal(result.state.processedThroughSeq,1);assert.equal(result.state.storyTime.text,input.state.storyTime.text);
 const projected=projectWorldState('s',ps.map(projectSourcePerson),result.state);assert.equal(projected.people[0].temperament,'gentle');assert.equal(projected.people[1].temperament,undefined);assert.deepEqual(projected.profileRelations,[{fromPersonId:'p',toPersonId:'q',fromRole:'上级',toRole:'下属',directed:true}]);
 const changed=ps.map(p=>p.id==='p'?{...p,presentationSource:{personality:'温和，习惯倾听',relations:''}}:p);
 const stale=projectWorldState('s',changed.map(projectSourcePerson),result.state);assert.deepEqual(stale.profileRelations,[]);assert.equal(stale.people[0].temperament,'gentle');
 const unchanged=applyAtmosphere({...input,state:result.state},{atmosphereUpdates:[]});assert.deepEqual(unchanged.state.developmentPresentation,result.state.developmentPresentation);
});
test('only missing valid source hints are requested in the same emotion call',async()=>{
 const {generateAtmosphere}=await server.ssrLoadModule('/src/simulation/atmosphere.ts');let request;
 const ps=people.map(p=>({...p,presentationSource:p.id==='p'?{personality:'谨慎克制',relations:'q与p是同事'}:undefined}));
 await generateAtmosphere({people:ps,state:state(),story,initial:false,prepared:{materials:[],currentClock:null},dependencies:{model:{async request(r){request=r;return {atmosphereUpdates:[]};}}}});
 assert.equal(request.input.presentationRequests.length,1);assert.equal(request.input.presentationRequests[0].personId,'p');assert.equal(request.input.presentationRequests[0].personality,'谨慎克制');
});
test('display hints do not feed the story and unrequested classifications cannot wash a stable face',async()=>{
 const {applyAtmosphere,generateAtmosphere}=await server.ssrLoadModule('/src/simulation/atmosphere.ts');const {generateDevelopment}=await server.ssrLoadModule('/src/simulation/development.ts');
 const ps=people.map(p=>({...p,presentationSource:p.id==='p'?{personality:'温和',relations:'q是同事'}:undefined}));const input={people:ps,state:state(),story,initial:false,prepared:{materials:[],currentClock:null}};
 const first=applyAtmosphere(input,{atmosphereUpdates:[{...row,visual:{temperature:'warm',rhythm:'agitated'}}],presentationUpdates:[{personId:'p',temperament:'gentle',profileRelations:[]}]});
 const second=applyAtmosphere({...input,state:first.state},{presentationUpdates:[{personId:'p',temperament:'sharp',profileRelations:[{fromPersonId:'p',toPersonId:'q',fromRole:'朋友',toRole:'朋友',directed:false}]}]});assert.deepEqual(second.state.developmentPresentation,first.state.developmentPresentation);
 const requests=[],dependencies={model:{async request(r){requests.push(r);return r.task==='atmosphere'?{atmosphereUpdates:[]}:{quietReason:'等待'};}}};
 await generateAtmosphere({...input,state:first.state,dependencies});await generateDevelopment({...input,state:first.state,dependencies});
 assert.equal(requests[0].input.presentationRequests.length,0);for(const r of requests){assert.equal('visual' in (r.task==='atmosphere'?r.input.background.atmospheres:r.input.atmospheres)[0],false);assert.equal('developmentPresentation' in r.input,false);}
});

test('diagnostics distinguish background-only changes from accepted circles and keep rejection reasons',async()=>{const {generateAtmosphere}=await server.ssrLoadModule('/src/simulation/atmosphere.ts');const events=[];const result=await generateAtmosphere({people,state:state(),story,initial:true,prepared:{materials:[],currentClock:null},diagnostic:{id:'offline',record(stage,details){events.push({stage,details});},protect(){}},dependencies:{model:{request:async()=>({stages:[{...stage,sourceSeqs:[999]}],atmosphereUpdates:[{...row,assertedPersonIds:['p'],stageKey:'now'}],quietReason:'背景未变'})}}});assert.equal(result.changedAtmospheres,0);const applied=events.find(e=>e.stage==='applied').details;assert.equal(applied.changedAtmospheres,0);assert.equal(applied.backgroundChanged,true);assert.equal(applied.atmosphereRejections[0].reason,'boundary');});
