/**
 * 数据现状与数据治理服务
 *
 * 解决的核心问题：平台此前会用内置演示数据把空库填满，真实上传的数据反而看不清。
 * 现在把「库里到底有什么、哪些是演示数据、能不能一键清掉」完全交给使用者决定。
 */
import fs from 'node:fs';
import config from '../config/index.js';
import { db, mappers } from '../mapper/index.js';

/**
 * 表清单：demo=true 表示这是演示数据（seed.js）会写入的表，
 * 清空演示数据时默认只清这些来源 + 由它们派生出来的中间表。
 */
const TABLES = [
  { table: 'ads_daily', name: '广告花费明细', dataset: 'ads', demo: false, desc: '上传的广告后台报表' },
  { table: 'inventory', name: '库存管理', dataset: 'inventory', demo: false, desc: '上传的库存报表' },
  { table: 'order_finance', name: '订单财务明细', dataset: 'orderFinance', demo: false, desc: '上传的订单级结算表' },
  { table: 'sales_daily', name: '销售/广告日数据', dataset: 'sales', demo: true, desc: '上传的日粒度销售广告表（演示数据也写在这里）' },
  { table: 'product', name: '商品主数据', dataset: 'product', demo: true, desc: '上传的商品表' },
  { table: 'product_sku', name: '商品 SKU', dataset: null, demo: true, desc: '商品附属 SKU' },
  { table: 'orders', name: '商城订单', dataset: null, demo: true, desc: '订单管理数据' },
  { table: 'order_item', name: '订单商品明细', dataset: null, demo: true, desc: '订单行明细' },
  { table: 'member', name: '会员', dataset: null, demo: true, desc: '会员数据' },
  { table: 'freight', name: '运费对照表', dataset: 'freight', demo: true, desc: '选品测算用' },
  { table: 'fee_rate', name: '平台费率规则', dataset: 'rate', demo: true, desc: '选品测算用' },
  { table: 'quarantine', name: '隔离行', dataset: null, demo: false, desc: '未通过校验、待人工确认的行' },
  { table: 'ingest_batch', name: '接入批次', dataset: null, demo: false, desc: '每次上传的可追溯记录' },
  { table: 'metric_snapshot', name: '指标快照', dataset: null, demo: false, desc: '管道计算产物，清数据后可重算' },
  { table: 'etl_job_log', name: '任务日志', dataset: null, demo: false, desc: '管道执行日志' },
];

const rowsOf = (t) => {
  try { return db.prepare(`SELECT COUNT(*) c FROM ${t}`).get().c; } catch { return 0; }
};

/** 永远不参与清空的表（账号、权限、系统参数、任务定义） */
const PROTECTED = ['sys_user', 'sys_role', 'sys_setting', 'etl_job'];

/** 库里现状：每张表多少行、哪些是演示数据、最近上传了什么 */
export function state() {
  const tables = TABLES.map((t) => ({
    ...t,
    rows: rowsOf(t.table),
    is_upload_source: !!t.dataset,
  }));
  const demoRows = tables.filter((t) => t.demo).reduce((s, t) => s + t.rows, 0);
  const realTables = ['ads_daily', 'inventory', 'order_finance', 'sales_daily'];
  const uploaded = tables.filter((t) => realTables.includes(t.table) && t.rows > 0).map((t) => t.name);
  let dbSize = null;
  try { dbSize = fs.statSync(config.dbPath).size; } catch { /* 首次启动可能还没落盘 */ }
  return {
    tables,
    total_rows: tables.reduce((s, t) => s + t.rows, 0),
    demo_rows: demoRows,
    has_demo_data: demoRows > 0,
    uploaded_sources: uploaded,
    db_path: config.dbPath,
    db_size: dbSize,
    protected_tables: PROTECTED,
    recent_batches: mappers.batch.list({}, 'id DESC').slice(0, 5),
  };
}

/**
 * 清空数据
 * @param {string[]} tables 指定要清空的表；传 ['__demo__'] 或留空表示「清掉所有演示数据来源 + 派生中间表」
 * @returns {{cleared: {table:string,rows:number}[], protected: string[]}}
 */
export function reset(tables) {
  const allowed = TABLES.map((t) => t.table).filter((t) => !PROTECTED.includes(t));
  let targets = Array.isArray(tables) && tables.length ? tables.filter((t) => t !== '__demo__') : [];
  const demoMode = !targets.length;

  if (demoMode) {
    // 演示模式：清演示来源表 + 由它们派生出来的中间表（隔离行/批次/快照/日志）
    targets = TABLES.filter((t) => t.demo).map((t) => t.table)
      .concat(['quarantine', 'ingest_batch', 'metric_snapshot', 'etl_job_log']);
  }
  targets = [...new Set(targets)].filter((t) => allowed.includes(t));

  const cleared = [];
  db.exec('PRAGMA foreign_keys = OFF');
  for (const t of targets) {
    const before = rowsOf(t);
    try {
      db.prepare(`DELETE FROM ${t}`).run();
      // 隔离行按 dataset 维度清理时不需要重置自增，这里统一不处理 sqlite_sequence，避免影响其它表
    } catch (e) {
      cleared.push({ table: t, rows: before, error: e.message });
      continue;
    }
    cleared.push({ table: t, rows: before });
  }
  db.exec('PRAGMA foreign_keys = ON');
  if (typeof db.save === 'function') db.save();
  return { cleared, protected: PROTECTED, mode: demoMode ? 'demo' : 'custom' };
}

export const dataService = { state, reset, TABLES };
