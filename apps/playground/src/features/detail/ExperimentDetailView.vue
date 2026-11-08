<script setup lang="ts">
import { computed } from 'vue';

import StatusBadge from '../../components/StatusBadge.vue';
import {
  KIND_LABELS,
  MATURITY_LABELS,
  REFERENCE_LABELS,
  RUNTIME_LABELS,
  runtimeTone,
} from '../../catalog/format';
import { getExperiment } from '../../catalog/registry';
import type { RuntimeStatus } from '../../catalog/types';
import ViewerHost from '../viewer/ViewerHost.vue';

const props = defineProps<{ experimentId: string }>();

const entry = computed(() => getExperiment(props.experimentId));
const canRun = computed(() => {
  const current = entry.value;
  return (
    current !== undefined && current.metadata.runtimeStatus === 'runnable' && current.load !== null
  );
});
const revision = __GIT_REVISION__;

function runtimeExplanation(status: RuntimeStatus): string {
  switch (status) {
    case 'not-implemented':
      return '该实验尚未实现运行入口，仅保留公开档案。收到视觉参考并完成实现后，才会注册可运行场景。';
    case 'unavailable':
      return '该实验此前登记为可运行，但当前入口不可用或检查未通过。档案保留，运行状态如实展示。';
    case 'error':
      return '最近一次运行检查报告错误。请查看验证记录与已知限制；修复前不会提供运行入口。';
    case 'runnable':
      return '元数据声明可运行，但 Playground 尚未注册运行入口。这属于登记配置问题，请检查 catalog 的运行时加载表。';
  }
}

function referenceNote(visibility: 'public' | 'private' | 'none'): string {
  switch (visibility) {
    case 'public':
      return '参考素材可公开查看。';
    case 'private':
      return '参考素材不公开；本页不提供原文件。';
    case 'none':
      return '当前没有参考素材。';
  }
}
</script>

<template>
  <div class="page detail-page" data-testid="experiment-detail">
    <a class="back-link" href="#/">← 返回 Gallery</a>

    <section v-if="!entry" class="not-found" role="alert">
      <p class="eyebrow">NOT FOUND</p>
      <h1>找不到实验</h1>
      <p>
        没有登记 ID 为 <code>{{ experimentId }}</code> 的实验。它可能尚未登记，或链接写错了。
      </p>
      <a class="button" href="#/">回到 Gallery</a>
    </section>

    <template v-else>
      <header class="detail-header">
        <div class="card-badges">
          <StatusBadge :label="KIND_LABELS[entry.metadata.kind]" tone="info" />
          <StatusBadge
            :label="RUNTIME_LABELS[entry.metadata.runtimeStatus]"
            :tone="runtimeTone(entry.metadata.runtimeStatus)"
          />
          <StatusBadge :label="MATURITY_LABELS[entry.metadata.maturity]" tone="muted" />
        </div>
        <h1>{{ entry.metadata.title }}</h1>
        <p class="hero-lede">{{ entry.metadata.summary }}</p>
      </header>

      <section v-if="canRun" class="viewer-section" aria-labelledby="live-scene-heading">
        <div class="section-heading">
          <h2 id="live-scene-heading">Live scene</h2>
          <p>实际 CesiumJS WebGL 输出 · 不是截图或 AI 概念图</p>
        </div>
        <ViewerHost :experiment-id="entry.metadata.id" />
      </section>

      <section v-else class="empty-scene" aria-labelledby="no-scene-heading">
        <div class="card-badges">
          <StatusBadge
            :label="RUNTIME_LABELS[entry.metadata.runtimeStatus]"
            :tone="runtimeTone(entry.metadata.runtimeStatus)"
          />
        </div>
        <h2 id="no-scene-heading">该实验暂无运行场景</h2>
        <p>{{ runtimeExplanation(entry.metadata.runtimeStatus) }}</p>
      </section>

      <section class="notes" aria-labelledby="notes-heading">
        <div class="section-heading">
          <h2 id="notes-heading">实现说明</h2>
          <p>面向非程序员的简明说明；更完整的工程记录见实验目录中的 README。</p>
        </div>

        <div class="notes-grid">
          <article class="note-card">
            <h3>它做了什么</h3>
            <p>{{ entry.metadata.notes.overview }}</p>
          </article>
          <article class="note-card">
            <h3>技术路线</h3>
            <p>{{ entry.metadata.notes.technology }}</p>
          </article>
          <article class="note-card">
            <h3>已知限制</h3>
            <p>{{ entry.metadata.notes.limitations }}</p>
          </article>
        </div>
      </section>

      <section class="detail-meta" aria-labelledby="meta-heading">
        <div class="section-heading">
          <h2 id="meta-heading">档案与验证</h2>
          <p>运行状态是元数据声明；验证记录是最近一次实际本地检查的结果，两者分开阅读。</p>
        </div>

        <dl class="metadata-grid">
          <div>
            <dt>实验 ID</dt>
            <dd>
              <code>{{ entry.metadata.id }}</code>
            </dd>
          </div>
          <div>
            <dt>成熟度</dt>
            <dd>{{ MATURITY_LABELS[entry.metadata.maturity] }}</dd>
          </div>
          <div>
            <dt>运行状态</dt>
            <dd>{{ RUNTIME_LABELS[entry.metadata.runtimeStatus] }}</dd>
          </div>
          <div>
            <dt>参考可见性</dt>
            <dd>{{ REFERENCE_LABELS[entry.metadata.referenceVisibility] }}</dd>
          </div>
          <div>
            <dt>构建 revision</dt>
            <dd>
              <code>{{ revision }}</code>
            </dd>
          </div>
          <div>
            <dt>运行入口</dt>
            <dd>
              <code>{{ entry.metadata.entry ?? '未注册' }}</code>
            </dd>
          </div>
        </dl>

        <div
          class="verification-note"
          :class="{ 'verification-note--pending': !entry.metadata.verification }"
        >
          <template v-if="entry.metadata.verification">
            <strong>本地验证记录</strong>
            <p>
              最近一次检查：{{ entry.metadata.verification.checkedAt }} ·
              {{ entry.metadata.verification.environment }}
            </p>
            <p>
              证据位置：<code>{{ entry.metadata.verification.evidence }}</code>
            </p>
          </template>
          <template v-else>
            <strong>尚未记录验证证据</strong>
            <p>
              当前运行状态来自元数据声明，不能视为已经通过浏览器或视觉检查。修复 /
              验证后会补充检查日期、环境与证据位置。
            </p>
          </template>
        </div>

        <p class="reference-note">{{ referenceNote(entry.metadata.referenceVisibility) }}</p>
      </section>

      <a class="back-link back-link--bottom" href="#/">← 返回 Gallery</a>
    </template>
  </div>
</template>
