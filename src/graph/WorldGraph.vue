<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import type { GraphData, GraphNode } from './project-world';
import { layoutGraph } from './layout';
import { centerPoint, fitGraph, zoomAt, type Point, type ViewportTransform } from './viewport';

const props = defineProps<{ graph: GraphData; selectedId: string | null }>();
const emit = defineEmits<{ select: [id: string] }>();
const viewport = ref<HTMLElement | null>(null);
const size = ref<Point>({ x: 360, y: 360 });
const transform = ref<ViewportTransform>({ x: -80, y: 12, scale: 1 });
const layout = computed(() => layoutGraph(props.graph));
const renderNodes = computed(() => [
  ...props.graph.nodes.filter(node => node.type === 'activity'),
  ...props.graph.nodes.filter(node => node.type === 'person'),
]);
const pointers = new Map<number, Point>();
let observer: ResizeObserver | undefined;
let dragStart: { id: number; point: Point; origin: ViewportTransform; moved: boolean } | null = null;
let pinchStart: { distance: number; worldPoint: Point; origin: ViewportTransform } | null = null;
const suppressClick = ref(false);

onMounted(() => {
  if (!viewport.value) return;
  observer = new ResizeObserver(entries => {
    const rect = entries[0]?.contentRect;
    if (!rect || rect.width <= 0 || rect.height <= 0) return;
    size.value = { x: rect.width, y: rect.height };
  });
  observer.observe(viewport.value);
});

onBeforeUnmount(() => {
  observer?.disconnect();
  pointers.clear();
  dragStart = null;
  pinchStart = null;
});

watch(() => props.graph, () => {
  // Layout changes with graph facts; viewport movement never changes node positions.
  if (!pointers.size) transform.value = initialTransform();
}, { deep: true });

function initialTransform(): ViewportTransform {
  return { x: (size.value.x - layout.value.width) / 2, y: 12, scale: 1 };
}

function localPoint(event: PointerEvent | WheelEvent): Point {
  const rect = viewport.value?.getBoundingClientRect();
  return { x: event.clientX - (rect?.left ?? 0), y: event.clientY - (rect?.top ?? 0) };
}

function nodePoint(id: string): Point | undefined { return layout.value.points.get(id); }

function select(id: string) {
  if (suppressClick.value) { suppressClick.value = false; return; }
  emit('select', id);
  const point = nodePoint(id);
  if (point) transform.value = centerPoint(point, transform.value, size.value);
}

function pointerDown(event: PointerEvent) {
  if (event.pointerType === 'mouse' && event.button !== 0) return;
  suppressClick.value = false;
  const point = localPoint(event);
  pointers.set(event.pointerId, point);
  (event.currentTarget as SVGSVGElement).setPointerCapture(event.pointerId);
  if (pointers.size === 1) {
    dragStart = { id: event.pointerId, point, origin: { ...transform.value }, moved: false };
  } else if (pointers.size === 2) {
    const [first, second] = [...pointers.values()];
    const midpoint = { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 };
    pinchStart = {
      distance: Math.hypot(first.x - second.x, first.y - second.y),
      worldPoint: { x: (midpoint.x - transform.value.x) / transform.value.scale, y: (midpoint.y - transform.value.y) / transform.value.scale },
      origin: { ...transform.value },
    };
    dragStart = null;
  }
}

function pointerMove(event: PointerEvent) {
  if (!pointers.has(event.pointerId)) return;
  const point = localPoint(event);
  pointers.set(event.pointerId, point);
  if (pointers.size >= 2 && pinchStart) {
    const [first, second] = [...pointers.values()];
    const distance = Math.hypot(first.x - second.x, first.y - second.y);
    const midpoint = { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 };
    const scale = Math.min(2.4, Math.max(0.55, pinchStart.origin.scale * distance / Math.max(1, pinchStart.distance)));
    transform.value = { scale, x: midpoint.x - pinchStart.worldPoint.x * scale, y: midpoint.y - pinchStart.worldPoint.y * scale };
    suppressClick.value = true;
  } else if (dragStart?.id === event.pointerId) {
    const dx = point.x - dragStart.point.x; const dy = point.y - dragStart.point.y;
    if (Math.hypot(dx, dy) > 5) dragStart.moved = true;
    if (dragStart.moved) {
      transform.value = { ...dragStart.origin, x: dragStart.origin.x + dx, y: dragStart.origin.y + dy };
      suppressClick.value = true;
    }
  }
}

function pointerUp(event: PointerEvent) {
  pointers.delete(event.pointerId);
  if (pointers.size < 2) pinchStart = null;
  if (pointers.size === 1) {
    const [id, point] = [...pointers.entries()][0];
    dragStart = { id, point, origin: { ...transform.value }, moved: suppressClick.value };
  } else dragStart = null;
}

function wheel(event: WheelEvent) {
  transform.value = zoomAt(transform.value, event.deltaY < 0 ? 1.12 : 0.89, localPoint(event));
}

