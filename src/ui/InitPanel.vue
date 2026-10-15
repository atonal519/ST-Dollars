<script setup lang="ts">
import { ref, onBeforeUnmount } from 'vue';
import { readSource } from '@/st/reader';
import { analyze, commitWorld } from '@/transport';
import { currentChatId, currentChatScope, saveUniverseBinding } from '@/st/chat';

const props = defineProps<{ chatKey: string }>();
const emit = defineEmits<{ initialized: [] }>();
let alive = true;
onBeforeUnmount(() => { alive = false; });
const current = () => alive && props.chatKey === currentChatScope().key;

const cardType = ref('multi');
const chars = ref<any[]>([]);
const msg = ref('');
const busy = ref(false);
const done = ref(false);
const recognized = ref(false);

async function recognize() {
  if (!current() || busy.value) return;
  recognized.value = false;
  busy.value = true; msg.value = '识别中（分类→抽取→合并，稍等）…'; done.value = false; chars.value = [];
  try {
    const src = await readSource();
    if (!current()) return;
    const r = await analyze({ ...src, cardType: cardType.value });
    if (!current()) return;
    if (!r?.ok) { msg.value = '失败：' + (r?.error || '未知'); }
    else {
      chars.value = r.characters || [];
      recognized.value = true;
      const mains = chars.value.filter(c => c.tier === 'main').length;
      msg.value = `识别 ${chars.value.length} 角色（${mains} 主 / ${chars.value.length - mains} NPC）— 点角色可改 主/NPC`;
    }
  } catch (e: any) { if (current()) msg.value = '出错：' + (e?.message || e); }
  if (current()) busy.value = false;
}

function toggleTier(c: any) { c.tier = c.tier === 'main' ? 'npc' : 'main'; }

async function commit() {
  if (!current() || busy.value || !recognized.value) return;
  const stChatId = currentChatId();
  busy.value = true; msg.value = '建立中…';
  try {
    const r = await commitWorld({ stChatId, cardType: cardType.value, characters: chars.value });
    if (!current()) return;
    if (!r?.ok) { msg.value = '建立失败：' + (r?.error || '未知'); }
    else {
      await saveUniverseBinding(r.universeId, props.chatKey);
      if (!current()) return;
      done.value = true; emit('initialized');
    }
  } catch (e: any) { if (current()) msg.value = '出错：' + (e?.message || e); }
  if (current()) busy.value = false;
}
</script>

<template>
  <div class="dollars-init">
    <div class="dollars-row">
      <select v-model="cardType" :disabled="busy" aria-label="角色卡类型">
        <option value="single">单人卡</option>
        <option value="multi">多人卡</option>
        <option value="bigworld">大世界卡</option>
        <option value="simulator">模拟器卡</option>
      </select>
      <button :disabled="busy" @click="recognize">识别</button>
    </div>
    <div v-if="chars.length" class="dollars-charlist">
      <button v-for="c in chars" :key="c.display_name" class="dollars-char" :disabled="busy" @click="toggleTier(c)">
        <span :class="c.tier === 'main' ? 'dollars-main' : 'dollars-npc'">{{ c.tier === 'main' ? '主' : 'NPC' }}</span>{{ c.display_name }}
      </button>
    </div>
    <button v-if="recognized && !done" :disabled="busy" class="dollars-primary" @click="commit">确认建立（{{ chars.length }} 角色 + 我 → 大厅）</button>
    <p v-if="recognized && !chars.length">没有识别到固定角色。仍可建立大厅，动态角色将在后续功能中加入。</p>
    <div class="dollars-initmsg">{{ msg }}</div>
  </div>
</template>
