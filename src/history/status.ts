import type { HistoryIntakeView } from '../application/contracts';

type HistoryStatusInput = Pick<HistoryIntakeView, 'status' | 'stage' | 'currentBatch' | 'batches' | 'progress' | 'modelCalls' | 'canContinue' | 'error' | 'message'>;

export function historyBlocksAdvance(view: Pick<HistoryIntakeView, 'status' | 'canContinue'>): boolean {
  return view.status === 'collecting' || view.status === 'preview' || ((view.status === 'error' || view.status === 'cancelled') && view.canContinue === true);
}

export function historyStatusText(view: HistoryStatusInput): string {
  if (view.status === 'collecting') {
    if (view.stage === 'materials') return '历史接续：正在读取人物资料。';
    if (view.currentBatch) return `历史接续：正在等待第 ${view.currentBatch}/${view.batches} 批返回；已完成 ${view.progress} 批，已发出 ${view.modelCalls} 次请求。`;
    return `历史接续：已完成 ${view.progress}/${view.batches} 批，正在整理结果。`;
  }
  if (view.status === 'error') return view.canContinue
    ? view.progress > 0
      ? `历史接续：失败，${view.progress}/${view.batches} 批完成，草稿保留，可继续或放弃。`
      : '历史接续：失败，尚未完成任何批，可手动重试或放弃；正式记录未改。'
    : `历史接续：检查失败。${view.error || view.message || '请查看接续管理页面。'}`;
  if (view.status === 'cancelled') return view.canContinue && view.progress === 0
    ? '历史接续：已取消，尚未完成任何批，可手动重试或放弃；正式记录未改。'
    : `历史接续：已取消，${view.progress}/${view.batches} 批完成，草稿保留，可继续或放弃。`;
  if (view.status === 'preview') return view.error ? '历史接续：保存失败，候选仍待确认。' : '历史接续：整理完成，等待预览确认。';
  if (view.status === 'saved') return '历史接续：已保存。';
  if (view.status === 'checked') return view.batches ? `历史接续：范围已检查，共 ${view.batches} 批，等待开始。` : '历史接续：范围已检查，无需整理。';
  return '';
}
