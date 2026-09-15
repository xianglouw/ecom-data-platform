import { createApp } from 'vue';
import { createPinia } from 'pinia';
import ElementPlus from 'element-plus';
import zhCn from 'element-plus/es/locale/lang/zh-cn';
import * as Icons from '@element-plus/icons-vue';
import 'element-plus/dist/index.css';
import './styles/index.css';

import App from './App.vue';
import router from './router';

const app = createApp(App);
app.use(createPinia());
app.use(ElementPlus, { locale: zhCn });
for (const [key, comp] of Object.entries(Icons)) app.component(key, comp);
app.use(router);
app.mount('#app');
