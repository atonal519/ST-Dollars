const crypto = require('node:crypto');
const { callLLM } = require('./llm.js');
const { extractJson } = require('./jsonutil.js');
const { buildContext } = require('./context.js');
const { insertMessage } = require('./repo.js');

const MAX_TURNS = 6;
const fmtRecent = (recent) => recent.length ? recent.map(m => `[${m.nickname}(${m.sender_account_id})] ${m.content}`).join('\n') : '（暂无消息）';
const fmtRoster = (chars) => chars.map(c => `- ${c.nickname}（account_id:${c.account_id}）人设:${c.persona || '(未知)'}`).join('\n');
const ROUTER_SYS = '你是匿名网络聊天室「Dollars」的调度器，只做机械判断、用 account_id 认人，严格只输出 JSON、不要解释、不要代码围栏。';
const CHAR_SYS = (c) => `你在匿名网络聊天室「Dollars」里扮演一个角色。account_id：${c.account_id}，昵称：${c.nickname}。你的人设：${c.persona || '(简略)'}。你只知道自己的人设和聊天室里公开的消息，用 account_id 认人。`;

async function callJSON(cfg, messages, opts) { return extractJson(await callLLM(cfg, messages, opts)); }
function firstField(value, names) {
  for (const name of names) if (value && Object.hasOwn(value, name)) return value[name];
  return undefined;
}
// 仅统一模型输出的英文枚举大小写和空白，不扩充允许的动作集合。
function normalizeLabel(value) { return typeof value === 'string' ? value.trim().toLowerCase() : ''; }

async function filterCandidates(cfgS, chars, recent) {
  const u = `房间里的角色：\n${fmtRoster(chars)}\n\n最近的消息：\n${fmtRecent(recent)}\n\n判断此刻有合理动机想行动（发言/回应）的候选，没动机就别选、允许为空。只输出 JSON：{"candidates":[{"account_id":"","reason":""}]}`;
  const d = await callJSON(cfgS, [{ role: 'system', content: ROUTER_SYS }, { role: 'user', content: u }], { maxTokens: 1024, temperature: 0.3 });
  const candidates = Array.isArray(d) ? d : d?.candidates;
  if (!Array.isArray(candidates)) throw new Error('候选输出格式错误');
  const seen = new Set();
  return candidates.flatMap(candidate => {
    const accountId = typeof candidate === 'string' ? candidate : firstField(candidate, ['account_id', 'accountId']);
    if (typeof accountId !== 'string' || seen.has(accountId)) return [];
    seen.add(accountId);
    return [{ account_id: accountId }];
  });
}
async function genIntent(cfgP, ch, recent) {
  const u = `最近的消息：\n${fmtRecent(recent)}\n\n作为「${ch.nickname}」决定你此刻的意图（speak想发言 / observe围观 / hesitate犹豫 / leave离开 / ignore无视，沉默都是合法的，别为回应硬 speak）。只输出 JSON：{"action":"","reason":"","topic":"若speak用一句说想聊的方向，否则空"}`;
  const d = await callJSON(cfgP, [{ role: 'system', content: CHAR_SYS(ch) }, { role: 'user', content: u }], { maxTokens: 1024, temperature: 0.8 });
  return { action: normalizeLabel(firstField(d, ['action', 'intent'])), topic: firstField(d, ['topic']) };
}
async function pickActor(cfgS, intents, recent) {
  const lines = intents.map(i => `- ${i.nickname}(${i.account_id})：action=${i.action} topic="${i.topic || ''}"`).join('\n');
  const u = `最近的消息：\n${fmtRecent(recent)}\n\n候选意图：\n${lines}\n\n从 action=speak 里选此刻最适合接着说的一个（考虑对话自然、避免同一人连说），没有就返回 null。只输出 JSON：{"actor_id":"acc或null","reason":""}`;
  return callJSON(cfgS, [{ role: 'system', content: ROUTER_SYS }, { role: 'user', content: u }], { maxTokens: 512, temperature: 0.3 });
}
async function genMessage(cfgP, ch, intent, recent) {
  const u = `最近的消息：\n${fmtRecent(recent)}\n\n你（${ch.nickname}）要发言，方向：${intent?.topic || '顺着当前话题自然接话'}。像真人在群里打字：口语、简短（一两句）、不要旁白/动作/括号/引号、符合你的人设。只输出 JSON：{"message":""}`;
  const d = await callJSON(cfgP, [{ role: 'system', content: CHAR_SYS(ch) }, { role: 'user', content: u }], { maxTokens: 1024, temperature: 0.9 });
  const message = typeof d === 'string' ? d : ['message', 'content', 'text']
    .map(field => firstField(d, [field]))
    .find(value => typeof value === 'string' && value.trim());
  if (typeof message !== 'string' || !message.trim()) throw new Error('角色发言输出格式错误');
  return message.trim();
}
async function continueOrStop(cfgS, recent, produced, pending) {
  const w = pending.length ? `本轮里这些角色也想说但还没轮到：${pending.join('、')}。` : '目前没有其他角色明确还想说。';
  const u = `最近的消息：\n${fmtRecent(recent)}\n\n本轮已产生 ${produced} 条 AI 消息。${w}\n这是多人聊天室，角色之间可以互相接话、追问、起哄，不必每次有人回应就停下等用户。判断这轮 continue（还有人想说/话题还热）还是 stop（都说完了/冷场/该等用户）。只输出 JSON：{"decision":"continue|stop","reason":""}`;
  const d = await callJSON(cfgS, [{ role: 'system', content: ROUTER_SYS }, { role: 'user', content: u }], { maxTokens: 512, temperature: 0.2 });
  const decision = normalizeLabel(typeof d === 'string' ? d : firstField(d, ['decision']));
  if (!['continue', 'stop'].includes(decision)) throw new Error('停止判断输出格式错误');
  return decision;
}

