/**
 * 统一时间口径 —— 北京时间（UTC+8）
 *
 * 背景：此前全项目用 new Date().toISOString()，拿到的是 UTC 时间，
 * 导致上传批次、管道执行时间、参数保存时间都比北京时间少 8 小时
 * （例如北京时间 16:50 显示成 08:50），与本机时间对不上。
 *
 * 中国不实行夏令时，UTC+8 恒定，因此这里用固定偏移量换算，
 * 不依赖服务器时区设置（云端沙箱通常是 UTC），结果始终是北京时间。
 */

const OFFSET_MS = 8 * 60 * 60 * 1000;

/** 把任意时刻转换成「北京时间的 Date」——用它的 UTC 字段读出来就是北京时刻 */
export function bjDate(d = new Date()) {
  const t = d instanceof Date ? d.getTime() : new Date(d).getTime();
  return new Date(t + OFFSET_MS);
}

/** 北京时间字符串：YYYY-MM-DD HH:mm:ss */
export function bjNow(d = new Date()) {
  return bjDate(d).toISOString().slice(0, 19).replace('T', ' ');
}

/** 北京日期：YYYY-MM-DD */
export function bjToday(d = new Date()) {
  return bjDate(d).toISOString().slice(0, 10);
}

/** 北京时间的 HH:mm:ss */
export function bjTime(d = new Date()) {
  return bjDate(d).toISOString().slice(11, 19);
}

/** 在某个「北京日期」上加减天数，返回 YYYY-MM-DD */
export function bjAddDays(dateStr, days) {
  const base = new Date(`${dateStr}T00:00:00Z`);
  base.setUTCDate(base.getUTCDate() + Number(days));
  return base.toISOString().slice(0, 10);
}

/** 两个北京时间字符串相差的天数（用于新鲜度判断） */
export function bjDiffDays(fromStr, toStr) {
  const a = new Date(String(fromStr).replace(' ', 'T') + 'Z').getTime();
  const b = new Date(String(toStr).replace(' ', 'T') + 'Z').getTime();
  return (b - a) / 86400000;
}

/** 北京时间字符串 → 毫秒时间戳（用于有效期比较，例如验证码是否过期） */
export function bjToMs(s) {
  if (!s) return 0;
  const t = String(s).trim().replace(' ', 'T');
  const withZone = /Z$|[+-]\d{2}:?\d{2}$/.test(t) ? t : t + '+08:00';
  return new Date(withZone).getTime();
}
