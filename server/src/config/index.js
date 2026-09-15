/** 全局配置 */
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(__dirname, '../..');
// 静态目录：优先随包发布的 server/public（云端/生产），回退本地构建产物 admin/dist（开发）
const PUBLIC_DIST = path.resolve(ROOT, 'public');
const LOCAL_DIST = path.resolve(ROOT, '../admin/dist');
const pickDist = () => {
  if (fs.existsSync(path.join(PUBLIC_DIST, 'index.html'))) return PUBLIC_DIST;
  if (fs.existsSync(path.join(LOCAL_DIST, 'index.html'))) return LOCAL_DIST;
  return PUBLIC_DIST;
};

export default {
  port: Number(process.env.PORT) || 8800,
  host: process.env.HOST || '0.0.0.0',
  // 平台库：只存账号 / 验证码 / 令牌等平台级数据
  dbPath: process.env.DB_PATH || path.resolve(ROOT, 'data/ecom-admin.db'),
  // 数据根目录；每个注册用户的业务库放在 dataDir/tenants/u_<id>.db
  dataDir: process.env.DATA_DIR || path.resolve(ROOT, 'data'),
  uploadDir: process.env.UPLOAD_DIR || path.resolve(ROOT, 'data'),
  // 示例数据目录：演示账号一键体验时灌入（见 service/demoSeed.js）
  sampleDataDir: process.env.SAMPLE_DATA_DIR || path.resolve(ROOT, 'sample-data'),
  adminDist: pickDist(),
};
