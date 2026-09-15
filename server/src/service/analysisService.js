/**
 * 自助表分析服务 —— 面向「传进来的表」，而不是内置口径
 *
 * 定位：卖家上传什么表，就能按什么表做分析。
 *   - 每个数据集给出「维度字段 / 指标字段」元信息（含库存、广告明细、订单财务等）
 *   - 维度 × 指标任意组合做交叉聚合，返回二维交叉表 + 图表数据
 *   - 表里未识别的列（extra_json）自动展开成可用字段，保证「不丢列、能分析」
 *
 * 安全：表名、字段名、聚合函数全部走白名单枚举，不拼接任何来自前端的裸字符串。
 */
import { db } from '../mapper/index.js';

const D = (col, label) => ({ col, label, type: 'dim' });
const M = (col, label, unit = '') => ({ col, label, type: 'metric', unit });

/** 可分析数据集白名单：字段即前端下拉可选项 */
const CATALOG = {
  ads_daily: {
    name: '广告花费明细', table: 'ads_daily', source: '广告明细数据集上传',
    fields: [
      D('date', '日期'), D('platform', '平台'), D('site', '站点'), D('shop', '店铺'),
      D('campaign', '广告活动'), D('ad_group', '广告组'), D('targeting', '关键词'), D('match_type', '匹配方式'),
      D('sku', 'SKU'), D('asin', 'ASIN'), D('currency', '币种'),
      M('spend', '花费', 'USD'), M('ad_sales', '广告销售额', 'USD'), M('ad_orders', '广告订单', 'count'),
      M('ad_units', '广告销量', 'count'), M('impressions', '曝光', 'count'), M('clicks', '点击', 'count'),
      M('cpc', 'CPC', 'USD'), M('ctr', 'CTR', 'ratio'), M('cvr', 'CVR', 'ratio'),
      M('roas', 'ROAS', 'ratio'), M('acos', 'ACOS', 'ratio'),
    ],
    extra: true,
  },
  inventory: {
    name: '库存管理', table: 'inventory', source: '库存数据集上传',
    fields: [
      D('report_date', '报表日期'), D('platform', '平台'), D('site', '站点'), D('warehouse', '仓库'),
      D('sku', 'SKU'), D('asin', 'ASIN'), D('fnsku', 'FNSKU'), D('product_name', '商品名称'),
      D('status', '状态'), D('currency', '币种'),
      M('available', '可售库存', 'count'), M('inbound', '在途库存', 'count'), M('reserved', '预留库存', 'count'),
      M('unfulfillable', '不可售库存', 'count'), M('total_qty', '总库存', 'count'),
      M('daily_sales', '日均销量', 'count'), M('days_of_supply', '可售天数', 'day'),
      M('reorder_point', '补货点', 'count'), M('safety_stock', '安全库存', 'count'),
      M('stock_value', '库存金额', 'USD'), M('storage_fee', '仓储费', 'USD'), M('age_days', '库龄', 'day'),
    ],
    extra: true,
  },
  sales_daily: {
    name: '销售/广告日数据', table: 'sales_daily', source: '销售日数据集上传',
    fields: [
      D('date', '日期'), D('campaign', '广告活动'), D('sku', 'SKU'), D('platform', '平台'),
      D('site', '站点'), D('category', '类目'), D('currency', '币种'),
      M('total_sales', '总销售额', 'USD'), M('ad_sales', '广告销售额', 'USD'), M('ad_spend', '广告花费', 'USD'),
      M('ad_orders', '广告订单', 'count'), M('units', '销量', 'count'), M('impressions', '曝光', 'count'),
      M('clicks', '点击', 'count'), M('unit_cost', '单位成本', 'USD'), M('refund', '退款金额', 'USD'),
    ],
  },
  order_finance: {
    name: '订单财务明细', table: 'order_finance', source: '订单财务数据集上传',
    fields: [
      D('order_no', '订单编号'), D('sku', 'SKU'), D('listing_id', '刊登号'), D('site', '站点'),
      D('platform', '平台'), D('currency', '币种'), D('is_ad_sale', '是否广告单'),
      M('qty', '单量', 'count'), M('gross_revenue', '总收入', ''), M('commission', '佣金', ''),
      M('surcharge', '附加费', ''), M('shipping_fee', '运费', ''), M('refund', '退货退款', ''),
      M('net_profit', '净利润', ''),
    ],
  },
  product: {
    name: '商品主数据', table: 'product', source: '商品数据集上传',
    fields: [
      D('spu_code', 'SKU'), D('name', '商品名称'), D('category', '类目'), D('brand', '品牌'), D('status', '状态'),
      M('cost', '成本', 'USD'), M('price', '售价', 'USD'), M('market_price', '市场价', 'USD'),
      M('stock', '库存', 'count'), M('weight_kg', '重量', 'kg'), M('sales', '累计销量', 'count'),
    ],
  },
  orders: {
    name: '商城订单', table: 'orders', source: '订单管理产生',
    fields: [
      D('order_no', '订单号'), D('member_name', '买家'), D('platform', '平台'), D('site', '站点'),
      D('status', '状态'), D('pay_time', '支付时间'), D('created_at', '下单时间'),
      M('total_amount', '订单金额', ''), M('pay_amount', '实付金额', ''), M('freight', '运费', ''), M('item_count', '件数', 'count'),
    ],
  },
  order_item: {
    name: '订单商品明细', table: 'order_item', source: '订单管理产生',
    fields: [
      D('order_no', '订单号'), D('sku_code', 'SKU'), D('product_name', '商品名称'),
      M('qty', '数量', 'count'), M('price', '单价', ''), M('amount', '金额', ''),
    ],
  },
  member: {
    name: '会员', table: 'member', source: '会员数据',
    fields: [
      D('nickname', '昵称'), D('level', '等级'), D('status', '状态'), D('reg_time', '注册时间'),
      M('balance', '余额', ''), M('order_count', '订单数', 'count'), M('total_amount', '累计消费', ''),
    ],
  },
};

