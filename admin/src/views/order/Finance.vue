<template>
  <div>
    <div class="alert-box blue">
      ℹ️ 口径：<b>净利 = 总收入 − 佣金 − 附加费 − 运费 − 退货退款</b>（成本项按源文件负数原样求和，不静默补数）。
      数据来自「数据上传 → 订单财务明细」，当前币种 <b>{{ stats.currency }}</b>。
      <span v-if="stats.sku_count"> · 覆盖 {{ stats.sku_count }} 个 SKU</span>
    </div>

    <!-- 筛选 -->
    <div class="timerange">
      <el-select v-model="q.site" placeholder="全部站点" clearable size="small" style="width:120px">
        <el-option v-for="s in facets.sites || []" :key="s.site" :label="s.site || '未知'" :value="s.site" />
      </el-select>
      <el-select v-model="q.platform" placeholder="全部平台" clearable size="small" style="width:150px">
        <el-option v-for="p in facets.platforms || []" :key="p.platform" :label="p.platform || '未知'" :value="p.platform" />
      </el-select>
      <el-input v-model="q.sku" placeholder="搜索 SKU" clearable size="small" style="width:180px" @change="load" />
      <el-checkbox v-model="adOnly" size="small" @change="load">仅广告订单</el-checkbox>
      <span class="muted">源文件：{{ sourceFile || '—' }}</span>
    </div>

    <!-- KPI -->
    <div class="stat-grid">
      <div class="stat-card" v-for="k in kpis" :key="k.label">
        <div class="label">{{ k.label }}</div>
        <div class="value" :style="k.color ? `color:${k.color}` : ''">{{ k.text }}</div>
        <div class="delta"><span class="muted">{{ k.sub }}</span></div>
      </div>
    </div>

    <el-row :gutter="16">
      <el-col :span="14">
        <div class="page-card">
          <div class="page-title">SKU 收入 vs 净利 Top 10 <span class="muted">点击条目下钻订单明细</span></div>
          <div ref="skuEl" class="chart-box"></div>
        </div>
      </el-col>
      <el-col :span="10">
        <div class="page-card">
          <div class="page-title">收入构成瀑布 <span class="muted">从总收入到净利</span></div>
          <div ref="waterEl" class="chart-box"></div>
        </div>
      </el-col>
    </el-row>

    <!-- SKU 汇总表 -->
    <div class="page-card">
      <div class="page-title">
        SKU 盈利汇总
        <el-radio-group v-model="sort" size="small" style="margin-left:12px" @change="loadSku">
          <el-radio-button value="revenue">按收入</el-radio-button>
          <el-radio-button value="profit">按净利</el-radio-button>
          <el-radio-button value="margin">净利率升序</el-radio-button>
          <el-radio-button value="refund">退款额</el-radio-button>
        </el-radio-group>
      </div>
      <el-table :data="skus" size="small" @row-click="row => { q.sku = row.sku; tab = 'detail'; load() }" style="cursor:pointer">
        <el-table-column prop="sku" label="SKU" min-width="130" show-overflow-tooltip />
        <el-table-column prop="orders" label="订单数" width="80" align="right" />
        <el-table-column prop="units" label="销量" width="70" align="right" />
        <el-table-column label="总收入" width="110" align="right">
          <template #default="{ row }">{{ fmtMoney(row.revenue) }}</template>
        </el-table-column>
        <el-table-column label="佣金" width="100" align="right">
          <template #default="{ row }"><span class="muted">{{ fmtMoney(row.commission) }}</span></template>
        </el-table-column>
        <el-table-column label="退款" width="90" align="right">
          <template #default="{ row }">{{ row.refund ? fmtMoney(row.refund) : '—' }}</template>
        </el-table-column>
        <el-table-column label="净利润" width="110" align="right">
          <template #default="{ row }">
            <b :style="{ color: row.profit < 0 ? 'var(--danger, #d03050)' : '' }">{{ fmtMoney(row.profit) }}</b>
          </template>
        </el-table-column>
        <el-table-column label="净利率" width="80" align="right">
          <template #default="{ row }">{{ row.margin_rate }}%</template>
        </el-table-column>
        <el-table-column label="退款率" width="80" align="right">
          <template #default="{ row }">{{ row.refund_rate }}%</template>
        </el-table-column>
        <el-table-column label="广告占比" width="85" align="right">
          <template #default="{ row }">{{ row.ad_rate }}%</template>
        </el-table-column>
        <el-table-column label="状态" width="80" align="center">
          <template #default="{ row }">
            <el-tag size="small" :type="row.status === '健康' ? 'success' : row.status === '偏薄' ? 'warning' : 'danger'">{{ row.status }}</el-tag>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <!-- 订单明细 -->
    <div class="page-card">
      <div class="page-title">订单明细 <span class="muted">{{ q.sku ? `已筛选 SKU：${q.sku}（点行可清除筛选）` : '全部订单' }}</span></div>
      <el-table :data="page.records" size="small" v-loading="loading">
        <el-table-column prop="order_no" label="订单编号" min-width="150" show-overflow-tooltip />
        <el-table-column prop="sku" label="SKU" min-width="120" show-overflow-tooltip />
        <el-table-column prop="listing_id" label="刊登号" min-width="140" show-overflow-tooltip />
        <el-table-column prop="qty" label="单量" width="60" align="right">
          <template #default="{ row }">{{ row.qty ?? '—' }}</template>
        </el-table-column>
        <el-table-column label="总收入" width="95" align="right">
          <template #default="{ row }">{{ fmtMoney(row.gross_revenue) }}</template>
        </el-table-column>
        <el-table-column label="佣金" width="90" align="right">
          <template #default="{ row }"><span class="muted">{{ row.commission != null ? fmtMoney(row.commission) : '—' }}</span></template>
        </el-table-column>
        <el-table-column label="运费" width="90" align="right">
          <template #default="{ row }">{{ row.shipping_fee != null ? fmtMoney(row.shipping_fee) : '—' }}</template>
        </el-table-column>
        <el-table-column label="退款" width="90" align="right">
          <template #default="{ row }">{{ row.refund ? fmtMoney(row.refund) : '—' }}</template>
        </el-table-column>
        <el-table-column label="净利" width="95" align="right">
          <template #default="{ row }">
            <b :style="{ color: row.net_profit != null && row.net_profit < 0 ? 'var(--danger, #d03050)' : '' }">{{ row.net_profit != null ? fmtMoney(row.net_profit) : '—' }}</b>
          </template>
        </el-table-column>
        <el-table-column label="广告单" width="75" align="center">
          <template #default="{ row }">
            <el-tag v-if="row.is_ad_sale" size="small" type="warning">广告</el-tag>
            <span v-else class="muted">自然</span>
          </template>
        </el-table-column>
        <el-table-column prop="site" label="站点" width="60" align="center">
          <template #default="{ row }">{{ row.site || '—' }}</template>
        </el-table-column>
      </el-table>
      <el-pagination
        style="margin-top:12px; justify-content:flex-end"
        layout="total, prev, pager, next, sizes"
        :total="page.total" v-model:current-page="q.current" v-model:page-size="q.size"
        :page-sizes="[20, 50, 100]" @current-change="loadPage" @size-change="loadPage" />
    </div>
  </div>
