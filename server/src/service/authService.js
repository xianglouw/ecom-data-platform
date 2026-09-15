/**
 * 账号服务 —— 手机号 + 短信验证码的注册 / 登录 / 登出
 *
 * 说明：当前环境没有接短信服务商通道，默认走「演示模式」：
 * 验证码由服务端生成、落库，并随接口返回给前端用于展示（同时打印到服务端日志）。
 * 以后接真实短信（阿里云/腾讯云）只需把 sendCode 里 demo 分支换成 SDK 调用，
 * 并把系统参数 sms_mode 改为 real，其余流程不用动。
 *
 * 所有账号数据都存在「平台库」；每个用户注册成功后自动获得一个独立空业务库。
 */
import crypto from 'node:crypto';
import { mainDb, ensureTenant } from '../db/tenant.js';
import { mappers } from '../mapper/index.js';
import { bjNow, bjToMs } from '../common/datetime.js';
import { BizError } from '../common/R.js';

const MOBILE_RE = /^1[3-9]\d{9}$/;

/** 读平台库里的系统参数 */
function cfg(key, dft) {
  const row = mainDb().prepare('SELECT config_value FROM sys_setting WHERE config_key = ?').get(key);
  const v = row?.config_value;
  return v === undefined || v === null || v === '' ? String(dft) : v;
}

const q = (sql) => mainDb().prepare(sql);

function publicUser(u) {
  return {
    id: u.id,
    mobile: u.mobile,
    username: u.username,
    nickname: u.nickname,
    role: u.role_code,
    last_login: u.last_login,
    created_at: u.created_at,
  };
}

/** 生成并保存验证码 */
function sendCode(mobile, scene = 'login', ip = '') {
  if (!MOBILE_RE.test(String(mobile || ''))) throw new BizError('请输入正确的 11 位手机号', 'A0400');
  const cooldown = Number(cfg('sms_cooldown', 60));
  const ttl = Number(cfg('sms_code_ttl', 300));

  const last = q('SELECT created_at FROM sms_code WHERE mobile = ? ORDER BY id DESC LIMIT 1').get(mobile);
  if (last?.created_at) {
    const waited = (Date.now() - bjToMs(last.created_at)) / 1000;
    if (waited < cooldown) {
      throw new BizError(`请求过于频繁，请 ${Math.ceil(cooldown - waited)} 秒后重试`, 'A0400');
    }
  }

  const code = String(crypto.randomInt(100000, 1000000));
  const expiresAt = bjNow(new Date(Date.now() + ttl * 1000));
  q('INSERT INTO sms_code(mobile, code, scene, expires_at, used, ip, created_at) VALUES (?,?,?,?,0,?,?)').run(
    mobile, code, scene, expiresAt, ip, bjNow()
  );

  const mode = cfg('sms_mode', 'demo');
  console.log(`[SMS] 向 ${mobile} 发送验证码 ${code}（场景 ${scene}，${ttl}s 内有效，模式 ${mode}）`);

  return {
    mobile,
    scene,
    expires_in: ttl,
    cooldown,
    mode,
    // 演示模式把验证码回传，真实短信模式下不返回该字段
    dev_code: mode === 'demo' ? code : undefined,
    tip: mode === 'demo'
      ? '演示模式：未接入短信通道，验证码直接显示在页面上（可在系统设置把 sms_mode 改为 real 后接入短信服务商）'
      : '验证码已发送，请查看短信',
  };
}

/** 校验验证码（一次性，校验通过即作废） */
function verifyCode(mobile, code) {
  const row = q('SELECT * FROM sms_code WHERE mobile = ? AND used = 0 ORDER BY id DESC LIMIT 1').get(mobile);
  if (!row) throw new BizError('请先获取验证码', 'A0400');
  if (String(row.code) !== String(code || '').trim()) throw new BizError('验证码不正确', 'A0400');
  if (bjToMs(row.expires_at) < Date.now()) throw new BizError('验证码已过期，请重新获取', 'A0400');
  q('UPDATE sms_code SET used = 1 WHERE id = ?').run(row.id);
  return true;
}

/** 签发登录令牌 */
function issueToken(user, mobile) {
  const ttlHours = Number(cfg('token_ttl_hours', 168));
  const token = crypto.randomBytes(24).toString('hex');
  const expiresAt = bjNow(new Date(Date.now() + ttlHours * 3600 * 1000));
  q('INSERT INTO user_token(token, user_id, mobile, expires_at, created_at, last_active) VALUES (?,?,?,?,?,?)').run(
    token, user.id, mobile, expiresAt, bjNow(), bjNow()
  );
  return { token, expires_at: expiresAt, expires_in_hours: ttlHours };
}

/** 用令牌换取用户（顺带续期 last_active） */
export function resolveToken(token) {
  if (!token) return null;
  const row = q('SELECT * FROM user_token WHERE token = ?').get(token);
  if (!row) return null;
  if (bjToMs(row.expires_at) < Date.now()) {
    q('DELETE FROM user_token WHERE id = ?').run(row.id);
    return null;
  }
  q('UPDATE user_token SET last_active = ? WHERE id = ?').run(bjNow(), row.id);
  const user = q('SELECT * FROM sys_user WHERE id = ?').get(row.user_id);
  if (!user || user.status !== 1) return null;
  return { userId: user.id, user: publicUser(user), token_row: row };
}

