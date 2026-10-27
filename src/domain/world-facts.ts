import type { Knowledge, WorldEvent } from './world';

/** A correction keeps the original record for provenance but removes its objective claim. */
export function isEffectiveEvent(event: WorldEvent): boolean { return !event.correction; }

export function classifyKnowledge(item: Knowledge, event: WorldEvent): 'fact' | 'retained-report' | 'invalidated' {
  if (item.correction?.treatment === 'retained-report') return 'retained-report';
  if (item.correction?.treatment === 'invalidated') return 'invalidated';
  return isEffectiveEvent(event) ? 'fact' : 'invalidated';
}
