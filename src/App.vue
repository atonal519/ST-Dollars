<script setup lang="ts">
import { store } from '@/state';
</script>

<template>
  <div class="dollars-root">
    <div class="dollars-title">Dollars</div>
    <div class="dollars-status">{{ store.status }}</div>
  </div>
</template>
