import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'vite';
let server,generateDevelopment,applyDevelopment,createModelClient,createModelRequester,createWorldRepository;
test.before(async()=>{server=await createServer({configFile:false,server:{middlewareMode:true,hmr:false,ws:false},appType:'custom'});({generateDevelopment,applyDevelopment}=await server.ssrLoadModule('/src/simulation/development.ts'));({createModelClient,createModelRequester}=await server.ssrLoadModule('/src/models/client.ts'));({createWorldRepository}=await server.ssrLoadModule('/src/storage/world-repository.ts'));});
test.after(()=>server?.close());
const people=['p','q','r'].map(id=>({id,displayName:id,description:'',aliases:[],source:{kind:'plugin',id,label:''}}));
const state=()=>({schemaVersion:1,scopeId:'s',storyTime:{text:'早晨'},processedThroughSeq:1,activities:[{id:'shared',title:'共同值班',description:'等待交班',status:'waiting',participantIds:['p','q'],sources:[]}],events:[{id:'old',activityId:'shared',title:'此前收到通知',description:'旧事实',participantIds:['p','q'],sources:[],storyTime:null,continuingForPersonIds:['p']}],knowledge:[]});
const story={status:'ready',throughSeq:3,turns:[{seq:2,isUser:false,text:'林青在柜台交班；随后离开柜台，镜头转向周宁。'},{seq:3,isUser:false,text:'林青返回柜台。'}],source:{kind:'chat',id:'s'}};
const stages=()=>[{key:'in',sourceSeqs:[2],onstagePersonIds:['p'],offstagePersonIds:[]},{key:'away',sourceSeqs:[2],onstagePersonIds:['q'],offstagePersonIds:['p']},{key:'back',sourceSeqs:[3],onstagePersonIds:['p'],offstagePersonIds:['q']}];
const at=(stageKey,row,assertedPersonIds=[])=>({...row,stageKey,assertedPersonIds,assertsUser:false});
const event=(key,stageKey,ids)=>at(stageKey,{key,activityId:null,title:key,description:key,participantIds:ids});
const reply=()=>({storyTime:{text:'中午',sourceSeqs:[3],elapsed:true},stages:stages(),events:[],activities:[],knowledge:[],quietReason:'其余时间继续原安排'});
const input=(extra={})=>({people,state:state(),story,initial:false,...extra});

