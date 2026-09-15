<template>
  <div class="app-wrapper">
    <el-container>
      <el-aside width="220px" class="aside">
        <div class="logo">
          <span class="logo-mark">M</span>
          <div class="logo-text">
            <b>Mall Ops</b>
            <small>电商运营后台</small>
          </div>
        </div>
        <el-scrollbar>
          <el-menu :default-active="activeMenu" router unique-opened background-color="#1f2937"
            text-color="#c3cbd8" active-text-color="#ffffff">
            <template v-for="item in menuTree" :key="item.path">
              <el-sub-menu v-if="item.children" :index="item.path">
                <template #title>
                  <el-icon><component :is="item.icon" /></el-icon><span>{{ item.name }}</span>
                </template>
                <el-menu-item v-for="c in item.children" :key="c.path" :index="c.path">
                  <el-icon><component :is="c.icon" /></el-icon>{{ c.name }}
                </el-menu-item>
              </el-sub-menu>
              <el-menu-item v-else :index="item.path">
                <el-icon><component :is="item.icon" /></el-icon>{{ item.name }}
              </el-menu-item>
            </template>
          </el-menu>
        </el-scrollbar>
      </el-aside>
      <el-container>
        <el-header height="56px" class="header">
          <el-breadcrumb separator="/">
            <el-breadcrumb-item :to="{ path: '/dashboard' }">首页</el-breadcrumb-item>
            <el-breadcrumb-item v-if="parentName">{{ parentName }}</el-breadcrumb-item>
            <el-breadcrumb-item>{{ route.meta.title }}</el-breadcrumb-item>
          </el-breadcrumb>
          <div class="header-right">
            <el-tag size="small" type="success">数据空间：{{ mobileMask }}</el-tag>
            <el-dropdown @command="onCommand">
              <span class="user">
                <el-icon><User /></el-icon> {{ username }}
                <el-icon><ArrowDown /></el-icon>
              </span>
              <template #dropdown>
                <el-dropdown-menu>
                  <el-dropdown-item command="profile">个人中心</el-dropdown-item>
                  <el-dropdown-item command="logout" divided>退出登录</el-dropdown-item>
                </el-dropdown-menu>
              </template>
            </el-dropdown>
          </div>
        </el-header>
        <el-main class="main">
          <!-- 空台引导：账号还没有任何数据时，所有页面顶部提示下一步该做什么 -->
          <div v-if="isEmpty" class="empty-banner">
            <div class="empty-banner-text">
              <b>你的数据空间还是空的</b>
              <span class="muted">
                当前账号（{{ mobileMask }}）还没有任何数据。上传订单财务 / 库存 / 广告 / 销售日报中的任意一张表，
                看板与各分析页会立刻算出结果 —— 数据只属于你这个账号。
              </span>
            </div>
            <router-link to="/data/upload"><el-button type="primary">去上传数据</el-button></router-link>
          </div>

          <router-view v-slot="{ Component }">
            <keep-alive><component :is="Component" v-if="$route.meta.keepAlive" /></keep-alive>
            <component :is="Component" v-if="!$route.meta.keepAlive" />
          </router-view>
        </el-main>
      </el-container>
    </el-container>
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { menuTree } from '../router/index.js';
import { authApi } from '../api/index.js';

const route = useRoute();
const router = useRouter();
const nickname = ref(localStorage.getItem('nickname') || '');
const mobile = ref(localStorage.getItem('mobile') || '');
const username = computed(() => nickname.value || mobile.value || '未登录');
/** 手机号脱敏展示，避免在页面上明文暴露 */
const mobileMask = computed(() =>
  mobile.value ? mobile.value.replace(/^(\d{3})\d{4}(\d{4})$/, '$1****$2') : '未知账号'
);

/** 当前账号是否还没有任何业务数据（空台） */
const isEmpty = ref(false);
async function refreshEmpty() {
  try {
    const p = await authApi.profile();
    isEmpty.value = !!p.empty;
  } catch {
    isEmpty.value = false; // 接口异常时不打扰用户
  }
}
onMounted(refreshEmpty);
// 切页面时重新判断：上传完成后横幅自动消失
watch(() => route.path, refreshEmpty);

const activeMenu = computed(() => route.path);
const parentName = computed(() => {
  const group = menuTree.find(m => m.children?.some(c => c.path === route.path));
  return group?.name || '';
});

async function onCommand(cmd) {
  if (cmd === 'logout') {
    try {
      await authApi.logout(); // 服务端作废令牌
    } catch {
      /* 退出接口异常不影响本地清理 */
    }
    localStorage.removeItem('token');
    localStorage.removeItem('nickname');
    localStorage.removeItem('mobile');
    ElMessage.success('已退出登录');
    router.push('/login');
  } else if (cmd === 'profile') {
    router.push('/sys/setting');
  }
}
</script>

<style scoped>
/* 空台引导横幅 */
.empty-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  background: #eff6ff;
  border: 1px solid #bfdbfe;
  border-left: 4px solid #3b82f6;
  border-radius: 8px;
  padding: 14px 18px;
  margin-bottom: 14px;
}
.empty-banner-text {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 13px;
  color: #1e3a8a;
}
.empty-banner-text .muted {
  color: #475569;
  line-height: 1.7;
}
</style>
