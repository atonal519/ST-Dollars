<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, watch, ref } from 'vue';
import { createPeopleWorld } from '@/application/people-world';
import type { ControllerDependencies, ControllerState, QuestionMaterialReader } from '@/application/contracts';
import PanelShell from '@/ui/PanelShell.vue';
import SettingsPage from '@/ui/SettingsPage.vue';
import FourSenses from '@/ui/FourSenses.vue';
import DevelopmentControls from '@/ui/DevelopmentControls.vue';
import { subscribeStoryCompletion } from '@/host/story-completion';
import type { DevelopmentView } from '@/application/development';
import type { AppearanceThemeMode } from '@/host/appearance-settings';
import type {GeneralSettings} from '@/host/general-settings';
import {beginDiagnostic,recordDiagnostic} from '@/diagnostics/development';

const props = defineProps<{ general:GeneralSettings; updates:any; renderMarkdown:(value:string)=>string; dependencies: ControllerDependencies; materialReader: QuestionMaterialReader; config: ControllerDependencies['config']; enabledSettings: { isEnabled(): boolean; saveEnabled(enabled: boolean): void; getEveryReplies(): number; saveEveryReplies(value: number): void }; visible: boolean; appearance: { getTheme(): AppearanceThemeMode; saveTheme(mode: AppearanceThemeMode): void; destroy(): void } }>();
const emit = defineEmits<{ close: [] }>();
const controller = createPeopleWorld(props.dependencies);
controller.configureDevelopment(props.enabledSettings);
let unsubscribe = () => {};
onMounted(() => {
  const subscription=subscribeStoryCompletion((id,type) => { void controller.onStoryCompleted({eventSeq:typeof id==='number'?id+1:null,eventType:typeof type==='string'?type:''}); });
  unsubscribe=subscription;
  recordDiagnostic(beginDiagnostic(props.dependencies.diagnostics,'mounted',{source:'App'}),'listener-registered',{registered:subscription.registered,event:subscription.event});
});
const everyReplies = ref(props.enabledSettings.getEveryReplies());
const intervalError = ref('');
function setEveryReplies(value: number) { try { props.enabledSettings.saveEveryReplies(value); everyReplies.value = value; intervalError.value = ''; controller.inspectDevelopment(); } catch (error) { intervalError.value = error instanceof Error ? error.message : '请输入正整数回复数。'; } }
const page=ref('sight');
const settings=computed(()=>page.value==='settings');
const enabled = ref(props.enabledSettings.isEnabled());
const operationBusy = computed(() => controller.state.value.busy);
const enabledStore={isEnabled:()=>props.enabledSettings.isEnabled(),get:()=>({pluginEnabled:props.enabledSettings.isEnabled()}),update:(patch:{pluginEnabled:boolean})=>props.enabledSettings.saveEnabled(patch.pluginEnabled)};
function onEnabledChange(next:boolean){enabled.value=next;if(!next)controller.stopDevelopment();}

watch(() => props.visible, visible => { if (visible) void controller.refresh().then(controller.inspectDevelopment); }, { immediate: true });
onBeforeUnmount(() => { unsubscribe(); controller.stopDevelopment(); props.appearance.destroy(); });

const themeMode=ref(props.appearance.getTheme()),themeError=ref('');
function saveTheme(mode:AppearanceThemeMode){props.appearance.saveTheme(mode);themeMode.value=mode;themeError.value='';}
function cycleTheme(){try{saveTheme(themeMode.value==='auto'?'day':themeMode.value==='day'?'night':'auto');}catch(error){themeError.value=error instanceof Error?error.message:'保存主题失败。';}}

function handleEscape() { if (settings.value) page.value = 'sight'; else emit('close'); }
</script>

<template>
  <PanelShell :visible="props.visible" :page="page" :theme-mode="themeMode" @theme="cycleTheme" @close="emit('close')" @navigate="page=$event" @escape="handleEscape">
    <template #default="{stage}">
    <p v-if="themeError" class="bmx-theme-error" role="alert">{{ themeError }}</p>
    <div class="bmx-world-content" :class="{'is-sight':page==='sight'}" v-show="!settings">
      <div v-if="controller.state.value.error || ['error','unavailable'].includes(controller.state.value.source.status)" class="bmx-reload"><button type="button" @click="controller.refresh().then(controller.inspectDevelopment)">重新读取</button></div>
      <FourSenses :state="controller.state.value as ControllerState" :page="page" :visible="props.visible" :stage="stage" :development="controller.developmentView.value as DevelopmentView" @navigate="page=$event"/>

    </div>
    <SettingsPage v-show="settings" :active="settings" :enabled="enabled" :every-replies="everyReplies" :interval-error="intervalError" @interval="setEveryReplies" :busy="operationBusy" :config="props.config" :general="props.general" :updates="props.updates" :render-markdown="props.renderMarkdown" :enabled-store="enabledStore" :on-enabled-change="onEnabledChange" :get-theme="()=>themeMode" :save-theme="saveTheme">
      <template #world><DevelopmentControls :state="controller.state.value as ControllerState" :development="controller.developmentView.value as DevelopmentView" :enabled="enabled" @construct="controller.constructWorld" @start="controller.startDevelopment" @stop="controller.stopDevelopment" @save="controller.saveDevelopment" @reload="controller.reloadDevelopment" /></template>
    </SettingsPage>
    </template>
  </PanelShell>
</template>
