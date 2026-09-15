/**
 * 应用入口：Express 服务（静态托管前端 dist + REST API）
 * 前后端分离结构，为单机可跑：后端 8800 同时提供 API 与静态资源
 *
 * 数据分层：
 *   平台库 data/ecom-admin.db      —— 账号、验证码、登录令牌、角色
 *   业务库 data/tenants/u_<id>.db  —— 每个注册用户一个，注册时创建且业务数据为空
 */
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import config from './config/index.js';
import routes from './routes/index.js';
import { listTenantIds, ensureTenant, withTenant, flushTenants } from './db/tenant.js';

const app = express();

app.use('/api', routes);
app.use('/api', (req, res) => res.status(404).json({ code: 'A0404', msg: '接口不存在: ' + req.path, data: null }));

// 静态托管 Vue 构建产物（登录页本身不需要鉴权）
if (fs.existsSync(config.adminDist)) {
  app.use(express.static(config.adminDist));
  app.get('*', (req, res) => res.sendFile(path.join(config.adminDist, 'index.html')));
} else {
  app.get('/', (req, res) => res.send('<h3>前端未构建，请先执行 admin 目录 npm install && npm run build</h3>'));
}

// 统一异常处理：业务异常按其业务码返回，前端据 code 提示，不暴露堆栈
app.use((err, req, res, next) => {
  const isBiz = err && typeof err.code === 'string' && /^[A-Z]\d{4}$/.test(err.code);
  const code = isBiz ? err.code : 'A0500';
  if (!isBiz) console.error('[ERROR]', err?.stack || err?.message || err);
  res.json({ code, msg: err?.message || '服务异常', data: null });
});

/**
 * 启动引导
 * 1. 清理过期的验证码与登录令牌
 * 2. 已存在的用户数据空间逐个确保结构最新（新增表 / 新增默认参数会自动补齐）
 * 说明：平台不再自动灌入演示数据 —— 账号注册后就是一张空台，上传什么才有什么。
 */
async function bootstrap() {
  const { authService } = await import('./service/authService.js');
  authService.cleanupExpired();

  const ids = listTenantIds();
  for (const id of ids) {
    try {
      await ensureTenant(id);
    } catch (e) {
      console.error(`[INIT] 用户 ${id} 的数据空间初始化失败:`, e.message);
    }
  }
  console.log(`[INIT] 平台库就绪（账号/令牌）；已有用户数据空间 ${ids.length} 个，业务数据一律来自用户上传`);
}

/**
 * 数据管道引导：对每个用户的数据空间做一次新鲜度自检，然后启动定时调度
 * 这一步保证「用户上传进来的数据一定会被算出来并推到看板」，无需人工点按钮。
 */
async function bootstrapPipeline() {
  try {
    const { PIPELINE_JOBS } = await import('./entity/index.js');
    const { mappers } = await import('./mapper/index.js');
    const { etlService } = await import('./service/etlService.js');

    for (const userId of listTenantIds()) {
      await ensureTenant(userId);
      await withTenant(userId, async () => {
        try {
          // 补齐任务定义
          const exist = mappers.job.list().map((j) => j.job_code);
          for (const j of PIPELINE_JOBS) {
            if (!exist.includes(j.code)) {
              mappers.job.insert({
                job_code: j.code, job_name: j.name, stage: j.stage, step_no: j.step_no,
                enabled: 1, schedule_desc: j.schedule_desc, last_status: '待执行',
              });
            }
          }
          const st = etlService.pipelineStatus();
          if (st.freshness.stale && st.has_data !== false) {
            const r = await etlService.runPipeline({ trigger: 'boot' });
            console.log(`[PIPELINE] 用户 ${userId} 启动自检重算 trace=${r.trace_id}（${r.status}，${r.duration_ms}ms）`);
          }
        } catch (e) {
          console.error(`[PIPELINE] 用户 ${userId} 引导失败:`, e.message);
        }
      });
    }
    etlService.startScheduler();
  } catch (e) {
    console.error('[PIPELINE] 引导失败:', e.message);
  }
}

await bootstrap();
await bootstrapPipeline();

// 退出前把内存中的租户库统一落盘
process.once('exit', () => flushTenants());

app.listen(config.port, config.host, () => {
  console.log(`电商运营数据中台已启动: http://${config.host}:${config.port}`);
  console.log(`平台库: ${config.dbPath}`);
  console.log(`用户数据空间目录: ${path.join(config.dataDir, 'tenants')}`);
});
