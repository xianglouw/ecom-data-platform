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

  onMounted(() => {
    render();
    window.addEventListener('resize', resize);
  });
  watch(getOption, render, { deep: true });
  onBeforeUnmount(() => {
    window.removeEventListener('resize', resize);
    if (chart) { chart.dispose(); chart = null; }
  });

  return { el, render, getChart: () => chart };
}

export const fmtMoney = n => '$' + (n == null ? '—' : Number(n).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
export const fmtNum = n => (n == null ? '—' : Number(n).toLocaleString('zh-CN'));
export const fmtPct = n => (n == null ? '—' : (n * 100).toFixed(1) + '%');
