import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { createSSRApp } from 'vue';
import { renderToString } from 'vue/server-renderer';
import vue from '@vitejs/plugin-vue';

let server;
let WorldDetails;
test.before(async () => {
  server = await createServer({ configFile: false, plugins: [vue()], server: { middlewareMode: true, hmr: false }, appType: 'custom' });
  ({ default: WorldDetails } = await server.ssrLoadModule('/src/ui/WorldDetails.vue'));
});
test.after(async () => { await server?.close(); });

const person = (id, name) => ({ id, name, status: '尚无活动记录', description: `${name}的档案正文。`, sources: [{ kind: 'plugin', id: `source-${id}`, label: `${name}的资料来源` }] });
const activity = { id: 'activity-1', title: '调查旧车站', status: 'active', description: '正在调查。', participantIds: ['p1'], sources: [{ kind: 'chat', id: 'fixture:8', label: '第 8 楼正文' }] };
const event = { id: 'event-1', activityId: 'activity-1', title: '找到信件', description: '在车站找到信件的完整正文。', storyTime: null, participantIds: ['p1'], sources: [{ kind: 'chat', id: 'fixture:8', label: '第 8 楼正文' }] };
const unrelatedEvent = { ...event, id: 'event-2', activityId: 'activity-2', title: '无关事件', participantIds: ['p2'] };
const materialReader = { async readForQuestion() { return { status: 'empty', message: '没有相关资料。', routerText: '', materials: [], coverage: { partial: false, cseStatus: 'ready' } }; } };
const world = {
  id: 'fixture', storyTime: null,
  people: [person('p1', '林叶'), person('p2', '周岚')],
  activities: [activity, { ...activity, id: 'activity-2', title: '整理行李', participantIds: ['p2'] }],
  events: [event, unrelatedEvent],
  knowledge: [
    { personId: 'p1', eventId: 'event-1', reason: '亲眼读到信件。', sources: [{ kind: 'chat', id: 'fixture:8', label: '第 8 楼正文' }] },
    { personId: 'p2', eventId: 'event-2', reason: '另一人物的线索。', sources: [] },
  ],
};

test('person details retain explicit activity, event, and knowledge relations', async () => {
  const html = await renderToString(createSSRApp(WorldDetails, { world, selected: world.people[0], materialReader, backLabel: '返回图谱' }));
  assert.match(html, /林叶的档案正文/);
  assert.match(html, /林叶的资料来源/);
  assert.match(html, /调查旧车站 · 进行中/);
  assert.match(html, /找到信件/);
  assert.match(html, /亲眼读到信件/);
  assert.match(html, /当前状态与相关经历/);
  assert.match(html, /玩家查看的资料/);
  assert.match(html, /第 7 楼正文/);
  assert.doesNotMatch(html, /整理行李|无关事件|另一人物的线索/);
});

test('activity details retain description, status, participant, and related events', async () => {
  const html = await renderToString(createSSRApp(WorldDetails, { world, selected: activity, materialReader, backLabel: '返回当前活动' }));
  assert.match(html, /调查旧车站/);
  assert.match(html, /正在调查/);
  assert.match(html, /进行中/);
  assert.match(html, /林叶/);
  assert.match(html, /找到信件/);
  assert.match(html, /在车站找到信件的完整正文/);
  assert.match(html, /第 7 楼正文/);
  assert.doesNotMatch(html, /周岚|无关事件/);
});

test('corrected detail keeps old text, links the correcting fact and distinguishes retained reports from knowledge of truth',async()=>{const corrected={...event,correction:{byEventId:'truth',reason:'正文指出同一事实有误'},simulationWindowId:'w'};const snapshot={...world,events:[corrected,{...unrelatedEvent,id:'truth',title:'正确事实'}],knowledge:[{...world.knowledge[0],correction:{byEventId:'truth',treatment:'retained-report',reason:'确实收到过说法'}}],simulationRanges:[{id:'w',from:{text:'稍早'},to:{text:'随后'}}]};const html=await renderToString(createSSRApp(WorldDetails,{world:snapshot,selected:corrected,materialReader,backLabel:'返回'}));assert.match(html,/在车站找到信件的完整正文/);assert.match(html,/已由正文修正/);assert.match(html,/正确事实/);assert.match(html,/收到过的说法/);assert.match(html,/稍早/);assert.match(html,/随后/);});
