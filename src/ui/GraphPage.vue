<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { projectWorld } from '../graph/project-world';
import type { ControllerState } from '../application/contracts';
import type { Activity, Person, WorldEvent } from '../domain/world';
import type { QuestionMaterialReader } from '../application/contracts';
import WorldGraph from '../graph/WorldGraph.vue';
import WorldDetails from './WorldDetails.vue';
import NodeOverview from './NodeOverview.vue';
import CurrentActivities from './CurrentActivities.vue';
import AdvanceControls from './AdvanceControls.vue';
import type { HistoryIntakeView, TrajectoryView } from '../application/contracts';
import { historyBlocksAdvance } from '../history/status';
import { formatStoryTime } from './story-time';

const props = defineProps<{ state: ControllerState; materialReader: QuestionMaterialReader; historyView: HistoryIntakeView; trajectoryView?: TrajectoryView; historyStatus: string; enabled: boolean }>();
const emit = defineEmits<{ (event: 'refresh'): void; (event: 'advance'): void; (event: 'history'): void }>();
const selectedId = ref<string | null>(null);
const fullView = ref(false);
const mobile = ref(false);
const currentView = ref<'activities' | 'graph'>('activities');
const returnFromEvent = ref<{ id: string | null; fullView: boolean } | null>(null);
const graph = computed(() => projectWorld(props.state.world));
const selected = computed(() => props.state.world.people.find(item => item.id === selectedId.value)
  ?? props.state.world.activities.find(item => item.id === selectedId.value)
  ?? props.state.world.events.find(item => item.id === selectedId.value)
  ?? null);
const selectionForGraph = computed(() => selected.value && 'activityId' in selected.value
  ? selected.value.activityId
  : selectedId.value);
const hasFullView = computed(() => Boolean(selected.value && fullView.value));
const selectedIsEvent = computed(() => Boolean(selected.value && 'activityId' in selected.value));
const backLabel = computed(() => {
  if (selectedIsEvent.value) {
    const parent = returnFromEvent.value?.id;
    const parentActivity = props.state.world.activities.find(item => item.id === parent);
    return parentActivity ? '返回活动经过' : '返回上一页';
  }
  if (currentView.value === 'graph' && mobile.value) return '返回概况';
  return currentView.value === 'activities' ? '返回当前活动' : '返回图谱';
});
const storyTime = computed(() => props.state.world.storyTime ? formatStoryTime(props.state.world.storyTime.text) : '尚未确定');
const blocksAdvance = computed(() => historyBlocksAdvance(props.historyView) || props.trajectoryView?.status === 'ready');
const advanceBusyLabel = computed(() => props.trajectoryView?.status === 'ready' ? '等待开始幕后补写' : props.trajectoryView?.status === 'running' ? '正在补写幕后…' : props.trajectoryView?.status === 'preparing' ? '正在准备幕后时间段…' : props.historyView.status === 'collecting' ? '历史整理进行中' : props.historyView.status === 'preview' ? '等待确认接续' : blocksAdvance.value ? '历史接续待处理' : props.state.busy ? '正在推进…' : props.state.currentTimeStarted ? '推进到当前剧情' : '正在启动人物活动…');

let media: MediaQueryList | undefined;
function syncBreakpoint(event?: MediaQueryListEvent) { mobile.value = event?.matches ?? media?.matches ?? window.innerWidth <= 640; }
onMounted(() => { media = window.matchMedia('(max-width: 640px)'); syncBreakpoint(); media.addEventListener('change', syncBreakpoint); });
onBeforeUnmount(() => media?.removeEventListener('change', syncBreakpoint));
watch(mobile, value => { if (selected.value) fullView.value = !value; });

function selectNode(id: string) {
  const isEvent = props.state.world.events.some(item => item.id === id);
  if (isEvent) {
    const event = props.state.world.events.find(item => item.id === id);
    returnFromEvent.value = { id: selectedId.value ?? event?.activityId ?? null, fullView: selectedId.value ? fullView.value : Boolean(event?.activityId) };
  }
  else returnFromEvent.value = null;
  selectedId.value = id;
  fullView.value = !mobile.value || isEvent;
}

