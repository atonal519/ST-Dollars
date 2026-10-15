<script setup lang="ts">
import { computed } from 'vue';
const props = defineProps<{ color?: string }>();
const color = computed(() => props.color && CSS.supports('color', props.color) ? props.color : '#a3a5b0');
</script>
<template>
  <span class="dollars-avatar" :style="{ '--avatar-color': color }" aria-hidden="true">
    <svg viewBox="0 0 40 40" fill="currentColor"><circle cx="20" cy="14" r="7" /><path d="M6 36v-5c0-7 6-11 14-11s14 4 14 11v5z" /></svg>
  </span>
</template>
