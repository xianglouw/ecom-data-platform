/**
 * 增长中枢服务 —— 以 SKU 为主线把运营串成一条自动化回流链
 *
 * 工作流（对齐「SKU 数据中枢」蓝图）：
 *   选品研究 → 商品链接(上架生成/链接体检) → 达人建联 → 素材库 → 视频发布
 *   销售 / 广告 / 库存数据自动回流（复用 sales_daily / ads_daily / inventory），
 *   按 sku 聚合到每个 SKU 的链路上，链路总览一屏看清「哪个 SKU 卡在哪个环节」。
 *
 * 设计：六个模块共用一张注册表（MODULES），字段类型 / 检索 / 过滤全部声明式登记，
 *   新增模块只需加一条注册项即可获得分页 / CRUD / 链路聚合能力。
 */
import { mappers } from '../mapper/index.js';
import { BizError } from '../common/R.js';
import { bjNow, bjToday, bjAddDays } from '../common/datetime.js';

const now = () => bjNow();

/** 模块注册表：required=必填 text=字符串字段 num=浮点 int=整数 search=关键字检索 filters=等值过滤 */
const MODULES = {
  sku: {
    name: 'SKU 主数据', mapper: 'growthSku', required: ['sku_code', 'name'],
    text: ['sku_code', 'name', 'category', 'platforms', 'lifecycle', 'supplier', 'owner_note'],
    num: ['cost', 'target_price'], int: ['first_batch_qty'],
    search: 'nameLike', filters: ['lifecycle', 'category', 'sku_code'],
  },
  selection: {
    name: '选品研究', mapper: 'selection', required: ['sku_code'],
    text: ['sku_code', 'source', 'keyword', 'competitor', 'trend', 'verdict', 'note'],
    num: ['price', 'rating', 'opportunity_score', 'target_price'], int: ['sales_30d', 'review_count'],
    search: 'sku_codeLike', filters: ['verdict', 'sku_code', 'source'],
  },
  listing: {
    name: '商品与链接', mapper: 'listing', required: ['sku_code'],
    text: ['sku_code', 'platform', 'listing_id', 'task_type', 'title', 'description',
      'attrs_json', 'images_json', 'issues', 'status', 'note'],
    num: [], int: [],
    search: 'titleLike', filters: ['status', 'sku_code', 'platform', 'task_type'],
  },
  material: {
    name: '素材库', mapper: 'material', required: ['sku_code'],
    text: ['sku_code', 'type', 'title', 'content', 'source', 'status'],
    num: [], int: ['variant_count'],
    search: 'titleLike', filters: ['status', 'sku_code', 'type'],
  },
  influencer: {
    name: '达人建联', mapper: 'influencer', required: ['sku_code', 'influencer'],
    text: ['sku_code', 'influencer', 'platform', 'region', 'tags', 'invite_msg',
      'status', 'commission_note', 'contract_note'],
    num: [], int: ['reach'],
    search: 'influencerLike', filters: ['status', 'sku_code', 'platform'],
  },
  video: {
    name: '视频发布', mapper: 'video', required: ['sku_code'],
    text: ['sku_code', 'platform', 'title', 'tags', 'cart_draft', 'status'],
    num: ['gmv'], int: ['material_id', 'views'],
    search: 'titleLike', filters: ['status', 'sku_code', 'platform'],
  },
};

function mod(module) {
  const m = MODULES[module];
  if (!m) throw new BizError('未知模块: ' + module, 'A0400');
  return m;
}

/** 只接受登记过的字段并按声明类型转换（防脏字段进库，等价于白名单校验） */
function pick(m, body = {}) {
  const row = {};
  for (const k of m.text) if (body[k] !== undefined) row[k] = body[k] === null ? '' : String(body[k]);
  for (const k of m.num) if (body[k] !== undefined && body[k] !== '') row[k] = Number(body[k]) || 0;
  for (const k of m.int) if (body[k] !== undefined && body[k] !== '') row[k] = Math.round(Number(body[k])) || 0;
  return row;
}

