<script setup lang="ts">
import { computed } from 'vue';
import { classifyKnowledge, isEffectiveEvent } from '../domain/world-facts';
import type { Activity, Person, WorldEvent, WorldSnapshot } from '../domain/world';

const props = defineProps<{ world: WorldSnapshot; selected: Person | Activity }>();
const emit = defineEmits<{ details: []; dismiss: []; event: [id: string] }>();
const isPerson = computed(() => 'name' in props.selected);
const person = computed(() => isPerson.value ? props.selected as Person : null);
const activity = computed(() => isPerson.value ? null : props.selected as Activity);
const participants = computed(() => activity.value?.participantIds.map(id => props.world.people.find(personItem => personItem.id === id)?.name).filter((name): name is string => Boolean(name)) ?? []);
const recentEvents = computed(() => props.world.events
  .filter(event => isEffectiveEvent(event) && (isPerson.value ? event.participantIds.includes(person.value!.id) : event.activityId === activity.value!.id))
  .slice(-1));
const knownEvents = computed(() => person.value
  ? props.world.knowledge.filter(item => item.personId === person.value!.id).map(item => { const event = props.world.events.find(event => event.id === item.eventId); return event ? {event, classification: classifyKnowledge(item, event)} : null; }).filter(item => item && item.classification !== 'invalidated').slice(-1)
  : []);
const currentActivityLabel = computed(() => person.value?.status ?? '尚无活动记录');
const excerpt = computed(() => (person.value?.description ?? '').trim());
</script>

<template>
  <section class="bmx-overview" aria-label="所选内容概况">
    <div class="bmx-overview-copy">
      <div class="bmx-overview-heading">
        <div>
          <p class="bmx-kicker">{{ person ? '人物概况' : '活动概况' }}</p>
          <h2>{{ person?.name ?? activity?.title }}</h2>
        </div>
        <button class="bmx-overview-dismiss" type="button" aria-label="收起概况" @click="emit('dismiss')"><i class="fa-solid fa-xmark" aria-hidden="true"></i></button>
      </div>
      <p v-if="excerpt" class="bmx-excerpt">{{ excerpt }}</p>
      <p v-if="person" class="bmx-overview-line"><span>当前活动</span>{{ currentActivityLabel }}</p>
      <p v-if="activity" class="bmx-overview-line"><span>状态</span>{{ ({ planned: '计划中', active: '进行中', waiting: '等待中', completed: '已完成' })[activity.status] }}<template v-if="participants.length"> · {{ participants.join('、') }}</template></p>
      <p v-for="event in recentEvents" :key="event.id" class="bmx-overview-line"><span>最近发生</span><button type="button" @click="emit('event', event.id)">{{ event.title }}</button></p>
      <p v-for="item in knownEvents" :key="`known-${item!.event.id}`" class="bmx-overview-line"><span>{{ item!.classification === 'retained-report' ? '收到过的说法' : '此人已知' }}</span><button type="button" @click="emit('event', item!.event.id)">{{ item!.event.title }}</button></p>
    </div>
    <button class="bmx-overview-open" type="button" aria-label="查看" @click="emit('details')">查看<i class="fa-solid fa-arrow-right" aria-hidden="true"></i></button>
  </section>
</template>
