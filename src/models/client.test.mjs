import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';
let server; let createModelClient; let createModelRequester; let ModelError; let normalizeApiUrl; let parsePlan;
test.before(async () => { server = await createServer({ configFile: false, server: { middlewareMode: true, hmr: false }, appType: 'custom' }); ({ createModelClient, createModelRequester, ModelError, normalizeApiUrl } = await server.ssrLoadModule('/src/models/client.ts')); ({ parsePlan } = await server.ssrLoadModule('/src/simulation/parse.ts')); });
test.after(async () => { await server?.close(); });
const profile = { url: 'https://models.example///', model: 'primary', key: 'private-key' };

test('service 5xx failures give a truthful retry action without blaming configuration',async()=>{
 for(const body of [JSON.stringify({detail:'Response parsing failed'}),JSON.stringify({error:true}),'upstream failed']){
  let calls=0;const client=createModelClient({fetchImpl:async()=>{calls++;return new Response(body,{status:500});}});
  await assert.rejects(client.generate(profile,[],10),error=>error.httpStatus===500&&/模型服务.*HTTP 500.*稍后/.test(error.message)&&!/配置/.test(error.message));assert.equal(calls,1);
 }
 const detailed=createModelClient({fetchImpl:async()=>new Response(JSON.stringify({error:{message:'service maintenance'}}),{status:503})});await assert.rejects(detailed.generate(profile,[],10),/service maintenance/);
 const malformed=createModelClient({fetchImpl:async()=>new Response('not json',{status:200})});await assert.rejects(malformed.generate(profile,[],10),error=>error.code==='invalid_json');
});

test('model client uses host forwarding, preserves the owned key, and fails closed for empty keys and HTTP 200 errors', async () => {
  const requests = [];
  const client = createModelClient({ getHeaders: () => ({ 'Content-Type': 'application/json', 'X-CSRF-Token': 'host-token' }), fetchImpl: async (url, options) => { requests.push([url, options]); return new Response(JSON.stringify({ choices: [{ message: { content: '  {"ok":true}  ' } }] }), { status: 200 }); } });
  assert.equal(await client.generate(profile, [{ role: 'user', content: '{}' }], 2048), '{"ok":true}');
  assert.equal(requests.length, 1); assert.equal(requests[0][0], '/api/backends/chat-completions/generate');
  const payload = JSON.parse(requests[0][1].body);
  const headers = new Headers(requests[0][1].headers);
  assert.equal(headers.get('content-type'), 'application/json'); assert.equal(headers.get('x-csrf-token'), 'host-token');
  assert.equal(payload.reverse_proxy, 'https://models.example/v1'); assert.equal(payload.proxy_password, 'private-key'); assert.equal(payload.stream, false); assert.equal(payload.max_tokens, 2048);
  await assert.rejects(client.generate({ ...profile, key: '' }, [], 10), ModelError);
  assert.equal(requests.length, 1);
  const failed = createModelClient({ fetchImpl: async () => new Response(JSON.stringify({ error: { message: 'quota exhausted' } }), { status: 200 }) });
  await assert.rejects(failed.generate(profile, [], 10), error => error.httpStatus === 200 && /quota exhausted/.test(error.message));
  const stringFailure = createModelClient({ fetchImpl: async () => new Response(JSON.stringify({ error: 'backend unavailable' }), { status: 200 }) });
  await assert.rejects(stringFailure.generate(profile, [], 10), /backend unavailable/);
  const upstreamFailure = createModelClient({ fetchImpl: async () => new Response('upstream failed', { status: 503 }) });
  await assert.rejects(upstreamFailure.generate(profile, [], 10), error => error.httpStatus === 503 && /HTTP 503/.test(error.message));
});

