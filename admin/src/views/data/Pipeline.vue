<template>
  <div>
    <!-- 管道总览：新鲜度 -->
    <div class="alert-box" :class="status.freshness?.stale ? 'danger' : 'blue'">
      <span v-if="status.running">⏳ 管道正在执行中…</span>
      <span v-else-if="status.freshness?.stale">⚠️ 快照已过期（阈值 {{ status.freshness?.stale_minutes }} 分钟），建议立即重算</span>
      <span v-else>✅ 数据链路健康：快照 {{ status.freshness?.metric_rows || 0 }} 条指标，最近计算 {{ status.freshness?.last_compute_at || '—' }}</span>
      <span class="muted"> · 最近接入：{{ status.freshness?.last_batch_at || '—' }}{{ status.freshness?.last_batch_dataset ? '（' + status.freshness.last_batch_dataset + '）' : '' }}</span>
    </div>

    <!-- 四阶段流程 -->
    <div class="page-card">
      <div class="page-title">
        端到端链路：数据接入 → 质量校验 → 指标计算 → 可视化发布
        <el-button size="small" type="primary" :loading="running" style="margin-left:12px" @click="runNow">立即重算</el-button>
        <span class="muted" style="margin-left:8px">上次 trace：{{ status.last_trace || '—' }}</span>
      </div>
      <div class="stage-flow">
        <template v-for="(s, i) in status.stages || []" :key="s.code">
          <div class="stage-card" :class="stageClass(s)">
            <div class="stage-head">
              <span class="stage-no">{{ i + 1 }}</span>
              <span class="stage-name">{{ s.name }}</span>
              <el-tag size="small" :type="tagType(s.last_status)">{{ s.last_status }}</el-tag>
            </div>
            <div class="stage-desc">{{ s.desc }}</div>
            <div class="stage-meta">
              <span>耗时 {{ totalOf(s) }} ms</span>
              <span>最近 {{ s.last_run_at ? s.last_run_at.slice(11, 19) : '—' }}</span>
            </div>
            <div class="stage-jobs">
              <div v-for="j in s.jobs" :key="j.code" class="job-line" :title="j.last_message">
                <span class="dot" :class="j.last_status === 'success' ? 'ok' : j.last_status === 'failed' ? 'bad' : 'idle'"></span>
                <span class="job-name">{{ j.name }}</span>
                <span class="muted">{{ j.schedule_desc }}</span>
              </div>
            </div>
          </div>
          <div v-if="i < (status.stages || []).length - 1" class="stage-arrow">→</div>
        </template>
      </div>
    </div>

    <!-- 数据源 -->
    <el-row :gutter="16">
      <el-col :span="12">
        <div class="page-card">
          <div class="page-title">数据源（管道输入）</div>
          <el-table :data="status.sources || []" size="small">
            <el-table-column prop="name" label="数据源" />
            <el-table-column prop="table" label="表" width="130" />
            <el-table-column prop="rows" label="行数" width="90" align="right" />
          </el-table>
          <div class="hint">上传任意数据集后会自动触发整条链路，无需手工点计算。</div>
        </div>
      </el-col>
      <el-col :span="12">
        <div class="page-card">
          <div class="page-title">可视化就绪度</div>
          <div v-for="c in publishChecks" :key="c.key" class="ready-line">
            <span>{{ c.key }}</span>
            <el-tag size="small" :type="c.ok ? 'success' : 'info'">{{ c.ok ? '已就绪' : '无数据' }}</el-tag>
          </div>
          <div class="hint">就绪判定基于指标快照：有对应分类的计算结果即视为可展示。</div>
        </div>
      </el-col>
    </el-row>

    <!-- 接入批次 -->
    <div class="page-card">
      <div class="page-title">接入批次 <span class="muted">每次上传一条记录，可追溯数据来源</span></div>
      <el-table :data="batches.records" size="small" v-loading="loading">
        <el-table-column prop="id" label="#" width="60" />
        <el-table-column prop="dataset_name" label="数据集" width="130" />
        <el-table-column prop="file_name" label="文件名" min-width="200" show-overflow-tooltip />
        <el-table-column prop="total_rows" label="总行" width="80" align="right" />
        <el-table-column prop="inserted" label="入库" width="80" align="right" />
        <el-table-column prop="quarantined" label="隔离" width="80" align="right" />
        <el-table-column label="质量分" width="90" align="right">
          <template #default="{ row }">
            <el-tag size="small" :type="row.quality_score >= 90 ? 'success' : row.quality_score >= 70 ? 'warning' : 'danger'">
              {{ row.quality_score ?? '—' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="status" label="状态" width="90" />
        <el-table-column prop="trigger_type" label="触发" width="80" />
        <el-table-column prop="duration_ms" label="耗时ms" width="90" align="right" />
        <el-table-column prop="created_at" label="时间" width="150" />
      </el-table>
      <el-pagination
        style="margin-top:10px;justify-content:flex-end"
        layout="total, prev, pager, next"
        :total="batches.total" :page-size="batchQuery.size" :current-page="batchQuery.current"
        @current-change="p => { batchQuery.current = p; loadBatches(); }" />
    </div>

    <!-- 任务日志 -->
    <div class="page-card">
      <div class="page-title">任务执行日志 <span class="muted">每个计算步骤一条，含耗时与 trace</span></div>
      <el-table :data="logs.records" size="small">
        <el-table-column prop="job_code" label="任务" width="190" />
        <el-table-column prop="stage" label="阶段" width="90" />
        <el-table-column label="结果" width="90">
          <template #default="{ row }">
            <el-tag size="small" :type="row.status === 'success' ? 'success' : 'danger'">{{ row.status }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="message" label="说明" min-width="220" show-overflow-tooltip />
        <el-table-column prop="rows_affected" label="影响行" width="90" align="right" />
        <el-table-column prop="duration_ms" label="耗时ms" width="90" align="right" />
        <el-table-column prop="trigger_type" label="触发" width="90" />
        <el-table-column prop="trace_id" label="trace" width="150" />
        <el-table-column prop="created_at" label="时间" width="150" />
      </el-table>
      <el-pagination
        style="margin-top:10px;justify-content:flex-end"
        layout="total, prev, pager, next"
        :total="logs.total" :page-size="logQuery.size" :current-page="logQuery.current"
        @current-change="p => { logQuery.current = p; loadLogs(); }" />
    </div>

    <!-- 指标快照 -->
    <div class="page-card">
      <div class="page-title">
        指标快照 <span class="muted">看板与图表直接读这张表，避免每次现场重算</span>
        <el-select v-model="snapQuery.category" placeholder="全部分类" clearable size="small" style="width:140px;margin-left:12px" @change="loadSnapshots">
          <el-option v-for="c in snapshots.categories || []" :key="c" :label="c" :value="c" />
        </el-select>
      </div>
      <el-table :data="groupedSnapshots" size="small" max-height="420">
        <el-table-column prop="category" label="分类" width="110" />
        <el-table-column prop="period" label="周期" width="80" />
        <el-table-column prop="metric_name" label="指标" width="150" />
        <el-table-column prop="value" label="值" width="130" align="right" />
        <el-table-column prop="unit" label="单位" width="70" />
        <el-table-column prop="formula" label="口径公式" min-width="200" show-overflow-tooltip />
        <el-table-column prop="computed_at" label="计算时间" width="150" />
      </el-table>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { pipelineApi } from '../../api/index.js';

const status = ref({ stages: [], freshness: {}, sources: [] });
const batches = reactive({ records: [], total: 0 });
const logs = reactive({ records: [], total: 0 });
const snapshots = reactive({ records: [], categories: [] });
const batchQuery = reactive({ current: 1, size: 10 });
const logQuery = reactive({ current: 1, size: 15 });
const snapQuery = reactive({ category: '' });
const loading = ref(false);
const running = ref(false);

const publishChecks = ref([]);

async function loadStatus() {
  status.value = await pipelineApi.status();
  const all = await pipelineApi.snapshots({});
  const cats = new Set((all.records || []).map(r => r.category));
  publishChecks.value = [
    { key: '总览看板', ok: cats.has('广告口径') || cats.has('结算口径') },
    { key: '订单财务', ok: cats.has('结算口径') },
    { key: '商品分析', ok: cats.has('商品维度') },
    { key: '平台对比', ok: cats.has('平台维度') || cats.has('广告口径') },
  ];
}
async function loadBatches() {
  const r = await pipelineApi.batches({ ...batchQuery });
  batches.records = r.records; batches.total = r.total;
}
async function loadLogs() {
  const r = await pipelineApi.logs({ ...logQuery });
  logs.records = r.records; logs.total = r.total;
}
async function loadSnapshots() {
  const r = await pipelineApi.snapshots({ ...snapQuery });
  snapshots.records = r.records; snapshots.categories = r.categories;
}
async function runNow() {
  running.value = true;
  try {
    const r = await pipelineApi.run();
    ElMessage.success(`重算完成：${r.stages?.length || 0} 个步骤，耗时 ${r.duration_ms}ms（trace ${r.trace_id}）`);
    await reload();
  } finally { running.value = false; }
}
async function reload() {
  loading.value = true;
  try {
    await Promise.all([loadStatus(), loadBatches(), loadLogs(), loadSnapshots()]);
  } finally { loading.value = false; }
}

function tagType(s) {
  return s === 'success' ? 'success' : s === 'failed' ? 'danger' : 'info';
}
function stageClass(s) {
  return { ok: s.last_status === 'success', bad: s.last_status === 'failed' };
}
function totalOf(s) {
  return (s.jobs || []).reduce((a, b) => a + (b.last_duration_ms || 0), 0);
}
const groupedSnapshots = computed(() => {
  const order = { '结算口径': 0, '广告口径': 1, '商品维度': 2, '平台维度': 3, '发布就绪': 4 };
  return [...snapshots.records].sort((a, b) => (order[a.category] ?? 9) - (order[b.category] ?? 9));
});

onMounted(reload);
</script>

<style scoped>
.stage-flow { display: flex; align-items: stretch; gap: 8px; padding: 6px 0; }
.stage-card {
  flex: 1; min-width: 0; border: 0.5px solid var(--el-border-color);
  border-radius: 10px; padding: 12px; background: var(--el-fill-color-lighter);
}
.stage-card.ok { border-color: #67c23a; }
.stage-card.bad { border-color: #f56c6c; background: #fef0f0; }
.stage-head { display: flex; align-items: center; gap: 6px; }
.stage-no {
  width: 18px; height: 18px; border-radius: 50%; background: var(--el-color-primary);
  color: #fff; font-size: 12px; display: inline-flex; align-items: center; justify-content: center;
}
.stage-name { font-weight: 500; font-size: 13px; flex: 1; }
.stage-desc { font-size: 12px; color: var(--el-text-color-secondary); margin: 6px 0; }
.stage-meta { display: flex; justify-content: space-between; font-size: 12px; color: var(--el-text-color-secondary); }
.stage-jobs { margin-top: 8px; border-top: 1px dashed var(--el-border-color-lighter); padding-top: 6px; }
.job-line { display: flex; align-items: center; gap: 6px; font-size: 12px; line-height: 1.9; }
.job-name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dot { width: 6px; height: 6px; border-radius: 50%; background: #c0c4cc; flex: none; }
.dot.ok { background: #67c23a; }
.dot.bad { background: #f56c6c; }
.stage-arrow { display: flex; align-items: center; color: var(--el-text-color-placeholder); }
.ready-line { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px dashed var(--el-border-color-lighter); font-size: 13px; }
</style>
