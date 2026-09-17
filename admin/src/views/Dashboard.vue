<template>
  <div>
    <!-- 筛选栏：周期 / 平台 / 站点，联动整页 -->
    <div class="timerange">
      <el-radio-group v-model="days" size="small">
        <el-radio-button :value="7">近 7 天</el-radio-button>
        <el-radio-button :value="30">近 30 天</el-radio-button>
        <el-radio-button :value="90">近 90 天</el-radio-button>
      </el-radio-group>
      <el-select v-model="platform" placeholder="全部平台" clearable size="small" style="width:150px">
        <el-option v-for="p in meta.platforms" :key="p" :label="p" :value="p" />
      </el-select>
      <el-select v-model="site" placeholder="全部站点" clearable size="small" style="width:120px">
        <el-option v-for="s in meta.sites" :key="s" :label="s" :value="s" />
      </el-select>
      <span class="muted">数据区间 {{ data.range?.[0] }} ~ {{ data.range?.[1] }}</span>
    </div>

    <div v-if="data.flags?.length" class="alert-box">
      <div v-for="f in data.flags" :key="f">⚠️ {{ f }}</div>
    </div>

    <!-- 数据新鲜度：由数据管道自动计算并发布 -->
    <div v-if="pipe.freshness" class="fresh-bar">
      <span class="dot" :class="pipe.freshness.stale ? 'bad' : 'ok'"></span>
      <span v-if="pipe.freshness.stale">指标快照已过期，管道将自动重算</span>
      <span v-else>数据链路正常</span>
      <span class="muted">最近接入 {{ pipe.freshness.last_batch_at || '—' }}</span>
      <span class="muted">最近计算 {{ pipe.freshness.last_compute_at || '—' }}</span>
      <span class="muted">快照 {{ pipe.freshness.metric_rows }} 条</span>
      <router-link to="/data/pipeline" class="link">数据管道 →</router-link>
    </div>

    <!-- KPI -->
    <div class="stat-grid">
      <div class="stat-card" v-for="k in kpis" :key="k.label">
        <div class="label">{{ k.label }}</div>
        <div class="value" :style="k.color ? `color:${k.color}` : ''">{{ k.text }}</div>
        <div class="delta">
          环比 <b :class="k.up === null ? '' : k.up ? 'up' : 'down'">{{ k.delta }}</b>
          <span class="muted"> · 上期 {{ k.prev }}</span>
        </div>
      </div>
    </div>

    <el-row :gutter="16">
      <el-col :span="16">
        <div class="page-card">
          <div class="page-title">GMV / 广告趋势 <span class="muted">点击柱体 → 当日销售明细</span></div>
          <div ref="trendEl" class="chart-box"></div>
        </div>
      </el-col>
      <el-col :span="8">
        <div class="page-card">
          <div class="page-title">平台 GMV 占比 <span class="muted">点击扇区下钻</span></div>
          <div ref="pieEl" class="chart-box"></div>
        </div>
      </el-col>
    </el-row>

    <!-- 库存概览（来自上传的库存表） -->
    <template v-if="data.inventory">
      <div style="display:flex;justify-content:space-between;align-items:center;margin:16px 0 8px">
        <span style="font-weight:600">库存概览 <el-tag size="small" type="success">来自你上传的库存表</el-tag>
          <span class="muted" style="font-weight:400;margin-left:8px">报表日期 {{ data.inventory.report_date || '—' }}</span>
        </span>
        <el-button size="small" text type="primary" @click="$router.push('/ops/inventory')">进入库存管理 →</el-button>
      </div>
      <div class="stat-grid">
        <div class="stat-card" v-for="k in invKpis" :key="k.label" style="cursor:pointer" @click="$router.push('/ops/inventory')">
          <div class="label">{{ k.label }}</div>
          <div class="value" :style="k.color ? `color:${k.color}` : ''">{{ k.text }}</div>
          <div class="delta"><span class="muted">{{ k.sub }}</span></div>
        </div>
      </div>
    </template>

    <!-- 广告花费明细（来自上传的广告表） -->
    <template v-if="data.ads_detail">
      <div style="display:flex;justify-content:space-between;align-items:center;margin:16px 0 8px">
        <span style="font-weight:600">广告花费明细 <el-tag size="small" type="success">来自你上传的广告表</el-tag>
          <span class="muted" style="font-weight:400;margin-left:8px">{{ data.ads_detail.range[0] }} ~ {{ data.ads_detail.range[1] }}</span>
        </span>
        <el-button size="small" text type="primary" @click="$router.push('/ops/ads')">进入广告投放 →</el-button>
      </div>
      <div class="stat-grid">
        <div class="stat-card" v-for="k in adsKpis" :key="k.label" style="cursor:pointer" @click="$router.push('/ops/ads')">
          <div class="label">{{ k.label }}</div>
          <div class="value" :style="k.color ? `color:${k.color}` : ''">{{ k.text }}</div>
          <div class="delta"><span class="muted">{{ k.sub }}</span></div>
        </div>
      </div>
    </template>

    <!-- 订单结算财务（真实口径） -->
    <template v-if="data.finance">
      <div style="display:flex;justify-content:space-between;align-items:center;margin:16px 0 8px">
        <span style="font-weight:600">订单结算财务 <el-tag size="small" type="warning">{{ data.finance.currency }} 真实结算口径</el-tag>
          <span class="muted" style="font-weight:400;margin-left:8px">1 {{ data.finance.currency }} ≈ ${{ data.finance.fx_usd }}</span>
        </span>
        <el-button size="small" text type="primary" @click="$router.push('/order/finance')">进入订单财务明细 →</el-button>
      </div>
      <div class="stat-grid">
        <div class="stat-card" v-for="k in finKpis" :key="k.label" style="cursor:pointer" @click="$router.push('/order/finance')">
          <div class="label">{{ k.label }}</div>
          <div class="value" :style="k.color ? `color:${k.color}` : ''">{{ k.text }}</div>
          <div class="delta"><span class="muted">{{ k.sub }}</span></div>
        </div>
      </div>
      <el-row :gutter="16">
        <el-col :span="16">
          <div class="page-card">
            <div class="page-title">结算 SKU 收入 vs 净利 Top 10 <span class="muted">点击柱体 → 按 SKU 过滤订单明细</span></div>
            <div ref="finSkuEl" class="chart-box"></div>
          </div>
        </el-col>
        <el-col :span="8">
          <div class="page-card">
            <div class="page-title">结算成本构成 <span class="muted">从收入中扣减的项目</span></div>
            <div ref="finCostEl" class="chart-box"></div>
          </div>
        </el-col>
      </el-row>
    </template>

    <el-row :gutter="16">
      <el-col :span="16">
        <div class="page-card">
          <div class="page-title">Top 10 商品 <span class="muted">点击柱体 → 商品详情</span></div>
          <div ref="topEl" class="chart-sm"></div>
        </div>
      </el-col>
      <el-col :span="8">
        <div class="page-card">
          <div class="page-title">平台指标对比</div>
          <el-table :data="data.platform || []" size="small" height="260" @row-click="onPlatform">
            <el-table-column prop="name" label="平台" />
            <el-table-column label="GMV" align="right">
              <template #default="{ row }">{{ fmtMoney(row.gmv) }}</template>
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
import { computed, onMounted, reactive, ref, watch, nextTick } from 'vue';
import { useRouter } from 'vue-router';
import * as echarts from 'echarts';
import { opsApi, pipelineApi } from '../api/index.js';
import { fmtMoney, fmtNum, fmtPct } from '../utils/chart.js';

