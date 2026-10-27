<script setup lang="ts">
import {organIcons} from '../visuals/organ-icons';
const props=defineProps<{name:keyof typeof organIcons}>();
</script>
<template><svg class="bmx-organ-icon" :viewBox="`0 0 ${organIcons[props.name].width} ${organIcons[props.name].height}`" aria-hidden="true" fill="currentColor" v-html="organIcons[props.name].body"></svg></template>
