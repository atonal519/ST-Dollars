import { reactive } from 'vue';

// 全局响应式单例：面板显示的状态。Task 5 把连通/版本结果写进 store.status，App 自动刷新。
export const store = reactive({
  status: '初始化…',
});
