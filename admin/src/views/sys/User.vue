<template>
  <div>
    <el-row :gutter="16">
      <el-col :span="16">
        <div class="page-card">
          <div class="page-title">系统用户</div>
          <el-table :data="users" v-loading="loading" border stripe size="small">
            <el-table-column prop="id" label="ID" width="60" />
            <el-table-column prop="username" label="账号" width="120" />
            <el-table-column prop="nickname" label="姓名" width="120" />
            <el-table-column label="角色" width="140">
              <template #default="{ row }">
                <el-tag size="small">{{ roleName(row.role_code) }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="mobile" label="手机号" width="130" />
            <el-table-column label="状态" width="90">
              <template #default="{ row }">
                <el-tag size="small" :type="row.status === 1 ? 'success' : 'info'">{{ row.status === 1 ? '启用' : '禁用' }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="created_at" label="创建时间" width="170" />
          </el-table>
          <el-pagination style="margin-top:12px;justify-content:flex-end" layout="total, prev, pager, next"
            :total="total" v-model:current-page="current" v-model:page-size="size" @current-change="load" />
        </div>
      </el-col>
      <el-col :span="8">
        <div class="page-card">
          <div class="page-title">角色权限</div>
          <el-table :data="roles" border size="small">
            <el-table-column prop="name" label="角色" width="110" />
            <el-table-column prop="code" label="标识" width="90" />
            <el-table-column prop="menu" label="菜单权限" min-width="120" />
            <el-table-column prop="remark" label="说明" min-width="150" />
          </el-table>
          <div class="muted" style="margin-top:8px">
            真实项目使用 Sa-Token 做登录鉴权与菜单级权限控制；此处为演示的角色模型。
          </div>
        </div>
      </el-col>
    </el-row>
  </div>
</template>

<script setup>
import { onMounted, ref } from 'vue';
import { sysApi } from '../../api/index.js';

const users = ref([]), roles = ref([]), total = ref(0), loading = ref(false);
const current = ref(1), size = ref(20);
const roleName = code => roles.value.find(r => r.code === code)?.name || code;

async function load() {
  loading.value = true;
  try {
    const d = await sysApi.userPage({ current: current.value, size: size.value });
    users.value = d.records; total.value = d.total;
  } finally { loading.value = false; }
}
onMounted(async () => { roles.value = await sysApi.roleList(); load(); });
</script>
