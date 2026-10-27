import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'vite';
import vue from '@vitejs/plugin-vue';
import {createSSRApp,h} from 'vue';
import {renderToString} from 'vue/server-renderer';
let server,FourSenses;
test.before(async()=>{server=await createServer({configFile:false,plugins:[vue()],server:{middlewareMode:true,hmr:false,ws:false},appType:'custom'});FourSenses=(await server.ssrLoadModule('/src/ui/FourSenses.vue')).default;});
test.after(()=>server?.close());
const activity=(id,title,participantIds,status='active')=>({id,title,description:title,status,participantIds,sources:[]});
const world={id:'scope',storyTime:null,people:['p','q'].map(id=>({id,name:id,status:'',description:'',sources:[]})),activities:[activity('onstage','纯在场事务',['p']),activity('mixed','混合事务',['p','q']),activity('offstage','场外事务',['q']),activity('empty','未明确参与人',[]),activity('done','已完成混合事务',['p','q'],'completed')],events:[],knowledge:[]};
async function render(developmentOnstagePersonIds){return renderToString(createSSRApp({render:()=>h(FourSenses,{page:'sight',state:{world:{...world,developmentOnstagePersonIds},source:{status:'ready',message:''},busy:false,error:''}})}));}
const contexts=html=>[...html.matchAll(/<button\b([^>]*)>(.*?)<\/button>/gs)].filter(match=>{const classes=match[1].match(/\bclass="([^"]*)"/)?.[1].split(/\s+/)??[];return classes.includes('bmx-graph-context')&&classes.includes('task-node');}).map(match=>match[2]);
test('the real FourSenses graph only creates activity links with an actual HearingPage target',async()=>{
 const html=await render(['p']),links=contexts(html);assert.equal(links.length,1);assert.match(links[0],/混合事务/);assert.doesNotMatch(links[0],/纯在场事务|已完成/);
 assert.doesNotMatch(html,/data-result-id="onstage"/);for(const id of ['mixed','offstage','empty','done'])assert.ok(html.includes('data-result-id="'+id+'"'));
});
test('without current onstage ownership the graph keeps the original unfinished activity links',async()=>{
 const html=await render(undefined),links=contexts(html);assert.equal(links.length,2);assert.ok(links.some(link=>link.includes('纯在场事务')));assert.ok(links.some(link=>link.includes('混合事务')));assert.ok(links.every(link=>!link.includes('已完成')));
});
