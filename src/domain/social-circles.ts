import type {DevelopmentAtmosphere,WorldEvent,WorldSnapshot} from './world';
import {foundationReferences,type WorldFoundation} from './world-foundation';
import {effectiveAtmospheres} from './world-state';
type Identity={id:string;name?:string;displayName?:string};
type SocialWorld={foundation?:WorldFoundation;events:WorldEvent[];developmentAtmospheres?:DevelopmentAtmosphere[];atmospheres?:DevelopmentAtmosphere[]};
export interface SocialContext {id:string;entityId:string;kind:'group'|'relation';name:string;description:string;personIds:string[];members?:Array<{personId:string;role?:string}>;fromPersonId?:string;toPersonId?:string;fromRole?:string;toRole?:string;directed?:boolean}
export interface TasteCircle {id:string;title:string;description:string;personIds:string[];atmosphereIds:string[];visual?:DevelopmentAtmosphere['visual']}
/** The foundation owns the current social object; mood never creates membership or a group. */
export function socialContexts(people:Identity[],state:Pick<SocialWorld,'foundation'|'events'>):SocialContext[] {
 const names=new Map(people.map(person=>[person.id,person.displayName??person.name??'']));
 const valid=new Set(foundationReferences(state.foundation,state.events).map(ref=>ref.id));
 const groups=(state.foundation?.groups??[]).flatMap(group=>{
  const id='foundation:group:'+group.id;if(!valid.has(id))return [];
  const members=group.members.filter(member=>!member.toWindowId&&names.has(member.personId)).map(({personId,role})=>({personId,...(role?{role}:{})}));
  return [{id,entityId:group.id,kind:'group' as const,name:group.name,description:group.description,personIds:members.map(member=>member.personId),members}];
 });
 const relations=(state.foundation?.relations??[]).flatMap(relation=>{
  const id='foundation:relation:'+relation.id;if(!valid.has(id)||!names.has(relation.fromPersonId)||!names.has(relation.toPersonId))return [];
  return [{id,entityId:relation.id,kind:'relation' as const,name:`${names.get(relation.fromPersonId)}（${relation.fromRole}）—${names.get(relation.toPersonId)}（${relation.toRole}）`,description:'已明确的直接关系',personIds:[relation.fromPersonId,relation.toPersonId],fromPersonId:relation.fromPersonId,toPersonId:relation.toPersonId,fromRole:relation.fromRole,toRole:relation.toRole,directed:relation.directed}];
 });
 return [...groups,...relations];
}
/** Exact references only: a rejected/ambiguous identity cannot be replaced by a name or member guess. */
export function resolveCircleReference(value:unknown,circles:SocialContext[],aliases?:Map<string,string>):string|undefined {
 if(typeof value!=='string'||!value.trim())return undefined;const key=aliases?.get(value.trim())??value.trim();
 const found=circles.filter(circle=>circle.id===key||circle.entityId===key);return found.length===1?found[0].id:undefined;
}
export function atmosphereCircleReference(row:{circleRef?:unknown;basisMaterialRefs?:string[]},circles:SocialContext[]):string|undefined {
 if(Object.hasOwn(row,'circleRef'))return resolveCircleReference(row.circleRef,circles);
 const refs=[...new Set((row.basisMaterialRefs??[]).flatMap(ref=>{const id=resolveCircleReference(ref,circles);return id?[id]:[];}))];return refs.length===1?refs[0]:undefined;
}
function ownedAtmospheres(state:SocialWorld,circles:SocialContext[]) {
 const byId=new Map(circles.map(circle=>[circle.id,circle]));
 return effectiveAtmospheres({events:state.events,developmentAtmospheres:state.developmentAtmospheres??state.atmospheres}).flatMap(row=>{
  const circle=byId.get(atmosphereCircleReference(row,circles)??'');return circle?[{...row,circleRef:circle.id,title:circle.kind==='group'?circle.name:row.title}]:[];
 });
}
/** Unbound legacy rows remain stored for taste repair, but are not background for hearing/retrieval. */
export function boundAtmospheres(people:Identity[],state:SocialWorld):DevelopmentAtmosphere[] {return ownedAtmospheres(state,socialContexts(people,state));}
export function tasteCircles(world:Pick<WorldSnapshot,'people'|'foundation'|'events'|'atmospheres'>):TasteCircle[] {
 const circles=socialContexts(world.people,world),moods=ownedAtmospheres(world,circles),byCircle=new Map<string,DevelopmentAtmosphere[]>();
 for(const mood of moods){const rows=byCircle.get(mood.circleRef!)??[];rows.push(mood);byCircle.set(mood.circleRef!,rows);}
 return circles.flatMap(circle=>{const rows=byCircle.get(circle.id)??[];if(circle.kind==='relation'&&!rows.length)return [];
  const descriptions=[...new Set(rows.map(row=>row.description).filter(text=>text.trim()))];
  return [{id:circle.id,title:circle.kind==='group'?circle.name:[...new Set(rows.map(row=>row.title))].join(' / '),description:descriptions.length?descriptions.join('\n\n'):circle.description,personIds:circle.personIds,atmosphereIds:rows.map(row=>row.id),...(rows.length===1&&rows[0].visual?{visual:rows[0].visual}:{})}];
 });
}
