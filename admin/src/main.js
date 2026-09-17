import { createApp } from 'vue';
import { createPinia } from 'pinia';
import ElementPlus from 'element-plus';
import zhCn from 'element-plus/es/locale/lang/zh-cn';
import * as Icons from '@element-plus/icons-vue';
import 'element-plus/dist/index.css';
// 官方深色变量表：为表格 / 弹窗 / 下拉等组件提供一整套深色基线，
// 随后由 styles/index.css 覆写为本项目 TikTok 霓虹配色（顺序不可颠倒）
import 'element-plus/theme-chalk/dark/css-vars.css';
import './styles/index.css';

import App from './App.vue';
import router from './router';

const app = createApp(App);
app.use(createPinia());
app.use(ElementPlus, { locale: zhCn });
for (const [key, comp] of Object.entries(Icons)) app.component(key, comp);
app.use(router);
app.mount('#app');
