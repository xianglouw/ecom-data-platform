/**
 * 数据库连接与通用 Mapper —— 对齐 mall4j 的 Mapper 持久层
 * 提供 list / one / page / insert / update / deleteById 等通用能力
 *
 * 多租户：db 不再指向单一连接，而是一个按请求上下文路由的 Proxy。
 * 未登录 / 平台级阶段 → 平台库；已登录请求 → 该用户自己的业务库。
 * 这样上层 service 中的 SQL（含裸 SQL）一律自动隔离，无需逐条改造。
 */
import { initMain, currentDb, mainDb } from '../db/tenant.js';

await initMain();

/** 平台库句柄（账号、令牌、角色等平台级数据专用） */
export { mainDb };

export const db = new Proxy(
  {},
  {
    get(_target, prop) {
      const handle = currentDb();
      const value = handle[prop];
      return typeof value === 'function' ? value.bind(handle) : value;
    },
  }
);

/** 把对象转成 { keys, placeholders, values }，过滤 undefined */
function buildInsert(row) {
  const keys = Object.keys(row).filter(k => row[k] !== undefined);
  return {
    keys,
    ph: keys.map(() => '?').join(','),
    values: keys.map(k => (row[k] !== null && typeof row[k] === 'object' ? JSON.stringify(row[k]) : row[k])),
  };
}

/** 动态条件拼装：eq / like / between / in */
export function buildWhere(cond = {}) {
  const clauses = [];
  const params = [];
  for (const [key, val] of Object.entries(cond)) {
    if (val === undefined || val === null || val === '') continue;
    if (key.endsWith('Like')) {
      clauses.push(`${key.replace(/Like$/, '')} LIKE ?`);
      params.push(`%${val}%`);
    } else if (key.endsWith('Ge')) {
      clauses.push(`${key.replace(/Ge$/, '')} >= ?`);
      params.push(val);
    } else if (key.endsWith('Le')) {
      clauses.push(`${key.replace(/Le$/, '')} <= ?`);
      params.push(val);
    } else {
      clauses.push(`${key} = ?`);
      params.push(val);
    }
  }
  return { sql: clauses.length ? ' WHERE ' + clauses.join(' AND ') : '', params };
}

export class BaseMapper {
  constructor(table) {
    this.table = table;
  }
  list(cond = {}, order = '') {
    const { sql, params } = buildWhere(cond);
    return db.prepare(`SELECT * FROM ${this.table}${sql}${order ? ' ORDER BY ' + order : ''}`).all(...params);
  }
  page(cond = {}, current = 1, size = 20, order = '') {
    const { sql, params } = buildWhere(cond);
    const total = db.prepare(`SELECT COUNT(*) c FROM ${this.table}${sql}`).get(...params).c;
    const rows = db
      .prepare(`SELECT * FROM ${this.table}${sql}${order ? ' ORDER BY ' + order : ''} LIMIT ? OFFSET ?`)
      .all(...params, Number(size), (Number(current) - 1) * Number(size));
    return { records: rows, total };
  }
  one(cond = {}) {
    const { sql, params } = buildWhere(cond);
    return db.prepare(`SELECT * FROM ${this.table}${sql} LIMIT 1`).get(...params);
  }
  byId(id) {
    return db.prepare(`SELECT * FROM ${this.table} WHERE id = ?`).get(id);
  }
  insert(row) {
    const { keys, ph, values } = buildInsert(row);
    const info = db.prepare(`INSERT INTO ${this.table}(${keys.join(',')}) VALUES (${ph})`).run(...values);
    return { id: info.lastInsertRowid, ...row };
  }
  update(id, row) {
    const keys = Object.keys(row).filter(k => row[k] !== undefined && k !== 'id');
    if (!keys.length) return this.byId(id);
    const setSql = keys.map(k => `${k} = ?`).join(',');
    db.prepare(`UPDATE ${this.table} SET ${setSql} WHERE id = ?`)
      .run(...keys.map(k => (row[k] !== null && typeof row[k] === 'object' ? JSON.stringify(row[k]) : row[k])), id);
    return this.byId(id);
  }
  deleteById(id) {
    return db.prepare(`DELETE FROM ${this.table} WHERE id = ?`).run(id);
  }
  /** 按条件批量删除（快照重算时先清旧值） */
  deleteWhere(cond = {}) {
    const { sql, params } = buildWhere(cond);
    if (!sql) return { changes: 0 };
    return db.prepare(`DELETE FROM ${this.table}${sql}`).run(...params);
  }
  /** 存在则更新、不存在则插入（对齐 MyBatis-Plus 的 saveOrUpdate） */
  saveOrUpdate(uniqueCond, row) {
    const exist = this.one(uniqueCond);
    if (exist) {
      this.update(exist.id, row);
      return { ...exist, ...row, id: exist.id, updated: true };
    }
    return { ...this.insert(row), updated: false };
  }
  count(cond = {}) {
    const { sql, params } = buildWhere(cond);
    return db.prepare(`SELECT COUNT(*) c FROM ${this.table}${sql}`).get(...params).c;
  }
  exec(sql, ...params) {
    return db.prepare(sql).all(...params);
  }
}

export const mappers = {
  product: new BaseMapper('product'),
  sku: new BaseMapper('product_sku'),
  member: new BaseMapper('member'),
  order: new BaseMapper('orders'),
  orderItem: new BaseMapper('order_item'),
  orderFinance: new BaseMapper('order_finance'),
  user: new BaseMapper('sys_user'),
  role: new BaseMapper('sys_role'),
  setting: new BaseMapper('sys_setting'),
  sales: new BaseMapper('sales_daily'),
  inventory: new BaseMapper('inventory'),
  ads: new BaseMapper('ads_daily'),
  freight: new BaseMapper('freight'),
  rate: new BaseMapper('fee_rate'),
  quarantine: new BaseMapper('quarantine'),
  // 数据管道
  batch: new BaseMapper('ingest_batch'),
  job: new BaseMapper('etl_job'),
  jobLog: new BaseMapper('etl_job_log'),
  metric: new BaseMapper('metric_snapshot'),
};
