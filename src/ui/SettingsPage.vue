<script setup lang="ts">
import {onBeforeUnmount,ref,watch,nextTick} from 'vue';
import ModelSettings from './ModelSettings.vue';
import AppearanceSettings from './AppearanceSettings.vue';
import {createDialogManager,createMasterSwitch,createPromptsSettings,createSourcePermissionView} from './native-settings.js';
import type {ConfigService} from '../application/contracts';
import type {AppearanceThemeMode} from '../host/appearance-settings';
import type {GeneralSettings} from '../host/general-settings';
const props=defineProps<{active:boolean;enabled:boolean;everyReplies?:number;intervalError?:string;busy:boolean;config:ConfigService;general:GeneralSettings;updates:any;renderMarkdown:(value:string)=>string;enabledStore:any;onEnabledChange:(enabled:boolean)=>void;getTheme():AppearanceThemeMode;saveTheme(mode:AppearanceThemeMode):void}>();
const emit=defineEmits<{interval:[value:number]}>();
const root=ref<HTMLElement>(),master=ref<HTMLElement>(),worldbooks=ref<HTMLElement>(),prompts=ref<HTMLElement>(),notice=ref<HTMLElement>();
const apiRefreshKey=ref(0);let mounted=false,dialog:any,promptView:any,masterView:any;
function refreshApiDrawer(event:Event){if((event.currentTarget as HTMLDetailsElement).open)apiRefreshKey.value++;}
watch(()=>props.active,async active=>{if(!active)return;await nextTick();if(mounted)return;mounted=true;
 dialog=createDialogManager({documentRef:document});root.value?.append(dialog.host);
 dialog.setAppearance({effectiveTheme:'night',palette:{panel:'#224e84',paper:'#1c416f',ink:'#f1f6f7',soft:'#d8e4e9',line:'rgba(255,255,255,.2)',knot:'#e2d9ee',onPrimary:'#1b3040'}});
 // The native dialog has its own shadow root; carry the panel's actual font across it.
 if(root.value)dialog.host.style.setProperty('--qqj-dialog-font',getComputedStyle(root.value).fontFamily);
 masterView=createMasterSwitch({settings:props.enabledStore,onPluginEnabledChange:props.onEnabledChange,pluginUpdates:props.updates,dialog,renderUpdateMarkdown:props.renderMarkdown});master.value?.append(masterView.node);notice.value?.append(masterView.noticeRow);
 worldbooks.value?.append(createSourcePermissionView({permissions:props.general}).renderSettings());
 promptView=createPromptsSettings({settings:props.general,subscribeSettingsChange:props.general.subscribe,customImpl:(options:any)=>dialog.custom(options)});prompts.value?.append(promptView.node);
 void props.updates.ensureChecked();
},{immediate:true});
onBeforeUnmount(()=>{masterView?.dispose();promptView?.dispose();dialog?.closeAll();dialog?.host.remove();});
</script>
<template>
 <section ref="root" class="bmx-settings-page settings-page" aria-label="百面相设置">
  <h2>百面相设置</h2><div ref="master"></div>
  <details class="settings-group"><summary class="settings-group-summary"><h3>通用设置</h3></summary><div class="settings-group-body">
   <details class="settings-sub bmx-api-editor" @toggle="refreshApiDrawer"><summary class="settings-sub-summary"><h4>API 配置</h4></summary><ModelSettings :config="config" :refresh-key="apiRefreshKey" /></details>
   <div ref="worldbooks"></div><div ref="prompts"></div>
   <details class="settings-sub"><summary class="settings-sub-summary"><h4>外观</h4></summary><div class="settings-sub-body"><AppearanceSettings :get-theme="getTheme" :save-theme="saveTheme" /></div></details>
  </div></details>
  <details class="settings-group"><summary class="settings-group-summary"><h3>内容设置</h3></summary><div class="settings-group-body bmx-content-settings">
   <label class="bmx-development-interval">更新间隔<input type="number" min="1" step="1" :value="everyReplies??1" aria-label="更新间隔" :aria-invalid="Boolean(intervalError)" @change="emit('interval',Number(($event.target as HTMLInputElement).value))" /></label>
   <p v-if="intervalError" class="settings-result error" role="alert">{{intervalError}}</p>
  </div></details>
  <details class="settings-group" open><summary class="settings-group-summary"><h3>世界观</h3></summary><div class="settings-group-body bmx-world-settings"><slot name="world" /></div></details>
  <div ref="notice"></div>
 </section>
</template>
