<script setup lang="ts">
import { nextTick, ref } from 'vue';

// 布局和展开方式移植自千千结 inline-select，选项在文档流中推开后文。
const props = defineProps<{ modelValue: string; options: Array<{ value: string; label: string }>; ariaLabel: string; disabled?: boolean }>();
const emit = defineEmits<{ 'update:modelValue': [value: string]; focus: [] }>();
const open = ref(false);
const focused = ref(0);
const root = ref<HTMLElement | null>(null);
const trigger = ref<HTMLButtonElement | null>(null);
const list = ref<HTMLElement | null>(null);
function show() {
  if (props.disabled || !props.options.length) return;
  open.value = true;
  focused.value = Math.max(0, props.options.findIndex(item => item.value === props.modelValue));
  void nextTick(() => list.value?.querySelectorAll<HTMLElement>('[role="option"]')[focused.value]?.focus({ preventScroll: true }));
}
function choose(value: string) {
  if (props.disabled) return;
  if (value !== props.modelValue) emit('update:modelValue', value);
  open.value = false;
  void nextTick(() => trigger.value?.focus({ preventScroll: true }));
}
function triggerKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && open.value) { event.preventDefault(); event.stopPropagation(); open.value = false; return; }
  if (!['Enter', ' ', 'ArrowDown', 'ArrowUp'].includes(event.key)) return;
  event.preventDefault(); event.stopPropagation(); show();
}
function optionKeydown(event: KeyboardEvent, index: number) {
  if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); open.value = false; trigger.value?.focus({ preventScroll: true }); return; }
  if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); event.stopPropagation(); choose(props.options[index].value); return; }
  if (!['ArrowDown', 'ArrowUp'].includes(event.key)) return;
  event.preventDefault(); event.stopPropagation();
  focused.value = (index + (event.key === 'ArrowDown' ? 1 : props.options.length - 1)) % props.options.length;
  list.value?.querySelectorAll<HTMLElement>('[role="option"]')[focused.value]?.focus();
}
function onFocusOut(event: FocusEvent) {
  if (event.relatedTarget && root.value?.contains(event.relatedTarget as Node)) return;
  setTimeout(() => { if (!root.value?.contains((root.value?.getRootNode() as ShadowRoot | undefined)?.activeElement ?? null)) open.value = false; }, 0);
}
</script>

<template>
  <div ref="root" class="bmx-inline-select" :class="{ open }" @focusout="onFocusOut">
    <button ref="trigger" type="button" class="bmx-api-input bmx-inline-select-trigger" :aria-label="ariaLabel" aria-haspopup="listbox" :aria-expanded="open" :disabled="disabled" @focus="emit('focus')" @click.stop="open ? open = false : show()" @keydown="triggerKeydown"><span class="bmx-inline-select-value" :title="options.find(item => item.value === modelValue)?.label ?? '请选择'">{{ options.find(item => item.value === modelValue)?.label ?? '请选择' }}</span><span class="bmx-inline-select-chevron" aria-hidden="true">›</span></button>
    <div v-if="open" ref="list" class="bmx-inline-select-options" role="listbox" :aria-label="ariaLabel">
      <button v-for="(option, index) in options" :key="option.value" type="button" class="bmx-inline-select-option" :class="{ active: option.value === modelValue }" role="option" :aria-selected="option.value === modelValue" :tabindex="index === focused ? 0 : -1" :disabled="disabled" @focus="focused = index" @keydown="optionKeydown($event, index)" @click.stop="choose(option.value)">{{ option.label }}</button>
    </div>
  </div>
</template>
