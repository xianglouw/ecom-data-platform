<template>
  <div>
    <el-tabs v-model="tab">
      <el-tab-pane label="基础设置" name="base">
        <div class="page-card">
          <div class="page-title">告警阈值（全站口径）</div>
          <el-form :model="thr" size="small" label-width="170px">
            <el-divider content-position="left">库存</el-divider>
            <el-form-item label="低库存天数">
              <el-input-number v-model="thr.inventory_low_days" :min="1" :max="365" style="width:140px" />
              <span class="muted" style="margin-left:10px">可售天数低于该值 → 判定「库存偏低」</span>
            </el-form-item>
            <el-form-item label="滞销库龄（天）">
              <el-input-number v-model="thr.inventory_slow_days" :min="7" :max="730" style="width:140px" />
              <span class="muted" style="margin-left:10px">库龄或可供天数超过该值 → 判定「滞销积压 / 库龄偏大」</span>
            </el-form-item>

            <el-divider content-position="left">经营与投放</el-divider>
            <el-form-item label="ROAS 参考线">
              <el-input-number v-model="thr.roas_target" :min="0.5" :max="20" :step="0.5" :precision="1" style="width:140px" />
              <span class="muted" style="margin-left:10px">整体 ROAS 低于该值 → 提示投放效率不足</span>
            </el-form-item>
            <el-form-item label="退款率告警（%）">
              <el-input-number v-model="thr.refund_alert_pct" :min="0" :max="50" :step="0.5" :precision="1" style="width:140px" />
              <span class="muted" style="margin-left:10px">退款率高于该值 → 触发告警</span>
            </el-form-item>
            <el-form-item label="订单净利率参考线（%）">
              <el-input-number v-model="thr.order_margin_target" :min="0" :max="80" :step="1" :precision="0" style="width:140px" />
              <span class="muted" style="margin-left:10px">净利率低于该值 → 提示佣金 / 附加费侵蚀</span>
            </el-form-item>
            <el-form-item label="低毛利告警（%）">
              <el-input-number v-model="thr.low_margin_pct" :min="0" :max="80" :step="1" :precision="0" style="width:140px" />
              <span class="muted" style="margin-left:10px">毛利率低于该值 → 判定低毛利</span>
            </el-form-item>
            <el-form-item label="兜底佣金率（%）">
              <el-input-number v-model="thr.default_fee_rate_pct" :min="0" :max="50" :step="0.5" :precision="1" style="width:140px" />
              <span class="muted" style="margin-left:10px">选品测算未匹配到费率规则时使用</span>
            </el-form-item>

            <el-form-item>
              <el-button type="primary" :loading="thrSaving" @click="saveThresholds">保存并重算</el-button>
              <el-button @click="loadBase">恢复已保存值</el-button>
            </el-form-item>
          </el-form>
          <div class="muted">
            这些值同时作用于「库存管理」页、订单财务与总览看板。保存后自动重算一次指标快照，避免口径不一致。
          </div>
        </div>

        <div class="page-card">
          <div class="page-title">全部系统参数</div>
          <el-table :data="settings" border size="small">
            <el-table-column prop="config_key" label="参数键" width="200" />
            <el-table-column label="参数值" min-width="220">
              <template #default="{ row }"><el-input v-model="row.config_value" size="small" /></template>
            </el-table-column>
            <el-table-column prop="remark" label="说明" min-width="220" />
            <el-table-column label="操作" width="100">
              <template #default="{ row }">
                <el-button link type="primary" @click="saveSetting(row)">保存</el-button>
              </template>
            </el-table-column>
          </el-table>
        </div>
      </el-tab-pane>

      <el-tab-pane label="运费对照表" name="freight">
        <div class="page-card">
          <div class="page-title">
            运费表
            <div>
              <el-select v-model="site" size="small" style="width:120px">
                <el-option v-for="s in ['MX', 'US', 'BR', 'DE']" :key="s" :label="s" :value="s" />
              </el-select>
              <el-button type="primary" size="small" style="margin-left:8px" @click="openFreight()">新增区间</el-button>
            </div>
          </div>
          <el-table :data="freights" border size="small">
            <el-table-column prop="site" label="站点" width="80" />
            <el-table-column prop="weight_min" label="重量下限(lb)" width="130" />
            <el-table-column prop="weight_max" label="重量上限(lb)" width="130" />
            <el-table-column label="运费(USD)" width="130">
              <template #default="{ row }">${{ row.freight_usd?.toFixed(2) }}</template>
            </el-table-column>
            <el-table-column label="操作" width="140">
              <template #default="{ row }">
                <el-button link type="primary" @click="openFreight(row)">编辑</el-button>
                <el-button link type="danger" @click="delFreight(row)">删除</el-button>
              </template>
            </el-table-column>
          </el-table>
        </div>
      </el-tab-pane>

      <el-tab-pane label="平台费率规则" name="rate">
        <div class="page-card">
          <div class="page-title">
            费率规则
            <el-button type="primary" size="small" @click="openRate()">新增规则</el-button>
          </div>
          <el-table :data="rates" border size="small">
            <el-table-column prop="platform" label="平台" width="130" />
            <el-table-column prop="site" label="站点" width="80" />
            <el-table-column label="类目" width="100">
              <template #default="{ row }">{{ row.category === '*' ? '全部（通配）' : row.category }}</template>
            </el-table-column>
            <el-table-column label="佣金率" width="100">
              <template #default="{ row }">{{ (row.commission * 100).toFixed(1) }}%</template>
            </el-table-column>
            <el-table-column label="其他费率" width="100">
              <template #default="{ row }">{{ (row.other_fee * 100).toFixed(1) }}%</template>
            </el-table-column>
            <el-table-column prop="source" label="来源" min-width="180" />
            <el-table-column prop="effective_date" label="生效日期" width="120" />
            <el-table-column label="操作" width="140">
              <template #default="{ row }">
                <el-button link type="primary" @click="openRate(row)">编辑</el-button>
                <el-button link type="danger" @click="delRate(row)">删除</el-button>
              </template>
            </el-table-column>
          </el-table>
          <div class="muted" style="margin-top:8px">
            费率必须带来源与生效日期：查不到就标 unknown 交人工，不用经验值填坑。
          </div>
        </div>
      </el-tab-pane>
    </el-tabs>

    <el-dialog v-model="dlg" :title="dlgTitle" width="420px">
      <el-form :model="form" label-width="110px" size="small">
        <template v-if="tab === 'freight'">
          <el-form-item label="站点"><el-input v-model="form.site" /></el-form-item>
          <el-form-item label="重量下限"><el-input-number v-model="form.weight_min" :min="0" :precision="2" /></el-form-item>
          <el-form-item label="重量上限"><el-input-number v-model="form.weight_max" :min="0" :precision="2" /></el-form-item>
          <el-form-item label="运费USD"><el-input-number v-model="form.freight_usd" :min="0" :precision="2" /></el-form-item>
        </template>
        <template v-else>
          <el-form-item label="平台"><el-input v-model="form.platform" /></el-form-item>
          <el-form-item label="站点"><el-input v-model="form.site" /></el-form-item>
          <el-form-item label="类目"><el-input v-model="form.category" placeholder="* 表示全部" /></el-form-item>
          <el-form-item label="佣金率"><el-input-number v-model="form.commission" :min="0" :max="1" :step="0.01" :precision="3" /></el-form-item>
          <el-form-item label="其他费率"><el-input-number v-model="form.other_fee" :min="0" :max="1" :step="0.01" :precision="3" /></el-form-item>
          <el-form-item label="来源"><el-input v-model="form.source" /></el-form-item>
          <el-form-item label="生效日期"><el-input v-model="form.effective_date" placeholder="2026-08-01" /></el-form-item>
        </template>
      </el-form>
      <template #footer>
        <el-button @click="dlg = false">取 消</el-button>
        <el-button type="primary" @click="onSubmit">确 定</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { onMounted, reactive, ref, watch } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { sysApi } from '../../api/index.js';