/** 聚合函数白名单 */
const AGGS = { sum: 'SUM', avg: 'AVG', max: 'MAX', min: 'MIN', count: 'COUNT', count_distinct: 'COUNT(DISTINCT' };
const OPS = { '=': '=', '!=': '!=', '>': '>', '<': '<', '>=': '>=', '<=': '<=', like: 'LIKE' };

const ident = (s) => `"${String(s).replace(/"/g, '')}"`;

/** 探测 SQLite 是否支持 json1（用于分析 extra_json 里的未识别列） */
let json1 = null;
function hasJson1() {
  if (json1 != null) return json1;
  try {
    db.prepare(`SELECT json_extract('{"a":1}', '$.a') v`).get();
    json1 = true;
  } catch {
    json1 = false;
  }
  return json1;
}

/** 展开 extra_json 中实际出现过的键，作为可分析字段（保证上传表里的额外列也能用） */
function extraFields(def) {
  if (!def.extra || !hasJson1()) return [];
  try {
    const rows = db.prepare(`SELECT DISTINCT key FROM ${def.table}, json_each(${def.table}.extra_json) WHERE extra_json IS NOT NULL LIMIT 200`).all();
    return rows.map((r) => r.key).filter(Boolean).map((k) => ({
      col: `extra.${k}`, label: `${k}（扩展列）`, type: 'metric', unit: '', isExtra: true,
    }));
  } catch {
    return [];
  }
}

