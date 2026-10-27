import type { WorldRepository } from '../application/contracts';
import type { NpcWorldState } from '../domain/world-state';
import { createEmptyState } from '../domain/world-state';
import { createBainiaoClient } from './bainiao-client';

export function createWorldRepository(client = createBainiaoClient()): WorldRepository {
  const collection = (scopeId: string) => `npc-world-${scopeId}`;
  const recordId = 'world';
  return {
    async load(scopeId) {
      const envelope = await client.get(collection(scopeId), recordId) as { data?: unknown; revision?: unknown } | null;
      if (!envelope) return null;
      if (!Number.isInteger(envelope.revision) || !envelope.data || typeof envelope.data !== 'object') throw new Error('百面相世界记录格式无法读取。');
      const state = envelope.data as NpcWorldState;
      if (state.schemaVersion !== 1 || state.scopeId !== scopeId || !Array.isArray(state.activities) || !Array.isArray(state.events) || !Array.isArray(state.knowledge)) throw new Error('百面相世界记录与当前聊天不匹配。');
      if(state.foundation&&(!Array.isArray(state.foundation.people)||!Array.isArray(state.foundation.groups)||!Array.isArray(state.foundation.relations)))throw new Error('百面相世界基础资料格式无法读取。');
      return { state, revision: Number(envelope.revision) };
    },
    async save(scopeId, state, expectedRevision, diagnostic) {
      if (state.scopeId !== scopeId) throw new Error('百面相世界记录与当前聊天不匹配。');
      const saved = await client.put(collection(scopeId), recordId, state, expectedRevision ?? 0, diagnostic) as { data?: unknown; revision?: unknown };
      return { state: (saved.data && typeof saved.data === 'object' ? saved.data : state) as NpcWorldState, revision: Number(saved.revision ?? ((expectedRevision ?? -1) + 1)) };
    },
  };
}
