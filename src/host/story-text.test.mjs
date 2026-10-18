import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';

let server; let cleanAssistantStoryText;
test.before(async () => {
  server = await createServer({ configFile: false, server: { middlewareMode: true, hmr: false }, appType: 'custom' });
  ({ cleanAssistantStoryText } = await server.ssrLoadModule('/src/host/story-text.ts'));
});
test.after(async () => { await server?.close(); });

test('removes complete nested and repeated DRAFT blocks without deleting ordinary prose or unmatched ranges', () => {
  const value = cleanAssistantStoryText('外层初稿审核重写。[DrAfT]内部\n[draft]嵌套[/DRAFT] 继续[/draft]中间。[DRAFT]第二份草稿[/DRAFT]正式后文。[DRAFT]未闭合正文');
  assert.equal(value.text, '外层初稿审核重写。中间。正式后文。[DRAFT]未闭合正文');
  assert.equal(value.hasNarrative, true);
});

test('extracts one clear content body and only its prefix clock fields plus outside standard time comments', () => {
  const raw = '<date>2026-10-17</date><time>18:20</time><weekday>Saturday</weekday><!-- QQJ-start 18:20 --><content>正式正文 <!-- SDC-start 18:20 -->保留的时间说明。<!-- SDC-end 18:21 --> [DRAFT]草稿时间 <date>2099-01-01</date><!-- QQJ-start 2099 -->[/DRAFT]</content><!-- QQJ-end 18:22 --><!-- SDC-start 18:23 --><!-- myknots-end old --><time>23:59</time>外围评论。';
  const result = cleanAssistantStoryText(raw);
  assert.equal(result.hasNarrative, true);
  assert.equal(result.text, '故事时间参考：<date>2026-10-17</date> <time>18:20</time> <weekday>Saturday</weekday> <!-- QQJ-start 18:20 --> <!-- QQJ-end 18:22 --> <!-- SDC-start 18:23 --> <!-- myknots-end old -->\n\n正式正文 <!-- SDC-start 18:20 -->保留的时间说明。<!-- SDC-end 18:21 -->');
  assert.doesNotMatch(result.text, /2099-01-01|23:59|外围评论|草稿时间/);
});

test('ambiguous or missing content wrappers are not guessed and unknown wrappers remain intact', () => {
  const ambiguous = '<content>第一段。</content>作者评论<content>第二段。</content>';
  assert.equal(cleanAssistantStoryText(ambiguous).text, ambiguous);
  const nested = '<content>外层<content>内层</content></content>';
  assert.equal(cleanAssistantStoryText(nested).text, nested);
  assert.equal(cleanAssistantStoryText('<section>普通包裹正文</section> 初稿审核重写').text, '<section>普通包裹正文</section> 初稿审核重写');
});

test('draft content cannot become formal and time-only assistant text has no narrative body', () => {
  const draftOnly = cleanAssistantStoryText('[DRAFT]<content>草稿里的完整结构</content>[/DRAFT]');
  assert.equal(draftOnly.text, '');
  assert.equal(draftOnly.hasNarrative, false);
  const metadataOnly = cleanAssistantStoryText('<content><date>2026-10-17</date><!-- QQJ-start 18:20 --><!-- QQJ-end 18:21 --></content>');
  assert.equal(metadataOnly.hasNarrative, false);
  const refs = cleanAssistantStoryText('<date>2026-10-17</date><!-- QQJ-start 18:20 --><!-- QQJ-end 18:21 -->');
  assert.equal(refs.text, '<date>2026-10-17</date><!-- QQJ-start 18:20 --><!-- QQJ-end 18:21 -->');
  assert.equal(refs.hasNarrative, false);
  const timeWrapper = '<PreStatus><date>2026-10-17</date><time>18:20</time></PreStatus>';
  assert.equal(cleanAssistantStoryText(timeWrapper).hasNarrative, false);
});
