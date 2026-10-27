import {createBainiaoClient} from '../storage/bainiao-client';

export interface DiagnosticTrace {id:string;record(stage:string,details?:Record<string,unknown>):void;protect(values:string[]):void}
export interface DevelopmentDiagnostics {begin(trigger:string,details?:Record<string,unknown>):DiagnosticTrace}
export function recordDiagnostic(trace:DiagnosticTrace|undefined,stage:string,details:Record<string,unknown>|(()=>Record<string,unknown>)={}) {try{if(trace)trace.record(stage,typeof details==='function'?details():details);}catch{/* Evidence must never change the business result. */}}
export function protectDiagnostic(trace:DiagnosticTrace|undefined,values:string[]) {try{trace?.protect(values);}catch{/* Optional diagnostics only. */}}
export function beginDiagnostic(diagnostics:DevelopmentDiagnostics|undefined,trigger:string,details:Record<string,unknown>={}):DiagnosticTrace|undefined {try{return diagnostics?.begin(trigger,details);}catch{return undefined;}}
export function diagnosticError(error:unknown):Record<string,unknown> {try{const e=error as Error&{code?:string;status?:number;httpStatus?:number};return{error:e?.message??String(error),errorName:e?.name,code:e?.code,httpStatus:e?.httpStatus??e?.status};}catch{return{error:'Error details unavailable'};}}

type Event={at:number;stage:string;details:Record<string,unknown>};
type Raw={text:string;originalBytes:number;keptBytes:number;truncated:boolean;redacted:boolean;evicted?:boolean};
type Run={id:string;trigger:string;startedAt:number;version:string;events:Event[];rawResponse?:Raw;[key:string]:unknown};
type Document={schemaVersion:1;runs:Run[]};
type Client={get(collection:string,id:string):Promise<unknown>;put(collection:string,id:string,data:unknown,revision:number):Promise<unknown>};
const encoder=new TextEncoder();
const bytes=(text:string)=>encoder.encode(text).length;
const MAX_RAW=256*1024,MAX_TOTAL_RAW=512*1024,MAX_DOCUMENT=640*1024;
const allowed=new Set('scopeId source eventSeq eventType parentId module busy enabled status reason everyReplies pendingReplies processedThroughSeq throughSeq fromSeq initial revision expectedRevision ackRevision returnedRevisionPresent returnedDataPresent httpStatus code errorName error message model maxTokens jobId responseCharacters personCodes decodedKind recognizedFields acceptedWork submittedWork calibrationRejections foundationRejections boundaryRejections atmosphereRejections backgroundChanged addedEvents addedKnowledge changedActivities totalEvents totalKnowledge totalActivities atmosphereCount changedAtmospheres boundaryRejectionCount referenceNormalizationCount registered event storyStatus peopleCount sourceStatus fallbackRevision fallbackData latestAiSeq stableOnly routineCount materialReads materialCharacters requestedCharacters'.split(' '));
const sensitive=/^(?:authorization|proxy_password|api[_-]?key|apikey|access[_-]?token|cookie|set-cookie|headers|wireRequest|settings|reverse_proxy|endpoint|url|messages|fullMessages|request|requestBody|request_body)$/i;
function clip(text:string,limit:number):string {if(bytes(text)<=limit)return text;const data=encoder.encode(text);return new TextDecoder().decode(data.slice(0,Math.max(0,limit-4)))+'…';}
function headTail(text:string,limit:number):string {if(bytes(text)<=limit)return text;const data=encoder.encode(text),half=Math.floor((limit-64)/2);return new TextDecoder().decode(data.slice(0,half))+'\n…[diagnostic raw truncated]…\n'+new TextDecoder().decode(data.slice(-half));}