const router = useRouter();
const days = ref(30), platform = ref(''), site = ref('');
const data = ref({ kpi: {}, prev_kpi: {}, trend: [], platform: [], top_products: [], range: [] });
const meta = ref({ platforms: [], sites: [] });
const pipe = ref({});
const trendEl = ref(null), pieEl = ref(null), topEl = ref(null);
const finSkuEl = ref(null), finCostEl = ref(null);
let trendChart, pieChart, topChart, finSkuChart, finCostChart;

async function load() {
  const params = { days: days.value };
  if (platform.value) params.platform = platform.value;
  if (site.value) params.site = site.value;
  data.value = await opsApi.overview(params);
  await nextTick();
  renderTrend(); renderPie(); renderTop(); renderFinSku(); renderFinCost();
}

/** 订单结算财务 KPI（真实口径，点击进入订单财务页） */
const finKpis = computed(() => {
  const f = data.value.finance;
  if (!f) return [];
  const k = f.kpi;
  return [
    { label: '结算订单数', text: fmtNum(k.orders), sub: `销量 ${fmtNum(k.units)} 件 · ${k.sku_count} 个 SKU` },
    { label: `结算收入（${f.currency}）`, text: fmtMoney(k.revenue), sub: `≈ $${fmtNum(f.revenue_usd)}` },
    { label: `净利润（${f.currency}）`, text: fmtMoney(k.profit), sub: `单均净利 ${fmtMoney(k.profit_per_order)} · ≈ $${fmtNum(f.profit_usd)}`, color: k.profit < 0 ? '#d03050' : undefined },
    { label: '净利率', text: (k.margin_rate ?? '—') + '%', sub: `平台费率 ${k.fee_rate}%`, color: (k.margin_rate || 0) < 15 ? '#d03050' : undefined },
    { label: '退款率', text: (k.refund_rate ?? '—') + '%', sub: `退款额 ${fmtMoney(Math.abs(k.refund))}` },
    { label: '广告单占比', text: (k.ad_order_rate ?? '—') + '%', sub: `广告单 ${fmtNum(k.ad_orders)} / ${fmtNum(k.orders)}` },
  ];
});

