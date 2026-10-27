<script setup lang="ts">
import { computed, nextTick, onMounted, reactive, ref, watch } from 'vue';
import type { ConfigService, SharedModelPresetSummary } from '../application/contracts';
import InlineSelect from './InlineSelect.vue';
import ApiPresetDialog from './ApiPresetDialog.vue';
import { createModelSettingsTools } from '../models/settings-tools';

const props = defineProps<{ config: ConfigService; refreshKey: number }>();
type Role = 'primary' | 'secondary';
const busy = ref('');
const message = ref('');
const messageTone = ref<'' | 'success' | 'error'>('');
function setMessage(value: string, tone: '' | 'success' | 'error' = '') { message.value = value; messageTone.value = tone; }
const presets = ref<SharedModelPresetSummary[]>([]);
const selection = reactive({ primary: 'own', secondary: 'follow' });
const draft = reactive({ url: '', model: '', key: '', hasKey: false });
const editingRole = ref<Role>('primary');
const dialog = ref<'preset' | 'delete' | null>(null);
const modelNames = ref<string[]>([]);
const modelQuery = ref('');
const modelsOpen = ref(false);
const presetTrigger = ref<HTMLButtonElement | null>(null);
const deleteTrigger = ref<HTMLButtonElement | null>(null);
const roleLabel = computed(() => editingRole.value === 'primary' ? '主模型' : '副模型');
const targetRole = computed<Role>(() => editingRole.value === 'secondary' && selection.secondary === 'follow' ? 'primary' : editingRole.value);
const currentPresetId = computed(() => {
  const selected = selection[targetRole.value];
  return selected.startsWith('preset:') ? selected.slice(7) : '';
});
const currentPreset = computed(() => presets.value.find(item => item.id === currentPresetId.value));
const editorHint = computed(() => {
  const shared = currentPreset.value ? `共享预设「${currentPreset.value.name}」` : '独立配置';
  if (editingRole.value === 'secondary' && selection.secondary === 'follow') {
    return `正在编辑：副模型 API 跟随主模型 · ${shared}。保存会更新主模型${currentPreset.value ? '，并影响所有使用该预设的插件' : ''}；另存可建立副模型专用预设。`;
  }
  return `正在编辑：${roleLabel.value} API · ${shared}${currentPreset.value ? '。保存会影响所有使用该预设的插件。' : ''}`;
});
const visibleModels = computed(() => {
  const query = modelQuery.value.trim().toLocaleLowerCase();
  return query ? modelNames.value.filter(name => name.toLocaleLowerCase().includes(query)) : modelNames.value;
});