/** One bounded diagnostic document; its pending write never owns business state. */
export function createDevelopmentDiagnostics({client=createBainiaoClient(),recordId='recent',version='',now=Date.now}:{client?:Client;recordId?:string;version?:string;now?:()=>number}={}):DevelopmentDiagnostics {
  let runs:Run[]=[],revision=0,loaded=false,running=false,scheduled=false,dirty=false;
  function trim(input:Run[]):Run[] {
    const cutoff=now()-24*60*60*1000;
    const result=input.filter(run=>run.startedAt>=cutoff).sort((a,b)=>a.startedAt-b.startedAt).slice(-12);
    let total=result.reduce((sum,run)=>sum+bytes(run.rawResponse?.text??''),0);
    for(const run of result){if(total<=MAX_TOTAL_RAW)break;if(run.rawResponse?.text){total-=bytes(run.rawResponse.text);run.rawResponse={...run.rawResponse,text:'',keptBytes:0,truncated:true,evicted:true};}}
    while(result.length>1&&bytes(JSON.stringify({schemaVersion:1,runs:result}))>MAX_DOCUMENT)result.shift();
    return result;
  }
  function requestWrite(){dirty=true;if(running||scheduled)return;scheduled=true;queueMicrotask(()=>{scheduled=false;void write().catch(()=>{});});}
  async function write(){
    if(running)return;running=true;
    try{
      if(!loaded){
        const saved=await client.get('diagnostics-development',recordId) as {revision?:number;data?:Document}|null;
        if(saved&&(!Number.isInteger(saved.revision)||saved.data?.schemaVersion!==1||!Array.isArray(saved.data.runs)))throw Error('Diagnostic record unreadable');
        const incoming=saved?.data?.runs??[];const localIds=new Set(runs.map(run=>run.id));
        runs=trim([...incoming.filter(run=>!localIds.has(run.id)),...runs]);revision=saved?.revision??0;loaded=true;
      }
      while(dirty){
        dirty=false;runs=trim(runs);
        const document:Document={schemaVersion:1,runs:runs.map(run=>({...run,events:run.events.slice()}))};
        if(bytes(JSON.stringify(document))>MAX_DOCUMENT)throw Error('Diagnostic record exceeds its bound');
        const saved=await client.put('diagnostics-development',recordId,document,revision) as {revision?:number};
        if(!Number.isInteger(saved?.revision))throw Error('Diagnostic acknowledgement unreadable');
        revision=saved.revision!;
      }
    }catch{loaded=false;dirty=false;try{console.warn('[百面相诊断] 本次诊断未保存，业务结果不受影响。');}catch{/* No diagnostic exception escapes. */}}
    finally{running=false;}
  }
  return{begin(trigger,details={}){
    const secrets:string[]=[];
    const redact=(text:string)=>{
      let value=text;
      for(const secret of secrets)if(secret)value=value.split(secret).join('[redacted]');
      value=value.replace(/https?:\/\/[^\s"'<>\\]+/gi,'[redacted-url]').replace(/\bBearer\s+[^\s"'<>]+/gi,'Bearer [redacted]').replace(/\b(authorization|api[_-]?key|proxy_password)\s*[:=]\s*(?:"[^"]*"|'[^']*'|[^\s,;<]+)/gi,'$1: [redacted]');
      return value;
    };
    const clean=(value:unknown):unknown=>{
      if(value instanceof Error)return redact(value.message);
      if(typeof value==='string')return clip(redact(value),1024);
      if(Array.isArray(value))return value.slice(0,100).map(clean);
      if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).slice(0,100).map(([key,item])=>[key,sensitive.test(key)?'[redacted]':clean(item)]));
      return value??null;
    };
    const safeDetails=(source:Record<string,unknown>)=>{
      const result:Record<string,unknown>={};
      for(const [key,value]of Object.entries(source))if(allowed.has(key)){
        result[key]=clean(value);
        if(bytes(JSON.stringify(result))>4096){delete result[key];result.detailsTruncated=true;break;}
      }
      return result;
    };
    const run:Run={id:globalThis.crypto?.randomUUID?.()??`${now()}-${Math.random().toString(36).slice(2)}`,trigger,startedAt:now(),version,events:[],...safeDetails(details)};
    runs=trim([...runs,run]);
    const trace:DiagnosticTrace={id:run.id,protect(values){try{for(const value of values)if(value&&!secrets.includes(value))secrets.push(value);}catch{/* No business dependency. */}},record(stage,data={}){try{
      if(typeof data.rawResponse==='string'){
        const original=data.rawResponse;let text=redact(original);
        try{const parsed=JSON.parse(text);let changed=false;const scrub=(value:unknown):unknown=>{if(typeof value==='string'){const result=redact(value);changed ||= result!==value;return result;}if(Array.isArray(value))return value.map(scrub);if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([key,item])=>{if(sensitive.test(key)){changed=true;return[key,'[redacted]'];}return[key,scrub(item)];}));return value;};const safe=scrub(parsed);if(changed)text=JSON.stringify(safe);}catch{/* Preserve non-JSON errors as text. */}
        const kept=headTail(text,MAX_RAW);run.rawResponse={text:kept,originalBytes:bytes(original),keptBytes:bytes(kept),truncated:kept!==text,redacted:text!==original};
      }
      const details=safeDetails(data);
      if(typeof details.scopeId==='string')run.scopeId=details.scopeId;
      run.events.push({at:now(),stage:clip(stage,80),details});
      if(run.events.length>32)run.events.splice(8,run.events.length-32);
      requestWrite();
    }catch{/* Diagnostic serialization cannot reject a valid result. */}}};
    trace.record('triggered',details);
    return trace;
  }};
}
