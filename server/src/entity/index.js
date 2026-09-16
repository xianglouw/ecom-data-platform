/**
 * 实体定义与建表 DDL —— entity 层
 * 商品 / 订单 / 会员 / 权限 / 系统设置 / 运营事实表
 */
export const DDL = [
  // 系统：用户与角色（角色模型用于菜单级权限划分）
  `CREATE TABLE IF NOT EXISTS sys_user (
    id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE, nickname TEXT,
    role_code TEXT, mobile TEXT, status INTEGER DEFAULT 1, last_login TEXT, created_at TEXT)`,
  `CREATE TABLE IF NOT EXISTS sys_role (
    id INTEGER PRIMARY KEY AUTOINCREMENT, code TEXT UNIQUE, name TEXT,
    menu TEXT, remark TEXT, status INTEGER DEFAULT 1, created_at TEXT)`,
  `CREATE TABLE IF NOT EXISTS sys_setting (
    id INTEGER PRIMARY KEY AUTOINCREMENT, config_key TEXT UNIQUE, config_value TEXT, remark TEXT)`,

  // 账号体系：手机号 + 短信验证码（无短信通道时走演示模式）
  `CREATE TABLE IF NOT EXISTS sms_code (
    id INTEGER PRIMARY KEY AUTOINCREMENT, mobile TEXT, code TEXT, scene TEXT,
    expires_at TEXT, used INTEGER DEFAULT 0, ip TEXT, created_at TEXT)`,
  `CREATE TABLE IF NOT EXISTS user_token (
    id INTEGER PRIMARY KEY AUTOINCREMENT, token TEXT UNIQUE, user_id INTEGER,
    mobile TEXT, expires_at TEXT, created_at TEXT, last_active TEXT)`,
  `CREATE INDEX IF NOT EXISTS idx_sms_code_mobile ON sms_code(mobile, scene, created_at)`,
  `CREATE INDEX IF NOT EXISTS idx_user_token_token ON user_token(token)`,
  // 手机号即账号，全局唯一（NULL 不参与唯一约束，兼容历史数据）
  `CREATE UNIQUE INDEX IF NOT EXISTS uk_sys_user_mobile ON sys_user(mobile)`,

  // 商品
  `CREATE TABLE IF NOT EXISTS product (
    id INTEGER PRIMARY KEY AUTOINCREMENT, spu_code TEXT UNIQUE, name TEXT, category TEXT,
    brand TEXT, cost REAL, price REAL, market_price REAL, stock INTEGER, weight_kg REAL,
    sales INTEGER DEFAULT 0, status INTEGER DEFAULT 1, created_at TEXT, remark TEXT)`,
  `CREATE TABLE IF NOT EXISTS product_sku (
    id INTEGER PRIMARY KEY AUTOINCREMENT, spu_code TEXT, sku_code TEXT UNIQUE, spec TEXT,
    cost REAL, price REAL, stock INTEGER, sales INTEGER DEFAULT 0, status INTEGER DEFAULT 1)`,

  // 会员
  `CREATE TABLE IF NOT EXISTS member (
    id INTEGER PRIMARY KEY AUTOINCREMENT, nickname TEXT, mobile TEXT, level TEXT,
    balance REAL DEFAULT 0, order_count INTEGER DEFAULT 0, total_amount REAL DEFAULT 0,
    status INTEGER DEFAULT 1, reg_time TEXT)`,

  // 订单
  `CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT, order_no TEXT UNIQUE, member_name TEXT, member_id INTEGER,
    platform TEXT, site TEXT, total_amount REAL, pay_amount REAL, freight REAL,
    item_count INTEGER, status TEXT, pay_time TEXT, created_at TEXT, remark TEXT)`,
  `CREATE TABLE IF NOT EXISTS order_item (
    id INTEGER PRIMARY KEY AUTOINCREMENT, order_no TEXT, sku_code TEXT, product_name TEXT,
    qty INTEGER, price REAL, amount REAL)`,

  // 订单财务明细（适配 Mercado Libre 等平台导出的订单级结算表：
  // 收入 - 佣金 - 附加费 - 运费 - 退款 = 净利，成本项在源文件里为负数）
  `CREATE TABLE IF NOT EXISTS order_finance (
    id INTEGER PRIMARY KEY AUTOINCREMENT, order_no TEXT, sku TEXT, listing_id TEXT, qty REAL,
    gross_revenue REAL, commission REAL, surcharge REAL, shipping_fee REAL, refund REAL,
    net_profit REAL, is_ad_sale INTEGER, site TEXT, platform TEXT, currency TEXT,
    source_file TEXT, created_at TEXT)`,
  `CREATE INDEX IF NOT EXISTS idx_of_order ON order_finance(order_no)`,
  `CREATE INDEX IF NOT EXISTS idx_of_sku ON order_finance(sku)`,
  `CREATE INDEX IF NOT EXISTS idx_of_site ON order_finance(site)`,

  // 运营事实表（ROI 复盘 / 费率 / 运费）
  `CREATE TABLE IF NOT EXISTS sales_daily (
    id INTEGER PRIMARY KEY AUTOINCREMENT, date TEXT, campaign TEXT, sku TEXT, platform TEXT,
    site TEXT, category TEXT, impressions INTEGER, clicks INTEGER, ad_spend REAL, ad_orders INTEGER,
    units INTEGER, ad_sales REAL, total_sales REAL, unit_cost REAL, refund REAL, currency TEXT)`,
  // 库存管理（来源：平台库存报表 / ERP 导出，字段随卖家口径浮动，未识别列进 extra_json 不丢）
  `CREATE TABLE IF NOT EXISTS inventory (
    id INTEGER PRIMARY KEY AUTOINCREMENT, report_date TEXT, platform TEXT, site TEXT, warehouse TEXT,
    sku TEXT, asin TEXT, fnsku TEXT, product_name TEXT,
    available REAL, inbound REAL, reserved REAL, unfulfillable REAL, total_qty REAL,
    daily_sales REAL, days_of_supply REAL, reorder_point REAL, safety_stock REAL,
    stock_value REAL, storage_fee REAL, age_days REAL, status TEXT, currency TEXT,
    extra_json TEXT, source_file TEXT, created_at TEXT)`,
  `CREATE INDEX IF NOT EXISTS idx_inv_sku ON inventory(sku)`,
  `CREATE INDEX IF NOT EXISTS idx_inv_site ON inventory(site)`,
  `CREATE INDEX IF NOT EXISTS idx_inv_date ON inventory(report_date)`,

  // 广告花费明细（来源：平台广告后台 / 第三方工具导出，日粒度到活动/广告组/关键词）
  `CREATE TABLE IF NOT EXISTS ads_daily (
    id INTEGER PRIMARY KEY AUTOINCREMENT, date TEXT, platform TEXT, site TEXT, shop TEXT,
    campaign TEXT, ad_group TEXT, targeting TEXT, match_type TEXT, sku TEXT, asin TEXT,
    impressions REAL, clicks REAL, spend REAL, ad_orders REAL, ad_units REAL, ad_sales REAL,
    cpc REAL, ctr REAL, cvr REAL, roas REAL, acos REAL, currency TEXT,
    extra_json TEXT, source_file TEXT, created_at TEXT)`,
  `CREATE INDEX IF NOT EXISTS idx_ads_date ON ads_daily(date)`,
  `CREATE INDEX IF NOT EXISTS idx_ads_campaign ON ads_daily(campaign)`,
  `CREATE INDEX IF NOT EXISTS idx_ads_sku ON ads_daily(sku)`,

  `CREATE TABLE IF NOT EXISTS freight (
    id INTEGER PRIMARY KEY AUTOINCREMENT, site TEXT, weight_min REAL, weight_max REAL, freight_usd REAL)`,
  `CREATE TABLE IF NOT EXISTS fee_rate (
    id INTEGER PRIMARY KEY AUTOINCREMENT, platform TEXT, site TEXT, category TEXT,
    commission REAL, other_fee REAL, source TEXT, effective_date TEXT)`,
  `CREATE TABLE IF NOT EXISTS quarantine (
    id INTEGER PRIMARY KEY AUTOINCREMENT, dataset TEXT, reason TEXT, row_data TEXT, created_at TEXT)`,

  // ------------------------------------------------------------------
  // 数据管道（ETL）—— 接入批次 / 任务定义 / 任务日志 / 指标快照
  // 设计要点：「数据来源可追溯 + 任务表 + 任务日志表」
  // ------------------------------------------------------------------
  `CREATE TABLE IF NOT EXISTS ingest_batch (
    id INTEGER PRIMARY KEY AUTOINCREMENT, dataset TEXT, dataset_name TEXT, file_name TEXT,
    total_rows INTEGER, inserted INTEGER, quarantined INTEGER, skipped INTEGER,
    quality_score INTEGER, status TEXT, message TEXT, trigger_type TEXT,
    duration_ms INTEGER, created_at TEXT)`,
  `CREATE TABLE IF NOT EXISTS etl_job (
    id INTEGER PRIMARY KEY AUTOINCREMENT, job_code TEXT UNIQUE, job_name TEXT, stage TEXT,
    step_no INTEGER, enabled INTEGER DEFAULT 1, schedule_desc TEXT,
    last_status TEXT, last_run_at TEXT, last_duration_ms INTEGER, last_message TEXT)`,
  `CREATE TABLE IF NOT EXISTS etl_job_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT, job_code TEXT, stage TEXT, status TEXT, message TEXT,
    rows_affected INTEGER, duration_ms INTEGER, trigger_type TEXT, trace_id TEXT, created_at TEXT)`,
  `CREATE TABLE IF NOT EXISTS metric_snapshot (
    id INTEGER PRIMARY KEY AUTOINCREMENT, metric_code TEXT, metric_name TEXT, category TEXT,
    period TEXT, dim_type TEXT, dim_value TEXT, value REAL, unit TEXT, formula TEXT,
    source_batch_id INTEGER, trace_id TEXT, computed_at TEXT)`,

  `CREATE INDEX IF NOT EXISTS idx_sales_date ON sales_daily(date)`,
  `CREATE INDEX IF NOT EXISTS idx_sales_sku ON sales_daily(sku)`,
  `CREATE INDEX IF NOT EXISTS idx_sales_campaign ON sales_daily(campaign)`,
  `CREATE INDEX IF NOT EXISTS idx_order_no ON order_item(order_no)`,
  `CREATE INDEX IF NOT EXISTS idx_metric_code ON metric_snapshot(metric_code, period)`,
  `CREATE INDEX IF NOT EXISTS idx_job_log_code ON etl_job_log(job_code, created_at)`,
  `CREATE INDEX IF NOT EXISTS idx_batch_dataset ON ingest_batch(dataset, created_at)`,

  // ------------------------------------------------------------------
  // 增长中枢 —— 以 SKU 为主线把运营串成一条自动化回流链：
  //   选品研究 → 商品链接(上架生成/链接体检) → 达人建联 → 素材库 → 视频发布
  // 广告 / 销售 / 库存数据回流复用 sales_daily / ads_daily / inventory，
  // 在 growthService 里按 sku 聚合到每个 SKU 的链路上，不重复建表。
  // ------------------------------------------------------------------
  `CREATE TABLE IF NOT EXISTS sku_master (
    id INTEGER PRIMARY KEY AUTOINCREMENT, sku_code TEXT UNIQUE, name TEXT, category TEXT,
    platforms TEXT, lifecycle TEXT DEFAULT '选品池', supplier TEXT,
    cost REAL, target_price REAL, first_batch_qty INTEGER,
    owner_note TEXT, created_at TEXT, updated_at TEXT)`,
  `CREATE TABLE IF NOT EXISTS selection_research (
    id INTEGER PRIMARY KEY AUTOINCREMENT, sku_code TEXT, source TEXT,
    sales_30d INTEGER, price REAL, rating REAL, review_count INTEGER,
    keyword TEXT, competitor TEXT, trend TEXT, opportunity_score REAL,
    verdict TEXT DEFAULT '待定', target_price REAL, note TEXT, created_at TEXT)`,
  `CREATE INDEX IF NOT EXISTS idx_sel_sku ON selection_research(sku_code)`,
  `CREATE TABLE IF NOT EXISTS listing_task (
    id INTEGER PRIMARY KEY AUTOINCREMENT, sku_code TEXT, platform TEXT, listing_id TEXT,
    task_type TEXT DEFAULT '上架生成', title TEXT, description TEXT,
    attrs_json TEXT, images_json TEXT, issues TEXT,
    status TEXT DEFAULT '草稿', note TEXT, created_at TEXT, updated_at TEXT)`,
  `CREATE INDEX IF NOT EXISTS idx_listing_sku ON listing_task(sku_code)`,
  `CREATE TABLE IF NOT EXISTS material_asset (
    id INTEGER PRIMARY KEY AUTOINCREMENT, sku_code TEXT, type TEXT, title TEXT, content TEXT,
    variant_count INTEGER DEFAULT 1, source TEXT DEFAULT '自动生成',
    status TEXT DEFAULT '草稿', created_at TEXT)`,
  `CREATE INDEX IF NOT EXISTS idx_material_sku ON material_asset(sku_code)`,
  `CREATE TABLE IF NOT EXISTS influencer_deal (
    id INTEGER PRIMARY KEY AUTOINCREMENT, sku_code TEXT, influencer TEXT, platform TEXT,
    region TEXT, tags TEXT, reach INTEGER, invite_msg TEXT, follow_up_date TEXT,
    status TEXT DEFAULT '待建联', commission_note TEXT, contract_note TEXT,
    created_at TEXT, updated_at TEXT)`,
  `CREATE INDEX IF NOT EXISTS idx_infl_sku ON influencer_deal(sku_code)`,
  `CREATE TABLE IF NOT EXISTS video_publish (
    id INTEGER PRIMARY KEY AUTOINCREMENT, sku_code TEXT, material_id INTEGER, platform TEXT,
    schedule_at TEXT, title TEXT, tags TEXT, cart_draft TEXT,
    status TEXT DEFAULT '待发布', views INTEGER DEFAULT 0, gmv REAL DEFAULT 0,
    published_at TEXT, created_at TEXT)`,
  `CREATE INDEX IF NOT EXISTS idx_video_sku ON video_publish(sku_code)`,
];

