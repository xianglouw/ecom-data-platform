<template>
  <div>
    <el-page-header @back="$router.push('/ops/sales')" style="margin-bottom:12px">
      <template #content>
        <b>{{ sku }}</b> · {{ data.product?.name || '' }}
        <span class="muted">成本 ${{ data.product?.cost ?? '—' }} · 重量 {{ data.product?.weight_kg ?? '—' }}kg · 售价 ${{ data.product?.price ?? '—' }}</span>
      </template>
    </el-page-header>

    <div class="page-card">
      <div class="page-title">销售 / 广告趋势</div>
      <div ref="trendEl" class="chart-box"></div>
    </div>

    <el-row :gutter="16">
      <el-col :span="12">
        <div class="page-card">
          <div class="page-title">分平台 / 站点</div>
          <el-table :data="data.byPlatform || []" size="small" border>
            <el-table-column prop="platform" label="平台" />
            <el-table-column prop="site" label="站点" width="70" />
            <el-table-column label="GMV" align="right">
              <template #default="{ row }">{{ fmtMoney(row.gmv) }}</template>
            </el-table-column>
            <el-table-column prop="units" label="销量" align="right" />
            <el-table-column label="ROAS" align="right">
              <template #default="{ row }">{{ row.roas?.toFixed(2) ?? '—' }}</template>
            </el-table-column>
          </el-table>
        </div>
      </el-col>
      <el-col :span="12">
        <div class="page-card">
          <div class="page-title">关联广告活动</div>
          <el-table :data="data.campaigns || []" size="small" border>
            <el-table-column prop="campaign" label="活动" min-width="170" />
            <el-table-column label="花费" align="right">
              <template #default="{ row }">{{ fmtMoney(row.spend) }}</template>
            </el-table-column>
            <el-table-column label="广告销售额" align="right">
              <template #default="{ row }">{{ fmtMoney(row.ad_sales) }}</template>
            </el-table-column>
            <el-table-column label="ROAS" align="right">
              <template #default="{ row }">
                <el-tag size="small" :type="row.roas >= 2.5 ? 'success' : 'danger'">{{ row.roas?.toFixed(2) ?? '—' }}</el-tag>
              </template>
            </el-table-column>
          </el-table>
        </div>
      </el-col>
    </el-row>
  </div>
</template>

<script setup>
import { nextTick, onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import * as echarts from 'echarts';
import { opsApi } from '../../api/index.js';
import { fmtMoney } from '../../utils/chart.js';

const route = useRoute();
const sku = route.params.sku;
const data = ref({});
const trendEl = ref(null);
let chart = null;

onMounted(async () => {
  data.value = await opsApi.productDetail(sku, 60);
  await nextTick();
  const t = data.value.trend || [];
  chart = echarts.init(trendEl.value);
  chart.setOption({
    tooltip: { trigger: 'axis' }, legend: { top: 0 },
    xAxis: { type: 'category', data: t.map(x => x.date.slice(5)) },
    yAxis: [{ type: 'value' }, { type: 'value', name: '销量', splitLine: { show: false } }],
    series: [
      { name: 'GMV', type: 'line', smooth: true, data: t.map(x => x.gmv), itemStyle: { color: '#2563eb' }, areaStyle: { opacity: 0.1 } },
      { name: '广告花费', type: 'line', smooth: true, data: t.map(x => x.spend), itemStyle: { color: '#f59e0b' } },
      { name: '销量', type: 'bar', yAxisIndex: 1, data: t.map(x => x.units), itemStyle: { color: '#93c5fd' } },
      { name: '退款', type: 'line', yAxisIndex: 1, smooth: true, data: t.map(x => x.refund), itemStyle: { color: '#dc2626' } },
    ],
  });
});
</script>
