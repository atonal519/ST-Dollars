<script setup lang="ts">
import {computed} from 'vue';
import type {ControllerState} from '../application/contracts';
import type {DevelopmentView} from '../application/development';
const props=defineProps<{state:ControllerState;development?:DevelopmentView;enabled?:boolean;compact?:boolean;actionTarget?:HTMLElement|null}>();
// Derive this line from the saved world and the existing in-page operation view.
const flowStatus=computed(()=>{
  const {state,development:view}=props;
  const paused=(message:string)=>({attention:true,message:`自动流转已暂停：${message}`});
  const error=state.error||(['error','unavailable'].includes(state.source.status)?state.source.message||'人物资料暂不可用，请重新读取。':'');
  if(error)return paused(error);
  if(props.enabled===false)return paused('百面相已关闭，请在设置中启用。');
  if(!state.busy){
    if(view?.canSave)return paused(view.error||'本轮结果尚未保存，请重新保存。');
    if(view?.needsReload)return paused(view.error||'请重新读取后继续。');
    if(view?.error||view?.status==='error')return paused(view.error||'本轮更新失败，请点击「百相流转」重试。');
    if(view?.status==='stopped')return paused(view.message||'已停止，请点击「百相流转」继续。');
  }
  const message=state.busy?(view?.saving?'正在保存世界更新。':view?.message||'正在读取本轮资料。')
    :view?.status==='waiting'&&view.message?view.message
    :view?.started?'自动流转已启用，等待新的稳定剧情。'
    :state.world.foundation?'世界已构建，请点击「百相流转」启用自动更新。'
    :'自动流转尚未启用，请点击「百相流转」开始。';
  return{attention:false,message};
});
const emit=defineEmits<{construct:[];start:[];stop:[];save:[];reload:[]}>();
</script>
<template>
    <section v-if="development" class="bmx-development-controls" aria-label="人物发展">
      <p class="bmx-world-status" :class="{attention:flowStatus.attention}" :role="flowStatus.attention?'alert':'status'">{{ flowStatus.message }}</p>
      <template v-if="state.busy">
        <p>预计总次数：{{ development.totalCalls }} · 当前：{{ development.modelCalls ? `第${development.modelCalls}次` : '未发出' }} · 预计剩余：{{ development.remainingCalls }}</p>
        <button type="button" @click="emit('stop')">{{ development.saving ? '停止后续更新' : '停止' }}</button>
      </template>
      <template v-else>
        <p v-if="development.modelCalls">本次请求：{{ development.modelCalls }} 次</p>
        <button v-if="development.canSave" type="button" @click="emit('save')">重新保存</button>
        <button v-else-if="development.needsReload" type="button" @click="emit('reload')">重新读取</button>
        <template v-else>
          <div class="bmx-world-actions"><button type="button" :disabled="enabled === false" @click="emit('construct')">世界构建</button><button type="button" :disabled="enabled === false" @click="emit('start')">百相流转</button></div>
          <p class="bmx-world-hint">世界构建整理人物与稳定社交基础，保留已有经历；首次流转会自动建底，随后承接剧情发展。</p>
        </template>
      </template>
    </section>

</template>
