import type { PeopleDirectoryRead, PeopleDirectoryReader } from '../application/contracts';
import type { SourcePerson } from '../domain/source-people';
import { encodeQQJPersonId } from './qqj-person-id';
import {PROFILE_GROUPS,projectQQJProfile} from './qqj-profile';

const PROCESSING_STATUSES = new Set([
  'savingSelection', 'savingProfile', 'savingAvatar', 'merging', 'deleting', 'generating',
]);
const WAITING_STATUSES = new Set(['idle', 'loading', 'not-ready']);

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function splitAliases(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(text).filter(Boolean);
  return text(value).split(/[、，,\n;；]/u).map(value => value.trim()).filter(Boolean);
}

function profileDescription(profile: Record<string, unknown> | null, displayName: string, itemAliases: unknown, brief: string): string {
  const manual=new Set(Array.isArray(profile?.manualFields)?profile.manualFields:[]);
  const aliases = [...splitAliases(itemAliases), ...splitAliases(profile?.aliases)]
    .filter(alias => alias !== displayName);
  const uniqueAliases = [...new Set(aliases)];
  const lines: string[] = [];
  if (uniqueAliases.length) lines.push(`别名：${uniqueAliases.join('、')}`);

  let hasProfileContent = false;
  for (const group of PROFILE_GROUPS) {
    const fields = group.fields
      .map(([field, label]) => [manual.has(field)?`${label}（人工决定）`:label, text(profile?.[field])||(manual.has(field)?'当前字段为空':'')] as const)
      .filter(([, value]) => value.length > 0);
    if (!fields.length) continue;
    hasProfileContent = true;
    if (lines.length) lines.push('');
    lines.push(group.label);
    for (const [label, value] of fields) lines.push(`${label}：${value}`);
  }

  if (!hasProfileContent) lines.push(brief || '千千结已识别此人物，尚无档案正文。');
  return lines.join('\n');
}

function profileIdentity(profile: Record<string, unknown> | null): string | undefined {
  return [['occupation', '职业'], ['socialIdentity', '身份'], ['organization', '所属组织'], ['identityRelations', '重要关系']]
    .flatMap(([field, label]) => { const value = text(profile?.[field]); return value ? [`${label}：${value}`] : []; })
    .join('\n') || undefined;
}

function result(status: PeopleDirectoryRead['status'], message: string, people: SourcePerson[] = [], scopeId: string | null = null): PeopleDirectoryRead {
  return { status, message, people, scopeId };
}

function failureMessage(value: unknown, fallback: string): string {
  const message = text(record(value)?.message) || text(value instanceof Error ? value.message : '');
  return message ? `${fallback}：${message}` : fallback;
}

