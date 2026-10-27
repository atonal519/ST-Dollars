<script setup lang="ts">
import {computed,ref,onMounted,onBeforeUnmount,watch,nextTick} from 'vue';
import type {WorldSnapshot,Person,Activity} from '../domain/world';
import {localNeighbors} from './local-neighborhood';import SmileAvatar from './SmileAvatar.vue';
const props=defineProps<{world:WorldSnapshot;person:Person;activities:Activity[];atmospheres:Array<{id:string;title:string}>}>();
const emit=defineEmits<{person:[id:string];activity:[id:string];atmosphere:[id:string]}>();
const root=ref<HTMLElement>(),focus=ref<HTMLElement>(),paths=ref<Array<{id:string;d:string}>>([]),height=ref(160),positions=ref<Record<string,{left:string;top:string}>>({});
const contexts=computed(()=>[...props.activities.map(a=>({id:a.id,title:a.title,kind:'activity'})),...props.atmospheres.map(a=>({id:a.id,title:a.title,kind:'atmosphere'}))]);
const neighbors=computed(()=>localNeighbors(props.world,props.person.id));
let observer:ResizeObserver|undefined;
function drawLines(){
 const el=root.value,center=focus.value;if(!el||!center)return;
 const bounds=el.querySelector('svg')!.getBoundingClientRect();if(!bounds.width||!bounds.height){paths.value=[];return;}
 const point=(node:Element)=>{const r=node.querySelector('.bmx-portrait')!.getBoundingClientRect();return{x:r.left+r.width/2-bounds.left,y:r.top+r.height/2-bounds.top};};
 const origin=point(center);
 const outside=(node:Element,from:{x:number;y:number},to:{x:number;y:number})=>{const r=node.getBoundingClientRect(),dx=to.x-from.x,dy=to.y-from.y;const tx=dx?(dx>0?r.right-bounds.left+4-from.x:r.left-bounds.left-4-from.x)/dx:Infinity,ty=dy?(dy>0?r.bottom-bounds.top+4-from.y:r.top-bounds.top-4-from.y)/dy:Infinity,t=Math.min(tx,ty);return{x:from.x+dx*t,y:from.y+dy*t};};
 paths.value=[...el.querySelectorAll<HTMLElement>('.bmx-graph-person')].map(node=>{const target=point(node),a=outside(center,origin,target),b=outside(node,target,origin);return{id:node.dataset.personId!,d:`M${a.x} ${a.y} L${b.x} ${b.y}`};});
}
async function measure(){
 const el=root.value;if(!el)return;const orbit=el.querySelector<HTMLElement>('.bmx-graph-orbit')!,width=orbit.clientWidth,nodes=[...el.querySelectorAll<HTMLElement>('.bmx-graph-person')];if(!width)return;
 const right=Math.ceil(nodes.length/2),nodeHeight=Math.max(60,...nodes.map(node=>node.offsetHeight)),step=nodeHeight+16,maxY=Math.max(0,(right-1)*step/2),ry=maxY/.78||1,rx=Math.max(0,(width-Math.max(64,...nodes.map(node=>node.offsetWidth)))/2-4);
 height.value=!nodes.length?80:nodes.length>2?Math.max(210,2*maxY+nodeHeight+24):Math.max(144,nodeHeight+40);
 positions.value=Object.fromEntries(nodes.map((node,index)=>{const side=index<right?1:-1,count=side===1?right:nodes.length-right,slot=side===1?index:nodes.length-index-1,y=(slot-(count-1)/2)*step,nearCenter=Math.abs(y)<(node.offsetHeight+(focus.value?.offsetHeight??64))/2+8,minX=nearCenter?(node.offsetWidth+(focus.value?.offsetWidth??80))/2+8:0,x=side*Math.max(minX,rx*Math.sqrt(1-(y/ry)**2));return[node.dataset.personId!,{left:width/2+x+'px',top:height.value/2+y+'px'}];}));
 await nextTick();drawLines();
}
onMounted(()=>{observer=new ResizeObserver(()=>{void measure();});if(root.value)observer.observe(root.value);void measure();});
watch([()=>props.person.id,neighbors],async()=>{await nextTick();measure();},{flush:'post'});
onBeforeUnmount(()=>observer?.disconnect());
</script>
<template>
 <div ref="root" class="bmx-person-graph" aria-label="当前人物的一层关联图">
 <div class="bmx-graph-orbit" :style="{height:height+'px'}">
  <svg class="bmx-graph-connections" aria-hidden="true"><path v-for="path in paths" :key="path.id" :data-neighbor-id="path.id" :d="path.d"/></svg>
  <div ref="focus" class="bmx-graph-focus"><SmileAvatar :person-id="person.id" :temperament="person.temperament" :size="40"/><span>{{ person.name }}</span></div>
  <button v-for="neighbor in neighbors" :key="neighbor.person.id" :data-person-id="neighbor.person.id" :style="positions[neighbor.person.id]" type="button" class="bmx-graph-person" :aria-label="`查看${neighbor.person.name}，${neighbor.label}`" @click="emit('person',neighbor.person.id)"><SmileAvatar :person-id="neighbor.person.id" :temperament="neighbor.person.temperament" :size="32"/><span>{{ neighbor.person.name }}</span><span class="bmx-graph-kind">{{ neighbor.label }}</span></button>
 </div>
  <p v-if="!neighbors.length" class="bmx-graph-empty">{{ person.relationsPending?'关系尚未整理':'暂无已整理的人际关系' }}</p>
  <div v-if="contexts.length" class="bmx-graph-contexts"><button v-for="context in contexts" :key="context.kind+context.id" type="button" class="bmx-graph-context" :class="context.kind==='activity'?'task-node':'mood-node'" @click="context.kind==='activity'?emit('activity',context.id):emit('atmosphere',context.id)"><span class="bmx-graph-kind">{{ context.kind==='activity'?'参与事务':'社交圈层' }}</span><span>{{ context.title }}</span><i class="bmx-chevron" aria-hidden="true"></i></button></div>
 </div>
</template>