/** 哪些模块带 updated_at（跟随人工把关节点的记录） */
const TRACKED = new Set(['sku', 'listing', 'influencer']);

export const growthService = {
  /** 模块元信息（前端动态生成页签与表单用） */
  meta() {
    return Object.entries(MODULES).map(([key, m]) => ({
      key, name: m.name, required: m.required, filters: m.filters,
      fields: [...m.text, ...m.num, ...m.int],
    }));
  },

  /** 分页查询（keyword 走 LIKE，filters 走等值） */
  page(module, params = {}) {
    const m = mod(module);
    const { current = 1, size = 20, keyword, ...rest } = params;
    const cond = {};
    if (keyword && m.search) cond[m.search] = keyword;
    for (const f of m.filters) if (rest[f] !== undefined && rest[f] !== '') cond[f] = rest[f];
    return mappers[m.mapper].page(cond, current, size, 'id DESC');
  },

  create(module, body = {}) {
    const m = mod(module);
    for (const f of m.required) {
      if (body[f] === undefined || body[f] === null || body[f] === '') {
        throw new BizError(`${m.name}缺少必填字段: ${f}`, 'A0400');
      }
    }
    const row = pick(m, body);
    if (module === 'sku') {
      if (mappers.growthSku.one({ sku_code: row.sku_code })) {
        throw new BizError('SKU 编码已存在: ' + row.sku_code);
      }
      if (!row.lifecycle) row.lifecycle = '选品池';
    }
    row.created_at = now();
    if (TRACKED.has(module)) row.updated_at = row.created_at;
    return mappers[m.mapper].insert(row);
  },

  update(module, id, body = {}) {
    const m = mod(module);
    const old = mappers[m.mapper].byId(id);
    if (!old) throw new BizError(`${m.name}记录不存在`, 'A0404');
    const row = pick(m, body);
    if (module === 'sku' && row.sku_code && row.sku_code !== old.sku_code) {
      if (mappers.growthSku.one({ sku_code: row.sku_code })) {
        throw new BizError('SKU 编码已存在: ' + row.sku_code);
      }
    }
    if (!Object.keys(row).length) return old;
    if (TRACKED.has(module)) row.updated_at = now();
    return mappers[m.mapper].update(id, row);
  },

  remove(module, id) {
    const m = mod(module);
    if (!mappers[m.mapper].byId(id)) throw new BizError(`${m.name}记录不存在`, 'A0404');
    mappers[m.mapper].deleteById(id);
    return { id };
  },

  /** 单 SKU 全链路档案：主数据 + 五个环节的全部记录 + 数据回流 */
  chain(code) {
    const master = mappers.growthSku.one({ sku_code: code });
    if (!master) throw new BizError('SKU 不存在: ' + code, 'A0404');
    return {
      master,
      selection: mappers.selection.list({ sku_code: code }, 'id DESC'),
      listing: mappers.listing.list({ sku_code: code }, 'id DESC'),
      material: mappers.material.list({ sku_code: code }, 'id DESC'),
      influencer: mappers.influencer.list({ sku_code: code }, 'id DESC'),
      video: mappers.video.list({ sku_code: code }, 'id DESC'),
      reflux: this._reflux([code])[code] || {},
    };
  },

  /**
   * 数据回流：按 SKU 聚合近 30 天销售 / 广告 + 库存最新快照。
   * 复用既有事实表，不重复建表 —— 这是「回流」而不是「再次录入」。
   */
  _reflux(codes) {
    const out = {};
    if (!codes.length) return out;
    const ph = codes.map(() => '?').join(',');
    const since = bjAddDays(bjToday(), -30);
    for (const r of mappers.metric.exec(
      `SELECT sku, SUM(total_sales) gmv, SUM(ad_spend) ad_spend, SUM(units) units
       FROM sales_daily WHERE sku IN (${ph}) AND date >= ? GROUP BY sku`,
      ...codes, since
    )) {
      out[r.sku] = { ...(out[r.sku] || {}), gmv_30d: r.gmv || 0, ad_spend_30d: r.ad_spend || 0, units_30d: r.units || 0 };
    }
    for (const r of mappers.metric.exec(
      `SELECT sku, SUM(spend) ad_spend, SUM(ad_sales) ad_sales
       FROM ads_daily WHERE sku IN (${ph}) AND date >= ? GROUP BY sku`,
      ...codes, since
    )) {
      const prev = out[r.sku] || {};
      const spend = r.ad_spend || prev.ad_spend_30d || 0;
      out[r.sku] = {
        ...prev,
        ad_spend_30d: spend,
        ad_sales_30d: r.ad_sales || 0,
        roas_30d: spend ? Number(((r.ad_sales || 0) / spend).toFixed(2)) : null,
      };
    }
    for (const r of mappers.metric.exec(
      `SELECT sku, days_of_supply, age_days, total_qty, available FROM inventory
       WHERE sku IN (${ph})
         AND id IN (SELECT MAX(id) FROM inventory WHERE sku IN (${ph}) GROUP BY sku)`,
      ...codes, ...codes
    )) {
      out[r.sku] = {
        ...(out[r.sku] || {}),
        days_of_supply: r.days_of_supply, age_days: r.age_days,
        total_qty: r.total_qty, available: r.available,
      };
    }
    return out;
  },

  /** 链路总览：每个 SKU 一行，串起 选品 → 链接 → 素材 → 达人 → 视频 → 回流 */
  overview(params = {}) {
    const { keyword, lifecycle } = params;
    // 关键词同时匹配 SKU 编码或品名（buildWhere 不支持 OR，这里单独查）
    let rows;
    if (keyword) {
      const like = `%${keyword}%`;
      rows = mappers.growthSku.exec(
        `SELECT * FROM sku_master WHERE sku_code LIKE ? OR name LIKE ? ORDER BY id DESC`, like, like
      );
      if (lifecycle) rows = rows.filter((r) => r.lifecycle === lifecycle);
    } else {
      rows = mappers.growthSku.list(lifecycle ? { lifecycle } : {}, 'id DESC');
    }
    const total = rows.length;
    const current = Number(params.current) || 1;
    const size = Number(params.size) || 20;
    const page = { records: rows.slice((current - 1) * size, current * size), total, current, size };
    const reflux = this._reflux(page.records.map((s) => s.sku_code));

    const agg = { selection: {}, listing: {}, material: {}, influencer: {}, video: {} };
    const put = (key, rows) => {
      for (const r of rows) (agg[key][r.sku_code] ||= []).push(r);
    };
    put('selection', mappers.selection.list());
    put('listing', mappers.listing.list());
    put('material', mappers.material.list());
    put('influencer', mappers.influencer.list());
    put('video', mappers.video.list());

    return {
      ...page,
      records: page.records.map((s) => {
        const code = s.sku_code;
        const sel = (agg.selection[code] || []).sort((a, b) => b.id - a.id);
        const list = (agg.listing[code] || []).sort((a, b) => b.id - a.id);
        const live = list.filter((l) => l.status === '已上架');
        const vids = agg.video[code] || [];
        return {
          ...s,
          opportunity_score: sel[0]?.opportunity_score ?? null,
          verdict: sel[0]?.verdict ?? '未研究',
          listing_total: list.length,
          listing_live: live.length,
          listing_status: live.length ? '已上架' : list.length ? list[0].status : '未开始',
          material_count: (agg.material[code] || []).length,
          influencer_count: (agg.influencer[code] || []).length,
          video_count: vids.length,
          video_published: vids.filter((v) => v.status === '已发布').length,
          reflux: reflux[code] || {},
        };
      }),
    };
  },
};
