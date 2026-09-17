<template>
  <div>
    <div v-if="data.empty" class="page-card">
      <div class="page-title">库存管理</div>
      <p class="muted">{{ data.message }}</p>
      <router-link to="/data/upload"><el-button type="primary">去导入库存表</el-button></router-link>
    </div>

    <template v-else>
      <div class="alert-box blue">
        📦 数据来自你上传的库存表（报表日期：{{ data.report_date || '—' }}）。
        「缺货 / 库存偏低 / 库龄偏大 / 滞销风险」按阈值判定（当前：可售天数 &lt;
        {{ data.thresholds.low_days }} 天算偏低，库龄 ≥ {{ data.thresholds.slow_days }} 天算偏大）。
        <el-button link type="primary" style="margin-left:6px" @click="openThr">调整阈值</el-button>
        <router-link to="/sys/setting" class="link">系统设置</router-link>
      </div>

      <el-row :gutter="12">
        <el-col :span="4" v-for="k in kpis" :key="k.label">
          <div class="page-card" style="text-align:center">
            <div class="muted">{{ k.label }}</div>
            <div style="font-size:22px;font-weight:600;margin-top:6px" :style="{ color: k.color }">{{ k.value }}</div>
          </div>
        </el-col>
      </el-row>

      <div v-if="data.alerts.length" class="page-card">
        <div class="page-title">库存预警</div>
        <ul style="margin:0;padding-left:18px">
          <li v-for="(a, i) in data.alerts" :key="i" style="line-height:1.9">{{ a }}</li>
        </ul>
      </div>

      <el-row :gutter="16">
        <el-col :span="10">
          <div class="page-card">
            <div class="page-title">按站点库存金额</div>
            <div ref="el" style="height:280px"></div>
          </div>
        </el-col>
        <el-col :span="14">
          <div class="page-card">
            <div class="page-title">按站点汇总</div>
            <el-table :data="data.by_site" size="small" height="280" border>
              <el-table-column prop="name" label="站点" width="90" />
              <el-table-column prop="skus" label="SKU 数" align="right" />
              <el-table-column prop="available" label="可售" align="right" />
              <el-table-column prop="inbound" label="在途" align="right" />
              <el-table-column prop="value" label="库存金额" align="right" />
              <el-table-column prop="fee" label="仓储费" align="right" />
            </el-table>
          </div>
        </el-col>
      </el-row>

      <div class="page-card">
        <div class="page-title">
          库存明细（{{ filtered.length }} / {{ data.records.length }} 行）
          <div style="float:right;display:flex;gap:8px">
            <el-select v-model="filterTag" size="small" style="width:130px" clearable placeholder="全部标签">
              <el-option label="缺货" value="缺货" />
              <el-option label="库存偏低" value="库存偏低" />
              <el-option label="库龄偏大" value="库龄偏大" />
              <el-option label="滞销风险" value="滞销风险" />
              <el-option label="正常" value="正常" />
            </el-select>
            <el-select v-model="filterSite" size="small" style="width:110px" clearable placeholder="全部站点">
              <el-option v-for="s in sites" :key="s" :label="s" :value="s" />
            </el-select>
            <el-input v-model="kw" size="small" style="width:160px" placeholder="搜 SKU / 名称" clearable />
            <el-select v-model="sort" size="small" style="width:130px" @change="load">
              <el-option label="按库存金额" value="value" />
              <el-option label="按可售天数" value="days" />
              <el-option label="按库龄" value="age" />
              <el-option label="按可售库存" value="available" />
            </el-select>
          </div>
        </div>
        <el-table :data="filtered" size="small" height="420" border>
          <el-table-column prop="sku" label="SKU" width="130" fixed />
          <el-table-column prop="name" label="商品名称" min-width="150" show-overflow-tooltip />
          <el-table-column label="平台/站点" width="130">
            <template #default="{ row }">{{ row.platform || '—' }} / {{ row.site || '—' }}</template>
          </el-table-column>
          <el-table-column prop="warehouse" label="仓库" width="100" />
          <el-table-column prop="available" label="可售" align="right" width="80" />
          <el-table-column prop="inbound" label="在途" align="right" width="80" />
          <el-table-column prop="reserved" label="预留" align="right" width="80" />
          <el-table-column prop="daily_sales" label="日均销量" align="right" width="90" />
          <el-table-column prop="days_of_supply" label="可售天数" align="right" width="90">
            <template #default="{ row }">
              <span :style="{ color: row.days_of_supply != null && row.days_of_supply < data.thresholds.low_days ? '#FE2C55' : '' }">
                {{ row.days_of_supply ?? '—' }}
              </span>
            </template>
          </el-table-column>
          <el-table-column prop="reorder_point" label="补货点" align="right" width="90" />
          <el-table-column prop="stock_value" label="库存金额" align="right" width="110" />
          <el-table-column prop="storage_fee" label="仓储费" align="right" width="90" />
          <el-table-column prop="age_days" label="库龄" align="right" width="80" />
          <el-table-column label="状态" width="170">
            <template #default="{ row }">
              <el-tag v-for="t in row.tags" :key="t" size="small" :type="tagType(t)" style="margin-right:4px">{{ t }}</el-tag>
              <span v-if="!row.tags.length" class="muted">正常</span>
            </template>
          </el-table-column>
        </el-table>
      </div>
    </template>

    <el-dialog v-model="thrDlg" title="库存预警阈值" width="460px">
      <el-form label-width="150px" size="small">
        <el-form-item label="低库存天数">
          <el-input-number v-model="thrForm.low" :min="1" :max="365" />
          <span class="muted" style="margin-left:8px">可售天数低于此值 → 低库存</span>
        </el-form-item>
        <el-form-item label="滞销库龄（天）">
          <el-input-number v-model="thrForm.slow" :min="7" :max="730" />
          <span class="muted" style="margin-left:8px">库龄 / 可供天数超过此值 → 滞销积压</span>
        </el-form-item>
      </el-form>
      <div class="muted">
        这两个阈值同时作用于「库存管理」页与总览看板。保存后会立即重算指标快照，口径全站一致。
      </div>
      <template #footer>
        <el-button @click="thrDlg = false">取 消</el-button>
        <el-button type="primary" :loading="saving" @click="saveThr">保存并重算</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { computed, nextTick, onMounted, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { opsApi, sysApi } from '../../api/index.js';
import { useChart } from '../../utils/chart.js';

const data = ref({ empty: true, message: '加载中…', alerts: [], records: [], by_site: [], kpi: null, thresholds: { low_days: 14, slow_days: 90 } });
const sort = ref('value');
const kw = ref('');
const filterTag = ref('');
const filterSite = ref('');

// 阈值快捷调整（与「系统设置」共用同一份参数）
const thrDlg = ref(false), saving = ref(false);
const thrForm = ref({ low: 14, slow: 90 });
function openThr() {
  thrForm.value = { low: data.value.thresholds?.low_days ?? 14, slow: data.value.thresholds?.slow_days ?? 90 };
  thrDlg.value = true;
}
async function saveThr() {
  saving.value = true;
  try {
    // 一次提交两个阈值 → 后端只重算一次指标快照
    const r = await sysApi.saveSettings([
      { config_key: 'inventory_low_days', config_value: String(thrForm.value.low), remark: '【库存】可售天数低于该值 → 低库存预警（天）' },
      { config_key: 'inventory_slow_days', config_value: String(thrForm.value.slow), remark: '【库存】库龄或可供天数超过该值 → 滞销积压预警（天）' },
    ]);
    ElMessage.success(r?.recalculated ? '阈值已保存，指标已按新口径重算' : '阈值已保存');
    thrDlg.value = false;
    await load();
  } catch (e) {
    ElMessage.error('保存失败：' + (e?.message || e));
  } finally { saving.value = false; }
}

const fmt = (n) => (n == null ? '—' : Number(n).toLocaleString('zh-CN'));
const kpis = computed(() => {
  const k = data.value.kpi;
  if (!k) return [];
  const recs = data.value.records;
  const cnt = (t) => recs.filter((r) => r.tags.includes(t)).length;
  return [
    { label: 'SKU 数', value: fmt(k.skus) },
    { label: '可售库存', value: fmt(k.available) },
    { label: '在途库存', value: fmt(k.inbound) },
    { label: '库存金额', value: fmt(k.stock_value) },
    { label: '可供天数', value: k.cover_days == null ? '—' : k.cover_days + ' 天' },
    { label: '缺货 / 偏低', value: `${cnt('缺货')} / ${cnt('库存偏低')}`, color: cnt('缺货') ? '#FE2C55' : '' },
  ];
});
const sites = computed(() => [...new Set(data.value.records.map((r) => r.site).filter(Boolean))]);
const filtered = computed(() => data.value.records.filter((r) => {
  if (filterSite.value && r.site !== filterSite.value) return false;
  if (filterTag.value === '正常') { if (r.tags.length) return false; }
  else if (filterTag.value && !r.tags.includes(filterTag.value)) return false;
  if (kw.value) {
    const q = kw.value.toLowerCase();
    if (!String(r.sku || '').toLowerCase().includes(q) && !String(r.name || '').toLowerCase().includes(q)) return false;
  }
  return true;
}));
const tagType = (t) => ({ 缺货: 'danger', 库存偏低: 'warning', 库龄偏大: 'warning', 滞销风险: 'info' }[t] || 'info');

const { el, render } = useChart(() => ({
  tooltip: { trigger: 'axis' },
  grid: { left: 70, right: 20, top: 20, bottom: 40 },
  xAxis: { type: 'category', data: (data.value.by_site || []).map((s) => s.name), axisLabel: { color: '#8B8B9E' } },
  yAxis: { type: 'value', axisLabel: { color: '#8B8B9E' } },
  series: [{
    type: 'bar', barMaxWidth: 40, itemStyle: { color: '#25F4EE' },
    data: (data.value.by_site || []).map((s) => s.value),
    label: { show: true, position: 'top', formatter: (p) => Number(p.value).toLocaleString('zh-CN') },
  }],
}));

async function load() {
  data.value = await opsApi.inventory({ sort: sort.value });
  // 图表容器挂在 v-if 区域内，等 DOM 渲染完成后再画
  await nextTick();
  render();
}
onMounted(load);
</script>
