<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { store } from '@/state';
import { getConfig, saveSecondary } from '@/transport';

const url = ref('');
const model = ref('');
const key = ref('');
const cfgMsg = ref('');

onMounted(async () => {
  const c = await getConfig();
  if (c?.secondary) {
    url.value = c.secondary.url || '';
    model.value = c.secondary.model || '';
    if (c.secondary.hasKey) cfgMsg.value = '（已配置 Key）';
  }
});

async function save() {
  try {
    await saveSecondary({ url: url.value, model: model.value, key: key.value });
    cfgMsg.value = '已保存';
    key.value = '';
  } catch (e: any) {
    cfgMsg.value = '保存失败：' + (e?.message || e);
  }
}
</script>

<template>
  <div class="dollars-root">
    <div class="dollars-title">Dollars</div>
    <div class="dollars-status">{{ store.status }}</div>
    <div class="dollars-cfg">
      <input v-model="url" placeholder="Secondary API URL (…/v1)" />
      <input v-model="model" placeholder="模型名" />
      <input v-model="key" type="password" placeholder="API Key（留空=不改）" />
      <button @click="save">保存</button>
      <span class="dollars-cfg-msg">{{ cfgMsg }}</span>
    </div>
  </div>
</template>
