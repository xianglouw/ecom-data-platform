/** Controller 层：参数校验 + 调用 Service + 统一响应封装 */
import { R, BizError } from '../common/R.js';
import { productService } from '../service/productService.js';
import { orderService } from '../service/orderService.js';
import { orderFinanceService } from '../service/orderFinanceService.js';
import { memberService, sysService } from '../service/memberService.js';
import { opsService } from '../service/opsService.js';
import { etlService } from '../service/etlService.js';
import { authService } from '../service/authService.js';
import { growthService } from '../service/growthService.js';
import { mappers } from '../mapper/index.js';

/** async 控制器包装：把 Promise 异常交给 Express 统一错误处理（Express 4 不会自动捕获） */
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

/**
 * 账号与登录 —— 手机号 + 短信验证码
 * 注册后自动为该账号初始化一套独立、空的数据空间（一个账号一个库）。
 */
export const authController = {
  sendCode: (req, res) => {
    const { mobile, scene } = req.body || {};
    res.json(R.ok(authService.sendCode(mobile, scene || 'login', req.ip)));
  },
  register: wrap(async (req, res) => res.json(R.ok(await authService.register(req.body || {})))),
  login: wrap(async (req, res) => res.json(R.ok(await authService.login(req.body || {})))),
  demoLogin: wrap(async (req, res) => res.json(R.ok(await authService.demoLogin()))),
  logout: (req, res) => res.json(R.ok(authService.logout(req.token))),
  info: (req, res) => res.json(R.ok(authService.profile(req.userId))),
  profile: (req, res) => res.json(R.ok(authService.profile(req.userId))),
};

export const productController = {
  page: (req, res) => {
    const r = productService.page(req.query);
    res.json(R.page(r.records, r.total, req.query.current || 1, req.query.size || 20));
  },
  detail: (req, res) => res.json(R.ok(productService.detail(req.params.id))),
  create: (req, res) => res.json(R.ok(productService.create(req.body))),
  update: (req, res) => res.json(R.ok(productService.update(req.params.id, req.body))),
  status: (req, res) => res.json(R.ok(productService.changeStatus(req.params.id, req.body.status))),
  remove: (req, res) => res.json(R.ok(productService.remove(req.params.id))),
  categories: (req, res) => res.json(R.ok(productService.categories())),
};

export const orderController = {
  page: (req, res) => {
    const r = orderService.page(req.query);
    res.json(R.page(r.records, r.total, req.query.current || 1, req.query.size || 20));
  },
  detail: (req, res) => res.json(R.ok(orderService.detail(req.params.orderNo))),
  status: (req, res) => res.json(R.ok(orderService.changeStatus(req.params.orderNo, req.body.status, req.body.remark))),
  stats: (req, res) => res.json(R.ok(orderService.stats())),
};

/** 订单财务明细（适配平台导出的订单级结算表） */
export const orderFinanceController = {
  page: (req, res) => {
    const r = orderFinanceService.page(req.query);
    res.json(R.page(r.records, r.total, r.current, r.size));
  },
  stats: (req, res) => res.json(R.ok(orderFinanceService.stats(req.query))),
  sku: (req, res) => res.json(R.ok(orderFinanceService.bySku(req.query))),
  facets: (req, res) => res.json(R.ok(orderFinanceService.facets())),
  fx: (req, res) => res.json(R.ok({ rate: orderFinanceService.fxRate(req.query.currency || 'MXN') })),
};

export const memberController = {  page: (req, res) => {
    const r = memberService.page(req.query);
    res.json(R.page(r.records, r.total, req.query.current || 1, req.query.size || 20));
  },
  update: (req, res) => res.json(R.ok(memberService.update(req.params.id, req.body))),
  stats: (req, res) => res.json(R.ok(memberService.stats())),
};

