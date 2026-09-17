<template>
  <div>
    <div class="alert-box blue">
      📊 当前数据源：<b>{{ sourceName || '（无数据）' }}</b>
      <el-radio-group v-model="source" size="small" style="margin-left:12px">
        <el-radio-button value="">自动</el-radio-button>
        <el-radio-button value="ads_daily">广告花费明细（上传表）</el-radio-button>
        <el-radio-button value="sales_daily">销售/广告日数据</el-radio-button>
      </el-radio-group>
      <div class="muted" style="margin-top:4px">
        金额单位以你上传表里的币种为准（不再统一当作美元）；「保本 ROAS」只在存在成本数据（销售日数据 / 商品主数据）时才可计算。
      </div>
    </div>

    <div v-if="flags.length" class="alert-box">
      <div v-for="f in flags" :key="f">⚠️ {{ f }}</div>
      <div class="muted" style="margin-top:4px">以上为系统判定与依据，涉及预算调整的动作落地由人执行。</div>
    </div>

    <div class="page-card">
      <div class="page-title">花费 vs ROAS <span class="muted">气泡大小代表花费规模，点击气泡 → 该活动销售明细</span></div>
      <div ref="scatterEl" class="chart-box"></div>
    </div>

    <div class="page-card">
      <div class="page-title">广告活动列表</div>
      <div class="timerange">
        <el-radio-group v-model="days" size="small">
          <el-radio-button :value="7">近 7 天</el-radio-button>
          <el-radio-button :value="30">近 30 天</el-radio-button>
          <el-radio-button :value="90">近 90 天</el-radio-button>
        </el-radio-group>
        <span class="muted">保本 ROAS = 售价 ÷（售价 − 单位成本 − 平台费估计 15%）</span>
      </div>
      <el-table :data="records" v-loading="loading" border stripe size="small">
        <el-table-column prop="campaign" label="广告活动" min-width="160" />
        <el-table-column prop="platform" label="平台" width="120" />
        <el-table-column label="花费" width="100" align="right">
          <template #default="{ row }">${{ row.spend?.toFixed(2) }}</template>
        </el-table-column>
        <el-table-column label="广告销售额" width="110" align="right">
          <template #default="{ row }">${{ row.ad_sales?.toFixed(2) }}</template>
        </el-table-column>
        <el-table-column label="ROAS" width="80" align="right">
          <template #default="{ row }"><b>{{ row.roas?.toFixed(2) ?? '—' }}</b></template>
        </el-table-column>
        <el-table-column label="保本 ROAS" width="100" align="right">
          <template #default="{ row }">{{ row.breakeven_roas?.toFixed(2) ?? '—' }}</template>
        </el-table-column>
        <el-table-column label="ACOS" width="80" align="right">
          <template #default="{ row }">{{ row.acos == null ? '—' : (row.acos * 100).toFixed(1) + '%' }}</template>
        </el-table-column>
        <el-table-column label="CPC" width="70" align="right">
          <template #default="{ row }">${{ row.cpc?.toFixed(2) ?? '—' }}</template>
        </el-table-column>
        <el-table-column label="CVR" width="70" align="right">
          <template #default="{ row }">{{ row.cvr == null ? '—' : (row.cvr * 100).toFixed(2) + '%' }}</template>
        </el-table-column>
        <el-table-column label="净利（毛估）" width="120" align="right">
          <template #default="{ row }">
            <span :style="row.profit < 0 ? 'color:#dc2626;font-weight:600' : 'color:#16a34a'">${{ row.profit?.toFixed(2) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="判定" width="90">
          <template #default="{ row }">
            <el-tag size="small" :type="row.status === '亏损' ? 'danger' : row.status === '可放量' ? 'success' : 'warning'">
              {{ row.status }}
            </el-tag>
          </template>
        </el-table-column>
      </el-table>
    </div>
  </div>
</template>

<script setup>
import { nextTick, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import * as echarts from 'echarts';
import { opsApi } from '../../api/index.js';

const router = useRouter();
const records = ref([]), flags = ref([]), loading = ref(false), days = ref(30);
const source = ref('');           // '' = 自动（有广告明细表就优先用它）
const sourceName = ref('');
const scatterEl = ref(null);
let chart = null;

async function load() {
  loading.value = true;
  try {
    const d = await opsApi.ads({ days: days.value, source: source.value || undefined });
    records.value = d.records; flags.value = d.flags || [];
    sourceName.value = d.source_name || '';
    await nextTick();
    renderScatter();
  } finally { loading.value = false; }
}
function renderScatter() {
  if (!scatterEl.value) return;
  chart = chart || echarts.init(scatterEl.value, 'tk');
  const colors = { 亏损: '#FE2C55', 观察: '#FE2C55', 可放量: '#00E6A8' };
  const rows = records.value.filter(r => r.roas != null);
  chart.setOption({
    tooltip: { formatter: p => `${p.data[3]}<br>花费 $${p.data[0].toFixed(2)}<br>ROAS ${p.data[1]}<br>保本 ${p.data[2]}` },
    grid: { left: 60, right: 30, top: 30, bottom: 40 },
    xAxis: { type: 'log', name: '花费(log)' }, yAxis: { type: 'value', name: 'ROAS' },
    series: [{
      type: 'scatter', symbolSize: d => Math.max(14, Math.min(48, 8 + d[0] / 60)),
      data: rows.map(r => [r.spend, r.roas, r.breakeven_roas, r.campaign, r.status]),
      itemStyle: { color: p => colors[p.data[4]] || '#25F4EE', opacity: 0.82 },
      label: { show: true, position: 'top', formatter: p => p.data[3].slice(0, 14), fontSize: 10, color: '#A5A5B8' },
    }],
  }, true);
  chart.off('click');
  chart.on('click', p => router.push({ path: '/ops/sales', query: { campaign: p.data[3] } }));
}
onMounted(load);
watch([days, source], load);
</script>
