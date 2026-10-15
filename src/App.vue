<script setup lang="ts">
import { reactive, onMounted, onBeforeUnmount, watch, ref } from 'vue';
import { store } from '@/state';
import * as api from '@/transport';
import { currentChatScope } from '@/st/chat';
import { onChatChanged } from '@/st/events';
import { createChatController, initialChatState } from '@/chat.logic.mjs';
import InitPanel from '@/ui/InitPanel.vue';
import RoomPanel from '@/ui/RoomPanel.vue';
import SettingsPanel from '@/ui/SettingsPanel.vue';

const state = reactive(initialChatState());
const controller = createChatController({ state, api, currentChat: currentChatScope, clientProtocol: api.CLIENT_PROTOCOL, healthText: api.healthText });
const tab = ref('chat');
let unsubscribe = () => {};
let poll: ReturnType<typeof setInterval>;
let polling = false;
function close() {
  store.panelOpen = false;
  document.getElementById('dollars-app-host')?.style.setProperty('display', 'none', 'important');
}
function escape(event: KeyboardEvent) { if (event.key === 'Escape') close(); }
async function reload() {
  if (currentChatScope().key === state.chatKey && state.universe && state.compatible) await controller.refreshRoom();
  else await controller.loadChat();
}
onMounted(() => {
  unsubscribe = onChatChanged(() => { void controller.loadChat(); });
  void controller.loadChat();
  poll = setInterval(async () => {
    if (polling || !store.panelOpen || !(state.running || state.activeCycle)) return;
    polling = true;
    try { await controller.refreshRoom(); } finally { polling = false; }
  }, 1800);
});
watch(() => store.panelOpen, value => { if (value) void reload(); });
onBeforeUnmount(() => { unsubscribe(); clearInterval(poll); controller.dispose(); });
</script>

<template>
  <section class="dollars-root" role="dialog" aria-label="Dollars 匿名聊天室" @keydown="escape">
    <header class="dollars-topbar">
      <div class="dollars-brand">DOLLARS<span>匿名聊天室</span></div>
      <nav class="dollars-tabs" aria-label="Dollars 页面">
        <button :aria-pressed="tab === 'chat'" @click="tab = 'chat'">聊天</button>
        <button :aria-pressed="tab === 'settings'" @click="tab = 'settings'">设置</button>
      </nav>
      <button class="dollars-close" aria-label="关闭 Dollars" @click="close">×</button>
    </header>
    <div v-if="!state.compatible" class="dollars-connection" role="status">
      <p>{{ state.backendStatus }}</p>
      <button :disabled="state.loading" @click="controller.loadChat()">重新连接</button>
    </div>
    <template v-else>
      <SettingsPanel v-if="tab === 'settings'" />
      <div v-else-if="state.loading" class="dollars-empty" role="status">正在打开当前聊天…</div>
      <div v-else-if="!state.stChatId" class="dollars-empty">先在 SillyTavern 中打开一个聊天。</div>
      <div v-else-if="!state.universe" class="dollars-onboarding">
        <h2>建立这个世界的大厅</h2>
        <p>从当前角色卡与世界书识别角色，确认后为他们创建匿名账号。</p>
        <InitPanel :key="state.chatKey" :chat-key="state.chatKey" @initialized="controller.loadChat()" />
      </div>
      <RoomPanel v-else-if="state.room" :key="state.chatKey + state.room.room_id" :state="state" :controller="controller" />
      <div v-else class="dollars-empty">还没有你已加入的房间。<button @click="controller.loadChat()">重新读取</button></div>
      <div v-if="state.error && !state.room" class="dollars-error" role="alert">{{ state.error }}</div>
    </template>
  </section>
</template>
