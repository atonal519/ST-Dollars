<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { readSource } from '@/st/reader';
import { analyze, commitWorld, getUniverse } from '@/transport';
import { currentChatId, saveUniverseBinding } from '@/st/chat';

const cardType = ref('multi');
const chars = ref<any[]>([]);
const msg = ref('');
const busy = ref(false);
const done = ref(false);

onMounted(async () => {
  // 已初始化过就提示
  const u = await getUniverse(currentChatId());
  if (u?.universe) { done.value = true; msg.value = `该聊天已初始化：${JSON.stringify(u.counts)}`; }
});

async function recognize() {
  busy.value = true; msg.value = '识别中（分类→抽取→合并，稍等）…'; done.value = false; chars.value = [];
  try {
    const src = await readSource();
    const r = await analyze({ ...src, cardType: cardType.value });
    if (!r?.ok) { msg.value = '失败：' + (r?.error || '未知'); }
    else {
      chars.value = r.characters || [];
      const mains = chars.value.filter(c => c.tier === 'main').length;
      msg.value = `识别 ${chars.value.length} 角色（${mains} 主 / ${chars.value.length - mains} NPC）— 点角色可改 主/NPC`;
    }
  } catch (e: any) { msg.value = '出错：' + (e?.message || e); }
  busy.value = false;
}

function toggleTier(c: any) { c.tier = c.tier === 'main' ? 'npc' : 'main'; }

async function commit() {
  busy.value = true; msg.value = '建立中…';
  try {
    const r = await commitWorld({ stChatId: currentChatId(), cardType: cardType.value, characters: chars.value });
    if (!r?.ok) { msg.value = '建立失败：' + (r?.error || '未知'); }
    else { saveUniverseBinding(r.universeId); done.value = true; msg.value = `已建立 Universe ✓ ${JSON.stringify(r.counts)}`; }
  } catch (e: any) { msg.value = '出错：' + (e?.message || e); }
  busy.value = false;
}
</script>

<template>
  <div class="dollars-init">
    <div class="dollars-row">
      <select v-model="cardType">
        <option value="single">单人卡</option>
        <option value="multi">多人卡</option>
        <option value="bigworld">大世界卡</option>
        <option value="simulator">模拟器卡</option>
      </select>
      <button :disabled="busy" @click="recognize">识别</button>
    </div>
    <div v-if="chars.length" class="dollars-charlist">
      <div v-for="c in chars" :key="c.display_name" class="dollars-char" @click="toggleTier(c)">
        <span :class="c.tier === 'main' ? 'dollars-main' : 'dollars-npc'">{{ c.tier === 'main' ? '主' : 'NPC' }}</span>{{ c.display_name }}
      </div>
    </div>
    <button v-if="chars.length && !done" :disabled="busy" class="dollars-commit" @click="commit">确认建立（{{ chars.length }} 角色 + 我 → 大厅）</button>
    <div class="dollars-initmsg">{{ msg }}</div>
  </div>
</template>
