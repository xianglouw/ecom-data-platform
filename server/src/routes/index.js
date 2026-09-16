import express from 'express';
import multer from 'multer';
import fs from 'node:fs';
import path from 'node:path';
import config from '../config/index.js';
import { R } from '../common/R.js';
import { ingest, readFile } from '../service/ingestService.js';
import { recordBatch, autoRun } from '../service/etlService.js';
import { dataService } from '../service/dataService.js';
import { analysisService } from '../service/analysisService.js';
import { authMiddleware } from '../middleware/auth.js';
import { als } from '../db/tenant.js';
import * as c from '../controller/index.js';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });
const router = express.Router();

router.use(express.json({ limit: '5mb' }));

// ---- 认证：手机号 + 验证码（注册 / 登录免鉴权，其余接口需登录）----
router.post('/auth/send-code', c.authController.sendCode);
router.post('/auth/register', c.authController.register);
router.post('/auth/login', c.authController.login);
router.post('/auth/demo-login', c.authController.demoLogin);

// 以下所有接口都要带令牌；中间件同时负责把请求路由到当前用户自己的数据空间
router.use(authMiddleware());

router.post('/auth/logout', c.authController.logout);
router.get('/auth/info', c.authController.info);
router.get('/auth/profile', c.authController.profile);

// ---- 商品管理 ----
router.get('/product/page', c.productController.page);
router.get('/product/categories', c.productController.categories);
router.get('/product/:id', c.productController.detail);
router.post('/product', c.productController.create);
router.put('/product/:id', c.productController.update);
router.put('/product/:id/status', c.productController.status);
router.delete('/product/:id', c.productController.remove);

// ---- 订单管理 ----
router.get('/order/page', c.orderController.page);
router.get('/order/stats', c.orderController.stats);
router.get('/order/:orderNo', c.orderController.detail);
router.put('/order/:orderNo/status', c.orderController.status);

// ---- 订单财务明细（平台导出的订单级结算数据）----
router.get('/order/finance/page', c.orderFinanceController.page);
router.get('/order/finance/stats', c.orderFinanceController.stats);
router.get('/order/finance/sku', c.orderFinanceController.sku);
router.get('/order/finance/facets', c.orderFinanceController.facets);
router.get('/order/finance/fx', c.orderFinanceController.fx);

// ---- 会员管理 ----
router.get('/member/page', c.memberController.page);
router.get('/member/stats', c.memberController.stats);
router.put('/member/:id', c.memberController.update);

// ---- 权限与系统设置 ----
router.get('/sys/user/page', c.sysController.userPage);
router.get('/sys/role/list', c.sysController.roleList);
router.get('/sys/setting', c.sysController.settings);
router.post('/sys/setting', c.sysController.saveSetting);
router.post('/sys/setting/batch', c.sysController.saveSettings);
router.get('/sys/freight', c.sysController.freightList);
router.post('/sys/freight', c.sysController.freightSave);
router.delete('/sys/freight/:id', c.sysController.freightRemove);
router.get('/sys/rate', c.sysController.rateList);
router.post('/sys/rate', c.sysController.rateSave);
router.delete('/sys/rate/:id', c.sysController.rateRemove);

// ---- 运营分析 ----
router.get('/ops/overview', c.opsController.overview);
router.get('/ops/sales', c.opsController.salesPage);
router.get('/ops/products', c.opsController.products);
router.get('/ops/product/:sku', c.opsController.productDetail);
router.get('/ops/ads', c.opsController.ads);
router.get('/ops/selection', c.opsController.selection);
router.get('/ops/review', c.opsController.review);
router.get('/ops/meta', c.opsController.meta);
router.get('/ops/quarantine', c.opsController.quarantine);
router.get('/ops/inventory', c.opsController.inventory);

// ---- 增长中枢：SKU 主线（选品研究 → 商品链接 → 达人建联 → 素材库 → 视频发布）----
router.get('/growth/meta', c.growthController.meta);
router.get('/growth/overview', c.growthController.overview);
router.get('/growth/sku/:code/chain', c.growthController.chain);
router.get('/growth/:module/page', c.growthController.page);
router.post('/growth/:module', c.growthController.create);
router.put('/growth/:module/:id', c.growthController.update);
router.delete('/growth/:module/:id', c.growthController.remove);