test('model client normalizes shared and independent API URLs using QQJ routing rules', async () => {
  assert.equal(normalizeApiUrl(' https://host.example/// '), 'https://host.example/v1');
  assert.equal(normalizeApiUrl('http://host.example:8123'), 'http://host.example:8123/v1');
  assert.equal(normalizeApiUrl('https://host.example/v1'), 'https://host.example/v1');
  assert.equal(normalizeApiUrl('https://host.example/v1/chat/completions'), 'https://host.example/v1');
  assert.equal(normalizeApiUrl('https://host.example/proxy/openai/'), 'https://host.example/proxy/openai');
  for (const [url, expected] of [['https://host.example', 'https://host.example/v1'], ['https://host.example/chat/completions', 'https://host.example'], ['https://host.example/proxy/v1', 'https://host.example/proxy/v1']]) {
    let payload;
    const client = createModelClient({ fetchImpl: async (_path, init) => { payload = JSON.parse(init.body); return new Response(JSON.stringify({ choices: [{ message: { content: 'ok' } }] })); } });
    await client.generate({ ...profile, url }, [], 10);
    assert.equal(payload.reverse_proxy, expected);
  }
});

test('production model client reads forwarding headers from both host context entries', async () => {
  const originalST = globalThis.SillyTavern; const originalLuker = globalThis.Luker;
  try {
    for (const hostName of ['SillyTavern', 'Luker']) {
      let sent;
      if (hostName === 'Luker') delete globalThis.SillyTavern;
      globalThis[hostName] = { getContext: () => ({ getRequestHeaders: () => ({ 'X-CSRF-Token': hostName }) }) };
      const client = createModelClient({ fetchImpl: async (_path, init) => { sent = new Headers(init.headers).get('x-csrf-token'); return new Response(JSON.stringify({ choices: [{ message: { content: 'ok' } }] })); } });
      await client.generate(profile, [], 10);
      assert.equal(sent, hostName);
    }
  } finally {
    if (originalST === undefined) delete globalThis.SillyTavern; else globalThis.SillyTavern = originalST;
    if (originalLuker === undefined) delete globalThis.Luker; else globalThis.Luker = originalLuker;
  }
});

