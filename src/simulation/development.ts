import {boundAtmospheres} from '../domain/social-circles';
import {collectLifeMaterials} from './life-materials';
import {mergeLifeRhythm} from './life-rhythm';
import {readStoryClock,normalizeStoryTime} from '../host/story-clock';
import type { AdvanceDependencies, StoryInput,WorldSettings } from '../application/contracts';
import type { SourcePerson } from '../domain/source-people';
import type { Activity, Knowledge, SimulationWindow, WorldEvent } from '../domain/world';
import type { NpcWorldState } from '../domain/world-state';
import {discardInvalidAtmospheres} from '../domain/world-state';
import {selectCreativeFrame,type CreativeFrame} from './creative-frame';
import {developmentGate} from './life-rhythm';
import { activityChange, applyCalibration, eligibleCalibration, modelReferenceContract, type Calibration, type CalibrationRejection } from './calibration';
import { asObject, list, newId, responseObject, savedEndpoint, strings } from './trajectory';
import { buildPersonContexts } from './person-context';
import { factEvidenceKind } from './fact-sources';
import { developmentBoundary, type BoundaryRejection } from './stage-boundary';
import {recordDiagnostic,diagnosticError,type DiagnosticTrace} from '../diagnostics/development';
import {selectWorldMemory} from './world-memory';
import {foundationSources,foundationReferences,foundationSupplementPersonIds,needsFoundationSupplement,applyFoundation,FOUNDATION_CONTRACT} from './foundation';
import {encodePersonReferences} from '../models/person-references';
import {foundationForInput} from '../domain/world-foundation';
import {returnedIdentity} from './returned-identity';

