<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import type { ConfigService, SharedModelPresetSummary } from '../application/contracts';

const props = defineProps<{ config: ConfigService }>();
const busy = ref(false); const message = ref('正在读取当前设置。');
const presets = ref<SharedModelPresetSummary[]>([]);
const draft = reactive({ primary: { url: '', model: '', key: '', hasKey: false }, secondary: { url: '', model: '', key: '', hasKey: false }, primaryPresetId: '', secondaryPresetId: '', follows: true });
function setProfile(target: typeof draft.primary, value: { url: string; model: string; hasKey: boolean }) { target.url = value.url; target.model = value.model; target.key = ''; target.hasKey = value.hasKey; }
async function load() {
  busy.value = true;
  try {
    const value = await props.config.getConfig();
    setProfile(draft.primary, value.primary); setProfile(draft.secondary, value.secondary);
    draft.primaryPresetId = value.primaryPresetId; draft.secondaryPresetId = value.secondaryPresetId; draft.follows = value.secondaryFollowsPrimary;
    presets.value = value.presets;
    message.value = '已读取设置；留空会保留原 Key。';
  } catch (error) { message.value = error instanceof Error ? error.message : '读取模型设置失败。'; }
  finally { busy.value = false; }
}
async function save() {
  busy.value = true;
  try {
    await props.config.saveConfig({ primary: draft.primary, primaryPresetId: draft.primaryPresetId, secondaryFollowsPrimary: draft.follows, secondary: draft.secondary, secondaryPresetId: draft.secondaryPresetId });
    await load(); message.value = '模型设置已保存。';
  } catch (error) { message.value = error instanceof Error ? error.message : '保存模型设置失败。'; }
  finally { busy.value = false; }
}
function presetState(id: string) {
  const preset = presets.value.find(item => item.id === id);
  if (!preset) return '所选共享预设已失效，请重新选择。';
  const detail = `API 地址：${preset.url || '未填写'}；模型：${preset.model || '未填写'}；Key：${preset.hasKey ? '已保存' : '未保存'}`;
  return preset.hasUrl && preset.hasModel && preset.hasKey ? detail : `${detail}；配置不完整`;
}
onMounted(load);
</script>

<template>
  <section class="model-settings">
    <h2>模型设置</h2>
    <p>副模型用于确定本批范围，主模型用于推演活动和结果。模型请求由酒馆现有接口转发。</p>
    <fieldset><legend>主模型</legend>
      <label>主模型 API 来源<select v-model="draft.primaryPresetId"><option value="">独立填写</option><option v-for="preset in presets" :key="preset.id" :value="preset.id">{{ preset.name }}</option><option v-if="draft.primaryPresetId && !presets.some(item => item.id === draft.primaryPresetId)" :value="draft.primaryPresetId">已失效的共享预设</option></select></label>
      <template v-if="!draft.primaryPresetId">
        <p>Key：{{ draft.primary.hasKey ? '已保存' : '未保存' }}</p>
        <label>API 地址<input v-model="draft.primary.url" autocomplete="url"></label>
        <label>模型名<input v-model="draft.primary.model"></label>
        <label>Key（留空保留）<input v-model="draft.primary.key" type="password" autocomplete="new-password" placeholder="留空保留已保存 Key"></label>
      </template>
      <p v-else class="preset-summary" role="status">{{ presetState(draft.primaryPresetId) }}</p>
    </fieldset>
    <label class="follow-toggle"><input v-model="draft.follows" type="checkbox">副模型跟随主模型</label>
    <fieldset v-if="!draft.follows"><legend>副模型</legend>
      <label>副模型 API 来源<select v-model="draft.secondaryPresetId"><option value="">独立填写</option><option v-for="preset in presets" :key="preset.id" :value="preset.id">{{ preset.name }}</option><option v-if="draft.secondaryPresetId && !presets.some(item => item.id === draft.secondaryPresetId)" :value="draft.secondaryPresetId">已失效的共享预设</option></select></label>
      <template v-if="!draft.secondaryPresetId">
        <p>Key：{{ draft.secondary.hasKey ? '已保存' : '未保存' }}</p>
        <label>API 地址<input v-model="draft.secondary.url" autocomplete="url"></label>
        <label>模型名<input v-model="draft.secondary.model"></label>
        <label>Key（留空保留）<input v-model="draft.secondary.key" type="password" autocomplete="new-password" placeholder="留空保留已保存 Key"></label>
      </template>
      <p v-else class="preset-summary" role="status">{{ presetState(draft.secondaryPresetId) }}</p>
    </fieldset>
    <p v-if="!presets.length" class="preset-summary">共享 API 池暂无预设；可选择独立填写。</p>
    <div class="settings-actions"><button type="button" :disabled="busy" @click="load">刷新</button><button type="button" :disabled="busy" @click="save">{{ busy ? '处理中…' : '保存设置' }}</button></div>
    <p role="status">{{ message }}</p>
  </section>
</template>
