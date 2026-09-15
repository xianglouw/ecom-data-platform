<template>
  <div>
    <div class="alert-box blue">
      📥 <b>以你的表格为唯一数据源</b>：平台默认不含任何内置数据，上传什么就分析什么。
      表头自动归一（中 / 英 / 西语别名均可识别）、数字自动解析（兼容 ¥1,234.50、欧式小数 10,84）；
      <b>不认识的列不会被丢掉</b>，会作为「扩展列」保留，表分析里照样能用来做维度与聚合。
    </div>

    <!-- 库里现状 -->
    <div class="page-card">
      <div class="page-title">
        库里目前有什么
        <el-tag v-if="state.has_demo_data" type="warning" size="small">检测到演示数据 {{ state.demo_rows }} 行</el-tag>
        <el-tag v-else type="success" size="small">干净：无演示数据</el-tag>
        <div style="float:right">
          <el-button size="small" @click="loadState">刷新</el-button>
          <el-button size="small" type="danger" plain :disabled="!state.total_rows" @click="clearDemo">清空演示数据</el-button>
        </div>
      </div>
      <el-table :data="state.tables" size="small" height="280" row-key="table">
        <el-table-column prop="name" label="数据表" width="150">
          <template #default="{ row }">
            {{ row.name }}
            <el-tag v-if="row.demo" size="small" type="warning" effect="plain">演示来源</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="rows" label="行数" width="90" align="right" />
        <el-table-column prop="desc" label="说明" />
        <el-table-column label="状态" width="90">
          <template #default="{ row }">
            <span v-if="row.rows === 0" class="muted">空</span>
            <span v-else-if="row.demo" style="color:#e6a23c">含演示</span>
            <span v-else style="color:#67c23a">你的数据</span>
          </template>
        </el-table-column>
      </el-table>
      <div class="muted" style="margin-top:8px">
        数据库：{{ state.db_path }} · 总 {{ state.total_rows }} 行（其中演示 {{ state.demo_rows }} 行）
      </div>
    </div>

    <!-- 数据集上传 -->
    <el-row :gutter="16">
      <el-col :span="12" v-for="d in DATASETS" :key="d.id">
        <div class="page-card">
          <div class="page-title">
            {{ d.name }}
            <el-tag size="small" type="info">{{ rowOf(d.id) }} 行</el-tag>
            <el-tag size="small" effect="plain" style="margin-left:4px">必填：{{ d.required }}</el-tag>
          </div>
          <div class="muted" style="margin-bottom:10px">{{ d.desc }}</div>

          <div class="row">
            <el-upload :show-file-list="false" :http-request="req => onSelect(d.id, req)">
              <el-button type="primary" :icon="Upload">选择文件上传</el-button>
            </el-upload>
            <a class="link" :href="templateUrl(d.id)" style="margin-left:12px">⬇️ 下载 CSV 模板</a>
          </div>
          <div style="margin-top:6px">
            <el-checkbox v-model="replaceMap[d.id]" size="small">覆盖已有数据（取消勾选则追加）</el-checkbox>
            <span v-if="pending[d.id]" class="muted" style="margin-left:8px">已选：{{ pending[d.id].file.name }}</span>
          </div>

          <!-- 待导入：先预览再确认 -->
          <div v-if="pending[d.id]" class="alert-box" style="margin-top:10px">
            <el-button size="small" type="warning" plain :loading="loading[d.id]" @click="run(d.id, true)">① 预览解析结果</el-button>
            <el-button size="small" type="success" :loading="loading[d.id]" @click="run(d.id, false)">② 确认导入</el-button>
            <el-button size="small" text @click="pending[d.id] = null">取消</el-button>
          </div>

          <!-- 预览：表头识别 -->
          <div v-if="previews[d.id]" class="alert-box" style="margin-top:10px">
            <b>预览（未写入数据库）</b> · 共 {{ previews[d.id].total_rows }} 行，可入库 {{ previews[d.id].inserted }} 行，隔离 {{ previews[d.id].quarantined }} 行
            <div v-for="f in previews[d.id].flags" :key="f" class="muted">{{ f }}</div>
            <div style="margin-top:6px">
              <el-table :data="previews[d.id].header_map" size="small" max-height="160">
                <el-table-column prop="header" label="你的表头" />
                <el-table-column prop="field" label="识别为字段" />
              </el-table>
            </div>
          </div>

          <!-- 导入结果 -->
          <div v-if="results[d.id]" class="alert-box" :class="results[d.id].quarantined ? '' : 'blue'" style="margin-top:10px">
            ✅ 入库 <b>{{ results[d.id].inserted }}</b> 行
            <span v-if="results[d.id].quarantined"> · ⚠️ 隔离 {{ results[d.id].quarantined }} 行</span>
            <div v-for="f in results[d.id].flags" :key="f" class="muted">{{ f }}</div>
            <div v-if="results[d.id].pipeline" class="muted" style="margin-top:6px">
              <template v-if="results[d.id].pipeline.skipped">⏭ 未自动计算：{{ results[d.id].pipeline.reason }}</template>
              <template v-else>
                ⚙️ 已自动计算并推送到看板（{{ results[d.id].pipeline.stages }} 步 / {{ results[d.id].pipeline.duration_ms }}ms）
                <router-link to="/data/pipeline" class="link">查看管道 →</router-link>
              </template>
            </div>
            <router-link v-if="results[d.id].quarantined" to="/data/quarantine" class="link">查看隔离明细 →</router-link>
            <router-link v-if="d.id === 'inventory'" to="/ops/inventory" class="link" style="margin-left:12px">库存管理 →</router-link>
            <router-link v-if="d.id === 'ads'" to="/ops/ads" class="link" style="margin-left:12px">广告投放 →</router-link>
            <router-link v-if="d.id === 'orderFinance'" to="/order/finance" class="link" style="margin-left:12px">订单财务 →</router-link>
            <router-link to="/data/analysis" class="link" style="margin-left:12px">表分析 →</router-link>
          </div>
        </div>
      </el-col>
    </el-row>
  </div>
