<script setup lang="ts">
const props = defineProps<{ visible: boolean; settings: boolean }>();
const emit = defineEmits<{ close: []; toggleSettings: []; escape: [] }>();

function onKeydown(event: KeyboardEvent) {
  const target = event.target;
  const editing = target instanceof HTMLElement && (
    target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)
  );
  if (editing && event.key !== 'Escape') {
    event.stopPropagation();
    return;
  }
  if (event.key === 'Escape') {
    event.stopPropagation();
    if (!event.isComposing) emit('escape');
  }
}
</script>

<template>
  <div class="bmx-overlay" :class="{ 'is-visible': props.visible }" :aria-hidden="!props.visible" @keydown.capture="onKeydown">
    <section class="bmx-window" role="dialog" aria-label="百面相">
      <header class="bmx-header">
        <h1>百面相</h1>
        <div class="bmx-header-actions">
          <button class="bmx-icon-button" type="button" :aria-label="props.settings ? '返回人物图谱' : '设置'" @click="emit('toggleSettings')">
            <i :class="props.settings ? 'fa-solid fa-arrow-left' : 'fa-solid fa-gear'" aria-hidden="true"></i>
          </button>
          <button class="bmx-icon-button" type="button" aria-label="关闭百面相" @click="emit('close')">
            <i class="fa-solid fa-xmark" aria-hidden="true"></i>
          </button>
        </div>
      </header>
      <div class="bmx-shell-content">
        <slot name="world"></slot>
        <slot name="settings"></slot>
      </div>
    </section>
  </div>
</template>
