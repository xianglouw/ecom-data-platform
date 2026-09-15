/** 会员服务 —— 会员管理 */
import { mappers } from '../mapper/index.js';
import { BizError } from '../common/R.js';
import { SETTING_DEFAULTS } from '../entity/index.js';

/**
 * 幂等补齐缺失的系统参数（含库存阈值 inventory_low_days / inventory_slow_days）。
 * 这样任何一个环境（含线上旧库）打开设置页都能看到并可调整阈值，不需要手工迁移数据。
 */
export function ensureSettings() {
  let added = 0;
  for (const s of SETTING_DEFAULTS) {
    if (!mappers.setting.one({ config_key: s.config_key })) {
      mappers.setting.insert(s);
      added += 1;
    }
  }
  return added;
}

/** 影响指标口径的参数：一旦变化，指标快照必须重算，否则全站口径不一致 */
const RECALC_KEYS = ['inventory_low_days', 'inventory_slow_days', 'low_margin', 'refund_alert', 'default_fee_rate', 'roas_target', 'order_margin_target'];

/** 阈值类参数变化 → 触发一次管道重算（动态引入，避免模块循环依赖） */
async function recalcIfThreshold(keys = []) {
  if (!keys.some((k) => RECALC_KEYS.includes(k))) return false;
  try {
    const { etlService } = await import('./etlService.js');
    await etlService.runPipeline({ trigger: 'manual' });
    return true;
  } catch (e) {
    console.error('[SETTING] 阈值变更后重算失败:', e.message);
    return false;
  }
}

export const memberService = {
  page(params) {
    const { current = 1, size = 20, nickname, mobile, level, status } = params;
    const cond = {};
    if (nickname) cond.nicknameLike = nickname;
    if (mobile) cond.mobileLike = mobile;
    if (level) cond.level = level;
    if (status !== undefined && status !== '') cond.status = Number(status);
    return mappers.member.page(cond, current, size, 'id DESC');
  },
  update(id, body) {
    const m = mappers.member.byId(id);
    if (!m) throw new BizError('会员不存在', 'A0404');
    const patch = {};
    ['nickname', 'mobile', 'level', 'balance', 'status'].forEach(k => {
      if (body[k] !== undefined) patch[k] = typeof body[k] === 'number' ? body[k] : body[k];
    });
    return mappers.member.update(id, patch);
  },
  stats() {
    const all = mappers.member.list();
    const byLevel = {};
    all.forEach(m => { byLevel[m.level] = (byLevel[m.level] || 0) + 1; });
    return {
      total: all.length,
      active: all.filter(m => m.status === 1).length,
      amount: Math.round(all.reduce((s, m) => s + (m.total_amount || 0), 0) * 100) / 100,
      byLevel: Object.entries(byLevel).map(([level, count]) => ({ level, count })),
    };
  },
};

/** 系统服务 —— 用户 / 角色 / 系统设置 / 运费 / 费率 */
export const sysService = {
  userPage(params) {
    const { current = 1, size = 20, username, role_code } = params;
    const cond = {};
    if (username) cond.usernameLike = username;
    if (role_code) cond.role_code = role_code;
    return mappers.user.page(cond, current, size, 'id');
  },
  roleList() {
    return mappers.role.list({}, 'id');
  },
  settings() {
    ensureSettings(); // 打开设置页即补齐缺失配置项（含库存阈值）
    return mappers.setting.list({}, 'id');
  },
  async saveSetting(key, value, remark) {
    const exist = mappers.setting.one({ config_key: key });
    if (exist) mappers.setting.update(exist.id, { config_value: value, remark });
    else mappers.setting.insert({ config_key: key, config_value: value, remark });
    return { config_key: key, recalculated: await recalcIfThreshold([key]) };
  },
  /**
   * 批量保存并（在阈值类参数变化时）重算指标快照。
   * 阈值改了若不重算，看板与库存页会继续显示旧口径下的告警数，属于「口径漂移」，必须避免。
   */
  async saveSettings(items) {
    const saved = [];
    for (const it of items || []) {
      if (!it || !it.config_key) continue;
      const exist = mappers.setting.one({ config_key: it.config_key });
      if (exist) mappers.setting.update(exist.id, { config_value: String(it.config_value ?? ''), remark: it.remark || exist.remark });
      else mappers.setting.insert({ config_key: it.config_key, config_value: String(it.config_value ?? ''), remark: it.remark || '' });
      saved.push(it.config_key);
    }
    return { saved, recalculated: await recalcIfThreshold(saved) };
  },
  freightList(site) {
    return mappers.freight.list(site ? { site } : {}, 'site, weight_min');
  },
  freightSave(row) {
    return row.id ? mappers.freight.update(row.id, row) : mappers.freight.insert(row);
  },
  freightRemove(id) {
    mappers.freight.deleteById(id);
    return { id };
  },
  rateList() {
    return mappers.rate.list({}, 'platform, site');
  },
  rateSave(row) {
    return row.id ? mappers.rate.update(row.id, row) : mappers.rate.insert(row);
  },
  rateRemove(id) {
    mappers.rate.deleteById(id);
    return { id };
  },
};
