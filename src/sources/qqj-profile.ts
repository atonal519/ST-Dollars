/** BMX consumes author identity and choices, never a second complete QQJ profile. */
export const PROFILE_GROUPS = [
  {label:'基础身份',fields:[['gender','性别'],['age','年龄'],['species','种族']]},
  {label:'身份',fields:[['occupation','职业'],['organization','所属组织'],['socialIdentity','社会身份'],['identityRelations','重要身份关系']]},
  {label:'性格与生活',fields:[['personality','核心性格'],['conduct','处事方式'],['expression','表达习惯'],['principles','原则与底线'],['likes','喜好'],['dislikes','厌恶']]},
] as const;
const allowed=new Set<string>(['name','aliases',...PROFILE_GROUPS.flatMap(group=>group.fields.map(([field])=>field))]);
export function projectQQJProfile(profile:Record<string,unknown>|null):Record<string,unknown>|null {
  if(!profile)return null;
  return {...Object.fromEntries(Object.entries(profile).filter(([field])=>allowed.has(field))),...(Array.isArray(profile.manualFields)?{manualFields:profile.manualFields.filter(field=>typeof field==='string'&&allowed.has(field))}:{})};
}
/** Public context has one cleaned field per line; unknown prose is not a profile fallback. */
export function normalizeQQJProfileText(value:unknown,{includeBrief=true}:{includeBrief?:boolean}={}):string {
  if(typeof value!=='string')return '';
  return value.split('\n').filter(line=>{
    const field=/^\s*-\s*([A-Za-z]+)(?:（人工决定）)?[：:]/u.exec(line)?.[1];
    return field?allowed.has(field):includeBrief&&/^\s*-?\s*(?:有据身份简介|历史简介(?:，未记录引文)?)(?:（[^）]*）)?[：:]/u.test(line);
  }).join('\n').trim();
}