function updateDraft(value: { url: string; model: string; hasKey: boolean }) {
  draft.url = value.url; draft.model = value.model; draft.key = ''; draft.hasKey = value.hasKey;
}
async function load() {
  busy.value = 'load';
  try {
    const value = await props.config.getConfig();
    presets.value = value.presets;
    selection.primary = value.primaryPresetId ? `preset:${value.primaryPresetId}` : 'own';
    selection.secondary = value.secondaryFollowsPrimary ? 'follow' : value.secondaryPresetId ? `preset:${value.secondaryPresetId}` : 'own';
    updateDraft(value.primaryPresetId ? value.presets.find(item => item.id === value.primaryPresetId) ?? { url: '', model: '', hasKey: false } : value.primary);
    editingRole.value = 'primary';
    setMessage('');
  } catch (error) { setMessage(error instanceof Error ? error.message : '读取 API 设置失败。', 'error'); }
  finally { busy.value = ''; }
}
async function refreshPresets() {
  try { presets.value = (await props.config.getConfig()).presets; }
  catch (error) { setMessage(error instanceof Error ? error.message : '读取共享 API 预设失败。', 'error'); }
}
async function edit(role: Role) {
  editingRole.value = role;
  modelsOpen.value = false; modelNames.value = []; modelQuery.value = '';
  const target = role === 'secondary' && selection.secondary === 'follow' ? 'primary' : role;
  try {
    const value = await props.config.getConfig();
    presets.value = value.presets;
    const id = selection[target].startsWith('preset:') ? selection[target].slice(7) : '';
    updateDraft(id ? value.presets.find(item => item.id === id) ?? { url: '', model: '', hasKey: false } : target === 'primary' ? value.primary : value.secondary);
    setMessage(role === 'secondary' && target === 'primary' ? '正在编辑副模型实际使用的主模型配置。' : id ? '正在编辑共享预设；保存会影响所有使用该预设的插件。' : `正在编辑${role === 'primary' ? '主' : '副'}模型配置。`);
  } catch (error) { setMessage(error instanceof Error ? error.message : '读取 API 设置失败。', 'error'); }
}
function focusRole(role: Role) { if (editingRole.value !== role) void edit(role); }
async function changeSelection(role: Role, value: string) {
  const mode = value === 'follow' ? 'follow' : value.startsWith('preset:') ? 'preset' : 'own';
  busy.value = 'select';
  try {
    await props.config.selectApi(role, { mode, ...(mode === 'preset' ? { presetId: value.slice(7) } : {}) });
    selection[role] = value;
    await edit(role);
    setMessage('API 选择已保存并立即生效。', 'success');
  } catch (error) { setMessage(error instanceof Error ? error.message : '保存 API 选择失败。', 'error'); }
  finally { busy.value = ''; }
}
async function save() {
  busy.value = 'save';
  try {
    await props.config.saveEditor(editingRole.value, { url: draft.url, model: draft.model, key: draft.key });
    await edit(editingRole.value);
    setMessage('API 设置已保存。', 'success');
  } catch (error) { setMessage(error instanceof Error ? error.message : '保存 API 设置失败。', 'error'); }
  finally { busy.value = ''; }
}
async function saveAsPreset(name: string) {
  dialog.value = null;
  busy.value = 'preset';
  try {
    const id = await props.config.savePresetAs(editingRole.value, name, { url: draft.url, model: draft.model, key: draft.key });
    const value = await props.config.getConfig(); presets.value = value.presets;
    selection[editingRole.value] = `preset:${id}`;
    await edit(editingRole.value);
    setMessage('共享 API 预设已保存并选中；其它使用者也会看到此预设。', 'success');
  } catch (error) { setMessage(error instanceof Error ? error.message : '另存共享预设失败。', 'error'); }
  finally { busy.value = ''; void nextTick(() => presetTrigger.value?.focus({ preventScroll: true })); }
}
async function removePreset() {
  dialog.value = null;
  if (!currentPresetId.value) return;
  busy.value = 'delete';
  try {
    const id = currentPresetId.value;
    await props.config.deletePreset(id);
    const value = await props.config.getConfig(); presets.value = value.presets;
    selection.primary = value.primaryPresetId ? `preset:${value.primaryPresetId}` : 'own';
    selection.secondary = value.secondaryFollowsPrimary ? 'follow' : value.secondaryPresetId ? `preset:${value.secondaryPresetId}` : 'own';
    await edit(editingRole.value);
    setMessage('共享预设已删除；百面相内引用已清理，其它插件需重新选择。', 'success');
  } catch (error) { setMessage(error instanceof Error ? error.message : '删除共享预设失败。', 'error'); }
  finally { busy.value = ''; void nextTick(() => presetTrigger.value?.focus({ preventScroll: true })); }
}
function closeDialog() {
  const trigger = dialog.value === 'delete' ? deleteTrigger : presetTrigger;
  dialog.value = null;
  void nextTick(() => trigger.value?.focus({ preventScroll: true }));
}
async function fetchModels() {
  busy.value = 'models';
  try {
    const target = await props.config.getProfile(editingRole.value);
    const profile = { ...target, url: draft.url.trim(), model: draft.model.trim(), key: draft.key.trim() || target.key };
    if (!profile.url || !profile.key) throw new Error('请先填写API地址和Key。');
    modelNames.value = await createModelSettingsTools().fetchModels(profile);
    modelsOpen.value = true; setMessage(`已拉取 ${modelNames.value.length} 个模型。`, 'success');
  } catch (error) { setMessage(error instanceof Error ? error.message : '拉取模型列表失败。', 'error'); }
  finally { busy.value = ''; }
}
async function testConnection() {
  busy.value = 'test';
  try {
    const target = await props.config.getProfile(editingRole.value);
    await createModelSettingsTools().testConnection({ ...target, url: draft.url.trim(), model: draft.model.trim(), key: draft.key.trim() || target.key });
    setMessage('连接成功，模型已返回文本。', 'success');
  } catch (error) { setMessage(error instanceof Error ? error.message : '测试连接失败。', 'error'); }
  finally { busy.value = ''; }
}
onMounted(load);
watch(() => props.refreshKey, () => { void refreshPresets(); });
</script>

