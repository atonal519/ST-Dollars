<script setup lang="ts">
import type { AdvanceDiagnostics, AdvanceReport } from '../application/contracts';

defineProps<{ storyTime: string; processedThroughSeq: number | null; busy: boolean; report: AdvanceReport | null; diagnostics: AdvanceDiagnostics | null; error: string }>();
const emit = defineEmits<{ advance: [] }>();
function exportDiagnostics(value: AdvanceDiagnostics) {
  const file = new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(file); const link = document.createElement('a');
  link.href = url; link.download = 'dollars-advance-summary.json'; link.click(); URL.revokeObjectURL(url);
}
</script>

<template>
  <section class="bmx-advance-controls" aria-label="剧情推进">
    <button class="bmx-advance-button" type="button" :disabled="busy" @click="emit('advance')">{{ busy ? '正在推进…' : '推进到当前剧情' }}</button>
    <p v-if="report" class="bmx-advance-message" role="status">{{ report.message }}</p>
    <p v-if="error" class="bmx-advance-error" role="alert">{{ error }}</p>
    <details v-if="diagnostics" class="bmx-advance-diagnostics">
      <summary>本次运行信息</summary>
      <p>阶段：{{ diagnostics.stage }}；模型请求 {{ diagnostics.modelCalls }} 次；资料读取 {{ diagnostics.materialReads }} 次；用时 {{ diagnostics.elapsedMs }} 毫秒。</p>
      <button type="button" @click="exportDiagnostics(diagnostics)">导出本次摘要</button>
    </details>
  </section>
</template>
