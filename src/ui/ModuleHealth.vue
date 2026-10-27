<script setup lang="ts">
import {computed} from 'vue';
import type {ControllerState} from '../application/contracts';
import type {DevelopmentView} from '../application/development';
const props=withDefaults(defineProps<{state:ControllerState;development?:DevelopmentView;readyLabel?:string}>(),{readyLabel:'人物资料已载入'});
const error=computed(()=>props.state.error||(['error','unavailable'].includes(props.state.source.status)?props.state.source.message:''));
const healthy=computed(()=>props.state.source.status==='ready'&&props.state.world.people.length&&!props.state.busy&&!error.value&&!props.development?.error&&!props.development?.canSave&&!props.development?.needsReload&&props.development?.status!=='waiting');
const message=computed(()=>error.value||(props.development?.canSave?'有更新尚未保存。':props.development?.error?'更新失败。':props.development?.needsReload?'需重新读取人物资料。':props.state.busy?'人物更新进行中':props.development?.status==='waiting'?props.development.message:props.state.source.status==='ready'&&props.state.world.people.length?props.readyLabel:props.state.source.message||'暂无人物资料。'));
</script>
<template><p class="bmx-page-health" :class="{healthy}" :role="error||(development?.error&&!development?.canSave)?'alert':'status'">{{ message }}</p></template>
