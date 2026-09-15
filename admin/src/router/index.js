import { createRouter, createWebHashHistory } from 'vue-router';
import Layout from '../layout/index.vue';

export const menuTree = [
  { path: '/dashboard', name: '运营看板', icon: 'DataLine', meta: { title: '运营看板' } },
  {
    path: '/mall', name: '商城管理', icon: 'Shop',
    children: [
      { path: '/product', name: '商品管理', icon: 'Goods', meta: { title: '商品管理' } },
      { path: '/order', name: '订单管理', icon: 'Tickets', meta: { title: '订单管理' } },
      { path: '/order/finance', name: '订单财务', icon: 'Money', meta: { title: '订单财务' } },
      { path: '/member', name: '会员管理', icon: 'User', meta: { title: '会员管理' } },
    ],
  },
  {
    path: '/ops', name: '运营分析', icon: 'TrendCharts',
    children: [
      { path: '/ops/sales', name: '销售明细', icon: 'Document', meta: { title: '销售明细' } },
      { path: '/ops/inventory', name: '库存管理', icon: 'Box', meta: { title: '库存管理' } },
      { path: '/ops/ads', name: '广告投放', icon: 'Promotion', meta: { title: '广告投放' } },
      { path: '/ops/selection', name: '选品测算', icon: 'Coin', meta: { title: '选品测算' } },
      { path: '/ops/review', name: '复盘周报', icon: 'Calendar', meta: { title: '复盘周报' } },
    ],
  },
  {
    path: '/data', name: '数据中心', icon: 'Coin',
    children: [
      { path: '/data/analysis', name: '表分析', icon: 'PieChart', meta: { title: '表分析' } },
      { path: '/data/pipeline', name: '数据管道', icon: 'Connection', meta: { title: '数据管道' } },
      { path: '/data/upload', name: '数据上传', icon: 'Upload', meta: { title: '数据上传' } },
      { path: '/data/quarantine', name: '隔离行', icon: 'WarnTriangleFilled', meta: { title: '隔离行' } },
    ],
  },
  {
    path: '/sys', name: '系统管理', icon: 'Setting',
    children: [
      { path: '/sys/user', name: '用户与角色', icon: 'Avatar', meta: { title: '用户与角色' } },
      { path: '/sys/setting', name: '系统设置', icon: 'Tools', meta: { title: '系统设置' } },
    ],
  },
];

const routes = [
  { path: '/login', component: () => import('../views/Login.vue'), meta: { public: true } },
  { path: '/ops/product/:sku', component: () => import('../views/ops/ProductDetail.vue'), meta: { title: '商品详情' } },
  {
    path: '/',
    component: Layout,
    redirect: '/dashboard',
    children: [
      { path: 'dashboard', component: () => import('../views/Dashboard.vue'), meta: { title: '运营看板' } },
      { path: 'product', component: () => import('../views/mall/ProductList.vue'), meta: { title: '商品管理' } },
      { path: 'order', component: () => import('../views/mall/OrderList.vue'), meta: { title: '订单管理' } },
      { path: 'order/finance', component: () => import('../views/order/Finance.vue'), meta: { title: '订单财务' } },
      { path: 'member', component: () => import('../views/mall/MemberList.vue'), meta: { title: '会员管理' } },
      { path: 'ops/sales', component: () => import('../views/ops/SalesList.vue'), meta: { title: '销售明细' } },
      { path: 'ops/inventory', component: () => import('../views/ops/Inventory.vue'), meta: { title: '库存管理' } },
      { path: 'ops/ads', component: () => import('../views/ops/AdsList.vue'), meta: { title: '广告投放' } },
      { path: 'ops/selection', component: () => import('../views/ops/Selection.vue'), meta: { title: '选品测算' } },
      { path: 'ops/review', component: () => import('../views/ops/Review.vue'), meta: { title: '复盘周报' } },
      { path: 'data/analysis', component: () => import('../views/data/Analysis.vue'), meta: { title: '表分析' } },
      { path: 'data/pipeline', component: () => import('../views/data/Pipeline.vue'), meta: { title: '数据管道' } },
      { path: 'data/upload', component: () => import('../views/data/Upload.vue'), meta: { title: '数据上传' } },      { path: 'data/quarantine', component: () => import('../views/data/Quarantine.vue'), meta: { title: '隔离行' } },
      { path: 'sys/user', component: () => import('../views/sys/User.vue'), meta: { title: '用户与角色' } },
      { path: 'sys/setting', component: () => import('../views/sys/Setting.vue'), meta: { title: '系统设置' } },
    ],
  },
];

const router = createRouter({ history: createWebHashHistory(), routes });

router.beforeEach(to => {
  const token = localStorage.getItem('token');
  if (!to.meta.public && !token && to.path !== '/login') return '/login';
  return true;
});

export default router;
