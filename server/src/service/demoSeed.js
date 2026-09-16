/**
 * 演示数据灌入 —— 支撑「开源后任何人一键体验」
 *
 * 把 sample-data/ 目录里的示例表灌进演示账号的数据空间：
 *   01-sales.csv            销售/广告日数据（30 天 × 4 SKU）
 *   02-ads.csv              广告花费明细（活动/广告组两层）
 *   03-order-finance.csv    订单结算财务（含 8 月下旬退款飙升故事线）
 *   04-inventory.csv        库存（覆盖 缺货/偏低/滞销 三种预警）
 *   05-product.csv          商品主数据（选品测算口径）
 *   06-freight.csv          运费表 / 07-rate.csv 费率规则
 *
 * 幂等：仅当演示空间为空时才灌入，体验者后续上传/修改不会被覆盖。
 */
import fs from 'node:fs';
import path from 'node:path';
import config from '../config/index.js';
import { ingest, readFile } from './ingestService.js';
import { autoRun } from './etlService.js';
import { withTenant } from '../db/tenant.js';
import { bjToday, bjAddDays } from '../common/datetime.js';

const FILES = [
  ['sales', '01-sales.csv'],
  ['ads', '02-ads.csv'],
  ['orderFinance', '03-order-finance.csv'],
  ['inventory', '04-inventory.csv'],
  ['product', '05-product.csv'],
  ['freight', '06-freight.csv'],
  ['rate', '07-rate.csv'],
];

/** 给租户补齐管道任务定义（新账号在启动引导之后创建时需要） */
async function ensureJobs() {
  const { PIPELINE_JOBS } = await import('../entity/index.js');
  const { mappers } = await import('../mapper/index.js');
  const exist = mappers.job.list().map((j) => j.job_code);
  for (const j of PIPELINE_JOBS) {
    if (!exist.includes(j.code)) {
      mappers.job.insert({
        job_code: j.code, job_name: j.name, stage: j.stage, step_no: j.step_no,
        enabled: 1, schedule_desc: j.schedule_desc, last_status: '待执行',
      });
    }
  }
}

/** 把示例数据灌进指定用户的数据空间（仅空库时执行，返回是否灌入及明细） */
export async function seedDemoTenant(userId) {
  const dir = config.sampleDataDir;
  if (!fs.existsSync(dir)) return { seeded: false, reason: `示例数据目录不存在: ${dir}` };

  return withTenant(userId, async () => {
    const { mappers } = await import('../mapper/index.js');
    // 增长中枢演示数据先行灌入（自带幂等判断），保证存量演示空间也能补齐新模块
    const growth = seedGrowthDemo(mappers);
    // 幂等：已有业务数据则跳过（体验者上传的内容优先）
    try {
      if (mappers.sales.count({}) > 0) return { seeded: false, reason: '演示空间已有数据', growth };
    } catch { /* 表刚建，视为空 */ }

    await ensureJobs();
    const detail = [];
    let inserted = 0;
    for (const [dataset, file] of FILES) {
      const p = path.join(dir, file);
      if (!fs.existsSync(p)) continue;
      const rows = readFile(fs.readFileSync(p));
      const r = ingest(dataset, rows, { replace: true, dryRun: false, sourceFile: file });
      inserted += r.inserted || 0;
      detail.push({ dataset, file, inserted: r.inserted, quarantined: r.quarantined });
    }
    const pipeline = await autoRun('demo', null);
    console.log(`[DEMO] 演示空间 userId=${userId} 已灌入示例数据 ${inserted} 行（管道 ${pipeline?.status}）`);
    return { seeded: true, inserted, detail, pipeline_status: pipeline?.status, growth };
  });
}

/**
 * 增长中枢演示数据：与示例表同款的 4 个 SKU，展示链路各环节的典型状态 ——
 * W009-DDJ 走完整链路（在售/已上架/已合作/视频已发布），其余 SKU 停在不同环节，
 * 让「链路总览」一眼看出每个 SKU 卡在哪里。
 */