function viewActivity(id: string) {
  returnFromEvent.value = null;
  selectedId.value = id;
  fullView.value = true;
}

function viewActivityInGraph(id: string) {
  returnFromEvent.value = null;
  selectedId.value = id;
  fullView.value = false;
  currentView.value = 'graph';
}

function backToGraph() {
  if (selectedIsEvent.value && returnFromEvent.value) {
    selectedId.value = returnFromEvent.value.id;
    fullView.value = returnFromEvent.value.fullView;
    returnFromEvent.value = null;
    return;
  }
  if (selected.value && 'activityId' in selected.value) selectedId.value = selected.value.activityId;
  fullView.value = false;
}

function viewGraph() { currentView.value = 'graph'; }
function handleEscape(): boolean {
  if (hasFullView.value) { backToGraph(); return true; }
  if (selectedId.value) { selectedId.value = null; return true; }
  return false;
}

defineExpose({ handleEscape });
</script>

<template>
  <main class="bmx-graph-page" :class="{ 'is-reading': hasFullView }">
    <div class="bmx-page-toolbar">
      <p><span>剧情时间</span><strong>{{ storyTime }}</strong></p>
      <button class="bmx-text-button" type="button" @click="emit('refresh')"><i class="fa-solid fa-arrows-rotate" aria-hidden="true"></i>刷新人物</button>
    </div>
    <nav class="bmx-world-tabs" aria-label="世界浏览视图">
      <button type="button" :aria-pressed="currentView === 'activities'" @click="currentView = 'activities'">当前活动</button>
      <button type="button" :aria-pressed="currentView === 'graph'" @click="viewGraph">图谱</button>
    </nav>
    <p v-if="state.source.status === 'error' && state.world.people.length" class="bmx-source-error" role="alert">{{ state.source.message || '读取人物目录失败，请检查千千结后刷新。' }}</p>
    <p v-if="hasFullView && state.error" class="bmx-source-error" role="alert">{{ state.error }}</p>

    <section class="bmx-graph-stage" aria-label="人物与活动浏览">
      <CurrentActivities
        v-show="currentView === 'activities' && !hasFullView"
        :state="state"
        @view="viewActivity"
        @graph="viewActivityInGraph"
        @show-graph="viewGraph"
      />
      <section v-show="currentView === 'graph' && !hasFullView" class="bmx-graph-view" aria-label="人物世界图谱">
        <p v-if="!state.world.people.length" class="bmx-empty" role="status">
          {{ state.source.status === 'unavailable'
            ? '请启用支持人物目录的千千结，然后刷新人物。'
            : state.source.status === 'waiting'
              ? '人物目录正在等待千千结记录。准备好后可刷新人物。'
              : state.source.status === 'error'
                ? '读取人物目录失败，请检查千千结后刷新。'
                : '千千结当前没有已确认的人物。完成识别或记录后，可刷新人物。' }}
        </p>
        <WorldGraph :graph="graph" :selected-id="selectionForGraph" @select="selectNode" />
        <NodeOverview
          v-if="selected && !selectedIsEvent && mobile && currentView === 'graph'"
          v-show="!hasFullView"
          :world="state.world"
          :selected="selected as Person | Activity"
          @details="fullView = true"
          @dismiss="selectedId = null"
          @event="selectNode"
        />
      </section>
      <WorldDetails
        v-if="hasFullView && selected"
        :key="selected.id"
        :world="state.world"
        :selected="selected as Person | Activity | WorldEvent"
        :material-reader="materialReader"
        :back-label="backLabel"
        @back="backToGraph"
        @select-event="selectNode"
        @select-activity="viewActivity"
      />
    </section>

    <AdvanceControls
      :story-time="state.world.storyTime?.text ?? ''"
      :processed-through-seq="state.processedThroughSeq"
      :started="state.currentTimeStarted"
      :busy="state.busy || blocksAdvance"
      :history-status="historyStatus"
      :busy-label="advanceBusyLabel"
      :enabled="enabled"
      :report="state.report"
      :diagnostics="state.diagnostics"
      :error="state.error"
      @advance="emit('advance')"
      @history="emit('history')"
    />
  </main>
</template>
