<template>
  <div>
    <div class="stat-grid">
      <div class="stat-card"><div class="label">订单总数</div><div class="value">{{ stats.total?.count ?? 0 }}</div>
        <div class="delta">成交金额 {{ fmtMoney(stats.total?.amount) }}</div></div>
      <div class="stat-card" v-for="s in stats.byStatus?.slice(0, 3)" :key="s.status">
        <div class="label">{{ s.status }}</div><div class="value">{{ s.count }}</div>
        <div class="delta">{{ fmtMoney(s.amount) }}</div></div>
    </div>

    <div class="page-card">
      <div class="page-title">订单管理</div>
      <el-form :inline="true" :model="query" size="small">
        <el-form-item label="订单号"><el-input v-model="query.orderNo" clearable /></el-form-item>
        <el-form-item label="状态">
          <el-select v-model="query.status" clearable placeholder="全部" style="width:120px">
            <el-option v-for="s in STATUS" :key="s" :label="s" :value="s" />
          </el-select>
        </el-form-item>
        <el-form-item label="平台"><el-input v-model="query.platform" clearable style="width:140px" /></el-form-item>
        <el-form-item label="下单日期">
          <el-date-picker v-model="dateRange" type="daterange" value-format="YYYY-MM-DD" size="small" style="width:230px" />
        </el-form-item>
        <el-form-item><el-button type="primary" :icon="Search" @click="load">查询</el-button></el-form-item>
      </el-form>

      <el-table :data="records" v-loading="loading" border stripe size="small">
        <el-table-column prop="order_no" label="订单号" width="140" />
        <el-table-column prop="member_name" label="会员" width="100" />
        <el-table-column prop="platform" label="平台" width="120" />
        <el-table-column prop="site" label="站点" width="70" />
        <el-table-column label="金额" width="100" align="right">
          <template #default="{ row }"><b>${{ row.pay_amount?.toFixed(2) }}</b></template>
        </el-table-column>
        <el-table-column prop="item_count" label="件数" width="70" align="right" />
        <el-table-column label="状态" width="100">
          <template #default="{ row }">
            <el-tag size="small" :type="tagType(row.status)">{{ row.status }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="created_at" label="下单时间" width="150" />
        <el-table-column label="操作" width="180" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click="openDetail(row)">详情</el-button>
            <el-button link type="primary" :disabled="row.status !== '待发货'" @click="changeStatus(row, '已发货')">发货</el-button>
            <el-button link type="danger" :disabled="['已完成', '已退款'].includes(row.status)" @click="changeStatus(row, '已退款')">退款</el-button>
          </template>
        </el-table-column>
      </el-table>
      <el-pagination style="margin-top:12px;justify-content:flex-end" layout="total, prev, pager, next"
        :total="total" v-model:current-page="query.current" v-model:page-size="query.size" @current-change="load" />
    </div>

    <el-drawer v-model="drawer" :title="`订单详情 · ${current.order_no || ''}`" size="45%">
      <el-descriptions :column="2" border size="small">
        <el-descriptions-item label="会员">{{ current.member_name }}</el-descriptions-item>
        <el-descriptions-item label="平台">{{ current.platform }} / {{ current.site }}</el-descriptions-item>
        <el-descriptions-item label="订单金额">${{ current.pay_amount?.toFixed(2) }}</el-descriptions-item>
        <el-descriptions-item label="运费">${{ current.freight?.toFixed(2) }}</el-descriptions-item>
        <el-descriptions-item label="状态">
          <el-tag size="small" :type="tagType(current.status)">{{ current.status }}</el-tag>
        </el-descriptions-item>
        <el-descriptions-item label="下单时间">{{ current.created_at }}</el-descriptions-item>
      </el-descriptions>
      <div style="margin:14px 0 8px;font-weight:600">商品明细</div>
      <el-table :data="current.items || []" size="small" border>
        <el-table-column prop="sku_code" label="SKU" width="110" />
        <el-table-column prop="product_name" label="商品" min-width="160" />
        <el-table-column prop="qty" label="数量" width="70" align="right" />
        <el-table-column label="单价" width="90" align="right">
          <template #default="{ row }">${{ row.price?.toFixed(2) }}</template>
        </el-table-column>
        <el-table-column label="小计" width="100" align="right">
          <template #default="{ row }">${{ row.amount?.toFixed(2) }}</template>
        </el-table-column>
      </el-table>
    </el-drawer>
  </div>
</template>

<script setup>
import { onMounted, reactive, ref, watch } from 'vue';
import { ElMessage } from 'element-plus';
import { Search } from '@element-plus/icons-vue';
import { orderApi } from '../../api/index.js';
import { fmtMoney } from '../../utils/chart.js';

const STATUS = ['待付款', '待发货', '已发货', '已完成', '已退款'];
const records = ref([]), total = ref(0), loading = ref(false), stats = ref({});
const drawer = ref(false), current = ref({});
const dateRange = ref(null);
const query = reactive({ current: 1, size: 20, orderNo: '', status: '', platform: '' });

async function load() {
  loading.value = true;
  try {
    const params = { ...query };
    if (dateRange.value?.length === 2) { params.start = dateRange.value[0]; params.end = dateRange.value[1]; }
    const d = await orderApi.page(params);
    records.value = d.records; total.value = d.total;
  } finally { loading.value = false; }
}
async function openDetail(row) {
  current.value = await orderApi.detail(row.order_no);
  drawer.value = true;
}
async function changeStatus(row, status) {
  await orderApi.status(row.order_no, status);
  ElMessage.success('已更新为：' + status);
  load(); loadStats();
}
function tagType(s) {
  return { 待付款: 'info', 待发货: 'warning', 已发货: 'primary', 已完成: 'success', 已退款: 'danger' }[s] || 'info';
}
async function loadStats() { stats.value = await orderApi.stats(); }
onMounted(() => { load(); loadStats(); });
</script>
