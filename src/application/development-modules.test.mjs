import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'vite';
let server,createPeopleWorld,createStoryHistoryReader,createModelClient,createModelRequester;
test.before(async()=>{server=await createServer({configFile:false,server:{middlewareMode:true,hmr:false,ws:false},appType:'custom'});({createPeopleWorld}=await server.ssrLoadModule('/src/application/people-world.ts'));({createStoryHistoryReader}=await server.ssrLoadModule('/src/host/story-history.ts'));({createModelClient,createModelRequester}=await server.ssrLoadModule('/src/models/client.ts'));});
test.after(()=>server?.close());
const person={id:'p',displayName:'林青',description:'经营文具店',aliases:[],qqjPersonId:'qqj:[\"s\",\"fixture\"]',source:{kind:'plugin',id:'p',label:'人物'}};
const quiet={stages:[{key:'now',sourceSeqs:[2],onstagePersonIds:[],offstagePersonIds:[]}],activities:[],events:[],knowledge:[],quietReason:'仍在等货'};
const smell={stages:quiet.stages,atmosphereUpdates:[{key:'shop',circleRef:'foundation:group:shop-circle',title:'文具店的备货节奏',personIds:['P1'],description:'等候新货期间仍倾向按原计划办事。',basisEventIds:['old-event'],assertedPersonIds:[],assertsUser:false}]};
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return{promise,resolve};};
function fixture({failSave=0,blockSave=0,failHearing=false,firstReply=smell}={}) {
 let stored={schemaVersion:1,foundation:{throughSeq:0,windowId:'fixture-foundation',people:[{id:'p',name:'林青',aliases:[],identity:'',motivations:'',disposition:'',interests:'',life:'',sources:[{kind:'world-book',id:'fixture-book',label:'既已整理的设定'}],establishedWindowId:'fixture-foundation',currentStateWindowId:'fixture-foundation'}],groups:[{id:'shop-circle',name:'街区经营组',description:'长期协作',members:[{personId:'p',fromWindowId:'fixture-foundation'}],sources:[],establishedWindowId:'fixture-foundation',currentStateWindowId:'fixture-foundation'}],relations:[]},scopeId:'s',storyTime:{text:'2027-03-20T08:00'},processedThroughSeq:1,automaticDevelopmentEnabled:true,activities:[],events:[{id:'old-event',activityId:null,title:'订货已确认',description:'已安排普通进货',participantIds:['p'],storyTime:null,sources:[{kind:'simulation',id:'old-window',label:'已存经历'}]}],knowledge:[]},revision=3,model='first',puts=0,materialReads=0,referenceReads=0;
 const saved=[],sent=[],runs=[],gate=deferred();
 const chat=[{mes:'<!-- SDC-end 2027-03-20T08:00 -->',is_user:false},{mes:'<!-- SDC-end 2027-03-20T09:00 -->店里照常营业。',is_user:false},{mes:'尚未稳定',is_user:false}];
 const client=createModelClient({getHeaders:()=>({}),fetchImpl:async(_path,options)=>{const wire=JSON.parse(options.body);sent.push(wire);if(failHearing&&sent.length>1){failHearing=false;return new Response(JSON.stringify({error:'upstream'}),{status:503});}return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(sent.length===1?firstReply:quiet)},finish_reason:'stop'}]}));}});
 const app=createPeopleWorld({directory:{readPeople:()=>({status:'ready',scopeId:'s',people:[person],message:''})},repository:{async load(){return{state:structuredClone(stored),revision};},async save(_scope,next,expected){puts++;assert.equal(expected,revision);if(puts===blockSave)await gate.promise;if(puts===failSave)throw Error('private save failed');stored=structuredClone(next);if(puts===1){stored.developmentAtmospheres[0].description+='（ACK）';model='second';}saved.push(structuredClone(stored));return{state:structuredClone(stored),revision:++revision};}},history:createStoryHistoryReader({getContext:()=>({chat})}),story:{readStoryInput(){throw Error('legacy');}},config:{async getProfile(){return{url:'https://fixture.invalid',model,key:'fake'};}},createModelRequester:profiles=>createModelRequester(profiles,client),materials:{async readForQuestion(){materialReads++;return{status:'empty',message:'',routerText:'',materials:[],coverage:{partial:false,cseStatus:'ready'}};}},worldSettings:{async read(){referenceReads++;return{characterDescription:'日间小店',books:[],partial:false};}},diagnostics:{begin(trigger,details){const run={id:String(runs.length+1),trigger,details,events:[]};runs.push(run);return{id:run.id,record(stage,data){run.events.push({stage,data});},protect(){}};}},advancer:{advance(){throw Error('legacy');}}});
 app.configureDevelopment({isEnabled:()=>true,getEveryReplies:()=>1});
 return{app,saved,sent,runs,gate,get stored(){return stored;},get puts(){return puts;},get materialReads(){return materialReads;},get referenceReads(){return referenceReads;}};
}
test('smell ACK is saved without advancing people and hearing uses that exact ACK and latest profile',async()=>{
 const f=fixture();await f.app.refresh();await f.app.startDevelopment();
 assert.equal(f.sent.length,2);assert.equal(f.saved.length,2);assert.equal(f.saved[0].processedThroughSeq,1);assert.equal(f.saved[0].storyTime.text,'2027-03-20T08:00');assert.equal(f.saved[0].simulationRanges,undefined);
 const hearing=JSON.parse(f.sent[1].messages[1].content);assert.equal(hearing.atmospheres[0].description,'等候新货期间仍倾向按原计划办事。（ACK）');assert.deepEqual(f.sent.map(w=>w.model),['first','second']);assert.equal(f.stored.processedThroughSeq,2);assert.equal(f.materialReads,2);assert.equal(f.referenceReads,0);
 assert.equal(f.app.developmentView.value.modelCalls,2);assert.equal(f.app.developmentView.value.remainingCalls,0);
 const rawRuns=f.runs.filter(run=>run.events.some(e=>e.stage==='model-response'));assert.equal(rawRuns.length,2);assert.notEqual(rawRuns[0].id,rawRuns[1].id);assert.equal(rawRuns[0].details.parentId,rawRuns[1].details.parentId);
});
test('resaving a failed smell candidate does not regenerate it and then continues the one unissued hearing request',async()=>{
 const f=fixture({failSave:1});await f.app.refresh();await f.app.startDevelopment();assert.equal(f.sent.length,1);assert.equal(f.app.developmentView.value.canSave,true);assert.match(f.app.developmentView.value.error,/继续|剩余/);
 await f.app.saveDevelopment();assert.equal(f.sent.length,2);assert.equal(f.puts,3);assert.equal(f.stored.processedThroughSeq,2);assert.equal(f.materialReads,2);
});
test('stop during the first save waits for ACK and a later explicit update only issues hearing',async()=>{
 const f=fixture({blockSave:1});await f.app.refresh();const work=f.app.startDevelopment();while(!f.puts&&f.app.state.value.busy)await new Promise(r=>setImmediate(r));assert.equal(f.puts,1);f.app.stopDevelopment();f.gate.resolve();await work;
 assert.equal(f.sent.length,1);assert.equal(f.saved.length,1);assert.equal(f.stored.processedThroughSeq,1);assert.equal(f.app.developmentView.value.status,'stopped');await f.app.onStoryCompleted();assert.equal(f.sent.length,1);
 await f.app.startDevelopment();assert.equal(f.sent.length,2);assert.equal(f.stored.processedThroughSeq,2);assert.equal(f.materialReads,2);
});
test('hearing API failure reports partial completion and only explicit retry resumes hearing with coherent call counts',async()=>{
 const f=fixture({failHearing:true});await f.app.refresh();await f.app.startDevelopment();assert.equal(f.sent.length,2);assert.equal(f.saved.length,1);assert.match(f.app.developmentView.value.error,/背景/);await f.app.onStoryCompleted();assert.equal(f.sent.length,2);
 await f.app.startDevelopment();assert.equal(f.sent.length,3);assert.equal(f.saved.length,2);assert.equal(f.materialReads,2);assert.equal(f.app.developmentView.value.modelCalls,3);assert.equal(f.app.developmentView.value.totalCalls,3);assert.equal(f.app.developmentView.value.remainingCalls,0);
});
test('resaving a failed hearing candidate saves the existing result with no more model calls',async()=>{
 const f=fixture({failSave:2});await f.app.refresh();await f.app.startDevelopment();assert.equal(f.sent.length,2);assert.equal(f.saved.length,1);assert.equal(f.app.developmentView.value.canSave,true);
 await f.app.saveDevelopment();assert.equal(f.sent.length,2);assert.equal(f.puts,3);assert.equal(f.stored.processedThroughSeq,2);assert.equal(f.app.developmentView.value.remainingCalls,0);
});
