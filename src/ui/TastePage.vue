<script setup lang="ts">
import {computed,ref,watch,nextTick} from 'vue';
import type {ControllerState} from '../application/contracts';
import type {TasteCircle} from '../domain/social-circles';
import type {DevelopmentView} from '../application/development';
import SmileAvatar from './SmileAvatar.vue';
import PlasmaLandscape from './PlasmaLandscape.vue';
import ModuleHealth from './ModuleHealth.vue';
import MoodOverview from './MoodOverview.vue';
const props=defineProps<{state:ControllerState;development?:DevelopmentView;circles:TasteCircle[]}>();
const emit=defineEmits<{person:[id:string];actionTarget:[target:HTMLElement|null]}>();
const root=ref<HTMLElement>(),actions=ref<HTMLElement|null>(null);
const overviews=new Map<string,InstanceType<typeof MoodOverview>>();
const moods=computed(()=>props.circles);
const members=(ids:string[])=>props.state.world.people.filter(p=>ids.includes(p.id));
watch(actions,target=>emit('actionTarget',target),{flush:'post'});
function setOverview(id:string,overview:unknown){if(overview)overviews.set(id,overview as InstanceType<typeof MoodOverview>);else overviews.delete(id);}
async function focusMood(id:string){await nextTick();overviews.get(id)?.expand();await nextTick();const target=root.value?.querySelector<HTMLElement>(`[data-result-id="${CSS.escape(id)}"]`),scroll=root.value?.closest('.bmx-shell-content');if(target&&scroll)scroll.scrollTop+=target.getBoundingClientRect().top-scroll.getBoundingClientRect().top;}
defineExpose({focusMood});
</script>
<template>
 <section ref="root" class="bmx-page bmx-taste-page" role="tabpanel" aria-labelledby="bmx-tab-taste">
  <ModuleHealth :state="state" :development="development" ready-label="社交圈已载入"/>
  <article v-for="(mood,index) in moods" :key="mood.id" class="bmx-mood-entry" :data-result-id="mood.id">
   <h3 class="bmx-record-title">{{ mood.title }}</h3>
   <PlasmaLandscape :circle-id="mood.id" :visual="mood.visual"/>
   <MoodOverview :ref="overview=>setOverview(mood.id,overview)" :text="mood.description" :overview-id="'bmx-mood-overview-'+index"/>
   <div class="bmx-participants"><button v-for="p in members(mood.personIds)" :key="p.id" type="button" class="bmx-participant" @click="emit('person',p.id)"><SmileAvatar :person-id="p.id" :temperament="p.temperament" :size="28"/><span>{{ p.name }}</span></button></div>
  </article>
  <p v-if="!moods.length" class="bmx-empty-state">暂无已整理的社交圈。</p>
 </section>
</template>
