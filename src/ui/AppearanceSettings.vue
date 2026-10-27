<script setup lang="ts">
import { ref,watch } from 'vue';
import type { AppearanceThemeMode } from '../host/appearance-settings';

const props = defineProps<{ getTheme(): AppearanceThemeMode; saveTheme(mode: AppearanceThemeMode): void }>();
const mode = ref(props.getTheme());
watch(()=>props.getTheme(),value=>{mode.value=value;});
const message = ref('');
function change() {
  try { props.saveTheme(mode.value); message.value = '主题已应用并保存。'; }
  catch (error) { message.value = error instanceof Error ? error.message : '保存主题设置失败。'; }
}
</script>

<template>
  <section class="appearance-settings">
    <h2>外观</h2>
    <label>主题<select v-model="mode" @change="change"><option value="auto">跟随酒馆</option><option value="day">日间</option><option value="night">夜间</option></select></label>
    <p v-if="message" role="status">{{ message }}</p>
  </section>
</template>
