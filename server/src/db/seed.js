/**
 * 演示数据初始化：商城（商品/SKU/会员/订单）+ 运营（广告日数据/运费/费率）
 * 刻意埋异常：某广告活动后期 ROAS 崩、某 SKU 退款飙升、脏数据样例文件
 */
import fs from 'node:fs';
import path from 'node:path';
import config from '../config/index.js';
import { DDL } from '../entity/index.js';
import { db } from '../mapper/index.js'; // 复用同一个连接（wasm 版 SQLite，见 src/db/sqlite.js）

fs.mkdirSync(path.dirname(config.dbPath), { recursive: true });
DDL.forEach(sql => db.exec(sql));

// 安全护栏：库里已有业务数据时不允许重灌（除非显式 FORCE_SEED=1），
// 防止启动时序问题导致真实导入的数据被演示数据覆盖
if (process.env.FORCE_SEED !== '1') {
  const hasData = db
    .prepare("SELECT (SELECT COUNT(*) FROM product) + (SELECT COUNT(*) FROM orders) + (SELECT COUNT(*) FROM order_finance) + (SELECT COUNT(*) FROM sales_daily) AS c")
    .get().c;
  if (hasData > 0) {
    console.log('[SEED] 库中已有 ' + hasData + ' 行业务数据，跳过重灌（如需重置请设 FORCE_SEED=1）');
    if (typeof db.save === 'function') db.save();
    // 以 ESM 顶层脚本被 import 的方式运行时无法 process.exit，直接返回由调用方继续
    process.env.SEED_SKIPPED = '1';
  }
}

