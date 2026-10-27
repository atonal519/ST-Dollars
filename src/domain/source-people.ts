import type {PresentationSource} from './presentation';
import type { SourceRef, Person } from './world';

export interface SourcePerson {
  id: string;
  displayName: string;
  aliases: string[];
  description: string;
  /** The public directory already supplies or protects this person's author profile. */
  profileMaterialProvided?: boolean;
  identityDescription?: string;
  specialRole?: string;
  identitySummary?: string;
  identityCaption?: string;
  presentationSource?: PresentationSource;
  qqjPersonId?: string;
  foundationFields?: import('./world-foundation').FoundationFields;
  /** The current public reference stays separate from the locally projected short foundation. */
  profileReferenceDescription?: string;
  /** Explicit manual decisions from the public profile, including cleared fields. */
  manualProfile?: Record<string,string>;
  source: SourceRef;
}

export function projectSourcePerson(person: SourcePerson): Person {
  return {
    id: person.id,
    name: person.displayName,
    aliases:person.aliases,
    status: '尚无活动记录',
    description: person.description,
    identityDescription: person.identityDescription,
    identitySummary: person.identitySummary,
    identityCaption: person.identityCaption,
    presentationSource: person.presentationSource,
    profileMaterialProvided:person.profileMaterialProvided,
    sources: [person.source],
  };
}
