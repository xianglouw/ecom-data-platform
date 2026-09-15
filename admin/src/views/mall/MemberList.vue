<template>
  <div>
    <div class="stat-grid">
      <div class="stat-card"><div class="label">会员总数</div><div class="value">{{ stats.total ?? 0 }}</div>
        <div class="delta">活跃 {{ stats.active ?? 0 }}</div></div>
      <div class="stat-card"><div class="label">累计消费金额</div><div class="value">{{ fmtMoney(stats.amount) }}</div>
        <div class="delta">全站会员合计</div></div>
      <div class="stat-card" v-for="l in stats.byLevel" :key="l.level">
        <div class="label">{{ l.level }}</div><div class="value">{{ l.count }}</div>
        <div class="delta">占比 {{ (l.count / (stats.total || 1) * 100).toFixed(1) }}%</div>
      </div>
    </div>

    <div class="page-card">
      <div class="page-title">会员管理</div>
      <el-form :inline="true" :model="query" size="small">
        <el-form-item label="昵称"><el-input v-model="query.nickname" clearable /></el-form-item>
        <el-form-item label="手机"><el-input v-model="query.mobile" clearable /></el-form-item>
        <el-form-item label="等级">
          <el-select v-model="query.level" clearable placeholder="全部" style="width:130px">
            <el-option v-for="l in LEVELS" :key="l" :label="l" :value="l" />
          </el-select>
        </el-form-item>
        <el-form-item><el-button type="primary" :icon="Search" @click="load">查询</el-button></el-form-item>
      </el-form>

      <el-table :data="records" v-loading="loading" border stripe size="small">
        <el-table-column prop="id" label="ID" width="60" />
        <el-table-column prop="nickname" label="昵称" width="110" />
        <el-table-column prop="mobile" label="手机号" width="130" />
        <el-table-column label="等级" width="110">
          <template #default="{ row }">
            <el-tag size="small" :type="levelType(row.level)">{{ row.level }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="余额" width="100" align="right">
          <template #default="{ row }">${{ row.balance?.toFixed(2) }}</template>
        </el-table-column>
        <el-table-column prop="order_count" label="订单数" width="80" align="right" />
        <el-table-column label="累计消费" width="110" align="right">
          <template #default="{ row }"><b>${{ row.total_amount?.toFixed(2) }}</b></template>
        </el-table-column>
        <el-table-column prop="reg_time" label="注册时间" width="120" />
        <el-table-column label="状态" width="80">
          <template #default="{ row }">
            <el-tag size="small" :type="row.status === 1 ? 'success' : 'info'">{{ row.status === 1 ? '正常' : '禁用' }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="120" fixed="right">
          <template #default="{ row }"><el-button link type="primary" @click="openEdit(row)">编辑</el-button></template>
        </el-table-column>
      </el-table>
      <el-pagination style="margin-top:12px;justify-content:flex-end" layout="total, prev, pager, next"
        :total="total" v-model:current-page="query.current" v-model:page-size="query.size" @current-change="load" />
    </div>

    <el-dialog v-model="dialog" title="编辑会员" width="420px">
      <el-form :model="form" label-width="80px" size="small">
        <el-form-item label="昵称"><el-input v-model="form.nickname" /></el-form-item>
        <el-form-item label="手机号"><el-input v-model="form.mobile" /></el-form-item>
        <el-form-item label="等级">
          <el-select v-model="form.level" style="width:100%">
            <el-option v-for="l in LEVELS" :key="l" :label="l" :value="l" />
          </el-select>
        </el-form-item>
        <el-form-item label="状态">
          <el-radio-group v-model="form.status">
            <el-radio :value="1">正常</el-radio><el-radio :value="0">禁用</el-radio>
          </el-radio-group>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialog = false">取 消</el-button>
        <el-button type="primary" @click="onSubmit">确 定</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { onMounted, reactive, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { Search } from '@element-plus/icons-vue';
import { memberApi } from '../../api/index.js';
import { fmtMoney } from '../../utils/chart.js';

const LEVELS = ['普通会员', '银卡会员', '金卡会员', '钻石会员'];
const records = ref([]), total = ref(0), loading = ref(false), stats = ref({});
const dialog = ref(false), form = ref({});
const query = reactive({ current: 1, size: 20, nickname: '', mobile: '', level: '' });

async function load() {
  loading.value = true;
  try {
    const d = await memberApi.page(query);
    records.value = d.records; total.value = d.total;
  } finally { loading.value = false; }
}
function openEdit(row) { form.value = { ...row }; dialog.value = true; }
async function onSubmit() {
  await memberApi.update(form.value.id, form.value);
  ElMessage.success('保存成功');
  dialog.value = false; load(); loadStats();
}
function levelType(l) {
  return { 普通会员: 'info', 银卡会员: 'primary', 金卡会员: 'warning', 钻石会员: 'danger' }[l] || 'info';
}
async function loadStats() { stats.value = await memberApi.stats(); }
onMounted(() => { load(); loadStats(); });
</script>
