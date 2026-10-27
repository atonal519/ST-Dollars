import type { SourcePerson } from '../domain/source-people';
import type { SourceRef, StoryTime, WorldSnapshot } from '../domain/world';
import type { NpcWorldState } from '../domain/world-state';
import type {DevelopmentDiagnostics,DiagnosticTrace} from '../diagnostics/development';

export type PeopleDirectoryStatus = 'ready' | 'empty' | 'waiting' | 'unavailable' | 'error';
export interface PeopleDirectoryRead { status: PeopleDirectoryStatus; message: string; scopeId: string | null; people: SourcePerson[] }
export interface PeopleDirectoryReader { readPeople(): PeopleDirectoryRead }
export interface QuestionMaterialRequest { question: string; personIds: string[]; maxCharacters: number }
export interface QuestionMaterial { personId: string; profileText: string; stateText: string; memoryText: string; refs: QuestionMaterialRef[]; sources: SourceRef[] }
export interface QuestionMaterialRef { floorIds: string[]; memoryId: string }
export type QuestionMaterialStatus = 'ready' | 'empty' | 'waiting' | 'unavailable' | 'error';
export interface QuestionMaterialRead { status: QuestionMaterialStatus; message: string; routerText: string; materials: QuestionMaterial[]; coverage: { partial: boolean; cseStatus: string } }
export interface QuestionMaterialReader { readForQuestion(request: QuestionMaterialRequest): Promise<QuestionMaterialRead>; readForQuestions?(requests: QuestionMaterialRequest[], input: {throughSeq: number | null}): Promise<QuestionMaterialRead[]> }
export interface WorldRepository { load(scopeId: string): Promise<{ state: NpcWorldState; revision: number } | null>; save(scopeId: string, state: NpcWorldState, expectedRevision: number | null, diagnostic?:DiagnosticTrace): Promise<{ state: NpcWorldState; revision: number }> }
export interface ModelProfile { url: string; model: string; key: string }
export interface PublicModelProfile { url: string; model: string; hasKey: boolean }
export interface SharedModelPresetSummary { id: string; name: string; url: string; model: string; hasUrl: boolean; hasModel: boolean; hasKey: boolean }
export interface ConfigSnapshot { primary: PublicModelProfile; secondary: PublicModelProfile; primaryPresetId: string; secondaryPresetId: string; presets: SharedModelPresetSummary[]; secondaryFollowsPrimary: boolean }
export interface ConfigService {
  getConfig(): Promise<ConfigSnapshot>;
  getProfile(role: 'primary' | 'secondary'): Promise<ModelProfile>;
  getProfiles(): Promise<{ primary: ModelProfile; secondary: ModelProfile; secondaryFollowsPrimary: boolean }>;
  saveConfig(input: { primary: Partial<ModelProfile>; primaryPresetId?: string; secondaryFollowsPrimary: boolean; secondary?: Partial<ModelProfile>; secondaryPresetId?: string }): Promise<void>;
  selectApi(role: 'primary' | 'secondary', selection: { mode: 'own' | 'preset' | 'follow'; presetId?: string }): Promise<void>;
  saveEditor(role: 'primary' | 'secondary', profile: Partial<ModelProfile>): Promise<void>;
  savePresetAs(role: 'primary' | 'secondary', name: string, profile: Partial<ModelProfile>): Promise<string>;
  deletePreset(id: string): Promise<void>;
}
export interface ModelRequest { task: 'plan' | 'advance' | 'history' | 'trajectory' | 'trajectory-batch' | 'development' | 'atmosphere' | 'world-construction'; instructions: string; input: unknown; signal?: AbortSignal; onStarted?: () => void; diagnostic?:DiagnosticTrace }
export interface ModelRequester { request(request: ModelRequest): Promise<unknown> }
export interface StoryTurn { seq: number; text: string; isUser: boolean; /** Reference clocks remain usable for time boundaries, not author corrections. */ calibrationEligible?: boolean }
export type StoryInputStatus = 'ready' | 'waiting' | 'empty';
export interface StoryInput { status: StoryInputStatus; message: string; throughSeq: number | null; turns: StoryTurn[]; source: SourceRef; latestAiSeq?: number | null }
export interface StoryInputReader { readStoryInput(input: { afterSeq: number | null }): StoryInput }
export interface StoryHistoryReader { readStoryHistory(input: { fromSeq: number; toSeq?: number; scopeId: string; stableOnly?: boolean; currentOnly?: boolean }): { status: StoryInputStatus; message: string; fromSeq: number; throughSeq: number | null; latestAiSeq?: number | null; floorCount: number; excludedFloors: number; turns: StoryTurn[]; source: SourceRef } }
export interface AdvanceReport { message: string; modelCalls: number; materialReads: number; throughSeq: number | null }
export interface AdvanceDiagnostics { stage: string; modelCalls: number; materialReads: number; elapsedMs: number }
export interface WorldSettings { characterDescription: string; books: Array<{name:string;entries:Array<{id:string;content:string;comment?:string;keys?:string[];secondaryKeys?:string[];constant?:boolean;selective?:boolean;selectiveLogic?:number;useProbability?:boolean;probability?:number}>}>; partial: boolean }
export interface WorldSettingsReader { read(): Promise<WorldSettings> }
export interface AdvanceDependencies { model: ModelRequester; materials: QuestionMaterialReader; worldSettings?: WorldSettingsReader }
export interface AdvanceResult { state: NpcWorldState; report: AdvanceReport; currentActivityUpdates?: Array<{id: string; change: import('../domain/world').ActivityChange}>; calibration?: import('../simulation/calibration').Calibration | null; calibratedState?: NpcWorldState; window?: import('../domain/world').SimulationWindow }
export interface SimulationAdvancer { advance(input: { people: SourcePerson[]; state: NpcWorldState; story: StoryInput; mode?: 'start' | 'advance'; window?: import('../domain/world').SimulationWindow; inputCharacters?: number; dependencies: AdvanceDependencies }): Promise<AdvanceResult> }
export interface ControllerDependencies { worldSettings?:WorldSettingsReader; diagnostics?:DevelopmentDiagnostics; directory: PeopleDirectoryReader; repository: WorldRepository; story: StoryInputReader; history?: StoryHistoryReader; config: ConfigService; createModelRequester(profiles: { primary: ModelProfile; secondary: ModelProfile }): ModelRequester; materials: QuestionMaterialReader; advancer: SimulationAdvancer }
export interface ControllerState { world: WorldSnapshot; source: Pick<PeopleDirectoryRead, 'status' | 'message'>; processedThroughSeq: number | null; currentTimeStarted: boolean; busy: boolean; report: AdvanceReport | null; diagnostics: AdvanceDiagnostics | null; error: string }
export interface HistoryIntakeView { status: 'idle' | 'checked' | 'collecting' | 'preview' | 'cancelled' | 'error' | 'saved'; fromSeq: number; throughSeq: number | null; batchCharacters: 12000 | 24000 | 48000; floors: number; excludedFloors: number; characters: number; batches: number; skipped: number; partial: boolean; progress: number; modelCalls: number; materialReads: number; currentBatch?: number; stage?: 'materials' | 'request' | 'merge'; canContinue?: boolean; message: string; candidate?: NpcWorldState; error?: string }
export type { SourcePerson, NpcWorldState, StoryTime };

export interface TrajectoryView { status: 'idle' | 'checked' | 'preparing' | 'ready' | 'running' | 'stopped' | 'error' | 'saved'; check?: import('./trajectory').TrajectoryCheck; prepared?: import('../simulation/trajectory').PreparedTrajectory; completed: number; modelCalls: number; canSave?: boolean; conflict?: boolean; preparationCalls?: number; requestPending?: boolean; progress?: {windowIndex: number; stage: 'plan' | 'advance' | 'save'}; currentWindowId?: string; savedThrough?: import('../domain/world').StoryBoundary; message: string; error?: string }
