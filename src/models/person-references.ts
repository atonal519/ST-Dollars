import { extractJson } from '../simulation/json';

type PersonMap = Map<string, string>;
const personReferenceFields = new Set(['foundationPendingPersonIds','qqjPersonId','fromPersonId','toPersonId','personId', 'person_id', 'person', 'personIds', 'participantIds', 'selectedPersonIds', 'people', 'continuingForPersonIds', 'interactionPersonIds', 'interaction_person_ids', 'onstagePersonIds', 'offstagePersonIds', 'previousOnstagePersonIds', 'cameraPersonIds', 'assertedPersonIds']);
const personTables = new Set(['people', 'knownPeople', 'selectedPeople']);

function mapReference(value: unknown, ids: PersonMap): unknown {
  if (typeof value === 'string') return ids.get(value) ?? value;
  if (Array.isArray(value)) {
    let changed = false;
    const result = value.map(item => { const next = mapReference(item, ids); changed ||= next !== item; return next; });
    return changed ? result : value;
  }
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const id=typeof record.id==='string'?ids.get(record.id):undefined;
    const binding=typeof record.qqjPersonId==='string'?ids.get(record.qqjPersonId):undefined;
    if(id||binding)return {...record,...(id?{id}:{}),...(binding?{qqjPersonId:binding}:{})};
  }
  return value;
}

function mapTree(value: unknown, ids: PersonMap): unknown {
  if (Array.isArray(value)) {
    let changed = false;
    const result = value.map(item => { const next = mapTree(item, ids); changed ||= next !== item; return next; });
    return changed ? result : value;
  }
  if (!value || typeof value !== 'object') return value;
  const source = value as Record<string, unknown>;
  let result: Record<string, unknown> | undefined;
  for (const [key, child] of Object.entries(source)) {
    let next: unknown;
    if (personReferenceFields.has(key)) next = mapReference(child, ids);
    else if (personTables.has(key) && Array.isArray(child)) {
      let changed = false;
      next = child.map(person => {
        if (!person || typeof person !== 'object' || Array.isArray(person)) return person;
        const record = person as Record<string, unknown>;
        if (typeof record.id !== 'string' || !ids.has(record.id)) return person;
        changed = true;
        return { ...record, id: ids.get(record.id) };
      });
      if (!changed) next = child;
    } else next = mapTree(child, ids);
    if (personTables.has(key) && Array.isArray(child)) {
      if (next !== child) { result ??= { ...source }; result[key] = next; }
    } else if (next !== child) { result ??= { ...source }; result[key] = next; }
  }
  return result ?? value;
}

function repairKnownParticipantQuotes(value: string, ids: PersonMap): string | null {
  const tokens = [...ids.keys()].sort((left, right) => right.length - left.length)
    .map(id => JSON.stringify(id).slice(1, -1));
  const fieldToken = JSON.stringify('participantIds').slice(1, -1);
  const insertions: number[] = [];
  const stringEnd = (start: number) => {
    let escaped = false;
    for (let index = start + 1; index < value.length; index++) {
      if (escaped) escaped = false;
      else if (value[index] === '\\') escaped = true;
      else if (value[index] === '"') return index;
    }
    return -1;
  };
  for (let cursor = 0; cursor < value.length;) {
    if (value[cursor] !== '"') { cursor++; continue; }
    const end = stringEnd(cursor);
    if (end < 0) break;
    if (value.slice(cursor + 1, end) !== fieldToken) { cursor = end + 1; continue; }
    let next = end + 1;
    while (/\s/.test(value[next] ?? '') && next < value.length) next++;
    if (value[next] !== ':') { cursor = end + 1; continue; }
    next++;
    while (/\s/.test(value[next] ?? '') && next < value.length) next++;
    if (value[next] !== '[') { cursor = end + 1; continue; }
    next++;
    while (next < value.length) {
      while (/\s|,/.test(value[next] ?? '') && next < value.length) next++;
      if (value[next] === ']') break;
      if (value[next] !== '"') break;
      const token = tokens.find(candidate => value.startsWith(candidate, next + 1));
      if (token) {
        const boundary = next + 1 + token.length;
        if (value[boundary] === '"') { next = boundary + 1; continue; }
        let after = boundary;
        while (/\s/.test(value[after] ?? '') && after < value.length) after++;
        if (value[after] !== ',' && value[after] !== ']') break;
        insertions.push(boundary);
        next = after + 1;
        continue;
      }
      const itemEnd = stringEnd(next);
      if (itemEnd < 0) break;
      next = itemEnd + 1;
    }
    cursor = next;
  }
  if (!insertions.length) return null;
  let output = value;
  for (const position of insertions.reverse()) output = output.slice(0, position) + '"' + output.slice(position);
  return output;
}

export function createPersonCodes(people: unknown): PersonMap {
  if (!Array.isArray(people)) return new Map();
  const ids = new Map<string, string>();
  for (const person of people) {
    if (!person || typeof person !== 'object' || Array.isArray(person)) continue;
    const id = (person as Record<string, unknown>).id;
    if (typeof id === 'string' && id && !ids.has(id)) ids.set(id, `P${ids.size + 1}`);
  }
  return ids;
}

export function encodePersonReferences(value: unknown, ids: PersonMap): unknown {
  return mapTree(value, ids);
}

function constructionPersonKeys(value: unknown, codes: PersonMap): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  const source=value as Record<string, unknown>;
  let result=source;
  const foundation=source.foundation;
  if(foundation && typeof foundation==='object' && !Array.isArray(foundation)) {
    const table=foundation as Record<string, unknown>;
    if(Array.isArray(table.people)) {
      let changed=false;
      const people=table.people.map(person=>{
        if(!person || typeof person!=='object' || Array.isArray(person))return person;
        const row=person as Record<string, unknown>;
        if(Object.hasOwn(row,'id') || typeof row.key!=='string' || !codes.has(row.key))return person;
        changed=true;return {...row,id:row.key};
      });
      if(changed)result={...result,foundation:{...table,people}};
    }
  }
  for(const key of ['result','data','output','worldConstruction','baseline'])if(source[key]) {
    const next=constructionPersonKeys(source[key],codes);
    if(next!==source[key])result={...result,[key]:next};
  }
  return result;
}

export function decodeModelResponse(value: unknown, formalToCode: PersonMap, task: string): unknown {
  const codeToFormal = new Map([...formalToCode].map(([formal, code]) => [code, formal]));
  let parsed = value;
  if (typeof value === 'string') {
    try { parsed = extractJson(value); }
    catch {
      if (task !== 'history') return value;
      const repaired = repairKnownParticipantQuotes(value, new Map([...formalToCode, ...codeToFormal]));
      if (!repaired) return value;
      try { parsed = extractJson(repaired); } catch { return value; }
    }
  }
  return mapTree(['world-construction','atmosphere'].includes(task)?constructionPersonKeys(parsed,codeToFormal):parsed, codeToFormal);
}
