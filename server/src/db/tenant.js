/**
 * 多租户数据库路由 —— 「一个用户一个库」的物理隔离
 *
 * 设计：
 * 1. 平台库（data/ecom-admin.db）只存平台级数据：账号、验证码、登录令牌、角色。
 * 2. 每个注册用户在 data/tenants/u_<userId>.db 拥有**独立、从空开始**的业务库，
 *    注册时才创建（建表 + 默认参数 + 管道任务定义，业务数据全空）。
 * 3. 请求进入时，鉴权中间件用 AsyncLocalStorage 写入「当前是谁」，
 *    mapper 层导出的 db 句柄是个 Proxy —— 每次属性访问都实时解析成该用户的库。
 *    于是既有的全部 SQL（包括 service 里的裸 SQL）无需逐条改造，
 *    天然变成用户隔离，不可能出现 A 用户读到 B 用户数据的情况。
 */
import fs from 'node:fs';
import path from 'node:path';
import { AsyncLocalStorage } from 'node:async_hooks';
import config from '../config/index.js';
import { openDatabase } from './sqlite.js';
import { DDL, SETTING_DEFAULTS, PIPELINE_JOBS } from '../entity/index.js';

export const TENANT_DIR = path.join(config.dataDir, 'tenants');
/** 同时驻留内存的租户库上限，超出后按最久未使用淘汰（淘汰前先落盘） */
const MAX_CACHED = 12;

/** 请求级上下文：保存「当前请求属于哪个用户」，由鉴权中间件写入 */
export const als = new AsyncLocalStorage();
const pool = new Map(); // userId -> { handle, touched, file }
let main = null;

/** 当前请求归属的用户 id；无上下文（启动、定时任务）返回 null 表示平台库 */
export function currentUserId() {
  const store = als.getStore();
  return store && store.userId != null ? store.userId : null;
}

export function mainDb() {
  if (!main) throw new Error('平台库尚未初始化');
  return main;
}

/** 数据访问层统一入口：按当前上下文返回对应的库 */
export function currentDb() {
  const id = currentUserId();
  if (id == null) return mainDb();
  const entry = pool.get(id);
  if (!entry) throw new Error(`租户库未加载(user ${id})：请求应经过鉴权中间件预加载`);
  entry.touched = Date.now();
  return entry.handle;
}

/** 在平台库上下文中执行（账号 / 令牌 / 角色等平台级数据） */
export function withMain(fn) {
  return als.run({ userId: null }, fn);
}

/** 在指定用户的数据空间中执行（定时重算、启动自检按用户遍历时使用） */
export function withTenant(userId, fn) {
  return als.run({ userId }, fn);
}

export function tenantFile(userId) {
  return path.join(TENANT_DIR, `u_${userId}.db`);
}

/** 建表 + 补齐默认参数与管道任务定义（幂等，可重复执行） */
function applySchema(handle) {
  handle.pragma('journal_mode = WAL');
  // 逐条执行：历史库可能存在脏数据导致某条索引建不上，不应因此阻断整个服务启动
  for (const sql of DDL) {
    try {
      handle.exec(sql);
    } catch (e) {
      console.warn('[TENANT] 跳过一条建表/索引语句:', e.message);
    }
  }

  for (const s of SETTING_DEFAULTS) {
    const hit = handle.prepare('SELECT id FROM sys_setting WHERE config_key = ?').get(s.config_key);
    if (!hit) {
      handle
        .prepare('INSERT INTO sys_setting(config_key, config_value, remark) VALUES (?,?,?)')
        .run(s.config_key, s.config_value, s.remark);
    }
  }

  const codes = handle.prepare('SELECT job_code FROM etl_job').all().map((r) => r.job_code);
  for (const j of PIPELINE_JOBS) {
    if (!codes.includes(j.code)) {
      handle
        .prepare(
          'INSERT INTO etl_job(job_code, job_name, stage, step_no, enabled, schedule_desc, last_status) VALUES (?,?,?,?,1,?,?)'
        )
        .run(j.code, j.name, j.stage, j.step_no, j.schedule_desc, '待执行');
    }
  }
  return handle;
}

/** 初始化平台库（进程启动时调用一次） */
export async function initMain() {
  if (main) return main;
  main = await openDatabase(config.dbPath);
  applySchema(main);
  return main;
}

/**
 * 取得（必要时创建）某用户的业务库。
 * 首次调用即为该用户初始化一个空台：表结构齐备、业务数据为空。
 */
export async function ensureTenant(userId) {
  if (userId == null) throw new Error('缺少用户标识');
  let entry = pool.get(userId);
  if (!entry) {
    const file = tenantFile(userId);
    const existed = fs.existsSync(file);
    const handle = await openDatabase(file, { autoFlush: false });
    applySchema(handle);
    entry = { handle, touched: Date.now(), file };
    pool.set(userId, entry);
    if (!existed) {
      console.log(`[TENANT] 已为用户 ${userId} 初始化空数据空间: ${file}`);
    }
    evictIfNeeded();
  }
  entry.touched = Date.now();
  return entry.handle;
}

/** 已存在的租户 id（内存中已加载的 + 磁盘上已有库文件的） */
export function listTenantIds() {
  const ids = new Set(pool.keys());
  if (fs.existsSync(TENANT_DIR)) {
    for (const f of fs.readdirSync(TENANT_DIR)) {
      const m = /^u_(\d+)\.db$/.exec(f);
      if (m) ids.add(Number(m[1]));
    }
  }
  return [...ids].sort((a, b) => a - b);
}

function evictIfNeeded() {
  if (pool.size <= MAX_CACHED) return;
  const sorted = [...pool.entries()].sort((a, b) => a[1].touched - b[1].touched);
  for (const [id, entry] of sorted) {
    if (pool.size <= MAX_CACHED) break;
    try {
      entry.handle.save();
      entry.handle.raw.close();
    } catch {
      /* 忽略关闭异常 */
    }
    pool.delete(id);
  }
}

/** 退出前把内存中的租户库全部落盘 */
export function flushTenants() {
  for (const [, entry] of pool) {
    try {
      entry.handle.save();
    } catch {
      /* 忽略 */
    }
  }
}
