<script setup lang="ts">
import { onBeforeUnmount, watch, ref } from 'vue';
import { createPeopleWorld } from '@/application/people-world';
import type { ConfigService, ControllerDependencies, QuestionMaterialReader } from '@/application/contracts';
import type { ControllerState } from '@/application/contracts';
import GraphPage from '@/ui/GraphPage.vue';
import PanelShell from '@/ui/PanelShell.vue';
import ModelSettings from '@/ui/ModelSettings.vue';
import AppearanceSettings from '@/ui/AppearanceSettings.vue';
import type { AppearanceThemeMode } from '@/host/appearance-settings';

const props = defineProps<{ dependencies: ControllerDependencies; materialReader: QuestionMaterialReader; config: ConfigService; visible: boolean; appearance: { getTheme(): AppearanceThemeMode; saveTheme(mode: AppearanceThemeMode): void; destroy(): void } }>();
const emit = defineEmits<{ close: [] }>();
const controller = createPeopleWorld(props.dependencies);
const page = ref<'world' | 'settings'>('world');
const graphPage = ref<InstanceType<typeof GraphPage> | null>(null);

watch(() => props.visible, visible => { if (visible) void controller.refresh(); }, { immediate: true });
onBeforeUnmount(() => props.appearance.destroy());

function handleEscape() {
  if (page.value === 'settings') { page.value = 'world'; return; }
  if (!graphPage.value?.handleEscape()) emit('close');
}

function toggleSettings() { page.value = page.value === 'settings' ? 'world' : 'settings'; }
</script>

<template>
  <PanelShell :visible="props.visible" :settings="page === 'settings'" @close="emit('close')" @toggle-settings="toggleSettings" @escape="handleEscape">
    <template #world>
      <GraphPage
        ref="graphPage"
        v-show="page === 'world'"
        :state="controller.state.value as ControllerState"
        :material-reader="props.materialReader"
        @refresh="controller.refresh"
        @advance="controller.advanceToCurrent"
      />
    </template>
    <template #settings>
      <section v-if="page === 'settings'" class="bmx-settings-page">
        <p class="bmx-kicker">百面相 · 设置</p>
        <h2>模型设置</h2>
        <p>人物资料由千千结按需提供；人物活动、结果和知情由百面相独立保存。手动推进读取当前已完成正文。</p>
        <AppearanceSettings :get-theme="props.appearance.getTheme" :save-theme="props.appearance.saveTheme" />
        <ModelSettings :config="props.config" />
      </section>
    </template>
  </PanelShell>
</template>
