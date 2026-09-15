import axios from 'axios';

const request = axios.create({
  baseURL: '/api',
  timeout: 30000,
});

/** 登录态失效时统一清理并回到登录页（避免在每个页面重复处理） */
function toLogin() {
  localStorage.removeItem('token');
  localStorage.removeItem('nickname');
  localStorage.removeItem('mobile');
  if (!location.hash.startsWith('#/login')) location.hash = '#/login';
}

request.interceptors.request.use((cfg) => {
  const token = localStorage.getItem('token');
  if (token) {
    // 优先 x-token：发布平台的入口网关会覆盖标准 Authorization 头，自定义头可原样穿透
    cfg.headers['x-token'] = token;
    cfg.headers.Authorization = `Bearer ${token}`;
  }
  return cfg;
});

// 统一响应处理：{ code: '00000', msg, data }
request.interceptors.response.use(
  (res) => {
    const body = res.data;
    if (body && body.code && body.code !== '00000') {
      // A0401 = 未登录 / 登录已过期
      if (body.code === 'A0401') toLogin();
      return Promise.reject(new Error(body.msg || '请求失败'));
    }
    return body;
  },
  (err) => Promise.reject(err)
);

export default request;
