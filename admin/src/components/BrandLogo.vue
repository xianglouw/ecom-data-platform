<template>
  <span class="brand-logo" :class="{ animate }" :style="{ '--sz': size + 'px' }">
    <svg viewBox="0 0 64 64" fill="none" role="img" aria-label="Mall Ops 跨境电商运营数据中台">
      <defs>
        <clipPath :id="uid + '-globe'"><circle cx="32" cy="39" r="13" /></clipPath>
        <linearGradient :id="uid + '-blue'" x1="16" y1="20" x2="48" y2="54" gradientUnits="userSpaceOnUse">
          <stop offset="0" stop-color="#2563EB" />
          <stop offset="1" stop-color="#38BDF8" />
        </linearGradient>
      </defs>

      <!-- 双色错位副本（浅蓝，hover 时错位加大） -->
      <g class="glitch" transform="translate(2.6 2.6)" opacity=".45">
        <path d="M22.6 30a9.4 9.4 0 0 1 18.8 0" stroke="#60A5FA" stroke-width="4" stroke-linecap="round" />
        <circle cx="32" cy="39" r="13" stroke="#60A5FA" stroke-width="4" />
        <g :clip-path="`url(#${uid}-globe)`" stroke="#60A5FA" stroke-width="2.1" stroke-linecap="round">
          <ellipse cx="32" cy="39" rx="5" ry="13" />
          <path d="M17 39H47" /><path d="M17 32.5H47" /><path d="M17 45.5H47" />
        </g>
      </g>

      <!-- 主体：地球购物袋（蓝色） -->
      <g class="body">
        <path d="M22.6 30a9.4 9.4 0 0 1 18.8 0" :stroke="`url(#${uid}-blue)`" stroke-width="4" stroke-linecap="round" />
        <circle cx="32" cy="39" r="13" :stroke="`url(#${uid}-blue)`" stroke-width="4" fill="rgba(37,99,235,.10)" />
        <g :clip-path="`url(#${uid}-globe)`" :stroke="`url(#${uid}-blue)`" stroke-width="2.1" stroke-linecap="round" opacity=".9">
          <ellipse cx="32" cy="39" rx="5" ry="13" fill="none" />
          <path d="M17 39H47" /><path d="M17 32.5H47" /><path d="M17 45.5H47" />
        </g>
      </g>

      <!-- 上升箭头：破球而出，代表跨境增长 -->
      <g class="arrow" stroke="#1E40AF" stroke-width="4.2" stroke-linecap="round" stroke-linejoin="round" fill="none">
        <path d="M22 46 45 23" />
        <path d="M38 23h7v7" />
      </g>
    </svg>
  </span>
</template>

<script setup>
import { ref } from 'vue';

defineProps({ size: { type: Number, default: 34 }, animate: { type: Boolean, default: true } });
// 同页可能出现多个实例，用自增 uid 避免 SVG defs 的 id 冲突
let seq = 0;
const uid = ref('mo' + (++seq) + Math.random().toString(36).slice(2, 7));
</script>

<style scoped>
.brand-logo {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: none;
  line-height: 0;
}
.brand-logo svg { width: var(--sz); height: var(--sz); overflow: visible; }

.brand-logo .glitch,
.brand-logo .arrow {
  transition: transform .32s cubic-bezier(.22, 1, .36, 1);
}
.brand-logo.animate:hover .glitch { transform: translate(4.6px, 4.6px); }
.brand-logo.animate:hover .arrow { transform: translate(2px, -2px); }
.brand-logo.animate:hover svg { filter: drop-shadow(0 2px 6px rgba(37, 99, 235, .35)); }

@media (prefers-reduced-motion: reduce) {
  .brand-logo .glitch, .brand-logo .arrow { transition: none; }
  .brand-logo.animate:hover .glitch, .brand-logo.animate:hover .arrow { transform: translate(2.6px, 2.6px); }
}
</style>