/** 注册：手机号 + 验证码；成功后自动为该用户初始化一套空数据空间 */
export async function register({ mobile, code, nickname }) {
  if (!MOBILE_RE.test(String(mobile || ''))) throw new BizError('请输入正确的 11 位手机号', 'A0400');
  const exist = q('SELECT id FROM sys_user WHERE mobile = ?').get(mobile);
  if (exist) throw new BizError('该手机号已注册，请直接登录', 'A0400');
  verifyCode(mobile, code);

  const now = bjNow();
  const info = q(
    'INSERT INTO sys_user(username, nickname, role_code, mobile, status, created_at) VALUES (?,?,?,?,1,?)'
  ).run(mobile, (nickname || '').trim() || `卖家${String(mobile).slice(-4)}`, 'USER', mobile, now);
  const userId = info.lastInsertRowid;

  await ensureTenant(userId); // 初始化空台：结构齐备、数据全空
  const user = q('SELECT * FROM sys_user WHERE id = ?').get(userId);
  const t = issueToken(user, mobile);
  console.log(`[AUTH] 新用户注册 userId=${userId} mobile=${mobile}（已初始化空数据空间）`);
  return { ...t, user: publicUser(user), tenant_initialized: true };
}

/** 登录：手机号 + 验证码 */
export async function login({ mobile, code }) {
  if (!MOBILE_RE.test(String(mobile || ''))) throw new BizError('请输入正确的 11 位手机号', 'A0400');
  const user = q('SELECT * FROM sys_user WHERE mobile = ?').get(mobile);
  if (!user) throw new BizError('该手机号尚未注册，请先注册', 'A0400');
  if (user.status !== 1) throw new BizError('账号已停用，请联系管理员', 'A0400');
  verifyCode(mobile, code);

  q('UPDATE sys_user SET last_login = ? WHERE id = ?').run(bjNow(), user.id);
  await ensureTenant(user.id);
  const fresh = q('SELECT * FROM sys_user WHERE id = ?').get(user.id);
  const t = issueToken(fresh, mobile);
  return { ...t, user: publicUser(fresh) };
}

export function logout(token) {
  if (!token) return { removed: 0 };
  const r = q('DELETE FROM user_token WHERE token = ?').run(token);
  return { removed: r.changes };
}

/** 当前登录用户 + 其数据空间概况（用于前端判断是否「空台」） */
export function profile(userId) {
  const user = q('SELECT * FROM sys_user WHERE id = ?').get(userId);
  if (!user) throw new BizError('账号不存在', 'A0404');
  // 业务数据统计走当前请求上下文 —— 即该用户自己的库
  const tables = {
    order_finance: mappers.orderFinance,
    inventory: mappers.inventory,
    ads_daily: mappers.ads,
    sales_daily: mappers.sales,
    product: mappers.product,
  };
  const data_rows = {};
  for (const [name, mapper] of Object.entries(tables)) {
    try {
      data_rows[name] = mapper.count({});
    } catch {
      data_rows[name] = 0;
    }
  }
  const total_rows = Object.values(data_rows).reduce((a, b) => a + b, 0);
  return { user: publicUser(user), data_rows, total_rows, empty: total_rows === 0 };
}

/** 清理过期验证码与令牌（启动时调用一次即可） */
export function cleanupExpired() {
  try {
    const now = bjNow();
    const a = q('DELETE FROM sms_code WHERE expires_at < ?').run(now);
    const b = q('DELETE FROM user_token WHERE expires_at < ?').run(now);
    if (a.changes || b.changes) {
      console.log(`[AUTH] 清理过期验证码 ${a.changes} 条、过期令牌 ${b.changes} 条`);
    }
  } catch (e) {
    console.error('[AUTH] 清理过期数据失败:', e.message);
  }
}

/** 平台用户列表（「用户与角色」页用，读平台库） */
export function userList({ current = 1, size = 20, keyword = '' } = {}) {
  const like = `%${keyword}%`;
  const where = keyword ? ' WHERE mobile LIKE ? OR nickname LIKE ?' : '';
  const params = keyword ? [like, like] : [];
  const total = q(`SELECT COUNT(*) c FROM sys_user${where}`).get(...params).c;
  const rows = q(
    `SELECT * FROM sys_user${where} ORDER BY id DESC LIMIT ? OFFSET ?`
  ).all(...params, Number(size), (Number(current) - 1) * Number(size));
  return {
    records: rows.map((u) => ({ ...publicUser(u), status: u.status })),
    total,
  };
}

/**
 * 演示账号一键进入（公开体验，无需注册）：
 * 首次调用时自动创建 demo 账号并灌入示例数据，之后所有人共享这个演示空间。
 * 体验者的修改会保留；需要重置时删除该用户的数据空间（data/tenants/u_<id>.db）再重启即可。
 */
export async function demoLogin() {
  const { seedDemoTenant } = await import('./demoSeed.js');
  const mobile = cfg('demo_mobile', '13000000000');
  let user = q('SELECT * FROM sys_user WHERE mobile = ?').get(mobile);
  if (!user) {
    const info = q(
      'INSERT INTO sys_user(username, nickname, role_code, mobile, status, created_at) VALUES (?,?,?,?,1,?)'
    ).run('demo', '演示数据空间', 'USER', mobile, bjNow());
    user = q('SELECT * FROM sys_user WHERE id = ?').get(info.lastInsertRowid);
    console.log(`[DEMO] 已创建公开演示账号 userId=${user.id}`);
  }
  await ensureTenant(user.id);
  const seed = await seedDemoTenant(user.id);
  q('UPDATE sys_user SET last_login = ? WHERE id = ?').run(bjNow(), user.id);
  const fresh = q('SELECT * FROM sys_user WHERE id = ?').get(user.id);
  const t = issueToken(fresh, mobile);
  return { ...t, user: publicUser(fresh), demo: true, seed };
}

export const authService = { sendCode, register, login, demoLogin, logout, profile, userList, cleanupExpired };
