/**
 * 运营分析服务 —— ROI 复盘 / 选品测算 / 保本 ROAS
 * 指标口径：ROAS、ACOS、TACOS、净利毛估、保本 ROAS、保本价、目标价
 */
import { mappers, db } from '../mapper/index.js';
import { stats as financeStats, bySku as financeBySku, fxRate } from './orderFinanceService.js';
// 所有日期一律按北京日期（UTC+8）计算，避免看板日期与本机时间差一天
import { bjToday, bjAddDays } from '../common/datetime.js';

/**
 * 告警阈值全部来自「系统设置」（见 entity/SETTING_DEFAULTS），不写死魔法数字。
 * 每次请求实时求值 —— 在设置页改完刷新页面即生效，无需改代码或重启。
 */
const cfgFeeRate = () => threshold('default_fee_rate', 0.15);
const cfgLowMargin = () => threshold('low_margin', 0.10);
const cfgRefundAlert = () => threshold('refund_alert', 0.05);
const cfgRoasTarget = () => threshold('roas_target', 2.5);

const sum = (rows, k) => rows.reduce((s, r) => s + (Number(r[k]) || 0), 0);
const r2 = n => Math.round((Number(n) || 0) * 100) / 100;
const r3 = n => (n == null ? null : Math.round(Number(n) * 1000) / 1000);
const r4 = n => (n == null ? null : Math.round(Number(n) * 10000) / 10000);

/** 表存在且非空 */
const tableEmpty = (t) => {
  try { return db.prepare(`SELECT COUNT(*) c FROM ${t}`).get().c === 0; } catch { return true; }
};
/** 读系统设置里的阈值（不写死魔法数字） */
const threshold = (key, dft) => {
  const v = Number(mappers.setting.one({ config_key: key })?.config_value);
  return Number.isFinite(v) && v > 0 ? v : dft;
};

/** 日期区间：以数据中的最大日期为基准回推 N 天（全部按北京日期计算） */
function dateRange(maxDate, days) {
  const end = maxDate || bjToday();
  if (!maxDate) return ['2000-01-01', end];
  return [bjAddDays(end, -(Number(days) - 1)), end];
}

function derive(rows) {
  const gmv = sum(rows, 'total_sales'), spend = sum(rows, 'ad_spend');
  const adSales = sum(rows, 'ad_sales'), units = sum(rows, 'units');
  const refund = sum(rows, 'refund'), cogs = sum(rows, 'cogs');
  return {
    gmv: r2(gmv), orders: sum(rows, 'ad_orders'), units,
    aov: sum(rows, 'ad_orders') ? r2(gmv / sum(rows, 'ad_orders')) : 0,
    spend: r2(spend), ad_sales: r2(adSales), refund: r2(refund),
    roas: spend ? r3(adSales / spend) : null,
    acos: adSales ? r4(spend / adSales) : null,
    tacos: gmv ? r4(spend / gmv) : null,
    refund_rate: gmv ? r4(refund / gmv) : null,
    profit: r2(gmv - refund - cogs - spend),
    ctr: sum(rows, 'impressions') ? r4(sum(rows, 'clicks') / sum(rows, 'impressions')) : null,
    cvr: sum(rows, 'clicks') ? r4(sum(rows, 'ad_orders') / sum(rows, 'clicks')) : null,
  };
}

/**
 * 订单结算财务块（order_finance）—— 供看板 / 复盘端到端展示。
 * 与销售日数据（sales_daily，USD 毛估口径）分开呈现，汇率换算仅用于横向对比。
 * 库里没有该表或没有数据时返回 null，前端自动隐藏对应区块。
 */
function financeBlock() {
  try {
    const hasTable = db.prepare("SELECT COUNT(*) c FROM sqlite_master WHERE type='table' AND name='order_finance'").get().c;
    if (!hasTable || !db.prepare('SELECT COUNT(*) c FROM order_finance').get().c) return null;
    const kpi = financeStats();
    const fx = fxRate(kpi.currency);
    return {
      currency: kpi.currency,
      fx_usd: fx,
      kpi,
      revenue_usd: r2(kpi.revenue * fx),
      profit_usd: r2(kpi.profit * fx),
      top_sku: financeBySku({ sort: 'revenue' }).slice(0, 10),
      cost_structure: [
        { name: '佣金', value: Math.abs(kpi.commission) },
        { name: '附加费', value: Math.abs(kpi.surcharge) },
        { name: '运费', value: Math.abs(kpi.shipping) },
        { name: '退货退款', value: Math.abs(kpi.refund) },
        { name: '净利润', value: kpi.profit },
      ].filter((x) => x.value > 0),
    };
  } catch {
    return null;
  }
}

