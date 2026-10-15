<script setup lang="ts">
import { computed, ref, watch, nextTick } from 'vue';
import { displayMessage } from '@/chat.logic.mjs';
import AnonymousAvatar from './AnonymousAvatar.vue';
const props = defineProps<{ state: any; controller: any }>();
const log = ref<HTMLElement>();
const editor = ref<HTMLElement>();
const editing = ref('');
const editText = ref('');
const olderLoading = ref(false);
const blocked = computed(() => props.state.loading || props.state.writing || props.state.running || !!props.state.activeCycle);
const entries = computed(() => [...props.state.messages, ...props.state.pending]);
function beginEdit(message: any) { editing.value = message.message_id; editText.value = message.content; }
async function saveEdit(message: any) {
  await props.controller.modify(message, editText.value.trim());
  if (!props.state.error) editing.value = '';
}
async function send() { await props.controller.send(); await nextTick(); editor.value?.focus(); }
function onInputKey(event: KeyboardEvent) {
  if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) { event.preventDefault(); void send(); }
}
async function older() {
  if (!log.value || olderLoading.value) return;
  olderLoading.value = true;
  const top = log.value.scrollTop, height = log.value.scrollHeight;
  await props.controller.refreshRoom(true);
  await nextTick();
  if (log.value) log.value.scrollTop = top + log.value.scrollHeight - height;
  olderLoading.value = false;
}
watch(() => entries.value.length, async () => {
  if (olderLoading.value) return;
  const atBottom = !log.value || log.value.scrollHeight - log.value.scrollTop - log.value.clientHeight < 100;
  await nextTick();
  if (atBottom && log.value) log.value.scrollTop = log.value.scrollHeight;
}, { immediate: true });
const time = (value: number) => new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
</script>

<template>
  <div class="dollars-workspace">
    <aside class="dollars-rooms" aria-label="已加入的房间">
      <div class="dollars-room-label">房间</div>
      <button v-for="room in state.rooms" :key="room.room_id" class="dollars-room-link" :aria-current="room.room_id === state.room.room_id ? 'page' : undefined"
        :disabled="blocked" @click="controller.openRoom(room)">{{ room.name }}</button>
      <div class="dollars-self"><AnonymousAvatar :color="state.userAccount.avatar_color" /><span>{{ state.userAccount.nickname }}</span></div>
    </aside>
    <main class="dollars-room-main">
      <header class="dollars-room-header"><div><h2>{{ state.room.name }}</h2><span>{{ state.members.length }} 人在室</span></div>
        <button class="dollars-text-button" :disabled="state.writing" @click="controller.refreshRoom()">刷新</button>
      </header>
      <details class="dollars-members"><summary>查看在室成员</summary><div><span v-for="member in state.members" :key="member.account_id"><AnonymousAvatar :color="member.avatar_color" />{{ member.nickname }}</span></div></details>
      <div ref="log" class="dollars-message-log" role="log" aria-label="大厅消息" aria-live="polite" aria-relevant="additions">
        <button v-if="state.hasMore" class="dollars-history" :disabled="olderLoading" @click="older">{{ olderLoading ? '读取中…' : '查看更早消息' }}</button>
        <div v-if="!entries.length" class="dollars-empty"><h3>大厅还很安静</h3><p>发几句话，再点“继续”。也可以直接继续，看看谁想开口。</p></div>
        <article v-for="message in entries" :key="message.message_id" class="dollars-message"
          :class="{ 'is-self': message.sender_account_id === state.userAccount.account_id, 'is-pending': message.status === 'pending_trigger' }">
          <AnonymousAvatar :color="message.profile.avatar_color" />
          <div class="dollars-message-body">
            <div class="dollars-message-meta"><span>{{ message.profile.nickname }}</span><time>{{ time(message.created_at) }}</time></div>
            <div v-if="editing === message.message_id" class="dollars-message-editor">
              <textarea v-model="editText" maxlength="8000" aria-label="修改待回应消息" :disabled="blocked" />
              <button :disabled="blocked || !editText.trim()" @click="saveEdit(message)">保存修改</button><button @click="editing = ''">取消</button>
            </div>
            <p v-else class="dollars-bubble">{{ displayMessage(message.content, state.members) }}</p>
            <div v-if="message.status === 'pending_trigger'" class="dollars-pending-actions">
              <span>{{ message.delivery === 'unsaved' ? '保存未确认' : '待回应' }}</span>
              <button v-if="message.delivery === 'unsaved'" :disabled="blocked" @click="controller.send(message)">重试保存</button>
              <button v-else :disabled="blocked" @click="beginEdit(message)">修改</button>
              <button :disabled="blocked" @click="controller.modify(message, '', true)">删除</button>
            </div>
          </div>
        </article>
      </div>
      <div class="dollars-cycle-status" role="status">
        <span>{{ state.running || state.activeCycle ? '正在回应… 已保存的消息会陆续出现。' : state.notice || (state.pending.length ? `${state.pending.length} 条消息待回应` : '你可以继续旁观，也可以加入话题。') }}</span>
      </div>
      <div v-if="state.error" class="dollars-error" role="alert">{{ state.error }}</div>
      <form class="dollars-composer" @submit.prevent="send">
        <textarea ref="editor" v-model="state.draft" placeholder="在大厅说点什么…" aria-label="大厅消息" maxlength="8000" :disabled="blocked" @keydown="onInputKey" />
        <div class="dollars-composer-bottom"><span>发送后，点“继续”才会回应</span>
          <div><button type="submit" :disabled="blocked || !state.draft.trim() || state.pending.length >= 100">{{ state.writing ? '保存中…' : '发送' }}</button>
            <button type="button" class="dollars-primary" :disabled="blocked || !!state.unconfirmed.length || !!editing" @click="controller.continueCycle()">{{ state.retryCycle ? '核对上轮结果' : '继续' }}</button></div>
        </div>
      </form>
    </main>
  </div>
</template>
