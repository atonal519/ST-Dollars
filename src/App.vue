<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { store } from '@/state';
import { getConfig, saveSecondary, pingLlm, analyze } from '@/transport';
import { readSource } from '@/st/reader';

const url = ref('');
const model = ref('');
const key = ref('');
const cfgMsg = ref('');
const anaMsg = ref('');

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
    cfgMsg.value = r?.ok ? ('连通 ✓ 模型回复：' + r.reply) : ('失败：' + (r?.error || '未知'));
  } catch (e: any) {
    cfgMsg.value = '请求出错：' + (e?.message || e) + '（后端可能没重启？）';
  }
}

async function runAnalyze() {
  anaMsg.value = '读取素材…';
  try {
    const src = await readSource();
    anaMsg.value = `读到卡「${src.card.name}」+ 世界书 ${src.worldbook.length} 条，分析中…`;
    const r = await analyze(src);
    anaMsg.value = r?.ok ? ('后端收到：' + JSON.stringify(r.received || r.counts)) : ('失败：' + (r?.error || '未知'));
  } catch (e: any) {
    anaMsg.value = '出错：' + (e?.message || e);
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
        <button @click="runAnalyze">识别测试</button>
      </div>
      <span class="dollars-cfg-msg">{{ cfgMsg }}</span>
      <span class="dollars-cfg-msg">{{ anaMsg }}</span>
    </div>
  </div>
</template>
