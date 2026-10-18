import type { SourceRef, Person } from './world';

export interface SourcePerson {
  id: string;
  displayName: string;
  aliases: string[];
  description: string;
  source: SourceRef;
}

export function projectSourcePerson(person: SourcePerson): Person {
  return {
    id: person.id,
    name: person.displayName,
    status: '尚无活动记录',
    description: person.description,
    sources: [person.source],
  };
}
