<script setup lang="ts">
import { computed, ref } from 'vue';
import type { HistoryIntakeView, TrajectoryView } from '../application/contracts';
import type { WorldSnapshot } from '../domain/world';
import { historyRequestCounts, trajectoryRequestCounts } from './request-counts';

const props = defineProps<{ view: HistoryIntakeView; trajectoryView?: TrajectoryView; world: WorldSnapshot; busy: boolean; enabled: boolean }>();
const emit = defineEmits<{ (event: 'check', fromSeq: number, batchCharacters: 12000 | 24000 | 48000): void; (event: 'start'): void; (event: 'cancel'): void; (event: 'confirm'): void; (event: 'discard'): void; (event: 'trajectory-check', fromSeq: number, toSeq?: number): void; (event: 'trajectory-reload', fromSeq: number, toSeq?: number): void; (event: 'trajectory-save'): void; (event: 'trajectory-start'): void; (event: 'trajectory-cancel'): void; (event: 'trajectory-discard'): void }>();
const fromSeq = ref(0);
const toSeq = ref<number | ''>('');
const endSeq = computed(() => toSeq.value === '' ? undefined : Number(toSeq.value) + 1);
const batchCharacters = 24000 as const;
const trajectoryLocked = computed(() => ['preparing', 'running'].includes(props.trajectoryView?.status ?? ''));
const trajectoryMatches = computed(() => props.trajectoryView?.check?.fromSeq === fromSeq.value + 1 && endSeq.value === props.trajectoryView?.check?.requestedToSeq);
const locked = computed(() => trajectoryLocked.value || props.view.canContinue || ['collecting', 'preview'].includes(props.view.status));
const matchesCheck = computed(() => fromSeq.value + 1 === props.view.fromSeq && batchCharacters === props.view.batchCharacters);
const bodyCounts = computed(() => historyRequestCounts(props.view, props.busy));
const behindCounts = computed(() => props.trajectoryView ? trajectoryRequestCounts(props.trajectoryView) : null);
</script>

<template>
  <section class="bmx-history-intake" aria-label="接续管理">
    <div class="bmx-history-body">
      <h3>整理正文事实</h3>
      <label>起始楼<input v-model.number="fromSeq" type="number" min="0" step="1" inputmode="numeric" :disabled="!enabled || locked"></label>
      <p>预计总次数：{{ bodyCounts.total }}</p>
      <p role="status">当前请求：{{ bodyCounts.current }}</p>
      <p>预计还需：{{ bodyCounts.remaining }}</p>
      <button type="button" :disabled="!enabled || busy || locked" @click="emit('check', fromSeq + 1, batchCharacters)">检查范围</button>
      <p v-if="view.status === 'checked' && !matchesCheck" role="status">起始楼已更改，请重新检查。</p>
      <p v-if="view.status === 'checked' && !view.batches">没有需要整理的正文。</p>
      <p v-if="view.error" role="alert">{{ view.error }}</p>
      <p v-else-if="view.status === 'error' && !view.canContinue && view.message" role="alert">{{ view.message }}</p>
      <button v-if="view.status === 'checked' && view.batches" type="button" :disabled="!enabled || busy || !matchesCheck" @click="emit('start')">开始整理</button>
      <button v-if="view.canContinue && ['error', 'cancelled'].includes(view.status)" type="button" :disabled="!enabled || busy" @click="emit('start')">继续整理</button>
      <button v-if="view.status === 'collecting'" type="button" @click="emit('cancel')">取消后续批次</button>
      <template v-if="view.status === 'preview' && view.candidate">
        <button type="button" :disabled="!enabled || busy" @click="emit('confirm')">确认接入</button>
        <button type="button" :disabled="busy" @click="emit('discard')">放弃草稿</button>
      </template>
      <button v-if="view.canContinue && ['error', 'cancelled'].includes(view.status)" type="button" :disabled="busy" @click="emit('discard')">放弃本次整理</button>
      <p v-if="view.status === 'saved'" role="status">已保存。</p>
      <section v-if="trajectoryView && behindCounts" class="bmx-trajectory" aria-label="补写幕后经历">
        <h3>补写幕后经历</h3>
        <p>预计总次数：{{ behindCounts.total }}</p>
        <p role="status">当前请求：{{ behindCounts.current }}</p>
        <p>预计还需：{{ behindCounts.remaining }}</p>
        <label>结束楼（留空到最新）<input v-model.number="toSeq" type="number" :min="fromSeq" step="1" inputmode="numeric" :disabled="!enabled || busy"></label>
        <button type="button" :disabled="!enabled || busy || trajectoryLocked || view.canContinue || view.status === 'preview'" @click="emit('trajectory-check', fromSeq + 1, endSeq)">检查幕后范围</button>
        <p v-if="trajectoryView.check && !trajectoryView.check.canPrepare">{{ trajectoryView.check.missingHistoryRanges.length ? '请先整理正文事实并确认保存。' : trajectoryView.check.message }}</p>
        <p v-if="trajectoryView.status === 'checked' && !trajectoryView.check && trajectoryView.message" role="alert">{{ trajectoryView.message }}</p>
        <p v-if="trajectoryView.check && trajectoryView.check.canPrepare">第 {{ trajectoryView.check.fromSeq - 1 }}—{{ (trajectoryView.check.throughSeq ?? 1) - 1 }} 楼；本次结果整批保存，保留已有记录。</p>
        <p v-if="trajectoryView.check && !trajectoryMatches">范围已更改，请重新检查。</p>
        <button v-if="['checked', 'ready'].includes(trajectoryView.status) && trajectoryView.check?.canPrepare" type="button" :disabled="!enabled || busy || !trajectoryMatches" @click="emit('trajectory-start')">{{ trajectoryView.completed ? '继续补写未完成部分' : trajectoryView.check.isRework ? '重新补写所选范围（保留已有记录）' : '开始补写（整批保存）' }}</button>
        <button v-if="trajectoryView.status === 'running'" type="button" @click="emit('trajectory-cancel')">{{ trajectoryView.progress?.stage === 'save' ? '保存后停止' : '停止补写' }}</button>
        <p v-if="trajectoryView.status === 'stopped'" role="status">已停止。</p>
        <p v-if="trajectoryView.status === 'checked' && trajectoryView.completed" role="status">{{ trajectoryView.message }}</p>
        <p v-if="trajectoryView.status === 'saved'" role="status">{{ trajectoryView.message || '已保存。' }}</p>
        <p v-if="trajectoryView.error" role="alert">{{ trajectoryView.error }}</p>
        <template v-if="['error', 'stopped'].includes(trajectoryView.status)">
          <button v-if="trajectoryView.canSave" type="button" :disabled="!enabled || busy || !trajectoryMatches" @click="emit('trajectory-save')">重新保存</button>
          <button v-else-if="trajectoryView.conflict" type="button" :disabled="!enabled || busy" @click="emit('trajectory-reload', fromSeq + 1, endSeq)">重新读取并检查</button>
          <button v-else-if="trajectoryView.check?.canPrepare && trajectoryMatches" type="button" :disabled="!enabled || busy" @click="emit('trajectory-start')">{{ trajectoryView.completed ? '继续补写未完成部分' : '重新生成' }}</button>
          <button v-else type="button" :disabled="!enabled || busy" @click="emit('trajectory-check', fromSeq + 1, endSeq)">重新检查幕后范围</button>
        </template>
        <button v-if="['ready', 'stopped', 'error'].includes(trajectoryView.status)" type="button" :disabled="busy" @click="emit('trajectory-discard')">放弃本次结果</button>
      </section>
    </div>
  </section>
</template>
