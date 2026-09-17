<template>
  <div class="login-page">
    <div class="login-card">
      <div class="brand">
        <BrandLogo :size="46" />
        <div>
          <h2>电商运营数据中台</h2>
          <p class="muted">手机号 + 验证码 · 每个账号拥有独立的数据空间</p>
        </div>
      </div>

      <el-tabs v-model="mode" stretch @tab-change="onSwitchMode">
        <el-tab-pane label="登录" name="login" />
        <el-tab-pane label="注册新账号" name="register" />
      </el-tabs>

      <el-form :model="form" size="large" @submit.prevent>
        <el-form-item>
          <el-input v-model="form.mobile" placeholder="请输入手机号" maxlength="11" clearable />
        </el-form-item>

        <el-form-item v-if="mode === 'register'">
          <el-input v-model="form.nickname" placeholder="昵称（可选，默认取手机号后四位）" maxlength="20" clearable />
        </el-form-item>

        <el-form-item>
          <div class="code-row">
            <el-input v-model="form.code" placeholder="6 位验证码" maxlength="6" clearable @keyup.enter="onSubmit" />
            <el-button :disabled="left > 0" :loading="sending" class="code-btn" @click="onSendCode">
              {{ left > 0 ? `${left} 秒后重发` : '获取验证码' }}
            </el-button>
          </div>
        </el-form-item>

        <el-button type="primary" size="large" style="width:100%" :loading="loading" @click="onSubmit">
          {{ mode === 'login' ? '登 录' : '注 册 并 登 录' }}
        </el-button>

        <el-button size="large" style="width:100%;margin:10px 0 0" :loading="demoLoading" @click="onDemoLogin">
          先逛逛演示账号（含示例数据，无需注册）
        </el-button>
      </el-form>

      <el-alert v-if="devCode" type="success" :closable="false" style="margin-top:14px">
        <div>演示验证码：<b style="font-size:16px;letter-spacing:2px">{{ devCode }}</b>（5 分钟内有效）</div>
        <div class="muted" style="font-size:12px;margin-top:4px">{{ demoTip }}</div>
      </el-alert>

      <div class="muted tips">
        <template v-if="mode === 'register'">
          注册后系统会为你创建一个<b>空白的数据空间</b>，上传你的销售 / 库存 / 广告表后即可看到分析结果，账号之间数据互不可见。
        </template>
        <template v-else>
          首次使用请先切换到「注册新账号」，用手机号 + 验证码创建你的账号。
        </template>
      </div>
    </div>
  </div>
</template>

<script setup>
import { onBeforeUnmount, ref } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { authApi } from '../api/index.js';
import BrandLogo from '../components/BrandLogo.vue';

const router = useRouter();
const mode = ref('login');
const form = ref({ mobile: '', code: '', nickname: '' });
const loading = ref(false);
const demoLoading = ref(false);
const sending = ref(false);
const left = ref(0);
const devCode = ref('');
const demoTip = ref('');
let timer = null;

const MOBILE_RE = /^1[3-9]\d{9}$/;

function startCountdown(seconds) {
  left.value = Number(seconds) || 60;
  if (timer) clearInterval(timer);
  timer = setInterval(() => {
    left.value -= 1;
    if (left.value <= 0) {
      clearInterval(timer);
      timer = null;
    }
  }, 1000);
}

function onSwitchMode() {
  form.value.code = '';
  devCode.value = '';
}

async function onSendCode() {
  if (!MOBILE_RE.test(form.value.mobile)) return ElMessage.warning('请输入正确的 11 位手机号');
  sending.value = true;
  try {
    const d = await authApi.sendCode({ mobile: form.value.mobile, scene: mode.value });
    devCode.value = d.dev_code || '';
    demoTip.value = d.tip || '';
    startCountdown(d.cooldown || 60);
    ElMessage.success(d.mode === 'demo' ? '验证码已生成，请查看下方提示' : '验证码已发送，请查收短信');
  } catch (e) {
    ElMessage.error(e.message || '获取验证码失败');
  } finally {
    sending.value = false;
  }
}

/** 一键进入公开演示账号：首次会自动灌入示例数据，体验者无需注册 */
async function onDemoLogin() {
  demoLoading.value = true;
  try {
    const d = await authApi.demoLogin();
    enter(d, '已进入演示账号' + (d.seed?.seeded ? '，示例数据加载完成' : ''));
  } catch (e) {
    ElMessage.error(e.message || '演示账号进入失败');
  } finally {
    demoLoading.value = false;
  }
}

function enter(d, msg) {
  localStorage.setItem('token', d.token);
  localStorage.setItem('nickname', d.user.nickname || '');
  localStorage.setItem('mobile', d.user.mobile || '');
  ElMessage.success(msg);
  router.push('/dashboard');
}

async function onSubmit() {
  const f = form.value;
  if (!MOBILE_RE.test(f.mobile)) return ElMessage.warning('请输入正确的 11 位手机号');
  if (!f.code) return ElMessage.warning('请输入验证码');
  loading.value = true;
  try {
    const d =
      mode.value === 'register'
        ? await authApi.register({ mobile: f.mobile, code: f.code, nickname: f.nickname })
        : await authApi.login({ mobile: f.mobile, code: f.code });
    enter(d, mode.value === 'register' ? '注册成功，已为你创建空白数据空间' : '登录成功');
  } catch (e) {
    ElMessage.error(e.message || '操作失败');
  } finally {
    loading.value = false;
  }
}

onBeforeUnmount(() => {
  if (timer) clearInterval(timer);
});
</script>

<style scoped>
.login-page {
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #e0f2fe, #eef2ff);
}
.login-card {
  width: 420px;
  background: #fff;
  border-radius: 14px;
  padding: 30px 28px 24px;
  box-shadow: 0 10px 40px rgba(15, 23, 42, 0.12);
}
.brand {
  display: flex;
  gap: 12px;
  align-items: center;
  margin-bottom: 16px;
}
h2 {
  margin: 0;
  font-size: 18px;
}
.muted {
  color: #64748b;
  font-size: 13px;
}
.code-row {
  display: flex;
  gap: 8px;
  width: 100%;
}
.code-btn {
  width: 128px;
  flex: none;
}
.tips {
  margin-top: 14px;
  font-size: 12px;
  line-height: 1.8;
}
</style>
