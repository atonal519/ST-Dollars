import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';

test('time preparation uses past evidence, preserves relative boundaries and reuses saved endpoint', async () => {
  const server = await createServer({ configFile: false, server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom' });
  try {
    const { prepareTrajectory } = await server.ssrLoadModule('/src/simulation/trajectory.ts');
    const calls = [];
    const previous = { id: 'earlier', text: '稍早', sourceSeqs: [1] };
    const state = { scopeId: 'scope', activities: [{ id: 'today', title: '今天已完成', description: '当前概况', status: 'completed', participantIds: ['p'], sources: [] }], events: [], knowledge: [], simulationRanges: [{ id: 'saved', kind: 'elapsed', from: { id: 'begin', text: '开始', sourceSeqs: [1] }, to: previous, throughSeq: 1 }] };
    const result = await prepareTrajectory({ people: [{ id: 'p', displayName: '甲', description: '今日资料', aliases: [], source: { kind: 'plugin', id: 'p', label: '目录' } }], state, turns: [{ seq: 1, text: '稍早出门', isUser: false }, { seq: 2, text: '随后回来', isUser: false }], fromSeq: 1, model: { async request(request) { calls.push(request); if (!request.input.turns.length) return { sourceRequests: [{seqs:[2],reason:"确认后续时间"}] }; return { initialBasis: { backgrounds: [], activities: [], knowledge: [] }, boundaries: [{ key: 'earlier', id: 'earlier' }, { key: 'next', text: '随后', sourceSeqs: [2] }], windows: [{ key: 'w', kind: 'elapsed', fromBoundary: 'earlier', toBoundary: 'next', throughSeq: 2, authorEventIds: [], authorFloorSeqs: [2] }] }; } } });
    assert.equal(calls.length, 2);
    assert.equal(calls[0].task, 'trajectory');
    assert.equal(JSON.stringify(calls[0].input).includes('当前概况'), false);
    assert.equal(JSON.stringify(calls[0].input).includes('今日资料'), false);
    assert.equal(result.windows[0].from.id, 'earlier');
    assert.equal(result.windows[0].to.text, '随后');
    assert.equal(result.initialBasis.activities.length, 0);
  } finally { await server.close(); }
});

test('an earlier missing interval can end at a saved boundary and past state follows window order rather than save order',async()=>{
 const server=await createServer({configFile:false,server:{middlewareMode:true,hmr:false,ws:false},appType:'custom'});try{const {prepareTrajectory,projectAsOf}=await server.ssrLoadModule('/src/simulation/trajectory.ts');const b=n=>({id:`b${n}`,text:`相对时点${n}`,sourceSeqs:[n]});const state={schemaVersion:1,scopeId:'s',storyTime:{text:'当前很晚'},activities:[],knowledge:[],simulationRanges:[{id:'late',kind:'elapsed',from:b(2),to:b(3),throughSeq:3},{id:'early',kind:'elapsed',from:b(1),to:b(2),throughSeq:2}],events:[{id:'done',activityId:'a',title:'已完成',description:'',participantIds:['p'],sources:[],simulationWindowId:'late',activityChange:{title:'事项',description:'概况',participantIds:['p'],status:'completed'}},{id:'active',activityId:'a',title:'早期进行',description:'',participantIds:['p'],sources:[],simulationWindowId:'early',activityChange:{title:'事项',description:'概况',participantIds:['p'],status:'active'}}]};const window={id:'next',kind:'elapsed',from:b(3),to:b(4),throughSeq:4};const projection=projectAsOf(state,{backgrounds:[],activities:[],knowledge:[]},window);assert.equal(projection.storyTime.text,'相对时点3');assert.equal(projection.activities[0].status,'completed');
 const result=await prepareTrajectory({people:[{id:'p',displayName:'甲',aliases:[]}],state:{...state,simulationRanges:[state.simulationRanges[0]],events:[]},turns:[1,2,3,4].map(seq=>({seq,text:'正文',isUser:false})),fromSeq:1,model:{async request(request){if(!request.input.turns.length)return{sourceRequests:[{seqs:[1,2],reason:"核对早段时间"}]};return{initialBasis:{},boundaries:[{key:'a',text:'相对时点1',sourceSeqs:[1]},{key:'b',id:'b2'}],windows:[{kind:'elapsed',fromBoundary:'a',toBoundary:'b',throughSeq:2,authorEventIds:[],authorFloorSeqs:[2]}]};}}});assert.equal(result.windows[0].to.id,'b2');assert.equal(result.currentBoundaryId,'b3');
 }finally{await server.close();}});

test('preparation reports missing time and unknown source without writing or guessing materials',async()=>{const server=await createServer({configFile:false,server:{middlewareMode:true,hmr:false,ws:false},appType:'custom'});try{const {prepareTrajectory}=await server.ssrLoadModule('/src/simulation/trajectory.ts');const args={people:[],state:{events:[],activities:[],knowledge:[]},turns:[{seq:1,text:'没有时间',isUser:false}],fromSeq:1};await assert.rejects(prepareTrajectory({...args,model:{async request(){return{windows:[],message:'缺少故事时间依据'};}}}),/缺少故事时间/);await assert.rejects(prepareTrajectory({...args,model:{async request(){return{boundaries:[{key:'a',text:'先前',sourceSeqs:[999]}],windows:[]};}}}),/来源/);}finally{await server.close();}});
