import type {Activity,Person,WorldEvent,WorldSnapshot} from '../domain/world';
import {isEffectiveEvent} from '../domain/world-facts';
import {factEvidenceKind} from '../simulation/fact-sources';

export interface HearingActivity {activity:Activity;people:Person[];latestProgress:WorldEvent|null;body:string}
/** Only the display body receives a missing stop; canonical activity/event text stays untouched. */
function sentenceBody(value:string):string {const text=value.trimEnd();return !text||/[。！？.!?…][”’"'」』）》】)\]}]*$/u.test(text)?text:text+'。';}
/** Navigation and hearing share card visibility without changing the saved facts. */
export function visibleHearingActivities(world:Pick<WorldSnapshot,'activities'|'developmentOnstagePersonIds'>):Activity[] {
  const onstage=new Set(world.developmentOnstagePersonIds??[]);
  return world.activities.filter(activity=>!activity.participantIds.length||activity.participantIds.some(id=>!onstage.has(id)));
}
/** Event order belongs to the saved world; only explicit, still-effective self-created results are progress. */
export function hearingActivities(world:WorldSnapshot):HearingActivity[] {
  const latest=new Map<string,WorldEvent>();
  for(const event of world.events)if(event.activityId&&isEffectiveEvent(event)&&factEvidenceKind(event,world.id??'')==='prior-generated')latest.set(event.activityId,event);
  return visibleHearingActivities(world).map(activity=>{const latestProgress=latest.get(activity.id)??null;return{activity,people:world.people.filter(p=>activity.participantIds.includes(p.id)),latestProgress,body:sentenceBody(latestProgress?.description??activity.description)};});
}
