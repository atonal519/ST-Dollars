import type {NpcWorldState} from '../domain/world-state';
import type {SourcePerson} from '../domain/source-people';
import {isEffectiveEvent} from '../domain/world-facts';
import {buildPersonContexts} from './person-context';
import {effectiveAtmospheres} from '../domain/world-state';

/** A request view only: apply and persistence always keep the complete world authority. */
export function selectWorldMemory(people:SourcePerson[],state:NpcWorldState) {
 const eventById=new Map(state.events.map(event=>[event.id,event]));
 const resultActivities=new Set(state.events.filter(isEffectiveEvent).map(event=>event.activityId));
 const active=new Set(state.activities.filter(activity=>activity.status!=='completed').map(activity=>activity.id));
 // Recent factual completions without events still need their own identity and checkpoint.
 const windowOrder=new Map((state.simulationRanges??[]).map((window,index)=>[window.id,index]));
 const completions=state.activities.filter(activity=>activity.status==='completed'&&!resultActivities.has(activity.id)).sort((a,b)=>(windowOrder.get(a.currentStateWindowId??'')??-1)-(windowOrder.get(b.currentStateWindowId??'')??-1));
 for(const person of people)for(const activity of completions.filter(activity=>activity.participantIds.includes(person.id)).slice(-4))active.add(activity.id);
 for(const activity of completions.filter(activity=>!activity.participantIds.length).slice(-8))active.add(activity.id);
 const wanted=new Set<string>(),byActivity=new Map<string,string[]>(),byPerson=new Map<string,string[]>();
 for(const row of effectiveAtmospheres(state))for(const id of row.basisEventIds)wanted.add(id);
 for(const row of [...(state.foundation?.people??[]),...(state.foundation?.groups??[]),...(state.foundation?.relations??[])])for(const id of row.basisEventIds??[])wanted.add(id);
 for(const event of state.events) {
  if(event.activityId){const rows=byActivity.get(event.activityId)??[];rows.push(event.id);byActivity.set(event.activityId,rows);}
  if(isEffectiveEvent(event))for(const id of event.participantIds){const rows=byPerson.get(id)??[];rows.push(event.id);byPerson.set(id,rows);}
  if(event.activityId&&active.has(event.activityId)||event.continuingForPersonIds?.length)wanted.add(event.id);
 }
 const knowledgeByPerson=new Map<string,NpcWorldState['knowledge']>();
 for(const row of state.knowledge){const rows=knowledgeByPerson.get(row.personId)??[];rows.push(row);knowledgeByPerson.set(row.personId,rows);}
 for(const person of people){for(const id of (byPerson.get(person.id)??[]).slice(-4))wanted.add(id);for(const row of (knowledgeByPerson.get(person.id)??[]).slice(-4))wanted.add(row.eventId);}
 for(const row of state.events.filter(event=>!event.participantIds.length&&isEffectiveEvent(event)).slice(-8))wanted.add(row.id);
 const knowledgeByEvent=new Map<string,NpcWorldState['knowledge']>();
 for(const row of state.knowledge){const rows=knowledgeByEvent.get(row.eventId)??[];rows.push(row);knowledgeByEvent.set(row.eventId,rows);}
 const queue=[...wanted];
 const add=(id:string|undefined)=>{if(id&&eventById.has(id)&&!wanted.has(id)){wanted.add(id);queue.push(id);}};
 for(let index=0;index<queue.length;index++) {
  const event=eventById.get(queue[index]);if(!event)continue;
  for(const link of event.eventLinks??[])add(link.eventId);
  add(event.correction?.byEventId);
  if(event.activityId){active.add(event.activityId);for(const id of byActivity.get(event.activityId)??[])add(id);}
  for(const row of knowledgeByEvent.get(event.id)??[])add(row.correction?.byEventId);
 }
 const events=state.events.filter(row=>wanted.has(row.id)),knowledge=state.knowledge.filter(row=>wanted.has(row.eventId));
 const projected={...state,activities:state.activities.filter(row=>active.has(row.id)),events,knowledge};
 return {...projected,...buildPersonContexts(people,projected)};
}