// 跑一轮 Conversation Cycle：读房间上下文 → 五环编排 → 台词落库。所有 character 账号平等参与（tier 透传不分精度）。
async function runCycle({ db, cfgPrimary, cfgSecondary, universeId, roomId, onMessage, cycleId }) {
  const cyc = cycleId || 'cyc_' + crypto.randomUUID().slice(0, 8);
  let produced = 0;
  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const ctx = buildContext(db, { roomId });
    const chars = ctx.accounts.filter(a => a.kind === 'character');
    if (!chars.length) break;
    const cand = (await filterCandidates(cfgSecondary, chars, ctx.recent)).filter(c => chars.some(x => x.account_id === c.account_id));
    if (!cand.length) break;
    const results = await Promise.allSettled(cand.map(async c => {
      const ch = chars.find(x => x.account_id === c.account_id);
      const it = await genIntent(cfgPrimary, ch, ctx.recent);
      if (!['speak','observe','hesitate','leave','ignore'].includes(it.action)) throw new Error('角色意图格式错误');
      return { account_id: c.account_id, nickname: ch.nickname, action: it?.action, topic: it?.topic };
    }));
    const failed = results.find(r => r.status === 'rejected');
    if (failed) throw failed.reason;
    const intents = results.map(r => r.value);
    const pick = await pickActor(cfgSecondary, intents, ctx.recent);
    const actorId = typeof pick === 'string' ? pick : firstField(pick, ['actor_id', 'actorId', 'account_id']);
    if (pick === null || actorId === null || normalizeLabel(actorId) === 'null') break;
    if (typeof actorId !== 'string' || !actorId.trim()) throw new Error('调度器选择格式错误');
    const selectedId = actorId.trim();
    const actor = chars.find(x => x.account_id === selectedId);
    if (!actor) throw new Error('调度器选择了未知角色');
    const intent = intents.find(i => i.account_id === selectedId);
    if (intent?.action !== 'speak') throw new Error('调度器选择了不能发言的角色');
    const text = await genMessage(cfgPrimary, actor, intent, ctx.recent);
    if (text) {
      insertMessage(db, { messageId: 'msg_' + crypto.randomUUID().slice(0, 8), universeId, roomId, senderAccountId: selectedId, type: 'text', content: text, cycleId: cyc, status: 'committed' });
      produced++;
      onMessage?.({ sender_account_id: selectedId, nickname: actor.nickname, content: text });
    }
    if (produced >= MAX_TURNS) break;
    const pending = intents.filter(i => i.action === 'speak' && i.account_id !== selectedId).map(i => i.nickname);
    if ((await continueOrStop(cfgSecondary, buildContext(db, { roomId }).recent, produced, pending)) !== 'continue') break;
  }
  return { status: produced > 0 ? 'completed' : 'completed_empty', produced, cycleId: cyc };
}
module.exports = { runCycle, buildContext };
