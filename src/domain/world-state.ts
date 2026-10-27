import {validPresentation,type PresentationHint,type ProfileRelation} from './presentation';
import type { LifeRoutine, LifeArrangement } from '../simulation/life-rhythm';
import {mergeWorldPeople,foundationForInput,type WorldFoundation} from './world-foundation';
import {projectSourcePerson} from './source-people';
import type { Activity, Knowledge, SimulationWindow, StoryTime, WorldEvent, WorldSnapshot, DevelopmentAtmosphere, DevelopmentCreativeFrame } from './world';

export interface NpcWorldState {
  schemaVersion: 1;
  scopeId: string;
  storyTime: StoryTime | null;
  processedThroughSeq: number | null;
  /** Sequence at which this version's current-time activity pass last succeeded. */
  currentTimeStartedThroughSeq?: number;
  automaticDevelopmentEnabled?: boolean;
  /** A construction anchor is current author context, not development across the preceding gap. */
  worldBaseline?: { throughSeq: number; windowId: string; needsCurrentDevelopment: boolean };
  foundation?: WorldFoundation;
  /** Narrative scene ownership at the last development cutoff; absence alone never releases it. */
  developmentOnstagePersonIds?: string[];
  developmentRoutines?: LifeRoutine[];
  developmentArrangements?: LifeArrangement[];
  developmentCreativeFrame?: DevelopmentCreativeFrame;
  developmentAtmospheres?: DevelopmentAtmosphere[];
  developmentPresentation?: PresentationHint[];
  historyRanges?: Array<{ fromSeq: number; toSeq: number }>;
  simulationRanges?: SimulationWindow[];
  activities: Activity[];
  events: WorldEvent[];
  knowledge: Knowledge[];
}

/** A corrected fact invalidates its whole dependent summary, never just its citation. */
export function effectiveAtmospheres(state: Pick<NpcWorldState,'events'|'developmentAtmospheres'>): DevelopmentAtmosphere[] {
  const effective = new Set(state.events.filter(event=>!event.correction).map(event=>event.id));
  return (state.developmentAtmospheres??[]).filter(row=>row.basisEventIds.every(id=>effective.has(id)));
}
export function discardInvalidAtmospheres<T extends NpcWorldState>(state:T):T {
  if(!state.developmentAtmospheres)return state;
  const rows=effectiveAtmospheres(state);
  return rows.length===state.developmentAtmospheres.length?state:{...state,developmentAtmospheres:rows};
}

export function createEmptyState(scopeId: string): NpcWorldState {
  return { schemaVersion: 1, scopeId, storyTime: null, processedThroughSeq: null, historyRanges: [], activities: [], events: [], knowledge: [] };
}

export function projectWorldState(scopeId: string, people: WorldSnapshot['people'], state: NpcWorldState): WorldSnapshot {
  const existing=new Set(people.map(person=>person.id));
  people=[...people,...mergeWorldPeople([],state).filter(person=>!existing.has(person.id)).map(projectSourcePerson)];
  const activityByPerson = new Map<string, Activity[]>();
  for (const activity of state.activities) for (const id of activity.participantIds) {
    const list = activityByPerson.get(id) ?? [];
    list.push(activity); activityByPerson.set(id, list);
  }
  const hints=new Map((state.developmentPresentation??[]).map(h=>[h.personId,h]));
  const known=new Set(people.map(p=>p.id));
  const profileRelations:ProfileRelation[]=[];
  const effectiveFoundation=foundationForInput(state.foundation,people);
  const projectedPeople = people.map(person => {
    const display=validPresentation(person,hints.get(person.id));
    for(const edge of display.relations??[])if(known.has(edge.fromPersonId)&&known.has(edge.toPersonId)&&!profileRelations.some(e=>JSON.stringify(e)===JSON.stringify(edge)))profileRelations.push(edge);
    const activities = activityByPerson.get(person.id) ?? [];
    const current = activities.find(activity => activity.status === 'active') ?? activities.find(activity => activity.status === 'waiting') ?? activities.find(activity => activity.status === 'planned');
    return { ...person, temperament:display.temperament,relationsPending:!!person.presentationSource?.relations&&display.relations===undefined, status: current?.title ?? (activities.length ? '暂无进行中的活动' : '尚无活动记录') };
  });
  for(const row of effectiveFoundation?.relations??[]){const edge={fromPersonId:row.fromPersonId,toPersonId:row.toPersonId,fromRole:row.fromRole,toRole:row.toRole,directed:row.directed};const index=profileRelations.findIndex(previous=>previous.directed===edge.directed&&(previous.fromPersonId===edge.fromPersonId&&previous.toPersonId===edge.toPersonId&&previous.fromRole===edge.fromRole&&previous.toRole===edge.toRole||!edge.directed&&previous.fromPersonId===edge.toPersonId&&previous.toPersonId===edge.fromPersonId&&previous.fromRole===edge.toRole&&previous.toRole===edge.fromRole));if(index>=0)profileRelations.splice(index,1);if(!row.endedWindowId)profileRelations.push(edge);}
  return { id: scopeId, storyTime: state.storyTime, people: projectedPeople, developmentOnstagePersonIds:state.developmentOnstagePersonIds, activities: state.activities, events: state.events, knowledge: state.knowledge, simulationRanges: state.simulationRanges, atmospheres:effectiveAtmospheres(state),profileRelations,foundation:state.foundation };
}