function seedGrowthDemo(mappers, t = bjToday()) {
  if (mappers.growthSku.count({}) > 0) return; // 幂等

  const skus = [
    { sku_code: 'W009-DDJ', name: '宠物智能喂食器', category: '宠物用品', platforms: 'Amazon / Mercado Libre', lifecycle: '在售', supplier: '宁波XX工厂', cost: 210, target_price: 899, first_batch_qty: 500, owner_note: '主力款，广告 ROAS 稳定' },
    { sku_code: 'A-001', name: '磁吸手机支架', category: '3C配件', platforms: 'TikTok Shop', lifecycle: '测试中', supplier: '深圳XX电子', cost: 37, target_price: 199, first_batch_qty: 300, owner_note: '达人短视频测品中' },
    { sku_code: 'H-007', name: '家用迷你缝纫机', category: '家居', platforms: 'Temu', lifecycle: '选品池', supplier: '', cost: 58, target_price: 259, first_batch_qty: null, owner_note: '竞品评分偏低，再观察' },
    { sku_code: 'BS-002-BK', name: '露营折叠灯', category: '户外', platforms: '', lifecycle: '选品池', supplier: '台州XX照明', cost: 66, target_price: 319, first_batch_qty: 200, owner_note: '机会分达标，待确认采购' },
  ];
  for (const s of skus) mappers.growthSku.insert({ ...s, created_at: t, updated_at: t });

  mappers.selection.insert({ sku_code: 'W009-DDJ', source: '工具导出', sales_30d: 5200, price: 899, rating: 4.6, review_count: 3200, keyword: 'pet feeder automatico', competitor: 'PETLIBRO', trend: '上升', opportunity_score: 86, verdict: '采购', target_price: 899, note: '头部竞品价格带空缺', created_at: t });
  mappers.selection.insert({ sku_code: 'BS-002-BK', source: '竞品抓取', sales_30d: 1800, price: 329, rating: 4.3, review_count: 640, keyword: 'luz camping recargable', competitor: 'LE LED', trend: '上升', opportunity_score: 78, verdict: '待定', target_price: 319, note: 'Q4 需求季前上架', created_at: t });
  mappers.selection.insert({ sku_code: 'H-007', source: '人工导入', sales_30d: 900, price: 279, rating: 3.9, review_count: 210, keyword: 'maquina coser mini', competitor: 'Brother', trend: '平稳', opportunity_score: 52, verdict: '观察', target_price: 259, note: '差评集中在噪音，需改进款', created_at: t });

  mappers.listing.insert({ sku_code: 'W009-DDJ', platform: 'Mercado Libre', listing_id: 'MLM4030001120', task_type: '上架生成', title: 'Comedero Automático para Mascotas con Cámara WiFi', description: '生成稿：容量/定时/APP 远程控制三卖点', status: '已上架', issues: '', note: '人工确认合规后发布', created_at: t, updated_at: t });
  mappers.listing.insert({ sku_code: 'A-001', platform: 'TikTok Shop', listing_id: '', task_type: '上架生成', title: 'Soporte de Teléfono Magnético 360°', description: '生成稿：磁吸/360°旋转/车载场景', status: '待人工确认', issues: '', note: '等待类目佣金核对', created_at: t, updated_at: t });
  mappers.listing.insert({ sku_code: 'W009-DDJ', platform: 'Mercado Libre', listing_id: 'MLM4030001120', task_type: '链接体检', title: '', description: '', status: '需修改', issues: '主图点击率 0.8% 低于类目均值，建议更换首图', note: '已生成 2 张备选首图', created_at: t, updated_at: t });

  mappers.material.insert({ sku_code: 'W009-DDJ', type: '脚本', title: '宠物喂食器 30s 卖点脚本', content: '开场 3s 痛点：出差没人喂猫 → 6s 产品特写 → APP 远程投喂演示 → 限时折扣收尾', variant_count: 3, source: '自动生成', status: '可用', created_at: t });
  mappers.material.insert({ sku_code: 'W009-DDJ', type: '西语口播', title: 'Comedero 口播稿（西语）', content: '¿Te vas de viaje y tu gato se queda sin comer?…', variant_count: 2, source: '自动生成', status: '已用', created_at: t });
  mappers.material.insert({ sku_code: 'A-001', type: '视频变体', title: '车载磁吸支架 场景视频 ×3', content: '通勤 / 打车 / 自驾三个场景各 15s', variant_count: 3, source: '自动生成', status: '草稿', created_at: t });

  mappers.influencer.insert({ sku_code: 'W009-DDJ', influencer: '@mascotasdemx', platform: 'TikTok', region: 'MX', tags: '宠物/开箱', reach: 182000, invite_msg: '¡Hola! Nos encantaría enviarte nuestro comedero automático…', follow_up_date: bjAddDays(t, 3), status: '寄样中', commission_note: '寄样 + 15% 佣金', contract_note: '', created_at: t, updated_at: t });
  mappers.influencer.insert({ sku_code: 'A-001', influencer: '@techgadgets_us', platform: 'TikTok', region: 'US', tags: '3C/好物', reach: 95000, invite_msg: 'Hey! We love to send you our magnetic phone mount…', follow_up_date: bjAddDays(t, 1), status: '已回复', commission_note: '纯佣金 20%', contract_note: '', created_at: t, updated_at: t });

  mappers.video.insert({ sku_code: 'W009-DDJ', material_id: 2, platform: 'TikTok', schedule_at: bjAddDays(t, -7), title: '¿Tu gato come a tiempo? 🐱 #petfeeder', tags: 'petfeeder,mascotas,cosasdegato', cart_draft: '已挂车：W009-DDJ（MLM4030001120）', status: '已发布', views: 412000, gmv: 26800, published_at: bjAddDays(t, -7), created_at: t });
  mappers.video.insert({ sku_code: 'A-001', material_id: 3, platform: 'TikTok', schedule_at: bjAddDays(t, 2), title: 'Soporte magnético 360° #gadget', tags: 'gadgets,caraccessories', cart_draft: '待挂车（链接未上架）', status: '待发布', views: 0, gmv: 0, created_at: t });
}
