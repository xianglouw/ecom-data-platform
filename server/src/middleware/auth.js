/**
 * 鉴权中间件
 *
 * 流程：取 Bearer 令牌 → 校验并换取用户 → 预加载该用户的业务库
 * → 把「当前是谁」写入 AsyncLocalStorage，后续所有数据访问自动落到他的库。
 *
 * 令牌校验阶段没有上下文，读的是平台库；进入业务前才切到租户库。
 */
import { resolveToken } from '../service/authService.js';
import { ensureTenant, als } from '../db/tenant.js';
import { R } from '../common/R.js';

/** 无需登录即可访问的接口 */
const WHITE_LIST = ['/auth/send-code', '/auth/register', '/auth/login', '/auth/demo-login'];

function isWhite(pathname) {
  return WHITE_LIST.some((p) => pathname === p || pathname.startsWith(p + '/') || pathname.endsWith(p));
}

export function extractToken(req) {
  const raw = req.headers.authorization || req.headers['x-token'] || '';
  return String(raw).replace(/^Bearer\s+/i, '').trim();
}

export function authMiddleware() {
  return async (req, res, next) => {
    const pathname = req.path || String(req.originalUrl || '').split('?')[0];
    if (isWhite(pathname)) return next();

    const token = extractToken(req);
    if (!token) return res.json(R.fail('请先登录', 'A0401'));

    let session = null;
    try {
      session = resolveToken(token);
    } catch (e) {
      return res.json(R.fail('登录状态校验失败: ' + e.message, 'A0500'));
    }
    if (!session) return res.json(R.fail('登录已过期，请重新登录', 'A0401'));

    try {
      await ensureTenant(session.userId); // 首次访问即初始化空数据空间
    } catch (e) {
      return res.json(R.fail('数据空间初始化失败: ' + e.message, 'A0500'));
    }

    req.userId = session.userId;
    req.user = session.user;
    req.token = token;
    als.run({ userId: session.userId }, () => next());
  };
}