test('model requester sends temporary person codes and restores only structured person references', async () => {
  const firstId = 'qqj-chat-a/person-"one"'; const secondId = 'qqj-chat-a/person-two'; let sentInput;
  const requester = createModelRequester({ primary: profile, secondary: profile }, { async generate(_profile, messages) {
    sentInput = JSON.parse(messages[1].content);
    return JSON.stringify({ result: { activities: [{ title: 'P1 is literal text', participantIds: ['P1', 'P2'] }], knowledge: [{ personId: 'P2', reason: firstId }] } });
  } });
  const response = await requester.request({ task: 'history', instructions: 'strict', input: {
    floors: [{ seq: 1, role: 'assistant', text: `正文里保留 ${firstId}` }],
    people: [{ id: firstId, name: '甲' }, { id: secondId, name: '乙' }],
    baselineNow: { activities: [{ id: 'activity-P1', participantIds: [firstId] }] },
    currentMaterials: [{ personId: firstId, profileText: `材料保留 ${firstId}` }],
  } });
  assert.deepEqual(sentInput.people.map(person => person.id), ['P1', 'P2']);
  assert.deepEqual(sentInput.baselineNow.activities[0].participantIds, ['P1']);
  assert.equal(sentInput.baselineNow.activities[0].id, 'activity-P1');
  assert.equal(sentInput.floors[0].text, `正文里保留 ${firstId}`);
  assert.equal(sentInput.currentMaterials[0].profileText, `材料保留 ${firstId}`);
  assert.deepEqual(response.result.activities[0].participantIds, [firstId, secondId]);
  assert.equal(response.result.activities[0].title, 'P1 is literal text');
  assert.equal(response.result.knowledge[0].personId, secondId);
  assert.equal(response.result.knowledge[0].reason, firstId);
  const planRequest = createModelRequester({ primary: profile, secondary: profile }, { async generate(_profile, messages) {
    sentInput = JSON.parse(messages[1].content);
    return '{"personIds":["P2"],"activityIds":[]}';
  } });
  const plan = await planRequest.request({ task: 'plan', instructions: '', input: { people: [{ id: firstId }, { id: secondId }] } });
  assert.deepEqual(sentInput.people.map(person => person.id), ['P1', 'P2']);
  assert.deepEqual(plan.personIds, [secondId]);
  const contextPlan = createModelRequester({ primary: profile, secondary: profile }, { async generate(_profile, messages) {
    sentInput = JSON.parse(messages[1].content);
    return '{"personIds":["P2"],"activityIds":[]}';
  } });
  const contextResponse = await contextPlan.request({ task: 'plan', instructions: '', input: {
    people: [{ id: firstId }, { id: secondId }],
    personContexts: [{ personId: secondId, activityIds: ['a'], participatedEventIds: ['e'], knownEvents: [{ eventId: 'e', reason: '知道' }] }],
    contextEvents: [{ id: 'e', participantIds: [firstId, secondId] }],
  } });
  assert.equal(sentInput.personContexts[0].personId, 'P2');
  assert.deepEqual(sentInput.contextEvents[0].participantIds, ['P1', 'P2']);
  assert.deepEqual(contextResponse.personIds, [secondId]);
  const advanceRequest = createModelRequester({ primary: profile, secondary: profile }, { async generate(_profile, messages) {
    sentInput = JSON.parse(messages[1].content);
    return '{"activities":[{"title":"完成任务","participantIds":["P2"]}],"events":[],"knowledge":[]}';
  } });
  const advance = await advanceRequest.request({ task: 'advance', instructions: '', input: { selectedPeople: [{ id: secondId }], knownPeople: [{ id: firstId }, { id: secondId }] } });
  assert.deepEqual(sentInput.knownPeople.map(person => person.id), ['P1', 'P2']);
  assert.deepEqual(sentInput.selectedPeople.map(person => person.id), ['P2']);
  assert.deepEqual(advance.activities[0].participantIds, [secondId]);
});

test('individual intention person codes round-trip between plan parsing and batch serialization', async () => {
  const firstId = 'formal-person-alpha'; const secondId = 'formal-person-beta'; let planInput; let advanceInput; const budgets = [];
  const planRequester = createModelRequester({ primary: profile, secondary: profile }, { async generate(_profile, messages, maxTokens) {
    budgets.push(maxTokens);
    planInput = JSON.parse(messages[1].content);
    return '{"intentions":[{"personId":"P2","action":"继续本人未完成事项","activityId":"todo-P2"}],"question":""}';
  } });
  const plan = await planRequester.request({ task: 'plan', instructions: '', input: { people: [{ id: firstId }, { id: secondId }] } });
  assert.equal(planInput.people[1].id, 'P2');
  assert.deepEqual(plan.intentions[0], { personId: secondId, action: '继续本人未完成事项', activityId: 'todo-P2' });
  assert.equal(plan.intentions[0].action, '继续本人未完成事项');
  const advanceRequester = createModelRequester({ primary: profile, secondary: profile }, { async generate(_profile, messages, maxTokens) {
    budgets.push(maxTokens);
    advanceInput = JSON.parse(messages[1].content);
    return '{"activities":[],"events":[],"knowledge":[]}';
  } });
  await advanceRequester.request({ task: 'advance', instructions: '', input: { intentions: plan.intentions, knownPeople: [{ id: firstId }, { id: secondId }], selectedPeople: [{ id: secondId }] } });
  assert.equal(advanceInput.intentions[0].personId, 'P2');
  assert.equal(advanceInput.intentions[0].activityId, 'todo-P2');
  assert.equal(advanceInput.intentions[0].action, '继续本人未完成事项');
  assert.deepEqual(budgets, [4096, 8192]);
});