const tab = ref('base'), site = ref('MX');
const settings = ref([]), freights = ref([]), rates = ref([]);
const dlg = ref(false), dlgTitle = ref(''), form = ref({});
// 告警阈值：键名与后端 sys_setting 一一对应；比率类在界面上用「%」展示，保存时除以 100
const thr = ref({
  inventory_low_days: 14, inventory_slow_days: 90,
  roas_target: 2.5, refund_alert_pct: 5, order_margin_target: 15,
  low_margin_pct: 10, default_fee_rate_pct: 15,
});
const thrSaving = ref(false);

async function loadBase() {
  settings.value = await sysApi.settings();
  const num = (k, d) => {
    const v = Number(settings.value.find((s) => s.config_key === k)?.config_value);
    return Number.isFinite(v) ? v : d;
  };
  thr.value = {
    inventory_low_days: num('inventory_low_days', 14),
    inventory_slow_days: num('inventory_slow_days', 90),
    roas_target: num('roas_target', 2.5),
    refund_alert_pct: num('refund_alert', 0.05) * 100,
    order_margin_target: num('order_margin_target', 15),
    low_margin_pct: num('low_margin', 0.1) * 100,
    default_fee_rate_pct: num('default_fee_rate', 0.15) * 100,
  };
}

async function saveThresholds() {
  thrSaving.value = true;
  try {
    const t = thr.value;
    const r = await sysApi.saveSettings([
      { config_key: 'inventory_low_days', config_value: String(t.inventory_low_days), remark: '【库存】可售天数低于该值 → 低库存预警（天）' },
      { config_key: 'inventory_slow_days', config_value: String(t.inventory_slow_days), remark: '【库存】库龄或可供天数超过该值 → 滞销积压预警（天）' },
      { config_key: 'roas_target', config_value: String(t.roas_target), remark: '整体 ROAS 参考线（低于该值提示投放效率不足）' },
      { config_key: 'refund_alert', config_value: String(t.refund_alert_pct / 100), remark: '退款率告警阈值（0.05 = 5%）' },
      { config_key: 'order_margin_target', config_value: String(t.order_margin_target), remark: '订单净利率参考线（%，低于该值提示佣金/附加费侵蚀）' },
      { config_key: 'low_margin', config_value: String(t.low_margin_pct / 100), remark: '低毛利告警阈值（0.10 = 10%）' },
      { config_key: 'default_fee_rate', config_value: String(t.default_fee_rate_pct / 100), remark: '未匹配费率规则时的兜底佣金率' },
    ]);
    ElMessage.success(r?.recalculated ? '阈值已保存，指标已按新口径重算' : '阈值已保存');
    await loadBase();
  } finally { thrSaving.value = false; }
}

