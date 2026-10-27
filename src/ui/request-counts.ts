import type { HistoryIntakeView, TrajectoryView } from '../application/contracts';

const range = (from: number, to = from) => from === to ? `${from} 次` : `${from}—${to} 次`;
function current(calls: number, status: string, waiting = false, saving = false): string {
  if (!calls) return '尚未开始';
  if (saving) return `第 ${calls} 次已返回，正在保存`;
  if (waiting) return `第 ${calls} 次，等待返回`;
  if (['error', 'stopped', 'cancelled'].includes(status)) return `第 ${calls} 次`;
  return `第 ${calls} 次已返回`;
}

export function historyRequestCounts(view: HistoryIntakeView, busy = false) {
  const inFlightBatch = view.status === 'collecting' && view.currentBatch !== undefined;
  const remaining = ['preview', 'saved'].includes(view.status) ? 0 : Math.max(0, view.batches - view.progress - (inFlightBatch ? 1 : 0));
  return {
    total: range(view.modelCalls + remaining),
    current: current(view.modelCalls, view.status, view.status === 'collecting' && view.stage === 'request', view.status === 'preview' && busy),
    remaining: range(remaining),
  };
}

export function trajectoryRequestCounts(view: TrajectoryView) {
  const calls = view.modelCalls;
  const saving = view.status === 'running' && view.progress?.stage === 'save';
  const label = current(calls, saving ? 'returned' : view.status, !!view.requestPending, saving);
  if (!view.check && view.status === 'idle') return { total: '待确定', current: label, remaining: '待确定' };
  const remaining = view.status === 'saved' || view.canSave || view.conflict || saving || view.requestPending ? 0 : view.check?.canPrepare ? 1 : 0;
  return { total: range(calls + remaining), current: label, remaining: range(remaining) };
}
