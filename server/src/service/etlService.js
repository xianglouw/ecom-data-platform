/**
 * 数据管道服务（ETL）—— 打通「数据接入 → 自动计算 → 可视化展示」
 *
 * 设计对齐 mall4j 的通用机制：
 *   - 任务定义表 etl_job + 任务日志表 etl_job_log（对齐其定时任务/任务日志的落库方式）
 *   - 所有计算产物统一落 metric_snapshot（指标快照），看板读快照而非每次现场算
 *   - 统一 trace_id 串联一次管道执行的各阶段日志，便于追溯
 *
 * 阶段链路：
 *   ingest（接入，由 ingestService 完成并写 ingest_batch）
 *     → quality（质量校验：行数 / 隔离率 / 质量分）
 *     → compute（指标计算：广告口径 + 结算口径 + 商品维度）
 *     → publish（可视化发布：就绪度判定 + 新鲜度）
 */
import { mappers, db } from '../mapper/index.js';
import { PIPELINE_JOBS, PIPELINE_STAGES } from '../entity/index.js';
import { opsService } from './opsService.js';
import { orderFinanceService } from './orderFinanceService.js';
import { listTenantIds, ensureTenant, withTenant } from '../db/tenant.js';
import { bjNow, bjToday, bjAddDays } from '../common/datetime.js';

const r2 = (v) => Math.round((Number(v) || 0) * 100) / 100;
// 时间一律用北京时间（此前用 UTC，导致管道时间比本机少 8 小时）
const now = () => bjNow();
const today = () => bjToday();

/** 快照过期阈值（分钟）：超过则认为看板数据不新鲜，定时器会触发重算 */
const STALE_MINUTES = 30;
const PERIODS = [7, 30, 90, 'ALL'];

let lastTrace = null;
let running = null;