async function saveSetting(row) {
  const r = await sysApi.saveSetting({ config_key: row.config_key, config_value: row.config_value, remark: row.remark });
  ElMessage.success(r?.recalculated ? '已保存，指标已重算' : '已保存');
  await loadBase(); // 阈值类参数改动后，回填上方阈值卡片
}
async function loadFreight() { freights.value = await sysApi.freightList(site.value); }
async function loadRate() { rates.value = await sysApi.rateList(); }

function openFreight(row) {
  form.value = row ? { ...row } : { site: site.value, weight_min: 0, weight_max: 0.5, freight_usd: 0 };
  dlgTitle.value = row ? '编辑运费区间' : '新增运费区间';
  dlg.value = true;
}
function openRate(row) {
  form.value = row ? { ...row } : { platform: '', site: '', category: '*', commission: 0.15, other_fee: 0.05, source: '', effective_date: '' };
  dlgTitle.value = row ? '编辑费率规则' : '新增费率规则';
  dlg.value = true;
}
async function onSubmit() {
  if (tab.value === 'freight') await sysApi.freightSave(form.value);
  else await sysApi.rateSave(form.value);
  ElMessage.success('保存成功');
  dlg.value = false;
  loadFreight(); loadRate();
}
async function delFreight(row) {
  await ElMessageBox.confirm('确认删除该运费区间？', '提示', { type: 'warning' });
  await sysApi.freightRemove(row.id);
  ElMessage.success('已删除');
  loadFreight();
}
async function delRate(row) {
  await ElMessageBox.confirm('确认删除该费率规则？', '提示', { type: 'warning' });
  await sysApi.rateRemove(row.id);
  ElMessage.success('已删除');
  loadRate();
}
onMounted(() => { loadBase(); loadFreight(); loadRate(); });
watch(site, loadFreight);
</script>
