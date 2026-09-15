/**
 * 订单财务服务 —— 订单级结算数据的汇总与下钻
 * 口径：总收入 - 佣金 - 附加费 - 运费 - 退货退款 = 净利
 * 说明：源文件里成本项（佣金/附加费/运费/退款）为负数，这里保持原样存储与求和，
 *       只有展示退款率/费率时才取绝对值，不做任何静默补数。
 */
import { db, mappers } from '../mapper/index.js';

const n = (v) => (v == null ? 0 : Number(v) || 0);
const r2 = (v) => Math.round((Number(v) || 0) * 100) / 100;

/** 站点币种 → USD 汇率（先读系统设置，读不到用内置兜底值） */
export function fxRate(currency = 'MXN') {
  const row = mappers.setting.one({ config_key: `fx_${String(currency).toLowerCase()}_usd` });
  const v = row ? Number(row.config_value) : NaN;
  if (Number.isFinite(v) && v > 0) return v;
  return { MXN: 0.058, BRL: 0.18, EUR: 1.08, CNY: 0.14 }[String(currency).toUpperCase()] || 1;
}

function whereOf(q = {}) {
  const clauses = [];
  const params = [];
  if (q.sku) { clauses.push('sku LIKE ?'); params.push(`%${q.sku}%`); }
  if (q.site) { clauses.push('site = ?'); params.push(q.site); }
  if (q.platform) { clauses.push('platform = ?'); params.push(q.platform); }
  if (q.adOnly === '1' || q.adOnly === 1 || q.adOnly === true) clauses.push('is_ad_sale = 1');
  if (q.orderNo) { clauses.push('order_no LIKE ?'); params.push(`%${q.orderNo}%`); }
  return { sql: clauses.length ? ' WHERE ' + clauses.join(' AND ') : '', params };
}

/** KPI 汇总 */
export function stats(q = {}) {
  const { sql, params } = whereOf(q);
  const row = db
    .prepare(
      `SELECT COUNT(*) orders,
              SUM(COALESCE(qty,1)) units,
              SUM(gross_revenue) revenue,
              SUM(COALESCE(commission,0)) commission,
              SUM(COALESCE(surcharge,0)) surcharge,
              SUM(COALESCE(shipping_fee,0)) shipping,
              SUM(COALESCE(refund,0)) refund,
              SUM(COALESCE(net_profit,0)) profit,
              SUM(is_ad_sale) ad_orders,
              COUNT(DISTINCT sku) sku_count
       FROM order_finance${sql}`
    )
    .get(...params) || {};

  const revenue = n(row.revenue);
  const refundAbs = Math.abs(n(row.refund));
  const orders = n(row.orders);
  return {
    orders,
    units: n(row.units),
    sku_count: n(row.sku_count),
    revenue: r2(revenue),
    commission: r2(n(row.commission)),
    surcharge: r2(n(row.surcharge)),
    shipping: r2(n(row.shipping)),
    refund: r2(n(row.refund)),
    profit: r2(n(row.profit)),
    ad_orders: n(row.ad_orders),
    currency: q.currency || 'MXN',
    // 派生指标
    margin_rate: revenue ? r2((n(row.profit) / revenue) * 100) : 0,
    refund_rate: revenue ? r2((refundAbs / revenue) * 100) : 0,
    fee_rate: revenue ? r2((Math.abs(n(row.commission)) / revenue) * 100) : 0,
    ad_order_rate: orders ? r2((n(row.ad_orders) / orders) * 100) : 0,
    aov: orders ? r2(revenue / orders) : 0,
    profit_per_order: orders ? r2(n(row.profit) / orders) : 0,
  };
}

/** 按 SKU 聚合（下钻主视图） */
export function bySku(q = {}) {
  const { sql, params } = whereOf(q);
  // 注意：margin_rate / refund_abs 是 JS 层计算别名，SQL 里排序要用原始表达式
  const orderBy = {
    revenue: 'revenue DESC',
    profit: 'profit DESC',
    orders: 'orders DESC',
    margin: '(SUM(COALESCE(net_profit,0)) * 1.0 / NULLIF(SUM(gross_revenue),0)) ASC',
    refund: 'ABS(SUM(COALESCE(refund,0))) DESC',
  }[q.sort] || 'revenue DESC';
  const rows = db
    .prepare(
      `SELECT sku,
              COUNT(*) orders,
              SUM(COALESCE(qty,1)) units,
              SUM(gross_revenue) revenue,
              SUM(COALESCE(commission,0)) commission,
              SUM(COALESCE(surcharge,0)) surcharge,
              SUM(COALESCE(shipping_fee,0)) shipping,
              SUM(COALESCE(refund,0)) refund,
              SUM(COALESCE(net_profit,0)) profit,
              SUM(is_ad_sale) ad_orders
       FROM order_finance${sql}
       GROUP BY sku
       ORDER BY ${orderBy}`
    )
    .all(...params);
  return rows.map((r) => {
    const revenue = n(r.revenue);
    const profit = n(r.profit);
    return {
      sku: r.sku,
      orders: n(r.orders),
      units: n(r.units),
      revenue: r2(revenue),
      commission: r2(n(r.commission)),
      surcharge: r2(n(r.surcharge)),
      shipping: r2(n(r.shipping)),
      refund: r2(n(r.refund)),
      profit: r2(profit),
      ad_orders: n(r.ad_orders),
      refund_abs: r2(Math.abs(n(r.refund))),
      margin_rate: revenue ? r2((profit / revenue) * 100) : 0,
      refund_rate: revenue ? r2((Math.abs(n(r.refund)) / revenue) * 100) : 0,
      ad_rate: n(r.orders) ? r2((n(r.ad_orders) / n(r.orders)) * 100) : 0,
      profit_per_order: n(r.orders) ? r2(profit / n(r.orders)) : 0,
      // 净利率 < 15% 视为偏薄，< 0 视为亏损，供前端标红
      status: profit < 0 ? '亏损' : (revenue ? profit / revenue : 0) < 0.15 ? '偏薄' : '健康',
    };
  });
}

/** 明细分页 */
export function page(q = {}) {
  const current = Number(q.current) || 1;
  const size = Number(q.size) || 20;
  const { sql, params } = whereOf(q);
  const total = db.prepare(`SELECT COUNT(*) c FROM order_finance${sql}`).get(...params).c;
  const records = db
    .prepare(`SELECT * FROM order_finance${sql} ORDER BY id DESC LIMIT ? OFFSET ?`)
    .all(...params, size, (current - 1) * size);
  return { records, total, pages: Math.ceil(total / size) || 0, current, size };
}

/** 过滤维度（站点/平台/币种） */
export function facets() {
  const sites = db.prepare('SELECT site, COUNT(*) c FROM order_finance GROUP BY site ORDER BY c DESC').all();
  const platforms = db.prepare('SELECT platform, COUNT(*) c FROM order_finance GROUP BY platform ORDER BY c DESC').all();
  const currencies = db.prepare('SELECT currency, COUNT(*) c FROM order_finance GROUP BY currency ORDER BY c DESC').all();
  return { sites, platforms, currencies };
}

export const orderFinanceService = { page, stats, bySku, facets, fxRate };