function newTrace() {
  return 'pipe' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

function maxDate() {
  const r = db.prepare('SELECT MAX(date) m FROM sales_daily').get();
  return r?.m || today();
}

function rangeOf(days) {
  if (days === 'ALL') return ['0000-01-01', '9999-12-31'];
  const end = maxDate();
  // 按北京日期回推，避免因时区导致区间少算一天
  return [bjAddDays(end, -(Number(days) - 1)), end];
}

/** 表是否存在且非空 */
function tableRows(t) {
  try {
    return db.prepare(`SELECT COUNT(*) c FROM ${t}`).get().c;
  } catch {
    return 0;
  }
}

// ---------------------------------------------------------------------------
// 阶段 1：质量校验
// ---------------------------------------------------------------------------
function stageQuality(ctx) {
  const datasets = [
    { code: 'ads', table: 'ads_daily', name: '广告花费明细' },
    { code: 'inventory', table: 'inventory', name: '库存管理' },
    { code: 'sales', table: 'sales_daily', name: '销售/广告日数据' },
    { code: 'orderFinance', table: 'order_finance', name: '订单财务明细' },
    { code: 'product', table: 'product', name: '商品主数据' },
    { code: 'orders', table: 'orders', name: '商城订单' },
    { code: 'member', table: 'member', name: '会员' },
  ];
  const WITH_QUARANTINE = ['sales', 'orderFinance', 'inventory', 'ads'];
  const detail = [];
  let totalRows = 0;
  let quarantined = 0;
  for (const d of datasets) {
    const rows = tableRows(d.table);
    const bad = WITH_QUARANTINE.includes(d.code)
      ? db.prepare('SELECT COUNT(*) c FROM quarantine WHERE dataset = ?').get(d.code).c
      : 0;
    totalRows += rows;
    quarantined += bad;
    detail.push({ ...d, rows, quarantined: bad });
  }
  // 质量分：隔离率每 1% 扣 2 分（对齐接入批次的质量分口径）
  const qRate = totalRows + quarantined ? quarantined / (totalRows + quarantined) : 0;
  const score = Math.max(0, Math.round(100 - qRate * 200));
  ctx.quality = { total_rows: totalRows, quarantined, quarantine_rate: r2(qRate * 100), score, detail };
  return { rows_affected: totalRows, message: `库内 ${totalRows} 行，隔离 ${quarantined} 行，质量分 ${score}` };
}

// ---------------------------------------------------------------------------
// 阶段 2：指标计算（广告口径 / 结算口径 / 维度汇总）
// ---------------------------------------------------------------------------
function writeMetrics(category, period, rows, traceId, batchId) {
  if (!rows.length) return 0;
  mappers.metric.deleteWhere({ category, period });
  for (const m of rows) {
    mappers.metric.insert({
      metric_code: m.code, metric_name: m.name, category, period,
      dim_type: m.dim_type || 'total', dim_value: m.dim_value || null,
      value: m.value, unit: m.unit || '', formula: m.formula || '',
      source_batch_id: batchId || null, trace_id: traceId, computed_at: now(),
    });
  }
  return rows.length;
}

/** 广告口径（来源 sales_daily，逐周期计算，口径与看板一致） */
function computeAdMetrics(ctx) {
  let count = 0;
  for (const p of PERIODS) {
    const [start, end] = rangeOf(p);
    const rows = db.prepare(`SELECT *, units*unit_cost cogs FROM sales_daily WHERE date BETWEEN ? AND ?`).all(start, end);
    if (!rows.length) continue;
    const o = opsService.overview({ days: p === 'ALL' ? 3650 : p });
    const k = o.kpi;
    const list = [
      { code: 'ad_gmv', name: 'GMV', value: k.gmv, unit: 'USD', formula: 'SUM(total_sales)' },
      { code: 'ad_orders', name: '订单数', value: k.orders, unit: 'count', formula: 'SUM(ad_orders)' },
      { code: 'ad_spend', name: '广告花费', value: k.spend, unit: 'USD', formula: 'SUM(ad_spend)' },
      { code: 'ad_roas', name: 'ROAS', value: k.roas, unit: 'ratio', formula: '广告销售额 / 广告花费' },
      { code: 'ad_acos', name: 'ACOS', value: k.acos, unit: 'ratio', formula: '广告花费 / 广告销售额' },
      { code: 'ad_tacos', name: 'TACOS', value: k.tacos, unit: 'ratio', formula: '广告花费 / GMV' },
      { code: 'ad_profit', name: '净利润（毛估）', value: k.profit, unit: 'USD', formula: 'GMV − 退款 − 货成本 − 广告花费' },
      { code: 'ad_refund_rate', name: '退款率', value: k.refund_rate, unit: 'ratio', formula: '退款 / GMV' },
      { code: 'ad_aov', name: '客单价', value: k.aov, unit: 'USD', formula: 'GMV / 订单数' },
    ];
    count += writeMetrics('广告口径', String(p), list, ctx.trace, ctx.batchId);
  }
  return count;
}

/** 库存口径（来源 inventory，上传的库存报表） */
function computeInventoryMetrics(ctx) {
  if (!tableRows('inventory')) return 0;
  const inv = opsService.inventory({});
  const k = inv.kpi;
  const cnt = (tag) => inv.records.filter((r) => r.tags.includes(tag)).length;
  const list = [
    { code: 'inv_skus', name: '库存 SKU 数', value: k.skus, unit: 'count', formula: 'COUNT(*)' },
    { code: 'inv_available', name: '可售库存', value: k.available, unit: 'count', formula: 'SUM(available)' },
    { code: 'inv_inbound', name: '在途库存', value: k.inbound, unit: 'count', formula: 'SUM(inbound)' },
    { code: 'inv_total', name: '总库存', value: k.total_qty, unit: 'count', formula: 'SUM(total_qty)' },
    { code: 'inv_value', name: '库存金额', value: k.stock_value, unit: 'amount', formula: 'SUM(stock_value)' },
    { code: 'inv_storage_fee', name: '仓储费', value: k.storage_fee, unit: 'amount', formula: 'SUM(storage_fee)' },
    { code: 'inv_cover_days', name: '可供天数', value: k.cover_days, unit: 'day', formula: '总库存 / 日均销量' },
    { code: 'inv_oos_skus', name: '缺货 SKU 数', value: cnt('缺货'), unit: 'count', formula: '可售与总库存均为 0 的 SKU' },
    { code: 'inv_low_skus', name: '低库存 SKU 数', value: cnt('库存偏低'), unit: 'count', formula: `可售天数 < ${inv.thresholds.low_days} 天` },
    { code: 'inv_aging_skus', name: '库龄超期 SKU 数', value: cnt('库龄偏大'), unit: 'count', formula: `库龄 >= ${inv.thresholds.slow_days} 天` },
  ];
  return writeMetrics('库存口径', 'ALL', list, ctx.trace, ctx.batchId);
}

/** 广告明细口径（来源 ads_daily，上传的广告后台报表） */
function computeAdsDetailMetrics(ctx) {
  if (!tableRows('ads_daily')) return 0;
  const a = db.prepare(`SELECT COALESCE(SUM(spend),0) spend, COALESCE(SUM(ad_sales),0) ad_sales,
    COALESCE(SUM(ad_orders),0) orders, COALESCE(SUM(clicks),0) clicks, COALESCE(SUM(impressions),0) impressions,
    COUNT(DISTINCT campaign) campaigns FROM ads_daily`).get();
  const totalSpend = Number(a.spend) || 0;
  const list = [
    { code: 'ads2_spend', name: '广告花费', value: r2(totalSpend), unit: 'amount', formula: 'SUM(spend)' },
    { code: 'ads2_sales', name: '广告销售额', value: r2(a.ad_sales), unit: 'amount', formula: 'SUM(ad_sales)' },
    { code: 'ads2_roas', name: 'ROAS', value: totalSpend ? r2(a.ad_sales / totalSpend) : null, unit: 'ratio', formula: '广告销售额 / 花费' },
    { code: 'ads2_acos', name: 'ACOS', value: a.ad_sales ? r2(totalSpend / a.ad_sales) : null, unit: 'ratio', formula: '花费 / 广告销售额' },
    { code: 'ads2_cpc', name: 'CPC', value: a.clicks ? r2(totalSpend / a.clicks) : null, unit: 'amount', formula: '花费 / 点击' },
    { code: 'ads2_ctr', name: 'CTR', value: a.impressions ? r2(a.clicks / a.impressions) : null, unit: 'ratio', formula: '点击 / 曝光' },
    { code: 'ads2_cvr', name: 'CVR', value: a.clicks ? r2(a.orders / a.clicks) : null, unit: 'ratio', formula: '订单 / 点击' },
    { code: 'ads2_campaigns', name: '广告活动数', value: a.campaigns, unit: 'count', formula: 'COUNT(DISTINCT campaign)' },
  ];
  return writeMetrics('广告明细口径', 'ALL', list, ctx.trace, ctx.batchId);
}

/** 结算口径（来源 order_finance，源文件无日期字段，因此只算全量） */
function computeFinanceMetrics(ctx) {
  const rows = tableRows('order_finance');
  if (!rows) return 0;
  const s = orderFinanceService.stats();
  const list = [
    { code: 'fin_revenue', name: '结算总收入', value: s.revenue, unit: s.currency, formula: 'SUM(gross_revenue)' },
    { code: 'fin_profit', name: '结算净利润', value: s.profit, unit: s.currency, formula: '总收入 − 佣金 − 附加费 − 运费 − 退款' },
    { code: 'fin_margin_rate', name: '净利率', value: s.margin_rate, unit: '%', formula: '净利润 / 总收入' },
    { code: 'fin_commission', name: '佣金', value: s.commission, unit: s.currency, formula: 'SUM(commission)' },
    { code: 'fin_shipping', name: '运费', value: s.shipping, unit: s.currency, formula: 'SUM(shipping_fee)' },
    { code: 'fin_refund', name: '退货退款', value: s.refund, unit: s.currency, formula: 'SUM(refund)' },
    { code: 'fin_refund_rate', name: '退款率', value: s.refund_rate, unit: '%', formula: '|退款| / 总收入' },
    { code: 'fin_ad_order_rate', name: '广告单占比', value: s.ad_order_rate, unit: '%', formula: '广告单 / 订单数' },
    { code: 'fin_orders', name: '结算订单数', value: s.orders, unit: 'count', formula: 'COUNT(*)' },
    { code: 'fin_profit_per_order', name: '单均净利', value: s.profit_per_order, unit: s.currency, formula: '净利润 / 订单数' },
  ];
  return writeMetrics('结算口径', 'ALL', list, ctx.trace, ctx.batchId);
}

/** 维度汇总：商品（销售口径 Top）与 SKU 结算排行、平台维度 */
function computeDimMetrics(ctx) {
  let count = 0;
  const ad = opsService.products({ days: 3650 }).records.slice(0, 20)
    .map((p) => ({ code: 'ad_sku_gmv', name: p.name || p.sku, dim_type: 'sku', dim_value: p.sku, value: p.gmv, unit: 'USD', formula: 'SUM(total_sales) BY sku' }));
  count += writeMetrics('商品维度', 'ALL', ad, ctx.trace, ctx.batchId);

  if (tableRows('order_finance')) {
    const fin = orderFinanceService.bySku({ sort: 'revenue' }).slice(0, 20)
      .map((s) => ({ code: 'fin_sku_profit', name: s.sku, dim_type: 'sku', dim_value: s.sku, value: s.profit, unit: 'MXN', formula: 'SUM(net_profit) BY sku' }));
    count += writeMetrics('商品维度', 'FIN_ALL', fin, ctx.trace, ctx.batchId);

    const site = db.prepare('SELECT COALESCE(site,\'未知\') v, SUM(gross_revenue) rev, SUM(net_profit) pro FROM order_finance GROUP BY v')
      .all().map((s) => ({ code: 'fin_site_revenue', name: s.v || '未知', dim_type: 'site', dim_value: s.v, value: r2(s.rev), unit: 'MXN', formula: 'SUM(gross_revenue) BY site' }));
    count += writeMetrics('平台维度', 'ALL', site, ctx.trace, ctx.batchId);
  }
  return count;
}

// ---------------------------------------------------------------------------
// 阶段 3：可视化发布（就绪度 + 新鲜度）
// ---------------------------------------------------------------------------
function stagePublish(ctx) {
  const cats = db.prepare('SELECT category, COUNT(*) c FROM metric_snapshot GROUP BY category').all();
  const has = (c) => cats.some((x) => x.category === c && x.c > 0);
  const checks = [
    { key: '总览看板', ok: has('广告口径') || has('结算口径') || has('库存口径') },
    { key: '订单财务', ok: has('结算口径') },
    { key: '库存管理', ok: has('库存口径') },
    { key: '广告投放', ok: has('广告明细口径') || has('广告口径') },
    { key: '商品分析', ok: has('商品维度') },
    { key: '平台对比', ok: has('平台维度') || has('广告口径') },
  ];
  const ready = checks.filter((c) => c.ok).length;
  ctx.publish = { checks, ready, total: checks.length, metric_rows: cats.reduce((s, x) => s + x.c, 0) };
  writeMetrics('发布就绪', 'ALL', [
    { code: 'publish_ready_pages', name: '就绪页面数', value: ready, unit: 'count', formula: '就绪判定通过的页面数' },
    { code: 'publish_total_pages', name: '页面总数', value: checks.length, unit: 'count', formula: '固定 4 个可视化入口' },
  ], ctx.trace, ctx.batchId);
  return { rows_affected: ctx.publish.metric_rows, message: `可视化就绪 ${ready}/${checks.length}，快照 ${ctx.publish.metric_rows} 条` };
}

// ---------------------------------------------------------------------------
// 任务编排
// ---------------------------------------------------------------------------
function recordJob(job, status, message, rows, durationMs, traceId) {
  mappers.jobLog.insert({
    job_code: job.code, stage: job.stage, status, message,
    rows_affected: rows || 0, duration_ms: durationMs, trigger_type: job.trigger || 'manual',
    trace_id: traceId, created_at: now(),
  });
  const exist = mappers.job.one({ job_code: job.code });
  const patch = {
    last_status: status, last_run_at: now(), last_duration_ms: durationMs, last_message: message,
  };
  if (exist) mappers.job.update(exist.id, patch);
  else mappers.job.insert({ job_code: job.code, job_name: job.name, stage: job.stage, step_no: job.step_no, enabled: 1, schedule_desc: job.schedule_desc, ...patch });
}

async function step(job, ctx, fn) {
  const t0 = Date.now();
  try {
    const r = (await fn()) || {};
    const ms = Date.now() - t0;
    ctx.stages.push({ ...job, status: 'success', message: r.message || '完成', duration_ms: ms });
    recordJob({ ...job, trigger: ctx.trigger }, 'success', r.message || '完成', r.rows_affected, ms, ctx.trace);
  } catch (e) {
    const ms = Date.now() - t0;
    ctx.stages.push({ ...job, status: 'failed', message: e.message, duration_ms: ms });
    recordJob({ ...job, trigger: ctx.trigger }, 'failed', e.message, 0, ms, ctx.trace);
    throw e;
  }
}

function jobOf(code) {
  return PIPELINE_JOBS.find((j) => j.code === code) || { code, name: code, stage: 'compute' };
}

/**
 * 执行一次完整管道
 * @param {{ trigger?: string, batchId?: number, stage?: string }} opts
 *        trigger: upload（上传触发）/ schedule（定时）/ manual（手动）/ boot（启动自检）
 */
export async function runPipeline(opts = {}) {
  if (running) return { skipped: true, reason: '已有管道任务在执行中', trace_id: running.trace };
  const ctx = { trace: newTrace(), trigger: opts.trigger || 'manual', batchId: opts.batchId || null, stages: [] };
  running = ctx;
  const t0 = Date.now();
  try {
    await step(jobOf('ingest_batch_check'), ctx, () => stageQuality(ctx));
    await step(jobOf('metric_ad_overview'), ctx, () => {
      const n = computeAdMetrics(ctx);
      return { rows_affected: n, message: `广告口径快照 ${n} 条` };
    });
    await step(jobOf('metric_inventory_overview'), ctx, () => {
      const n = computeInventoryMetrics(ctx);
      return { rows_affected: n, message: n ? `库存口径快照 ${n} 条` : '无库存数据，跳过' };
    });
    await step(jobOf('metric_finance_overview'), ctx, () => {
      const n = computeFinanceMetrics(ctx) + computeAdsDetailMetrics(ctx);
      return { rows_affected: n, message: n ? `结算/广告明细口径快照 ${n} 条` : '无对应数据，跳过' };
    });
    await step(jobOf('metric_dim_rollup'), ctx, () => {
      const n = computeDimMetrics(ctx);
      return { rows_affected: n, message: `维度快照 ${n} 条` };
    });
    await step(jobOf('dashboard_publish'), ctx, () => stagePublish(ctx));
    mappers.setting.saveOrUpdate({ config_key: 'pipeline_last_run' },
      { config_key: 'pipeline_last_run', config_value: now(), remark: '数据管道最近一次计算时间' });
  } catch (e) {
    ctx.error = e.message;
  } finally {
    running = null;
  }
  lastTrace = ctx.trace;
  const status = ctx.error ? 'failed' : 'success';
  const result = {
    trace_id: ctx.trace,
    status,
    trigger: ctx.trigger,
    batch_id: ctx.batchId,
    duration_ms: Date.now() - t0,
    quality: ctx.quality || null,
    publish: ctx.publish || null,
    stages: ctx.stages,
    message: ctx.error || '管道执行完成',
  };
  if (typeof db.save === 'function') db.save();
  return result;
}

/** 管道总览：阶段状态 + 数据新鲜度 */
export function pipelineStatus() {
  const jobs = mappers.job.list();
  const stages = PIPELINE_STAGES.map((s) => {
    const js = jobs.filter((j) => j.stage === s.code);
    const latest = js.sort((a, b) => String(b.last_run_at || '').localeCompare(String(a.last_run_at || '')))[0];
    return {
      ...s,
      jobs: PIPELINE_JOBS.filter((j) => j.stage === s.code).map((j) => {
        const row = jobs.find((x) => x.job_code === j.code) || {};
        return { code: j.code, name: j.name, schedule_desc: j.schedule_desc, last_status: row.last_status || '待执行', last_run_at: row.last_run_at || null, last_duration_ms: row.last_duration_ms || 0, last_message: row.last_message || '' };
      }),
      last_run_at: latest?.last_run_at || null,
      last_status: latest?.last_status || '待执行',
      duration_ms: js.reduce((a, b) => a + (b.last_duration_ms || 0), 0),
    };
  });

  const lastBatch = mappers.batch.list({}, 'created_at DESC, id DESC')[0] || null;
  const lastMetric = mappers.metric.list({}, 'computed_at DESC, id DESC')[0] || null;
  const computedAt = lastMetric?.computed_at || null;
  let stale = true;
  if (computedAt) {
    const diff = (Date.now() - new Date(computedAt.replace(' ', 'T') + 'Z').getTime()) / 60000;
    stale = diff > STALE_MINUTES;
  }
  // 有更新的接入批次但指标未重算，也算过期
  if (lastBatch && computedAt && String(lastBatch.created_at) > computedAt) stale = true;

  const metricCount = tableRows('metric_snapshot');
  return {
    stages,
    freshness: {
      last_batch_at: lastBatch?.created_at || null,
      last_batch_dataset: lastBatch?.dataset_name || null,
      last_compute_at: computedAt,
      stale,
      stale_minutes: STALE_MINUTES,
      metric_rows: metricCount,
    },
    last_trace: lastTrace,
    running: !!running,
    sources: [
      { name: '广告花费明细', table: 'ads_daily', rows: tableRows('ads_daily') },
      { name: '库存管理', table: 'inventory', rows: tableRows('inventory') },
      { name: '销售/广告日数据', table: 'sales_daily', rows: tableRows('sales_daily') },
      { name: '订单财务明细', table: 'order_finance', rows: tableRows('order_finance') },
      { name: '隔离行', table: 'quarantine', rows: tableRows('quarantine') },
    ],
  };
}

export function batchPage(q = {}) {
  const cond = {};
  if (q.dataset) cond.dataset = q.dataset;
  return mappers.batch.page(cond, Number(q.current) || 1, Number(q.size) || 10, 'id DESC');
}

export function logPage(q = {}) {
  const cond = {};
  if (q.job_code) cond.job_code = q.job_code;
  if (q.status) cond.status = q.status;
  return mappers.jobLog.page(cond, Number(q.current) || 1, Number(q.size) || 15, 'id DESC');
}

export function snapshots(q = {}) {
  const cond = {};
  if (q.category) cond.category = q.category;
  if (q.period) cond.period = q.period;
  const rows = mappers.metric.list(cond, 'category, metric_code, id');
  const categories = [...new Set(mappers.metric.list().map((r) => r.category))];
  return { records: rows, categories, periods: PERIODS.map(String) };
}

/** 写入接入批次（由 ingestService 在清洗入库后调用） */
export function recordBatch(info) {
  const id = mappers.batch.insert({
    dataset: info.dataset, dataset_name: info.datasetName || info.dataset, file_name: info.fileName || '',
    total_rows: info.total || 0, inserted: info.inserted || 0, quarantined: info.quarantined || 0,
    skipped: info.skipped || 0, quality_score: info.qualityScore ?? null, status: info.status || 'success',
    message: info.message || '', trigger_type: info.triggerType || 'upload',
    duration_ms: info.durationMs || 0, created_at: now(),
  });
  if (typeof db.save === 'function') db.save();
  return id;
}

/** 接入后自动计算：受 sys_setting.pipeline_auto_run 开关控制（默认开启） */
export async function autoRun(trigger = 'upload', batchId = null) {
  const off = mappers.setting.one({ config_key: 'pipeline_auto_run' });
  if (off && String(off.config_value) === '0') {
    return { skipped: true, reason: '自动计算已关闭（系统设置 pipeline_auto_run=0）' };
  }
  const r = await runPipeline({ trigger, batchId });
  return { trace_id: r.trace_id, status: r.status, duration_ms: r.duration_ms, stages: r.stages?.length || 0, publish: r.publish };
}

/**
 * 定时调度：逐个用户检查数据新鲜度，过期则重算
 * 每个账号的数据空间独立计算，因此调度也必须按用户遍历（不能只算平台级那一次）
 */
export function startScheduler() {
  const minutes = 5;
  const timer = setInterval(async () => {
    for (const userId of listTenantIds()) {
      try {
        await ensureTenant(userId);
        await withTenant(userId, async () => {
          const st = pipelineStatus();
          if (!st.freshness.stale || st.running) return;
          const job = await runPipeline({ trigger: 'schedule' });
          console.log(`[PIPELINE] 用户 ${userId} 定时重算完成 trace=${job.trace_id} 耗时 ${job.duration_ms}ms`);
        });
      } catch (e) {
        console.error(`[PIPELINE] 用户 ${userId} 定时重算失败:`, e.message);
      }
    }
  }, Math.max(1, minutes) * 60 * 1000);
  if (typeof timer.unref === 'function') timer.unref();
  console.log(`[PIPELINE] 定时调度已启动，每 ${minutes} 分钟检查一次各用户的数据新鲜度`);
  return timer;
}

export const etlService = { runPipeline, autoRun, pipelineStatus, batchPage, logPage, snapshots, recordBatch, startScheduler };