function baseQuery(filters, days) {  const maxRow = db.prepare('SELECT MAX(date) m FROM sales_daily').get();
  const [start, end] = dateRange(maxRow?.m, days || 30);
  const clauses = ['date BETWEEN ? AND ?'];
  const params = [start, end];
  ['platform', 'site', 'sku', 'campaign', 'category'].forEach(k => {
    if (filters[k]) { clauses.push(`${k} = ?`); params.push(filters[k]); }
  });
  return { sql: ' WHERE ' + clauses.join(' AND '), params, start, end };
}

export const opsService = {
  overview(q) {
    const { sql, params, start, end } = baseQuery(q, Number(q.days) || 30);
    const rows = db.prepare(`SELECT *, units*unit_cost cogs FROM sales_daily${sql}`).all(...params);
    const kpi = derive(rows);
    // 上一周期（等长，按北京日期回推）
    const prevEnd = bjAddDays(start, -1);
    const prevStart = bjAddDays(start, -(Number(q.days) || 30));
    const prevRows = db.prepare(`SELECT *, units*unit_cost cogs FROM sales_daily WHERE date BETWEEN ? AND ?`).all(
      prevStart, prevEnd);
    const prevKpi = derive(prevRows);
    const trend = db.prepare(`SELECT date, SUM(total_sales) gmv, SUM(ad_spend) spend, SUM(ad_sales) ad_sales,
      SUM(units*unit_cost) cogs, SUM(refund) refund, SUM(units) units FROM sales_daily${sql} GROUP BY date ORDER BY date`)
      .all(...params).map(t => ({
        ...t,
        gmv: r2(t.gmv), spend: r2(t.spend), ad_sales: r2(t.ad_sales), cogs: r2(t.cogs), refund: r2(t.refund),
        profit: r2((t.gmv || 0) - (t.refund || 0) - (t.cogs || 0) - (t.spend || 0)),
      }));
    const dim = col => db.prepare(`SELECT COALESCE(${col},'未知') name, SUM(total_sales) gmv, SUM(ad_spend) spend,
      SUM(ad_sales) ad_sales FROM sales_daily${sql} GROUP BY name ORDER BY gmv DESC`).all(...params)
      .map(r => ({ name: r.name, gmv: r2(r.gmv), spend: r2(r.spend), roas: r.spend ? r3(r.ad_sales / r.spend) : null }));
    const top = db.prepare(`SELECT sku, MAX(category) category, SUM(total_sales) gmv, SUM(units) units,
      SUM(ad_spend) spend, SUM(ad_sales) ad_sales FROM sales_daily${sql} GROUP BY sku ORDER BY gmv DESC LIMIT 10`).all(...params)
      .map(r => ({ sku: r.sku, category: r.category, gmv: r2(r.gmv), units: r.units, spend: r2(r.spend), roas: r.spend ? r3(r.ad_sales / r.spend) : null }));
    const flags = [];
    const roasTarget = cfgRoasTarget();
    const refundAlert = cfgRefundAlert();
    if (kpi.roas != null && kpi.roas < roasTarget) flags.push(`整体 ROAS ${kpi.roas} 低于 ${roasTarget} 参考线（阈值可在系统设置调整）`);
    if (kpi.refund_rate != null && kpi.refund_rate > refundAlert) flags.push(`退款率 ${(kpi.refund_rate * 100).toFixed(1)}% 超过 ${(refundAlert * 100).toFixed(0)}% 告警线`);
    // 库存块（来自上传的库存表）
    const inventory = tableEmpty('inventory') ? null : (() => {
      const inv = this.inventory({ sort: 'value' });
      const cnt = (t) => inv.records.filter((r) => r.tags.includes(t)).length;
      return {
        kpi: inv.kpi,
        thresholds: inv.thresholds,
        report_date: inv.report_date,
        oos_skus: cnt('缺货'),
        low_skus: cnt('库存偏低'),
        aging_skus: cnt('库龄偏大'),
        top_skus: inv.records.slice(0, 8),
        by_site: inv.by_site,
      };
    })();
    if (inventory) {
      flags.push(`库存（报表日期 ${inventory.report_date || '—'}）：${inventory.kpi.skus} 个 SKU，可售 ${inventory.kpi.available}、在途 ${inventory.kpi.inbound}，库存金额 ${inventory.kpi.stock_value}`);
      if (inventory.oos_skus || inventory.low_skus) flags.push(`库存预警：${inventory.oos_skus} 个 SKU 缺货、${inventory.low_skus} 个可售天数不足 ${inventory.thresholds.low_days} 天`);
    }
    // 广告花费块（来自上传的广告明细表）
    const ads_detail = tableEmpty('ads_daily') ? null : (() => {
      const a = db.prepare(`SELECT COALESCE(SUM(spend),0) spend, COALESCE(SUM(ad_sales),0) ad_sales,
        COALESCE(SUM(ad_orders),0) orders, COALESCE(SUM(clicks),0) clicks, COALESCE(SUM(impressions),0) impressions,
        COUNT(DISTINCT campaign) campaigns, MIN(date) d1, MAX(date) d2 FROM ads_daily`).get();
      const spend = Number(a.spend) || 0;
      const top = db.prepare(`SELECT COALESCE(campaign,'（未填活动）') campaign, MAX(platform) platform, MAX(site) site,
        SUM(spend) spend, SUM(ad_sales) ad_sales, SUM(ad_orders) orders FROM ads_daily GROUP BY campaign ORDER BY spend DESC LIMIT 8`)
        .all().map((r) => ({ ...r, spend: r2(r.spend), ad_sales: r2(r.ad_sales), roas: r.spend ? r3(r.ad_sales / r.spend) : null }));
      return {
        range: [a.d1, a.d2], campaigns: a.campaigns,
        spend: r2(spend), ad_sales: r2(a.ad_sales), orders: a.orders, clicks: a.clicks, impressions: a.impressions,
        roas: spend ? r3(a.ad_sales / spend) : null,
        acos: a.ad_sales ? r4(spend / a.ad_sales) : null,
        cpc: a.clicks ? r3(spend / a.clicks) : null,
        ctr: a.impressions ? r4(a.clicks / a.impressions) : null,
        top_campaigns: top,
      };
    })();
    if (ads_detail) {
      flags.push(`广告花费明细（${ads_detail.range[0]} ~ ${ads_detail.range[1]}）：花费 ${ads_detail.spend}，广告销售额 ${ads_detail.ad_sales}，ROAS ${ads_detail.roas ?? '—'}`);
      const losing = ads_detail.top_campaigns.filter((c) => c.roas != null && c.roas < 1);
      if (losing.length) flags.push(`广告明细中 ${losing.length} 个活动花费高于广告销售额（ROAS < 1），广告本身为亏损`);
    }
    const finance = financeBlock();
    if (finance) {
      flags.push(`订单结算财务：${finance.kpi.orders} 单 / 收入 ${finance.kpi.revenue} ${finance.currency}（≈$${finance.revenue_usd}），净利 ${finance.kpi.profit} ${finance.currency}，净利率 ${finance.kpi.margin_rate}%`);
      const marginTarget = threshold('order_margin_target', 15);   // 订单净利率参考线（%）
      const refundPct = cfgRefundAlert() * 100;
      if (finance.kpi.margin_rate < marginTarget) flags.push(`订单净利率 ${finance.kpi.margin_rate}% 低于 ${marginTarget}% 参考线，关注佣金与附加费侵蚀`);
      if (finance.kpi.refund_rate > refundPct) flags.push(`订单退款率 ${finance.kpi.refund_rate}% 超过 ${refundPct}% 告警线`);
      const thin = finance.top_sku.filter((s) => s.status !== '健康').length;
      if (thin) flags.push(`结算 Top SKU 中 ${thin} 个盈利状态异常（偏薄/亏损），详见订单财务页`);
    }
    return { range: [start, end], kpi, prev_kpi: prevKpi, trend, platform: dim('platform'), site: dim('site'), top_products: top, finance, inventory, ads_detail, flags };
  },

  salesPage(q) {
    const { sql, params } = baseQuery(q, Number(q.days) || 30);
    const total = db.prepare(`SELECT COUNT(*) c FROM sales_daily${sql}`).get(...params).c;
    const current = Number(q.current) || 1, size = Number(q.size) || 20;
    const records = db.prepare(`SELECT * FROM sales_daily${sql} ORDER BY date DESC, id DESC LIMIT ? OFFSET ?`)
      .all(...params, size, (current - 1) * size);
    return { records, total };
  },

  products(q) {
    const { sql, params, start, end } = baseQuery(q, Number(q.days) || 30);
    const rows = db.prepare(`SELECT sku, MAX(category) category, SUM(total_sales) gmv, SUM(units) units,
      SUM(ad_spend) spend, SUM(ad_sales) ad_sales, SUM(refund) refund, SUM(units*unit_cost) cogs
      FROM sales_daily${sql} GROUP BY sku ORDER BY gmv DESC`).all(...params);
    const products = mappers.product.list();
    const records = rows.map(r => {
      const p = products.find(x => x.spu_code === r.sku) || {};
      const profit = r2((r.gmv || 0) - (r.refund || 0) - (r.cogs || 0) - (r.spend || 0));
      return {
        sku: r.sku, name: p.name || r.sku, category: r.category || p.category || '',
        gmv: r2(r.gmv), units: r.units, spend: r2(r.spend), refund: r2(r.refund),
        roas: r.spend ? r3(r.ad_sales / r.spend) : null, profit,
        margin: r.gmv ? r4(profit / r.gmv) : null,
      };
    });
    return { range: [start, end], records };
  },

  productDetail(sku, days = 60) {
    const { sql, params } = baseQuery({ sku }, days);
    const q2 = (days) => {
      const maxRow = db.prepare('SELECT MAX(date) m FROM sales_daily').get();
      const [s, e] = dateRange(maxRow?.m, days);
      return { s, e };
    };
    const { s, e } = q2(days);
    const trend = db.prepare(`SELECT date, SUM(total_sales) gmv, SUM(ad_spend) spend, SUM(units) units,
      SUM(refund) refund FROM sales_daily WHERE sku=? AND date BETWEEN ? AND ? GROUP BY date ORDER BY date`).all(sku, s, e)
      .map(t => ({ ...t, gmv: r2(t.gmv), spend: r2(t.spend), refund: r2(t.refund) }));
    const byPlatform = db.prepare(`SELECT platform, site, SUM(total_sales) gmv, SUM(units) units, SUM(ad_spend) spend,
      SUM(ad_sales) ad_sales FROM sales_daily WHERE sku=? AND date BETWEEN ? AND ? GROUP BY platform, site ORDER BY gmv DESC`)
      .all(sku, s, e).map(r => ({ ...r, gmv: r2(r.gmv), spend: r2(r.spend), roas: r.spend ? r3(r.ad_sales / r.spend) : null }));
    const campaigns = db.prepare(`SELECT campaign, SUM(ad_spend) spend, SUM(ad_sales) ad_sales, SUM(ad_orders) ad_orders
      FROM sales_daily WHERE sku=? AND date BETWEEN ? AND ? GROUP BY campaign ORDER BY spend DESC`)
      .all(sku, s, e).map(r => ({ ...r, spend: r2(r.spend), ad_sales: r2(r.ad_sales), roas: r.spend ? r3(r.ad_sales / r.spend) : null }));
    const product = mappers.product.one({ spu_code: sku }) || null;
    return { sku, product, range: [s, e], trend, byPlatform, campaigns };
  },

  /**
   * 广告投放分析：优先用「广告花费明细」上传表（ads_daily），
   * 没有该表时退回销售日数据（sales_daily），并在返回里标明数据源，避免口径混淆。
   */
  ads(q) {
    const useDetail = q.source === 'ads_daily' ? true
      : (q.source === 'sales_daily' ? false : (tableEmpty('sales_daily') && !tableEmpty('ads_daily')));
    return useDetail ? this.adsFromDetail(q) : this.adsFromSales(q);
  },

  /** 广告花费明细口径：只呈现表里客观有的事实，不臆造保本线 */
  adsFromDetail(q) {
    const days = Number(q.days) || 30;
    const maxRow = db.prepare('SELECT MAX(date) m FROM ads_daily').get();
    const where = [], params = [];
    if (maxRow?.m) {
      const [s, e] = dateRange(maxRow.m, days);
      where.push('date BETWEEN ? AND ?');
      params.push(s, e);
    }
    ['platform', 'site', 'campaign', 'sku', 'shop'].forEach((k) => { if (q[k]) { where.push(`${k} = ?`); params.push(q[k]); } });
    const sql = where.length ? ' WHERE ' + where.join(' AND ') : '';
    const rows = db.prepare(`SELECT COALESCE(campaign,'（未填活动）') campaign, MAX(platform) platform, MAX(site) site, MAX(shop) shop,
      SUM(impressions) impressions, SUM(clicks) clicks, SUM(spend) spend, SUM(ad_sales) ad_sales,
      SUM(ad_orders) ad_orders, SUM(ad_units) ad_units
      FROM ads_daily${sql} GROUP BY campaign ORDER BY spend DESC`).all(...params);
    const records = rows.map((r) => {
      const roas = r.spend ? r3(r.ad_sales / r.spend) : null;
      return {
        campaign: r.campaign, platform: r.platform, site: r.site, shop: r.shop,
        impressions: r.impressions, clicks: r.clicks, units: r.ad_units,
        ctr: r.impressions ? r4(r.clicks / r.impressions) : null,
        cvr: r.clicks ? r4(r.ad_orders / r.clicks) : null,
        cpc: r.clicks ? r3(r.spend / r.clicks) : null,
        spend: r2(r.spend), ad_sales: r2(r.ad_sales), ad_orders: r.ad_orders,
        roas, acos: r.ad_sales ? r4(r.spend / r.ad_sales) : null,
        breakeven_roas: null, profit: null,
        // 只做事实判定：ROAS < 1 表示广告花费高于广告销售额，即广告本身亏
        status: roas == null ? '数据不足' : (roas < 1 ? '亏损' : '观察'),
      };
    });
    const flags = records.filter((r) => r.status === '亏损')
      .map((r) => `活动「${r.campaign}」花费 ${r.spend} 高于广告销售额 ${r.ad_sales}（ROAS ${r.roas} < 1），广告本身是亏的`);
    const rng = db.prepare('SELECT MIN(date) a, MAX(date) b FROM ads_daily').get();
    return { source: 'ads_daily', source_name: '广告花费明细（你上传的表）', range: [rng?.a, rng?.b], records, flags };
  },

  adsFromSales(q) {
    const { sql, params, start, end } = baseQuery(q, Number(q.days) || 30);
    const rows = db.prepare(`SELECT campaign, MAX(platform) platform, MAX(site) site,
      SUM(impressions) impressions, SUM(clicks) clicks, SUM(ad_spend) spend, SUM(ad_sales) ad_sales,
      SUM(ad_orders) ad_orders, SUM(total_sales) gmv, SUM(units) units, SUM(units*unit_cost) cogs
      FROM sales_daily${sql} GROUP BY campaign ORDER BY spend DESC`).all(...params);
    const records = rows.map(r => {
      const roas = r.spend ? r3(r.ad_sales / r.spend) : null;
      const avgPrice = r.units ? r.gmv / r.units : 0;
      const avgCost = r.units ? r.cogs / r.units : 0;
      const contribution = avgPrice ? (avgPrice - avgCost - avgPrice * cfgFeeRate()) / avgPrice : 0;
      const breakeven = contribution > 0.01 ? r3(1 / contribution) : null;
      const profit = r2((r.gmv || 0) - (r.cogs || 0) - (r.spend || 0));
      return {
        campaign: r.campaign, platform: r.platform, site: r.site, impressions: r.impressions, clicks: r.clicks,
        ctr: r.impressions ? r4(r.clicks / r.impressions) : null,
        cvr: r.clicks ? r4(r.ad_orders / r.clicks) : null,
        cpc: r.clicks ? r3(r.spend / r.clicks) : null,
        spend: r2(r.spend), ad_sales: r2(r.ad_sales), ad_orders: r.ad_orders, roas,
        acos: r.ad_sales ? r4(r.spend / r.ad_sales) : null, breakeven_roas: breakeven, profit,
        status: roas != null && breakeven && roas < breakeven ? '亏损' : (roas && breakeven && roas > breakeven * 1.3 ? '可放量' : '观察'),
      };
    });
    const flags = records.filter(r => r.status === '亏损')
      .map(r => `广告活动 ${r.campaign} ROAS ${r.roas} 低于保本线 ${r.breakeven_roas}，建议降价或暂停（判定仅供参考，落地由人执行）`);
    return { source: 'sales_daily', source_name: '销售/广告日数据', range: [start, end], records, flags };
  },

  /**
   * 库存管理：完全基于上传的库存表，不做任何补造。
   * 阈值（低库存天数 / 滞销库龄）读系统设置，可在「系统设置」页调整。
   */
  inventory(q = {}) {
    const rows = mappers.inventory.list();
    if (!rows.length) {
      return {
        empty: true, message: '还没有库存数据 — 请到「数据上传」用「库存管理」数据集导入你的库存报表',
        kpi: null, records: [], by_site: [], by_platform: [], alerts: [], thresholds: null,
      };
    }
    const lowDays = threshold('inventory_low_days', 14);
    const slowDays = threshold('inventory_slow_days', 90);
    const num = (v) => (v == null ? null : Number(v));
    const agg = {
      skus: rows.length,
      available: r2(sum(rows, 'available')),
      inbound: r2(sum(rows, 'inbound')),
      reserved: r2(sum(rows, 'reserved')),
      unfulfillable: r2(sum(rows, 'unfulfillable')),
      total_qty: r2(sum(rows, 'total_qty')),
      stock_value: r2(sum(rows, 'stock_value')),
      storage_fee: r2(sum(rows, 'storage_fee')),
      daily_sales: r2(sum(rows, 'daily_sales')),
    };
    agg.cover_days = agg.daily_sales > 0 ? r2(agg.total_qty / agg.daily_sales) : null;

    const oos = rows.filter((r) => (num(r.available) ?? 0) <= 0 && (num(r.total_qty) ?? 0) <= 0);
    const lowStock = rows.filter((r) => num(r.days_of_supply) != null && num(r.days_of_supply) < lowDays && (num(r.available) ?? 0) > 0);
    const slowMoving = rows.filter((r) => (num(r.age_days) ?? 0) >= slowDays || (num(r.days_of_supply) ?? 0) > slowDays * 2);
    const aging = rows.filter((r) => (num(r.age_days) ?? 0) >= slowDays);

    const records = rows.map((r) => {
      const d = num(r.days_of_supply);
      const a = num(r.available) ?? 0;
      const tags = [];
      if (a <= 0 && (num(r.total_qty) ?? 0) <= 0) tags.push('缺货');
      else if (d != null && d < lowDays) tags.push('库存偏低');
      if ((num(r.age_days) ?? 0) >= slowDays) tags.push('库龄偏大');
      else if (d != null && d > slowDays * 2) tags.push('滞销风险');
      return {
        sku: r.sku, name: r.product_name, asin: r.asin, fnsku: r.fnsku,
        platform: r.platform, site: r.site, warehouse: r.warehouse,
        available: num(r.available), inbound: num(r.inbound), reserved: num(r.reserved),
        total_qty: num(r.total_qty), daily_sales: num(r.daily_sales), days_of_supply: d,
        reorder_point: num(r.reorder_point), safety_stock: num(r.safety_stock),
        stock_value: num(r.stock_value), storage_fee: num(r.storage_fee), age_days: num(r.age_days),
        report_date: r.report_date, currency: r.currency, tags,
      };
    });
    const sorters = {
      value: (a, b) => (b.stock_value || 0) - (a.stock_value || 0),
      days: (a, b) => (a.days_of_supply ?? 1e9) - (b.days_of_supply ?? 1e9),
      age: (a, b) => (b.age_days || 0) - (a.age_days || 0),
      available: (a, b) => (a.available ?? 0) - (b.available ?? 0),
    };
    const sorted = [...records].sort(sorters[q.sort] || sorters.value);

    const groupBy = (col, name) => {
      const m = new Map();
      for (const r of rows) {
        const k = r[col] || '（未填）';
        if (!m.has(k)) m.set(k, { name: k, skus: 0, available: 0, inbound: 0, value: 0, fee: 0 });
        const o = m.get(k);
        o.skus++; o.available += Number(r.available) || 0; o.inbound += Number(r.inbound) || 0;
        o.value += Number(r.stock_value) || 0; o.fee += Number(r.storage_fee) || 0;
      }
      return [...m.values()].map((o) => ({ ...o, available: r2(o.available), inbound: r2(o.inbound), value: r2(o.value), fee: r2(o.fee) }))
        .sort((a, b) => b.value - a.value);
    };

    const alerts = [];
    if (oos.length) alerts.push(`${oos.length} 个 SKU 已缺货（可售与总库存均为 0）`);
    if (lowStock.length) alerts.push(`${lowStock.length} 个 SKU 可售天数不足 ${lowDays} 天，关注补货节奏`);
    if (aging.length) alerts.push(`${aging.length} 个 SKU 库龄超过 ${slowDays} 天，注意仓储费与滞销处理`);
    if (agg.storage_fee) alerts.push(`本期仓储费合计 ${agg.storage_fee}${rows[0]?.currency ? ' ' + rows[0].currency : ''}`);
    const noValue = rows.filter((r) => num(r.stock_value) == null).length;
    if (noValue) alerts.push(`${noValue} 行没有库存金额字段（表中未提供），相关金额分析会不完整`);

    return {
      empty: false, kpi: agg, records: sorted,
      by_site: groupBy('site', '站点'), by_platform: groupBy('platform', '平台'),
      alerts, thresholds: { low_days: lowDays, slow_days: slowDays },
      report_date: rows.map((r) => r.report_date).filter(Boolean).sort().pop() || null,
    };
  },

  selection(site = 'MX', targetMargin = 0.2) {
    const products = mappers.product.list();
    const freights = mappers.freight.list({ site });
    const rates = mappers.rate.list();
    const flags = [], needHumanReview = [];
    const lowMargin = cfgLowMargin(); // 低毛利参考线（实时读系统设置）
    const records = products.map(p => {
      const lb = (p.weight_kg || 0) * 2.20462;
      let f = freights.find(fr => lb >= fr.weight_min && lb < fr.weight_max)?.freight_usd;
      if (f == null && freights.length) f = Math.max(...freights.map(fr => fr.freight_usd));
      const candidates = rates.filter(r => r.site === site && (r.category === '*' || !r.category || r.category === p.category));
      const rate = candidates.sort((a, b) => (b.commission || 0) - (a.commission || 0))[0];
      const feeRate = rate ? (rate.commission || 0) + (rate.other_fee || 0) : cfgFeeRate();
      const price = p.price || 0, cost = p.cost || 0;
      const net = r2(price * (1 - feeRate) - cost - (f || 0));
      const margin = price ? r4(net / price) : null;
      const breakevenPrice = feeRate < 1 ? r2((cost + (f || 0)) / (1 - feeRate)) : null;
      const targetPrice = feeRate + targetMargin < 1 ? r2((cost + (f || 0)) / (1 - feeRate - targetMargin)) : null;
      const status = net < 0 ? '亏损' : (margin != null && margin < lowMargin ? '低毛利' : '可售');
      let review = '—';
      if (status === '亏损') { review = `净利 ${net} USD，建议提价至保本价 ${breakevenPrice} 以上或换轻小件`; flags.push(`SKU ${p.spu_code} 在 ${site} 站亏损 ${net} USD`); }
      else if (status === '低毛利') review = `毛利率 ${(margin * 100).toFixed(1)}%，低于 ${lowMargin * 100}% 参考线`;
      return { sku: p.spu_code, name: p.name, price, cost, freight: r2(f || 0), fee_rate: r4(feeRate), net_profit: net, margin, breakeven_price: breakevenPrice, target_price: targetPrice, status, review };
    });
    if (!freights.length) needHumanReview.push({ type: 'missing_data', msg: `${site} 站无运费表数据，暂用最大运费估算` });
    if (!rates.length) needHumanReview.push({ type: 'missing_data', msg: '无费率规则数据，按 15% 佣金假设估算' });
    return { site, target_margin: targetMargin, records, flags, need_human_review: needHumanReview };
  },

  review(days = 7) {
    const maxRow = db.prepare('SELECT MAX(date) m FROM sales_daily').get();
    const [start, end] = dateRange(maxRow?.m, days);
    const prevEnd = bjAddDays(start, -1);
    const prevStart = bjAddDays(start, -days);
    const agg = (s, e) => db.prepare(`SELECT platform, SUM(total_sales) gmv, SUM(ad_spend) spend, SUM(ad_sales) ad_sales,
      SUM(units*unit_cost) cogs, SUM(refund) refund FROM sales_daily WHERE date BETWEEN ? AND ? GROUP BY platform`)
      .all(s, e);
    const cur = agg(start, end), prev = agg(prevStart, prevEnd);
    const curAll = db.prepare(`SELECT COALESCE(SUM(total_sales),0) gmv, COALESCE(SUM(ad_spend),0) spend,
      COALESCE(SUM(ad_sales),0) ad_sales, COALESCE(SUM(units*unit_cost),0) cogs, COALESCE(SUM(refund),0) refund
      FROM sales_daily WHERE date BETWEEN ? AND ?`).get(start, end);
    const kpi = { ...curAll, gmv: r2(curAll.gmv), spend: r2(curAll.spend), ad_sales: r2(curAll.ad_sales),
      profit: r2(curAll.gmv - curAll.refund - curAll.cogs - curAll.spend),
      roas: curAll.spend ? r3(curAll.ad_sales / curAll.spend) : null };
    const alerts = [];
    const deltas = cur.map(c => {
      const p = prev.find(x => x.platform === c.platform) || {};
      [['gmv', 'GMV'], ['spend', '广告花费']].forEach(([k, label]) => {
        const cv = c[k] || 0, pv = p[k] || 0;
        if (pv > 0 && Math.abs(cv - pv) / pv > 0.3) {
          alerts.push(`${c.platform} ${label}环比${cv > pv ? '增长' : '下滑'} ${(Math.abs(cv - pv) / pv * 100).toFixed(0)}%（${pv.toFixed(0)} → ${cv.toFixed(0)}）`);
        }
      });
      return { platform: c.platform, cur: { gmv: r2(c.gmv), spend: r2(c.spend) }, prev: { gmv: r2(p.gmv || 0), spend: r2(p.spend || 0) } };
    });
    const adsEnv = this.ads({ days });
    const loss = adsEnv.records.filter(r => r.status === '亏损');
    loss.forEach(r => alerts.push(`活动 ${r.campaign} 本期 ROAS ${r.roas} < 保本 ${r.breakeven_roas}，累计亏损 ${r.profit} USD`));
    const finance = financeBlock();
    if (finance) {
      alerts.push(`订单结算（${finance.currency}）：${finance.kpi.orders} 单，收入 ${finance.kpi.revenue}，净利 ${finance.kpi.profit}（净利率 ${finance.kpi.margin_rate}%），广告单占比 ${finance.kpi.ad_order_rate}%`);
      const worst = financeBySku({ sort: 'margin' }).filter((s) => s.status !== '健康').slice(0, 3);
      worst.forEach((s) => alerts.push(`SKU ${s.sku} 结算净利率仅 ${s.margin_rate}%（${s.status}），净利 ${s.profit} ${finance.currency}`));
    }
    return { range: [start, end], kpi, deltas, alerts, loss_campaigns: loss, finance, flags: [`${alerts.length} 项异常待复核`] };
  },

  meta() {
    const col = c => [...new Set(db.prepare(`SELECT DISTINCT ${c} v FROM sales_daily WHERE ${c} IS NOT NULL`).all().map(r => r.v))];
    const rng = db.prepare('SELECT MIN(date) a, MAX(date) b FROM sales_daily').get();
    return { platforms: col('platform'), sites: col('site'), categories: col('category'), skus: col('sku'), date_range: [rng.a, rng.b] };
  },
};
