/**
 * 数据接入服务 —— 对齐 ecom-data-prep：表头归一 → 数字解析 → 必填校验 → 问题行隔离
 * 原则：不编造数据、不静默修数，认不准的进隔离行
 */
import XLSX from 'xlsx';
import { mappers, db } from '../mapper/index.js';
import { bjNow, bjToday } from '../common/datetime.js';

const ALIASES = {
  sales: {
    日期: 'date', date: 'date', 数据日期: 'date',
    广告活动: 'campaign', campaign: 'campaign', 广告系列: 'campaign',
    商品编码: 'sku', sku: 'sku', seller_sku: 'sku',
    平台: 'platform', platform: 'platform', 渠道: 'platform',
    站点: 'site', site: 'site', market: 'site', 市场: 'site',
    类目: 'category', category: 'category', 品类: 'category',
    曝光: 'impressions', impressions: 'impressions', 曝光量: 'impressions',
    点击: 'clicks', clicks: 'clicks', 点击量: 'clicks',
    花费: 'ad_spend', 广告花费: 'ad_spend', spend: 'ad_spend',
    订单数: 'ad_orders', 广告订单: 'ad_orders', orders: 'ad_orders',
    销量: 'units', units: 'units', 销售量: 'units',
    广告销售额: 'ad_sales', ad_sales: 'ad_sales',
    总销售额: 'total_sales', total_sales: 'total_sales', 销售额: 'total_sales', gmv: 'total_sales',
    单位成本: 'unit_cost', unit_cost: 'unit_cost', 成本: 'unit_cost',
    退款金额: 'refund', refund: 'refund', 退款: 'refund',
    币种: 'currency', currency: 'currency',
  },
  product: {
    sku: 'spu_code', 商品编码: 'spu_code', spu_code: 'spu_code',
    商品名称: 'name', name: 'name', 名称: 'name',
    类目: 'category', category: 'category', 品类: 'category',
    品牌: 'brand', brand: 'brand',
    成本: 'cost', cost: 'cost',
    售价: 'price', price: 'price', 销售价: 'price',
    市场价: 'market_price', market_price: 'market_price',
    库存: 'stock', stock: 'stock',
    重量kg: 'weight_kg', 单件重量kg: 'weight_kg', weight_kg: 'weight_kg',
    销量: 'sales', sales: 'sales',
    状态: 'status', status: 'status',
    备注: 'remark', remark: 'remark',
  },
  freight: {
    站点: 'site', site: 'site',
    重量下限: 'weight_min', weight_min: 'weight_min',
    重量上限: 'weight_max', weight_max: 'weight_max',
    运费usd: 'freight_usd', 运费: 'freight_usd', freight: 'freight_usd',
  },
  rate: {
    平台: 'platform', platform: 'platform',
    站点: 'site', site: 'site',
    类目: 'category', category: 'category',
    佣金率: 'commission', 佣金: 'commission', commission: 'commission',
    其他费率: 'other_fee', other_fee: 'other_fee',
    来源: 'source', source: 'source',
    生效日期: 'effective_date', effective_date: 'effective_date',
  },
  // 订单财务明细：适配 Mercado Libre 等平台导出的订单级结算表（中/西/英三语表头）
  orderFinance: {
    订单编号: 'order_no', 订单号: 'order_no', 订单id: 'order_no', 订单: 'order_no',
    orderno: 'order_no', order_no: 'order_no', orderid: 'order_no', order_id: 'order_no',
    númerodeorden: 'order_no', numerodeorden: 'order_no', numerodepedido: 'order_no',
    sku: 'sku', 商品编码: 'sku', skucode: 'sku', sellersku: 'sku', 货号: 'sku',
    '#depublicación': 'listing_id', '#depublicacion': 'listing_id',
    publicación: 'listing_id', publicacion: 'listing_id', 刊登号: 'listing_id',
    广告编号: 'listing_id', listingid: 'listing_id', listing_id: 'listing_id',
    单量: 'qty', 数量: 'qty', 件数: 'qty', 销量: 'qty',
    qty: 'qty', quantity: 'qty', cantidad: 'qty', units: 'qty',
    总收入: 'gross_revenue', 收入: 'gross_revenue', 销售额: 'gross_revenue', 总销售额: 'gross_revenue',
    ingresototal: 'gross_revenue', ingresos: 'gross_revenue', ingreso: 'gross_revenue',
    totalrevenue: 'gross_revenue', grossrevenue: 'gross_revenue', revenue: 'gross_revenue', gmv: 'gross_revenue',
    佣金: 'commission', 平台佣金: 'commission', 手续费: 'commission',
    comisión: 'commission', comision: 'commission', commission: 'commission',
    附加费: 'surcharge', 额外费用: 'surcharge', 其他费用: 'surcharge',
    cargoextra: 'surcharge', cargoadicional: 'surcharge', surcharge: 'surcharge', additionalfee: 'surcharge',
    运费: 'shipping_fee', 物流费: 'shipping_fee', 配送费: 'shipping_fee',
    envío: 'shipping_fee', envio: 'shipping_fee', shipping: 'shipping_fee',
    shippingfee: 'shipping_fee', freight: 'shipping_fee',
    退货退款: 'refund', 退款: 'refund', 退款金额: 'refund', 退货: 'refund',
    devolución: 'refund', devolucion: 'refund', reembolso: 'refund',
    refund: 'refund', returns: 'refund', refundamount: 'refund',
    '净利润(比索)': 'net_profit', 净利润: 'net_profit', 净利: 'net_profit', 利润: 'net_profit',
    utilidad: 'net_profit', utilidadneta: 'net_profit', netprofit: 'net_profit', net_profit: 'net_profit',
    ventaporpublicidad: 'is_ad_sale', 广告销售: 'is_ad_sale', 是否广告: 'is_ad_sale', 广告订单: 'is_ad_sale',
    adsale: 'is_ad_sale', ad_sale: 'is_ad_sale', isadsale: 'is_ad_sale', is_ad_sale: 'is_ad_sale',
    币种: 'currency', 货币: 'currency', currency: 'currency', moneda: 'currency',
    站点: 'site', site: 'site', 市场: 'site', market: 'site', país: 'site', pais: 'site',
    平台: 'platform', platform: 'platform', 渠道: 'platform', channel: 'platform',
  },
  // 库存表：各平台库存报表 / ERP 导出（字段叫法差异大，尽量多收别名）
  inventory: {
    日期: 'report_date', 数据日期: 'report_date', 报表日期: 'report_date', 快照日期: 'report_date',
    date: 'report_date', reportdate: 'report_date', 更新时间: 'report_date', 库存日期: 'report_date',
    平台: 'platform', platform: 'platform', 渠道: 'platform', channel: 'platform',
    站点: 'site', site: 'site', 市场: 'site', market: 'site', 国家: 'site', country: 'site',
    país: 'site', pais: 'site', 地区: 'site', 商城: 'site', marketplace: 'site',
    仓库: 'warehouse', warehouse: 'warehouse', 库房: 'warehouse', 仓储: 'warehouse', 仓库名称: 'warehouse',
    sku: 'sku', msku: 'sku', 商品编码: 'sku', 货号: 'sku', 商家sku: 'sku', sellersku: 'sku',
    seller_sku: 'sku', 'seller-sku': 'sku', 商家编码: 'sku', 子sku: 'sku', parents_sku: 'sku',
    asin: 'asin', 父asin: 'asin',
    fnsku: 'fnsku', 配送sku: 'fnsku', fba配送编号: 'fnsku',
    商品名称: 'product_name', 名称: 'product_name', 品名: 'product_name', 标题: 'product_name',
    productname: 'product_name', title: 'product_name', 产品名称: 'product_name',
    可售库存: 'available', 可用库存: 'available', 现有库存: 'available', 在售库存: 'available',
    可售数量: 'available', 库存: 'available', 可用数量: 'available', available: 'available',
    availableqty: 'available', 'afn-可售库存': 'available', afn可售库存: 'available',
    在途: 'inbound', 在途库存: 'inbound', 在途数量: 'inbound', 入库中: 'inbound', 待入库: 'inbound',
    inbound: 'inbound', inboundqty: 'inbound', 调拨在途: 'inbound',
    预留: 'reserved', 预留库存: 'reserved', 预留数量: 'reserved', 锁定库存: 'reserved',
    reserved: 'reserved', reservedqty: 'reserved', 待发货: 'reserved',
    不可售: 'unfulfillable', 不可售库存: 'unfulfillable', 残次: 'unfulfillable',
    unfulfillable: 'unfulfillable', 待处理: 'unfulfillable',
    总库存: 'total_qty', 库存总量: 'total_qty', totalqty: 'total_qty', 合计: 'total_qty',
    总数量: 'total_qty', 库存合计: 'total_qty',
    日均销量: 'daily_sales', 日销: 'daily_sales', 日均出单: 'daily_sales', 日均订单: 'daily_sales',
    dailysales: 'daily_sales', 平均日销: 'daily_sales',
    可售天数: 'days_of_supply', 动销天数: 'days_of_supply', 库存周转天数: 'days_of_supply',
    周转天数: 'days_of_supply', 覆盖天数: 'days_of_supply', 可供天数: 'days_of_supply',
    daysofsupply: 'days_of_supply',
    补货点: 'reorder_point', 再订货点: 'reorder_point', 补货阈值: 'reorder_point', reorderpoint: 'reorder_point',
    安全库存: 'safety_stock', safetystock: 'safety_stock', 最低库存: 'safety_stock',
    库存金额: 'stock_value', 库存成本: 'stock_value', 库存价值: 'stock_value', 库存货值: 'stock_value',
    stockvalue: 'stock_value', inventoryvalue: 'stock_value',
    仓储费: 'storage_fee', 长期仓储费: 'storage_fee', 仓储费用: 'storage_fee', storagefee: 'storage_fee',
    库龄: 'age_days', 库龄天数: 'age_days', 库存天数: 'age_days', 在库天数: 'age_days', agedays: 'age_days',
    状态: 'status', 库存状态: 'status', status: 'status',
    币种: 'currency', 货币: 'currency', currency: 'currency',
  },
  // 广告花费明细：平台广告后台 / 第三方工具导出
  ads: {
    日期: 'date', date: 'date', 数据日期: 'date', 统计日期: 'date', 报表日期: 'date',
    '日期(utc)': 'date', 'date(utc)': 'date', 时间: 'date',
    平台: 'platform', platform: 'platform', 渠道: 'platform', channel: 'platform',
    站点: 'site', site: 'site', 市场: 'site', market: 'site', 国家: 'site', country: 'site', marketplace: 'site',
    店铺: 'shop', 店铺名称: 'shop', 账户: 'shop', 账号: 'shop', 卖家: 'shop', store: 'shop', shop: 'shop',
    广告活动: 'campaign', 广告系列: 'campaign', 活动: 'campaign', 推广计划: 'campaign', 计划: 'campaign',
    campaign: 'campaign', campaignname: 'campaign', 系列: 'campaign',
    广告组: 'ad_group', 广告群组: 'ad_group', 推广单元: 'ad_group', 单元: 'ad_group',
    adgroup: 'ad_group', adgroupname: 'ad_group',
    关键词: 'targeting', 投放词: 'targeting', 搜索词: 'targeting', 投放目标: 'targeting', 目标: 'targeting',
    targeting: 'targeting', keyword: 'targeting', term: 'targeting',
    匹配方式: 'match_type', 匹配类型: 'match_type', matchtype: 'match_type', 匹配: 'match_type',
    sku: 'sku', 商品编码: 'sku', 货号: 'sku', sellersku: 'sku', msku: 'sku', 商家sku: 'sku', 广告sku: 'sku',
    asin: 'asin', 广告asin: 'asin',
    曝光: 'impressions', 曝光量: 'impressions', 展现量: 'impressions', 展示次数: 'impressions',
    impressions: 'impressions', impression: 'impressions', 展示量: 'impressions',
    点击: 'clicks', 点击量: 'clicks', 点击次数: 'clicks', clicks: 'clicks',
    花费: 'spend', 成本: 'spend', 广告花费: 'spend', 支出: 'spend', 费用: 'spend', 总花费: 'spend',
    spend: 'spend', cost: 'spend', 广告成本: 'spend',
    订单数: 'ad_orders', 广告订单: 'ad_orders', 订单: 'ad_orders', 成交订单: 'ad_orders',
    orders: 'ad_orders', 转化: 'ad_orders', 购买次数: 'ad_orders', purchases: 'ad_orders',
    销量: 'ad_units', 销售数量: 'ad_units', 件数: 'ad_units', units: 'ad_units', sold: 'ad_units',
    广告销售额: 'ad_sales', 广告成交额: 'ad_sales', 广告收入: 'ad_sales', 广告销售: 'ad_sales',
    ad_sales: 'ad_sales', 销售金额: 'ad_sales', 销售额: 'ad_sales',
    cpc: 'cpc', 平均点击成本: 'cpc', 单次点击成本: 'cpc', 每次点击费用: 'cpc',
    ctr: 'ctr', 点击率: 'ctr', 点击通过率: 'ctr',
    cvr: 'cvr', 转化率: 'cvr', 订单转化率: 'cvr',
    roas: 'roas', 广告投入产出比: 'roas', 投入产出比: 'roas',
    acos: 'acos', 广告成本销售比: 'acos', 广告销售成本比: 'acos',
    币种: 'currency', 货币: 'currency', currency: 'currency', moneda: 'currency',
  },
};

