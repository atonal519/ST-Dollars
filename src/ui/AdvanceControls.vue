<script setup lang="ts">
import type { AdvanceDiagnostics, AdvanceReport } from '../application/contracts';

defineProps<{ storyTime: string; processedThroughSeq: number | null; started: boolean; busy: boolean; busyLabel: string; historyStatus: string; enabled: boolean; report: AdvanceReport | null; diagnostics: AdvanceDiagnostics | null; error: string }>();
const emit = defineEmits<{ advance: []; history: [] }>();
function exportDiagnostics(value: AdvanceDiagnostics) {
  const file = new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(file); const link = document.createElement('a');
  link.href = url; link.download = 'dollars-advance-summary.json'; link.click(); URL.revokeObjectURL(url);
}
</script>

<template>
  <section class="bmx-advance-controls" aria-label="剧情推进">
    <button class="bmx-advance-button" type="button" :disabled="busy || !enabled" @click="emit('advance')">{{ busy ? busyLabel : started ? '推进到当前剧情' : '启动人物活动' }}</button>
    <p v-if="!started" class="bmx-history-note">截至当前剧情时点启动一轮人物活动，不会自动推进时间；补写过去请进入接续管理。</p>
    <button class="bmx-text-button" type="button" @click="emit('history')">接续管理</button>
    <p v-if="historyStatus" class="bmx-history-note" role="status">{{ historyStatus }}</p>
    <p v-if="!enabled" role="status">百面相已关闭，请先在设置中启用。</p>
    <p v-if="report" class="bmx-advance-message" role="status">{{ report.message }}</p>
    <p v-if="error" class="bmx-advance-error" role="alert">{{ error }}</p>
    <details v-if="diagnostics" class="bmx-advance-diagnostics">
      <summary>本次运行信息</summary>
      <p>阶段：{{ diagnostics.stage }}；模型请求 {{ diagnostics.modelCalls }} 次；资料读取 {{ diagnostics.materialReads }} 次；用时 {{ diagnostics.elapsedMs }} 毫秒。</p>
      <button type="button" @click="exportDiagnostics(diagnostics)">导出本次摘要</button>
    </details>
  </section>
</template>