/** 数据管道阶段定义（前端流程图与后端执行共用同一份口径） */
export const PIPELINE_STAGES = [
  { code: 'ingest', name: '数据接入', desc: '上传 / 解析 / 表头归一 / 清洗' },
  { code: 'quality', name: '质量校验', desc: '隔离率核算 / 必填缺失 / 质量评分' },
  { code: 'compute', name: '指标计算', desc: '广告口径 + 结算口径 + 商品维度' },
  { code: 'publish', name: '可视化发布', desc: '快照落库 / 看板就绪度' },
];

/** 阶段与任务映射（job_code 命名） */
export const PIPELINE_JOBS = [
  { code: 'ingest_batch_check', name: '接入批次校验', stage: 'quality', step_no: 1, schedule_desc: '每次上传后' },
  { code: 'metric_ad_overview', name: '广告口径指标', stage: 'compute', step_no: 2, schedule_desc: '每 5 分钟检查' },
  { code: 'metric_inventory_overview', name: '库存口径指标', stage: 'compute', step_no: 3, schedule_desc: '每 5 分钟检查' },
  { code: 'metric_finance_overview', name: '结算口径指标', stage: 'compute', step_no: 4, schedule_desc: '每 5 分钟检查' },
  { code: 'metric_dim_rollup', name: '商品/平台维度汇总', stage: 'compute', step_no: 5, schedule_desc: '每 5 分钟检查' },
  { code: 'dashboard_publish', name: '看板就绪度发布', stage: 'publish', step_no: 6, schedule_desc: '计算完成后' },
];