if (process.env.SEED_SKIPPED !== '1' && process.env.SEED_DEMO !== '1') {
  console.log('[SEED] 演示数据默认关闭（平台以你上传的数据为准）。如需演示数据请设 SEED_DEMO=1 后再导入本模块。');
}
if (process.env.SEED_SKIPPED !== '1' && process.env.SEED_DEMO === '1') {
// 清空旧数据（复用同一个数据库文件而非删文件重建，
// 这样同进程内已建立的连接依然指向同一份数据，云端首次启动也安全）
db.exec('PRAGMA foreign_keys = OFF');
const allTables = db
  .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
  .all();
for (const { name } of allTables) db.exec(`DELETE FROM "${name}"`);
try { db.exec("DELETE FROM sqlite_sequence"); } catch { /* 无自增表时忽略 */ }
db.exec('PRAGMA foreign_keys = ON');

let seed = 42;
const rand = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
const ri = (a, b) => Math.floor(a + rand() * (b - a + 1));
const pick = arr => arr[Math.floor(rand() * arr.length)];
const now = () => new Date().toISOString().slice(0, 19).replace('T', ' ');

const CATEGORIES = ['3C配件', '家居', '户外', '宠物', '厨房', '美妆', '母婴'];
const BRANDS = ['Mall4j', 'Yami', 'HomePro', 'PetJoy'];
const PRODUCTS = [
  ['A-001', '磁吸手机支架', '3C配件', 4.2, 12.99, 1.2, 0.18],
  ['A-002', '车载无线充电器', '3C配件', 8.5, 25.99, 1, 0.32],
  ['A-003', '折叠收纳箱三件套', '家居', 6.8, 22.9, 3, 1.2],
  ['A-004', '户外信号增强天线', '户外', 11.0, 39.9, 1, 0.55],
  ['A-005', '宠物智能饮水机', '宠物', 13.2, 42.9, 1, 1.05],
  ['A-006', '硅胶烘焙垫套装', '厨房', 2.9, 11.99, 2, 0.25],
  ['A-007', 'LED 化妆镜', '美妆', 9.6, 29.9, 1, 0.85],
  ['A-008', '儿童防走失背包', '母婴', 5.4, 18.99, 1, 0.4],
  ['A-009', '便携榨汁杯', '厨房', 7.8, 24.9, 1, 0.6],
  ['A-010', '无线蓝牙耳机', '3C配件', 15.4, 49.9, 1, 0.15],
  ['A-011', '露营折叠椅', '户外', 18.5, 59.9, 2, 2.4],
  ['A-012', '猫爬架小型', '宠物', 22.0, 69.9, 1, 3.2],
  ['A-013', '智能感应垃圾桶', '家居', 12.6, 35.9, 1, 1.1],
  ['A-014', '婴儿硅胶餐盘', '母婴', 4.9, 16.9, 1, 0.3],
  ['A-015', '美妆收纳盒', '美妆', 6.2, 19.9, 1, 0.45],
  ['A-016', '多功能数据线', '3C配件', 3.1, 9.9, 1, 0.12],
];

const ins = {
  user: db.prepare('INSERT INTO sys_user(username,nickname,role_code,mobile,status,created_at) VALUES (?,?,?,?,?,?)'),
  role: db.prepare('INSERT INTO sys_role(code,name,menu,remark,created_at) VALUES (?,?,?,?,?)'),
  setting: db.prepare('INSERT INTO sys_setting(config_key,config_value,remark) VALUES (?,?,?)'),
  product: db.prepare('INSERT INTO product(spu_code,name,category,brand,cost,price,market_price,stock,weight_kg,sales,status,created_at,remark) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)'),
  sku: db.prepare('INSERT INTO product_sku(spu_code,sku_code,spec,cost,price,stock,sales,status) VALUES (?,?,?,?,?,?,?,?)'),
  member: db.prepare('INSERT INTO member(nickname,mobile,level,balance,order_count,total_amount,status,reg_time) VALUES (?,?,?,?,?,?,?,?)'),
  order: db.prepare('INSERT INTO orders(order_no,member_name,member_id,platform,site,total_amount,pay_amount,freight,item_count,status,pay_time,created_at,remark) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)'),
  item: db.prepare('INSERT INTO order_item(order_no,sku_code,product_name,qty,price,amount) VALUES (?,?,?,?,?,?)'),
  sales: db.prepare(`INSERT INTO sales_daily(date,campaign,sku,platform,site,category,impressions,clicks,ad_spend,ad_orders,units,ad_sales,total_sales,unit_cost,refund,currency) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`),
  freight: db.prepare('INSERT INTO freight(site,weight_min,weight_max,freight_usd) VALUES (?,?,?,?)'),
  rate: db.prepare('INSERT INTO fee_rate(platform,site,category,commission,other_fee,source,effective_date) VALUES (?,?,?,?,?,?,?)'),
};

// ---------- 系统与权限 ----------
ins.role.run('SUPER', '超级管理员', '*', '拥有全部菜单权限', now());
ins.role.run('OPS', '运营专员', 'dashboard,product,order,ops', '负责商品/订单/运营分析', now());
ins.role.run('KF', '客服', 'order,member', '负责订单与会员', now());
[['admin', '超级管理员', 'SUPER'], ['ops01', '李运营', 'OPS'], ['kf01', '王客服', 'KF']].forEach(([u, n, r], i) =>
  ins.user.run(u, n, r, '1380013800' + i, 1, now()));
[['mall_name', 'Mall4j 开源商城', '商城名称'], ['currency', 'USD', '结算币种（演示统一 USD）'],
 ['default_fee_rate', '0.15', '未匹配费率规则时的兜底佣金'], ['low_margin', '0.10', '低毛利告警阈值'],
 ['refund_alert', '0.05', '退款率告警阈值']].forEach(([k, v, r]) => ins.setting.run(k, v, r));

// ---------- 商品与 SKU ----------
PRODUCTS.forEach(([code, name, cat, cost, price, pack, weight]) => {
  const brand = pick(BRANDS);
  ins.product.run(code, name, cat, brand, cost, price, +(price * 1.45).toFixed(2), ri(50, 1800), weight, ri(80, 2600), rand() > 0.12 ? 1 : 0, now(), '');
  const specs = cat === '3C配件' ? ['黑色', '白色'] : cat === '母婴' ? ['粉色', '蓝色'] : ['标准装', '豪华装'];
  specs.forEach((s, i) => ins.sku.run(code, `${code}-${i + 1}`, s, +cost.toFixed(2), +price.toFixed(2), ri(20, 900), ri(20, 800), 1));
});

// ---------- 会员 ----------
const SUR = ['张', '李', '王', '刘', '陈', '杨', '赵', '黄', '周', '吴'];
const LEVELS = ['普通会员', '银卡会员', '金卡会员', '钻石会员'];
const members = [];
for (let i = 0; i < 68; i++) {
  const name = pick(SUR) + pick(['小', '大', '阿', '']) + pick(['明', '华', '婷', '杰', '娜', '强', '静', '磊']);
  const m = { id: i + 1, name };
  members.push(m);
  ins.member.run(name, '13' + ri(100000000, 999999999), pick(LEVELS), +ri(0, 800), ri(1, 24), +ri(50, 3200).toFixed(2), rand() > 0.08 ? 1 : 0,
    `2026-${String(ri(1, 8)).padStart(2, '0')}-${String(ri(1, 28)).padStart(2, '0')}`);
}

// ---------- 订单 ----------
const PLATFORMS = [['Amazon', 'US'], ['Amazon', 'DE'], ['TikTok Shop', 'US'], ['Shopee', 'MX'], ['Temu', 'US'], ['Mercado Libre', 'MX'], ['Lazada', 'BR']];
const STATUS = ['待付款', '待发货', '已发货', '已完成', '已完成', '已完成', '已退款'];
let orderNo = 202609010000;
for (let i = 0; i < 260; i++) {
  const [platform, site] = pick(PLATFORMS);
  const m = pick(members);
  const itemCount = ri(1, 3);
  let total = 0;
  const items = [];
  for (let j = 0; j < itemCount; j++) {
    const p = pick(PRODUCTS);
    const qty = ri(1, 3);
    const amount = +(p[4] * qty).toFixed(2);
    total += amount;
    items.push([p[0], p[1], qty, p[4], amount]);
  }
  const freight = +(ri(0, 12) + 3.9).toFixed(2);
  const status = pick(STATUS);
  const day = ri(1, 14), month = 9;
  const created = `2026-0${month}-${String(day).padStart(2, '0')} ${String(ri(8, 22)).padStart(2, '0')}:${String(ri(10, 59)).padStart(2, '0')}:00`;
  const no = 'M' + (orderNo++);
  ins.order.run(no, m.name, m.id, platform, site, +(total + freight).toFixed(2), +(total + freight).toFixed(2), freight, itemCount,
    status, status === '待付款' ? null : created, created, '');
  items.forEach(it => ins.item.run(no, it[0], it[1], it[2], it[3], it[4]));
}

// ---------- 运营：广告日数据（92 天）----------
const CAMPAIGNS = [
  ['Amazon', 'US', 'AM_US_自动_广泛', ['A-001', 'A-002', 'A-010', 'A-016'], '3C配件', 1.0],
  ['Amazon', 'DE', 'AM_DE_精准_家居', ['A-003', 'A-013'], '家居', 0.9],
  ['TikTok Shop', 'US', 'TT_US_测品_家居', ['A-003', 'A-007'], '家居', 1.1],
  ['TikTok Shop', 'US', 'TT_US_放量_户外', ['A-004', 'A-011'], '户外', 0.6],
  ['Shopee', 'MX', 'SP_MX_日常_全店', ['A-001', 'A-003', 'A-006', 'A-008'], '家居', 0.8],
  ['Temu', 'US', 'TM_US_闪购_全店', ['A-002', 'A-005', 'A-007'], '宠物', 0.7],
  ['Mercado Libre', 'MX', 'ML_MX_品牌_宠物', ['A-005', 'A-012'], '宠物', 0.5],
  ['Lazada', 'BR', 'LZ_BR_清仓_厨房', ['A-006', 'A-009'], '厨房', 0.45],
];
const priceMap = Object.fromEntries(PRODUCTS.map(p => [p[0], p[4]]));
const costMap = Object.fromEntries(PRODUCTS.map(p => [p[0], p[3]]));
const start = new Date('2026-06-15T00:00:00Z');
for (let d = 0; d < 92; d++) {
  const day = new Date(start.getTime() + d * 86400000).toISOString().slice(0, 10);
  const weekend = [5, 6].includes(new Date(day).getUTCDay()) ? 1.25 : 1.0;
  const trend = 1 + d * 0.004;
  for (const [platform, site, campaign, skus, cat, scale] of CAMPAIGNS) {
    for (const sku of skus) {
      const unitPrice = priceMap[sku] * (0.95 + rand() * 0.1);
      let adOrders = Math.max(1, Math.round(ri(8, 18) * scale * weekend * trend));
      const organic = Math.max(1, Math.round(adOrders * (0.25 + rand() * 0.35)));
      let units = adOrders + organic;
      const clicks = adOrders * ri(30, 55);
      const impressions = clicks * ri(25, 45);
      let spend = +(adOrders * unitPrice * (0.28 + rand() * 0.14)).toFixed(2);
      // 埋点 1：放量活动后期订单崩而花费不降 → ROAS 跌破保本
      if (campaign === 'TT_US_放量_户外' && d > 45) { adOrders = Math.max(1, Math.round(adOrders * 0.35)); units = adOrders + organic; }
      const adSales = +(adOrders * unitPrice).toFixed(2);
      const totalSales = +(units * unitPrice).toFixed(2);
      // 埋点 2：宠物饮水机 8 月下旬退款飙升
      const refundRate = sku === 'A-005' && day >= '2026-08-20' ? 0.08 + rand() * 0.06 : 0.02;
      ins.sales.run(day, campaign, sku, platform, site, cat, impressions, clicks, spend, adOrders, units,
        adSales, totalSales, +costMap[sku].toFixed(2), +(totalSales * refundRate).toFixed(2), 'USD');
    }
  }
}

// ---------- 运费与费率 ----------
[['MX', 6.6], ['US', 4.5], ['BR', 7.2], ['DE', 5.1]].forEach(([site, base]) => {
  let lo = 0, step = base;
  while (lo < 2.5) { ins.freight.run(site, lo, +(lo + 0.5).toFixed(2), +step.toFixed(2)); step += 1.8; lo = +(lo + 0.5).toFixed(2); }
});
[['Amazon', 'US', '*', 0.15, 0.06], ['Amazon', 'DE', '*', 0.15, 0.09], ['TikTok Shop', 'US', '*', 0.06, 0.03],
 ['Shopee', 'MX', '*', 0.10, 0.04], ['Temu', 'US', '*', 0.08, 0.05], ['Mercado Libre', 'MX', '宠物', 0.13, 0.05],
 ['Mercado Libre', 'MX', '*', 0.145, 0.05], ['Lazada', 'BR', '*', 0.12, 0.06]]
  .forEach(([p, s, c, cm, of]) => ins.rate.run(p, s, c, cm, of, '后台费率页快照', '2026-08-01'));

// ---------- 脏数据演示文件 ----------
fs.mkdirSync(config.uploadDir, { recursive: true });
const dirtyPath = path.resolve(config.uploadDir, 'sales_dirty_demo.csv');
fs.writeFileSync(dirtyPath, '\uFEFF' + [
  '日期,广告活动,商品编码,平台,站点,曝光,点击,花费,订单数,销量,广告销售额,总销售额,单位成本,退款金额,币种',
  '2026-09-01,TT_US_测品_家居,A-001,TikTok Shop,US,180000,3600,"¥1,800.50",90,95,5400,7200,35,120,USD',
  '2026-09-01,TT_US_测品_家居,A-003,TikTok Shop,US,150000,3000,1500,75,80,4500,6000,,90,USD',
  '2026-09-02,SP_MX_日常_全店,A-001,Shopee,MX,"98,000",2400,"10,84",40,42,"2,340.00",3120,4.2,60,USD',
  '09/03/2026,TM_US_闪购_全店,A-002,Temu,US,120000,2100,900,30,33,1800,2400,8.5,48,USD',
  ',TM_US_闪购_全店,A-005,Temu,US,90000,1500,700,20,22,1400,1900,13.2,38,USD',
].join('\n'), 'utf8');

console.log(`seed 完成 -> ${config.dbPath}`);
console.log(`  商品 ${PRODUCTS.length} / 会员 68 / 订单 260 / 广告日数据 ${db.prepare('SELECT COUNT(*) c FROM sales_daily').get().c} 行`);
console.log(`  脏数据演示 -> ${dirtyPath}`);
if (typeof db.save === 'function') db.save();
}
