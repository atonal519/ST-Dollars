<script setup lang="ts">
import {ref,onMounted,watch} from 'vue';
import type {Temperament} from '../domain/presentation';
import {smilePreset} from '../visuals/presets';
import {generateAvatar} from '../vendor/avatar-generator/src/themes/smile';
const props=withDefaults(defineProps<{personId:string;temperament?:Temperament;size?:number}>(),{size:44});
const canvas=ref<HTMLCanvasElement>();
function draw(){if(canvas.value)generateAvatar({...smilePreset(props.personId,props.temperament),canvas:canvas.value});}
onMounted(draw);watch(()=>[props.personId,props.temperament],draw);
</script>
<template><canvas ref="canvas" class="bmx-portrait" :style="{width:size+'px',height:size+'px'}" width="160" height="160" aria-hidden="true"></canvas></template>
