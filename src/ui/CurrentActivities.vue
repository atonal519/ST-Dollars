<script setup lang="ts">
import { computed } from 'vue';
import type { ControllerState } from '../application/contracts';
import { deriveCurrentActivities, activityStatusLabel } from './current-activities';
import { displaySourceLabel } from './source-label';
import { formatStoryTime } from './story-time';

const props = defineProps<{ state: ControllerState }>();
const emit = defineEmits<{ (event: 'view', id: string): void; (event: 'graph', id: string): void; (event: 'show-graph'): void }>();
const items = computed(() => deriveCurrentActivities(props.state.world));
</script>

<template>
  <section class="bmx-activities" aria-label="当前活动">
    <div v-if="!items.length" class="bmx-activities-empty" role="status">
      <p v-if="state.source.status === 'error'">{{ state.source.message || '读取人物目录失败，请检查千千结后刷新。' }}</p>
      <p v-else-if="state.source.status === 'waiting'">人物目录正在等待千千结记录。准备好后可刷新人物。</p>
      <p v-else-if="state.source.status === 'unavailable'">请启用支持人物目录的千千结，然后刷新人物。</p>
      <p v-else>{{ state.world.activities.length ? '当前没有未完成的活动。' : '当前还没有活动记录。' }}</p>
      <button type="button" @click="emit('show-graph')">去图谱查看历史</button>
    </div>
    <article v-for="item in items" :key="item.activity.id" class="bmx-activity-card">
      <header class="bmx-activity-heading">
        <div><span class="bmx-activity-status" :data-status="item.activity.status">{{ activityStatusLabel(item.activity) }}</span><h2>{{ item.activity.title }}</h2></div>
      </header>
      <p class="bmx-activity-people"><span>参与人物</span>{{ item.participants.length ? item.participants.join('、') : '暂无指定参与人物' }}</p>
      <p class="bmx-activity-description">{{ item.activity.description }}</p>
      <section class="bmx-activity-record" aria-label="最近记录">
        <h3>最近记录</h3>
        <template v-if="item.recentEvent">
          <strong>{{ item.recentEvent.title }}</strong>
          <p>{{ item.recentEvent.description }}</p>
          <small v-if="item.recentEvent.storyTime">{{ formatStoryTime(item.recentEvent.storyTime.text) }}</small>
          <small v-if="item.recentEvent.sources.length">来源：{{ item.recentEvent.sources.map(source => displaySourceLabel(source, state.world.id ?? '')).join('、') }}</small>
        </template>
        <p v-else class="bmx-no-record">尚无已记录结果</p>
      </section>
      <footer class="bmx-activity-actions">
        <button type="button" @click="emit('view', item.activity.id)">查看</button>
        <button type="button" @click="emit('graph', item.activity.id)">在图谱中查看</button>
      </footer>
    </article>
  </section>
</template>