/** 库存 KPI（来自上传的库存表，点击进入库存管理页） */
const invKpis = computed(() => {
  const v = data.value.inventory;
  if (!v) return [];
  const k = v.kpi;
  const fmt = (n) => (n == null ? '—' : Number(n).toLocaleString('zh-CN'));
  return [
    { label: '在库 SKU', text: fmt(k.skus), sub: `${v.by_site?.length || 0} 个站点` },
    { label: '可售库存', text: fmt(k.available), sub: `在途 ${fmt(k.inbound)} · 预留 ${fmt(k.reserved)}` },
    { label: '库存金额', text: fmt(k.stock_value), sub: `仓储费 ${fmt(k.storage_fee)}` },
    { label: '可供天数', text: k.cover_days == null ? '—' : k.cover_days + ' 天', sub: '总库存 ÷ 日均销量' },
    { label: '缺货 SKU', text: fmt(v.oos_skus), sub: '可售与总库存均为 0', color: v.oos_skus ? '#d03050' : undefined },
    { label: '低库存 / 库龄超期', text: `${fmt(v.low_skus)} / ${fmt(v.aging_skus)}`, sub: `天数阈值 ${v.thresholds.low_days} / ${v.thresholds.slow_days}`, color: (v.low_skus || v.aging_skus) ? '#e6a23c' : undefined },
  ];
});

/** 广告明细 KPI（来自上传的广告表，点击进入广告投放页） */
const adsKpis = computed(() => {
  const a = data.value.ads_detail;
  if (!a) return [];
  const fmt = (n) => (n == null ? '—' : Number(n).toLocaleString('zh-CN'));
  const losing = (a.top_campaigns || []).filter((c) => c.roas != null && c.roas < 1).length;
  return [
    { label: '广告花费', text: fmt(a.spend), sub: `${a.campaigns} 个活动` },
    { label: '广告销售额', text: fmt(a.ad_sales), sub: `订单 ${fmt(a.orders)}` },
    { label: 'ROAS', text: a.roas == null ? '—' : a.roas, sub: '广告销售额 ÷ 花费', color: a.roas != null && a.roas < 1 ? '#d03050' : undefined },
    { label: 'ACOS', text: a.acos == null ? '—' : (a.acos * 100).toFixed(1) + '%', sub: '花费 ÷ 广告销售额' },
    { label: 'CPC', text: a.cpc == null ? '—' : a.cpc, sub: `CTR ${a.ctr == null ? '—' : (a.ctr * 100).toFixed(2) + '%'}` },
    { label: '亏损活动', text: losing, sub: '花费 > 广告销售额', color: losing ? '#d03050' : undefined },
  ];
});

function renderFinSku() {
  if (!finSkuEl.value || !data.value.finance) return;
  finSkuChart = finSkuChart || echarts.init(finSkuEl.value);
  const top = data.value.finance.top_sku || [];
  finSkuChart.setOption({
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    legend: { top: 0 },
    grid: { left: 100, right: 50, top: 30, bottom: 22 },
    xAxis: { type: 'value' },
    yAxis: { type: 'category', data: top.map(x => x.sku).reverse(), axisLabel: { fontSize: 10, width: 90, overflow: 'truncate' } },
    series: [
      { name: '收入', type: 'bar', data: top.map(x => x.revenue).reverse(), barMaxWidth: 12, itemStyle: { color: '#2563eb', borderRadius: [0, 3, 3, 0] } },
      { name: '净利', type: 'bar', data: top.map(x => x.profit).reverse(), barMaxWidth: 12, itemStyle: { color: '#16a34a', borderRadius: [0, 3, 3, 0] } },
    ],
  }, true);
  finSkuChart.off('click');
  finSkuChart.on('click', p => router.push({ path: '/order/finance', query: { sku: top[top.length - 1 - p.dataIndex].sku } }));
}
function renderFinCost() {
  if (!finCostEl.value || !data.value.finance) return;
  finCostChart = finCostChart || echarts.init(finCostEl.value);
  const cs = data.value.finance.cost_structure || [];
  finCostChart.setOption({
    tooltip: { trigger: 'item', formatter: '{b}: {c} ({d}%)' },
    series: [{ type: 'pie', radius: ['42%', '70%'], data: cs.map(x => ({ name: x.name, value: x.value })),
      label: { formatter: '{b}\n{d}%' }, itemStyle: { borderRadius: 6, borderColor: '#fff', borderWidth: 2 } }],
  }, true);
  finCostChart.off('click');
  finCostChart.on('click', p => router.push('/order/finance'));
}

