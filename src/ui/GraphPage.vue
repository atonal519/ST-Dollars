<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { projectWorld } from '../graph/project-world';
import type { ControllerState } from '../application/contracts';
import type { Activity, Person, WorldEvent } from '../domain/world';
import type { QuestionMaterialReader } from '../application/contracts';
import WorldGraph from '../graph/WorldGraph.vue';
import WorldDetails from './WorldDetails.vue';
import NodeOverview from './NodeOverview.vue';
import AdvanceControls from './AdvanceControls.vue';

const props = defineProps<{ state: ControllerState; materialReader: QuestionMaterialReader }>();
const emit = defineEmits<{ refresh: []; advance: [] }>();
const selectedId = ref<string | null>(null);
const fullView = ref(false);
const mobile = ref(false);
const graph = computed(() => projectWorld(props.state.world));
const selected = computed(() => props.state.world.people.find(item => item.id === selectedId.value)
  ?? props.state.world.activities.find(item => item.id === selectedId.value)
  ?? props.state.world.events.find(item => item.id === selectedId.value)
  ?? null);
const selectionForGraph = computed(() => selected.value && 'activityId' in selected.value
  ? selected.value.activityId
  : selectedId.value);
const hasFullView = computed(() => Boolean(selected.value && fullView.value));

let media: MediaQueryList | undefined;
function syncBreakpoint(event?: MediaQueryListEvent) { mobile.value = event?.matches ?? media?.matches ?? window.innerWidth <= 640; }
onMounted(() => { media = window.matchMedia('(max-width: 640px)'); syncBreakpoint(); media.addEventListener('change', syncBreakpoint); });
onBeforeUnmount(() => media?.removeEventListener('change', syncBreakpoint));
watch(mobile, value => { if (selected.value) fullView.value = !value; });

function selectNode(id: string) {
  selectedId.value = id;
  fullView.value = !mobile.value || Boolean(props.state.world.events.find(item => item.id === id));
}

function backToGraph() {
  if (selected.value && 'activityId' in selected.value) selectedId.value = selected.value.activityId;
  fullView.value = false;
}

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
      <p><span>剧情时间</span><strong>{{ state.world.storyTime?.text ?? '尚未确定' }}</strong></p>
      <button class="bmx-text-button" type="button" @click="emit('refresh')"><i class="fa-solid fa-arrows-rotate" aria-hidden="true"></i>刷新人物</button>
    </div>
    <p v-if="state.source.status === 'error' && state.world.people.length" class="bmx-source-error" role="alert">{{ state.source.message || '读取人物目录失败，请检查千千结后刷新。' }}</p>
    <p v-if="hasFullView && state.error" class="bmx-source-error" role="alert">{{ state.error }}</p>

    <section class="bmx-graph-stage" aria-label="人物世界图谱">
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
        v-if="selected && !('activityId' in selected) && mobile"
        v-show="!hasFullView"
        :world="state.world"
        :selected="selected as Person | Activity"
        @details="fullView = true"
        @dismiss="selectedId = null"
        @event="selectNode"
      />
      <WorldDetails
        v-if="hasFullView && selected"
        :key="selected.id"
        v-show="hasFullView"
        :world="state.world"
        :selected="selected as Person | Activity | WorldEvent"
        :material-reader="materialReader"
        @back="backToGraph"
        @select-event="selectNode"
      />
    </section>

    <AdvanceControls
      :story-time="state.world.storyTime?.text ?? ''"
      :processed-through-seq="state.processedThroughSeq"
      :busy="state.busy"
      :report="state.report"
      :diagnostics="state.diagnostics"
      :error="state.error"
      @advance="emit('advance')"
    />
  </main>
</template>
