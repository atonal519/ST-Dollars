import {getHostContext} from './host-context';

export function subscribeStoryCompletion(callback:(messageId?:unknown,generationType?:unknown)=>void,getContext=getHostContext):(()=>void)&{registered:boolean;event?:string} {
  const context=getContext();
  const events=context?.eventSource as {on?(name:string,callback:()=>void):void;removeListener?(name:string,callback:()=>void):void;off?(name:string,callback:()=>void):void}|undefined;
  const types=(context?.eventTypes??context?.event_types) as Record<string,string>|undefined;
  const event=types?.CHARACTER_MESSAGE_RENDERED;
  if(!event||!events?.on)return Object.assign(()=>{},{registered:false});
  events.on(event,callback);
  return Object.assign(()=>{if(events.removeListener)events.removeListener(event,callback);else events.off?.(event,callback);},{registered:true,event});
}
