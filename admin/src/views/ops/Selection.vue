<template>
  <div>
    <div v-if="data.flags?.length" class="alert-box">
      <div v-for="f in data.flags" :key="f">⚠️ {{ f }}</div>
    </div>
    <div v-for="n in data.need_human_review || []" :key="n.msg" class="alert-box blue">ℹ️ {{ n.msg }}</div>

    <div class="page-card">
      <div class="page-title">
        选品测算（{{ site }} 站）
        <div>
          <el-select v-model="site" size="small" style="width:110px">
            <el-option v-for="s in ['MX', 'US', 'BR', 'DE']" :key="s" :label="s" :value="s" />
          </el-select>
          <span style="margin:0 8px" class="muted">目标毛利率</span>
          <el-input-number v-model="margin" :min="0" :max="0.8" :step="0.05" size="small" style="width:120px" />
        </div>
      </div>
      <el-table :data="records" v-loading="loading" border stripe size="small">
        <el-table-column prop="sku" label="SKU" width="90" />
        <el-table-column prop="name" label="商品" min-width="160" />
        <el-table-column label="售价" width="90" align="right">
          <template #default="{ row }">${{ row.price?.toFixed(2) }}</template>
        </el-table-column>
        <el-table-column label="成本" width="80" align="right">
          <template #default="{ row }">${{ row.cost?.toFixed(2) }}</template>
        </el-table-column>
        <el-table-column label="运费" width="80" align="right">
          <template #default="{ row }">${{ row.freight?.toFixed(2) }}</template>
        </el-table-column>
        <el-table-column label="平台费率" width="90" align="right">
          <template #default="{ row }">{{ (row.fee_rate * 100).toFixed(1) }}%</template>
        </el-table-column>
        <el-table-column label="单件净利" width="100" align="right">
          <template #default="{ row }">
            <span :style="row.net_profit < 0 ? 'color:#dc2626;font-weight:600' : 'color:#16a34a'">${{ row.net_profit?.toFixed(2) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="毛利率" width="80" align="right">
          <template #default="{ row }">{{ row.margin == null ? '—' : (row.margin * 100).toFixed(1) + '%' }}</template>
        </el-table-column>
        <el-table-column label="保本价" width="90" align="right">
          <template #default="{ row }">${{ row.breakeven_price?.toFixed(2) }}</template>
        </el-table-column>
        <el-table-column label="目标价" width="90" align="right">
          <template #default="{ row }">${{ row.target_price?.toFixed(2) }}</template>
        </el-table-column>
        <el-table-column label="判定" width="90">
          <template #default="{ row }">
            <el-tag size="small" :type="row.status === '亏损' ? 'danger' : row.status === '低毛利' ? 'warning' : 'success'">
              {{ row.status }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="review" label="建议" min-width="200" />
      </el-table>
      <div class="muted" style="margin-top:8px">
        净利 = 售价 ×（1 − 平台费率）− 成本 − 运费；保本价 =（成本 + 运费）÷（1 − 平台费率）。费率与运费取自「系统设置 → 运费表 / 费率规则」。
      </div>
    </div>
  </div>
</template>

<script setup>
import { onMounted, ref, watch } from 'vue';
import { opsApi } from '../../api/index.js';

const site = ref('MX'), margin = ref(0.2), loading = ref(false);
const data = ref({}), records = ref([]);

async function load() {
  loading.value = true;
  try {
    data.value = await opsApi.selection({ site: site.value, target_margin: margin.value });
    records.value = data.value.records || [];
  } finally { loading.value = false; }
}
onMounted(load);
watch([site, margin], load);
</script>