export const DEVELOPMENT_INSTRUCTIONS = `你只负责“听觉”：首要目标是共同创作narrativeRoles.autonomous所列人物的场外日常，并按本批stages明确的离场/镜头交接更新自主范围。正文校准保留在场者已知事实作为约束，不能以复述在场活动替代场外人物的生活取材。读取input.atmospheres中已接纳的情绪风向成品及原完整资料，发展实际事务、行动、经历和知情，不重新评审、改写或生成风向，不输出atmosphereUpdates。风向只影响选择倾向，不授予人物消息或统一心情。先看每人自己的未完事项、职责、兴趣、承诺及等待条件，再承接已完成事项与实际事件/知情/持续后果，看哪些选择自然延续或改变；不重建已完成事务、不重演旧结果，再看自然交集。creativeFrame只作全体取材倾向，不是人均配额，不评分或因超配重抽。restHint只供判断休息依据，不跳过正文校准。narrativeRoles须结合本批正文重新明确stages，不能把旧分组当新正文归属。
你共同创作全部人物在正文镜头外的自主生活，不是摘要或抽取漏记。一次回答完成当前起点、必要校准、人物选择、行动及实际后果。initial先依据已知事实收拢当前起点，不重写过去；后续在已过时段中，结合各人的职责、兴趣、关系、旧结果和具体等待条件，决定并落实接下来的生活。旧结果应影响处境或后续选择；事务完成后可自然开展下一项，不让所有人只围绕user。正文是时间和不可违背事实的边界，不是允许行动的清单；正文没写人物行动正是创作空间，不能作为平静的理由。真实休息或等待合法，依据应是人物的安排、选择或实际限制，不要求人人每轮有事件。身份、既定关系/职业/经历缺依据不猜。people.description与router是作者参考，不等于全员知情；各人只按明确知情和获知途径行动，retained-report只是收到过的说法。
正文是本轮事实；草稿、HTML注释和图片/参考包装不是已发生事实。已有正文、memory与router中的经历是过去背景，从其结果发展新处境与选择，不把原场景换时间、换叙述再演一次；自然重复的日常须是本时段的新经历。故事user及本时段由正文负责的镜头人物，其本轮未给出的行动、去向、出勤或缺席、回应保持未决；不代演，不把旧状态延成已发生的新事实，也不能编旁人目击或转述替其定案。其他场外NPC可因自己的职责、时限或兴趣离开、做别的事，不必等对方，也不靠假定对方缺席或拒绝找理由。只发展截至本次正文已经过的时段，未来计划/承诺只写activities的打算或等待条件，不能写为已发生events。无可信耗时不猜日期或提前完成需时任务；跳时可同答交代有序变化，时间保持原精度。
同答先给stages有序时段：每段{key,sourceSeqs,onstagePersonIds,offstagePersonIds}，同楼可分多段；onstage只列正文实际负责的人物，提名不算在场，offstage只列正文明确离场/镜头交接的人物，未提及不算离场。从previousOnstagePersonIds承接，离场后可发展，重入场交回正文；另一人回到同一场景或镜头不代表原在场者离开，未明确交接或离场者继续保护；不要把一批曾出场者整批排除。sourceSeqs必须属于输入story，calibrationEligible=false只供时间参考，不能据此新增/解除在场；cameraPersonIds由调用方负责本批，不能解除。user始终不自主，即使不在people目录。
每条activities/events/knowledge/continuingEffects都给stageKey、assertedPersonIds和assertsUser（布尔）；主体列出本段新增或改变的事实涉及谁，包括间接未到场、未答复、旧活动被延伸的对象，不只行动参与者；仅引用已给的过去事实或关系作背景不算新增断言。在场段只接正文事实/calibration，不创作其同步行动或间接未决事实；活动截止checkpoint也不得替末段在场者安排新状态。事件按自己段归属，合法场外人物可共同行动；不要借省略旧参与者越界。新创作无已知精确时刻时只保留所属区间。校准仍独立按正文依据处理，不能把参考钟点当正文人物事实。
本次必须共同评估粗作息并输出routines数组：依据已给身份、世界规律与安排，可暂定宽泛activeHours（0至24，跨夜如22至6），tentative:true并写basis，不冒称正文已有精确时间；夜戏不等于固定夜行。确无依据用activeHours:[]，不要求人人有有效时段，不默认全员夜睡；已有作息无新依据则沿用。arrangements:[{personId,kind:"active"或"rest",from:"明确故事日期时分",to:"明确故事日期时分",sourceSeqs:[本批合格正式正文楼号]}]只同步正文明确成立的临时工作/休息/到点安排，必须给合格sourceSeqs，参考钟不能作依据，不把猜测当精确日程，同人同起止可更新kind；日常细节不必逐条建事务，重要承诺/条件/后果仍保留。
输出一个完整JSON，字段为routines、arrangements、stages、storyTime、activities、events、knowledge、calibration、continuingEffects、quietReason。stages各项必须有key/sourceSeqs/onstagePersonIds/offstagePersonIds，sourceSeqs逐字选input.sourceContract.storySeqs，不写本批相对楼号。storyTime含text/sourceSeqs/elapsed，时间需正文有据。事务title最多12字，只写核心事项；过程与实际结果写description，用完整句并保留句末标点。新自主事务每项必须有key/title/status/participantIds及stageKey/assertedPersonIds/assertsUser；participantIds只列实际参与者，不能用断言主体替代，也不能省略。events含key/activityId（无所属事务可空）/title/description/participantIds及归属字段；knowledge含personId/eventId/reason及归属字段；continuingEffects必须有eventId/personIds及归属字段。正文新事务完整放calibration.activityUpdates的key/change/sourceSeqs，既有id只取实际输入或本答已有效建立的局部key。routines按每人personId/activeHours/tentative/basis给出；arrangements按personId/kind/from/to/sourceSeqs给出。calibration的facts/eventCorrections/activityUpdates/knowledgeCorrections各为数组，按input.calibrationContract字段合同逐项填写。没有变化的数组可空，平静须给具体quietReason；全体提交工作均不合合同不能再以平静说明代替。
活动状态只用planned/active/waiting/completed；既有活动用id，新活动用key。截至终点仍在做、已准备去做或等待具体条件的自主创作事项进activities，正文已知事务走calibration.activityUpdates，description写当前进展与下一步或等候条件，不只留在经历或已完描述里。同一实际事项沿已有ID，不因来电/接电角色、参与者子集、称谓或等待视角另建。沿用身份不要求替全部旧参与者推进；在场回应未决可继续等待，不删旧参与者另开项绕边界。原事务继续则保留同ID的未完状态；原事务完成而确有下一事时，旧项completed并另给planned/waiting/active下一项；没有下一事可直接结束，不为每人强造任务。event.storyTime可给实际原精度时间，未给沿窗口区间；continuingForPersonIds标仍有影响的人物。events按实际发生顺序；共同互动只有一个事件，各人引用同一结果。不重复旧事件/已知知情充新成果。activities是截止时点checkpoint，绝不能塞回早期事件；新活动过去初建只由首次事件显式activityChange给出，未给就不补过去快照。后续事件仅记录自己的明确变化，完成不从头复活，后续事务另立。每人可有多项持续事务，平静或等待合法。
people.specialRole=user明确故事user，不能替此人生成自主行动或答复；char与普通NPC平等考虑。人物只用输入P代号，活动/事件只用已有ID或明确定义局部key，不按名称猜。正文已明确的当前事务或未来承诺放calibration.activityUpdates：已有用id，新建用key及change中的title/description/status/participantIds，引用本次合格原文sourceSeqs；包括在场者/user的已知事务，保留全部可确认NPC参与者；仅user且目录无其ID时participantIds显式为空，不虚造user ID。它只同步已知事实、不自动产生事件或知情，同答可用该key、以后用保存ID。其他校准只修正文明确推翻的部分，保留原说法及真实报告经历，不因摘要漏细节整条作废。新创作的进展和完成放activities/events，不放calibration冒充正文；输入turn.calibrationEligible=false仅供时间或镜头参考，不能作为任何正文校准依据，也不能在返回中改其资格。人工内容和正文原事实不可覆盖；calibration格式沿input.calibrationContract，来源必须为本次已给原文或合格history-floor事实。不要输出思考或索要下一次模型请求。`;

