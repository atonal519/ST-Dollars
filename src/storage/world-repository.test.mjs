import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createServer } from 'vite';
import express from '/home/admin/sillytavern/node_modules/express/index.js';

let server; let createBainiaoClient; let createWorldRepository; let createEmptyState; let registerRoutes; let RecordStore;
test.before(async () => {
  server = await createServer({ configFile: false, server: { middlewareMode: true, hmr: false }, appType: 'custom' });
  ({ createBainiaoClient } = await server.ssrLoadModule('/src/storage/bainiao-client.ts'));
  ({ createWorldRepository } = await server.ssrLoadModule('/src/storage/world-repository.ts'));
  ({ createEmptyState } = await server.ssrLoadModule('/src/domain/world-state.ts'));
  ({ registerRoutes } = await import(pathToFileURL('/home/admin/sillytavern/plugins/ST-BaiNiaoData/src/routes.mjs')));
  ({ RecordStore } = await import(pathToFileURL('/home/admin/sillytavern/plugins/ST-BaiNiaoData/src/store.mjs')));
});
test.after(async () => { await server?.close(); });

test('production Dollars client and repository publish one isolated world record through BaiNiao production routes/store', { skip: process.env.DOLLARS_REAL_BAINIAO_HTTP !== '1' }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'dollars-world-'));
  let httpServer;
  try {
    const app = express(); app.use(express.json());
    app.use((req, res, next) => { req.user = { directories: { root } }; next(); });
    app.use((req, res, next) => { if (req.method === 'PUT' && req.get('content-type') !== 'application/json') return res.status(415).json({ error: 'content_type' }); next(); });
    const router = express.Router(); registerRoutes(router, new RecordStore()); app.use('/api/plugins/st-bainiaodata', router);
    httpServer = await new Promise(resolve => { const listener = app.listen(0, '127.0.0.1', () => resolve(listener)); });
    const baseUrl = `http://127.0.0.1:${httpServer.address().port}`;
    const repository = createWorldRepository(createBainiaoClient({ baseUrl, getHeaders: () => ({ 'Content-Type': 'application/json', 'X-CSRF-Token': 'fixture-token' }) }));
    const empty = await repository.load('qqj-chat');
    assert.equal(empty, null);
    const state = { ...createEmptyState('qqj-chat'), processedThroughSeq: 12, activities: [{ id: 'a1', title: '计划', status: 'planned', description: '待办。', participantIds: ['p1'], sources: [] }] };
    const first = await repository.save('qqj-chat', state, null);
    assert.equal(first.revision, 1);
    const loaded = await repository.load('qqj-chat');
    assert.equal(loaded.state.activities[0].title, '计划');
    assert.equal('people' in loaded.state, false);
    await assert.rejects(repository.save('qqj-chat', state, null), error => error.status === 409 && /重新读取/.test(error.message));
    const second = await repository.save('qqj-chat', { ...loaded.state, processedThroughSeq: 13 }, loaded.revision);
    assert.equal(second.state.processedThroughSeq, 13);
    assert.equal((await repository.load('another-chat')), null);
  } finally { if (httpServer) await new Promise(resolve => httpServer.close(resolve)); await rm(root, { recursive: true, force: true }); }
});

test('isolated record roundtrip preserves optional simulation and correction fields while reading a legacy record does not write defaults',async()=>{let stored={data:createEmptyState('s'),revision:1};let puts=0;const repository=createWorldRepository({async get(){return JSON.parse(JSON.stringify(stored));},async put(c,id,data,expected){assert.equal(c,'npc-world-s');assert.equal(id,'world');assert.equal(expected,1);puts++;stored=JSON.parse(JSON.stringify({data,revision:2}));return stored;}});const legacy=await repository.load('s');assert.equal(legacy.state.simulationRanges,undefined);assert.equal(puts,0);const boundary={id:'b',text:'稍早',sourceSeqs:[1]};const state={...legacy.state,simulationRanges:[{id:'w',kind:'current',from:boundary,to:boundary,throughSeq:1}],activities:[{id:'a',title:'事项',description:'概况',status:'completed',participantIds:['p'],sources:[],currentStateWindowId:'w'}],events:[{id:'e',activityId:'a',title:'原说法',description:'保留',participantIds:['p'],sources:[{kind:'simulation',id:'w',label:'稍早'}],storyTime:null,simulationWindowId:'w',activityChange:{status:'completed'},continuingForPersonIds:['p'],correction:{byEventId:'truth',reason:'正文'}},{id:'truth',activityId:null,title:'事实',description:'正确',participantIds:[],sources:[],storyTime:null}],knowledge:[{personId:'p',eventId:'e',reason:'收到过',sources:[],correction:{byEventId:'truth',treatment:'retained-report',reason:'报告'}}]};await repository.save('s',state,1);assert.deepEqual((await repository.load('s')).state,state);assert.equal(puts,1);});
