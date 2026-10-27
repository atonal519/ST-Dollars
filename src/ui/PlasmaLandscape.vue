<script setup lang="ts">
import {ref,onMounted,watch} from 'vue';
import type {AtmosphereVisual} from '../domain/presentation';
import {plasmaPreset} from '../visuals/presets';
import {generateAvatar} from '../vendor/avatar-generator/src/themes/plasma';
const props=defineProps<{circleId:string;visual?:AtmosphereVisual}>();const canvas=ref<HTMLCanvasElement>();
function draw(){if(!canvas.value)return;const source=document.createElement('canvas');generateAvatar({...plasmaPreset(props.circleId,props.visual),canvas:source});canvas.value.width=720;canvas.value.height=160;canvas.value.getContext('2d')?.drawImage(source,0,36,384,300,0,0,720,160);}
onMounted(draw);watch(()=>[props.circleId,props.visual?.temperature,props.visual?.rhythm],draw);
</script>
<template><canvas ref="canvas" class="bmx-plasma-landscape" width="720" height="160" aria-hidden="true"></canvas></template>
