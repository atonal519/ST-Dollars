<script setup lang="ts">
import { computed, ref } from 'vue';
import { createEmptyWorld } from '@/domain/world';
import type { Activity, Person } from '@/domain/world';
import { projectWorld } from '@/graph/project-world';
import WorldGraph from '@/graph/WorldGraph.vue';

const emit = defineEmits<{ close: [] }>();
const world = ref(createEmptyWorld());
const graph = computed(() => projectWorld(world.value));
const selectedId = ref<string | null>(null);
const page = ref<'world' | 'settings'>('world');
const selected = computed(() => world.value.people.find(item => item.id === selectedId.value)
  ?? world.value.activities.find(item => item.id === selectedId.value)
  ?? null);
const selectedEvents = computed(() => {
  if (!selected.value) return [];
  const personIds = 'participantIds' in selected.value ? selected.value.participantIds : [selected.value.id];
  return world.value.events.filter(event => event.participantIds.some(id => personIds.includes(id)));
});
const selectedKnowledge = computed(() => {
  if (!selected.value || !('status' in selected.value && 'name' in selected.value)) return [];
  return world.value.knowledge
    .filter(item => item.personId === selected.value?.id)
    .map(item => ({ ...item, event: world.value.events.find(event => event.id === item.eventId) }));
});

function closeOnEscape(event: KeyboardEvent) {
  if (event.key === 'Escape') emit('close');
}
function activityStatus(activity: Activity): string {
  return { planned: '计划中', active: '进行中', waiting: '等待中', completed: '已完成' }[activity.status];
}
function activitiesFor(person: Person): Activity[] {
  return world.value.activities.filter(activity => activity.participantIds.includes(person.id));
}
function personById(id: string): Person | undefined {
  return world.value.people.find(person => person.id === id);
}
</script>

<template>
  <div class="world-backdrop" @click.self="emit('close')">
    <section class="world-panel" role="dialog" aria-modal="true" aria-label="人物世界" @keydown="closeOnEscape">
      <header class="world-header">
        <div class="brand"><strong>DOLLARS</strong><span>人物世界骨架</span></div>
        <div class="story-time">剧情时间：{{ world.storyTime?.text ?? '尚未提供' }}</div>
        <nav aria-label="人物世界页面">
          <button :aria-pressed="page === 'world'" @click="page = 'world'">世界图谱</button>
          <button :aria-pressed="page === 'settings'" @click="page = 'settings'">设置</button>
        </nav>
        <button class="close-button" aria-label="关闭人物世界" @click="emit('close')">×</button>
      </header>

      <main v-if="page === 'world'" class="world-content">
        <template v-if="graph.nodes.length">
          <div class="graph-area">
            <WorldGraph :graph="graph" :selected-id="selectedId" @select="selectedId = $event" />
          </div>
          <aside v-if="selected" class="detail-card" aria-live="polite">
            <template v-if="'name' in selected">
              <p class="eyebrow">人物</p>
              <h2>{{ selected.name }}</h2>
              <p>{{ selected.status }}</p>
              <p>{{ selected.description }}</p>
              <h3>正在参与</h3>
              <p v-for="activity in activitiesFor(selected)" :key="activity.id">
                {{ activity.title }} · {{ activityStatus(activity) }}
              </p>
              <h3>已发生的相关事件</h3>
              <p v-for="event in selectedEvents" :key="event.id">{{ event.title }}</p>
              <h3>人物获知</h3>
              <p v-for="item in selectedKnowledge" :key="item.eventId">
                {{ item.event?.title ?? '相关事件' }}：{{ item.reason }}
              </p>
            </template>
            <template v-else>
              <p class="eyebrow">活动 · {{ activityStatus(selected) }}</p>
              <h2>{{ selected.title }}</h2>
              <p>{{ selected.description }}</p>
              <h3>参与人物</h3>
              <p v-for="id in selected.participantIds" :key="id">{{ personById(id)?.name ?? id }}</p>
              <h3>相关已发生事件</h3>
              <p v-for="event in selectedEvents" :key="event.id">{{ event.title }}</p>
            </template>
          </aside>
        </template>
        <div v-else class="empty-world" role="status">
          <div class="empty-mark" aria-hidden="true">○</div>
          <h1>人物世界尚未接入</h1>
          <p>接入人物资料与世界记录后，这里会显示人物、活动和明确的参与关系。</p>
          <p>当前没有绑定聊天、人物或剧情时间，也不会生成虚构活动。</p>
          <button class="advance-button" disabled title="本阶段尚未接入资料、模型和存储">推进世界 · 尚未接入</button>
        </div>
      </main>

      <main v-else class="settings-content">
        <p class="eyebrow">当前阶段</p>
        <h1>设置尚未接入</h1>
        <p>模型请求、人物资料来源和世界存储尚未连接。本页面不会收集或保存 API 设置。</p>
        <p>人物资料由其来源管理；本插件后续只保存自身的活动、事件与知情记录。</p>
      </main>
      <footer class="world-footer">图谱是人物与活动记录的展示；事件结果和人物知情仍以世界记录为准。</footer>
    </section>
  </div>
</template>