</template>

<script setup>
import { reactive, ref, onMounted } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Upload } from '@element-plus/icons-vue';
import { dataApi } from '../../api/index.js';

const DATASETS = [
  { id: 'inventory', name: '库存管理', required: 'SKU', desc: '库存报表：可售 / 在途 / 预留 / 日均销量 / 可售天数 / 补货点 / 库存金额 / 仓储费 / 库龄。你表里的其它列（供应商、备注…）会自动保留为扩展列' },
  { id: 'ads', name: '广告花费明细', required: '日期', desc: '广告后台导出：日期 / 平台 / 站点 / 店铺 / 广告活动 / 广告组 / 关键词 / 曝光 / 点击 / 花费 / 订单 / 广告销售额（CPC、CTR、ROAS、ACOS 缺了会自动算）' },
  { id: 'orderFinance', name: '订单财务明细', required: '订单编号 + 总收入', desc: '订单级结算：收入 / 佣金 / 附加费 / 运费 / 退货退款 / 净利润，可直接上传 Mercado Libre 导出的表' },
  { id: 'sales', name: '销售日数据', required: '日期 + 商品编码 + 总销售额', desc: '日粒度销售与广告：曝光 / 点击 / 花费 / 订单 / 销量 / 广告销售额 / 总销售额 / 退款，用于总览看板与复盘' },
  { id: 'product', name: '商品主数据', required: 'sku + 商品名称', desc: '成本 / 售价 / 市场价 / 库存 / 重量，用于选品测算与保本价计算' },
  { id: 'freight', name: '运费表', required: '站点 + 运费usd', desc: '分站点按重量段的头程 / 尾程运费，选品测算按重量匹配' },
  { id: 'rate', name: '平台费率规则', required: '平台 + 站点 + 佣金率', desc: '平台佣金率与其他费率（类目可用 * 通配）' },
];

const state = reactive({ tables: [], total_rows: 0, demo_rows: 0, has_demo_data: false, db_path: '', db_size: 0 });
const pending = reactive({});
const results = reactive({});
const previews = reactive({});
const loading = reactive({});
const replaceMap = reactive({ inventory: true, ads: true, orderFinance: true, sales: true, product: true, freight: true, rate: true });

const templateUrl = (id) => `/api/data/template/${id}`;
const rowOf = (id) => {
  const map = { inventory: 'inventory', ads: 'ads_daily', orderFinance: 'order_finance', sales: 'sales_daily', product: 'product', freight: 'freight', rate: 'fee_rate' };
  return state.tables.find((t) => t.table === map[id])?.rows ?? 0;
};

async function loadState() {
  Object.assign(state, await dataApi.state());
}

function onSelect(dataset, req) {
  pending[dataset] = { file: req.file };
  previews[dataset] = null;
  results[dataset] = null;
  run(dataset, true);
}

async function run(dataset, preview) {
  const p = pending[dataset];
  if (!p) return;
  loading[dataset] = true;
  const fd = new FormData();
  fd.append('file', p.file);
  try {
    const r = await dataApi.upload(dataset, fd, { replace: replaceMap[dataset], preview });
    if (preview) {
      previews[dataset] = r;
      ElMessage.success(`预览完成：可入库 ${r.inserted} 行，隔离 ${r.quarantined} 行`);
    } else {
      results[dataset] = r;
      previews[dataset] = null;
      pending[dataset] = null;
      ElMessage.success(`入库 ${r.inserted} 行`);
      loadState();
    }
  } catch (e) {
    ElMessage.error('处理失败：' + (e.msg || e.message));
  } finally {
    loading[dataset] = false;
  }
}

async function clearDemo() {
  const rows = state.tables.filter((t) => t.demo || ['quarantine', 'ingest_batch', 'metric_snapshot', 'etl_job_log'].includes(t.table))
    .map((t) => `<li>${t.name}：${t.rows} 行</li>`).join('');
  await ElMessageBox.confirm(
    `<div style="line-height:1.7">将清空以下表（<b>不可撤销</b>），账号、系统设置、任务定义会保留：<ul style="margin:6px 0 0 16px">${rows}</ul>
     <div style="margin-top:8px">你上传的<b>广告花费明细 / 库存管理 / 订单财务明细</b>不会被删除。</div></div>`,
    '确认清空演示数据？',
    { dangerouslyUseHTMLString: true, type: 'warning', confirmButtonText: '确认清空', cancelButtonText: '取消' },
  );
  const r = await dataApi.reset(['__demo__']);
  ElMessage.success(`已清空 ${r.cleared.reduce((s, x) => s + x.rows, 0)} 行`);
  loadState();
}

onMounted(loadState);
</script>

<style scoped>
.row { display: flex; align-items: center; }
</style>
