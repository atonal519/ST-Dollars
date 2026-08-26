<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { store } from '@/state';
import { getConfig, saveSecondary, pingLlm } from '@/transport';
import InitPanel from '@/ui/InitPanel.vue';

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

async function test() {
  cfgMsg.value = '测试中…';
  try {
    const r = await pingLlm();
    cfgMsg.value = r?.ok ? ('连通 ✓ ' + r.reply) : ('失败：' + (r?.error || '未知'));
  } catch (e: any) {
    cfgMsg.value = '请求出错：' + (e?.message || e);
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
      <div class="dollars-cfg-row">
        <button @click="save">保存</button>
        <button @click="test">测试连接</button>
      </div>
      <span class="dollars-cfg-msg">{{ cfgMsg }}</span>
    </div>
    <InitPanel />
  </div>
</template>
