import type {QuestionMaterialRead} from '../application/contracts';
const record=(value:unknown):Record<string,any>|null=>value!==null&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,any>:null;
/** Public floor locators, not AI ordinal numbers, define the story cutoff. */
export function boundContextReads(reads:QuestionMaterialRead[],snapshot:unknown,throughSeq:number|null,qqjChatId:string|null):QuestionMaterialRead[] {
  const value=record(snapshot),floors=new Map<string,number|null>(),ordinals=new Map<number,number|null>();
  const bind=<T>(map:Map<T,number|null>,key:T,seq:number)=>{map.set(key,map.has(key)&&map.get(key)!==seq?null:seq);};
  if(value?.status==='ready'&&record(value.identity)?.qqjChatId===qqjChatId)for(const floor of [...(Array.isArray(value.memory?.floors)?value.memory.floors:[]),...(Array.isArray(value.cse?.floors)?value.cse.floors:[])]) {
    if(!Number.isInteger(floor?.messageIndex)||floor.messageIndex<0)continue;
    const seq=floor.messageIndex+1;
    if(typeof floor.floorId==='string')bind(floors,floor.floorId,seq);
    if(Number.isInteger(floor.assistantSeq))bind(ordinals,floor.assistantSeq,seq);
  }
  const eligible=(ids:string[])=>ids.length>0&&throughSeq!==null&&ids.every(id=>{const seq=floors.get(id);return typeof seq==='number'&&seq<=throughSeq;});
  const prefix=(line:string)=>/^\s*-?\s*[^\n]*?（([^）]*)）：/.exec(line)?.[1]??'';
  const memoryId=(line:string)=>/；记忆\s+([^；）]+)$/.exec(prefix(line))?.[1]?.trim();
  const allRefs=new Map<string,string[]>();
  for(const read of reads)for(const actor of read.materials)for(const ref of actor.refs)allRefs.set(ref.memoryId,[...new Set([...(allRefs.get(ref.memoryId)??[]),...ref.floorIds])]);
  const sourcedPrefix=(line:string)=>{
    const meta=prefix(line),ids=[...meta.matchAll(/AI\s*#(\d+)/g)].map(match=>Number(match[1]));
    return ids.length>0&&throughSeq!==null&&ids.every(id=>{const seq=ordinals.get(id);return typeof seq==='number'&&seq<=throughSeq;})||Boolean(meta&&eligible([meta]));
  };
  return reads.map(read=>{
    let omitted=false;
    const filter=(text:string,accept:(line:string)=>boolean,router=false)=>{
      const kept=text.split('\n').filter(line=>{if(!line.trim()||(router&&line.trim().startsWith('[')))return false;const ok=accept(line);omitted||=!ok;return ok;});
      return kept.length?(router?'[作者侧已发生背景；仅供参考，不代表人物均知情]\n':'')+kept.join('\n'):'';
    };
    const materials=read.materials.map(actor=>{
      const refs=new Map(actor.refs.map(ref=>[ref.memoryId,ref.floorIds]));
      const memoryText=filter(actor.memoryText,line=>{const id=memoryId(line);return Boolean(id&&eligible(refs.get(id)??[]));});
      const keptIds=new Set(memoryText.split('\n').map(memoryId).filter(Boolean));
      const retainedRefs=actor.refs.filter(ref=>keptIds.has(ref.memoryId)&&eligible(ref.floorIds));
      const sources=actor.sources.filter(source=>{try{return keptIds.has(JSON.parse(source.id.slice('qqj-context:'.length))[1]);}catch{return false;}});
      return{...actor,stateText:filter(actor.stateText,sourcedPrefix),memoryText,refs:retainedRefs,sources};
    });
    const routerText=filter(read.routerText,line=>{const id=memoryId(line);return Boolean(id&&(allRefs.has(id)?eligible(allRefs.get(id)!):sourcedPrefix(line)));},true);
    return{...read,materials,routerText,coverage:{...read.coverage,partial:read.coverage.partial||omitted},message:omitted?`${read.message} 已略过晚于本次稳定正文或来源无法确认的动态资料。`:read.message};
  });
}
