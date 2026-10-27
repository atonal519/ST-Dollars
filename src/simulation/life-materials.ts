import type { QuestionMaterialReader, QuestionMaterialRequest, QuestionMaterialRead } from '../application/contracts';
import type { SourcePerson } from '../domain/source-people';
import type { NpcWorldState } from '../domain/world-state';
import { isEffectiveEvent } from '../domain/world-facts';
import {decodeQQJPersonId} from '../sources/qqj-person-id';
import {normalizeQQJProfileText} from '../sources/qqj-profile';
import {socialContexts} from './social-context';
import {boundAtmospheres} from '../domain/social-circles';

const chunks = <T>(items: T[]) => Array.from({length:Math.ceil(items.length/100)},(_,i)=>items.slice(i*100,i*100+100));
type QueryLine={title:string;detail:string};
function queryText(lines:QueryLine[]) {
 const unique=[...new Map(lines.map(line=>[JSON.stringify(line),line])).values()],count=unique.length;if(!count)return '';
 const titleLimit=Math.floor((8000-count+1)/count),titles=unique.map(line=>line.title.slice(0,Math.max(0,titleLimit)));
 const remaining=Math.max(0,8000-titles.reduce((n,text)=>n+text.length,0)-(count-1));
 const detailLimit=Math.max(0,Math.floor(remaining/count)-1);
 return unique.map((line,index)=>titles[index]+(line.detail&&detailLimit?'：'+line.detail.slice(0,detailLimit):'')).join('\n').slice(0,8000);
}
export class MaterialsNotReadyError extends Error {}
/** One shared pool covers personal affairs and explicit social contexts; story remains a separate constraint. */
export async function collectLifeMaterials(people: SourcePerson[], state: NpcWorldState, reader: QuestionMaterialReader, throughSeq: number | null) {
  const bindings=new Map(people.flatMap(person=>{const id=person.qqjPersonId??person.id;return decodeQQJPersonId(id)?[[person.id,id] as const]:[];}));
  const worldIds=new Map([...bindings].map(([id,binding])=>[binding,id]));
  const boundPeople=people.filter(person=>bindings.has(person.id));
  if(!boundPeople.length)return {materials:[],readCount:0,requestedCharacters:0,characters:0};
  const known = new Set(boundPeople.map(person=>person.id));
  const topics = new Map<string,{personIds:string[];texts:QueryLine[]}>();
  const add = (ids:string[],title:string,detail='') => {
    ids=[...new Set(ids.filter(id=>known.has(id)))].sort();if(!ids.length||!title.trim())return;
    const key=JSON.stringify(ids),topic=topics.get(key)??{personIds:ids,texts:[]};topic.texts.push({title,detail});topics.set(key,topic);
  };
  for(const activity of state.activities)if(activity.status!=='completed')add(activity.participantIds,activity.title,activity.description);
  for(const event of state.events)if(isEffectiveEvent(event))add(event.continuingForPersonIds??[],event.title,event.description);
  for(const person of people)if(person.identityDescription)add([person.id],`${person.displayName}的长期职责`,person.identityDescription);
  const names=new Map(people.map(person=>[person.id,person.displayName]));
  for(const circle of socialContexts(people,state))add(circle.personIds,`${circle.kind==='group'?'稳定群':'明确关系'}：${circle.name}${circle.members?.length?'；成员职责：'+circle.members.map(member=>names.get(member.personId)+(member.role?'（'+member.role+'）':'')).join('、'):''}`,circle.description);
  for(const mood of boundAtmospheres(people,state))add(mood.personIds,`既有圈层底色：${mood.title}`,mood.description);
  const groups=Array.from({length:Math.min(4,topics.size)},()=>({personIds:new Set<string>(),texts:[] as QueryLine[]}));
  [...topics.values()].forEach((topic,index)=>{const group=groups[index%groups.length];topic.personIds.forEach(id=>group.personIds.add(id));group.texts.push(...topic.texts);});
  const base=chunks(boundPeople.map(person=>person.id));
  const themes=groups.flatMap(group=>chunks([...group.personIds]).map(personIds=>({personIds,question:queryText(group.texts)})));
  const baseBudget=themes.length?16000:40000;
  const requests:QuestionMaterialRequest[]=[...base.map(personIds=>({personIds,question:'',maxCharacters:Math.floor(baseBudget/base.length)})),...themes.map(topic=>({...topic,maxCharacters:Math.floor(24000/themes.length)}))].map(request=>({...request,personIds:request.personIds.map(id=>bindings.get(id)!)}));
  const rawReads=reader.readForQuestions?await reader.readForQuestions(requests,{throughSeq}):await (async()=>{const result:QuestionMaterialRead[]=[];for(const request of requests)result.push(await reader.readForQuestion(request));return result;})();
  const reads=rawReads.map(read=>({...read,materials:read.materials.map(material=>({...material,personId:worldIds.get(material.personId)??material.personId}))}));
  const failed=reads.find(read=>read.status==='error');
  if(failed)throw new Error(failed.message||'读取人物已有资料失败，请重新更新。');
  const ready=reads.filter(read=>read.status==='ready'||read.status==='empty');
  if(reads.length&&!ready.length)throw new MaterialsNotReadyError(reads[0].message||'千千结资料尚未准备好，请稍后再试。');
  const partial=ready.length<reads.length;
  const directoryProfiles=new Set(people.filter(person=>person.profileMaterialProvided).map(person=>person.id));
  const seen=new Map<string,Set<string>>();
  const uniqueText=(value:string,key:string)=>{const lines=seen.get(key)??new Set<string>();seen.set(key,lines);return value.split('\n').filter(line=>{if(!line)return true;if(lines.has(line))return false;lines.add(line);return true;}).join('\n').trim();};
  const uniqueRows=<T>(rows:T[],key:string)=>{const values=seen.get(key)??new Set<string>();seen.set(key,values);return rows.filter(row=>{const id=JSON.stringify(row);if(values.has(id))return false;values.add(id);return true;});};
  const materials=ready.map(read=>{
    return {...read,coverage:{...read.coverage,partial:read.coverage.partial||partial},routerText:uniqueText(read.routerText,'router'),materials:read.materials.map(material=>{const profileText=uniqueText(normalizeQQJProfileText(material.profileText,{includeBrief:!directoryProfiles.has(material.personId)}),`${material.personId}:profile`);return {personId:material.personId,...(profileText?{profileText}:{}),stateText:uniqueText(material.stateText,`${material.personId}:state`),memoryText:uniqueText(material.memoryText,`${material.personId}:memory`),refs:uniqueRows(material.refs,`${material.personId}:refs`),sources:uniqueRows(material.sources,`${material.personId}:sources`)};})};
  });
  return {materials,readCount:requests.length,requestedCharacters:requests.reduce((sum,r)=>sum+r.maxCharacters,0),characters:materials.reduce((sum,r)=>sum+r.routerText.length+r.materials.reduce((n,m)=>n+(m.profileText?.length??0)+m.stateText.length+m.memoryText.length,0),0)};
}