// 数据现状与数据治理：库里有什么、哪些是演示数据、一键清空
router.get('/data/state', (req, res) => res.json(R.ok(dataService.state())));
router.post('/data/reset', async (req, res) => {
  const { tables, confirm } = req.body || {};
  if (confirm !== 'CLEAR') return res.json(R.fail('需要显式确认（confirm=CLEAR）后才可清空数据'));
  try {
    const r = dataService.reset(tables);
    await autoRun('manual', null); // 数据变了，指标同步重算，避免看板残留旧快照
    res.json(R.ok(r));
  } catch (e) {
    res.json(R.fail('清空失败: ' + e.message));
  }
});

// 自助表分析：按维度 × 指标对「传进来的表」做交叉聚合
router.get('/analysis/datasets', (req, res) => res.json(R.ok(analysisService.datasets())));
router.post('/analysis/explore', (req, res) => {
  try {
    res.json(R.ok(analysisService.explore(req.body || {})));
  } catch (e) {
    res.json(R.fail(e.message));
  }
});
router.get('/analysis/distinct', (req, res) => {
  try {
    res.json(R.ok(analysisService.distinct(req.query.dataset, req.query.field)));
  } catch (e) {
    res.json(R.fail(e.message));
  }
});

// 数据管道：接入 → 自动计算 → 可视化发布
router.get('/pipeline/status', c.pipelineController.status);
router.post('/pipeline/run', c.pipelineController.run);
router.get('/pipeline/batches', c.pipelineController.batches);
router.get('/pipeline/logs', c.pipelineController.logs);
router.get('/metrics/snapshots', c.pipelineController.snapshots);

// ---- 数据上传（上传 → 清洗 → 入库 / 隔离）----
const TEMPLATES = {
  sales: '日期,广告活动,商品编码,平台,站点,类目,曝光,点击,花费,订单数,销量,广告销售额,总销售额,单位成本,退款金额,币种\n2026-09-01,TT_US_测品_家居,A-001,TikTok Shop,US,家居,180000,3600,1800,90,95,5400,7200,35,120,USD',
  product: 'sku,商品名称,类目,品牌,成本,售价,市场价,库存,单件重量kg,销量,状态,备注\nA-001,磁吸手机支架,3C配件,Mall4j,4.2,12.99,19.99,1200,0.18,860,1,热销',
  freight: '站点,重量下限,重量上限,运费usd\nMX,0,0.25,6.67',
  rate: '平台,站点,类目,佣金率,其他费率,来源,生效日期\nAmazon,US,*,0.15,0.06,后台费率页快照,2026-08-01',
  // 订单财务：表头与 Mercado Libre 后台导出保持一致（中/西双语均可识别）
  orderFinance: '订单编号,单量,总收入,佣金,附加费,运费,退货退款,净利润 (比索),Venta por publicidad,SKU,# de publicación\n2000010306633681,1,164.74,-69.12,,,,,95.62,,W009-DDJ,MLM4030001120',
  // 库存管理：只要含 SKU 即可导入，未识别列会自动保留为扩展列
  inventory: 'sku,商品名称,平台,站点,仓库,可售库存,在途库存,预留库存,不可售库存,日均销量,可售天数,补货点,安全库存,库存金额,仓储费,库龄,报表日期,币种\nW009-DDJ,宠物智能喂食器,Amazon,MX,FBA-MX,320,120,15,2,18,17.8,60,120,4160,58,42,2026-09-15,MXN',
  // 广告花费明细
  ads: '日期,平台,站点,店铺,广告活动,广告组,关键词,匹配方式,SKU,曝光,点击,花费,订单数,销量,广告销售额,币种\n2026-09-01,Amazon,MX,主店,ML_MX_宠物_自动,组1,宠物喂食器,广泛,W009-DDJ,18000,420,320.5,26,31,2480,MXN',
};