const CFG = {
  sales: { table: 'sales_daily', mapper: mappers.sales, required: ['date', 'sku', 'total_sales'],
    numeric: ['impressions', 'clicks', 'ad_spend', 'ad_orders', 'units', 'ad_sales', 'total_sales', 'unit_cost', 'refund'],
    text: ['date', 'campaign', 'sku', 'platform', 'site', 'category', 'currency'] },
  product: { table: 'product', mapper: mappers.product, required: ['spu_code', 'name'],
    numeric: ['cost', 'price', 'market_price', 'stock', 'weight_kg', 'sales', 'status'],
    text: ['spu_code', 'name', 'category', 'brand', 'remark'] },
  freight: { table: 'freight', mapper: mappers.freight, required: ['site', 'freight_usd'],
    numeric: ['weight_min', 'weight_max', 'freight_usd'], text: ['site'] },
  rate: { table: 'fee_rate', mapper: mappers.rate, required: ['platform', 'site', 'commission'],
    numeric: ['commission', 'other_fee'], text: ['platform', 'site', 'category', 'source', 'effective_date'] },
  orderFinance: {
    table: 'order_finance', mapper: mappers.orderFinance,
    // 只要求订单号与总收入：财务字段全空的行（未结算/取消单）隔离待人工确认，不静默补 0
    required: ['order_no', 'gross_revenue'],
    numeric: ['qty', 'gross_revenue', 'commission', 'surcharge', 'shipping_fee', 'refund', 'net_profit'],
    text: ['order_no', 'sku', 'listing_id', 'site', 'platform', 'currency'],
    labels: { order_no: '订单编号', gross_revenue: '总收入', sku: 'SKU', qty: '单量', net_profit: '净利润' },
  },
  // 库存表：各卖家导出口径差异极大，因此只强校验 SKU，其余字段有多少收多少，
  // 完全不认识的列统一进 extra_json（保证「表分析」里依然能看到并聚合这一列）
  inventory: {
    table: 'inventory', mapper: mappers.inventory, extra: true,
    required: ['sku'],
    numeric: ['available', 'inbound', 'reserved', 'unfulfillable', 'total_qty', 'daily_sales',
      'days_of_supply', 'reorder_point', 'safety_stock', 'stock_value', 'storage_fee', 'age_days'],
    text: ['report_date', 'platform', 'site', 'warehouse', 'sku', 'asin', 'fnsku', 'product_name', 'status', 'currency'],
    labels: { sku: 'SKU/商品编码', available: '可售库存', total_qty: '总库存', report_date: '报表日期' },
  },
  // 广告花费明细：只强校验日期，花费/曝光等缺失不算错（未投放的广告组确实可能全 0）
  ads: {
    table: 'ads_daily', mapper: mappers.ads, extra: true,
    required: ['date'],
    numeric: ['impressions', 'clicks', 'spend', 'ad_orders', 'ad_units', 'ad_sales', 'cpc', 'ctr', 'cvr', 'roas', 'acos'],
    text: ['date', 'platform', 'site', 'shop', 'campaign', 'ad_group', 'targeting', 'match_type', 'sku', 'asin', 'currency'],
    labels: { date: '日期', spend: '花费', ad_sales: '广告销售额', campaign: '广告活动' },
  },
};