export function createQQJPeopleReader({ getGlobals = () => globalThis as typeof globalThis & { qqj_v3_public_bridge_v1?: unknown } } = {}): PeopleDirectoryReader {
  return {
    readPeople(): PeopleDirectoryRead {
      const bridge = record(getGlobals().qqj_v3_public_bridge_v1);
      if (!bridge) return result('unavailable', '尚未启用千千结，或其人物目录接口暂不可用。');
      if (bridge.schemaVersion !== 1 || bridge.kind !== 'qqj-public-memory-bridge' || typeof bridge.getPeopleSnapshot !== 'function') {
        return result('unavailable', '当前千千结版本暂不支持人物目录读取。');
      }

      let snapshot: Record<string, unknown> | null;
      try {
        snapshot = record((bridge.getPeopleSnapshot as () => unknown).call(bridge));
      } catch (error) {
        return result('error', failureMessage(error, '读取千千结人物目录失败'));
      }
      if (!snapshot) return result('error', '千千结人物目录返回的数据无法读取。');
      if (snapshot.status === 'disabled') return result('unavailable', text(snapshot.message) || '千千结当前已关闭，请启用后刷新人物。');
      if (snapshot.status === 'not-ready') return result('waiting', text(snapshot.message) || '千千结尚未准备好当前聊天身份。');
      if (snapshot.status === 'error') return result('error', failureMessage(snapshot, '读取千千结人物目录失败'));
      if (snapshot.status !== 'ready') return result('error', '千千结人物目录返回了无法识别的状态。');

      const identity = record(snapshot.identity);
      const qqjChatId = text(identity?.qqjChatId);
      if (!qqjChatId) return result('error', '无法确认千千结当前聊天身份，未显示人物目录。');
      const peopleSnapshot = record(snapshot.people);
      if (!peopleSnapshot || !Array.isArray(peopleSnapshot.items)) {
        return result('error', '千千结人物目录格式不完整。');
      }

      const people: SourcePerson[] = [];
      let invalidItems = 0;
      for (const value of peopleSnapshot.items) {
        const item = record(value);
        const entityId = text(item?.entityId);
        const profile = projectQQJProfile(record(item?.profile));
        // An explicit public profile owns even its empty fields; a brief must not refill them.
        const briefText = profile ? '' : text(item?.identityBrief);
        const brief = briefText ? `${record(item?.identityBriefSource)?.legacy === false ? '有据身份简介' : '历史身份简介（未记录引文）'}：${briefText}（作者参考，不代表在场或知情）` : '';
        const displayName = text(profile?.name) || text(item?.displayName) || text(item?.entityDisplayName);
        if (!entityId || !displayName) {
          invalidItems += 1;
          continue;
        }
        const id = encodeQQJPersonId(qqjChatId, entityId);
        people.push({
          id,
          qqjPersonId:id,
          displayName,
          aliases: splitAliases(item?.aliases),
          description: profileDescription(profile, displayName, item?.aliases, brief),
          profileMaterialProvided: profile !== null || Boolean(brief),
          ...(Array.isArray(profile?.manualFields)?{manualProfile:Object.fromEntries(profile.manualFields.map(field=>[String(field),text(profile?.[String(field)])]))}:{}),
          identityDescription: profileIdentity(profile) || brief || undefined,
          specialRole: text(item?.specialRole) || undefined,
          identitySummary: [['occupation','职业'],['socialIdentity','身份'],['organization','所属组织']].flatMap(([field,label])=>text(profile?.[field])?[`${label}：${text(profile?.[field])}`]:[]).join('\n')||undefined,
          identityCaption: [['occupation','职业'],['socialIdentity','身份']].flatMap(([field,label])=>text(profile?.[field])?[`${label}：${text(profile?.[field])}`]:[]).join('\n')||undefined,
          presentationSource: {personality:['personality','conduct','expression','likes','dislikes','principles'].flatMap(field=>text(profile?.[field])?[`${field}: ${text(profile?.[field])}`]:[]).join('\n'),relations:text(profile?.identityRelations)},
          source: { kind: 'plugin', id, label: '千千结人物档案' },
        });
      }

      if (invalidItems) return result('error', '部分千千结人物缺少可确认的身份或显示名，未显示这些条目。', people, qqjChatId);
      const peopleStatus = text(peopleSnapshot.status);
      if (peopleStatus === 'error') return result('error', '千千结人物目录读取失败。', people);
      if (people.length) {
        const message = PROCESSING_STATUSES.has(peopleStatus)
          ? '千千结正在处理，当前已加载的人物仍可查看。'
          : '已读取千千结当前已确认的人物目录。';
        return result('ready', message, people, qqjChatId);
      }
      if (peopleStatus === 'ready') return result('empty', '千千结当前没有已确认的人物。', [], qqjChatId);
      if (WAITING_STATUSES.has(peopleStatus) || PROCESSING_STATUSES.has(peopleStatus)) {
        return result('waiting', '千千结人物目录尚未加载；首楼未稳定或尚无识别记录时，这是正常等待状态。', [], qqjChatId);
      }
      return result('error', '千千结人物目录返回了无法识别的状态。');
    },
  };
}
