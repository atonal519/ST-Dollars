import type {Temperament,PresentationSource,ProfileRelation,AtmosphereVisual} from './presentation';
export interface SourceRef {
  kind: 'character' | 'world-book' | 'chat' | 'manual' | 'plugin' | 'simulation';
  id: string;
  label: string;
}

/** Story time preserves the text supplied by the story; it is not a real-world clock. */
export interface StoryTime {
  text: string;
  source?: SourceRef;
}

export interface Person {
  id: string;
  name: string;
  aliases?: string[];
  status: string;
  description: string;
  identityDescription?: string;
  identitySummary?: string;
  identityCaption?: string;
  presentationSource?: PresentationSource;
  profileMaterialProvided?: boolean;
  temperament?: Temperament;
  relationsPending?: boolean;
  sources: SourceRef[];
}

export type ActivityStatus = 'planned' | 'active' | 'waiting' | 'completed';

export interface StoryBoundary { id: string; text: string; sourceSeqs: number[] }
export interface SimulationWindow { id: string; kind: 'elapsed' | 'current'; from: StoryBoundary; to: StoryBoundary; throughSeq: number; purpose?: 'baseline'; referenceSources?: SourceRef[] }
export type ActivityChange = Partial<Pick<Activity, 'title' | 'description' | 'status' | 'participantIds'>>;
export interface EventCorrection { byEventId: string; reason: string }
export interface KnowledgeCorrection { byEventId: string; treatment: 'invalidated' | 'retained-report'; reason: string }

export interface Activity {
  id: string;
  title: string;
  status: ActivityStatus;
  description: string;
  participantIds: string[];
  sources: SourceRef[];
  /** Last saved simulation window that established the current summary. */
  currentStateWindowId?: string;
}

export interface WorldEvent {
  id: string;
  /** The activity this result belongs to; null only for a world-level event. */
  activityId: string | null;
  title: string;
  description: string;
  storyTime: StoryTime | null;
  participantIds: string[];
  sources: SourceRef[];
  simulationWindowId?: string;
  activityChange?: ActivityChange;
  correction?: EventCorrection;
  continuingForPersonIds?: string[];
  eventLinks?: Array<{eventId:string;kind:'continues'|'caused-by'}>;
}

export interface Knowledge {
  personId: string;
  eventId: string;
  reason: string;
  sources: SourceRef[];
  correction?: KnowledgeCorrection;
}

export type CreativeRecipeId = 'affairs' | 'inward' | 'contact' | 'steady' | 'practical' | 'social';
export interface DevelopmentCreativeFrame { key: string; version: 1; recipeId: CreativeRecipeId }
/** Author-level local context; membership does not grant actions or knowledge. */
export interface DevelopmentAtmosphere {
  id: string;
  /** Exact current foundation group/relation identity; no duplicated social object. */
  circleRef?: string;
  title: string;
  personIds: string[];
  description: string;
  sources: SourceRef[];
  basisEventIds: string[];
  visual?: AtmosphereVisual;
  basisMaterialRefs?: string[];
  sourceSeqs?: number[];
  storyTime?: StoryTime;
}

/** The plugin's facts. Graph data is projected from this snapshot and is never stored separately. */
export interface WorldSnapshot {
  id: string | null;
  storyTime: StoryTime | null;
  people: Person[];
  /** Current narrative scene ownership, projected from the saved world for display. */
  developmentOnstagePersonIds?: readonly string[];
  activities: Activity[];
  events: WorldEvent[];
  knowledge: Knowledge[];
  simulationRanges?: SimulationWindow[];
  atmospheres?: DevelopmentAtmosphere[];
  profileRelations?: ProfileRelation[];
  foundation?: import('./world-foundation').WorldFoundation;
}

export function createEmptyWorld(): WorldSnapshot {
  return {
    id: null,
    storyTime: null,
    people: [],
    activities: [],
    events: [],
    knowledge: [],
  };
}
