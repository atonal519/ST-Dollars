import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'vite';
let server,historyRequestCounts,trajectoryRequestCounts;
test.before(async()=>{server=await createServer({configFile:false,server:{middlewareMode:true,hmr:false,ws:false},appType:'custom'});({historyRequestCounts,trajectoryRequestCounts}=await server.ssrLoadModule('/src/ui/request-counts.ts'));});
test.after(async()=>server?.close());
const history={status:'checked',batches:3,progress:0,modelCalls:0};
const trajectory={status:'ready',prepared:{windows:[{},{},{}]},completed:0,modelCalls:2};

test('history counts include the active request once and include failed requests when work is explicitly continued',()=>{
 assert.deepEqual(historyRequestCounts(history),{total:'3 次',current:'尚未开始',remaining:'3 次'});
 assert.deepEqual(historyRequestCounts({...history,status:'collecting',stage:'request',currentBatch:2,progress:1,modelCalls:2}),{total:'3 次',current:'第 2 次，等待返回',remaining:'1 次'});
 assert.deepEqual(historyRequestCounts({...history,status:'error',canContinue:true,progress:1,modelCalls:2}),{total:'4 次',current:'第 2 次',remaining:'2 次'});
 assert.deepEqual(historyRequestCounts({...history,status:'collecting',stage:'request',currentBatch:2,progress:1,modelCalls:3}),{total:'4 次',current:'第 3 次，等待返回',remaining:'1 次'});
 assert.deepEqual(historyRequestCounts({...history,status:'preview',progress:3,modelCalls:4},true),{total:'4 次',current:'第 4 次已返回，正在保存',remaining:'0 次'});
 assert.deepEqual(historyRequestCounts({...history,status:'saved',progress:3,modelCalls:4}),{total:'4 次',current:'第 4 次已返回',remaining:'0 次'});
});

test('trajectory counts one batch dispatch and zero additional calls for a retained candidate',()=>{
 const checked={status:'checked',check:{canPrepare:true},modelCalls:0,completed:0};
 assert.deepEqual(trajectoryRequestCounts(checked),{total:'1 次',current:'尚未开始',remaining:'1 次'});
 assert.deepEqual(trajectoryRequestCounts({...checked,status:'running',requestPending:true,modelCalls:1}),{total:'1 次',current:'第 1 次，等待返回',remaining:'0 次'});
 assert.deepEqual(trajectoryRequestCounts({...checked,status:'error',canSave:true,modelCalls:1}),{total:'1 次',current:'第 1 次',remaining:'0 次'});
 assert.deepEqual(trajectoryRequestCounts({...checked,status:'error',modelCalls:1}),{total:'2 次',current:'第 1 次',remaining:'1 次'});
 assert.deepEqual(trajectoryRequestCounts({...checked,status:'error',conflict:true,modelCalls:1}),{total:'1 次',current:'第 1 次',remaining:'0 次'});
 assert.deepEqual(trajectoryRequestCounts({...checked,status:'saved',modelCalls:1}),{total:'1 次',current:'第 1 次已返回',remaining:'0 次'});
});
