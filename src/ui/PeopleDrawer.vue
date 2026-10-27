<script setup lang="ts">
import {computed,nextTick,onBeforeUnmount,onMounted,ref,watch} from 'vue';
import type {Person} from '../domain/world';
import SmileAvatar from './SmileAvatar.vue';
import OrganIcon from './OrganIcon.vue';
const props=defineProps<{people:Person[];selected:string;active:boolean;stage:HTMLElement}>();
const emit=defineEmits<{select:[id:string]}>();
const open=ref(false),search=ref(''),trigger=ref<HTMLButtonElement>(),drawer=ref<HTMLElement>(),list=ref<HTMLElement>(),top=ref<number>();
const ordered=computed(()=>{const query=search.value.trim().toLocaleLowerCase();return props.people.filter(p=>!query||p.name.toLocaleLowerCase().includes(query)).sort((a,b)=>Number(b.id===props.selected)-Number(a.id===props.selected));});
let gesture:{pointerId:number;startX:number;startY:number;top:number;dragging:boolean}|null=null,clickPointerId:number|null=null,eventRoot:ShadowRoot|undefined;
async function setOpen(value:boolean,focus=true){const wasOpen=open.value;open.value=value;await nextTick();if(!focus)return;if(value)drawer.value?.focus({preventScroll:true});else if(wasOpen&&props.active)trigger.value?.focus({preventScroll:true});}
watch(()=>props.active,value=>{if(!value)void setOpen(false,false);});
function pointerDown(event:PointerEvent){if(event.button!==0||!event.isPrimary||gesture||!trigger.value)return;gesture={pointerId:event.pointerId,startX:event.clientX,startY:event.clientY,top:trigger.value.getBoundingClientRect().top-props.stage.getBoundingClientRect().top,dragging:false};trigger.value.setPointerCapture(event.pointerId);}
function pointerMove(event:PointerEvent){if(!gesture||gesture.pointerId!==event.pointerId)return;const dx=event.clientX-gesture.startX,dy=event.clientY-gesture.startY;if(!gesture.dragging&&Math.hypot(dx,dy)<=5)return;gesture.dragging=true;event.preventDefault();top.value=Math.max(8,Math.min(Math.max(8,props.stage.clientHeight-72),gesture.top+dy));}
function finishPointer(event:PointerEvent){if(!gesture||gesture.pointerId!==event.pointerId)return;const tap=event.type==='pointerup'&&!gesture.dragging;if(event.type==='pointerup')clickPointerId=event.pointerId;gesture=null;if(tap)void setOpen(!open.value);}
function clearClickOwner(){clickPointerId=null;}
function consumeClick(event:Event){const click=event as PointerEvent;if(click.detail>0&&click.pointerId===clickPointerId){clickPointerId=null;click.preventDefault();click.stopImmediatePropagation();}}
// Hiding the entry can retarget a touch click onto the new drawer; only this completed gesture owns that click.
onMounted(()=>{eventRoot=trigger.value?.getRootNode() as ShadowRoot;eventRoot?.addEventListener('pointerdown',clearClickOwner,true);eventRoot?.addEventListener('click',consumeClick,true);});
onBeforeUnmount(()=>{eventRoot?.removeEventListener('pointerdown',clearClickOwner,true);eventRoot?.removeEventListener('click',consumeClick,true);});
function drawerKeydown(event:KeyboardEvent){if(event.key==='Escape'&&!event.isComposing){event.preventDefault();event.stopPropagation();void setOpen(false);}}
async function choose(id:string){emit('select',id);await setOpen(false);if(list.value)list.value.scrollTop=0;}
</script>
<template>
 <div v-show="active" class="bmx-people-ui">
  <button ref="trigger" v-show="!open" type="button" class="bmx-people-trigger" :style="top===undefined?undefined:{'--bmx-entry-top':top+'px'}" aria-label="更多人物" aria-controls="bmx-people-drawer" :aria-expanded="open" @pointerdown="pointerDown" @pointermove="pointerMove" @pointerup="finishPointer" @pointercancel="finishPointer" @lostpointercapture="finishPointer" @click="event=>{if(event.detail===0)setOpen(!open)}"><span>更多</span><span>人物</span></button>
  <Transition name="bmx-drawer"><div v-show="open" class="bmx-people-layer" @keydown="drawerKeydown">
   <button type="button" class="bmx-people-scrim" aria-label="收起人物列表" @click="setOpen(false)"></button>
   <aside ref="drawer" id="bmx-people-drawer" class="bmx-people-drawer" aria-label="人物列表" tabindex="-1">
    <div class="bmx-people-search"><label class="bmx-people-search-field"><OrganIcon name="search-01"/><input v-model="search" type="search" placeholder="姓名" aria-label="搜索姓名" autocomplete="off"/></label><span>共 {{ people.length }} 人</span></div>
    <div ref="list" class="bmx-person-list"><button v-for="p in ordered" :key="p.id" type="button" class="bmx-person-option" :data-person-id="p.id" :aria-current="p.id===selected" :aria-label="'查看'+p.name" :title="p.name" @click="choose(p.id)"><SmileAvatar :person-id="p.id" :temperament="p.temperament" :size="30"/><span>{{ p.name }}</span></button><p v-if="!ordered.length" class="bmx-drawer-empty">{{ people.length?'没有匹配的人物。':'暂无人物资料。' }}</p></div>
   </aside>
  </div></Transition>
 </div>
</template>
