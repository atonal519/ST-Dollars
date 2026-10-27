import {readonly,shallowRef,type ShallowRef} from 'vue';
import type {ControllerDependencies,ControllerState,PeopleDirectoryRead,StoryInput,ModelRequest} from './contracts';
import type {NpcWorldState} from '../domain/world-state';
import {generateDevelopment,prepareDevelopment,rebaseDevelopmentPreparation,type DevelopmentPreparation} from '../simulation/development';
import {generateAtmosphere} from '../simulation/atmosphere';
import {generateWorldConstruction,prepareWorldConstruction} from '../simulation/world-construction';
import {mergeWorldPeople} from '../domain/world-foundation';
import {MaterialsNotReadyError} from '../simulation/life-materials';
import {beginDiagnostic,recordDiagnostic,protectDiagnostic,diagnosticError,type DiagnosticTrace} from '../diagnostics/development';

export interface DevelopmentView {status:'idle'|'running'|'saved'|'waiting'|'error'|'stopped';started:boolean;pendingReplies:number;everyReplies:number;processedThroughSeq:number|null;modelCalls:number;totalCalls:number;remainingCalls:number;requestPending:boolean;saving:boolean;canSave:boolean;needsReload:boolean;message:string;error:string}
type Snapshot={directory:PeopleDirectoryRead|null;state:NpcWorldState|null;revision:number|null};
type Module='olfaction'|'hearing'|'construction';
type Batch={people:PeopleDirectoryRead['people'];state:NpcWorldState;revision:number|null;story:StoryInput;initial:boolean;prepared:DevelopmentPreparation;module:Module;smellReady:boolean;constructionOnly:boolean;flowPrepared:boolean;diagnostic?:DiagnosticTrace};
type Candidate={state:NpcWorldState;revision:number|null;module:Module;diagnostic?:DiagnosticTrace};