export interface DevelopmentInput { people: SourcePerson[]; state: NpcWorldState; story: StoryInput; initial: boolean; cameraPersonIds?: string[]; diagnostic?:DiagnosticTrace }
/** A rebuilt current baseline may refer to older stable prose without moving the existing world back. */
export const processedCurrentReference=(input:DevelopmentInput)=>input.initial&&input.state.processedThroughSeq!==null&&(input.story.throughSeq===null||input.story.throughSeq<=input.state.processedThroughSeq);
export const developmentClock=(input:DevelopmentInput)=>processedCurrentReference(input)?input.state.storyTime?.text??null:readStoryClock(input.story.turns);
export interface DevelopmentResult { state: NpcWorldState; window: SimulationWindow; addedEvents: number; addedKnowledge: number; changedActivities: number; boundaryRejections: BoundaryRejection[]; calibrationRejections:CalibrationRejection[]; acceptedWork:number; submittedWork:number }
export interface DevelopmentPreparation {materials:Awaited<ReturnType<typeof collectLifeMaterials>>['materials'];worldSettings?:WorldSettings;currentClock:string|null;creativeFrame:CreativeFrame;narrativeRoles:{storyControlled:Array<{personId:string;name:string}>;autonomous:Array<{personId:string;name:string}>;policy:string};restHint:ReturnType<typeof developmentGate>}
export function rebaseDevelopmentPreparation(input:DevelopmentInput,prepared:DevelopmentPreparation):DevelopmentPreparation {
 const controlled=new Set([...(input.state.developmentOnstagePersonIds??[]),...(input.cameraPersonIds??[]),...input.people.filter(person=>person.specialRole==='user').map(person=>person.id)]);
 return {...prepared,worldSettings:needsFoundationSupplement(input.people,input.state)?prepared.worldSettings:undefined,narrativeRoles:{storyControlled:input.people.filter(person=>controlled.has(person.id)).map(person=>({personId:person.id,name:person.displayName})),autonomous:input.people.filter(person=>!controlled.has(person.id)).map(person=>({personId:person.id,name:person.displayName})),policy:prepared.narrativeRoles.policy},restHint:input.initial?{generate:true,reason:'initial'}:developmentGate(input.state,input.people,prepared.currentClock)};
}
const manual = (value: { sources: Array<{kind: string}> }) => value.sources.some(source => source.kind === 'manual');
const equal = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
function unchangedActivityReference(row:Record<string,any>,old:Activity,ids:Set<string>,change:ReturnType<typeof activityChange>) {
 if(row.id!==old.id||row.assertsUser!==false||!Array.isArray(row.assertedPersonIds)||row.assertedPersonIds.some((id:unknown)=>typeof id!=='string'||!old.participantIds.includes(id)))return false;
 for(const field of ['title','description'])if(Object.hasOwn(row,field)&&(typeof row[field]!=='string'||!row[field].trim()))return false;
 if(Object.hasOwn(row,'status')&&!['planned','active','waiting','completed'].includes(row.status))return false;
 for(const field of ['participantIds','personIds'])if(Object.hasOwn(row,field)&&(!Array.isArray(row[field])||row[field].some((id:unknown)=>typeof id!=='string'||!ids.has(id))))return false;
 return equal({...old,...change},old);
}

