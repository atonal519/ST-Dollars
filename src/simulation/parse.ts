import type { Calibration } from './calibration';
import { extractJson } from './json';

function obj(value: unknown): Record<string, any> | null { return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, any> : null; }
function unwrap(value: unknown): Record<string, any> | null {
  let current = obj(extractJson(value));
  for (let i = 0; i < 4 && current; i++) {
    const nested = obj(current.result ?? current.data ?? current.plan ?? current.output);
    if (!nested) break;
    current = nested;
  }
  return current;
}
function stableId(value: unknown): string | null {
  if (typeof value === 'string') return value.trim() || null;
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    const id = (value as Record<string, unknown>).id;
    return typeof id === 'string' ? id.trim() || null : null;
  }
  return null;
}

function selection(data: Record<string, any>, names: string[]) {
  const name = names.find(key => Object.hasOwn(data, key));
  if (name === undefined) return { present: false, ids: [] as string[], invalidCount: 0 };
  const value = data[name];
  const values = Array.isArray(value) ? value : typeof value === 'string' || (value !== null && typeof value === 'object') ? [value] : null;
  if (values === null) return { present: true, ids: [] as string[], invalidCount: 1 };
  const ids: string[] = [];
  let invalidCount = 0;
  for (const item of values) {
    const id = stableId(item);
    if (id) ids.push(id); else invalidCount++;
  }
  return { present: true, ids, invalidCount };
}

export function parsePlan(value: unknown) {
  const data = unwrap(value);
  if (!data) throw new Error('范围判断结果无法读取，请重新推进。');
  const calibration = obj(data.calibration);
  const rows = (value: unknown) => (Array.isArray(value) ? value : obj(value) ? [value] : []).filter(item => obj(item));
  const normalizedCalibration = calibration ? Object.fromEntries(['facts', 'eventCorrections', 'activityUpdates', 'knowledgeCorrections'].map(key => [key, rows(calibration[key])])) as unknown as Calibration : null;
  const additions = { windowEnd: obj(data.windowEnd ?? data.window_end), calibration: normalizedCalibration, continuingEffects: rows(data.continuingEffects) };
  const intentionKey = ['intentions', 'intents', 'intent'].find(key => Object.hasOwn(data, key));
  if (intentionKey) {
    const value = data[intentionKey];
    const valueIsRow = !!obj(value) && (Object.hasOwn(obj(value)!, 'personId') || Object.hasOwn(obj(value)!, 'person_id'));
    const entries: unknown[] = Array.isArray(value) ? value : valueIsRow ? [value] : [];
    let invalidSelectionCount = value === null || typeof value !== 'object' || (!Array.isArray(value) && !valueIsRow) ? 1 : 0;
    const intentions = [] as Array<{ personId: string; action: string; waitReason: string; activityId: string | null; interactionPersonIds?: string[] }>;
    for (const raw of entries) {
      const item = obj(raw);
      const personId = typeof (item?.personId ?? item?.person_id) === 'string' ? String(item?.personId ?? item?.person_id).trim() : '';
      const action = typeof (item?.action ?? item?.intent) === 'string' ? String(item?.action ?? item?.intent).trim() : '';
      const waitReason = typeof (item?.waitReason ?? item?.wait_reason) === 'string' ? String(item?.waitReason ?? item?.wait_reason).trim() : '';
      const activityId = stableId(item?.activityId ?? item?.activity_id);
      if (!item || !personId || (!action && !waitReason)) { invalidSelectionCount++; continue; }
      const interactions = selection(item, ['interactionPersonIds', 'interaction_person_ids']);
      intentions.push({ personId, action, waitReason, activityId, ...(interactions.present ? { interactionPersonIds: interactions.ids } : {}) });
    }
    if (!intentions.length && invalidSelectionCount) throw new Error('范围判断结果没有可确认的人物意图，请重新推进。');
    const storyTime = data.storyTime ?? data.story_time ?? null;
    return {
      ...additions, intentions, legacy: false, personIds: [] as string[], activityIds: [] as string[], rawPersonIds: [] as string[], rawActivityIds: [] as string[],
      invalidSelectionCount,
      question: typeof (data.question ?? data.materialQuestion) === 'string' ? (data.question ?? data.materialQuestion).trim() : '',
      storyTime: typeof storyTime === 'string' && storyTime.trim() ? storyTime.trim() : null,
    };
  }
  const personSelection = selection(data, ['personIds', 'selectedPersonIds', 'participantIds', 'people']);
  const activitySelection = selection(data, ['activityIds', 'selectedActivityIds', 'activities']);
  if (!personSelection.present && !activitySelection.present) throw new Error('范围判断结果缺少人物或活动选择，请重新推进。');
  const storyTime = data.storyTime ?? data.story_time ?? null;
  return {
    ...additions, personIds: personSelection.ids, activityIds: activitySelection.ids, intentions: [] as Array<{ personId: string; action: string; waitReason: string; activityId: string | null; interactionPersonIds?: string[] }>, legacy: true,
    rawPersonIds: personSelection.ids, rawActivityIds: activitySelection.ids,
    invalidSelectionCount: personSelection.invalidCount + activitySelection.invalidCount,
    question: typeof (data.question ?? data.materialQuestion) === 'string' ? (data.question ?? data.materialQuestion).trim() : '',
    storyTime: typeof storyTime === 'string' && storyTime.trim() ? storyTime.trim() : null,
  };
}
export function parseBatch(value: unknown) {
  const data = unwrap(value);
  if (!data) throw new Error('本批活动结果格式不完整，请重新推进。');
  const eventKey = Object.hasOwn(data, 'events') ? 'events' : Object.hasOwn(data, 'results') ? 'results' : undefined;
  const names = ['activities', ...(eventKey ? [eventKey] : []), 'knowledge'];
  if (!names.some(key => Object.hasOwn(data, key))) throw new Error('本批活动结果格式不完整，请重新推进。');
  const normalizeList = (key: string) => {
    if (!Object.hasOwn(data, key)) return { items: [] as unknown[], invalidCount: 0 };
    const value = data[key];
    if (Array.isArray(value)) return { items: value as unknown[], invalidCount: 0 };
    if (value !== null && typeof value === 'object') return { items: [value] as unknown[], invalidCount: 0 };
    return { items: [] as unknown[], invalidCount: 1 };
  };
  const activities = normalizeList('activities');
  const events = normalizeList(eventKey ?? 'events');
  const knowledge = normalizeList('knowledge');
  const currentActivityUpdates = normalizeList('currentActivityUpdates');
  return { currentActivityUpdates: currentActivityUpdates.items, activities: activities.items, events: events.items, knowledge: knowledge.items, invalidCount: activities.invalidCount + events.invalidCount + knowledge.invalidCount };
}