</template>

<script setup>
import { computed, reactive, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { useRoute } from 'vue-router';
import { orderFinanceApi } from '../../api/index.js';
import { useChart, fmtMoney, fmtNum } from '../../utils/chart.js';

const route = useRoute();
const q = reactive({ site: '', platform: '', sku: '', adOnly: '', current: 1, size: 20 });
if (route.query.sku) q.sku = String(route.query.sku); // 支持看板图表点击带 SKU 下钻
const adOnly = ref(false);
const tab = ref('detail');
const sort = ref('revenue');
const loading = ref(false);
const stats = ref({});
const facets = ref({});
const skus = ref([]);
const page = reactive({ records: [], total: 0 });
const sourceFile = computed(() => page.records[0]?.source_file || '');

const kpis = computed(() => {
  const s = stats.value;
  return [
    { label: '订单数', text: fmtNum(s.orders), sub: `销量 ${fmtNum(s.units)} 件` },
    { label: '总收入', text: fmtMoney(s.revenue), sub: `客单价 ${fmtMoney(s.aov)}` },
    { label: '净利润', text: fmtMoney(s.profit), sub: `单均净利 ${fmtMoney(s.profit_per_order)}`, color: s.profit < 0 ? '#FE2C55' : undefined },
    { label: '净利率', text: (s.margin_rate ?? '—') + '%', sub: `平台费率 ${s.fee_rate}%`, color: (s.margin_rate || 0) < 15 ? '#FE2C55' : undefined },
    { label: '退款率', text: (s.refund_rate ?? '—') + '%', sub: `退款额 ${fmtMoney(s.refund)}` },
    { label: '广告单占比', text: (s.ad_order_rate ?? '—') + '%', sub: `广告单 ${fmtNum(s.ad_orders)} / ${fmtNum(s.orders)}` },
  ];
});

async function loadSku() {
  skus.value = await orderFinanceApi.sku({ ...q, adOnly: adOnly.value ? 1 : '', sort: sort.value });
  renderSkuChart();
  renderWater();
}
async function loadPage() {
  loading.value = true;
  try {
    const r = await orderFinanceApi.page({ ...q, adOnly: adOnly.value ? 1 : '' });
    page.records = r.records; page.total = r.total;
    orderFinanceApi.stats({ ...q, adOnly: adOnly.value ? 1 : '' }).then(s => { stats.value = s; renderWater(); });
  } finally { loading.value = false; }
}
async function load() { q.current = 1; await Promise.all([loadSku(), loadPage()]); }

/* 图表：SKU 收入 vs 净利 */
const { el: skuEl, render: renderSkuChart } = useChart(() => {
  const top = skus.value.slice(0, 10).slice().reverse();
  return {
    grid: { left: 110, right: 24, top: 12, bottom: 24 },
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    legend: { bottom: 0, itemWidth: 12, itemHeight: 8, textStyle: { fontSize: 11 } },
    xAxis: { type: 'value', axisLabel: { fontSize: 10 } },
    yAxis: { type: 'category', data: top.map(r => r.sku), axisLabel: { fontSize: 11 } },
    series: [
      { name: '总收入', type: 'bar', barWidth: 9, itemStyle: { color: '#25F4EE', borderRadius: [0, 3, 3, 0] }, data: top.map(r => r.revenue) },
      { name: '净利润', type: 'bar', barWidth: 9, itemStyle: { color: '#00E6A8', borderRadius: [0, 3, 3, 0] }, data: top.map(r => r.profit) },
    ],
  };
}, p => {
  if (p.componentType !== 'series') return;
  const sku = skus.value.slice(0, 10).slice().reverse()[p.dataIndex]?.sku;
  if (sku) { q.sku = sku; load(); ElMessage.info('已筛选 SKU：' + sku); }
});

/* 图表：收入构成瀑布 */
const { el: waterEl, render: renderWater } = useChart(() => {
  const s = stats.value;
  if (!s.revenue) return { xAxis: { data: [] }, yAxis: {}, series: [] };
  const steps = [
    { name: '总收入', v: s.revenue, color: '#25F4EE' },
    { name: '佣金', v: s.commission, color: '#FFB020' },
    { name: '附加费', v: s.surcharge, color: '#FFB020' },
    { name: '运费', v: s.shipping, color: '#FFB020' },
    { name: '退款', v: s.refund, color: '#FE2C55' },
    { name: '净利润', v: s.profit, color: '#00E6A8' },
  ];
  let acc = 0;
  const data = steps.map((st, i) => {
    if (i === 0 || i === steps.length - 1) return { value: st.v, itemStyle: { color: st.color } };
    const helper = acc + Math.min(st.v, 0);
    acc += st.v;
    return { value: Math.abs(st.v), itemStyle: { color: st.color, opacity: 0.75 }, tooltipExtra: `实际变动 ${fmtMoney(st.v)}`, _helper: helper };
  });
  // 用柱 + 透明垫底模拟瀑布
  const helpers = steps.map((st, i) => {
    if (i === 0 || i === steps.length - 1) return 0;
    let h = 0;
    for (let j = 1; j < i; j++) h += steps[j].v;
    h += Math.min(st.v, 0);
    return h;
  });
  return {
    grid: { left: 70, right: 20, top: 20, bottom: 30 },
    tooltip: {
      trigger: 'axis', axisPointer: { type: 'shadow' }, textStyle: { fontSize: 11 },
      formatter: (ps) => {
        const i = ps[0].dataIndex;
        const st = steps[i];
        return `${st.name}<br/>${fmtMoney(st.v)}`;
      },
    },
    xAxis: { type: 'category', data: steps.map(s2 => s2.name), axisLabel: { fontSize: 10 } },
    yAxis: { type: 'value', axisLabel: { fontSize: 10 } },
    series: [
      { type: 'bar', stack: 'w', barWidth: 34, itemStyle: { color: 'transparent' }, data: helpers, silent: true },
      { type: 'bar', stack: 'w', barWidth: 34, itemStyle: { borderRadius: 3 }, data, name: '金额' },
    ],
  };
});

async function init() {
  facets.value = await orderFinanceApi.facets();
  await load();
}
init();</script>
