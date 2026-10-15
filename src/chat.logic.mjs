export const initialChatState = () => ({
  stChatId: '', chatKey: '', universe: null, rooms: [], room: null, userAccount: null,
  members: [], messages: [], pending: [], unconfirmed: [], draft: '', hasMore: false,
  compatible: false, backendStatus: '连接中…', loading: false, writing: false,
  running: false, activeCycle: null, retryCycle: null, notice: '', error: '',
});

export function displayMessage(text, members) {
  const names = new Map(members.map(m => [m.account_id, m.nickname]));
  return String(text ?? '').replace(/\bacc_[a-zA-Z0-9_-]+\b/g, value => names.get(value) || '匿名');
}

export function createChatController({ state, api, currentChat, clientProtocol, healthText, id = () => crypto.randomUUID() }) {
  let epoch = 0;
  let readVersion = 0;
  const drafts = new Map();
  const valid = token => token === epoch && state.chatKey === currentChat().key;
  const scope = () => ({ stChatId: state.stChatId, universeId: state.universe.universe_id, roomId: state.room.room_id });
  function remember() {
    if (state.room) drafts.set(state.chatKey + state.room.room_id, { draft: state.draft, unconfirmed: [...state.unconfirmed] });
  }
  function restore() {
    const saved = drafts.get(state.chatKey + state.room.room_id);
    state.draft = saved?.draft || '';
    state.unconfirmed = saved?.unconfirmed || [];
  }
  function applyRoom(data, older = false) {
    state.room = data.room; state.userAccount = data.userAccount; state.members = data.members;
    const merged = new Map((older ? [...data.messages, ...state.messages] : [...state.messages, ...data.messages]).map(m => [m.message_id, m]));
    state.messages = [...merged.values()];
    if (older || state.messages.length <= 100) state.hasMore = data.hasMore;
    state.unconfirmed = state.unconfirmed.filter(m => !data.pending.some(p => p.message_id === m.message_id) && !data.messages.some(p => p.message_id === m.message_id));
    state.pending = [...data.pending, ...state.unconfirmed];
    state.activeCycle = data.activeCycle;
  }
  async function loadChat() {
    remember();
    const token = ++epoch;
    readVersion++;
    const chat = currentChat();
    Object.assign(state, initialChatState(), { stChatId: chat.id, chatKey: chat.key, loading: true });
    try {
      const health = await api.fetchHealth();
      if (!valid(token)) return;
      state.backendStatus = healthText(health);
      state.compatible = health?.ok === true && health.protocolVersion === clientProtocol && health.db === 'ok';
      if (!state.compatible) return;
      if (!chat.id) { state.notice = '先在 SillyTavern 中打开一个聊天。'; return; }
      const u = await api.getUniverse(chat.id);
      if (!valid(token)) return;
      state.universe = u.universe; state.rooms = u.rooms; state.userAccount = u.userAccount;
      if (u.rooms.length) {
        state.room = u.rooms[0];
        restore();
        const data = await api.getRoom(scope());
        if (valid(token)) applyRoom(data);
      }
    } catch (e) { if (valid(token)) state.error = e.message || '加载失败，请重试。'; }
    finally { if (valid(token)) state.loading = false; }
  }
  async function openRoom(room) {
    if (state.running || state.activeCycle || state.writing) return;
    remember();
    const token = ++epoch;
    readVersion++;
    Object.assign(state, { room, messages: [], pending: [], unconfirmed: [], loading: true, notice: '', error: '', retryCycle: null });
    restore();
    try { const data = await api.getRoom(scope()); if (valid(token)) applyRoom(data); }
    catch (e) { if (valid(token)) state.error = e.message; }
    finally { if (valid(token)) state.loading = false; }
  }
  async function refreshRoom(older = false) {
    if (!state.room || state.loading || state.writing) return;
    const token = epoch, version = ++readVersion;
    const payload = { ...scope(), ...(older && state.messages.length ? { before: state.messages[0].message_id } : {}) };
    try {
      const data = await api.getRoom(payload);
      if (valid(token) && version === readVersion) applyRoom(data, older);
    } catch (e) { if (valid(token) && version === readVersion) state.error = e.message; }
  }
  function canWrite() { return valid(epoch) && state.compatible && state.room && !state.loading && !state.writing && !state.running && !state.activeCycle; }
  async function send(existing) {
    if (!canWrite()) return;
    const content = existing?.content ?? state.draft.trim();
    if (!content || content.length > 8000 || state.pending.length >= 100 && !existing) return;
    const token = epoch;
    const message = existing || { message_id: 'msg_' + id(), sender_account_id: state.userAccount.account_id,
      content, profile: state.userAccount, type: 'text', created_at: Date.now(), status: 'pending_trigger', delivery: 'unsaved' };
    const payload = { ...scope(), messageId: message.message_id, content };
    state.writing = true; state.error = ''; readVersion++;
    if (!existing) { state.unconfirmed.push(message); state.pending.push(message); state.draft = ''; }
    try {
      const saved = await api.sendPending(payload);
      if (!valid(token)) return;
      state.unconfirmed = state.unconfirmed.filter(m => m.message_id !== message.message_id);
      state.pending = state.pending.filter(m => m.message_id !== message.message_id);
      if (saved.message.status === 'pending_trigger') state.pending.push(saved.message);
      else state.messages.push(saved.message);
    } catch (e) { if (valid(token)) state.error = e.message || '保存未确认，请重试这条消息。'; }
    finally { if (valid(token)) { state.writing = false; readVersion++; remember(); } }
  }
  async function modify(message, content, remove = false) {
    if (!canWrite()) return;
    const token = epoch;
    const payload = { ...scope(), messageId: message.message_id, ...(remove ? {} : { content }) };
    state.writing = true; state.error = ''; readVersion++;
    try {
      if (remove) {
        try { await api.removePending(payload); }
        catch (e) { if (!(message.delivery === 'unsaved' && e.result?.code === 'missing_message')) throw e; }
      } else await api.editPending(payload);
      if (!valid(token)) return;
      state.unconfirmed = state.unconfirmed.filter(m => m.message_id !== message.message_id);
      state.pending = remove ? state.pending.filter(m => m.message_id !== message.message_id)
        : state.pending.map(m => m.message_id === message.message_id ? { ...m, content } : m);
    } catch (e) { if (valid(token)) state.error = e.message; }
    finally { if (valid(token)) { state.writing = false; readVersion++; remember(); } }
  }
  async function continueCycle() {
    if (!canWrite() || state.unconfirmed.length) return;
    const token = epoch;
    const payload = state.retryCycle || { ...scope(), requestId: 'cyc_' + id(), pendingMessageIds: state.pending.map(m => m.message_id) };
    state.retryCycle = payload; state.running = true; state.error = ''; state.notice = '正在回应…'; readVersion++;
    try {
      const output = await api.runCycle(payload);
      if (!valid(token)) return;
      state.retryCycle = null;
      state.notice = output.status === 'cycle_completed_empty' ? '这一轮暂时没人想说话。' : `本轮新增 ${output.produced} 条回应。`;
    } catch (e) {
      if (!valid(token)) return;
      if (e.result?.accepted || e.httpStatus && e.httpStatus < 500 && e.result?.code !== 'cycle_running') state.retryCycle = null;
      state.error = e.message || '本轮结果尚未确认，请刷新房间或核对上轮结果。'; state.notice = '';
    } finally {
      if (valid(token)) { state.running = false; await refreshRoom(); }
    }
  }
  function dispose() { remember(); epoch++; readVersion++; }
  return { loadChat, openRoom, refreshRoom, send, modify, continueCycle, dispose };
}
