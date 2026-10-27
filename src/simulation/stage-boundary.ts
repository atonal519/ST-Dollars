import type { StoryInput } from '../application/contracts';
import type { SourcePerson } from '../domain/source-people';
import type { NpcWorldState } from '../domain/world-state';
import { list } from './trajectory';

interface Stage { key: string; index: number; onstage: Set<string> }
export interface BoundaryRejection { kind: string; key: string | null; stageKey: string | null; reason: 'stage' | 'subjects' | 'story-user' | 'onstage' | 'later-event' }

/** Scene ownership is declared semantically in the same answer, never inferred from names or clocks. */
export function developmentBoundary(input: { people: SourcePerson[]; state: NpcWorldState; story: StoryInput; cameraPersonIds?: string[] }, data: Record<string, any>) {
  const ids = new Set(input.people.map(person => person.id));
  const userIds = new Set(input.people.filter(person => person.specialRole === 'user').map(person => person.id));
  const camera = new Set((input.cameraPersonIds ?? []).filter(id => ids.has(id)));
  const eligible = new Set(input.story.turns.filter(turn => turn.calibrationEligible !== false).map(turn => turn.seq));
  const seqs = new Set(input.story.turns.map(turn => turn.seq));
  const onstage = new Set((input.state.developmentOnstagePersonIds ?? []).filter(id => ids.has(id)));
  const stages = new Map<string, Stage>();
  const rejected: BoundaryRejection[] = [];
  let previousSeq = -Infinity;
  for (const row of list(data.stages)) {
    const refs = row.sourceSeqs;
    if (typeof row.key !== 'string' || !row.key.trim() || stages.has(row.key.trim()) || !Array.isArray(refs) || !refs.length || refs.some(seq => !Number.isInteger(seq) || !seqs.has(seq)) || Math.min(...refs) < previousSeq) continue;
    if (!Array.isArray(row.onstagePersonIds) || !Array.isArray(row.offstagePersonIds) || [...row.onstagePersonIds, ...row.offstagePersonIds].some(id => !ids.has(id))) continue;
    if (row.onstagePersonIds.some((id: string) => row.offstagePersonIds.includes(id))) continue;
    previousSeq = Math.max(...refs);
    // A reference-only clock cannot grant or revoke narrative scene ownership.
    if (refs.every(seq => eligible.has(seq))) {
      for (const id of row.offstagePersonIds) onstage.delete(id);
      for (const id of row.onstagePersonIds) onstage.add(id);
    }
    stages.set(row.key.trim(), { key: row.key.trim(), index: stages.size, onstage: new Set([...onstage, ...camera, ...userIds]) });
  }
  const endpoint = new Set([...onstage, ...camera, ...userIds]);
  const stageOf = (row: Record<string, any>) => typeof row.stageKey === 'string' ? stages.get(row.stageKey) : undefined;
  return {
    onstagePersonIds: [...onstage],
    rejected,
    index(row: Record<string, any>) { return stageOf(row)?.index; },
    isProtected(row:Record<string,any>,involved:string[]) {const stage=stageOf(row);return !!stage&&involved.some(id=>stage.onstage.has(id)||endpoint.has(id));},
    acceptsEventReference(row: Record<string, any>, eventIndex: number | undefined, kind: string) {
      if (eventIndex === undefined || (stageOf(row)?.index ?? -1) >= eventIndex) return true;
      rejected.push({kind,key:typeof row.eventId==='string'?row.eventId:null,stageKey:typeof row.stageKey==='string'?row.stageKey:null,reason:'later-event'});return false;
    },
    ordered(value: unknown) { return list(value).sort((a, b) => (stageOf(a)?.index ?? Infinity) - (stageOf(b)?.index ?? Infinity)); },
    allows(row: Record<string, any>, involved: string[], kind: string, checkpoint = false) {
      const stage = stageOf(row);
      let reason: BoundaryRejection['reason'] | undefined;
      if (!stage) reason = 'stage';
      else if (!Array.isArray(row.assertedPersonIds) || row.assertedPersonIds.some((id: unknown) => typeof id !== 'string' || !ids.has(id)) || typeof row.assertsUser !== 'boolean') reason = 'subjects';
      else if (row.assertsUser || [...involved, ...row.assertedPersonIds].some(id => userIds.has(id))) reason = 'story-user';
      else if ([...involved, ...row.assertedPersonIds].some(id => stage.onstage.has(id) || checkpoint && endpoint.has(id))) reason = 'onstage';
      if (reason) rejected.push({ kind, key: typeof (row.key ?? row.id ?? row.eventId) === 'string' ? row.key ?? row.id ?? row.eventId : null, stageKey: typeof row.stageKey === 'string' ? row.stageKey : null, reason });
      return !reason;
    },
  };
}
