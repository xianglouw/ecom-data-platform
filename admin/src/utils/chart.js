import * as echarts from 'echarts';
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';

/**
 * 全局深色主题：注册一次，所有图表 init 时传入 'tk' 即可统一适配深色底。
 * 避免逐个页面改 axisLabel / tooltip / 配色。
 */
echarts.registerTheme('tk', {
  color: ['#25F4EE', '#FE2C55', '#7C5CFF', '#00E6A8', '#FFB020', '#4FC3F7', '#FF7AC6', '#5FFBF1'],
  backgroundColor: 'transparent',
  textStyle: { color: '#A5A5B8' },
  title: { textStyle: { color: '#F2F2F7', fontWeight: 600 } },
  legend: { textStyle: { color: '#A5A5B8' } },
  tooltip: {
    backgroundColor: 'rgba(18,18,27,.96)',
    borderColor: 'rgba(255,255,255,.14)',
    textStyle: { color: '#F2F2F7' },
    extraCssText: 'backdrop-filter:blur(8px);border-radius:10px;box-shadow:0 8px 28px -10px rgba(0,0,0,.9);',
  },
  categoryAxis: {
    axisLine: { lineStyle: { color: 'rgba(255,255,255,.18)' } },
    axisTick: { show: false },
    axisLabel: { color: '#8B8B9E' },
    splitLine: { lineStyle: { color: 'rgba(255,255,255,.06)' } },
  },
  valueAxis: {
    axisLine: { show: false },
    axisTick: { show: false },
    axisLabel: { color: '#8B8B9E' },
    splitLine: { lineStyle: { color: 'rgba(255,255,255,.07)' } },
  },
});

/** 在 ref 元素上渲染 ECharts，支持点击回调与自适应 */
export function useChart(getOption, onClick) {
  const el = ref(null);
  let chart = null;

  const render = () => {
    if (!el.value) return;
    if (!chart) chart = echarts.init(el.value, 'tk');
    chart.setOption(getOption(), true);
    if (onClick) {
      chart.off('click');
      chart.on('click', onClick);
    }
  };

  const resize = () => chart && chart.resize();
  let ro = null;

  onMounted(() => {
    render();
    window.addEventListener('resize', resize);
    // 侧边栏折叠等局部尺寸变化不会触发 window.resize，用 ResizeObserver 兜底重绘
    if (typeof ResizeObserver !== 'undefined' && el.value) {
      ro = new ResizeObserver(resize);
      ro.observe(el.value);
    }
  });
  watch(getOption, render, { deep: true });
  onBeforeUnmount(() => {
    window.removeEventListener('resize', resize);
    if (ro) { ro.disconnect(); ro = null; }
    if (chart) { chart.dispose(); chart = null; }
  });

  return { el, render, getChart: () => chart };
}

export const fmtMoney = n => '$' + (n == null ? '—' : Number(n).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
export const fmtNum = n => (n == null ? '—' : Number(n).toLocaleString('zh-CN'));
export const fmtPct = n => (n == null ? '—' : (n * 100).toFixed(1) + '%');