/**
 * 系统参数默认项（「系统设置」页可改；缺失时自动补齐，幂等）
 * 所有阈值一律走系统设置，不在业务代码里写魔法数字 —— 换品类/换站点时可即时调整口径。
 */
export const SETTING_DEFAULTS = [
  { config_key: 'mall_name', config_value: '电商运营数据中台', remark: '平台名称' },
  { config_key: 'currency', config_value: 'CNY', remark: '默认结算币种' },
  { config_key: 'default_fee_rate', config_value: '0.15', remark: '未匹配费率规则时的兜底佣金率' },
  { config_key: 'low_margin', config_value: '0.10', remark: '低毛利告警阈值（毛利率低于该值触发提示）' },
  { config_key: 'refund_alert', config_value: '0.05', remark: '退款率告警阈值（0.05 = 5%）' },
  { config_key: 'roas_target', config_value: '2.5', remark: '整体 ROAS 参考线（低于该值提示投放效率不足）' },
  { config_key: 'order_margin_target', config_value: '15', remark: '订单净利率参考线（%，低于该值提示佣金/附加费侵蚀）' },
  { config_key: 'inventory_low_days', config_value: '14', remark: '【库存】可售天数低于该值 → 低库存预警（天）' },
  { config_key: 'inventory_slow_days', config_value: '90', remark: '【库存】库龄或可供天数超过该值 → 滞销积压预警（天）' },

  // 账号与时间口径
  { config_key: 'sms_mode', config_value: 'demo', remark: '验证码发送方式：demo=演示模式（接口直接返回验证码）；real=对接短信服务商' },
  { config_key: 'sms_code_ttl', config_value: '300', remark: '验证码有效期（秒）' },
  { config_key: 'sms_cooldown', config_value: '60', remark: '同一手机号重复发送验证码的冷却时间（秒）' },
  { config_key: 'token_ttl_hours', config_value: '168', remark: '登录状态有效期（小时，168 = 7 天）' },
  { config_key: 'timezone', config_value: 'Asia/Shanghai', remark: '时间展示与存储口径（北京时间 UTC+8，中国无夏令时）' },
];

/** 订单状态流转（对齐商城后台：待付款 → 待发货 → 已发货 → 已完成 / 已退款） */
export const ORDER_STATUS = ['待付款', '待发货', '已发货', '已完成', '已退款'];
export const PRODUCT_STATUS = { 1: '在售', 0: '下架' };
export const MEMBER_LEVELS = ['普通会员', '银卡会员', '金卡会员', '钻石会员'];