test('person_id alias decodes P codes through the real requester and leaves action text untouched', async () => {
  const id = 'formal-person-alias';
  const requester = createModelRequester({ primary: profile, secondary: profile }, { async generate() {
    return '{"intentions":[{"person_id":"P1","action":"P1 is literal action text"}]}';
  } });
  const response = await requester.request({ task: 'plan', instructions: '', input: { people: [{ id }] } });
  const plan = parsePlan(response);
  assert.equal(plan.intentions[0].personId, id);
  assert.equal(plan.intentions[0].action, 'P1 is literal action text');
});

test('history requester closes a missing quote only for an exact known participant code', async () => {
  const id = 'qqj-chat-b/person-unique'; const requester = createModelRequester({ primary: profile, secondary: profile }, { async generate() {
    return '{"activities":[{"title":"约定","participantIds":["P1\n  ],"sourceSeqs":[1]}],"events":[],"knowledge":[]}';
  } });
  const response = await requester.request({ task: 'history', instructions: '', input: { people: [{ id, name: '甲' }] } });
  assert.deepEqual(response.activities[0].participantIds, [id]);
});

test('trajectory uses primary 8192 tokens and maps basis, interaction and continuing-effect references without editing prose',async()=>{let sent;let tokenBudget;const requester=createModelRequester({primary:{...profile,model:'primary'},secondary:{...profile,model:'secondary'}},{async generate(chosen,messages,maxTokens){assert.equal(chosen.model,'primary');sent=JSON.parse(messages[1].content);tokenBudget=maxTokens;return {result:{initialBasis:{backgrounds:[{personId:'P2',text:'P1 is text',eventIds:[],sourceSeqs:[1]}]},intentions:[{personId:'P1',action:'P2 is text',interactionPersonIds:['P2']}],continuingEffects:[{eventId:'e',personIds:['P1']}],events:[{continuingForPersonIds:['P2']}]}};}});const response=await requester.request({task:'trajectory',instructions:'',input:{people:[{id:'a'},{id:'b'}],initialBasis:{backgrounds:[{personId:'b',text:'P2 is text'}]}}});assert.equal(tokenBudget,8192);assert.equal(sent.initialBasis.backgrounds[0].personId,'P2');assert.equal(response.result.initialBasis.backgrounds[0].personId,'b');assert.equal(response.result.initialBasis.backgrounds[0].text,'P1 is text');assert.deepEqual(response.result.intentions[0].interactionPersonIds,['b']);assert.deepEqual(response.result.continuingEffects[0].personIds,['a']);assert.deepEqual(response.result.events[0].continuingForPersonIds,['b']);assert.equal(response.result.intentions[0].action,'P2 is text');});

test('history batch requests a larger output on primary and restores person references inside ordered segments',async()=>{
 let payload;
 const client=createModelClient({getHeaders:()=>({}),fetchImpl:async(_path,options)=>{payload=JSON.parse(options.body);return new Response(JSON.stringify({choices:[{message:{content:'{"segments":[{"newEvents":[{"participantIds":["P1"]}]}]}'}}]}));}});
 const requester=createModelRequester({primary:profile,secondary:{...profile,model:'secondary'}},client);
 const result=await requester.request({task:'trajectory-batch',instructions:'生成整批',input:{people:[{id:'formal',name:'林青'}],turns:[{seq:1,text:'正文'}]}});
 assert.equal(payload.model,'primary');assert.equal(payload.max_tokens,65536);assert.deepEqual(result.segments[0].newEvents[0].participantIds,['formal']);
});
test('an explicitly truncated response is not accepted as a complete background batch',async()=>{
 const client=createModelClient({fetchImpl:async()=>new Response(JSON.stringify({choices:[{finish_reason:'length',message:{content:'{"segments":[]}'}}]}))});
 await assert.rejects(client.generate(profile,[],65536),error=>error.code==='output_truncated');
});
