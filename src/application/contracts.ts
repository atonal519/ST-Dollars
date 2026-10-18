import type { SourcePerson } from '../domain/source-people';
import type { SourceRef, StoryTime, WorldSnapshot } from '../domain/world';
import type { NpcWorldState } from '../domain/world-state';

export type PeopleDirectoryStatus = 'ready' | 'empty' | 'waiting' | 'unavailable' | 'error';
export interface PeopleDirectoryRead { status: PeopleDirectoryStatus; message: string; scopeId: string | null; people: SourcePerson[] }
export interface PeopleDirectoryReader { readPeople(): PeopleDirectoryRead }
export interface QuestionMaterialRequest { question: string; personIds: string[]; maxCharacters: number }
export interface QuestionMaterial { personId: string; profileText: string; stateText: string; memoryText: string; refs: QuestionMaterialRef[]; sources: SourceRef[] }
export interface QuestionMaterialRef { floorIds: string[]; memoryId: string }
export type QuestionMaterialStatus = 'ready' | 'empty' | 'waiting' | 'unavailable' | 'error';
export interface QuestionMaterialRead { status: QuestionMaterialStatus; message: string; routerText: string; materials: QuestionMaterial[]; coverage: { partial: boolean; cseStatus: string } }
export interface QuestionMaterialReader { readForQuestion(request: QuestionMaterialRequest): Promise<QuestionMaterialRead> }
export interface WorldRepository { load(scopeId: string): Promise<{ state: NpcWorldState; revision: number } | null>; save(scopeId: string, state: NpcWorldState, expectedRevision: number | null): Promise<{ state: NpcWorldState; revision: number }> }
export interface ModelProfile { url: string; model: string; key: string }
export interface PublicModelProfile { url: string; model: string; hasKey: boolean }
export interface SharedModelPresetSummary { id: string; name: string; url: string; model: string; hasUrl: boolean; hasModel: boolean; hasKey: boolean }
export interface ConfigSnapshot { primary: PublicModelProfile; secondary: PublicModelProfile; primaryPresetId: string; secondaryPresetId: string; presets: SharedModelPresetSummary[]; secondaryFollowsPrimary: boolean }
export interface ConfigService { getConfig(): Promise<ConfigSnapshot>; getProfiles(): Promise<{ primary: ModelProfile; secondary: ModelProfile; secondaryFollowsPrimary: boolean }>; saveConfig(input: { primary: Partial<ModelProfile>; primaryPresetId?: string; secondaryFollowsPrimary: boolean; secondary?: Partial<ModelProfile>; secondaryPresetId?: string }): Promise<void> }
export interface ModelRequest { task: 'plan' | 'advance'; instructions: string; input: unknown }
export interface ModelRequester { request(request: ModelRequest): Promise<unknown> }
export interface StoryTurn { seq: number; text: string; isUser: boolean }
export type StoryInputStatus = 'ready' | 'waiting' | 'empty';
export interface StoryInput { status: StoryInputStatus; message: string; throughSeq: number | null; turns: StoryTurn[]; source: SourceRef }
export interface StoryInputReader { readStoryInput(input: { afterSeq: number | null }): StoryInput }
export interface AdvanceReport { message: string; modelCalls: number; materialReads: number; throughSeq: number | null }
export interface AdvanceDiagnostics { stage: string; modelCalls: number; materialReads: number; elapsedMs: number }
export interface AdvanceDependencies { model: ModelRequester; materials: QuestionMaterialReader }
export interface AdvanceResult { state: NpcWorldState; report: AdvanceReport }
export interface SimulationAdvancer { advance(input: { people: SourcePerson[]; state: NpcWorldState; story: StoryInput; dependencies: AdvanceDependencies }): Promise<AdvanceResult> }
export interface ControllerDependencies { directory: PeopleDirectoryReader; repository: WorldRepository; story: StoryInputReader; config: ConfigService; createModelRequester(profiles: { primary: ModelProfile; secondary: ModelProfile }): ModelRequester; materials: QuestionMaterialReader; advancer: SimulationAdvancer }
export interface ControllerState { world: WorldSnapshot; source: Pick<PeopleDirectoryRead, 'status' | 'message'>; processedThroughSeq: number | null; busy: boolean; report: AdvanceReport | null; diagnostics: AdvanceDiagnostics | null; error: string }
export type { SourcePerson, NpcWorldState, StoryTime };
