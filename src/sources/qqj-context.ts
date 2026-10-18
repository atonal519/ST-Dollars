import type { QuestionMaterialRead, QuestionMaterialReader, QuestionMaterialRef, QuestionMaterialRequest } from '../application/contracts';
import type { SourceRef } from '../domain/world';
import { decodeQQJPersonId } from './qqj-person-id';
export { encodeQQJPersonId } from './qqj-person-id';

interface PublicBridge {
  schemaVersion: number;
  kind: string;
  readContext(request: { query: string; entityIds: string[]; maxCharacters: number }): Promise<unknown>;
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function cleanText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function result(
  status: QuestionMaterialRead['status'],
  message: string,
  extras: Partial<Pick<QuestionMaterialRead, 'routerText' | 'materials' | 'coverage'>> = {},
): QuestionMaterialRead {
  return { status, message, routerText: '', materials: [], coverage: { partial: false, cseStatus: 'not-ready' }, ...extras };
}

function sourceRefs(value: unknown, qqjChatId: string): SourceRef[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap(refValue => {
    const ref = record(refValue);
    const memoryId = cleanText(ref?.memoryId);
    if (!memoryId) return [];
    const floorIds = Array.isArray(ref?.floorIds) ? ref.floorIds.filter((id): id is string => typeof id === 'string' && id.length > 0) : [];
    return [{
      kind: 'plugin' as const,
      id: `qqj-context:${JSON.stringify([qqjChatId, memoryId])}`,
      label: floorIds.length ? `千千结相关经历（${floorIds.length} 个来源楼）` : '千千结相关经历',
    }];
  });
}

function materialRefs(value: unknown): QuestionMaterialRef[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap(refValue => {
    const ref = record(refValue);
    const memoryId = cleanText(ref?.memoryId);
    if (!memoryId) return [];
    const floorIds = Array.isArray(ref?.floorIds) ? ref.floorIds.filter((id): id is string => typeof id === 'string' && id.length > 0) : [];
    return [{ memoryId, floorIds }];
  });
}

function errorMessage(value: unknown, fallback: string): string {
  return cleanText(record(value)?.message) || fallback;
}

export function createQQJQuestionMaterialReader({
  getGlobals = () => globalThis as typeof globalThis & { qqj_v3_public_bridge_v1?: unknown },
}: { getGlobals?: () => { qqj_v3_public_bridge_v1?: unknown } } = {}): QuestionMaterialReader {
  return {
    async readForQuestion(request: QuestionMaterialRequest): Promise<QuestionMaterialRead> {
      const decoded = request.personIds.map(decodeQQJPersonId);
      if (decoded.some(identity => identity === null)) {
        return result('error', '部分人物资料来源身份无法确认，未读取这些资料。');
      }
      const identities = decoded.filter((identity): identity is NonNullable<typeof identity> => identity !== null);
      const unique = [...new Map(identities.map(identity => [JSON.stringify([identity.qqjChatId, identity.entityId]), identity])).values()];
      if (unique.length > 100) return result('error', '一次最多读取100人的相关资料，请缩小本次人物范围。');
      if (!unique.length) return result('empty', '尚未选择要读取资料的人物。');
      const qqjChatId = unique[0].qqjChatId;
      if (unique.some(identity => identity.qqjChatId !== qqjChatId)) {
        return result('error', '所选人物来自不同的千千结聊天，无法在同一次资料读取中确认归属。');
      }

      const bridge = record(getGlobals().qqj_v3_public_bridge_v1) as unknown as PublicBridge | null;
      if (!bridge || bridge.schemaVersion !== 1 || bridge.kind !== 'qqj-public-memory-bridge' || typeof bridge.readContext !== 'function') {
        return result('unavailable', '当前千千结版本暂不支持按需读取人物状态和经历。');
      }

      let response: Record<string, unknown> | null;
      try {
        response = record(await bridge.readContext({
          query: typeof request.question === 'string' ? request.question : '',
          entityIds: unique.map(identity => identity.entityId),
          maxCharacters: request.maxCharacters,
        }));
      } catch (error) {
        return result('error', errorMessage(error, '读取千千结人物状态和经历失败。'));
      }
      if (!response) return result('error', '千千结人物资料返回的数据无法读取。');
      const status = cleanText(response.status);
      if (status === 'disabled' || status === 'unavailable') return result('unavailable', cleanText(response.message) || '千千结当前不可读取人物资料。');
      if (status === 'not-ready') return result('waiting', cleanText(response.message) || '千千结人物资料尚未准备好，请稍后再试。');
      if (status === 'error') return result('error', errorMessage(response, '读取千千结人物状态和经历失败。'));
      if (status !== 'ready') return result('error', '千千结人物资料返回了无法识别的状态。');

      const identity = record(response.identity);
      if (cleanText(identity?.qqjChatId) !== qqjChatId) return result('error', '千千结返回了无法确认聊天归属的人物资料。');
      if (!Array.isArray(response.actors)) return result('error', '千千结人物资料缺少人物归属信息。');

      const requested = new Map(unique.map(item => [item.entityId, item]));
      const actors = new Map<string, Record<string, unknown>>();
      const ambiguousIds = new Set<string>();
      for (const value of response.actors) {
        const actor = record(value);
        const entityId = cleanText(actor?.entityId);
        if (!actor || !entityId || !requested.has(entityId)) continue;
        if (ambiguousIds.has(entityId)) continue;
        if (actors.has(entityId)) {
          ambiguousIds.add(entityId);
          actors.delete(entityId);
          continue;
        }
        actors.set(entityId, actor);
      }
      const materials = unique.flatMap(person => {
        const actor = actors.get(person.entityId);
        if (!actor) return [];
        // Keep QQJ's per-person boundary intact; routerText is never assigned as actor knowledge.
        return [{
          personId: `qqj:${JSON.stringify([person.qqjChatId, person.entityId])}`,
          profileText: cleanText(actor.profileText),
          stateText: cleanText(actor.stateText),
          memoryText: cleanText(actor.memoryText),
          refs: materialRefs(actor.refs),
          sources: sourceRefs(actor.refs, qqjChatId),
        }];
      });
      const missing = unique.filter(person => !actors.has(person.entityId)).map(person => person.entityId);
      const coverage = record(response.coverage);
      const partial = coverage?.partial === true || missing.length > 0 || ambiguousIds.size > 0;
      const cseStatus = cleanText(coverage?.cseStatus) || 'not-ready';
      const hasActorText = materials.some(item => item.profileText || item.stateText || item.memoryText);
      const hasPersonalStateOrMemory = materials.some(item => item.stateText || item.memoryText);
      const messages = [];
      if (missing.length) messages.push('部分所选人物没有返回可确认的资料，未按姓名猜测归属。');
      if (ambiguousIds.size) messages.push('部分人物资料重复且归属不明确，已略过重复项。');
      if (cseStatus !== 'ready') messages.push('千千结状态资料尚未准备好；本次仍显示已返回的其他资料。');
      if (coverage?.partial === true) messages.push('千千结按资料预算省略了部分内容。');
      if (!hasPersonalStateOrMemory) {
        if (hasActorText) messages.push('本次有档案资料，但没有可读取的当前状态或相关经历。');
        else if (cleanText(response.routerText)) messages.push('已读取作者侧背景，但没有返回所选人物的状态或相关经历。');
        else messages.push('当前没有可读取的状态或相关经历。');
      }
      return result(hasActorText || cleanText(response.routerText) ? 'ready' : 'empty', messages.join(' ') || '已读取所选人物的相关资料。', {
        routerText: cleanText(response.routerText),
        materials,
        coverage: { partial, cseStatus },
      });
    },
  };
}