export async function prepareDevelopment(input:DevelopmentInput & {dependencies:AdvanceDependencies;worldSettings?:WorldSettings;signal?:AbortSignal;diagnostic?:DiagnosticTrace}):Promise<DevelopmentPreparation> {
  input.signal?.throwIfAborted();
  const needReferences=needsFoundationSupplement(input.people,input.state);
  let worldSettings=needReferences?input.worldSettings:undefined;
  if(needReferences&&!worldSettings&&input.dependencies.worldSettings)try{worldSettings=await input.dependencies.worldSettings.read();}catch{worldSettings={characterDescription:'',books:[],partial:true};}
  input.signal?.throwIfAborted();
  const collected=await collectLifeMaterials(input.people,input.state,input.dependencies.materials,input.story.throughSeq);
  const materials=collected.materials;
  recordDiagnostic(input.diagnostic,'materials-read',{materialReads:collected.readCount,materialCharacters:collected.characters,requestedCharacters:collected.requestedCharacters,throughSeq:input.story.throughSeq});
  input.signal?.throwIfAborted();
  const currentClock=developmentClock(input),controlled=new Set([...(input.state.developmentOnstagePersonIds??[]),...(input.cameraPersonIds??[]),...input.people.filter(person=>person.specialRole==='user').map(person=>person.id)]);
  return {materials,worldSettings,currentClock,creativeFrame:selectCreativeFrame(input.state.scopeId,currentClock,input.state.developmentCreativeFrame),narrativeRoles:{storyControlled:input.people.filter(person=>controlled.has(person.id)).map(person=>({personId:person.id,name:person.displayName})),autonomous:input.people.filter(person=>!controlled.has(person.id)).map(person=>({personId:person.id,name:person.displayName})),policy:'这里只列已承接的镜头归属；本批新入场/离场仍据正文在stages明确，未提及不解除。user始终不自主。'},restHint:input.initial?{generate:true,reason:'initial'}:developmentGate(input.state,input.people,currentClock)};
}

export function developmentContext(input:DevelopmentInput,prepared:DevelopmentPreparation) {
  const {materials,worldSettings}=prepared;
  const memory=selectWorldMemory(input.people,input.state);
  const foundation=foundationForInput(input.state.foundation,input.people);
  recordDiagnostic(input.diagnostic,'memory-selected',{selectedEvents:memory.events.length,totalEvents:input.state.events.length,selectedKnowledge:memory.knowledge.length,selectedActivities:memory.activities.length});
  return {
    initial: input.initial, throughSeq: input.story.throughSeq,
    people: input.people.map(person => ({id: person.id, name: person.displayName, aliases: person.aliases, description: person.description, specialRole: person.specialRole})),
    story: input.story.turns, previousStoryTime: input.initial?null:input.state.storyTime, currentClock:prepared.currentClock, worldSettings,
    routines: input.state.developmentRoutines??[], arrangements: input.state.developmentArrangements??[],
    referencePolicy:'QQJ非空人工决定与正文事实优先；有用当前字段继续参考，空或不适用的普通自动字段由同次模型对照许可卡书及已存基础选择补充，不回灌旧QQJ简介。人物资料不是历史快照或当前行动/知情证据。',
    previousOnstagePersonIds: input.state.developmentOnstagePersonIds ?? [], cameraPersonIds: input.cameraPersonIds ?? [],
    activities: memory.activities, events: memory.events.map(event => ({...event, evidenceKind: factEvidenceKind(event, input.state.scopeId)})), knowledge: memory.knowledge,
    creativeFrame:prepared.creativeFrame,atmospheres:boundAtmospheres(input.people,input.state).map(({visual,...semantic})=>semantic),narrativeRoles:prepared.narrativeRoles,restHint:prepared.restHint,
    foundation,foundationPendingPersonIds:foundationSupplementPersonIds(input.people,input.state),foundationSources:[...foundationSources(input.people,worldSettings,input.story).values()],foundationReferences:foundationReferences(foundation,memory.events),
    personContexts:memory.personContexts, materials,
    ...modelReferenceContract(memory,input.story.turns),
  };
}

export async function generateDevelopment(input: DevelopmentInput & { dependencies: AdvanceDependencies; prepared?:DevelopmentPreparation;signal?: AbortSignal; onStarted?: () => void; diagnostic?:DiagnosticTrace }): Promise<DevelopmentResult> {
  input.signal?.throwIfAborted();
  const prepared=input.prepared??await prepareDevelopment(input);
  const response = await input.dependencies.model.request({ task: 'development', instructions: DEVELOPMENT_INSTRUCTIONS+'\n'+FOUNDATION_CONTRACT+'\n从本轮真正接纳的行动结果判断有据成员进退、关系变化、新圈形成及结束，同答foundation可引用已接纳event key；按共同工作/生活/往来纽带判断，保重叠归属和独立两人关系，不为造圈另创行动。同一圈说明细化/重命名沿旧id，只回新增或实际变化；未变省略。动态项带stageKey/assertedPersonIds/assertsUser及sourceSeqs或basisEventIds，不额外调用。events可用eventLinks:[{eventId,kind:"continues"或"caused-by"}]引用给过的旧事件或本答已接纳key，承接与原因分开，不由同人/时间相邻推因果。', signal: input.signal, onStarted: input.onStarted, input:developmentContext(input,prepared) });
  input.signal?.throwIfAborted();
  recordDiagnostic(input.diagnostic,'apply-started');
  try{const result=applyDevelopment(input,response);recordDiagnostic(input.diagnostic,'applied',()=>({addedEvents:result.addedEvents,addedKnowledge:result.addedKnowledge,changedActivities:result.changedActivities,acceptedWork:result.acceptedWork,submittedWork:result.submittedWork,calibrationRejections:result.calibrationRejections.slice(0,24),boundaryRejections:result.boundaryRejections.slice(0,24),boundaryRejectionCount:result.boundaryRejections.length}));return result;}
  catch(error){recordDiagnostic(input.diagnostic,'apply-failed',diagnosticError(error));throw error;}
}

