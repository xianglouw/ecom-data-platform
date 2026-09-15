<template>
  <div>
    <div class="timerange">
      <el-radio-group v-model="days" size="small">
        <el-radio-button :value="7">近 7 天</el-radio-button>
        <el-radio-button :value="14">近 14 天</el-radio-button>
        <el-radio-button :value="30">近 30 天</el-radio-button>
      </el-radio-group>
      <span class="muted">复盘区间 {{ data.range?.[0] }} ~ {{ data.range?.[1] }}</span>
    </div>

    <div v-if="alerts.length" class="alert-box danger">
      🚨 {{ alerts.length }} 项异常待人工复核（判定与依据已列出，落地由人执行）
    </div>

    <div class="stat-grid">
      <div class="stat-card"><div class="label">GMV</div><div class="value">{{ fmtMoney(kpi.gmv) }}</div>
        <div class="delta">本期区间 {{ data.range?.[0] }} 起</div></div>
      <div class="stat-card"><div class="label">广告花费</div><div class="value">{{ fmtMoney(kpi.spend) }}</div>
        <div class="delta">TACOS {{ kpi.gmv ? (kpi.spend / kpi.gmv * 100).toFixed(1) + '%' : '—' }}</div></div>
      <div class="stat-card"><div class="label">ROAS</div><div class="value">{{ kpi.roas?.toFixed(2) ?? '—' }}</div>
        <div class="delta">保本参考 2.50</div></div>
      <div class="stat-card"><div class="label">净利润（毛估）</div>
        <div class="value" :style="kpi.profit < 0 ? 'color:#dc2626' : 'color:#16a34a'">{{ fmtMoney(kpi.profit) }}</div>
        <div class="delta">GMV − 退款 − 货成本 − 广告</div></div>
    </div>

    <!-- 订单结算财务（真实口径） -->
    <div v-if="data.finance" class="page-card" style="margin-bottom:16px">
      <div class="page-title">
        订单结算财务（{{ data.finance.currency }} 真实口径）
        <router-link to="/order/finance" style="font-size:12px;margin-left:10px">进入订单财务明细 →</router-link>
      </div>
      <div class="stat-grid" style="margin-bottom:0">
        <div class="stat-card"><div class="label">结算订单</div><div class="value">{{ data.finance.kpi.orders }}</div>
          <div class="delta">{{ data.finance.kpi.sku_count }} 个 SKU · 销量 {{ data.finance.kpi.units }} 件</div></div>
        <div class="stat-card"><div class="label">结算收入</div><div class="value">{{ fmtMoney(data.finance.kpi.revenue) }}</div>
          <div class="delta">≈ ${{ fmtNum(data.finance.revenue_usd) }}（汇率 {{ data.finance.fx_usd }}）</div></div>
        <div class="stat-card"><div class="label">净利润</div>
          <div class="value" :style="data.finance.kpi.profit < 0 ? 'color:#dc2626' : 'color:#16a34a'">{{ fmtMoney(data.finance.kpi.profit) }}</div>
          <div class="delta">收入 − 佣金 − 附加费 − 运费 − 退款</div></div>
        <div class="stat-card"><div class="label">净利率</div><div class="value">{{ data.finance.kpi.margin_rate }}%</div>
          <div class="delta">平台费率 {{ data.finance.kpi.fee_rate }}%</div></div>
        <div class="stat-card"><div class="label">广告单占比</div><div class="value">{{ data.finance.kpi.ad_order_rate }}%</div>
          <div class="delta">广告单 {{ data.finance.kpi.ad_orders }} / {{ data.finance.kpi.orders }}</div></div>
      </div>
    </div>

    <el-row :gutter="16">
      <el-col :span="12">
        <div class="page-card">
          <div class="page-title">异常告警（{{ alerts.length }}）</div>
          <div v-for="a in alerts" :key="a" class="alert-box" style="margin-bottom:8px">🚨 {{ a }}</div>
          <div v-if="!alerts.length" class="alert-box" style="background:#f0fdf4;border-color:#22c55e;color:#166534">✅ 本期无异常</div>
        </div>
      </el-col>
      <el-col :span="12">
        <div class="page-card">
          <div class="page-title">平台环比（vs 上一周期）</div>
          <el-table :data="data.deltas || []" size="small" border>
            <el-table-column prop="platform" label="平台" />
            <el-table-column label="本期 GMV" align="right">
              <template #default="{ row }">{{ fmtMoney(row.cur.gmv) }}</template>
            </el-table-column>
            <el-table-column label="上期 GMV" align="right">
              <template #default="{ row }">{{ fmtMoney(row.prev.gmv) }}</template>
            </el-table-column>
            <el-table-column label="本期花费" align="right">
              <template #default="{ row }">{{ fmtMoney(row.cur.spend) }}</template>
            </el-table-column>
            <el-table-column label="上期花费" align="right">
              <template #default="{ row }">{{ fmtMoney(row.prev.spend) }}</template>
            </el-table-column>
          </el-table>
        </div>
      </el-col>
    </el-row>
  </div>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import { opsApi } from '../../api/index.js';
import { fmtMoney, fmtNum } from '../../utils/chart.js';

const days = ref(7), data = ref({ kpi: {}, deltas: [], alerts: [], finance: null });
const kpi = computed(() => data.value.kpi || {});
const alerts = computed(() => data.value.alerts || []);

async function load() { data.value = await opsApi.review({ days: days.value }); }
onMounted(load);
watch(days, load);
</script>