/** 数据集元信息（上传页下拉与说明） */
const DATASET_META = [
  { key: 'inventory', name: '库存管理', desc: '平台/ERP 导出的库存报表：可售、在途、预留、库龄、仓储费…未识别的列自动保留，不丢', required: 'SKU / 商品编码' },
  { key: 'ads', name: '广告花费明细', desc: '广告后台导出的花费表：活动 / 广告组 / 关键词维度的曝光、点击、花费、订单、广告销售额', required: '日期' },
  { key: 'orderFinance', name: '订单财务明细', desc: '订单级结算数据：收入/佣金/运费/退款/净利，适配 Mercado Libre 导出表', required: '订单编号、总收入' },
  { key: 'sales', name: '销售日数据', desc: '日粒度广告+销售数据，用于看板与 ROI 复盘', required: '日期、商品编码、总销售额' },
  { key: 'product', name: '商品主数据', desc: '商品成本/售价/重量，用于选品测算', required: 'sku、商品名称' },
  { key: 'freight', name: '运费表', desc: '分站点重量段运费，用于选品测算', required: '站点、运费usd' },
  { key: 'rate', name: '费率规则', desc: '平台佣金率与其他费率', required: '平台、站点、佣金率' },
];

router.get('/data/datasets', (req, res) => res.json(R.ok(DATASET_META)));

router.post('/data/upload/:dataset', upload.single('file'), async (req, res) => {
  const { dataset } = req.params;
  if (!TEMPLATES[dataset]) return res.json(R.fail('未知数据集: ' + dataset, 'A0400'));
  try {
    /**
     * 关键：multer 的文件流处理会脱离上游中间件建立的 AsyncLocalStorage 上下文，
     * 若不在这里显式重建，数据会被写进「平台库」而不是当前登录用户的数据空间。
     */
    return await als.run({ userId: req.userId }, async () => {
      const t0 = Date.now();
      const rows = readFile(req.file.buffer);
      if (!rows.length) return res.json(R.ok({ inserted: 0, quarantined: 0, flags: ['文件为空'] }));
      // multer 把非 ASCII 文件名按 latin1 解码，这里还原成 UTF-8，避免中文文件名变乱码
      const rawName = req.file.originalname || '';
      const fixed = Buffer.from(rawName, 'latin1').toString('utf8');
      const fileName = fixed.includes('\uFFFD') ? rawName : fixed;
      const preview = req.query.preview === 'true';
      const result = ingest(dataset, rows, { replace: req.query.replace !== 'false', dryRun: preview, sourceFile: fileName });
      // 预览模式（preview=true）：只解析、不写库、不记批次、不触发计算
      if (preview) return res.json(R.ok({ ...result, preview: true, total_rows: rows.length }));
      const meta = DATASET_META.find((d) => d.key === dataset) || { name: dataset };
      // 记录接入批次（数据来源可追溯）并自动触发指标计算
      const total = (result.inserted || 0) + (result.quarantined || 0) + (result.skipped || 0);
      const qRate = total ? result.quarantined / total : 0;
      const batchId = recordBatch({
        dataset, datasetName: meta.name, fileName,
        total, inserted: result.inserted, quarantined: result.quarantined, skipped: result.skipped,
        qualityScore: total ? Math.max(0, Math.round(100 - qRate * 200)) : null,
        status: result.quarantined ? 'partial' : 'success',
        message: result.flags?.join('；') || '入库成功', triggerType: 'upload', durationMs: Date.now() - t0,
      });
      const pipeline = await autoRun('upload', batchId);
      return res.json(R.ok({ ...result, batch_id: batchId, pipeline }));
    });
  } catch (e) {
    res.json(R.fail('解析失败: ' + e.message));
  }
});

router.post('/data/upload-demo', (req, res) => {
  const p = path.resolve(config.uploadDir, 'sales_dirty_demo.csv');
  if (!fs.existsSync(p)) return res.json(R.fail('演示文件不存在'));
  const rows = readFile(fs.readFileSync(p));
  res.json(R.ok(als.run({ userId: req.userId }, () => ingest('sales', rows, { replace: false, dryRun: true }))));
});

router.get('/data/template/:dataset', (req, res) => {
  const tpl = TEMPLATES[req.params.dataset];
  if (!tpl) return res.json(R.fail('无此模板'));
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename=${req.params.dataset}_template.csv`);
  res.send('\uFEFF' + tpl);
});

export default router;
