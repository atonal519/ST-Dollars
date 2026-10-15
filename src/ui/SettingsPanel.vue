<script setup lang="ts">
import { reactive, ref, onMounted } from 'vue';
import { getConfig, saveSecondary, savePrimary, pingLlm } from '@/transport';
import { currentChatId } from '@/st/chat';
import { createMyriadKnotsProvider } from '@/st/myriad-knots.mjs';
const configs = reactive({ secondary: { url: '', model: '', key: '', hasKey: false }, primary: { url: '', model: '', key: '', hasKey: false } });
const busy = ref(false), message = ref('');
const provider = createMyriadKnotsProvider({ currentChatId });
const memory = ref(provider.status());
const labels: Record<string, string> = { ready: '已检测到，可只读连接', disabled: '千千结已关闭', 'not-ready': '千千结正在准备当前聊天', unavailable: '未检测到千千结', stale: '千千结正在切换聊天', unsupported: '读取接口版本不兼容', error: '读取接口暂不可用' };
onMounted(async () => {
  busy.value = true;
  try {
    const data = await getConfig();
    for (const channel of ['primary','secondary'] as const) if (data[channel]) Object.assign(configs[channel], data[channel], { key: '' });
  } catch (e: any) { message.value = e.message; }
  finally { busy.value = false; }
});
async function save(channel: 'primary' | 'secondary') {
  busy.value = true; message.value = '';
  try {
    const result = await (channel === 'primary' ? savePrimary : saveSecondary)(configs[channel]);
    configs[channel].key = ''; configs[channel].hasKey = result.config.hasKey;
    message.value = '已保存';
  } catch (e: any) { message.value = e.message; }
  finally { busy.value = false; }
}
async function test() {
  busy.value = true; message.value = '测试连接中…';
  try { const result = await pingLlm(); message.value = '调度模型已连通：' + result.reply; }
  catch (e: any) { message.value = e.message; }
  finally { busy.value = false; }
}
</script>
<template>
  <div class="dollars-settings">
    <h2>模型设置</h2><p>角色模型负责人物表达，调度模型负责选择发言者和判断何时结束。</p>
    <fieldset v-for="channel in (['primary', 'secondary'] as const)" :key="channel" :disabled="busy">
      <legend>{{ channel === 'primary' ? '角色模型 · Primary' : '调度模型 · Secondary' }}</legend>
      <label>API 地址<input v-model="configs[channel].url" type="url" placeholder="https://…/v1" autocomplete="off" /></label>
      <label>模型名<input v-model="configs[channel].model" placeholder="模型名称" autocomplete="off" /></label>
      <label>API Key<input v-model="configs[channel].key" type="password" :placeholder="configs[channel].hasKey ? '已保存，留空保留原 Key' : '输入 API Key'" autocomplete="new-password" /></label>
      <button @click="save(channel)">保存{{ channel === 'primary' ? '角色' : '调度' }}模型</button>
      <button v-if="channel === 'secondary'" @click="test">测试连接</button>
    </fieldset>
    <p class="dollars-setting-note">兼容当前原型：未配置 Primary 时，角色使用已保存的 Secondary 配置。</p>
    <p role="status">{{ message }}</p>
    <div class="dollars-memory-status"><h3>主楼记忆 · 千千结</h3><p>{{ labels[memory.status] || '当前状态未知' }}</p>
      <p>记忆接入尚未启用，不影响大厅聊天。</p><button @click="memory = provider.status()">检查连接</button></div>
  </div>
</template>
