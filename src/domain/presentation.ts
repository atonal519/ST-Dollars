import type {SourcePerson} from './source-people';

export const TEMPERAMENTS=['gentle','bright','reserved','sharp','sensitive','unknown'] as const;
export type Temperament=typeof TEMPERAMENTS[number];
export interface PresentationSource {personality:string;relations:string}
export interface ProfileRelation {fromPersonId:string;toPersonId:string;fromRole:string;toRole:string;directed:boolean}
export interface PresentationHint {
  personId:string;
  temperament?:{basisKey:string;value:Temperament};
  profileRelations?:{basisKey:string;items:ProfileRelation[]};
}
export interface AtmosphereVisual {temperature:'cold'|'neutral'|'warm';rhythm:'calm'|'flowing'|'agitated'}
const object=(v:unknown):Record<string,unknown>|null=>v!==null&&typeof v==='object'&&!Array.isArray(v)?v as Record<string,unknown>:null;
/** Source-owned display hints are discardable; only the exact relevant profile field binds them. */
export function presentationBasis(value:string):string {
 let a=2166136261,b=5381;for(let i=0;i<value.length;i++){a=Math.imul(a^value.charCodeAt(i),16777619);b=Math.imul(b,33)^value.charCodeAt(i);}return `v1:${(a>>>0).toString(16)}:${(b>>>0).toString(16)}`;
}
export function validTemperament(value:unknown):value is Temperament{return TEMPERAMENTS.includes(value as Temperament);}
export function normalizeAtmosphereVisual(value:unknown):AtmosphereVisual|undefined {
 const row=object(value);if(!row)return undefined;
 const temperature=['cold','neutral','warm'].includes(row.temperature as string)?row.temperature as AtmosphereVisual['temperature']:undefined;
 const rhythm=['calm','flowing','agitated'].includes(row.rhythm as string)?row.rhythm as AtmosphereVisual['rhythm']:undefined;
 return temperature||rhythm?{temperature:temperature??'neutral',rhythm:rhythm??'flowing'}:undefined;
}
export function validPresentation(person:{presentationSource?:PresentationSource},hint:PresentationHint|undefined) {
 const source=person.presentationSource;
 return {
  temperament:source?.personality&&hint?.temperament?.basisKey===presentationBasis(source.personality)&&validTemperament(hint.temperament.value)?hint.temperament.value:undefined,
  relations:source?.relations&&hint?.profileRelations?.basisKey===presentationBasis(source.relations)&&Array.isArray(hint.profileRelations.items)?hint.profileRelations.items:undefined,
 };
}
export function presentationRequests(people:SourcePerson[],hints:PresentationHint[]=[]) {
 const byId=new Map(hints.map(h=>[h.personId,h]));
 return people.flatMap(person=>{const source=person.presentationSource,valid=validPresentation(person,byId.get(person.id));
  const personality=source?.personality&&!valid.temperament?source.personality:undefined;
  const identityRelations=source?.relations&&valid.relations===undefined?source.relations:undefined;
  return personality||identityRelations?[{personId:person.id,...(personality?{personality}:{}),...(identityRelations?{identityRelations}:{})}]:[];
 });
}
export function applyPresentation(people:SourcePerson[],previous:PresentationHint[]=[],updates:unknown):PresentationHint[] {
 const byId=new Map(previous.map(h=>[h.personId,h])),sources=new Map(people.map(p=>[p.id,p]));
 if(!Array.isArray(updates))return previous;
 const needed=new Map(presentationRequests(people,previous).map(row=>[row.personId,row]));
 for(const value of updates){const row=object(value),person=typeof row?.personId==='string'?sources.get(row.personId):undefined;if(!row||!person)continue;
  const request=needed.get(person.id);if(!request)continue;
  const old=byId.get(person.id),next:PresentationHint={...old,personId:person.id},source=person.presentationSource;
  if(request.personality&&source?.personality&&validTemperament(row.temperament))next.temperament={basisKey:presentationBasis(source.personality),value:row.temperament};
  if(request.identityRelations&&source?.relations&&Array.isArray(row.profileRelations)){
   const items:ProfileRelation[]=[];
   for(const value of row.profileRelations){const edge=object(value);if(!edge||typeof edge.fromPersonId!=='string'||typeof edge.toPersonId!=='string'||edge.fromPersonId===edge.toPersonId||!sources.has(edge.fromPersonId)||!sources.has(edge.toPersonId)||typeof edge.fromRole!=='string'||!edge.fromRole.trim()||typeof edge.toRole!=='string'||!edge.toRole.trim()||typeof edge.directed!=='boolean')continue;
    items.push({fromPersonId:edge.fromPersonId,toPersonId:edge.toPersonId,fromRole:edge.fromRole.trim(),toRole:edge.toRole.trim(),directed:edge.directed});
   }
   // A deliberate empty set is useful; malformed nonempty sets do not erase valid hints.
   if(items.length||row.profileRelations.length===0)next.profileRelations={basisKey:presentationBasis(source.relations),items};
  }
  if(next.temperament||next.profileRelations)byId.set(person.id,next);
 }
 return [...byId.values()];
}