<template>
  <section class="model-settings bmx-api-body">
    <label class="bmx-api-field"><span>主模型 API</span><InlineSelect :model-value="selection.primary" :options="[{ value: 'own', label: '主配置' }, ...presets.map(preset => ({ value: `preset:${preset.id}`, label: preset.name }))]" ariaLabel="主模型 API" :disabled="Boolean(busy)" @focus="focusRole('primary')" @update:model-value="changeSelection('primary', $event)" /></label>
    <label class="bmx-api-field"><span>副模型 API</span><InlineSelect :model-value="selection.secondary" :options="[{ value: 'follow', label: '跟随主模型' }, { value: 'own', label: '独立配置' }, ...presets.map(preset => ({ value: `preset:${preset.id}`, label: preset.name }))]" ariaLabel="副模型 API" :disabled="Boolean(busy)" @focus="focusRole('secondary')" @update:model-value="changeSelection('secondary', $event)" /></label>
    <p class="bmx-api-hint">{{ editorHint }}</p>
    <div class="bmx-api-divider"></div>
    <label class="bmx-api-field"><span>URL</span><input v-model="draft.url" class="bmx-api-input" type="url" autocomplete="url" placeholder="API URL" aria-label="API 地址"></label>
    <label class="bmx-api-field"><span>Key</span><input v-model="draft.key" class="bmx-api-input" type="password" autocomplete="new-password" :placeholder="draft.hasKey ? '已保存，留空保持不变' : '输入 API Key'" aria-label="API Key（留空保留已保存 Key）"></label>
    <label class="bmx-api-field"><span>模型</span><div class="bmx-api-inline"><input v-model="draft.model" class="bmx-api-input" autocomplete="off" placeholder="模型名称" aria-label="模型名称"><button type="button" class="bmx-api-secondary" :disabled="Boolean(busy)" @click="fetchModels">{{ busy === 'models' ? '正在拉取…' : '拉取模型' }}</button></div></label>
    <details v-if="modelsOpen" open class="bmx-model-list-section">
      <summary class="bmx-model-list-summary"><span class="bmx-model-list-chevron" aria-hidden="true">›</span><span>已加载 {{ modelNames.length }} 个模型</span></summary>
      <div class="bmx-model-list-body">
        <input v-model="modelQuery" class="bmx-api-input bmx-model-list-search" type="search" autocomplete="off" placeholder="搜索模型…" aria-label="搜索模型">
        <div class="bmx-model-list-items"><button v-for="name in visibleModels" :key="name" type="button" class="bmx-model-list-item" :class="{ active: name === draft.model.trim() }" :data-model="name" @click="draft.model = name">{{ name }}</button><div v-if="!visibleModels.length" class="bmx-model-list-empty">{{ modelQuery.trim() ? '无匹配项' : '暂无模型' }}</div></div>
      </div>
    </details>
    <p class="bmx-api-result" :class="messageTone" role="status">{{ message }}</p>
    <div class="bmx-api-actions bmx-api-save-bar"><button type="button" class="bmx-api-primary" :disabled="Boolean(busy)" @click="save">{{ busy === 'save' ? '保存中' : '保存' }}</button><button ref="presetTrigger" type="button" class="bmx-api-secondary" :disabled="Boolean(busy)" @click="dialog = 'preset'">另存为</button><button ref="deleteTrigger" type="button" class="bmx-api-secondary" :disabled="Boolean(busy) || !currentPresetId || !currentPreset" @click="dialog = 'delete'">删除</button><button type="button" class="bmx-api-secondary" :disabled="Boolean(busy)" @click="testConnection">{{ busy === 'test' ? '测试中' : '测试' }}</button></div>
    <ApiPresetDialog v-if="dialog === 'preset'" title="另存为预设" body="为当前 API 配置输入一个名称。保存后，所有使用共享 API 池的插件都能看到此预设。" prompt initial-value="百面相预设" confirm-text="保存" @cancel="closeDialog" @confirm="saveAsPreset" />
    <ApiPresetDialog v-else-if="dialog === 'delete'" title="删除 API 预设" :body="`删除预设「${currentPreset?.name}」？`" note="百面相对此预设的引用会清理；其它使用此共享预设的插件需重新选择。" confirm-text="删除" @cancel="closeDialog" @confirm="removePreset" />
  </section>
</template>