export function applyDevelopment(input: DevelopmentInput, response: unknown): DevelopmentResult {
  const suppliedMemory=selectWorldMemory(input.people,input.state),initialFoundation=input.state.foundation;
  const outer = responseObject(response); let data = asObject(outer.development) ?? outer;
  if (!['foundation','activities','events','results','knowledge','calibration','routines','arrangements','quietReason'].some(key => Object.hasOwn(data, key))) throw new Error('人物发展结果无法读取，请重新更新。');
  let ids = new Set(input.people.map(person => person.id));
  let boundary = developmentBoundary(input, data);
  const seqs = new Set(input.story.turns.map(turn => turn.seq));
  const endpoint = asObject(data.windowEnd ?? data.storyTime);
  let text = typeof endpoint?.text === 'string' ? normalizeStoryTime(endpoint.text.trim()) : '';
  let sources = Array.isArray(endpoint?.sourceSeqs) ? endpoint.sourceSeqs : [];
  const oldEnd = savedEndpoint(input.state);
  let from = oldEnd ?? {id:newId(),text:input.state.storyTime?.text ?? '当前起点',sourceSeqs:input.story.turns.map(turn=>turn.seq)};
  let validEnd = text && (text === input.state.storyTime?.text || sources.length > 0 && sources.every((seq: number) => seqs.has(seq)));
  const currentClock=developmentClock(input),referenceCurrent=processedCurrentReference(input);
  if(referenceCurrent){text=currentClock??'';sources=oldEnd?.sourceSeqs??[];validEnd=Boolean(text);}
  if(input.initial&&!validEnd&&currentClock){text=currentClock;sources=[input.story.turns.filter(turn=>!turn.isUser).at(-1)!.seq];validEnd=true;}
  // The first flow refines the baseline's same instant; a sourced label cannot create a gap.
  const baselineCurrent=input.initial&&input.state.worldBaseline?.needsCurrentDevelopment===true;
  const to = baselineCurrent ? validEnd ? {...from,text,sourceSeqs:[...new Set<number>(sources)]} : from : input.initial&&!validEnd?{id:newId(),text:'当前起点',sourceSeqs:input.story.turns.map(turn=>turn.seq)}:validEnd && text !== from.text ? {id:newId(),text,sourceSeqs:[...new Set<number>(sources)]} : from;
  if(input.initial)from=to;
  const throughSeq = input.story.throughSeq;
  if (throughSeq === null) throw new Error('尚无可处理的正式正文。');
  const window: SimulationWindow = {id:newId(),kind:validEnd && endpoint?.elapsed === true && from.text !== '当前起点' && from.id !== to.id ? 'elapsed' : 'current',from,to,throughSeq};
  const source = {kind:'simulation' as const,id:window.id,label:from.id === to.id ? to.text : `${from.text} → ${to.text}`};
  let foundationAccepted=0,foundationSubmitted=0;
  const graph=asObject(data.foundation);
  if(graph&&list(graph.people).length){const built=applyFoundation(input,{people:graph.people,groups:[],relations:[]},window,{eventIds:new Set(suppliedMemory.events.map(event=>event.id)),allows:(row,ids)=>boundary.allows(row,ids,'person',true)});foundationAccepted=built.accepted;foundationSubmitted=built.submitted;if(built.accepted)input={...input,people:built.people,state:{...input.state,foundation:built.foundation}};data=encodePersonReferences(data,built.refs) as typeof data;ids=new Set(input.people.map(person=>person.id));boundary=developmentBoundary(input,data);}
  const rawCalibration=asObject(data.calibration),knownActivityIds=new Set(input.state.activities.map(row=>row.id));
  // Normalize the complete correction dependency set before facts and their consumers are applied.
  const calibration=rawCalibration?eligibleCalibration(Object.fromEntries(['facts','eventCorrections','activityUpdates','knowledgeCorrections'].map(key=>[key,list(rawCalibration[key]).map(row=>key==='activityUpdates'?returnedIdentity(row,knownActivityIds)??row:row)])) as unknown as Calibration,input.story.turns,input.state.knowledge):null;
  let acceptedWork=foundationAccepted;
  const calibrationRejections:CalibrationRejection[]=[];
  let submittedWork=foundationSubmitted+['activities','knowledge','continuingEffects'].reduce((sum,key)=>sum+list(data[key]).length,0)+list(data.events??data.results).length+['facts','eventCorrections','activityUpdates','knowledgeCorrections'].reduce((sum,key)=>sum+list(rawCalibration?.[key]).length,0);
  const activityRefs = new Map<string,string>(); const eventRefs = new Map<string,string>();
  // Establish only sourced factual identities before creative rows refer to them; final calibration still wins.
  const knownActivities = list(calibration?.activityUpdates).filter(item => !Object.hasOwn(item,'id'));
  const authority = knownActivities.length ? applyCalibration({state:input.state,people:input.people,turns:input.story.turns,calibration:{facts:[],eventCorrections:[],knowledgeCorrections:[],activityUpdates:knownActivities},activityRefs}) : input.state;
  const knownActivityKeys = new Set(activityRefs.keys());
  const bind = (map: Map<string,string>, key: unknown, id: string) => { if (typeof key !== 'string' || !key.trim()) return; const k=key.trim(); if (map.has(k) && map.get(k)!==id) throw new Error('返回的临时引用重复，结果未保存，请重新更新。'); map.set(k,id); };
  const activities = new Map(authority.activities.map(activity=>[activity.id,activity]));
  const identityParticipants = new Map(authority.activities.map(activity=>[activity.id,activity.participantIds]));
  const checkpoints = new Set<string>();
  const deferred = new Map<string,{row:Record<string,any>;participants:string[]}>();
  const eventStages = new Map<string,number>();
  const intermediateChanges = new Set<string>();
  for (const item of boundary.ordered(data.activities)) {
    const row=returnedIdentity(item,activities);if(!row)continue;
    const reference = typeof row.id === 'string' ? row.id.trim() : '';
    const key = typeof row.key === 'string' ? row.key.trim() : '';
    const resolved = reference ? activities.has(reference) ? reference : activityRefs.get(reference) ?? reference : knownActivityKeys.has(key) ? activityRefs.get(key) : undefined;
    const old = resolved ? activities.get(resolved) : undefined;
    if (reference && !old) continue;
    const participants = strings(row.participantIds ?? row.personIds);
    if (participants.some(id=>!ids.has(id))) continue;
    // A rejected cutoff summary can still declare the identity used by an explicit earlier event.
    let declaredId:string|undefined;
    if(!old && boundary.index(row)!==undefined && typeof row.key==='string'&&row.key.trim()&&typeof row.title==='string'&&row.title.trim()&&participants.length&&Array.isArray(row.assertedPersonIds)&&row.assertedPersonIds.every((id:string)=>ids.has(id))&&row.assertsUser===false) {
      declaredId=newId();bind(activityRefs,row.key,declaredId);deferred.set(declaredId,{row,participants});identityParticipants.set(declaredId,participants);
    }
    const involved=[...(old?.participantIds ?? []),...(old?identityParticipants.get(old.id)??[]:[]),...participants];
    const change = activityChange({...row,...(row.personIds ? {participantIds:participants} : {})},ids);
    // A repeated protected snapshot is only an old reference; offstage final checkpoints keep their precedence.
    if(old&&boundary.isProtected(row,involved)&&!involved.some(id=>input.people.some(person=>person.id===id&&person.specialRole==='user'))&&unchangedActivityReference(row,old,ids,change)) {bind(activityRefs,row.key,old.id);submittedWork--;continue;}
    if (!boundary.allows(row,involved,'activity')) { if(old)bind(activityRefs,row.key,old.id); continue; }
    if (!boundary.allows(row,involved,'activity-checkpoint',true)) {
      if(old)bind(activityRefs,row.key,old.id);
      continue;
    }
    if (old) { acceptedWork++;bind(activityRefs,row.key,old.id); checkpoints.add(old.id); if (manual(old)) continue; const updated={...old,...change}; if (!equal(updated,old)) activities.set(old.id,updated); }
    else {
      if (typeof row.key !== 'string' || !row.key.trim() || !change.title || !participants.length) continue;
      const id=declaredId??newId();bind(activityRefs,row.key,id);activities.set(id,{id,title:change.title,description:change.description??'',status:change.status??'planned',participantIds:participants,sources:[source]});identityParticipants.set(id,participants);checkpoints.add(id);acceptedWork++;
    }
  }
  let events: WorldEvent[] = [...authority.events]; let addedEvents=0;const newEventRows=new Map<string,Record<string,any>>(),knownEventIds=new Set(events.map(event=>event.id));
  for (const item of boundary.ordered(data.events ?? data.results)) {
    const row=returnedIdentity(item,knownEventIds);if(!row)continue;
    if (typeof row.id==='string' && row.id.trim()) { if (events.some(event=>event.id===row.id.trim())) {bind(eventRefs,row.key,row.id.trim());submittedWork--;} continue; }
    const reference=row.activityId ?? row.activityRef ?? row.activityKey ?? null;
    const activityId=typeof reference==='string' ? activityRefs.get(reference)??reference : null;
    if (reference !== null && (!activityId || !activities.has(activityId)&&!deferred.has(activityId))) continue;
    if (typeof row.title!=='string' || !row.title.trim()) continue;
    const participants=strings(row.participantIds??row.personIds);if(participants.some(id=>!ids.has(id)))continue;
    let activity=activityId ? activities.get(activityId) : undefined;
    const pending=activityId?deferred.get(activityId):undefined;
    const statedChange=activityChange(row.activityChange,ids);
    if (!boundary.allows(row,[...participants,...(activity?.participantIds ?? pending?.participants ?? []),...(activityId?identityParticipants.get(activityId)??[]:[]),...(statedChange.participantIds ?? []),...strings(row.continuingForPersonIds)],'event')) continue;
    if(pending && !activity) {
      // Only an explicit first-event snapshot establishes a past activity whose cutoff summary was withheld.
      if(!statedChange.status)continue;
      activity={id:activityId!,title:statedChange.title??pending.row.title,description:statedChange.description??'',status:statedChange.status??'planned',participantIds:statedChange.participantIds??pending.participants,sources:[source]};
      activities.set(activity.id,activity);
    }
    const change=activity && manual(activity) ? {} : statedChange;
    const id=newId();bind(eventRefs,row.key,id);
    const statedTime=asObject(row.storyTime)?.text??row.storyTime;
    const event:WorldEvent={id,activityId,title:row.title.trim(),description:typeof row.description==='string'&&row.description.trim()?row.description:row.title.trim(),participantIds:participants,storyTime:{text:typeof statedTime==='string'&&statedTime.trim()?normalizeStoryTime(statedTime.trim()):source.label,source},sources:[source],simulationWindowId:window.id,...(Object.keys(change).length?{activityChange:change}:{}),...(Array.isArray(row.continuingForPersonIds)?{continuingForPersonIds:strings(row.continuingForPersonIds).filter(id=>ids.has(id))}:{})};
    events.push(event);addedEvents++;acceptedWork++;eventStages.set(id,boundary.index(row)!);
    newEventRows.set(id,row);
    // Returning to the same final state still anchors this period after its intermediate changes.
    if(activity && checkpoints.has(activity.id) && Object.keys(change).some(key=>!equal(activity[key as keyof Activity],change[key as keyof typeof change]))) intermediateChanges.add(activity.id);
    // Explicit event changes update current state only when no separate end checkpoint was supplied.
    if(activity && !checkpoints.has(activity.id) && Object.keys(change).length) {
      const updated={...activity,...change};
      activities.set(activity.id,updated);
    }
  }
  const suppliedEvents=new Set(suppliedMemory.events.map(event=>event.id));
  // Accept each sourced fact once before its same-answer dependent references; corrections still apply last.
  if(calibration&&list(calibration.facts).length)events=applyCalibration({state:{...authority,activities:[...activities.values()],events},calibration:{facts:list(calibration.facts),activityUpdates:[],eventCorrections:[],knowledgeCorrections:[]} as Calibration,people:input.people,turns:input.story.turns,refs:eventRefs,authorFacts:suppliedMemory.events,onAccepted:()=>{acceptedWork++;},onReference:()=>{submittedWork--;}}).events;
  const originalEvents=new Set(input.state.events.map(event=>event.id)),acceptedEvents=new Set([...suppliedEvents,...events.filter(event=>!originalEvents.has(event.id)).map(event=>event.id)]);
  for(const event of events)if(newEventRows.has(event.id)){const row=newEventRows.get(event.id)!;const links=list(row.eventLinks).flatMap(link=>{const id=eventRefs.get(link.eventId)??link.eventId;return typeof id==='string'&&id!==event.id&&acceptedEvents.has(id)&&['continues','caused-by'].includes(link.kind)?[{eventId:id,kind:link.kind as 'continues'|'caused-by'}]:[];});if(links.length)event.eventLinks=links;}
  for (const effect of boundary.ordered(data.continuingEffects)) {
    const event=events.find(event=>event.id===(eventRefs.get(effect.eventId)??effect.eventId));
    if(!event||manual(event)||!Array.isArray(effect.personIds)||effect.personIds.some((id:string)=>!ids.has(id)))continue;
    if(!boundary.acceptsEventReference(effect,eventStages.get(event.id),'continuing-effect'))continue;
    if (!boundary.allows(effect,[...(event.continuingForPersonIds ?? []),...strings(effect.personIds)],'continuing-effect',true)) continue;
    events[events.indexOf(event)]={...event,continuingForPersonIds:[...new Set<string>(effect.personIds)]};
    acceptedWork++;
  }
  const knowledge:Knowledge[]=[...authority.knowledge];let addedKnowledge=0;
  for(const row of boundary.ordered(data.knowledge)) {
    const eventId=eventRefs.get(row.eventId)??row.eventId;
    if(!ids.has(row.personId)||!events.some(event=>event.id===eventId)||typeof row.reason!=='string'||!row.reason.trim())continue;
    if(knowledge.some(item=>item.personId===row.personId&&item.eventId===eventId)){submittedWork--;continue;}
    if(!boundary.acceptsEventReference(row,eventStages.get(eventId),'knowledge')||!boundary.allows(row,[row.personId],'knowledge'))continue;
    acceptedWork++;
    knowledge.push({personId:row.personId,eventId,reason:row.reason.trim(),sources:[source]});addedKnowledge++;
  }
  // Narrative corrections are authoritative at the cutoff, after earlier offscreen changes.
  const creative={...authority,activities:[...activities.values()],events,knowledge};
  let calibrated=calibration?applyCalibration({state:creative,calibration:{facts:[],...Object.fromEntries((['eventCorrections','activityUpdates','knowledgeCorrections'] as const).map(key=>[key,list(calibration[key])]))} as unknown as Calibration,people:input.people,turns:input.story.turns,refs:eventRefs,authorFacts:suppliedMemory.events,activityRefs,rejections:calibrationRejections,onAccepted:()=>{acceptedWork++;},onReference:()=>{submittedWork--;}}):creative;
  if(graph){const updated={...asObject(data.foundation),people:[],groups:list(asObject(data.foundation)?.groups).map(row=>({...row,basisEventIds:strings(row.basisEventIds).map(id=>eventRefs.get(id)??id)})),relations:list(asObject(data.foundation)?.relations).map(row=>({...row,basisEventIds:strings(row.basisEventIds).map(id=>eventRefs.get(id)??id)}))};const oldIds=new Set(input.state.events.map(event=>event.id));const allowedEvents=new Set([...suppliedEvents,...calibrated.events.filter(event=>!oldIds.has(event.id)).map(event=>event.id)]);const built=applyFoundation({...input,state:calibrated},updated,window,{eventIds:allowedEvents,allows:(row,ids)=>boundary.allows(row,ids,'social-change',true)});submittedWork+=built.submitted;acceptedWork+=built.accepted;if(built.accepted)calibrated={...calibrated,foundation:built.foundation};recordDiagnostic(input.diagnostic,'foundation-updated',{accepted:built.accepted,rejections:built.rejections});}
  const changed=calibrated.activities.filter(activity=>!equal(activity,input.state.activities.find(old=>old.id===activity.id)));
  const rhythm=mergeLifeRhythm(calibrated,input.people,data,currentClock,input.story.turns);
  // Auxiliary schedules do not turn rejected story work into a completed first flow.
  const actualChange=changed.length||addedEvents||addedKnowledge||!equal(calibrated.events,input.state.events)||!equal(calibrated.knowledge,input.state.knowledge)||!equal(calibrated.foundation,initialFoundation);
  if(!actualChange && (submittedWork>0&&acceptedWork===0 || !(typeof data.quietReason==='string'&&data.quietReason.trim()))){
    recordDiagnostic(input.diagnostic,'work-rejected',{acceptedWork,submittedWork,calibrationRejections:calibrationRejections.slice(0,24),boundaryRejections:boundary.rejected.slice(0,24),boundaryRejectionCount:boundary.rejected.length});
    throw new Error(submittedWork?'本次返回的事务与经历未能接纳，尚未保存；可点百相流转重新更新。':'本次没有新的变化或明确平静说明，尚未保存，可点百相流转重新更新。');
  }
  const state:NpcWorldState={...calibrated,...rhythm,...(input.state.worldBaseline?{worldBaseline:{...input.state.worldBaseline,needsCurrentDevelopment:false}}:{}),activities:calibrated.activities.map(activity=>(changed.includes(activity)||intermediateChanges.has(activity.id))&&!manual(activity)?{...activity,currentStateWindowId:window.id}:activity),processedThroughSeq:Math.max(input.state.processedThroughSeq??0,throughSeq),currentTimeStartedThroughSeq:Math.max(input.state.currentTimeStartedThroughSeq??0,throughSeq),automaticDevelopmentEnabled:true,developmentOnstagePersonIds:boundary.onstagePersonIds,simulationRanges:[...(input.state.simulationRanges??[]),window],storyTime:referenceCurrent?input.state.storyTime:validEnd?{text:to.text,source}:input.initial?null:input.state.storyTime};
  return{state:discardInvalidAtmospheres(state),window,addedEvents,addedKnowledge,changedActivities:changed.length,boundaryRejections:boundary.rejected,calibrationRejections,acceptedWork,submittedWork};
}
