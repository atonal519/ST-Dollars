<script setup lang="ts">
import { computed } from 'vue';
import type { GraphData, GraphNode } from './project-world';

const props = defineProps<{ graph: GraphData; selectedId: string | null }>();
const emit = defineEmits<{ select: [id: string] }>();

const positions = computed(() => {
  const points = new Map<string, { x: number; y: number }>();
  let personIndex = 0;
  let activityIndex = 0;
  for (const node of props.graph.nodes) {
    if (node.type === 'person') {
      const side = personIndex % 2;
      points.set(node.id, { x: side === 0 ? 185 : 615, y: 110 + Math.floor(personIndex / 2) * 120 });
      personIndex += 1;
    } else {
      points.set(node.id, { x: 400, y: 130 + activityIndex * 140 });
      activityIndex += 1;
    }
  }
  return points;
});

function nodeClass(node: GraphNode): string[] {
  return ['graph-node', `is-${node.type}`, ...(props.selectedId === node.id ? ['selected'] : [])];
}
</script>

<template>
  <svg class="world-graph" viewBox="0 0 800 520" role="img" aria-label="人物与活动图谱">
    <g v-for="edge in graph.edges" :key="edge.id" class="graph-edge">
      <line
        :x1="positions.get(edge.source)?.x"
        :y1="positions.get(edge.source)?.y"
        :x2="positions.get(edge.target)?.x"
        :y2="positions.get(edge.target)?.y"
      />
      <text
        v-if="positions.get(edge.source) && positions.get(edge.target)"
        :x="((positions.get(edge.source)?.x ?? 0) + (positions.get(edge.target)?.x ?? 0)) / 2"
        :y="((positions.get(edge.source)?.y ?? 0) + (positions.get(edge.target)?.y ?? 0)) / 2 - 8"
      >参与</text>
    </g>
    <g
      v-for="node in graph.nodes"
      :key="node.id"
      :class="nodeClass(node)"
      role="button"
      tabindex="0"
      :aria-label="`${node.label}，${node.type === 'person' ? '人物' : '活动'}，${node.status}`"
      @click="emit('select', node.id)"
      @keydown.enter.prevent="emit('select', node.id)"
      @keydown.space.prevent="emit('select', node.id)"
    >
      <rect
        :x="(positions.get(node.id)?.x ?? 0) - (node.type === 'person' ? 78 : 105)"
        :y="(positions.get(node.id)?.y ?? 0) - 30"
        :width="node.type === 'person' ? 156 : 210"
        height="60"
        rx="12"
      />
      <text class="node-label" :x="positions.get(node.id)?.x" :y="(positions.get(node.id)?.y ?? 0) - 2">{{ node.label }}</text>
      <text class="node-status" :x="positions.get(node.id)?.x" :y="(positions.get(node.id)?.y ?? 0) + 17">{{ node.status }}</text>
    </g>
  </svg>
</template>
