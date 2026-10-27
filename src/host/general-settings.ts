import {getHostContext} from './host-context';
import {getSharedBodyWrappers,updateSharedBodyWrappers,type BodyWrappers} from './shared-body-wrappers.js';
import {initializeSharedProcessingPrompt,getSharedProcessingPrompt,updateSharedProcessingPrompt} from './shared-processing-prompt.js';
import {listWorldInfoBookNames} from './world-book-catalog.js';

export const canonicalBook = (value: string) => value.trim().normalize('NFKD').replace(/\p{M}/gu,'').toLocaleLowerCase('zh-Hans-CN');
export function excludedWorldBooks(settings: Record<string,unknown> = {}): string[] {
  const values=(settings['schedule-planner'] as Record<string,unknown>|undefined)?.wiExcludeBooks;
  return Array.isArray(values)?values.filter((name):name is string=>typeof name==='string'&&Boolean(name.trim())):[];
}
export async function worldInfoBindings(context: Record<string,unknown>):Promise<Record<string,any>> {
  if(typeof context.getWorldInfoNames==='function'&&typeof context.loadWorldInfo==='function')return {};
  if(!globalThis.location)return {};
  const module=await import(/* @vite-ignore */new URL('/scripts/world-info.js',globalThis.location.href).href);
  return {getWorldInfoNames:()=>module.world_names,getSelectedWorldInfo:()=>module.selected_world_info,getWorldInfoSettings:()=>module.world_info,loadWorldInfo:module.loadWorldInfo};
}
export function createGeneralSettings(getContext=getHostContext) {
  const context=()=>{const value=getContext();if(!value?.extensionSettings||typeof value.saveSettingsDebounced!=='function')throw new Error('暂时无法保存通用设置，请重新打开百面相。');return value as typeof value & {extensionSettings:Record<string,unknown>;saveSettingsDebounced():void};};
  const first=context();getSharedBodyWrappers(first.extensionSettings);initializeSharedProcessingPrompt(first.extensionSettings,()=>first.saveSettingsDebounced());
  return {
    get:()=>({processingPrompt:getSharedProcessingPrompt(context().extensionSettings)}),
    processingPrompt:()=>getSharedProcessingPrompt(context().extensionSettings),
    update(patch:{processingPrompt?:string}){const host=context();if(Object.hasOwn(patch,'processingPrompt'))updateSharedProcessingPrompt(host.extensionSettings,patch.processingPrompt);host.saveSettingsDebounced();},
    wrappers:()=>getSharedBodyWrappers(context().extensionSettings),
    updateWrappers(patch:Partial<BodyWrappers>){const host=context();updateSharedBodyWrappers(host.extensionSettings,patch);host.saveSettingsDebounced();},
    async inspectCurrent(){const host=context();const bindings=await worldInfoBindings(host);return {status:'ready',bookNames:await listWorldInfoBookNames(host,{bindings}),excludedBooks:excludedWorldBooks(host.extensionSettings)};},
    setBookExcluded(name:string,excluded:boolean){const host=context(),shared=(host.extensionSettings['schedule-planner']??={}) as Record<string,unknown>;const next=excludedWorldBooks(host.extensionSettings).filter(item=>canonicalBook(item)!==canonicalBook(name));if(excluded)next.push(name);shared.wiExcludeBooks=next;host.saveSettingsDebounced();return next;},
    subscribe(listener:()=>void){const host=getContext() as any;const event=host?.eventTypes?.SETTINGS_UPDATED;host?.eventSource?.on?.(event,listener);return ()=>host?.eventSource?.removeListener?.(event,listener);},
  };
}
export type GeneralSettings=ReturnType<typeof createGeneralSettings>;
