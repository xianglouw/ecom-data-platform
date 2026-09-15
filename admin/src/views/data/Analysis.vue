<template>
  <div>
    <div class="alert-box blue">
      🔎 <b>表分析</b>：选一张你已经上传的表，挑几个维度 + 几个指标，就能立刻拆出交叉表和图。
      维度就是「按什么分组」（平台／站点／SKU／广告活动／仓库…），指标就是「算什么」（花费／销售额／库存／净利润…）。
      表里未被平台识别的列会以「（扩展列）」形式出现，一样能用来分组。
    </div>

    <div class="page-card">
      <div class="page-title">分析配置</div>
      <el-form label-width="72px" label-position="left">
        <el-row :gutter="12">
          <el-col :span="8">
            <el-form-item label="数据表">
              <el-select v-model="form.dataset" style="width:100%" @change="onDatasetChange">
                <el-option v-for="d in datasets" :key="d.key" :label="`${d.name}（${d.rows} 行）`" :value="d.key" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="行维度">
              <el-select v-model="form.rows" multiple collapse-tags :multiple-limit="3" placeholder="按什么分组（最多 3 个）" style="width:100%">
                <el-option v-for="f in dims" :key="f.col" :label="f.label" :value="f.col" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="8">
            <el-form-item label="列维度">
              <el-select v-model="form.col" clearable placeholder="可选：做成二维交叉表" style="width:100%">
                <el-option v-for="f in dims" :key="f.col" :label="f.label" :value="f.col" />
              </el-select>
            </el-form-item>
          </el-col>
        </el-row>
        <el-row :gutter="12">
          <el-col :span="12">
            <el-form-item label="指标">
              <el-select v-model="form.metrics" multiple collapse-tags :multiple-limit="4" placeholder="算什么（最多 4 个）" style="width:100%">
                <el-option v-for="f in metricFields" :key="f.col" :label="f.label" :value="f.col" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="4">
            <el-form-item label="聚合">
              <el-select v-model="form.agg" style="width:100%">
                <el-option label="求和" value="sum" />
                <el-option label="平均" value="avg" />
                <el-option label="最大" value="max" />
                <el-option label="最小" value="min" />
                <el-option label="计数" value="count" />
                <el-option label="去重计数" value="count_distinct" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="4">
            <el-form-item label="条数">
              <el-input-number v-model="form.limit" :min="10" :max="2000" :step="50" controls-position="right" style="width:100%" />
            </el-form-item>
          </el-col>
          <el-col :span="4">
            <el-form-item label=" ">
              <el-button type="primary" :loading="loading" @click="run">生成分析</el-button>
            </el-form-item>
          </el-col>
        </el-row>
      </el-form>
      <div v-if="current && !current.rows" class="muted">
        ⚠️ 这张表还没有数据，请先到 <router-link to="/data/upload" class="link">数据上传</router-link> 导入。
      </div>
    </div>

    <template v-if="result">
      <div class="page-card">
        <div class="page-title">结论速览 <span class="muted" style="font-weight:400">（由当前结果直接读出，不做推测）</span></div>
        <ul style="margin:0;padding-left:18px">
          <li v-for="(t, i) in result.insights" :key="i" style="line-height:1.9">{{ t }}</li>
        </ul>
        <div class="muted" style="margin-top:8px">SQL：{{ result.sql }}</div>
      </div>

      <div class="page-card">
        <div class="page-title">图表</div>
        <div ref="el" style="height:360px"></div>
      </div>

      <div v-if="result.cross" class="page-card">
        <div class="page-title">二维交叉表（行：{{ result.row_dims.map(labelOf).join(' + ') }} / 列：{{ labelOf(result.col_dim) }}）</div>
        <el-table :data="result.cross.rows" size="small" height="320" border>
          <el-table-column prop="_row" label="分组" width="200" fixed />
          <el-table-column v-for="c in crossCols" :key="c.prop" :prop="c.prop" :label="c.label" align="right" />
        </el-table>
      </div>

      <div class="page-card">
        <div class="page-title">
          明细结果（{{ result.total }} 组）
          <el-button size="small" style="float:right" @click="exportCsv">导出 CSV</el-button>
        </div>
        <el-table :data="result.table" size="small" height="380" border show-summary>
          <el-table-column v-for="c in tableCols" :key="c" :prop="c" :label="colLabel(c)" :align="isMetricKey(c) ? 'right' : 'left'"
            :width="isMetricKey(c) ? 140 : undefined" />
        </el-table>
      </div>
    </template>
  </div>
