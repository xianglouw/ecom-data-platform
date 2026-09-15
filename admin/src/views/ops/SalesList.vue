<template>
  <div>
    <div class="page-card">
      <div class="page-title">销售 / 广告日明细 <span class="muted">点击行 → 商品详情</span></div>
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
        <el-input v-model="campaign" placeholder="广告活动关键词" clearable size="small" style="width:180px" />
      </div>
      <el-table :data="records" v-loading="loading" border stripe size="small" height="620" @row-click="onRow">
        <el-table-column prop="date" label="日期" width="100" />
        <el-table-column prop="platform" label="平台" width="120" />
        <el-table-column prop="site" label="站点" width="70" />
        <el-table-column prop="campaign" label="广告活动" min-width="150" />
        <el-table-column prop="sku" label="SKU" width="90" />
        <el-table-column prop="impressions" label="曝光" width="90" align="right" />
        <el-table-column prop="clicks" label="点击" width="80" align="right" />
        <el-table-column label="花费" width="90" align="right">
          <template #default="{ row }">${{ row.ad_spend?.toFixed(2) }}</template>
        </el-table-column>
        <el-table-column label="广告销售额" width="110" align="right">
          <template #default="{ row }">${{ row.ad_sales?.toFixed(2) }}</template>
        </el-table-column>
        <el-table-column label="ROAS" width="80" align="right">
          <template #default="{ row }">
            <el-tag size="small" :type="row.ad_spend && row.ad_sales / row.ad_spend >= 2.5 ? 'success' : 'danger'">
              {{ row.ad_spend ? (row.ad_sales / row.ad_spend).toFixed(2) : '—' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="units" label="销量" width="70" align="right" />
        <el-table-column label="总销售额" width="100" align="right">
          <template #default="{ row }"><b>${{ row.total_sales?.toFixed(2) }}</b></template>
        </el-table-column>
        <el-table-column label="退款" width="90" align="right">
          <template #default="{ row }">
            <span :style="row.refund > 0 ? 'color:#dc2626' : ''">${{ row.refund?.toFixed(2) }}</span>
          </template>
        </el-table-column>
      </el-table>
      <el-pagination style="margin-top:12px;justify-content:flex-end" layout="total, prev, pager, next"
        :total="total" v-model:current-page="current" v-model:page-size="size" @current-change="load" />
    </div>
  </div>
</template>

<script setup>
import { onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { opsApi } from '../../api/index.js';

const route = useRoute(), router = useRouter();
const records = ref([]), total = ref(0), loading = ref(false), meta = ref({ platforms: [], sites: [] });
const days = ref(30), platform = ref(route.query.platform || ''), site = ref(''), campaign = ref('');
const current = ref(1), size = ref(20);

async function load() {
  loading.value = true;
  try {
    const d = await opsApi.sales({ days: days.value, platform: platform.value, site: site.value,
      campaign: campaign.value, current: current.value, size: size.value });
    records.value = d.records; total.value = d.total;
  } finally { loading.value = false; }
}
function onRow(row) { router.push(`/ops/product/${row.sku}`); }
onMounted(async () => { meta.value = await opsApi.meta(); load(); });
watch([days, platform, site, campaign], () => { current.value = 1; load(); });
</script>
