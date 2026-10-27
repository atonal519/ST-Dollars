import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';

test('corrected event is not objective while an actual received report remains known as a report', async () => {
  const server = await createServer({ configFile: false, server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom' });
  try {
    const { isEffectiveEvent, classifyKnowledge } = await server.ssrLoadModule('/src/domain/world-facts.ts');
    const event = { id: 'old', correction: { byEventId: 'new', reason: '正文明确修正' } };
    assert.equal(isEffectiveEvent(event), false);
    assert.equal(classifyKnowledge({ eventId: 'old', correction: { byEventId: 'new', treatment: 'retained-report', reason: '确实收到了消息' } }, event), 'retained-report');
    assert.equal(classifyKnowledge({ eventId: 'old' }, event), 'invalidated');
    assert.equal(classifyKnowledge({ eventId: 'new' }, { id: 'new' }), 'fact');
  } finally { await server.close(); }
});
