<script setup lang="ts">
import {computed,ref,nextTick} from 'vue';
import type {ControllerState} from '../application/contracts';
import type {DevelopmentView} from '../application/development';
import {hearingActivities} from './hearing-activities';
import {activityStatusLabel} from './current-activities';
import SmileAvatar from './SmileAvatar.vue';
import ModuleHealth from './ModuleHealth.vue';
const props=defineProps<{state:ControllerState;development?:DevelopmentView}>();
const emit=defineEmits<{person:[id:string];actionTarget:[target:HTMLElement|null]}>();
const root=ref<HTMLElement>();
const rows=computed(()=>hearingActivities(props.state.world));
async function focusActivity(id:string){await nextTick();const target=root.value?.querySelector<HTMLElement>(`[data-result-id="${CSS.escape(id)}"]`),scroll=root.value?.closest('.bmx-shell-content');if(target&&scroll)scroll.scrollTop+=target.getBoundingClientRect().top-scroll.getBoundingClientRect().top;}
defineExpose({focusActivity});
</script>
<template>
 <section ref="root" class="bmx-page bmx-hearing-page" role="tabpanel" aria-labelledby="bmx-tab-hearing">
  <ModuleHealth :state="state" :development="development" ready-label="事务已载入"/>
  <article v-for="row in rows" :key="row.activity.id" class="bmx-hearing-task" :data-result-id="row.activity.id">
   <header class="bmx-hearing-header"><span class="bmx-task-status" :data-status="row.activity.status">{{ activityStatusLabel(row.activity) }}</span><h3 class="bmx-record-title" :title="row.activity.title">{{ row.activity.title }}</h3><button type="button" class="bmx-hearing-more" aria-label="更多事务操作（暂未开放）"><svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><circle cx="8" cy="3" r="1.25"/><circle cx="8" cy="8" r="1.25"/><circle cx="8" cy="13" r="1.25"/></svg></button></header>
   <p class="bmx-hearing-body">{{ row.body }}</p><div class="bmx-participants"><button v-for="p in row.people" :key="p.id" type="button" class="bmx-participant" @click="emit('person',p.id)"><SmileAvatar :person-id="p.id" :temperament="p.temperament" :size="28"/><span>{{ p.name }}</span></button></div>
  </article>
  <p v-if="!rows.length" class="bmx-empty-state">暂无事务。</p>
 </section>
</template>
