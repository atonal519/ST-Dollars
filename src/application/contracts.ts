import type { SourceRef, StoryTime, WorldSnapshot } from '../domain/world';

export interface SourcePerson {
  displayName: string;
  description: string;
  source: SourceRef;
}

export interface QuestionMaterialRequest {
  question: string;
  personIds: string[];
  maxCharacters: number;
}

export interface QuestionMaterial {
  personId: string;
  text: string;
  sources: SourceRef[];
}

export interface PersonMaterialReader {
  listPeople(): Promise<SourcePerson[]>;
  readForQuestion(request: QuestionMaterialRequest): Promise<QuestionMaterial[]>;
}

export interface WorldRepository {
  load(): Promise<WorldSnapshot | null>;
  save(snapshot: WorldSnapshot): Promise<void>;
}

export interface ModelRequest {
  task: string;
  instructions: string;
  input: unknown;
}

export interface ModelRequester {
  request(request: ModelRequest): Promise<unknown>;
}

export interface AdvanceInput {
  world: WorldSnapshot;
  storyTurn: StoryTurnInput | null;
}

export interface AdvanceResult {
  world: WorldSnapshot;
}

export interface SimulationAdvancer {
  advance(input: AdvanceInput): Promise<AdvanceResult>;
}

export interface StoryTurnInput {
  text: string;
  storyTime: StoryTime | null;
  source: SourceRef;
}

export interface StoryContextOutput {
  text: string;
  sourceEventIds: string[];
}

export interface StoryHostBridge {
  onCompletedTurn(handler: (input: StoryTurnInput) => void): () => void;
  setGenerationContext(output: StoryContextOutput): void;
}
