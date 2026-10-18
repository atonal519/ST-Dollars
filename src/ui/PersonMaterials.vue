<script setup lang="ts">
import { onMounted, ref } from 'vue';
import type { QuestionMaterial, QuestionMaterialReader, QuestionMaterialRead } from '../application/contracts';

const props = defineProps<{ reader: QuestionMaterialReader; personId: string }>();
const loading = ref(false);
const message = ref('正在读取此人物的当前状态和相关经历。');
const material = ref<QuestionMaterial | null>(null);
const coverage = ref<QuestionMaterialRead['coverage']>({ partial: false, cseStatus: 'not-ready' });

async function refresh() {
  if (loading.value) return;
  loading.value = true;
  message.value = '正在读取此人物的当前状态和相关经历。';
  try {
    const result = await props.reader.readForQuestion({ question: '', personIds: [props.personId], maxCharacters: 12000 });
    material.value = result.materials.find(item => item.personId === props.personId) ?? null;
    coverage.value = result.coverage;
    message.value = result.message;
  } catch (error) {
    material.value = null;
    message.value = error instanceof Error && error.message.trim()
      ? `读取此人物的相关资料失败：${error.message}`
      : '读取此人物的相关资料失败，请手动刷新。';
  } finally {
    loading.value = false;
  }
}

onMounted(refresh);
</script>

<template>
  <section class="person-materials" aria-label="千千结当前状态和相关经历">
    <div class="materials-heading">
      <h3>当前状态与相关经历</h3>
      <button type="button" :disabled="loading" @click="refresh">{{ loading ? '读取中…' : '刷新相关资料' }}</button>
    </div>
    <p class="materials-guidance">这是玩家查看的资料，不代表故事人物因此互相知情。</p>
    <p role="status">{{ message }}</p>
    <template v-if="material">
      <template v-if="material.stateText">
        <h4>当前状态</h4>
        <p class="material-text">{{ material.stateText }}</p>
      </template>
      <template v-if="material.memoryText">
        <h4>相关经历</h4>
        <p class="material-text">{{ material.memoryText }}</p>
      </template>
      <p v-if="coverage.partial" class="materials-note">千千结提示：本次预算只包含部分相关资料。</p>
      <template v-if="material.sources.length">
        <h4>经历来源</h4>
        <p v-for="source in material.sources" :key="source.id">{{ source.label }}</p>
      </template>
    </template>
  </section>
</template>
