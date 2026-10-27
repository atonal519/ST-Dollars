import {getHostContext,type HostContext} from './host-context';
import type {WorldSettingsReader,WorldSettings} from '../application/contracts';
import {canonicalBook,excludedWorldBooks,worldInfoBindings} from './general-settings';
import {scopedWorldNames} from './world-book-catalog.js';
const object=(value:unknown):Record<string,any>|null=>value!==null&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,any>:null;
/** Current public host selection only; embedded books are not a fallback for a failed live book. */
export function createWorldSettingsReader({getContext=getHostContext}:{getContext?:()=>HostContext|undefined}={}):WorldSettingsReader {
  return{async read(){
    const result:WorldSettings={characterDescription:'',books:[],partial:false};
    const context=getContext();if(!context)return{...result,partial:true};
    const characters=context.characters as unknown[]|undefined,card=object(characters?.[Number(context.characterId)]);
    result.characterDescription=typeof card?.description==='string'?card.description:typeof card?.data?.description==='string'?card.data.description:'';
    const names=new Set<string>();
    const add=(value:unknown)=>{if(Array.isArray(value))value.forEach(add);else if(typeof value==='string'&&value.trim())names.add(value.trim());};
    add(card?.data?.extensions?.world??card?.extensions?.world);
    try{if(typeof context.getCharaAuxWorlds==='function')add(context.getCharaAuxWorlds(typeof card?.avatar==='string'?card.avatar.replace(/\.[^.]+$/,''):undefined));}catch{result.partial=true;}
    try{const selection=object(context.chatWorldInfo);if(typeof selection?.getNames==='function')add(selection.getNames());}catch{result.partial=true;}
    let bindings:Record<string,any>={};
    try{bindings=await worldInfoBindings(context);}catch{result.partial=true;}
    for(const items of scopedWorldNames(context,bindings).values())add(items);
    const load=context.loadWorldInfo??bindings.loadWorldInfo;
    if(names.size&&typeof load!=='function')result.partial=true;
    const excluded=new Set(excludedWorldBooks(context.extensionSettings).map(canonicalBook));
    if(typeof load==='function')for(const name of [...names].filter(name=>!excluded.has(canonicalBook(name))))try{
      const book=object(await load(name));if(!book){result.partial=true;continue;}
      const entries=Object.entries(object(book.entries)??{}).flatMap(([id,value])=>{const item=object(value);return item&&item.disable!==true&&typeof item.content==='string'&&item.content.trim()?[{id:String(item.uid??id),content:item.content,comment:typeof item.comment==='string'?item.comment:'',keys:Array.isArray(item.key)?item.key.filter((v:unknown)=>typeof v==='string'):[],secondaryKeys:Array.isArray(item.keysecondary)?item.keysecondary.filter((v:unknown)=>typeof v==='string'):[],constant:item.constant===true,selective:item.selective===true,selectiveLogic:item.selectiveLogic,useProbability:item.useProbability===true,probability:item.probability}]:[];});
      result.books.push({name,entries});
    }catch{result.partial=true;}
    return result;
  }};
}
