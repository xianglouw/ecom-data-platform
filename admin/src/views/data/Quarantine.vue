<template>
  <div>
    <div class="alert-box blue">
      ℹ️ 隔离行 = 清洗时未通过校验、<b>没有静默入账</b>的原始行。每一行都保留原始数据与失败原因，人工修正后可重新上传。
    </div>
    <div class="page-card">
      <div class="page-title">隔离行明细 <span class="muted">最近 100 条</span></div>
      <el-table :data="records" v-loading="loading" border stripe size="small">
        <el-table-column prop="id" label="#" width="60" />
        <el-table-column label="数据集" width="110">
          <template #default="{ row }"><el-tag size="small" type="info">{{ row.dataset }}</el-tag></template>
        </el-table-column>
        <el-table-column prop="reason" label="失败原因" min-width="220">
          <template #default="{ row }"><span style="color:#dc2626">{{ row.reason }}</span></template>
        </el-table-column>
        <el-table-column prop="row_data" label="原始行数据" min-width="320" show-overflow-tooltip />
        <el-table-column prop="created_at" label="时间" width="160" />
      </el-table>
    </div>
  </div>
</template>

<script setup>
import { onMounted, ref } from 'vue';
import { opsApi } from '../../api/index.js';

const records = ref([]), loading = ref(false);
onMounted(async () => {
  loading.value = true;
  try { records.value = (await opsApi.quarantine()).records || []; } finally { loading.value = false; }
});
</script>
