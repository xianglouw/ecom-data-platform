/** 订单服务 —— 订单管理（列表 / 详情 / 发货状态流转 / 统计） */
import { mappers, db } from '../mapper/index.js';
import { BizError } from '../common/R.js';
import { ORDER_STATUS } from '../entity/index.js';

export const orderService = {
  page(params) {
    const { current = 1, size = 20, orderNo, status, platform, memberName, start, end } = params;
    const cond = {};
    if (orderNo) cond.order_noLike = orderNo;
    if (status) cond.status = status;
    if (platform) cond.platform = platform;
    if (memberName) cond.member_nameLike = memberName;
    const where = Object.entries(cond)
      .map(([k, v]) => (k.endsWith('Like') ? `${k.replace(/Like$/, '')} LIKE ?` : `${k} = ?`))
      .join(' AND ');
    const vals = Object.entries(cond).map(([k, v]) => (k.endsWith('Like') ? `%${v}%` : v));
    let dateSql = '';
    if (start) { dateSql += (where ? ' AND ' : '') + 'date(created_at) >= ?'; vals.push(start); }
    if (end) { dateSql += (where || start ? ' AND ' : '') + 'date(created_at) <= ?'; vals.push(end); }
    const wsql = (where || dateSql) ? ' WHERE ' + where + dateSql : '';
    const total = db.prepare(`SELECT COUNT(*) c FROM orders${wsql}`).get(...vals).c;
    const records = db
      .prepare(`SELECT * FROM orders${wsql} ORDER BY id DESC LIMIT ? OFFSET ?`)
      .all(...vals, Number(size), (Number(current) - 1) * Number(size));
    return { records, total };
  },
  detail(orderNo) {
    const order = mappers.order.one({ order_no: orderNo });
    if (!order) throw new BizError('订单不存在', 'A0404');
    const items = mappers.orderItem.list({ order_no: orderNo }, 'id');
    return { ...order, items };
  },
  /** 状态流转：待付款 → 待发货 → 已发货 → 已完成；可退款 */
  changeStatus(orderNo, status, remark) {
    if (!ORDER_STATUS.includes(status)) throw new BizError('非法订单状态：' + status, 'A0400');
    const order = mappers.order.one({ order_no: orderNo });
    if (!order) throw new BizError('订单不存在', 'A0404');
    mappers.order.update(order.id, { status, remark: remark ?? order.remark });
    return { order_no: orderNo, status };
  },
  stats() {
    const rows = db.prepare(`SELECT status, COUNT(*) c, COALESCE(SUM(pay_amount),0) amt FROM orders GROUP BY status`).all();
    const total = db.prepare(`SELECT COUNT(*) c, COALESCE(SUM(pay_amount),0) amt FROM orders`).get();
    return {
      total: { count: total.c, amount: Math.round(total.amt * 100) / 100 },
      byStatus: rows.map(r => ({ status: r.status, count: r.c, amount: Math.round(r.amt * 100) / 100 })),
      byPlatform: db.prepare(`SELECT platform, COUNT(*) c, COALESCE(SUM(pay_amount),0) amt FROM orders GROUP BY platform ORDER BY amt DESC`).all(),
      daily: db.prepare(`SELECT date(created_at) d, COUNT(*) c, COALESCE(SUM(pay_amount),0) amt FROM orders GROUP BY d ORDER BY d DESC LIMIT 14`).all().reverse(),
    };
  },
  platforms() {
    return [...new Set(mappers.order.list().map(o => o.platform).filter(Boolean))];
  },
};