export function createDevelopmentController(input:{deps:ControllerDependencies;state:ShallowRef<ControllerState>;refresh():Promise<void>;snapshot():Snapshot;publish(state:NpcWorldState,revision:number,people:PeopleDirectoryRead['people']):void}) {
  const view=shallowRef<DevelopmentView>({status:'idle',started:false,pendingReplies:0,everyReplies:1,processedThroughSeq:null,modelCalls:0,totalCalls:2,remainingCalls:2,requestPending:false,saving:false,canSave:false,needsReload:false,message:'',error:''});
  let settings={isEnabled:()=>false,getEveryReplies:()=>1};
  // Only this ordinary in-memory batch survives a manual stop or failed module/save.
  let batch:Batch|null=null,candidate:Candidate|null=null,abort:AbortController|null=null;
  let stopping=false,activeDiagnostic:DiagnosticTrace|undefined,plannedCalls=2;
  function begin(trigger:string,details:Record<string,unknown>={}){const snapshot=input.snapshot();return beginDiagnostic(input.deps.diagnostics,trigger,{scopeId:snapshot.directory?.scopeId??null,revision:snapshot.revision,processedThroughSeq:snapshot.state?.processedThroughSeq??null,...details});}
  function counts(remaining:number){view.value={...view.value,remainingCalls:remaining,totalCalls:Math.max(plannedCalls,view.value.modelCalls+remaining)};}
  function remaining(){return batch?.module==='construction'?batch.constructionOnly?1:3:batch?.module==='hearing'?1:2;}
  function read(snapshot:Snapshot,initial=false):StoryInput|null {
    if(!snapshot.state||!snapshot.directory?.scopeId||!input.deps.history)return null;
    const baseline=initial&&snapshot.state.worldBaseline?.needsCurrentDevelopment&&snapshot.state.worldBaseline.throughSeq>0?snapshot.state.worldBaseline:undefined;
    const fromSeq=initial?1:(snapshot.state.processedThroughSeq??0)+1;
    const result=input.deps.history.readStoryHistory({fromSeq,...(baseline?{toSeq:baseline.throughSeq}:{}),scopeId:snapshot.directory.scopeId,stableOnly:true,currentOnly:initial});
    const processed=snapshot.state.processedThroughSeq;
    const turns=initial&&processed!==null?result.turns.map(turn=>turn.seq<=processed?{...turn,calibrationEligible:false}:turn):result.turns;
    return{status:result.status,throughSeq:result.throughSeq,latestAiSeq:result.latestAiSeq,turns,source:result.source,message:result.message};
  }
  function inspect(){const snapshot=input.snapshot(),story=read(snapshot);view.value={...view.value,started:snapshot.state?.automaticDevelopmentEnabled===true,pendingReplies:story?.turns.filter(turn=>!turn.isUser).length??0,everyReplies:settings.getEveryReplies(),processedThroughSeq:snapshot.state?.processedThroughSeq??null};}
  function moduleTrace(current:Batch,module:Module){return beginDiagnostic(input.deps.diagnostics,module,{parentId:current.diagnostic?.id,module,scopeId:current.state.scopeId,revision:current.revision,processedThroughSeq:current.state.processedThroughSeq,throughSeq:current.story.throughSeq});}
  function requester(diagnostic:DiagnosticTrace|undefined){return{async request(request:ModelRequest){
    request.signal?.throwIfAborted();const primary=await input.deps.config.getProfile('primary');request.signal?.throwIfAborted();protectDiagnostic(diagnostic,[primary.key,primary.url]);
    try{return await input.deps.createModelRequester({primary,secondary:primary}).request({...request,diagnostic,onStarted:()=>{view.value={...view.value,modelCalls:view.value.modelCalls+1,requestPending:true};counts(Math.max(0,view.value.remainingCalls-1));request.onStarted?.();}});}
    finally{view.value={...view.value,requestPending:false};}
  } };}
  async function persist(diagnostic=candidate?.diagnostic):Promise<boolean> {
    if(!candidate||!batch)return false;
    const current=candidate,currentBatch=batch;view.value={...view.value,saving:true,canSave:false};
    try {
      recordDiagnostic(diagnostic,'save-started',{module:current.module,expectedRevision:current.revision,throughSeq:current.state.processedThroughSeq});
      const saved=await input.deps.repository.save(current.state.scopeId,current.state,current.revision,diagnostic);
      input.publish(saved.state,saved.revision,currentBatch.people);candidate=null;
      recordDiagnostic(diagnostic,'published',{module:current.module,revision:saved.revision,throughSeq:saved.state.processedThroughSeq,totalActivities:saved.state.activities.length,totalEvents:saved.state.events.length,totalKnowledge:saved.state.knowledge.length,atmosphereCount:saved.state.developmentAtmospheres?.length??0});
      if(current.module==='construction') {
        if(currentBatch.constructionOnly){batch=null;counts(0);view.value={...view.value,status:stopping?'stopped':'saved',saving:false,needsReload:false,error:'',message:stopping?'世界已构建，请点击「百相流转」继续。':saved.state.automaticDevelopmentEnabled?'世界已构建，自动流转继续等待新的稳定剧情。':'世界已构建，请点击「百相流转」启用自动更新。'};}
        else{currentBatch.state=saved.state;currentBatch.revision=saved.revision;currentBatch.people=mergeWorldPeople(currentBatch.people,saved.state);currentBatch.prepared=rebaseDevelopmentPreparation({...currentBatch},currentBatch.prepared);currentBatch.module='olfaction';currentBatch.initial=true;view.value={...view.value,status:stopping?'stopped':'running',saving:false,error:'',message:stopping?'世界基础已保存，可点百相流转继续剩余部分。':'世界基础已保存，继续形成局部情绪。'};}
      } else if(current.module==='olfaction') {
        currentBatch.state=saved.state;currentBatch.revision=saved.revision;currentBatch.people=mergeWorldPeople(currentBatch.people,saved.state);currentBatch.prepared={...rebaseDevelopmentPreparation({...currentBatch},currentBatch.prepared),worldSettings:undefined};currentBatch.module='hearing';currentBatch.smellReady=true;
        view.value={...view.value,status:stopping?'stopped':'running',saving:false,needsReload:false,error:'',message:stopping?'背景已保存，人物事务尚未更新；点百相流转继续剩余部分。':'背景已保存，正在更新人物事务。'};
      } else {
        batch=null;counts(0);view.value={...view.value,status:stopping?'stopped':'saved',saving:false,needsReload:false,error:'',message:stopping?'本次已保存，后续自动更新已暂停。':'本轮更新已保存。'};
      }
      inspect();return true;
    } catch(error) {
      recordDiagnostic(diagnostic,'save-failed',diagnosticError(error));const detail=error as Error&{status?:number;code?:string},conflict=detail.status===409||detail.code==='conflict',uncertain=detail.status===0||detail.code==='network_error'||detail.code==='invalid_response';
      if(conflict){candidate=null;batch=null;}
      const retry=current.module==='construction'?'世界基础保存失败，结果已保留，可重新保存，不会再调用模型。':current.module==='olfaction'?'背景保存失败，结果已保留；重新保存不会重发情绪请求，成功后继续剩余一次人物发展。':'人物事务保存失败，结果已保留，可重新保存，不会再调用模型。';
      view.value={...view.value,status:'error',saving:false,canSave:!conflict&&!uncertain,needsReload:conflict||uncertain,error:conflict?'记录已变化，请重新读取后更新；不会覆盖新记录。':uncertain?'未收到保存确认，请重新读取确认。':retry,message:''};return false;
    }
  }
  async function runBatch(signal:AbortSignal):Promise<boolean> {
    if(!batch)return false;const current=batch;
    if(current.module==='construction') {
      const diagnostic=moduleTrace(current,'construction');activeDiagnostic=diagnostic;
      view.value={...view.value,message:'正在整理人物与稳定社交基础。'};
      const result=await generateWorldConstruction({people:current.people,state:current.state,story:current.story,initial:true,prepared:current.prepared,signal,diagnostic,dependencies:{materials:input.deps.materials,worldSettings:input.deps.worldSettings,model:requester(diagnostic)}});
      signal.throwIfAborted();candidate={state:result.state,revision:current.revision,module:'construction',diagnostic};const saved=await persist();if(!saved||!batch||stopping)return saved;
    }
    if(current.module==='olfaction') {
      if(!current.flowPrepared){current.prepared=await prepareDevelopment({...current,worldSettings:current.prepared.worldSettings,signal,dependencies:{materials:input.deps.materials,worldSettings:input.deps.worldSettings,model:requester(current.diagnostic)}});current.flowPrepared=true;}
      const diagnostic=moduleTrace(current,'olfaction');activeDiagnostic=diagnostic;
      view.value={...view.value,message:'正在形成局部风向。'};
      const result=await generateAtmosphere({people:current.people,state:current.state,story:current.story,initial:current.initial,prepared:current.prepared,signal,diagnostic,dependencies:{materials:input.deps.materials,worldSettings:input.deps.worldSettings,model:requester(diagnostic)}});
      signal.throwIfAborted();
      if(result.changed){candidate={state:result.state,revision:current.revision,module:'olfaction',diagnostic};if(!await persist())return false;}
      else{current.prepared={...current.prepared,worldSettings:undefined};current.module='hearing';current.smellReady=true;recordDiagnostic(diagnostic,'unchanged',{module:'olfaction',atmosphereCount:current.state.developmentAtmospheres?.length??0});}
    }
    if(stopping||!settings.isEnabled()){view.value={...view.value,status:'stopped',message:'背景已保存或沿用，人物事务尚未更新；点百相流转继续剩余部分。'};return false;}
    signal.throwIfAborted();const diagnostic=moduleTrace(current,'hearing');activeDiagnostic=diagnostic;
    view.value={...view.value,status:'running',message:'正在更新人物事务与经历。'};
    const result=await generateDevelopment({people:current.people,state:current.state,story:current.story,initial:current.initial,prepared:current.prepared,signal,diagnostic,dependencies:{materials:input.deps.materials,worldSettings:input.deps.worldSettings,model:requester(diagnostic)}});
    signal.throwIfAborted();candidate={state:result.state,revision:current.revision,module:'hearing',diagnostic};return persist();
  }
  function failed(error:unknown,signal:AbortSignal,diagnostic?:DiagnosticTrace){
    recordDiagnostic(diagnostic,signal.aborted?'stopped':'failed',diagnosticError(error));counts(remaining());
    const partial=batch?.smellReady===true;
    view.value=signal.aborted?{...view.value,status:'stopped',requestPending:false,error:'',message:partial?'背景已保存或沿用，人物事务已停止；点百相流转继续剩余部分。':view.value.started?'已停止，自动更新已暂停；可点百相流转继续。':'已停止，可重新开始百相流转。'}:{...view.value,status:'error',requestPending:false,error:partial?`背景已保存或沿用，人物事务未更新：${error instanceof Error?error.message:'生成失败。'} 点百相流转重试剩余部分。`:error instanceof Error?error.message:'人物发展失败，请重新更新。',message:''};
  }
  async function update(automatic=false,diagnostic=begin('manual'),construction=false):Promise<void> {
    if(input.state.value.busy||candidate||!settings.isEnabled()){recordDiagnostic(diagnostic,'skipped',{reason:input.state.value.busy?'busy':candidate?'candidate':'disabled'});return;}
    if(automatic&&['error','stopped'].includes(view.value.status)){recordDiagnostic(diagnostic,'skipped',{reason:view.value.status});return;}
    if(!batch||construction){plannedCalls=construction?1:input.snapshot().state?.foundation?2:3;view.value={...view.value,modelCalls:0,totalCalls:plannedCalls,remainingCalls:plannedCalls,requestPending:false};}
    stopping=false;input.state.value={...input.state.value,busy:true};abort=new AbortController();const currentAbort=abort;let saved=false;
    activeDiagnostic=diagnostic;view.value={...view.value,error:'',message:'',canSave:false,needsReload:false};
    try {
      if(!batch||construction) {
        await input.refresh();currentAbort.signal.throwIfAborted();if(input.state.value.error)recordDiagnostic(diagnostic,'world-read-failed',{error:input.state.value.error});
        const snapshot=input.snapshot();
        // Later automatic updates consume new stable floors; explicit flow keeps its current baseline pass.
        const initial=construction||!snapshot.state?.foundation||(!automatic&&snapshot.state?.worldBaseline?.needsCurrentDevelopment===true)||snapshot.state?.automaticDevelopmentEnabled!==true;
        recordDiagnostic(diagnostic,'world-loaded',{scopeId:snapshot.directory?.scopeId,revision:snapshot.revision,processedThroughSeq:snapshot.state?.processedThroughSeq,initial});
        if(automatic&&snapshot.state?.automaticDevelopmentEnabled!==true){recordDiagnostic(diagnostic,'skipped',{reason:'not-started'});return;}
        const story=read(construction&&snapshot.state?{...snapshot,state:{...snapshot.state,worldBaseline:undefined}}:snapshot,initial);inspect();
        recordDiagnostic(diagnostic,'story-read',{throughSeq:story?.throughSeq,latestAiSeq:story?.latestAiSeq,stableOnly:true,storyStatus:story?.status,peopleCount:snapshot.directory?.people.length,pendingReplies:view.value.pendingReplies,everyReplies:settings.getEveryReplies()});
        if(!snapshot.state||!snapshot.directory?.scopeId||!story||story.status!=='ready'&&!(construction&&story.status==='empty')||!construction&&snapshot.state.foundation&&!snapshot.directory.people.length){recordDiagnostic(diagnostic,'skipped',{reason:'waiting',message:story?.message||input.state.value.source.message});view.value={...view.value,status:'waiting',message:story?.message||input.state.value.source.message||'等待首个正式正文和人物资料。'};return;}
        if(!initial&&!story.turns.some(turn=>!turn.isUser)){recordDiagnostic(diagnostic,'skipped',{reason:'no-new-ai'});return;}
        if(automatic&&!initial&&story.turns.filter(turn=>!turn.isUser).length<settings.getEveryReplies()){recordDiagnostic(diagnostic,'skipped',{reason:'below-n'});return;}
        const buildFoundation=construction||!snapshot.state.foundation;
        plannedCalls=construction?1:buildFoundation?3:2;
        view.value={...view.value,status:'running',modelCalls:0,totalCalls:plannedCalls,remainingCalls:plannedCalls,requestPending:false};
        const preparation={people:snapshot.directory.people,state:snapshot.state,story,initial,signal:currentAbort.signal,diagnostic,dependencies:{materials:input.deps.materials,worldSettings:input.deps.worldSettings,model:requester(diagnostic)}};
        const prepared=await (buildFoundation?prepareWorldConstruction(preparation):prepareDevelopment(preparation));
        if(construction&&story.throughSeq===null&&!snapshot.directory.people.some(person=>person.description.trim())&&!prepared.worldSettings?.characterDescription.trim()&&!prepared.worldSettings?.books.some(book=>book.entries.some(entry=>entry.content.trim()))&&!snapshot.state.foundation&&!snapshot.state.events.length){view.value={...view.value,status:'waiting',message:'当前还没有可用于世界构建的人物或卡书资料。'};recordDiagnostic(diagnostic,'skipped',{reason:'no-materials'});return;}
        recordDiagnostic(diagnostic,'life-gate',{reason:prepared.restHint.reason,throughSeq:story.throughSeq,routineCount:snapshot.state.developmentRoutines?.length??0});
        batch={people:snapshot.directory.people,state:snapshot.state,revision:snapshot.revision,story,initial,prepared,module:buildFoundation?'construction':'olfaction',smellReady:false,constructionOnly:construction,flowPrepared:!buildFoundation,diagnostic};
      } else {counts(remaining());view.value={...view.value,status:'running'};}
      saved=await runBatch(currentAbort.signal);
    }catch(error){if(error instanceof MaterialsNotReadyError&&!currentAbort.signal.aborted){recordDiagnostic(diagnostic,'materials-waiting',{message:error.message});view.value={...view.value,status:'waiting',requestPending:false,error:'',message:error.message};}else failed(error,currentAbort.signal,activeDiagnostic??diagnostic);}
    finally{abort=null;activeDiagnostic=undefined;input.state.value={...input.state.value,busy:false};}
    // A manual construction is one request; only a later host event may resume automatic flow.
    if(saved&&!batch&&!construction)await onCompleted({source:'after-save',parentId:diagnostic?.id});
  }
  async function onCompleted(details:Record<string,unknown>={}) {
    const diagnostic=begin(details.source==='after-save'?'after-save':'story-completed',details);
    if(input.state.value.busy||!settings.isEnabled()){recordDiagnostic(diagnostic,'skipped',{reason:input.state.value.busy?'busy':'disabled'});return;}
    if(!input.snapshot().state){await input.refresh();if(input.state.value.error)recordDiagnostic(diagnostic,'world-read-failed',{error:input.state.value.error});}inspect();
    if(candidate||['error','stopped'].includes(view.value.status)){recordDiagnostic(diagnostic,'skipped',{reason:['error','stopped'].includes(view.value.status)?view.value.status:'candidate',status:view.value.status});return;}
    const current=input.snapshot();recordDiagnostic(diagnostic,'eligibility',{scopeId:current.directory?.scopeId,revision:current.revision,pendingReplies:view.value.pendingReplies,everyReplies:settings.getEveryReplies(),processedThroughSeq:view.value.processedThroughSeq});
    if(view.value.started&&view.value.pendingReplies>=settings.getEveryReplies())await update(true,diagnostic);else recordDiagnostic(diagnostic,'skipped',{reason:!view.value.started?'not-started':view.value.pendingReplies===0?'no-new-ai':'below-n'});
  }
  async function save(){
    if(input.state.value.busy||!candidate||!view.value.canSave)return;const diagnostic=begin('resave',{parentId:candidate.diagnostic?.id,module:candidate.module}),constructionOnly=batch?.constructionOnly===true;
    stopping=false;input.state.value={...input.state.value,busy:true};abort=new AbortController();const currentAbort=abort;let saved=false;
    try{if(await persist(diagnostic)){if(batch&&!stopping)saved=await runBatch(currentAbort.signal);else saved=!batch;}}
    catch(error){failed(error,currentAbort.signal,activeDiagnostic??diagnostic);}
    finally{abort=null;activeDiagnostic=undefined;input.state.value={...input.state.value,busy:false};}
    if(saved&&!batch&&!constructionOnly)await onCompleted({source:'after-save',parentId:diagnostic?.id});
  }
  async function reload(){if(input.state.value.busy)return;await input.refresh();if(candidate&&candidate.revision===input.snapshot().revision){view.value={...view.value,canSave:true,needsReload:false,error:candidate.module==='olfaction'?'原版本未变化，可重存背景后继续剩余一次人物发展。':'原版本未变化，可重新保存已保留结果。'};}else{candidate=null;batch=null;view.value={...view.value,status:'idle',needsReload:false,canSave:false,error:'',message:view.value.started?'已重新读取，可点百相流转更新。':'已重新读取，可开始百相流转。'};}inspect();}
  return{view:readonly(view),configure(next:typeof settings){settings=next;inspect();},inspect,start:()=>update(false),construct:()=>update(false,begin('world-construction'),true),onCompleted,save,reload,stop(){recordDiagnostic(activeDiagnostic,'stop-requested',{status:view.value.saving?'saving':'waiting'});stopping=true;if(!view.value.saving)abort?.abort();}};
}
