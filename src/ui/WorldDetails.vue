<script setup lang="ts">
import { computed } from 'vue';
import type { QuestionMaterialReader } from '../application/contracts';
import type { Activity, Person, WorldEvent, WorldSnapshot } from '../domain/world';
import PersonMaterials from './PersonMaterials.vue';

const props = defineProps<{ world: WorldSnapshot; selected: Person | Activity | WorldEvent; materialReader: QuestionMaterialReader }>();
const emit = defineEmits<{ back: []; 'select-event': [id: string] }>();
const isPerson = computed(() => 'name' in props.selected);
const isEvent = computed(() => 'activityId' in props.selected);
const selectedPerson = computed(() => isPerson.value ? props.selected as Person : null);
const selectedEvent = computed(() => isEvent.value ? props.selected as WorldEvent : null);
const selectedActivity = computed(() => isPerson.value || isEvent.value ? null : props.selected as Activity);
const relatedEvents = computed(() => {
  if (selectedActivity.value) return props.world.events.filter(event => event.activityId === selectedActivity.value?.id);
  if (selectedEvent.value) return [selectedEvent.value];
  return props.world.events.filter(event => event.participantIds.includes(selectedPerson.value!.id));
});
const relatedActivities = computed(() => selectedPerson.value
  ? props.world.activities.filter(activity => activity.participantIds.includes(selectedPerson.value!.id) && activity.status !== 'completed')
  : []);
const knownEvents = computed(() => selectedPerson.value
  ? props.world.knowledge
    .filter(item => item.personId === selectedPerson.value?.id)
    .map(item => ({ ...item, event: props.world.events.find(event => event.id === item.eventId) }))
  : []);

function activityStatus(activity: Activity): string {
  return { planned: '计划中', active: '进行中', waiting: '等待中', completed: '已完成' }[activity.status];
}

function personById(id: string): Person | undefined {
  return props.world.people.find(person => person.id === id);
}

</script>

<template>
  <section class="bmx-reader" aria-live="polite">
    <header class="bmx-reader-head">
      <button class="bmx-back" type="button" aria-label="返回人物图谱" @click="emit('back')"><i class="fa-solid fa-arrow-left" aria-hidden="true"></i>返回图谱</button>
      <span v-if="selectedPerson" class="bmx-kicker">人物资料</span>
      <span v-else-if="selectedActivity" class="bmx-kicker">活动经过</span>
      <span v-else class="bmx-kicker">已发生事件</span>
    </header>
    <div class="bmx-reader-scroll">
      <template v-if="selectedPerson">
        <p class="bmx-reader-label">当前活动 · {{ selectedPerson.status }}</p>
        <h2>{{ selectedPerson.name }}</h2>
        <p class="bmx-person-description">{{ selectedPerson.description }}</p>
        <h3>资料来源</h3>
        <p v-for="source in selectedPerson.sources" :key="`${source.kind}:${source.id}`">{{ source.label }}</p>
        <PersonMaterials :reader="materialReader" :person-id="selectedPerson.id" />
        <template v-if="relatedActivities.length">
          <h3>相关活动</h3>
          <p v-for="activity in relatedActivities" :key="activity.id">
            {{ activity.title }} · {{ activityStatus(activity) }}
          </p>
        </template>
        <template v-if="relatedEvents.length">
          <h3>已发生的相关事件</h3>
          <article v-for="event in relatedEvents" :key="event.id"><button class="bmx-event-link" type="button" @click="emit('select-event', event.id)">{{ event.title }}</button><p v-if="event.description !== event.title">{{ event.description }}</p><p v-for="source in event.sources" :key="`${source.kind}:${source.id}`">来源：{{ source.label }}</p></article>
        </template>
        <template v-if="knownEvents.length">
          <h3>人物获知</h3>
          <article v-for="item in knownEvents" :key="item.eventId">
            <p>{{ item.event?.title ?? '相关事件' }}：{{ item.reason }}</p>
            <p v-for="source in item.sources" :key="`${source.kind}:${source.id}`">来源：{{ source.label }}</p>
          </article>
        </template>
      </template>
      <template v-else-if="selectedActivity">
        <p class="bmx-reader-label">活动 · {{ activityStatus(selectedActivity) }}</p>
        <h2>{{ selectedActivity.title }}</h2>
        <p v-if="selectedActivity.description !== selectedActivity.title">{{ selectedActivity.description }}</p>
        <template v-if="selectedActivity.participantIds.length">
          <h3>参与人物</h3>
          <p v-for="id in selectedActivity.participantIds" :key="id">{{ personById(id)?.name ?? id }}</p>
        </template>
        <template v-if="selectedActivity.sources.length">
          <h3>活动来源</h3>
          <p v-for="source in selectedActivity.sources" :key="`${source.kind}:${source.id}`">来源：{{ source.label }}</p>
        </template>
        <template v-if="relatedEvents.length">
          <h3>相关已发生事件</h3>
          <article v-for="event in relatedEvents" :key="event.id"><button class="bmx-event-link" type="button" @click="emit('select-event', event.id)">{{ event.title }}</button><p v-if="event.description !== event.title">{{ event.description }}</p><p v-for="source in event.sources" :key="`${source.kind}:${source.id}`">来源：{{ source.label }}</p></article>
        </template>
      </template>
      <template v-else-if="selectedEvent">
        <p class="bmx-reader-label">推进时依据 · {{ selectedEvent.storyTime?.text ?? '未提供' }}</p>
        <h2>{{ selectedEvent.title }}</h2>
        <p v-if="selectedEvent.description !== selectedEvent.title">{{ selectedEvent.description }}</p>
        <template v-if="selectedEvent!.activityId && world.activities.find(item => item.id === selectedEvent!.activityId)">
          <h3>所属活动</h3>
          <button class="bmx-event-link" type="button" @click="emit('back')">{{ world.activities.find(item => item.id === selectedEvent!.activityId)?.title }}</button>
        </template>
        <template v-if="selectedEvent.participantIds.length">
          <h3>相关人物</h3>
          <p v-for="id in selectedEvent.participantIds" :key="id">{{ personById(id)?.name ?? '人物资料不可用' }}</p>
        </template>
        <template v-if="world.knowledge.some(item => item.eventId === selectedEvent!.id)">
          <h3>人物获知</h3>
          <p v-for="item in world.knowledge.filter(entry => entry.eventId === selectedEvent!.id)" :key="item.personId">{{ personById(item.personId)?.name ?? '人物资料不可用' }}：{{ item.reason }}</p>
        </template>
        <template v-if="selectedEvent.sources.length">
          <h3>事件来源</h3>
          <p v-for="source in selectedEvent.sources" :key="`${source.kind}:${source.id}`">{{ source.label }}</p>
        </template>
      </template>
    </div>
  </section>
</template>
