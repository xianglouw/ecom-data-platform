<template>
  <div class="app-wrapper">
    <el-container>
      <el-aside :width="collapsed ? '68px' : '220px'" class="aside" :class="{ 'is-mini': collapsed }">
        <div class="logo">
          <BrandLogo :size="34" />
          <div class="logo-text" v-show="!collapsed">
            <b>Mall Ops</b>
            <small>跨境电商数据中台</small>
          </div>
        </div>
        <el-scrollbar>
          <el-menu :default-active="activeMenu" router unique-opened :collapse="collapsed" :collapse-transition="false"
            background-color="transparent" text-color="#a5a5b8" active-text-color="#25f4ee">
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
          <div class="header-left">
            <button class="collapse-btn" @click="toggleCollapse" :aria-label="collapsed ? '展开菜单' : '收起菜单'">
              <el-icon><component :is="collapsed ? 'Expand' : 'Fold'" /></el-icon>
            </button>
            <el-breadcrumb separator="/">
              <el-breadcrumb-item :to="{ path: '/dashboard' }">首页</el-breadcrumb-item>
              <el-breadcrumb-item v-if="parentName">{{ parentName }}</el-breadcrumb-item>
              <el-breadcrumb-item>{{ route.meta.title }}</el-breadcrumb-item>
            </el-breadcrumb>
          </div>
          <div class="header-right">
            <el-tag size="small" class="space-tag">数据空间：{{ mobileMask }}</el-tag>
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
            <transition name="fade-slide" mode="out-in">
              <component :is="Component" :key="route.path" />
            </transition>
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
import BrandLogo from '../components/BrandLogo.vue';

const route = useRoute();
const router = useRouter();
const nickname = ref(localStorage.getItem('nickname') || '');
const mobile = ref(localStorage.getItem('mobile') || '');
const username = computed(() => nickname.value || mobile.value || '未登录');
/** 手机号脱敏展示，避免在页面上明文暴露 */
const mobileMask = computed(() =>
  mobile.value ? mobile.value.replace(/^(\d{3})\d{4}(\d{4})$/, '$1****$2') : '未知账号'
);

/** 侧边栏折叠状态，写入本地存储以便下次进入保持习惯 */
const collapsed = ref(localStorage.getItem('asideCollapsed') === '1');
function toggleCollapse() {
  collapsed.value = !collapsed.value;
  localStorage.setItem('asideCollapsed', collapsed.value ? '1' : '0');
}

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
.header-left { display: flex; align-items: center; gap: 12px; }

/* 折叠按钮：hover 发青光 */
.collapse-btn {
  width: 32px;
  height: 32px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--tk-line);
  background: transparent;
  color: var(--tk-text-2);
  border-radius: 9px;
  cursor: pointer;
  font-size: 16px;
  transition: all .22s var(--tk-ease);
}
.collapse-btn:hover {
  color: var(--tk-cyan);
  border-color: rgba(37, 244, 238, .45);
  box-shadow: 0 0 14px -4px rgba(37, 244, 238, .7);
  transform: translateY(-1px);
}

.space-tag {
  background: rgba(37, 244, 238, .1);
  color: var(--tk-cyan);
  border: 1px solid rgba(37, 244, 238, .25);
}

/* 折叠态：收紧内边距，隐藏左侧指示条避免与 Element 折叠样式打架 */
.aside.is-mini :deep(.el-menu-item),
.aside.is-mini :deep(.el-sub-menu__title) { margin: 3px 8px; justify-content: center; }
.aside.is-mini :deep(.el-menu-item.is-active::before) { display: none; }

/* 空台引导横幅（霓虹风） */
.empty-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  background: linear-gradient(115deg, rgba(37, 244, 238, .12), rgba(254, 44, 85, .08));
  border: 1px solid rgba(37, 244, 238, .28);
  border-left: 3px solid var(--tk-cyan);
  border-radius: 12px;
  padding: 14px 18px;
  margin-bottom: 14px;
  box-shadow: 0 10px 30px -18px rgba(37, 244, 238, .5);
}
.empty-banner-text {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 13px;
  color: var(--tk-text);
}
.empty-banner-text .muted { color: var(--tk-text-2); line-height: 1.7; }
</style>
