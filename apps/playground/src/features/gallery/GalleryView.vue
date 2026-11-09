<script setup lang="ts">
import { computed } from 'vue';

import StatusBadge from '../../components/StatusBadge.vue';
import { KIND_LABELS, MATURITY_LABELS, RUNTIME_LABELS, runtimeTone } from '../../catalog/format';
import { catalog, catalogStats } from '../../catalog/registry';
import { experimentHref } from '../../router';

const runnableCount = computed(() => catalogStats.runnable);
const visualApprovedCount = computed(() => catalogStats.visualApproved);
</script>

<template>
  <div class="page gallery-page">
    <section class="hero">
      <p class="eyebrow">STAGE 1 · FOUNDATION</p>
      <h1>CesiumJS 视觉实验库</h1>
      <p class="hero-lede">
        视觉优先的 CesiumJS 实验环境。每个已登记实验都有公开档案，运行状态与成熟度分开标注；
        这里先验证真实渲染链路，不冒充视觉复现成果。
      </p>
    </section>

    <section class="notice" role="note" aria-label="当前阶段说明">
      <span class="notice-mark" aria-hidden="true">!</span>
      <div>
        <strong>S2-001 已通过用户视觉验收。</strong>
        <p>
          <em>Earth Network Convergence</em> 已标记为 Visual
          Approved；后续封装或通用化仍需用户明确批准。 Smoke Test 仍只是工程验证，不是视觉成果。
        </p>
      </div>
    </section>

    <section class="stats" aria-label="实验统计">
      <div class="stat">
        <span class="stat-value">{{ catalogStats.total }}</span>
        <span class="stat-label">已登记实验</span>
      </div>
      <div class="stat">
        <span class="stat-value">{{ runnableCount }}</span>
        <span class="stat-label">可运行</span>
      </div>
      <div class="stat">
        <span class="stat-value">{{ visualApprovedCount }}</span>
        <span class="stat-label">Visual Approved</span>
      </div>
    </section>

    <section aria-labelledby="registry-heading">
      <div class="section-heading">
        <h2 id="registry-heading">登记档案</h2>
        <p>未完成或不可运行的实验也会显示真实状态，不会被隐藏。</p>
      </div>

      <div class="experiment-grid">
        <article
          v-for="entry in catalog"
          :key="entry.metadata.id"
          class="experiment-card"
          data-testid="experiment-card"
          :data-runtime="entry.metadata.runtimeStatus"
          :data-maturity="entry.metadata.maturity"
        >
          <div class="card-badges">
            <StatusBadge :label="KIND_LABELS[entry.metadata.kind]" tone="info" />
            <StatusBadge
              :label="RUNTIME_LABELS[entry.metadata.runtimeStatus]"
              :tone="runtimeTone(entry.metadata.runtimeStatus)"
            />
          </div>

          <h3>{{ entry.metadata.title }}</h3>
          <p class="card-summary">{{ entry.metadata.summary }}</p>

          <ul class="tag-list" aria-label="标签">
            <li v-for="tag in entry.metadata.tags" :key="tag">{{ tag }}</li>
          </ul>

          <div class="card-footer">
            <span class="maturity">{{ MATURITY_LABELS[entry.metadata.maturity] }}</span>
            <a
              class="text-link"
              :href="experimentHref(entry.metadata.id)"
              :aria-label="`查看 ${entry.metadata.title} 详情`"
            >
              {{
                entry.metadata.maturity === 'visual-approved' ? '查看已批准 Showcase' : '查看详情'
              }}
              <span aria-hidden="true">→</span>
            </a>
          </div>
        </article>
      </div>
    </section>

    <section class="registry-note">
      <h2>登记规则</h2>
      <p>
        元数据与运行入口分开维护。没有运行入口的档案仍然公开可见；只有经过人工登记、通过构建检查的入口才会被
        Playground 动态导入。运行状态来自元数据声明，最近一次本地检查结果记录在实验详情页。
      </p>
    </section>
  </div>
</template>
