<script setup lang="ts">
import { nextTick, onMounted, ref } from 'vue';

// 只移植千千结现行 prompt/confirm 的 UI；预设归属和保存仍由模型设置处理。
const props = defineProps<{ title: string; body: string; note?: string; prompt?: boolean; initialValue?: string; confirmText: string }>();
const emit = defineEmits<{ confirm: [value: string]; cancel: [] }>();
const value = ref(props.initialValue ?? '');
const error = ref('');
const input = ref<HTMLInputElement | null>(null);
const submitButton = ref<HTMLButtonElement | null>(null);
function submit() {
  if (props.prompt && !value.value.trim()) { error.value = '请输入预设名称。'; input.value?.focus(); return; }
  emit('confirm', value.value.trim());
}
function onKeydown(event: KeyboardEvent) {
  event.stopPropagation();
  if (event.isComposing) return;
  if (event.key === 'Escape') { event.preventDefault(); emit('cancel'); }
  else if (event.key === 'Enter' && event.target === input.value) { event.preventDefault(); submit(); }
}
onMounted(() => { void nextTick(() => { if (props.prompt) { input.value?.focus(); input.value?.select(); } else submitButton.value?.focus(); }); });
</script>

<template>
  <div class="bmx-api-dialog-overlay" @click.self="emit('cancel')" @keydown="onKeydown">
    <div class="bmx-api-dialog-sheet" role="dialog" aria-modal="true" aria-labelledby="bmx-api-dialog-title">
      <div id="bmx-api-dialog-title" class="bmx-api-dialog-head">{{ title }}</div>
      <div class="bmx-api-dialog-body">{{ body }}</div>
      <div v-if="note" class="bmx-api-dialog-note">{{ note }}</div>
      <input v-if="prompt" ref="input" v-model="value" class="bmx-api-dialog-input" type="text" placeholder="预设名称" aria-label="预设名称" maxlength="40" autocomplete="off" @input="error = ''">
      <div v-if="prompt" class="bmx-api-dialog-input-error" aria-live="polite">{{ error }}</div>
      <div class="bmx-api-dialog-actions">
        <button type="button" class="bmx-api-dialog-button bmx-api-dialog-button-secondary" @click="emit('cancel')">取消</button>
        <button ref="submitButton" type="button" class="bmx-api-dialog-button bmx-api-dialog-button-primary" @click="submit">{{ confirmText }}</button>
      </div>
    </div>
  </div>
</template>
