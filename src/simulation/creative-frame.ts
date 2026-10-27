import type {CreativeRecipeId,DevelopmentCreativeFrame} from '../domain/world';
import {storyMinutes} from '../host/story-clock';
type Resource='A'|'B'|'C';
export interface CreativeFrame extends DevelopmentCreativeFrame { shares:Record<Resource,number>; directions:Record<Resource,string[]>; scope:string; intensity:string }
const recipes:Array<{id:CreativeRecipeId;shares:[number,number,number];weight:number}>=[
  {id:'affairs',shares:[5,3,2],weight:35},{id:'inward',shares:[3,5,2],weight:25},{id:'contact',shares:[3,2,5],weight:10},
  {id:'steady',shares:[4,4,2],weight:15},{id:'practical',shares:[4,2,4],weight:10},{id:'social',shares:[2,4,4],weight:5},
];
const pools:Record<Resource,string[]>={A:['延续现有事项','推进具体的一小步','准备接下来的安排','调整做法或次序'],B:['私下消化感受','权衡两种普通选择','注意一个日常细节','保持自己的偏好与节奏'],C:['核对现实安排','交换有限且有来路的信息','顺路接触','自然分工或互助']};
function hash(value:string){let result=2166136261;for(let index=0;index<value.length;index++)result=Math.imul(result^value.charCodeAt(index),16777619);return result>>>0;}
export function selectCreativeFrame(scopeId:string,currentClock:string|null|undefined,previousFrame?:DevelopmentCreativeFrame):CreativeFrame {
  const minutes=storyMinutes(currentClock),date=minutes===null?null:new Date(minutes*60000);
  const key=date?`${scopeId}|${date.toISOString().slice(0,10)}|${Math.floor(date.getUTCHours()/6)*6}|v1`:previousFrame?.key??`${scopeId}|undated|v1`;
  let total=0;const draw=hash(key+'|recipe')%100;
  const recipe=(previousFrame?.key===key?recipes.find(recipe=>recipe.id===previousFrame.recipeId):undefined)??recipes.find(recipe=>(total+=recipe.weight)>draw)!;
  return {key,version:1,recipeId:recipe.id,shares:{A:recipe.shares[0],B:recipe.shares[1],C:recipe.shares[2]},directions:Object.fromEntries((['A','B','C'] as Resource[]).map(kind=>[kind,[...pools[kind]].sort((a,b)=>hash(key+'|'+kind+'|'+a)-hash(key+'|'+kind+'|'+b)).slice(0,2)])) as Record<Resource,string[]>,scope:'本故事段全体内容的取材构成，各人侧重可以不同',intensity:'低烈度、温吞复杂；不随机制造报复、决裂、暴力、重大秘密或异常好运，正文已有重大事态据实承接'};
}
