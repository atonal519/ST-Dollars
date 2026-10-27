import type {SourcePerson} from '../domain/source-people';
import type {NpcWorldState} from '../domain/world-state';
import type {SourceRef,SimulationWindow} from '../domain/world';
import {CONSTRUCTION_REFERENCE_PREFIX,foundationFields,hasIndependentFoundationSource,mergeWorldPeople,type FoundationPerson,type SocialGroup,type WorldRelation,type WorldFoundation} from '../domain/world-foundation';
import type {StoryInput,WorldSettings} from '../application/contracts';
import {asObject,list,newId,strings} from './trajectory';
import {decodeQQJPersonId} from '../sources/qqj-person-id';
import {returnedIdentity} from './returned-identity';

export const FOUNDATION_CONTRACT=`foundation含people/groups/relations三个数组。people旧人用id，新实名人物用key/name/aliases及identity身份职责、motivations长期在意、disposition处事原则、interests兴趣、life生活约束五个简短块，未知留空；char/NPC同规则，不抄全档案，不输出NSFW/外貌栏目。资料中的未出场实名人物也可建，不按同名合并；未命名成员只留群说明，不造人物。groups每项id或key/name/description/members:[{personId,role可选}]，成员可引用同答people.key；name用名词性群体名称，不用场景、事件或即时情绪标题；先按明确关系与共同工作、生活、长期往来形成圈，有稳定共同事由和真实联系即使尚未命名也可归纳；description简述纽带、相处方式、成员关切差异及已有约束。可重叠归属，不按char连接全部人合圈，同职业/同场/作者栏目不自动成群。已有圈重命名或细化说明沿旧id；只回新增或实际变化，未变省略沿用。relations每项id或key/fromPersonId/toPersonId/fromRole/toRole/directed；独立两人关系不必造群；群/关系与当前情绪分开，不自动知情。每个新增/变更项必须sourceIds选input.foundationSources.id，或sourceSeqs选本批正式正文，或basisEventIds选真实给过且有效事件。静态资料或有效既有经历的归纳可省新增断言，或assertedPersonIds:[]/assertsUser:false；显式stageKey须有效。正式本批正文事实用sourceSeqs；新的场外社会变化用有效basisEventIds及stageKey/assertedPersonIds/assertsUser，不能拿书源代替新事件。省略不删除；退群用members项status:"left"，解散群/结束关系用旧id/status:"ended"，保旧经历。输入members中toWindowId表示已经离开，endedWindowId表示群或关系已经结束，不能当当前有效关系。改变关系角色请结束旧id并用新key建立，不以旧id覆写角色。人工项不覆盖。不返回假来源；局部key只指本答真正声明的新项。`;
export function foundationSources(people:SourcePerson[],settings:WorldSettings|undefined,story:StoryInput) {
 const refs=new Map<string,SourceRef>();
 for(const person of people){refs.set(person.id,person.source);refs.set(person.source.id,person.source);}
 if(settings?.characterDescription)refs.set('character:current',{kind:'character',id:'character:current',label:'当前角色设定'});
 for(const book of settings?.books??[])for(const entry of book.entries){const id='world-book:'+JSON.stringify([book.name,entry.id]);refs.set(id,{kind:'world-book',id,label:book.name+(entry.comment?' · '+entry.comment:'')});}
 for(const turn of story.turns)if(turn.calibrationEligible!==false){const id='history-floor:'+turn.seq;refs.set(id,{kind:'chat',id,label:`第 ${turn.seq} 楼正文`});}
 return refs;
}
export function foundationSupplementPersonIds(people:SourcePerson[],state:NpcWorldState) {
 const windows=new Map((state.simulationRanges??[]).map(window=>[window.id,window]));
 const existing=new Map((state.foundation?.people??[]).map(person=>[person.id,person]));
 return people.filter(person=>{
  const row=existing.get(person.id);if(!row)return true;
  if(hasIndependentFoundationSource(row))return false;
  // Only a row's accepted reference checkpoint establishes that it was compared with the supplied material.
  return ![row.currentStateWindowId,row.establishedWindowId,...row.sources.filter(source=>source.kind==='simulation'&&source.id.startsWith(CONSTRUCTION_REFERENCE_PREFIX)).map(source=>source.id.slice(CONSTRUCTION_REFERENCE_PREFIX.length))].some(id=>windows.get(id)?.referenceSources!==undefined);
 }).map(person=>person.id);
}
export const needsFoundationSupplement=(people:SourcePerson[],state:NpcWorldState)=>!state.foundation||foundationSupplementPersonIds(people,state).length>0;
export {foundationReferences} from '../domain/world-foundation';
export function applyFoundation(input:{people:SourcePerson[];state:NpcWorldState;story:StoryInput;worldSettings?:WorldSettings},value:unknown,window:SimulationWindow,options:{construction?:boolean;static?:boolean;eventIds?:Set<string>;allows?:(row:Record<string,any>,ids:string[])=>boolean}={}) {
 const data=asObject(value);
 if(!data||!['people','groups','relations'].some(key=>Array.isArray(data[key])))throw new Error('世界基础资料无法读取，尚未保存，可重新世界构建。');
 const previous=input.state.foundation;
 const people=new Map((previous?.people??[]).map(row=>[row.id,row]));
 const groups=new Map((previous?.groups??[]).map(row=>[row.id,row]));
 const relations=new Map((previous?.relations??[]).map(row=>[row.id,row]));
 const live=new Map(input.people.map(person=>[person.id,person]));
 const refs=new Map<string,string>(),knownSources=foundationSources(input.people,input.worldSettings,input.story),events=new Map(input.state.events.filter(event=>options.eventIds?.has(event.id)).map(event=>[event.id,event]));
 const eligible=new Set(input.story.turns.filter(turn=>turn.calibrationEligible!==false).map(turn=>turn.seq));
 const resolve=(id:unknown)=>typeof id==='string'?(refs.get(id)??id):'';
 const rejections:Array<{kind:string;key:string|null;reason:string}>=[];
 let accepted=0,submitted=0;
 const sourceFor=(row:Record<string,any>,old?:{sources:SourceRef[]})=>{
  // Construction records the supplied reference set, without claiming a particular book supports this row.
  if((options.construction||options.static)&&window.referenceSources?.length&&!['sourceIds','sources','sourceSeqs','basisEventIds'].some(key=>Object.hasOwn(row,key)))return [{kind:'simulation' as const,id:CONSTRUCTION_REFERENCE_PREFIX+window.id,label:'本次构筑参考资料'}];
  const result:SourceRef[]=[];
  const explicitIds=Object.hasOwn(row,'sourceIds')?strings(row.sourceIds):list(row.sources).flatMap(source=>{const ref=knownSources.get(source.id)??old?.sources.find(item=>item.id===source.id);return ref&&source.kind===ref.kind?[ref.id]:[];});
  for(const id of explicitIds){const ref=knownSources.get(id)??old?.sources.find(source=>source.id===id);if(ref)result.push(ref);}
  for(const seq of Array.isArray(row.sourceSeqs)?row.sourceSeqs:[])if(eligible.has(seq))result.push({kind:'chat',id:'history-floor:'+seq,label:`第 ${seq} 楼正文`});
  for(const id of strings(row.basisEventIds)){const event=events.get(id);if(event&&!event.correction)result.push(...event.sources,{kind:'simulation',id:event.simulationWindowId??event.id,label:'已有经历依据'});}
  return [...new Map(result.map(source=>[source.kind+':'+source.id,source])).values()];
 };
 const allowed=(row:Record<string,any>,ids:string[],sources:SourceRef[])=>{
  const bodySource=(source:SourceRef|undefined)=>source?.kind==='chat'&&eligible.has(Number(source.id.slice('history-floor:'.length)));
  const explicitSources=Object.hasOwn(row,'sourceIds')?strings(row.sourceIds).map(id=>knownSources.get(id)):list(row.sources).flatMap(source=>{const known=knownSources.get(source.id);return known?.kind===source.kind?[known]:[];});
  if(options.construction||(Array.isArray(row.sourceSeqs)&&row.sourceSeqs.some(seq=>eligible.has(seq)))||explicitSources.some(bodySource))return true;
  const eventBacked=strings(row.basisEventIds).some(id=>events.has(id)&&!events.get(id)!.correction);
  const permit=(item:Record<string,any>,involved:string[])=>options.allows?.(item,involved)===true;
  if(!options.static)return eventBacked&&permit(row,ids);
  const knownSource=eventBacked||sources.some(source=>['plugin','character','world-book'].includes(source.kind)||source.kind==='simulation'&&source.id===CONSTRUCTION_REFERENCE_PREFIX+window.id);
  if(!knownSource)return false;
  const background=(!Object.hasOwn(row,'assertedPersonIds')||Array.isArray(row.assertedPersonIds)&&row.assertedPersonIds.length===0)&&(!Object.hasOwn(row,'assertsUser')||row.assertsUser===false);
  // Known social context can include onstage members; explicit stages still constrain empty assertions.
  if(background)return !Object.hasOwn(row,'stageKey')||permit({...row,assertedPersonIds:[],assertsUser:false},[]);
  return eventBacked&&permit(row,ids);
 };
 const basisFor=(row:Record<string,any>,old?:{basisEventIds?:string[]})=>[...new Set([...(old?.basisEventIds??[]),...strings(row.basisEventIds).filter(id=>events.has(id)&&!events.get(id)!.correction)])];
 const reject=(kind:string,row:Record<string,any>,reason:string)=>rejections.push({kind,key:typeof(row.id??row.key)==='string'?row.id??row.key:null,reason});
 const manual=(old:{sources:SourceRef[]}|undefined)=>old?.sources.some(source=>source.kind==='manual');
 const knownPeople=new Set([...live.keys(),...people.keys()]);
 for(const item of list(data.people)) {
  submitted++;const row=returnedIdentity(item,knownPeople);if(!row){reject('person',item,'identity');continue;}
  const reference=typeof row.id==='string'?row.id:typeof row.qqjPersonId==='string'?row.qqjPersonId:undefined;
  const old=reference?people.get(reference):undefined,external=reference?live.get(reference):undefined;
  if(row.id&&!old&&!external){reject('person',row,'identity');continue;}
  const sources=sourceFor(row,old);const name=typeof row.name==='string'&&row.name.trim()?row.name.trim():old?.name??external?.displayName;
  if(!sources.length||!name||manual(old)||!row.id&&(!row.key||refs.has(row.key))||!allowed(row,old?[old.id]:external?[external.id]:[],sources)){reject('person',row,'source-or-fields');continue;}
  const id=old?.id??external?.id??newId();
  const fields=Object.fromEntries(foundationFields.map(key=>[key,typeof row[key]==='string'?row[key].trim():old?.[key]??''])) as unknown as Pick<FoundationPerson,typeof foundationFields[number]>;
  const explicitBinding=typeof row.qqjPersonId==='string'&&live.has(row.qqjPersonId)&&decodeQQJPersonId(row.qqjPersonId)?row.qqjPersonId:undefined;
  if(row.qqjPersonId&&!explicitBinding){reject('person',row,'binding');continue;}
  if(old&&explicitBinding&&old.id!==explicitBinding&&(people.has(explicitBinding)||input.state.events.some(event=>event.participantIds.includes(explicitBinding)||event.continuingForPersonIds?.includes(explicitBinding))||input.state.activities.some(activity=>activity.participantIds.includes(explicitBinding))||input.state.knowledge.some(item=>item.personId===explicitBinding))){reject('person',row,'binding-conflict');continue;}
  const binding=old?.qqjPersonId??external?.qqjPersonId??(external&&decodeQQJPersonId(external.id)?external.id:undefined)??explicitBinding;
  people.set(id,{id,name,aliases:Array.isArray(row.aliases)?strings(row.aliases):old?.aliases??external?.aliases??[],...fields,...(binding?{qqjPersonId:binding}:{}),...(external?.specialRole?{specialRole:external.specialRole}:old?.specialRole?{specialRole:old.specialRole}:{}),sources,basisEventIds:basisFor(row,old),establishedWindowId:old?.establishedWindowId??window.id,currentStateWindowId:window.id});
  if(typeof row.key==='string')refs.set(row.key,id);accepted++;
 }
 const ids=new Set([...live.keys(),...people.keys()]);
 for(const item of list(data.groups)) {
  submitted++;const row=returnedIdentity(item,groups);if(!row){reject('group',item,'identity');continue;}
  const old=typeof row.id==='string'?groups.get(row.id):undefined,sources=sourceFor(row,old);
  const members=list(row.members),memberIds=members.map(member=>resolve(member.personId));
  const involved=row.status==='ended'?(old?.members.filter(member=>!member.toWindowId).map(member=>member.personId)??memberIds):memberIds;
  if(row.id&&!old||manual(old)||!sources.length||memberIds.some(id=>!ids.has(id))||!allowed(row,involved,sources)){reject('group',row,'source-or-identity');continue;}
  if(row.status==='ended'){if(old){groups.set(old.id,{...old,endedWindowId:old.endedWindowId??window.id,sources,basisEventIds:basisFor(row,old)});accepted++;}else reject('group',row,'identity');continue;}
  if(!old&&(!row.key||refs.has(row.key)||typeof row.name!=='string'||!row.name.trim()||!Array.isArray(row.members))){reject('group',row,'fields');continue;}
  const nextMembers=(old?.members??[]).map(member=>({...member}));
  members.forEach((member,index)=>{const personId=memberIds[index],active=nextMembers.find(m=>m.personId===personId&&!m.toWindowId);if(member.status==='left'){if(active)active.toWindowId=window.id;}else if(active){if(typeof member.role==='string'&&active.role!==member.role){active.toWindowId=window.id;nextMembers.push({personId,role:member.role,fromWindowId:window.id});}}else nextMembers.push({personId,...(typeof member.role==='string'?{role:member.role}:{}),fromWindowId:window.id});});
  const id=old?.id??newId();groups.set(id,{...old,id,name:typeof row.name==='string'?row.name.trim():old!.name,description:typeof row.description==='string'?row.description:old?.description??'',members:nextMembers,sources,basisEventIds:basisFor(row,old),establishedWindowId:old?.establishedWindowId??window.id,currentStateWindowId:window.id});if(typeof row.key==='string')refs.set(row.key,id);accepted++;
 }
 for(const item of list(data.relations)) {
  submitted++;const row=returnedIdentity(item,relations);if(!row){reject('relation',item,'identity');continue;}
  const old=typeof row.id==='string'?relations.get(row.id):undefined,sources=sourceFor(row,old),from=resolve(row.fromPersonId??old?.fromPersonId),to=resolve(row.toPersonId??old?.toPersonId);
  if(row.id&&!old||manual(old)||!sources.length||!ids.has(from)||!ids.has(to)||from===to||!allowed(row,[from,to],sources)){reject('relation',row,'source-or-identity');continue;}
  if(row.status==='ended'){if(old){relations.set(old.id,{...old,endedWindowId:old.endedWindowId??window.id,sources,basisEventIds:basisFor(row,old)});accepted++;}else reject('relation',row,'identity');continue;}
  if(!old&&(!row.key||refs.has(row.key)||typeof row.fromRole!=='string'||!row.fromRole.trim()||typeof row.toRole!=='string'||!row.toRole.trim())){reject('relation',row,'fields');continue;}
  // A changed role is a new relation with its own interval, not a rewrite of the old edge.
  const id=old?.id??newId();relations.set(id,old??{id,fromPersonId:from,toPersonId:to,fromRole:row.fromRole.trim(),toRole:row.toRole.trim(),directed:row.directed===true,sources,basisEventIds:basisFor(row,old),establishedWindowId:window.id});if(typeof row.key==='string')refs.set(row.key,id);accepted++;
 }
 if(options.construction&&submitted&&!accepted)throw new Error('本次世界基础资料的来源或归属未能确认，尚未保存，可重新世界构建。');
 const foundation:WorldFoundation={throughSeq:input.story.throughSeq??0,windowId:options.construction?window.id:previous?.windowId??window.id,people:[...people.values()],groups:[...groups.values()],relations:[...relations.values()]};
 return {foundation,people:mergeWorldPeople(input.people,{foundation}),refs,accepted,submitted,rejections};
}
