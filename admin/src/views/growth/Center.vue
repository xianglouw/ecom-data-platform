<template>
  <div>
    <div class="page-card">
      <div class="page-title">增长中枢</div>
      <div class="growth-sub">
        以 <b>SKU</b> 为主线串起整条运营链：<b>选品研究 → 商品链接 → 达人建联 → 素材库 → 视频发布</b>；
        销售 / 广告 / 库存数据自动回流到每个 SKU，一屏看清哪个 SKU 卡在哪个环节。
        自动化负责汇总与生成，<b>人工把关节点</b>：是否采购、调价与发布动作、佣金与合同。
      </div>
    </div>

    <el-tabs v-model="tab" class="growth-tabs">
      <!-- ================= 链路总览 ================= -->
      <el-tab-pane label="链路总览" name="overview">
        <div class="page-card">
          <el-form :inline="true" size="small">
            <el-form-item label="搜索">
              <el-input v-model="ovQuery.keyword" placeholder="SKU 编码 / 品名" clearable @keyup.enter="loadOverview" />
            </el-form-item>
            <el-form-item label="阶段">
              <el-select v-model="ovQuery.lifecycle" clearable placeholder="全部" style="width:120px">
                <el-option v-for="l in LIFECYCLE" :key="l" :label="l" :value="l" />
              </el-select>
            </el-form-item>
            <el-form-item>
              <el-button type="primary" :icon="Search" @click="loadOverview">查询</el-button>
            </el-form-item>
          </el-form>

          <el-table :data="ovRows" v-loading="ovLoading" border stripe size="small" highlight-current-row
            @row-click="openChain" style="cursor:pointer">
            <el-table-column prop="sku_code" label="SKU" width="130" />
            <el-table-column prop="name" label="品名" min-width="130" show-overflow-tooltip />
            <el-table-column label="阶段" width="90">
              <template #default="{ row }">
                <el-tag size="small" :type="lifeType(row.lifecycle)">{{ row.lifecycle }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column label="机会分" width="80" align="right">
              <template #default="{ row }">{{ row.opportunity_score ?? '—' }}</template>
            </el-table-column>
            <el-table-column label="选品判定" width="90">
              <template #default="{ row }">
                <el-tag size="small" effect="plain" :type="verdictType(row.verdict)">{{ row.verdict }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column label="链接" width="90" align="center">
              <template #default="{ row }">
                {{ row.listing_live }}/{{ row.listing_total }}
              </template>
            </el-table-column>
            <el-table-column prop="material_count" label="素材" width="65" align="center" />
            <el-table-column prop="influencer_count" label="达人" width="65" align="center" />
            <el-table-column label="视频" width="75" align="center">
              <template #default="{ row }">{{ row.video_published }}/{{ row.video_count }}</template>
            </el-table-column>
            <el-table-column label="30天销售额" width="105" align="right">
              <template #default="{ row }">{{ fmtMoney(row.reflux.gmv_30d || 0) }}</template>
            </el-table-column>
            <el-table-column label="30天ROAS" width="90" align="right">
              <template #default="{ row }">{{ row.reflux.roas_30d ?? '—' }}</template>
            </el-table-column>
            <el-table-column label="可售天数" width="90" align="right">
              <template #default="{ row }">{{ row.reflux.days_of_supply ?? '—' }}</template>
            </el-table-column>
          </el-table>
          <el-pagination style="margin-top:12px;justify-content:flex-end" layout="total, prev, pager, next"
            :total="ovTotal" v-model:current-page="ovQuery.current" v-model:page-size="ovQuery.size"
            @current-change="loadOverview" />
          <div class="chain-hint">点击任意行查看该 SKU 的全链路档案（五个环节 + 数据回流）</div>
        </div>
      </el-tab-pane>

      <!-- ================= CRUD 模块页签（配置驱动） ================= -->
      <el-tab-pane v-for="m in MODULE_VIEWS" :key="m.key" :label="m.label" :name="m.key">
        <div class="page-card">
          <el-form :inline="true" size="small">
            <el-form-item label="搜索">
              <el-input v-model="q.keyword" :placeholder="m.searchPlaceholder" clearable @keyup.enter="load" />
            </el-form-item>
            <el-form-item v-for="f in m.filters" :key="f.field" :label="f.label">
              <el-select v-model="q[f.field]" clearable placeholder="全部" style="width:120px">
                <el-option v-for="o in f.options" :key="o" :label="o" :value="o" />
              </el-select>
            </el-form-item>
            <el-form-item><el-button type="primary" :icon="Search" @click="load">查询</el-button></el-form-item>
            <el-form-item><el-button type="success" :icon="Plus" @click="openCreate">新增</el-button></el-form-item>
          </el-form>

          <el-table :data="records" v-loading="loading" border stripe size="small">
            <el-table-column v-for="c in m.columns" :key="c.prop" :prop="c.prop" :label="c.label"
              :width="c.width" :min-width="c.minWidth" :align="c.align" show-overflow-tooltip>
              <template #default="{ row }">
                <el-tag v-if="c.tagMap" size="small" :type="c.tagMap[row[c.prop]] || 'info'">
                  {{ row[c.prop] || '—' }}
                </el-tag>
                <span v-else-if="c.money">{{ fmtMoney(row[c.prop] || 0) }}</span>
                <span v-else>{{ row[c.prop] ?? '—' }}</span>
              </template>
            </el-table-column>
            <el-table-column label="操作" width="110" fixed="right">
              <template #default="{ row }">
                <el-button link type="primary" @click="openEdit(row)">编辑</el-button>
                <el-button link type="danger" @click="onRemove(row)">删除</el-button>
              </template>
            </el-table-column>
          </el-table>
          <el-pagination style="margin-top:12px;justify-content:flex-end" layout="total, prev, pager, next"
            :total="total" v-model:current-page="q.current" v-model:page-size="q.size" @current-change="load" />
        </div>
      </el-tab-pane>
    </el-tabs>

    <!-- 动态表单弹窗（新增 / 编辑共用） -->
    <el-dialog v-model="dialog" :title="(editing ? '编辑 · ' : '新增 · ') + current.label" width="640px">
      <el-form :model="form" label-width="110px" size="small">
        <el-form-item v-for="f in current.form" :key="f.prop" :label="f.label" :required="f.required">
          <el-select v-if="f.prop === 'sku_code'" v-model="form.sku_code" filterable allow-create
            default-first-option placeholder="选择已有 SKU 或输入新编码" style="width:100%">
            <el-option v-for="s in skuOptions" :key="s" :label="s" :value="s" />
          </el-select>
          <el-select v-else-if="f.type === 'select'" v-model="form[f.prop]" style="width:100%" clearable>
            <el-option v-for="o in f.options" :key="o" :label="o" :value="o" />
          </el-select>
          <el-input v-else-if="f.type === 'textarea'" v-model="form[f.prop]" type="textarea" :rows="3" />
          <el-input-number v-else-if="f.type === 'number'" v-model="form[f.prop]" style="width:100%"
            :controls="false" :precision="f.int ? 0 : 2" />
          <el-date-picker v-else-if="f.type === 'date'" v-model="form[f.prop]" type="date"
            value-format="YYYY-MM-DD" style="width:100%" />
          <el-input v-else v-model="form[f.prop]" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialog = false">取 消</el-button>
        <el-button type="primary" :loading="saving" @click="onSubmit">确 定</el-button>
      </template>
    </el-dialog>

    <!-- SKU 全链路档案抽屉 -->
    <el-drawer v-model="chainDrawer" size="640px"
      :title="'SKU 链路档案 · ' + (chain?.master?.sku_code || '')">
      <template v-if="chain">
        <div class="chain-sec">主数据与回流</div>
        <el-descriptions :column="2" size="small" border>
          <el-descriptions-item label="品名">{{ chain.master.name }}</el-descriptions-item>
          <el-descriptions-item label="阶段">{{ chain.master.lifecycle }}</el-descriptions-item>
          <el-descriptions-item label="平台">{{ chain.master.platforms || '—' }}</el-descriptions-item>
          <el-descriptions-item label="成本 / 目标价">
            {{ fmtMoney(chain.master.cost || 0) }} / {{ fmtMoney(chain.master.target_price || 0) }}
          </el-descriptions-item>
          <el-descriptions-item label="30天销售额">{{ fmtMoney(chain.reflux.gmv_30d || 0) }}</el-descriptions-item>
          <el-descriptions-item label="30天ROAS">{{ chain.reflux.roas_30d ?? '—' }}</el-descriptions-item>
          <el-descriptions-item label="可售天数">{{ chain.reflux.days_of_supply ?? '—' }}</el-descriptions-item>
          <el-descriptions-item label="库龄">{{ chain.reflux.age_days ?? '—' }}</el-descriptions-item>
        </el-descriptions>

        <template v-for="sec in CHAIN_SECS" :key="sec.key">
          <div class="chain-sec">{{ sec.label }}（{{ chain[sec.key].length }}）</div>
          <el-table :data="chain[sec.key]" size="small" border max-height="240">
            <el-table-column v-for="c in sec.columns" :key="c.prop" :prop="c.prop" :label="c.label"
              :min-width="c.minWidth || 90" show-overflow-tooltip>
              <template #default="{ row }">{{ row[c.prop] ?? '—' }}</template>
            </el-table-column>
          </el-table>
        </template>
      </template>
    </el-drawer>
  </div>
</template>

<script setup>
import { onMounted, reactive, ref, computed } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Search, Plus } from '@element-plus/icons-vue';
import { growthApi } from '../../api/index.js';
import { fmtMoney } from '../../utils/chart.js';

const LIFECYCLE = ['选品池', '测试中', '在售', '清仓', '停止'];

/** 模块页签配置：columns=表格列 form=表单字段 filters=筛选下拉（与服务端注册表同一口径） */
const MODULE_VIEWS = [
  {
    key: 'sku', label: 'SKU 主数据', searchPlaceholder: '品名',
    filters: [
      { field: 'lifecycle', label: '阶段', options: LIFECYCLE },
    ],
    columns: [
      { prop: 'sku_code', label: 'SKU', width: 130 },
      { prop: 'name', label: '品名', minWidth: 140 },
      { prop: 'category', label: '类目', width: 100 },
      { prop: 'platforms', label: '平台', width: 130 },
      { prop: 'lifecycle', label: '阶段', width: 90, tagMap: { 选品池: 'info', 测试中: 'warning', 在售: 'success', 清仓: 'warning', 停止: 'danger' } },
      { prop: 'cost', label: '成本', width: 90, align: 'right', money: true },
      { prop: 'target_price', label: '目标价', width: 90, align: 'right', money: true },
      { prop: 'first_batch_qty', label: '首批数量', width: 90, align: 'right' },
      { prop: 'supplier', label: '供应商', width: 110 },
    ],
    form: [
      { prop: 'sku_code', label: 'SKU 编码', required: true },
      { prop: 'name', label: '品名', required: true },
      { prop: 'category', label: '类目' },
      { prop: 'platforms', label: '目标平台', placeholder: '如 TikTok Shop / Temu / Amazon' },
      { prop: 'lifecycle', label: '阶段', type: 'select', options: LIFECYCLE, default: '选品池' },
      { prop: 'supplier', label: '供应商' },
      { prop: 'cost', label: '采购成本', type: 'number' },
      { prop: 'target_price', label: '目标售价', type: 'number' },
      { prop: 'first_batch_qty', label: '首批数量', type: 'number', int: true },
      { prop: 'owner_note', label: '备注', type: 'textarea' },
    ],
  },
  {
    key: 'selection', label: '选品研究', searchPlaceholder: 'SKU 编码',
    filters: [
      { field: 'verdict', label: '判定', options: ['待定', '采购', '观察', '放弃'] },
      { field: 'source', label: '来源', options: ['竞品抓取', '人工导入', '工具导出'] },
    ],
    columns: [
      { prop: 'sku_code', label: 'SKU', width: 130 },
      { prop: 'source', label: '来源', width: 100 },
      { prop: 'price', label: '竞品价', width: 90, align: 'right', money: true },
      { prop: 'sales_30d', label: '30天销量', width: 95, align: 'right' },
      { prop: 'rating', label: '评分', width: 70, align: 'right' },
      { prop: 'review_count', label: '评分数', width: 85, align: 'right' },
      { prop: 'keyword', label: '关键词', minWidth: 120 },
      { prop: 'competitor', label: '竞品', minWidth: 110 },
      { prop: 'trend', label: '趋势', width: 80 },
      { prop: 'opportunity_score', label: '机会分', width: 80, align: 'right' },
      { prop: 'verdict', label: '判定', width: 85, tagMap: { 采购: 'success', 观察: 'warning', 放弃: 'danger', 待定: 'info' } },
      { prop: 'target_price', label: '目标售价', width: 95, align: 'right', money: true },
      { prop: 'created_at', label: '研究时间', width: 110 },
    ],
    form: [
      { prop: 'sku_code', label: 'SKU 编码', required: true },
      { prop: 'source', label: '来源', type: 'select', options: ['竞品抓取', '人工导入', '工具导出'] },
      { prop: 'price', label: '竞品价格', type: 'number' },
      { prop: 'sales_30d', label: '30天销量', type: 'number', int: true },
      { prop: 'rating', label: '竞品评分', type: 'number' },
      { prop: 'review_count', label: '评分数', type: 'number', int: true },
      { prop: 'keyword', label: '核心关键词' },
      { prop: 'competitor', label: '主要竞品' },
      { prop: 'trend', label: '趋势', placeholder: '上升 / 平稳 / 下降' },
      { prop: 'opportunity_score', label: '机会评分', type: 'number' },
      { prop: 'verdict', label: '判定（人工把关）', type: 'select', options: ['待定', '采购', '观察', '放弃'], default: '待定' },
      { prop: 'target_price', label: '目标售价', type: 'number' },
      { prop: 'note', label: '备注', type: 'textarea' },
    ],
  },
  {
    key: 'listing', label: '商品与链接', searchPlaceholder: '标题 / Listing',
    filters: [
      { field: 'status', label: '状态', options: ['草稿', '待人工确认', '已上架', '需修改'] },
      { field: 'task_type', label: '类型', options: ['上架生成', '链接体检'] },
      { field: 'platform', label: '平台', options: ['TikTok Shop', 'Temu', 'Amazon', 'Mercado Libre'] },
    ],
    columns: [
      { prop: 'sku_code', label: 'SKU', width: 130 },
      { prop: 'platform', label: '平台', width: 110 },
      { prop: 'task_type', label: '类型', width: 90 },
      { prop: 'title', label: '标题', minWidth: 180 },
      { prop: 'listing_id', label: 'Listing ID', width: 130 },
      { prop: 'status', label: '状态', width: 105, tagMap: { 草稿: 'info', 待人工确认: 'warning', 已上架: 'success', 需修改: 'danger' } },
      { prop: 'issues', label: '体检问题', minWidth: 140 },
      { prop: 'updated_at', label: '更新时间', width: 110 },
    ],
    form: [
      { prop: 'sku_code', label: 'SKU 编码', required: true },
      { prop: 'task_type', label: '类型', type: 'select', options: ['上架生成', '链接体检'], default: '上架生成' },
      { prop: 'platform', label: '平台', type: 'select', options: ['TikTok Shop', 'Temu', 'Amazon', 'Mercado Libre'] },
      { prop: 'listing_id', label: 'Listing ID' },
      { prop: 'title', label: '标题（生成稿）', type: 'textarea' },
      { prop: 'description', label: '描述（生成稿）', type: 'textarea' },
      { prop: 'attrs_json', label: '属性 JSON' },
      { prop: 'images_json', label: '图片顺序 JSON' },
      { prop: 'issues', label: '体检问题', placeholder: '缺失属性 / 低点击主图 / 差评关键词…' },
      { prop: 'status', label: '状态（人工把关）', type: 'select', options: ['草稿', '待人工确认', '已上架', '需修改'], default: '草稿' },
      { prop: 'note', label: '备注', type: 'textarea' },
    ],
  },
  {
    key: 'material', label: '素材库', searchPlaceholder: '素材标题',
    filters: [
      { field: 'type', label: '类型', options: ['脚本', '分镜', '标题', '字幕', '西语口播', '视频变体'] },
      { field: 'status', label: '状态', options: ['草稿', '可用', '已用'] },
    ],
    columns: [
      { prop: 'sku_code', label: 'SKU', width: 130 },
      { prop: 'type', label: '类型', width: 95 },
      { prop: 'title', label: '标题', minWidth: 160 },
      { prop: 'variant_count', label: '变体数', width: 80, align: 'right' },
      { prop: 'source', label: '来源', width: 95 },
      { prop: 'status', label: '状态', width: 85, tagMap: { 草稿: 'info', 可用: 'success', 已用: 'warning' } },
      { prop: 'created_at', label: '创建时间', width: 110 },
    ],
    form: [
      { prop: 'sku_code', label: 'SKU 编码', required: true },
      { prop: 'type', label: '类型', type: 'select', options: ['脚本', '分镜', '标题', '字幕', '西语口播', '视频变体'], default: '脚本' },
      { prop: 'title', label: '标题', required: true },
      { prop: 'content', label: '内容', type: 'textarea' },
      { prop: 'variant_count', label: '变体数', type: 'number', int: true },
      { prop: 'source', label: '来源', type: 'select', options: ['自动生成', '人工上传'], default: '自动生成' },
      { prop: 'status', label: '状态（人工把关）', type: 'select', options: ['草稿', '可用', '已用'], default: '草稿' },
    ],
  },
  {
    key: 'influencer', label: '达人建联', searchPlaceholder: '达人名称',
    filters: [
      { field: 'status', label: '状态', options: ['待建联', '已私信', '已回复', '寄样中', '已合作', '终止'] },
      { field: 'platform', label: '平台', options: ['TikTok', 'Instagram', 'YouTube'] },
    ],
    columns: [
      { prop: 'sku_code', label: 'SKU', width: 130 },
      { prop: 'influencer', label: '达人', width: 120 },
      { prop: 'platform', label: '平台', width: 95 },
      { prop: 'region', label: '地区', width: 80 },
      { prop: 'reach', label: '粉丝量', width: 90, align: 'right' },
      { prop: 'tags', label: '标签', minWidth: 110 },
      { prop: 'follow_up_date', label: '下次跟进', width: 105 },
      { prop: 'status', label: '状态', width: 90, tagMap: { 待建联: 'info', 已私信: 'primary', 已回复: 'warning', 寄样中: 'warning', 已合作: 'success', 终止: 'danger' } },
      { prop: 'commission_note', label: '佣金 / 寄样', minWidth: 120 },
    ],
    form: [
      { prop: 'sku_code', label: 'SKU 编码', required: true },
      { prop: 'influencer', label: '达人名称', required: true },
      { prop: 'platform', label: '平台', type: 'select', options: ['TikTok', 'Instagram', 'YouTube'] },
      { prop: 'region', label: '地区', placeholder: '如 MX / US' },
      { prop: 'reach', label: '粉丝量', type: 'number', int: true },
      { prop: 'tags', label: '达人标签' },
      { prop: 'invite_msg', label: '建联私信（生成稿）', type: 'textarea' },
      { prop: 'follow_up_date', label: '下次跟进', type: 'date' },
      { prop: 'status', label: '状态（人工把关）', type: 'select', options: ['待建联', '已私信', '已回复', '寄样中', '已合作', '终止'], default: '待建联' },
      { prop: 'commission_note', label: '佣金 / 寄样', type: 'textarea' },
      { prop: 'contract_note', label: '合同与约定', type: 'textarea' },
    ],
  },
  {
    key: 'video', label: '视频发布', searchPlaceholder: '视频标题',
    filters: [
      { field: 'status', label: '状态', options: ['待发布', '已发布', '已下架'] },
      { field: 'platform', label: '平台', options: ['TikTok', 'Instagram', 'YouTube'] },
    ],
    columns: [
      { prop: 'sku_code', label: 'SKU', width: 130 },
      { prop: 'platform', label: '平台', width: 95 },
      { prop: 'title', label: '标题', minWidth: 160 },
      { prop: 'material_id', label: '素材ID', width: 80, align: 'right' },
      { prop: 'schedule_at', label: '排期', width: 105 },
      { prop: 'status', label: '状态', width: 90, tagMap: { 待发布: 'warning', 已发布: 'success', 已下架: 'info' } },
      { prop: 'views', label: '播放', width: 90, align: 'right' },
      { prop: 'gmv', label: '带动GMV', width: 100, align: 'right', money: true },
      { prop: 'published_at', label: '发布时间', width: 105 },
    ],
    form: [
      { prop: 'sku_code', label: 'SKU 编码', required: true },
      { prop: 'material_id', label: '关联素材ID', type: 'number', int: true },
      { prop: 'platform', label: '平台', type: 'select', options: ['TikTok', 'Instagram', 'YouTube'] },
      { prop: 'title', label: '标题（生成稿）', type: 'textarea' },
      { prop: 'tags', label: '标签' },
      { prop: 'cart_draft', label: '商品挂车草稿' },
      { prop: 'schedule_at', label: '排期', type: 'date' },
      { prop: 'status', label: '状态（人工把关）', type: 'select', options: ['待发布', '已发布', '已下架'], default: '待发布' },
      { prop: 'views', label: '播放量', type: 'number', int: true },
      { prop: 'gmv', label: '带动GMV', type: 'number' },
    ],
  },
];

/** 全链路档案抽屉的分区（key 对应 chain 返回的字段名） */
const CHAIN_SECS = [
  { key: 'selection', label: '选品研究', columns: [{ prop: 'verdict', label: '判定', minWidth: 70 }, { prop: 'opportunity_score', label: '机会分', minWidth: 70 }, { prop: 'keyword', label: '关键词', minWidth: 100 }, { prop: 'created_at', label: '时间', minWidth: 100 }] },
  { key: 'listing', label: '商品与链接', columns: [{ prop: 'task_type', label: '类型', minWidth: 80 }, { prop: 'platform', label: '平台', minWidth: 90 }, { prop: 'status', label: '状态', minWidth: 80 }, { prop: 'title', label: '标题', minWidth: 160 }] },
  { key: 'material', label: '素材库', columns: [{ prop: 'type', label: '类型', minWidth: 80 }, { prop: 'title', label: '标题', minWidth: 140 }, { prop: 'status', label: '状态', minWidth: 70 }] },
  { key: 'influencer', label: '达人建联', columns: [{ prop: 'influencer', label: '达人', minWidth: 100 }, { prop: 'status', label: '状态', minWidth: 80 }, { prop: 'follow_up_date', label: '跟进', minWidth: 90 }] },
  { key: 'video', label: '视频发布', columns: [{ prop: 'platform', label: '平台', minWidth: 80 }, { prop: 'title', label: '标题', minWidth: 140 }, { prop: 'status', label: '状态', minWidth: 80 }] },
];

const tab = ref('overview');
const current = computed(() => MODULE_VIEWS.find((m) => m.key === tab.value) || MODULE_VIEWS[0]);

// ---- 链路总览 ----
const ovRows = ref([]), ovTotal = ref(0), ovLoading = ref(false);
const ovQuery = reactive({ current: 1, size: 20, keyword: '', lifecycle: '' });
async function loadOverview() {
  ovLoading.value = true;
  try {
    const d = await growthApi.overview({ ...ovQuery });
    ovRows.value = d.records; ovTotal.value = d.total;
  } finally { ovLoading.value = false; }
}

// ---- SKU 选项（表单里选已有编码或直接新建） ----
const skuOptions = ref([]);
async function loadSkuOptions() {
  try {
    const d = await growthApi.page('sku', { current: 1, size: 200 });
    skuOptions.value = d.records.map((r) => r.sku_code);
  } catch { skuOptions.value = []; }
}

// ---- 模块 CRUD ----
const records = ref([]), total = ref(0), loading = ref(false);
const q = reactive({ current: 1, size: 20, keyword: '' });
for (const m of MODULE_VIEWS) for (const f of m.filters) q[f.field] = '';

async function load() {
  if (tab.value === 'overview') return loadOverview();
  loading.value = true;
  try {
    const d = await growthApi.page(tab.value, { ...q });
    records.value = d.records; total.value = d.total;
  } finally { loading.value = false; }
}
function onTabChange(name) {
  q.current = 1;
  if (name !== 'overview') load();
}

// ---- 弹窗表单 ----
const dialog = ref(false), editing = ref(false), saving = ref(false), form = ref({});
function openCreate() {
  const row = {};
  for (const f of current.value.form) row[f.prop] = f.default ?? (f.type === 'number' ? undefined : '');
  form.value = row; editing.value = false; dialog.value = true;
}
function openEdit(row) { form.value = { ...row }; editing.value = true; dialog.value = true; }
async function onSubmit() {
  saving.value = true;
  try {
    if (editing.value) await growthApi.update(tab.value, form.value.id, form.value);
    else await growthApi.create(tab.value, form.value);
    ElMessage.success('已保存');
    dialog.value = false; load();
    if (tab.value !== 'overview') loadOverview(); // 总览的链路计数同步刷新
  } finally { saving.value = false; }
}
async function onRemove(row) {
  await ElMessageBox.confirm('确认删除这条记录？删除后不可恢复。', '删除确认', { type: 'warning' });
  await growthApi.remove(tab.value, row.id);
  ElMessage.success('已删除');
  load();
}

// ---- SKU 链路档案抽屉 ----
const chainDrawer = ref(false), chain = ref(null);
async function openChain(row) {
  chain.value = await growthApi.chain(row.sku_code);
  chainDrawer.value = true;
}

function lifeType(l) {
  return { 选品池: 'info', 测试中: 'warning', 在售: 'success', 清仓: 'warning', 停止: 'danger' }[l] || 'info';
}
function verdictType(v) {
  return { 采购: 'success', 观察: 'warning', 放弃: 'danger', 待定: 'info', 未研究: 'info' }[v] || 'info';
}

onMounted(() => { loadOverview(); loadSkuOptions(); });
</script>

<style scoped>
.growth-sub {
  font-size: 13px;
  color: #64748b;
  line-height: 1.8;
}
.growth-tabs {
  margin-top: 12px;
}
.chain-hint {
  margin-top: 10px;
  font-size: 12px;
  color: #94a3b8;
}
.chain-sec {
  margin: 18px 0 8px;
  font-weight: 600;
  font-size: 13px;
  color: #334155;
}
</style>