</template>

<script setup>
import { computed, nextTick, onMounted, reactive, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { analysisApi } from '../../api/index.js';
import { useChart } from '../../utils/chart.js';

const datasets = ref([]);
const result = ref(null);
const loading = ref(false);
const form = reactive({ dataset: '', rows: [], col: '', metrics: [], agg: 'sum', limit: 200 });

const current = computed(() => datasets.value.find((d) => d.key === form.dataset) || null);
const allFields = computed(() => [...(current.value?.fields || []), ...(current.value?.extra_fields || [])]);
const dims = computed(() => allFields.value.filter((f) => f.type === 'dim'));
const metricFields = computed(() => allFields.value.filter((f) => f.type === 'metric'));
const labelOf = (c) => allFields.value.find((f) => f.col === c)?.label || c;

const metricKeys = computed(() => (result.value?.metrics || []).map((m) => `${m.agg}(${m.field})`));
const tableCols = computed(() => (result.value ? [...result.value.row_dims, ...metricKeys.value] : []));
const isMetricKey = (c) => metricKeys.value.includes(c);
const colLabel = (c) => (isMetricKey(c) ? `${labelOf(c.slice(c.indexOf('(') + 1, -1))}（${aggName(c.slice(0, c.indexOf('(')))}）` : labelOf(c));
const aggName = (a) => ({ sum: '求和', avg: '平均', max: '最大', min: '最小', count: '计数', count_distinct: '去重计数' }[a] || a);

const crossCols = computed(() => {
  const rows = result.value?.cross?.rows || [];
  const keys = new Set();
  rows.forEach((r) => Object.keys(r).forEach((k) => k !== '_row' && keys.add(k)));
  return [...keys].map((k) => ({ prop: k, label: k }));
});

const { el, render } = useChart(() => ({
  tooltip: { trigger: 'axis' },
  legend: { type: 'scroll', top: 0 },
  grid: { left: 60, right: 20, top: 40, bottom: 60 },
  xAxis: {
    type: 'category',
    data: result.value?.chart.categories || [],
    axisLabel: { rotate: (result.value?.chart.categories?.length || 0) > 5 ? 30 : 0, color: '#666' },
  },
  yAxis: { type: 'value', axisLabel: { color: '#666' } },
  series: (result.value?.chart.series || []).map((s, i) => ({
    name: `${labelOf(s.name.slice(s.name.indexOf('(') + 1, -1))}·${aggName(s.name.slice(0, s.name.indexOf('(')))}`,
    type: i === 0 ? 'bar' : 'bar',
    data: s.data,
    barMaxWidth: 36,
    itemStyle: { color: ['#409eff', '#67c23a', '#e6a23c', '#f56c6c'][i % 4] },
  })),
}));

function onDatasetChange() {
  form.rows = [];
  form.col = '';
  form.metrics = [];
  result.value = null;
  const d = current.value;
  const firstDim = d?.fields.find((f) => f.type === 'dim');
  const firstMetric = d?.fields.find((f) => f.type === 'metric');
  if (firstDim) form.rows = [firstDim.col];
  if (firstMetric) form.metrics = [firstMetric.col];
}

async function run() {
  if (!form.dataset) return ElMessage.warning('请先选择数据表');
  loading.value = true;
  try {
    result.value = await analysisApi.explore({
      dataset: form.dataset,
      rows: form.rows,
      cols: form.col ? [form.col] : [],
      metrics: form.metrics.map((f) => ({ field: f, agg: form.agg })),
      limit: form.limit,
    });
    // 图表容器挂在 v-if 区域内，等 DOM 渲染完成后再画
    await nextTick();
    render();
    if (!result.value.total) ElMessage.info('按当前条件没有取到数据');
  } catch (e) {
    ElMessage.error(e.msg || e.message);
  } finally {
    loading.value = false;
  }
}

function exportCsv() {
  const cols = tableCols.value;
  const lines = [cols.join(',')];
  result.value.table.forEach((r) => lines.push(cols.map((c) => `"${r[c] ?? ''}"`).join(',')));
  const blob = new Blob(['\uFEFF' + lines.join('\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `analysis_${form.dataset}_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

onMounted(async () => {
  datasets.value = await analysisApi.datasets();
  const first = datasets.value.find((d) => d.rows > 0) || datasets.value[0];
  if (first) {
    form.dataset = first.key;
    onDatasetChange();
    if (first.rows > 0) run();
  }
});
</script>
