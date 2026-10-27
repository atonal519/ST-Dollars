<script setup lang="ts">
import {computed,ref,watch,nextTick} from 'vue';
import {tasteCircles} from '../domain/social-circles';
import {visibleHearingActivities} from './hearing-activities';
import type {DevelopmentView} from '../application/development';
import PeopleDrawer from './PeopleDrawer.vue';import OrganIcon from './OrganIcon.vue';
import type {ControllerState} from '../application/contracts';
import SmileAvatar from './SmileAvatar.vue';import LocalPersonGraph from './LocalPersonGraph.vue';
import HearingPage from './HearingPage.vue';import TastePage from './TastePage.vue';import ModuleHealth from './ModuleHealth.vue';
const props=defineProps<{state:ControllerState;page:string;visible?:boolean;stage?:HTMLElement;development?:DevelopmentView}>();const emit=defineEmits<{navigate:[page:string];affairsActionTarget:[target:HTMLElement|null];hearingActionTarget:[target:HTMLElement|null];tasteActionTarget:[target:HTMLElement|null]}>();
const root=ref<HTMLElement>(),graph=ref<HTMLElement>(),selected=ref('');
const hearing=ref<InstanceType<typeof HearingPage>>(),taste=ref<InstanceType<typeof TastePage>>();
const people=computed(()=>props.state.world.people),person=computed(()=>people.value.find(p=>p.id===selected.value)??people.value[0]);
watch(people,ps=>{if(!ps.some(p=>p.id===selected.value))selected.value=ps[0]?.id??'';},{immediate:true});
const currentActivities=computed(()=>visibleHearingActivities(props.state.world).filter(a=>a.status!=='completed'));
const tasks=computed(()=>currentActivities.value.filter(a=>a.participantIds.includes(person.value?.id??'')));
const moods=computed(()=>tasteCircles(props.state.world)),personMoods=computed(()=>moods.value.filter(m=>m.personIds.includes(person.value?.id??'')));
const scrollRoot=()=>root.value?.closest('.bmx-shell-content') as HTMLElement|undefined;
async function focusPerson(id:string,fromGraph=false){const top=fromGraph?graph.value?.getBoundingClientRect().top:undefined;selected.value=id;emit('navigate','sight');await nextTick();if(fromGraph&&top!==undefined){const scroll=scrollRoot();if(scroll&&graph.value)scroll.scrollTop+=graph.value.getBoundingClientRect().top-top;}else{const scroll=scrollRoot();if(scroll)scroll.scrollTop=0;}}
async function jump(page:string,id:string){emit('navigate',page);await nextTick();if(page==='hearing')await hearing.value?.focusActivity(id);else if(page==='taste')await taste.value?.focusMood(id);}
</script>
<template>
 <div ref="root" class="bmx-four-senses">
  <div v-if="page==='smell' && (state.error || ['error','unavailable'].includes(state.source.status))" class="bmx-records-notice" role="alert"><p>{{ state.error || state.source.message }}</p></div>
  <p v-if="page==='smell' && !people.length && !state.error" class="bmx-empty-state">{{ state.source.status!=='ready'&&state.source.message?state.source.message:'暂无人物资料。' }}</p>
  <section v-show="page==='sight'" class="bmx-page" role="tabpanel" aria-labelledby="bmx-tab-sight">
   <ModuleHealth :state="state" :development="development"/>
   <template v-if="person">
    <div class="bmx-identity"><SmileAvatar :person-id="person.id" :temperament="person.temperament" :size="80"/><div class="bmx-identity-main"><div class="bmx-identity-title"><h3 :title="person.name">{{ person.name }}</h3></div><p v-if="person.identityCaption || person.identitySummary" class="bmx-identity-role">{{ person.identityCaption || person.identitySummary }}</p></div></div>
    <hr class="bmx-sight-divider"/><div ref="graph"><LocalPersonGraph :world="state.world" :person="person" :activities="tasks" :atmospheres="personMoods" @person="id=>focusPerson(id,true)" @activity="id=>jump('hearing',id)" @atmosphere="id=>jump('taste',id)"/></div>
   </template>
  </section>
  <HearingPage ref="hearing" v-show="page==='hearing'" :state="state" :development="development" @person="id=>focusPerson(id)" @action-target="emit('hearingActionTarget',$event)"/>
  <section v-show="page==='smell'" class="bmx-page" role="tabpanel" aria-labelledby="bmx-tab-smell"><div class="bmx-page-heading"><h2>嗅</h2><span>公告与新闻</span></div><div class="bmx-empty-state"><h3>暂无公开消息</h3><p>公告、新闻与广播尚未开始生成。</p></div></section>
  <TastePage ref="taste" :circles="moods" v-show="page==='taste'" :state="state" :development="development" @person="id=>focusPerson(id)" @action-target="emit('tasteActionTarget',$event)"/>
  <Teleport v-if="stage" :to="stage"><PeopleDrawer :people="people" :selected="person?.id??''" :active="page==='sight'&&visible!==false" :stage="stage" @select="id=>focusPerson(id)"/></Teleport>
 </div>
</template>
