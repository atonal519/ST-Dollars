<script setup lang="ts">
import {nextTick,onBeforeUnmount,onMounted,ref,watch} from 'vue';
const props=defineProps<{text:string;overviewId:string}>();
const root=ref<HTMLElement>(),measureText=ref<HTMLElement>();
const collapsible=ref(false),opened=ref(false);
let observer:ResizeObserver|undefined;
function measure(){
 const text=measureText.value;
 if(!text||!text.getBoundingClientRect().width)return;
 const lineHeight=parseFloat(getComputedStyle(text).lineHeight);
 collapsible.value=text.getBoundingClientRect().height>lineHeight*2+1;
 if(!collapsible.value)opened.value=false;
}
function expand(){measure();if(collapsible.value)opened.value=true;}
onMounted(()=>{
 measure();
 observer=new ResizeObserver(measure);
 if(root.value)observer.observe(root.value);
 if(measureText.value)observer.observe(measureText.value);
});
watch(()=>props.text,()=>{void nextTick(measure);},{flush:'post'});
onBeforeUnmount(()=>observer?.disconnect());
defineExpose({expand});
</script>
<template>
 <div ref="root" class="bmx-mood-description">
  <span class="bmx-mood-measure-box" aria-hidden="true"><span ref="measureText" class="bmx-mood-measure">{{ text }}</span></span>
  <button v-if="collapsible" type="button" class="bmx-mood-toggle" :class="{'is-open':opened}" :aria-expanded="opened" :aria-controls="overviewId" @click="opened=!opened"><span :id="overviewId" class="bmx-mood-overview">{{ text }}</span><i class="bmx-chevron" aria-hidden="true"></i></button>
  <div v-else class="bmx-mood-toggle"><span :id="overviewId" class="bmx-mood-overview">{{ text }}</span></div>
 </div>
</template>
