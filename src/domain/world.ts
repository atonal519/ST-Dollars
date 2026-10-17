export interface SourceRef {
  kind: 'character' | 'world-book' | 'chat' | 'manual' | 'plugin';
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
  status: string;
  description: string;
  sources: SourceRef[];
}

export type ActivityStatus = 'planned' | 'active' | 'waiting' | 'completed';

export interface Activity {
  id: string;
  title: string;
  status: ActivityStatus;
  description: string;
  participantIds: string[];
  sources: SourceRef[];
}

export interface WorldEvent {
  id: string;
  title: string;
  description: string;
  storyTime: StoryTime | null;
  participantIds: string[];
  sources: SourceRef[];
}

export interface Knowledge {
  personId: string;
  eventId: string;
  reason: string;
  sources: SourceRef[];
}

/** The plugin's facts. Graph data is projected from this snapshot and is never stored separately. */
export interface WorldSnapshot {
  id: string | null;
  storyTime: StoryTime | null;
  people: Person[];
  activities: Activity[];
  events: WorldEvent[];
  knowledge: Knowledge[];
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
