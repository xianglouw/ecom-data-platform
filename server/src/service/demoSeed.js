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
    // 幂等：已有业务数据则跳过（体验者上传的内容优先）
    try {
      if (mappers.sales.count({}) > 0) return { seeded: false, reason: '演示空间已有数据' };
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
    return { seeded: true, inserted, detail, pipeline_status: pipeline?.status };
  });
}
