import type { SourcePerson } from '../domain/source-people';
import type { NpcWorldState } from '../domain/world-state';
import type {StoryTurn} from '../application/contracts';
import { storyMinutes,normalizeStoryTime } from '../host/story-clock';

export interface LifeRoutine { personId: string; activeHours: Array<[number, number]>; basis?: string; tentative?: boolean }
export interface LifeArrangement { personId: string; kind: 'active' | 'rest'; from: string; to: string; sourceSeqs?:number[] }
export const validActiveHours = (value: unknown): value is Array<[number, number]> => Array.isArray(value) && value.length > 0 && value.every(pair => Array.isArray(pair) && pair.length === 2 && pair.every(Number.isInteger) && pair[0] >= 0 && pair[0] < 24 && pair[1] >= 0 && pair[1] <= 24 && pair[0] !== pair[1]);
const overlaps = (a: number, b: number, c: number, d: number) => Math.max(a, c) < Math.min(b, d);
function covered(start: number, end: number, rests: Array<[number, number]>) {
  let cursor = start;
  for (const [a,b] of rests.sort((a,b) => a[0] - b[0])) {
    if (a > cursor) return false;
    cursor = Math.max(cursor,b);
    if (cursor >= end) return true;
  }
  return false;
}
export function developmentGate(state: NpcWorldState, people: SourcePerson[], endClock: string | null) {
  const start = storyMinutes(state.storyTime?.text), end = storyMinutes(endClock);
  if (start === null || end === null || end <= start) return { generate: true, reason: 'unknown-time' };
  for (const person of people.filter(person => person.specialRole !== 'user')) {
    const rests: Array<[number,number]> = [];
    for (const item of (state.developmentArrangements ?? []).filter(item => item.personId === person.id)) {
      const a = storyMinutes(item.from), b = storyMinutes(item.to);
      if (a === null || b === null || b <= a || !['active','rest'].includes(item.kind)) return {generate:true,reason:'unknown-arrangement'};
      if (item.kind === 'active' && overlaps(start,end,a,b)) return {generate:true,reason:'temporary-active'};
      if (item.kind === 'rest') rests.push([a,b]);
    }
    if (covered(start,end,rests)) continue;
    const routine = state.developmentRoutines?.find(item => item.personId === person.id);
    if (!routine || !validActiveHours(routine.activeHours)) return {generate:true,reason:'unknown-routine'};
    // Include the previous day because a night shift may end after midnight.
    for (let day = Math.floor(start / 1440) * 1440 - 1440; day <= end; day += 1440) for (const [a,b] of routine.activeHours) {
      const activeStart = Math.max(start,day + a * 60), activeEnd = Math.min(end,day + b * 60 + (b < a ? 1440 : 0));
      if (activeStart < activeEnd && !covered(activeStart,activeEnd,rests)) return {generate:true,reason:'active-interval'};
    }
  }
  return {generate:false,reason:'known-rest-throughout'};
}
export function mergeLifeRhythm(state: NpcWorldState, people: SourcePerson[], data: Record<string,unknown>, endClock: string | null,turns:StoryTurn[]=[]): Pick<NpcWorldState,'developmentRoutines'|'developmentArrangements'> {
  const ids = new Set(people.filter(person => person.specialRole !== 'user').map(person => person.id));
  const routines = new Map((state.developmentRoutines ?? []).map(item => [item.personId,item]));
  for(const personId of ids)if(!routines.has(personId))routines.set(personId,{personId,activeHours:[]});
  if (Array.isArray(data.routines)) for (const item of data.routines) {
    if (!item || !ids.has(item.personId)) continue;
    const activeHours=validActiveHours([item.activeHours])?[item.activeHours]:item.activeHours;
    if(!validActiveHours(activeHours))continue;
    routines.set(item.personId,{personId:item.personId,activeHours,...(typeof item.basis === 'string' ? {basis:item.basis} : {}),...(typeof item.tentative === 'boolean' ? {tentative:item.tentative} : {})});
  }
  const end = storyMinutes(endClock);
  const arrangements = new Map<string,LifeArrangement>();
  for (const item of state.developmentArrangements ?? []) {
    const expiry=storyMinutes(item.to);if(end!==null&&expiry!==null&&expiry<=end)continue;
    arrangements.set(JSON.stringify([item.personId,storyMinutes(item.from)??item.from,storyMinutes(item.to)??item.to]),item);
  }
  const eligible=new Set(turns.filter(turn=>turn.calibrationEligible!==false).map(turn=>turn.seq));
  for (const item of Array.isArray(data.arrangements) ? data.arrangements : []) {
    if (!item || !ids.has(item.personId) || !['active','rest'].includes(item.kind)) continue;
    // Precise temporary schedules synchronize body facts, unlike tentative broad routines.
    if(!Array.isArray(item.sourceSeqs)||!item.sourceSeqs.length||item.sourceSeqs.some((seq:unknown)=>!Number.isInteger(seq)||!eligible.has(seq as number)))continue;
    const a = storyMinutes(item.from), b = storyMinutes(item.to);
    if (a === null || b === null || b <= a || (end !== null && b <= end)) continue;
    arrangements.set(JSON.stringify([item.personId,storyMinutes(item.from)??item.from,storyMinutes(item.to)??item.to]),{personId:item.personId,kind:item.kind,from:normalizeStoryTime(item.from),to:normalizeStoryTime(item.to),sourceSeqs:[...new Set<number>(item.sourceSeqs)]});
  }
  return {...(state.developmentRoutines || routines.size ? {developmentRoutines:[...routines.values()]} : {}),...(state.developmentArrangements || arrangements.size ? {developmentArrangements:[...arrangements.values()]} : {})};
}