/** 是否广告订单：西语 Sí / 英语 Yes / 中文 是 */
const AD_SALE_TRUE = /^(sí|si|s|yes|y|true|verdadero|1|是|有|广告)$/i;

/** Mercado Libre 刊登号前缀 → 站点（ML + 国家码，1~3 位不等） */
const ML_SITE = { MLM: 'MX', MLB: 'BR', MLA: 'AR', MLC: 'CL', MCO: 'CO', MCR: 'CR', MLU: 'UY', MLV: 'VE', MPE: 'PE', MEC: 'EC', MLH: 'HN', MLN: 'NI', MLP: 'PY', MLS: 'SV', MLT: 'GT' };
const SITE_CURRENCY = { MX: 'MXN', BR: 'BRL', AR: 'ARS', CL: 'CLP', CO: 'COP', PE: 'PEN', US: 'USD', ES: 'EUR' };

export function parseNumber(v) {
  if (v == null) return null;
  if (typeof v === 'number') return v;
  let s = String(v).trim();
  if (!s) return null;
  s = s.replace(/[¥$]/g, '').replace(/USD|CNY/gi, '').trim();
  if (s.includes(',') && s.includes('.')) s = s.replace(/,/g, '');
  else if (s.includes(',')) {
    const parts = s.split(',');
    s = parts.length === 2 && parts[1].length <= 2 ? s.replace(',', '.') : s.replace(/,/g, '');
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

// 剥离 BOM 与空白后归一（UTF-8 BOM 会让首个表头匹配失败）
const normHeader = h => String(h || '').replace(/^\uFEFF/, '').replace(/\s+/g, '').toLowerCase();

function mapHeaders(headers, alias) {
  const map = {}, unmapped = [];
  headers.forEach(h => {
    const key = normHeader(h);
    if (alias[key]) map[h] = alias[key]; else unmapped.push(h);
  });
  return { map, unmapped };
}

/** raw: true —— 不做日期/数字自动转换，保留原始字符串（避免 2026-09-01 被转成 Excel 序列号） */
export function readFile(buffer) {
  const wb = XLSX.read(buffer, { type: 'buffer', raw: true });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json(sheet, { defval: '' });
}

/** 日期归一：兼容 Date 对象与 Excel 序列号（结果按北京时间取日历日） */
function toDate(v) {
  if (v instanceof Date) return bjToday(v);
  if (typeof v === 'number' && v > 30000 && v < 80000) {
    // Excel 序列号以 1899-12-30 为原点，换算后取日期部分
    return new Date(Math.round((v - 25569) * 86400000)).toISOString().slice(0, 10);
  }
  return String(v).trim();
}

export function ingest(dataset, rawRows, { replace = true, dryRun = false, sourceFile = '' } = {}) {
  const cfg = CFG[dataset];
  if (!cfg) throw new Error('未知数据集: ' + dataset);
  const headers = rawRows.length ? Object.keys(rawRows[0]) : [];
  const { map, unmapped } = mapHeaders(headers, ALIASES[dataset]);
  const now = bjNow();
  const label = (c) => (cfg.labels && cfg.labels[c]) || c;
  if (replace && !dryRun) {
    db.prepare(`DELETE FROM ${cfg.table}`).run();
    // 覆盖式导入时同步清掉本数据集的历史隔离行，避免新旧隔离记录累积
    db.prepare('DELETE FROM quarantine WHERE dataset = ?').run(dataset);
  }
  let inserted = 0, quarantined = 0, skipped = 0;
  for (const raw of rawRows) {
    // 整行全空（Excel 末尾空行）直接跳过，不计入隔离
    if (Object.values(raw).every(v => v === '' || v == null)) { skipped++; continue; }
    const rec = {}, problems = [];
    for (const h of headers) if (map[h]) rec[map[h]] = raw[h];
    for (const c of cfg.numeric) {
      const v = rec[c];
      if (v === '' || v == null) { rec[c] = null; continue; }
      const n = parseNumber(v);
      if (n == null) problems.push(`${label(c)} 无法解析为数字: ${v}`);
      rec[c] = n;
    }
    for (const c of cfg.text) {
      const v = rec[c];
      rec[c] = v === '' || v == null ? null : String(v).trim();
    }
    // 未识别表头不丢列：原样收进 extra_json，表分析时可继续按这些列做维度与聚合
    if (cfg.extra) {
      const ex = {};
      for (const h of unmapped) {
        const v = raw[h];
        if (v !== '' && v != null) ex[String(h).trim()] = typeof v === 'number' ? v : String(v).trim();
      }
      rec.extra_json = Object.keys(ex).length ? JSON.stringify(ex) : null;
    }
    if (dataset === 'orderFinance') {
      rec.is_ad_sale = AD_SALE_TRUE.test(String(rec.is_ad_sale ?? '').trim()) ? 1 : 0;
      // 刊登号前缀推断平台与站点：MLM→墨西哥、MLB→巴西、MLA→阿根廷……
      // （ML 后是 1~3 位国家码，不能简单按固定位数截取）
      const lid = String(rec.listing_id || '').toUpperCase();
      const hit = Object.keys(ML_SITE).find((p) => lid.startsWith(p));
      if (hit) {
        if (!rec.platform) rec.platform = 'Mercado Libre';
        if (!rec.site) rec.site = ML_SITE[hit];
      }
      if (!rec.currency) rec.currency = SITE_CURRENCY[rec.site] || null;
      rec.source_file = sourceFile || null;
    }
    // 广告明细：源表没给效率指标时按基础字段补算，方便直接看 CPC/CTR/ROAS/ACOS
    if (dataset === 'ads') {
      const has = (v) => v != null && Number.isFinite(Number(v));
      if (!has(rec.ctr) && has(rec.impressions) && rec.impressions) rec.ctr = +(rec.clicks / rec.impressions).toFixed(4);
      if (!has(rec.cpc) && has(rec.clicks) && rec.clicks) rec.cpc = +(rec.spend / rec.clicks).toFixed(3);
      if (!has(rec.cvr) && has(rec.clicks) && rec.clicks) rec.cvr = +(rec.ad_orders / rec.clicks).toFixed(4);
      if (!has(rec.roas) && has(rec.spend) && rec.spend) rec.roas = +(rec.ad_sales / rec.spend).toFixed(3);
      if (!has(rec.acos) && has(rec.ad_sales) && rec.ad_sales) rec.acos = +(rec.spend / rec.ad_sales).toFixed(4);
      rec.source_file = sourceFile || null;
    }
    // 库存：总库存与可售天数缺失时按表里已有字段推算（推算值仅用于缺字段时兜底，不覆盖源表原值）
    if (dataset === 'inventory') {
      if (rec.report_date) rec.report_date = String(toDate(rec.report_date)).slice(0, 10);
      if (rec.total_qty == null) {
        const parts = [rec.available, rec.inbound, rec.reserved, rec.unfulfillable].filter((v) => v != null);
        if (parts.length) rec.total_qty = parts.reduce((a, b) => a + Number(b || 0), 0);
      }
      if (rec.days_of_supply == null && rec.daily_sales && rec.available != null) {
        rec.days_of_supply = +(rec.available / rec.daily_sales).toFixed(1);
      }
      rec.source_file = sourceFile || null;
    }
    for (const req of cfg.required) if (rec[req] === null || rec[req] === undefined) problems.push(`缺少必填字段 ${label(req)}`);
    if (rec.date) rec.date = toDate(rec.date);
    if (rec.date && !/^\d{4}-\d{2}-\d{2}/.test(rec.date)) problems.push(`日期格式异常: ${rec.date}`);
    if (rec.date) rec.date = String(rec.date).slice(0, 10);
    if (problems.length) {
      if (!dryRun) {
        mappers.quarantine.insert({ dataset, reason: problems.join('; '), row_data: JSON.stringify(raw), created_at: now });
      }
      quarantined++;
      continue;
    }
    if (!dryRun) {
      const row = {};
      const cols = cfg.numeric.concat(cfg.text);
      if (dataset === 'orderFinance') cols.push('is_ad_sale', 'source_file');
      if (dataset === 'inventory' || dataset === 'ads') cols.push('extra_json', 'source_file');
      cols.forEach(c => { if (rec[c] !== undefined) row[c] = rec[c]; });
      if (['product', 'orderFinance', 'inventory', 'ads'].includes(dataset)) row.created_at = now;
      cfg.mapper.insert(row);
    }
    inserted++;
  }
  const flags = [];
  if (quarantined) flags.push(`${quarantined} 行被隔离，未入库（见隔离明细）`);
  if (skipped) flags.push(`跳过 ${skipped} 行空记录`);
  if (unmapped.length) {
    flags.push(cfg.extra
      ? `未识别表头 ${unmapped.length} 个已存入扩展列（表分析里仍可按其聚合）: ${unmapped.slice(0, 6).join(', ')}${unmapped.length > 6 ? ' …' : ''}`
      : `未识别表头: ${unmapped.slice(0, 6).join(', ')}`);
  }
  if (dryRun) flags.push('（演示模式：本次结果未写入数据库）');
  // wasm 版 SQLite 写入是防抖落盘，短生命周期脚本（命令行导入）退出前可能来不及刷盘，
  // 这里入库完成立即强制保存，避免数据只存在内存里
  if (!dryRun && typeof db.save === 'function') db.save();
  return {
    inserted, quarantined, skipped, unmapped_headers: unmapped, flags,
    // 表头识别结果：让使用者先看清「我这列被读成了哪个字段」，再决定是否入库
    header_map: Object.entries(map).map(([header, field]) => ({ header, field })),
    sample: rawRows.slice(0, 3),
    need_human_review: quarantined ? [{ type: 'quarantine', count: quarantined }] : [],
  };
}
