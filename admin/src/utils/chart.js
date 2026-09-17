import * as echarts from 'echarts';
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';

/** 在 ref 元素上渲染 ECharts，支持点击回调与自适应 */
export function useChart(getOption, onClick) {
  const el = ref(null);
  let chart = null;

  const render = () => {
    if (!el.value) return;
    if (!chart) chart = echarts.init(el.value);
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