test('one formal answer protects onstage, allows a same-floor offstage gap and hands back on re-entry',async()=>{
 const r=reply();r.events=[event('in','in',['p']),event('gap','away',['p']),event('joint','away',['p','r']),event('back','back',['p']),event('other','back',['r'])];r.knowledge=[at('away',{personId:'p',eventId:'gap',reason:'亲身经历'}),at('back',{personId:'p',eventId:'back',reason:'亲身经历'})];let calls=0;
 const result=await generateDevelopment({...input(),dependencies:{materials:{async readForQuestion(){return{status:'empty',materials:[],routerText:'',coverage:{partial:false,cseStatus:'ready'}};}},model:{async request(){calls++;return r;}}}});
 assert.equal(calls,1);assert.deepEqual(result.state.events.slice(1).map(e=>e.title),['gap','joint','other']);assert.equal(result.addedKnowledge,1);assert.deepEqual(result.state.developmentOnstagePersonIds,['p']);
});
test('indirect subjects, no-directory story user, old activity membership and event changes use the same boundary',()=>{
 const r=reply();r.activities=[at('back',{id:'shared',participantIds:['q'],description:'林青上午一直陪同周宁'}),at('back',{key:'ok',title:'整理物资',participantIds:['r'],status:'active'})];
 r.events=[at('back',{key:'absence',activityId:null,title:'听说没来',participantIds:['q']},['p']),{...event('user','back',['q']),assertsUser:true},event('badshared','back',['q']),event('ok','back',['q'])];r.events[2].activityId='shared';r.events[2].activityChange={participantIds:['q'],status:'completed'};
 r.knowledge=[at('back',{personId:'q',eventId:'old',reason:'听说林青没来'},['p']),at('back',{personId:'q',eventId:'ok',reason:'亲身经历'})];r.continuingEffects=[at('back',{eventId:'old',personIds:[]})];
 const result=applyDevelopment(input(),r);assert.deepEqual(result.state.activities[0],state().activities[0]);assert.deepEqual(result.state.events.slice(1).map(e=>e.title),['ok']);assert.deepEqual(result.state.events[0].continuingForPersonIds,['p']);assert.equal(result.addedKnowledge,1);assert.equal(result.state.activities.length,2);
});
test('caller camera and reference-only clocks cannot be revoked by returned scene metadata',()=>{
 const s={...story,turns:[{seq:3,isUser:false,text:'仅时间和镜头参考',calibrationEligible:false}]};const r={...reply(),stages:[{key:'reference',sourceSeqs:[3],onstagePersonIds:[],offstagePersonIds:['p','q']}],events:[event('camera','reference',['p']),event('carried','reference',['q']),event('valid','reference',['r'])]};
 const before=state();before.developmentOnstagePersonIds=['q'];const result=applyDevelopment(input({state:before,story:s,cameraPersonIds:['p']}),r);assert.deepEqual(result.state.events.slice(1).map(e=>e.title),['valid']);assert.deepEqual(result.state.developmentOnstagePersonIds,['q']);
});
test('authoritative calibration remains valid and wins over an earlier offstage checkpoint',()=>{
 const r=reply();r.activities=[at('away',{id:'shared',description:'幕后完成交班',status:'completed',participantIds:['r']})];r.calibration={facts:[],eventCorrections:[],knowledgeCorrections:[],activityUpdates:[{id:'shared',change:{description:'正文确认继续值班',status:'active'},sourceSeqs:[3]}]};const result=applyDevelopment(input(),r);assert.equal(result.state.activities[0].description,'正文确认继续值班');assert.equal(result.state.activities[0].status,'active');
});
test('formal person codec and one CAS carry final onstage ownership into the next batch until an evidenced departure',async()=>{
 const encodedReply=reply();encodedReply.stages=encodedReply.stages.map(s=>({...s,onstagePersonIds:s.onstagePersonIds.map(p=>'P'+(people.findIndex(x=>x.id===p)+1)),offstagePersonIds:s.offstagePersonIds.map(p=>'P'+(people.findIndex(x=>x.id===p)+1))}));encodedReply.events=[{...event('valid','back',['P2']),assertedPersonIds:['P3']}];let calls=0,puts=0,stored={revision:1,data:state()};
 const client=createModelClient({getHeaders:()=>({}),fetchImpl:async(_url,opts)=>{calls++;const wire=JSON.parse(JSON.parse(opts.body).messages[1].content);assert.deepEqual(wire.cameraPersonIds,['P3']);return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(encodedReply)},finish_reason:'stop'}]}),{status:200});}});
 const requester=createModelRequester({primary:{url:'https://fixture.invalid/v1',key:'fixture',model:'fixture'},secondary:{}},client);const decoded=await requester.request({task:'development',instructions:'',input:{people,cameraPersonIds:['r']}});assert.deepEqual(decoded.events[0].assertedPersonIds,['r']);assert.deepEqual(decoded.stages[2].onstagePersonIds,['p']);
 const first=applyDevelopment(input(),decoded);const repo=createWorldRepository({async get(){return stored;},async put(_c,_i,data,revision){puts++;assert.equal(revision,1);stored={revision:2,data};return stored;}});await repo.save('s',first.state,1);const saved=await repo.load('s');assert.equal(calls,1);assert.equal(puts,1);
 const nextStory={...story,throughSeq:4,turns:[{seq:4,isUser:false,text:'周宁继续工作，稍后林青明确离开镜头。'}]};const second={stages:[{key:'still',sourceSeqs:[4],onstagePersonIds:[],offstagePersonIds:[]},{key:'left',sourceSeqs:[4],onstagePersonIds:[],offstagePersonIds:['p']}],events:[event('blocked','still',['p']),event('allowed','left',['p'])],quietReason:''};const next=applyDevelopment(input({state:saved.state,story:nextStory}),second);assert.deepEqual(next.state.events.slice(saved.state.events.length).map(e=>e.title),['allowed']);
});
test('an offstage new activity keeps its explicit past events when re-entry forbids its end checkpoint',()=>{
 const r=reply();r.activities=[at('away',{key:'gap-work',title:'领取钥匙',description:'不得当作末段现状',status:'active',participantIds:['p']})];r.events=[at('away',{key:'start',activityId:'gap-work',title:'取件登记',participantIds:['p'],activityChange:{title:'领取钥匙',description:'已登记等候',status:'waiting',participantIds:['p']}}),at('away',{key:'done',activityId:'gap-work',title:'领取完毕',participantIds:['p'],activityChange:{description:'钥匙已领到',status:'completed'}})];
 const result=applyDevelopment(input(),r);assert.deepEqual(result.state.events.slice(1).map(e=>e.title),['取件登记','领取完毕']);const a=result.state.activities.find(a=>a.title==='领取钥匙');assert.ok(a);assert.equal(a.description,'钥匙已领到');assert.equal(a.status,'completed');assert.equal(a.currentStateWindowId,result.window.id);assert.ok(result.state.events.slice(1).every(e=>e.activityId===a.id));assert.equal(result.state.events[1].activityChange.description,'已登记等候');
});
test('a legitimate offstage result remains the last known state after re-entry without extrapolating an onstage action',()=>{
 const before=state();before.activities[0].participantIds=['p'];const r=reply();r.events=[at('away',{key:'early',activityId:'shared',title:'中途交接',participantIds:['p'],activityChange:{description:'中途已交接',status:'completed'}})];const result=applyDevelopment(input({state:before}),r);assert.equal(result.state.activities[0].status,'completed');assert.equal(result.state.activities[0].description,'中途已交接');assert.equal(result.state.activities[0].currentStateWindowId,result.window.id);assert.equal(result.state.events.at(-1).activityChange.status,'completed');
});
test('knowledge cannot acquire a later-stage new event in an earlier stage',()=>{
 const r=reply();r.events=[event('later','back',['q'])];r.knowledge=[at('away',{personId:'p',eventId:'later',reason:'提前知道结果'})];const result=applyDevelopment(input(),r);assert.equal(result.addedEvents,1);assert.equal(result.addedKnowledge,0);
});
test('a first past event with explicit status shares its declared activity identity with the next projection',async()=>{
 const r=reply();r.activities=[at('away',{key:'past',title:'领取材料',description:'不要回灌这段截止概况',status:'active',participantIds:['p']})];r.events=[at('away',{key:'done',activityId:'past',title:'领到材料',participantIds:['p'],activityChange:{status:'completed'}})];const result=applyDevelopment(input(),r);const a=result.state.activities.find(a=>a.title==='领取材料');assert.ok(a);assert.equal(a.description,'');assert.deepEqual(result.state.events.at(-1).activityChange,{status:'completed'});
 const {projectAsOf}=await server.ssrLoadModule('/src/simulation/trajectory.ts');const past=projectAsOf(result.state,{activities:[],backgrounds:[],knowledge:[]},{id:'next',kind:'current',from:result.window.to,to:result.window.to,throughSeq:4});const projected=past.activities.find(x=>x.id===a.id);assert.ok(projected);assert.equal(projected.status,'completed');assert.deepEqual(projected.participantIds,['p']);assert.equal(projected.description,'');
});
test('a rejected end-stage new summary does not erase the identity of its independently valid earlier events',()=>{
 const r=reply();r.activities=[at('back',{key:'past',title:'领取材料',description:'无依据的当前概况不接纳',status:'active',participantIds:['p']})];r.events=[at('away',{key:'done',activityId:'past',title:'领到材料',participantIds:['p'],activityChange:{title:'领取材料',participantIds:['p'],status:'completed',description:'已领完'}})];const result=applyDevelopment(input(),r);assert.equal(result.addedEvents,1);const a=result.state.activities.find(a=>a.title==='领取材料');assert.equal(a.status,'completed');assert.equal(a.description,'已领完');assert.equal(a.currentStateWindowId,result.window.id);assert.equal(result.state.events.at(-1).activityId,a.id);
});
test('the actual explicit activityKey alias binds a declared local activity instead of losing its relationship',()=>{
 const r=reply();r.activities=[at('back',{key:'q-task',title:'领取报销单',status:'completed',participantIds:['q']})];r.events=[{...event('receipt','back',['q']),activityKey:'q-task'},{...event('unknown','back',['q']),activityKey:'not-defined'}];delete r.events[0].activityId;delete r.events[1].activityId;const result=applyDevelopment(input(),r);assert.equal(result.addedEvents,1);assert.equal(result.state.events.at(-1).activityId,result.state.activities.find(a=>a.title==='领取报销单').id);
});