const kpis = computed(() => {
  const k = data.value.kpi || {}, p = data.value.prev_kpi || {};
  const mk = (label, key, text, prevText, invert) => {
    const cur = k[key], prev = p[key];
    let delta = '—', up = null;
    if (cur != null && prev != null && prev !== 0) {
      const d = (cur - prev) / prev;
      delta = (d >= 0 ? '+' : '') + (d * 100).toFixed(1) + '%';
      up = invert ? d > 0 : d < 0 ? false : true;
      up = invert ? d > 0 : d < 0;
    }
    return { label, text, prev: prevText, delta, up, color: key === 'profit' && cur < 0 ? '#dc2626' : '' };
  };
  return [
    mk('GMV', 'gmv', fmtMoney(k.gmv), fmtMoney(p.gmv)),
    mk('订单数', 'orders', fmtNum(k.orders), fmtNum(p.orders)),
    mk('广告花费', 'spend', fmtMoney(k.spend), fmtMoney(p.spend), true),
    mk('ROAS', 'roas', k.roas?.toFixed(2) ?? '—', p.roas?.toFixed(2) ?? '—'),
    mk('净利润（毛估）', 'profit', fmtMoney(k.profit), fmtMoney(p.profit)),
    mk('退款率', 'refund_rate', fmtPct(k.refund_rate), fmtPct(p.refund_rate), true),
    mk('客单价', 'aov', fmtMoney(k.aov), fmtMoney(p.aov)),
    mk('TACOS', 'tacos', fmtPct(k.tacos), fmtPct(p.tacos), true),
  ];
});

function renderTrend() {
  if (!trendEl.value) return;
  trendChart = trendChart || echarts.init(trendEl.value);
  const t = data.value.trend || [];
  trendChart.setOption({
    tooltip: { trigger: 'axis' }, legend: { top: 0 }, grid: { left: 55, right: 20, top: 36, bottom: 28 },
    xAxis: { type: 'category', data: t.map(x => x.date.slice(5)) },
    yAxis: [{ type: 'value', name: '金额' }, { type: 'value', name: '净利', splitLine: { show: false } }],
    series: [
      { name: 'GMV', type: 'bar', data: t.map(x => x.gmv), itemStyle: { color: '#2563eb', borderRadius: [3, 3, 0, 0] } },
      { name: '广告销售额', type: 'line', smooth: true, data: t.map(x => x.ad_sales), itemStyle: { color: '#f59e0b' } },
      { name: '净利', type: 'line', yAxisIndex: 1, smooth: true, data: t.map(x => x.profit),
        itemStyle: { color: '#16a34a' }, areaStyle: { opacity: 0.08 } },
    ],
  }, true);
  trendChart.off('click');
  trendChart.on('click', p => router.push({ path: '/ops/sales', query: { platform: platform.value, date: t[p.dataIndex].date } }));
}
function renderPie() {
  if (!pieEl.value) return;
  pieChart = pieChart || echarts.init(pieEl.value);
  pieChart.setOption({
    tooltip: { trigger: 'item', formatter: '{b}: ${c} ({d}%)' },
    series: [{ type: 'pie', radius: ['42%', '70%'], data: (data.value.platform || []).map(x => ({ name: x.name, value: x.gmv })),
      label: { formatter: '{b}\n{d}%' }, itemStyle: { borderRadius: 6, borderColor: '#fff', borderWidth: 2 } }],
  }, true);
  pieChart.off('click');
  pieChart.on('click', p => router.push({ path: '/ops/sales', query: { platform: p.name } }));
}
function renderTop() {
  if (!topEl.value) return;
  topChart = topChart || echarts.init(topEl.value);
  const top = data.value.top_products || [];
  topChart.setOption({
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    grid: { left: 80, right: 40, top: 8, bottom: 22 },
    xAxis: { type: 'value' }, yAxis: { type: 'category', data: top.map(x => x.sku).reverse() },
    series: [{ type: 'bar', data: top.map(x => x.gmv).reverse(), barMaxWidth: 16,
      itemStyle: { color: '#2563eb', borderRadius: [0, 4, 4, 0] },
      label: { show: true, position: 'right', formatter: p => fmtMoney(p.value) } }],
  }, true);
  topChart.off('click');
  topChart.on('click', p => router.push(`/ops/product/${top[top.length - 1 - p.dataIndex].sku}`));
}
function onPlatform(row) {
  router.push({ path: '/ops/sales', query: { platform: row.name } });
}

onMounted(async () => {
  meta.value = await opsApi.meta();
  pipelineApi.status().then(s => { pipe.value = s; }).catch(() => {});
  load();
});
watch([days, platform, site], load);
</script>
