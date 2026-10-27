<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import cytoscape from '../vendor/cytoscape.min.cjs';
import type { GraphData, GraphNode } from './project-world';
import { graphPresentation } from './presentation';
import { syncGraphElements, syncGraphPresentation } from './cytoscape-adapter';
import { createCytoscapeStyle, type GraphColors } from './cytoscape-style';

const props = defineProps<{ graph: GraphData; selectedId: string | null }>();
const emit = defineEmits<{ select: [id: string] }>();
const viewport = ref<HTMLElement | null>(null);
const jumpId = ref('');
const activePeople = computed(() => new Set(graphPresentation(props.graph, null).foregroundPersonIds));
const priorityNodes = computed(() => props.graph.nodes.filter(node => node.type === 'activity' && node.status === 'active' || node.type === 'person' && activePeople.value.has(node.id)));
const priorityIds = computed(() => new Set(priorityNodes.value.map(node => node.id)));
const otherNodes = computed(() => props.graph.nodes.filter(node => !priorityIds.value.has(node.id)));
let cy: any;
let observer: ResizeObserver | undefined;
let themeObserver: MutationObserver | undefined;
let zoomedLabels = false;
let initialViewReady = false;
let pendingFocusId: string | null = null;
let lastViewportSize: { width: number; height: number } | null = null;

function fullName(node: GraphNode): string { return node.label; }
function readColors(): GraphColors {
  const get = (name: string, fallback: string) => viewport.value ? getComputedStyle(viewport.value).getPropertyValue(name).trim() || fallback : fallback;
  return {
    ink: get('--bmx-ink', '#e7e5e4'), muted: get('--bmx-muted', '#99938b'), line: get('--bmx-line', '#68615a'),
    star: get('--bmx-star', '#d3c4a5'), selected: get('--bmx-selected', '#d28c57'), base: get('--bmx-base', '#141f28'),
  };
}
function syncGraph() {
  if (!cy) return;
  syncGraphElements(cy, props.graph);
  syncPresentation();
}
function syncPresentation() {
  if (!cy) return;
  syncGraphPresentation(cy, props.graph, props.selectedId, zoomedLabels, readColors());
}
function selectNode(id: string) {
  if (props.graph.nodes.some(node => node.id === id)) emit('select', id);
}
function jumpToSelection() {
  const id = jumpId.value;
  jumpId.value = '';
  if (id) selectNode(id);
}
function zoom(factor: number) {
  if (cy && viewport.value) cy.zoom({ level: Math.max(0.55, Math.min(2.4, cy.zoom() * factor)), renderedPosition: { x: viewport.value.clientWidth / 2, y: viewport.value.clientHeight / 2 } });
}
function fit() { if (cy) cy.fit(undefined, 28); }
function updateTheme() { syncPresentation(); }
function focusSelection(id: string): boolean {
  if (!cy || !viewport.value?.clientWidth || !viewport.value.clientHeight) return false;
  const selected = props.graph.nodes.find(node => node.id === id);
  if (!selected) return false;
  const activityIds = selected.type === 'activity'
    ? new Set([selected.id])
    : new Set(props.graph.edges.filter(edge => edge.source === id).map(edge => edge.target));
  const focusIds = new Set([id, ...activityIds]);
  for (const edge of props.graph.edges) if (activityIds.has(edge.target)) focusIds.add(edge.source);
  const focus = cy.nodes().filter((node: any) => focusIds.has(node.id()));
  if (focus.length) cy.fit(focus, 28);
  return Boolean(focus.length);
}
function setInitialView() {
  if (initialViewReady || !cy || !viewport.value?.clientWidth || !viewport.value.clientHeight || !cy.elements().length) return;
  initialViewReady = true;
  const initial = graphPresentation(props.graph, null);
  if (initial.activeActivityIds.length) {
    const focusIds = new Set([...initial.activeActivityIds, ...initial.foregroundPersonIds]);
    const focus = cy.nodes().filter((node: any) => focusIds.has(node.id()));
    cy.fit(focus, 28);
  } else cy.fit(undefined, 28);
}

defineExpose({ fit });

onMounted(() => {
  if (!viewport.value) return;
  cy = cytoscape({
    container: viewport.value,
    layout: { name: 'preset', fit: false },
    minZoom: 0.55,
    maxZoom: 2.4,
    userZoomingEnabled: true,
    userPanningEnabled: true,
    boxSelectionEnabled: false,
    autoungrabify: true,
    style: createCytoscapeStyle(readColors()),
  });
  cy.on('tap', 'node', (event: any) => selectNode(event.target.id()));
  cy.on('zoom', () => {
    const next = cy.zoom() >= 1.25;
    if (next !== zoomedLabels) { zoomedLabels = next; syncPresentation(); }
  });
  syncGraph();
  setInitialView();
  observer = new ResizeObserver(entries => {
    const rect = entries[0]?.contentRect;
    if (!rect || rect.width <= 0 || rect.height <= 0) return;
    const sizeChanged = !lastViewportSize || rect.width !== lastViewportSize.width || rect.height !== lastViewportSize.height;
    lastViewportSize = { width: rect.width, height: rect.height };
    cy?.resize();
    if (pendingFocusId && pendingFocusId === props.selectedId) {
      if (focusSelection(pendingFocusId)) pendingFocusId = null;
    } else if (sizeChanged && props.selectedId) focusSelection(props.selectedId);
    else if (sizeChanged) setInitialView();
  });
  observer.observe(viewport.value);
  const root = viewport.value.getRootNode() as ShadowRoot;
  themeObserver = new MutationObserver(updateTheme);
  themeObserver.observe(root.host, { attributes: true, attributeFilter: ['style', 'class', 'data-theme'] });
});

watch(() => props.graph, () => { syncGraph(); setInitialView(); });
watch(() => props.selectedId, async id => {
  syncPresentation();
  pendingFocusId = id;
  if (id) {
    await nextTick();
    if (props.selectedId === id && focusSelection(id)) pendingFocusId = null;
  }
});
onBeforeUnmount(() => {
  observer?.disconnect();
  themeObserver?.disconnect();
  cy?.destroy();
  cy = undefined;
});
</script>

<template>
  <div class="bmx-world-graph">
    <div class="bmx-graph-tools" aria-label="图谱工具">
      <label class="bmx-graph-jump">选择
        <select v-model="jumpId" aria-label="选择人物或活动" @change="jumpToSelection">
          <option value="">选择名称…</option>
          <optgroup label="当前活动与参与者">
            <option v-for="node in priorityNodes" :key="node.id" :value="node.id">{{ node.type === 'person' ? '人物：' : '活动：' }}{{ fullName(node) }}</option>
          </optgroup>
          <optgroup label="其他人物与活动">
            <option v-for="node in otherNodes" :key="node.id" :value="node.id">{{ node.type === 'person' ? '人物：' : '活动：' }}{{ fullName(node) }}</option>
          </optgroup>
        </select>
      </label>
      <button type="button" aria-label="放大图谱" @click="zoom(1.18)"><i class="fa-solid fa-plus" aria-hidden="true"></i></button>
      <button type="button" aria-label="缩小图谱" @click="zoom(0.85)"><i class="fa-solid fa-minus" aria-hidden="true"></i></button>
      <button type="button" aria-label="适应图谱" @click="fit"><i class="fa-solid fa-expand" aria-hidden="true"></i></button>
    </div>
    <div class="bmx-graph-viewport" ref="viewport" role="img" aria-label="人物与活动图谱。使用上方名称选择框按键盘浏览和选择节点；人物连线仅表示活动参与。"></div>
  </div>
</template>