function zoom(factor: number) {
  transform.value = zoomAt(transform.value, factor, { x: size.value.x / 2, y: size.value.y / 2 });
}

function fit() { transform.value = fitGraph(layout.value.width, layout.value.height, size.value); }

function captureClick(event: MouseEvent) {
  if (!suppressClick.value) return;
  event.stopPropagation();
  event.preventDefault();
  suppressClick.value = false;
}

function activityStatus(node: GraphNode): string {
  if (node.type === 'person') return node.status;
  return { planned: '计划中', active: '进行中', waiting: '等待中', completed: '已完成' }[node.status];
}
function nodeName(node: GraphNode): string {
  const chars = Array.from(node.label);
  if (node.type === 'person') return chars.length > 3 ? `${chars.slice(0, 3).join('')}…` : node.label;
  return chars.length > 15 ? `${chars.slice(0, 14).join('')}…` : node.label;
}
function pathFor(source: Point, target: Point): string {
  const midX = (source.x + target.x) / 2;
  return `M ${source.x} ${source.y} C ${midX} ${source.y}, ${midX} ${target.y}, ${target.x} ${target.y}`;
}

defineExpose({ fit });
</script>

<template>
  <div class="bmx-world-graph">
    <div class="bmx-graph-tools" aria-label="图谱缩放">
      <button type="button" aria-label="放大图谱" @click="zoom(1.18)"><i class="fa-solid fa-plus" aria-hidden="true"></i></button>
      <button type="button" aria-label="缩小图谱" @click="zoom(0.85)"><i class="fa-solid fa-minus" aria-hidden="true"></i></button>
      <button type="button" aria-label="适应图谱" @click="fit"><i class="fa-solid fa-expand" aria-hidden="true"></i></button>
    </div>
    <div class="bmx-graph-viewport" ref="viewport">
      <svg
        class="bmx-graph"
        :viewBox="`0 0 ${size.x} ${size.y}`"
        role="group"
        aria-label="人物与活动图谱，可拖动平移、使用触控缩放"
        @pointerdown="pointerDown"
        @pointermove="pointerMove"
        @pointerup="pointerUp"
        @pointercancel="pointerUp"
        @wheel.prevent="wheel"
        @click.capture="captureClick"
      >
        <g :transform="`translate(${transform.x} ${transform.y}) scale(${transform.scale})`">
          <g v-for="edge in graph.edges" :key="edge.id" class="bmx-edge" :class="{ 'is-selected': selectedId === edge.source || selectedId === edge.target }">
            <path
              v-if="nodePoint(edge.source) && nodePoint(edge.target)"
              class="bmx-edge-hit"
              :d="pathFor(nodePoint(edge.source)!, nodePoint(edge.target)!)"
              role="button"
              tabindex="0"
              :aria-label="`查看活动：${graph.nodes.find(node => node.id === edge.target)?.label ?? '活动'}`"
              @click.stop="select(edge.target)"
              @keydown.enter.prevent="select(edge.target)"
              @keydown.space.prevent="select(edge.target)"
            />
            <path v-if="nodePoint(edge.source) && nodePoint(edge.target)" :d="pathFor(nodePoint(edge.source)!, nodePoint(edge.target)!)" />
          </g>
          <g
            v-for="node in renderNodes"
            :key="node.id"
            class="bmx-node"
            :class="[`is-${node.type}`, { 'is-selected': selectedId === node.id }]"
            :transform="`translate(${nodePoint(node.id)?.x ?? 0} ${nodePoint(node.id)?.y ?? 0})`"
            role="button"
            tabindex="0"
            :aria-pressed="selectedId === node.id"
            :aria-label="`${node.label}，${node.type === 'person' ? '人物' : '活动'}，${activityStatus(node)}`"
            :data-node-id="node.id"
            @click.stop="select(node.id)"
            @keydown.enter.prevent="select(node.id)"
            @keydown.space.prevent="select(node.id)"
          >
            <title>{{ node.label }}</title>
            <circle v-if="node.type === 'person'" class="bmx-hit-area" r="36" />
            <circle v-if="node.type === 'person'" class="bmx-star-halo" r="14" />
            <circle v-if="node.type === 'person'" class="bmx-star" r="5.4" />
            <path v-if="node.type === 'activity'" class="bmx-activity-mark" d="M -8 -8 L -8 17" />
            <rect v-if="node.type === 'activity'" class="bmx-activity-hit" x="-112" y="-21" width="224" height="42" rx="8" />
            <text v-if="node.type === 'person'" class="bmx-person-label" x="0" y="25" text-anchor="middle">{{ nodeName(node) }}</text>
            <text v-else class="bmx-activity-label" y="0">{{ nodeName(node) }}</text>
            <text v-if="node.type === 'activity'" class="bmx-activity-status" y="18">{{ activityStatus(node) }}</text>
          </g>
        </g>
      </svg>
    </div>
  </div>
</template>
