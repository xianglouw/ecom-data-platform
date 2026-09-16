import request from './request';

const unwrap = p => p.then(r => r.data);

/** 认证：手机号 + 验证码 */
export const authApi = {
  sendCode: data => unwrap(request.post('/auth/send-code', data)),
  register: data => unwrap(request.post('/auth/register', data)),
  login: data => unwrap(request.post('/auth/login', data)),
  demoLogin: () => unwrap(request.post('/auth/demo-login', {})),
  logout: () => unwrap(request.post('/auth/logout')),
  info: () => unwrap(request.get('/auth/info')),
  profile: () => unwrap(request.get('/auth/profile')),
};

/** 商品 */
export const productApi = {
  page: params => unwrap(request.get('/product/page', { params })).then(d => d),
  detail: id => unwrap(request.get(`/product/${id}`)),
  create: data => unwrap(request.post('/product', data)),
  update: (id, data) => unwrap(request.put(`/product/${id}`, data)),
  status: (id, status) => unwrap(request.put(`/product/${id}/status`, { status })),
  remove: id => unwrap(request.delete(`/product/${id}`)),
  categories: () => unwrap(request.get('/product/categories')),
};

/** 订单 */
export const orderApi = {
  page: params => unwrap(request.get('/order/page', { params })),
  detail: orderNo => unwrap(request.get(`/order/${orderNo}`)),
  status: (orderNo, status, remark) => unwrap(request.put(`/order/${orderNo}/status`, { status, remark })),
  stats: () => unwrap(request.get('/order/stats')),
};

/** 订单财务明细（平台结算导出） */
export const orderFinanceApi = {
  page: params => unwrap(request.get('/order/finance/page', { params })),
  stats: params => unwrap(request.get('/order/finance/stats', { params })),
  sku: params => unwrap(request.get('/order/finance/sku', { params })),
  facets: () => unwrap(request.get('/order/finance/facets')),
};

/** 会员 */
export const memberApi = {
  page: params => unwrap(request.get('/member/page', { params })),
  update: (id, data) => unwrap(request.put(`/member/${id}`, data)),
  stats: () => unwrap(request.get('/member/stats')),
};

/** 系统 */
export const sysApi = {
  userPage: params => unwrap(request.get('/sys/user/page', { params })),
  roleList: () => unwrap(request.get('/sys/role/list')),
  settings: () => unwrap(request.get('/sys/setting')),
  saveSetting: data => unwrap(request.post('/sys/setting', data)),
  saveSettings: items => unwrap(request.post('/sys/setting/batch', { items })),
  freightList: site => unwrap(request.get('/sys/freight', { params: { site } })),
  freightSave: data => unwrap(request.post('/sys/freight', data)),
  freightRemove: id => unwrap(request.delete(`/sys/freight/${id}`)),
  rateList: () => unwrap(request.get('/sys/rate')),
  rateSave: data => unwrap(request.post('/sys/rate', data)),
  rateRemove: id => unwrap(request.delete(`/sys/rate/${id}`)),
};

/** 运营分析 */
export const opsApi = {
  overview: params => unwrap(request.get('/ops/overview', { params })),
  sales: params => unwrap(request.get('/ops/sales', { params })),
  products: params => unwrap(request.get('/ops/products', { params })),
  productDetail: (sku, days) => unwrap(request.get(`/ops/product/${sku}`, { params: { days } })),
  ads: params => unwrap(request.get('/ops/ads', { params })),
  selection: params => unwrap(request.get('/ops/selection', { params })),
  review: params => unwrap(request.get('/ops/review', { params })),
  meta: () => unwrap(request.get('/ops/meta')),
  quarantine: () => unwrap(request.get('/ops/quarantine')),
  inventory: params => unwrap(request.get('/ops/inventory', { params })),
  upload: (dataset, formData, replace) =>
    unwrap(request.post(`/data/upload/${dataset}?replace=${replace !== false}`, formData, { headers: { 'Content-Type': 'multipart/form-data' } })),
  uploadDemo: () => unwrap(request.post('/data/upload-demo')),
  templateUrl: dataset => `/api/data/template/${dataset}`,
};

/** 数据现状与数据治理：库里有什么 / 哪些是演示数据 / 一键清空 */
export const dataApi = {
  state: () => unwrap(request.get('/data/state')),
  datasets: () => unwrap(request.get('/data/datasets')),
  reset: tables => unwrap(request.post('/data/reset', { tables, confirm: 'CLEAR' })),
  upload: (dataset, formData, { replace = true, preview = false } = {}) =>
    unwrap(request.post(`/data/upload/${dataset}?replace=${replace}&preview=${preview}`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })),
};

/** 自助表分析：解构任意已上传的表（维度 × 指标交叉聚合） */
export const analysisApi = {
  datasets: () => unwrap(request.get('/analysis/datasets')),
  explore: payload => unwrap(request.post('/analysis/explore', payload)),
  distinct: params => unwrap(request.get('/analysis/distinct', { params })),
};

/** 数据管道：接入 → 自动计算 → 可视化发布 */
export const pipelineApi = {
  status: () => unwrap(request.get('/pipeline/status')),
  run: () => unwrap(request.post('/pipeline/run')),
  batches: params => unwrap(request.get('/pipeline/batches', { params })),
  logs: params => unwrap(request.get('/pipeline/logs', { params })),
  snapshots: params => unwrap(request.get('/metrics/snapshots', { params })),
};

/** 增长中枢：SKU 主线（选品 → 链接 → 达人 → 素材 → 视频） */
export const growthApi = {
  meta: () => unwrap(request.get('/growth/meta')),
  overview: params => unwrap(request.get('/growth/overview', { params })),
  chain: code => unwrap(request.get(`/growth/sku/${encodeURIComponent(code)}/chain`)),
  page: (module, params) => unwrap(request.get(`/growth/${module}/page`, { params })),
  create: (module, data) => unwrap(request.post(`/growth/${module}`, data)),
  update: (module, id, data) => unwrap(request.put(`/growth/${module}/${id}`, data)),
  remove: (module, id) => unwrap(request.delete(`/growth/${module}/${id}`)),
};