export const sysController = {
  // 账号与角色是平台级数据，统一读平台库（不进用户自己的业务库）
  userPage: (req, res) => {
    const r = authService.userList(req.query);
    res.json(R.page(r.records, r.total, req.query.current || 1, req.query.size || 20));
  },
  roleList: (req, res) => res.json(R.ok(sysService.roleList())),
  // 以下参数类配置属于「每个账号自己的口径」，读写各自的数据空间
  settings: (req, res) => res.json(R.ok(sysService.settings())),
  saveSetting: async (req, res) => res.json(R.ok(await sysService.saveSetting(req.body.config_key, req.body.config_value, req.body.remark))),
  saveSettings: async (req, res) => res.json(R.ok(await sysService.saveSettings(req.body?.items || req.body || []))),
  freightList: (req, res) => res.json(R.ok(sysService.freightList(req.query.site))),
  freightSave: (req, res) => res.json(R.ok(sysService.freightSave(req.body))),
  freightRemove: (req, res) => res.json(R.ok(sysService.freightRemove(req.params.id))),
  rateList: (req, res) => res.json(R.ok(sysService.rateList())),
  rateSave: (req, res) => res.json(R.ok(sysService.rateSave(req.body))),
  rateRemove: (req, res) => res.json(R.ok(sysService.rateRemove(req.params.id))),
};

/** 增长中枢：以 SKU 为主线的运营自动化链路（选品 → 链接 → 达人 → 素材 → 视频） */
export const growthController = {
  meta: (req, res) => res.json(R.ok(growthService.meta())),
  overview: (req, res) => res.json(R.ok(growthService.overview(req.query))),
  chain: (req, res) => res.json(R.ok(growthService.chain(req.params.code))),
  page: (req, res) => {
    const r = growthService.page(req.params.module, req.query);
    res.json(R.page(r.records, r.total, req.query.current || 1, req.query.size || 20));
  },
  create: (req, res) => res.json(R.ok(growthService.create(req.params.module, req.body))),
  update: (req, res) => res.json(R.ok(growthService.update(req.params.module, req.params.id, req.body))),
  remove: (req, res) => res.json(R.ok(growthService.remove(req.params.module, req.params.id))),
};

export const opsController = {  overview: (req, res) => res.json(R.ok(opsService.overview(req.query))),
  salesPage: (req, res) => {
    const r = opsService.salesPage(req.query);
    res.json(R.page(r.records, r.total, req.query.current || 1, req.query.size || 20));
  },
  products: (req, res) => res.json(R.ok(opsService.products(req.query))),
  productDetail: (req, res) => res.json(R.ok(opsService.productDetail(req.params.sku, Number(req.query.days) || 60))),
  ads: (req, res) => res.json(R.ok(opsService.ads(req.query))),
  selection: (req, res) => res.json(R.ok(opsService.selection(req.query.site || 'MX', Number(req.query.target_margin) || 0.2))),
  review: (req, res) => res.json(R.ok(opsService.review(Number(req.query.days) || 7))),
  meta: (req, res) => res.json(R.ok(opsService.meta())),
  quarantine: (req, res) => res.json(R.ok({ records: mappers.quarantine.list({}, 'id DESC') })),
  inventory: (req, res) => res.json(R.ok(opsService.inventory(req.query))),
};

/** 数据管道：接入批次 / 任务日志 / 指标快照 / 手动重算 */
export const pipelineController = {
  status: (req, res) => res.json(R.ok(etlService.pipelineStatus())),
  run: async (req, res) => {
    const r = await etlService.runPipeline({ trigger: 'manual' });
    res.json(R.ok(r));
  },
  batches: (req, res) => {
    const r = etlService.batchPage(req.query);
    res.json(R.page(r.records, r.total, req.query.current || 1, req.query.size || 10));
  },
  logs: (req, res) => {
    const r = etlService.logPage(req.query);
    res.json(R.page(r.records, r.total, req.query.current || 1, req.query.size || 15));
  },
  snapshots: (req, res) => res.json(R.ok(etlService.snapshots(req.query))),
};