/** extra.xxx → json_extract(extra_json, '$.xxx')，其余走普通列名 */
function colExpr(col, isMetricAgg = false) {
  if (String(col).startsWith('extra.')) {
    const k = String(col).slice(6).replace(/'/g, '');
    return `json_extract(extra_json, '$.${k}')`;
  }
  return ident(col);
}

function tableRows(t) {
  try { return db.prepare(`SELECT COUNT(*) c FROM ${t}`).get().c; } catch { return 0; }
}

/** 可分析数据集清单（含行数，空表也返回，便于前端提示先上传） */
export function datasets() {
  return Object.entries(CATALOG).map(([key, def]) => ({
    key, name: def.name, source: def.source, rows: tableRows(def.table),
    fields: def.fields,
    extra_fields: extraFields(def),
    aggregations: Object.keys(AGGS),
  }));
}

/**
 * 交叉聚合查询
 * @param {{dataset:string, rows?:string[], cols?:string[], metrics?:any[], filters?:any[], limit?:number}} q
 */
export function explore(q = {}) {
  const def = CATALOG[q.dataset];
  if (!def) throw new Error('不支持的数据集: ' + q.dataset);
  const all = [...def.fields, ...extraFields(def)];
  const byCol = Object.fromEntries(all.map((f) => [f.col, f]));
  const pick = (c) => (byCol[c] ? c : null);

  const rowDims = (q.rows || []).map(pick).filter(Boolean).slice(0, 3);
  const colDim = pick(q.cols && q.cols[0]);

  // 指标默认：该表第一个数值列求和
  let metrics = (q.metrics || []).filter((m) => m && pick(m.field)).slice(0, 6).map((m) => ({
    field: m.field, agg: AGGS[m.agg] ? m.agg : 'sum',
  }));
  if (!metrics.length) metrics = [{ field: all.find((f) => f.type === 'metric')?.col, agg: 'sum' }];
  metrics = metrics.filter((m) => m.field && byCol[m.field]?.type === 'metric');

  const where = [];
  const params = [];
  for (const f of (q.filters || []).slice(0, 8)) {
    if (!f || !pick(f.field) || f.value === '' || f.value == null) continue;
    const op = OPS[f.op || '='];
    if (!op) continue;
    where.push(`${colExpr(pick(f.field))} ${op} ?`);
    params.push(op === 'LIKE' ? `%${f.value}%` : f.value);
  }

  const metricSel = metrics.map((m) => {
    const e = colExpr(m.field);
    const alias = `${m.agg}_${m.field.replace(/[^\w]/g, '_')}`;
    return m.agg === 'count_distinct' ? `COUNT(DISTINCT ${e}) AS ${ident(alias)}` : `${AGGS[m.agg]}(${e}) AS ${ident(alias)}`;
  });

  const dims = [...rowDims];
  if (colDim && !dims.includes(colDim)) dims.push(colDim);
  const groupSel = dims.map((d) => `${colExpr(d)} AS ${ident('d_' + d.replace(/[^\w]/g, '_'))}`);
  const groupBy = dims.map((d) => colExpr(d));

  const orderBy = metrics.map((m) => `${ident(`${m.agg}_${m.field.replace(/[^\w]/g, '_')}`)} DESC`).join(', ');
  const limit = Math.min(Math.max(Number(q.limit) || 500, 1), 2000);

  const sql = `SELECT ${[...groupSel, ...metricSel].join(', ')} FROM ${def.table}` +
    (where.length ? ` WHERE ${where.join(' AND ')}` : '') +
    (groupBy.length ? ` GROUP BY ${groupBy.join(', ')}` : '') +
    (groupBy.length ? ` ORDER BY ${orderBy}` : '') +
    ` LIMIT ${limit}`;

  let raw = [];
  try {
    raw = db.prepare(sql).all(...params);
  } catch (e) {
    throw new Error('查询失败: ' + e.message);
  }

  // 还原成业务列名
  const dimAlias = Object.fromEntries(dims.map((d) => ['d_' + d.replace(/[^\w]/g, '_'), d]));
  const metricAlias = Object.fromEntries(metrics.map((m) => [`${m.agg}_${m.field.replace(/[^\w]/g, '_')}`, m]));
  const table = raw.map((r) => {
    const o = {};
    for (const [k, v] of Object.entries(r)) {
      if (dimAlias[k]) o[dimAlias[k]] = v == null ? '（空）' : v;
      else if (metricAlias[k]) {
        const m = metricAlias[k];
        o[`${m.agg}(${m.field})`] = v == null ? null : Math.round(Number(v) * 10000) / 10000;
      }
    }
    return o;
  });

  // 二维交叉透视（有列维度时）
  const metricKeys = metrics.map((m) => `${m.agg}(${m.field})`);
  const cross = colDim && rowDims.length ? pivot(raw, rowDims, colDim, dimAlias, metricAlias) : null;

  const base = { dataset: q.dataset, dataset_name: def.name, row_dims: rowDims, col_dim: colDim || null, metrics, sql, total: table.length, table };
  return { ...base, chart: chartOf(table, rowDims, metricKeys), cross, insights: insightsOf(table, rowDims, metricKeys, all) };
}

function pivot(raw, rowDims, colDim, dimAlias, metricAlias) {
  const cAlias = 'd_' + colDim.replace(/[^\w]/g, '_');
  const mKeys = Object.entries(metricAlias).map(([a, m]) => [a, `${m.agg}(${m.field})`]);
  const colVals = [...new Set(raw.map((r) => (r[cAlias] == null ? '（空）' : r[cAlias])))].slice(0, 12);
  const m = new Map();
  for (const r of raw) {
    const key = rowDims.map((d) => (r['d_' + d.replace(/[^\w]/g, '_')] == null ? '（空）' : r['d_' + d.replace(/[^\w]/g, '_')])).join(' | ');
    if (!m.has(key)) m.set(key, {});
    const cell = m.get(key);
    const cv = r[cAlias] == null ? '（空）' : r[cAlias];
    for (const [a, label] of mKeys) {
      if (r[a] != null) cell[`${cv} · ${label}`] = Math.round(Number(r[a]) * 10000) / 10000;
    }
  }
  return { col_field: colDim, col_values: colVals, rows: [...m.entries()].map(([k, v]) => ({ _row: k, ...v })) };
}

/** 图表数据：取行维度前 12，一列一个序列 */
function chartOf(table, rowDims, metricKeys) {
  if (!rowDims.length) {
    return { categories: metricKeys, series: [{ name: '汇总', data: metricKeys.map((k) => table[0]?.[k] ?? 0) }] };
  }
  const dim = rowDims[0];
  const top = table.slice(0, 12);
  return {
    categories: top.map((r) => String(r[dim])),
    series: metricKeys.map((k) => ({ name: k, data: top.map((r) => r[k] ?? 0) })),
  };
}

/** 自动结论：集中度与极值，只讲从当前表能直接读出来的事实 */
function insightsOf(table, rowDims, metricKeys, fields) {
  const out = [];
  if (!table.length) return ['当前数据集暂无数据，请先在「数据上传」页导入对应表格'];
  const labelOf = (c) => fields.find((f) => f.col === c)?.label || c;
  if (rowDims.length && metricKeys.length) {
    const k = metricKeys[0];
    const vals = table.map((r) => Number(r[k]) || 0);
    const total = vals.reduce((a, b) => a + b, 0);
    if (total) {
      const top3 = vals.slice(0, Math.min(3, vals.length)).reduce((a, b) => a + b, 0);
      out.push(`${labelOf(rowDims[0])}维度共 ${table.length} 组，${k} 合计 ${Math.round(total * 100) / 100}；前 3 名占比 ${(top3 / total * 100).toFixed(1)}%`);
    }
    const first = table[0];
    out.push(`最高一行为「${first[rowDims[0]]}」，${k} = ${first[k]}`);
    const last = table[table.length - 1];
    if (table.length > 1) out.push(`最低一行为「${last[rowDims[0]]}」，${k} = ${last[k]}`);
  } else if (metricKeys.length) {
    metricKeys.forEach((k) => out.push(`${k} 汇总 = ${table[0]?.[k] ?? 0}`));
  }
  return out;
}

/** 单列去重值（供筛选下拉） */
export function distinct(dataset, field, limit = 200) {
  const def = CATALOG[dataset];
  if (!def) throw new Error('不支持的数据集: ' + dataset);
  const all = [...def.fields, ...extraFields(def)];
  const f = all.find((x) => x.col === field);
  if (!f) throw new Error('字段不存在: ' + field);
  return db.prepare(`SELECT DISTINCT ${colExpr(field)} v FROM ${def.table} WHERE ${colExpr(field)} IS NOT NULL ORDER BY v LIMIT ?`)
    .all(Math.min(Number(limit) || 200, 1000)).map((r) => r.v);
}

export const analysisService = { datasets, explore, distinct };
