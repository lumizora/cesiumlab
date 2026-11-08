<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';

import { detectWebGLSupport } from '../../cesium/webgl-support';
import { loadExperimentModule } from '../../experiments/loader';
import type { ExperimentCleanup } from '../../experiments/types';
import StatusBadge from '../../components/StatusBadge.vue';

const props = defineProps<{ experimentId: string }>();

type ViewerState = 'idle' | 'loading' | 'ready' | 'error' | 'unsupported';

const STATE_LABELS: Record<ViewerState, string> = {
  idle: '准备中',
  loading: '加载中',
  ready: 'Live',
  error: '运行错误',
  unsupported: 'WebGL 不可用',
};

const container = ref<HTMLElement | null>(null);
const state = ref<ViewerState>('idle');
const message = ref('');
const detail = ref('');

let cleanup: ExperimentCleanup | null = null;
let runToken = 0;
let runtimeFailure: unknown = null;
let disposed = false;

const stateLabel = computed(() => STATE_LABELS[state.value]);
const stateTone = computed(() =>
  state.value === 'ready'
    ? 'ok'
    : state.value === 'loading' || state.value === 'idle'
      ? 'muted'
      : 'danger',
);

function formatError(error: unknown): string {
  if (error instanceof Error) {
    return error.stack ?? `${error.name}: ${error.message}`;
  }
  if (typeof error === 'string') {
    return error;
  }
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

function disposeScene() {
  const current = cleanup;
  cleanup = null;
  if (current) {
    try {
      current();
    } catch (error) {
      console.error('[cesiumlab] Failed to release the experiment scene.', error);
    }
  }
  const host = container.value;
  if (host) {
    delete host.dataset.sceneReady;
    host.replaceChildren();
  }
}

function reportRuntimeError(error: unknown) {
  runtimeFailure = error;
  state.value = 'error';
  message.value = '场景运行时报告错误，已停止渲染并尝试释放资源。';
  detail.value = formatError(error);

  // Do not destroy the Viewer from inside a render/context-loss callback.
  window.setTimeout(() => {
    if (!disposed && state.value === 'error') {
      disposeScene();
    }
  }, 0);
}

async function loadScene() {
  const token = ++runToken;
  disposeScene();
  runtimeFailure = null;
  message.value = '';
  detail.value = '';
  state.value = 'loading';

  await nextTick();
  if (token !== runToken || disposed) {
    return;
  }

  const support = detectWebGLSupport();
  if (!support.supported) {
    state.value = 'unsupported';
    message.value = support.reason ?? '当前浏览器无法创建 WebGL 上下文。';
    return;
  }

  const host = container.value;
  if (!host) {
    state.value = 'error';
    message.value = '场景容器尚未准备好。';
    return;
  }

  try {
    const module = await loadExperimentModule(props.experimentId);
    if (token !== runToken || disposed) {
      return;
    }

    const result = await module.mount({
      container: host,
      onError: (error) => {
        if (token === runToken && !disposed) {
          reportRuntimeError(error);
        }
      },
    });

    if (token !== runToken || disposed) {
      if (typeof result === 'function') {
        result();
      }
      return;
    }

    cleanup = typeof result === 'function' ? result : null;

    if (runtimeFailure) {
      disposeScene();
      return;
    }

    state.value = 'ready';
  } catch (error) {
    if (token !== runToken || disposed) {
      return;
    }
    state.value = 'error';
    message.value = '场景加载失败。实验入口可能缺失、抛出异常或未能完成初始化。';
    detail.value = formatError(error);
    disposeScene();
  }
}

function retry() {
  void loadScene();
}

function handlePageHide() {
  if (!disposed) {
    state.value = 'idle';
    disposeScene();
  }
}

function handlePageShow(event: PageTransitionEvent) {
  if (event.persisted && !disposed) {
    void loadScene();
  }
}

onMounted(() => {
  window.addEventListener('pagehide', handlePageHide);
  window.addEventListener('pageshow', handlePageShow);
  void loadScene();
});

watch(
  () => props.experimentId,
  () => {
    void loadScene();
  },
);

onBeforeUnmount(() => {
  disposed = true;
  runToken += 1;
  window.removeEventListener('pagehide', handlePageHide);
  window.removeEventListener('pageshow', handlePageShow);
  disposeScene();
});
</script>

<template>
  <div
    class="viewer-host"
    data-testid="viewer-host"
    :data-state="state"
    :aria-busy="state === 'loading' || state === 'idle'"
  >
    <div
      ref="container"
      class="viewer-canvas"
      role="region"
      :aria-label="`${experimentId} 的 CesiumJS 场景画布`"
    ></div>

    <div class="viewer-toolbar">
      <StatusBadge :label="stateLabel" :tone="stateTone" />
      <button v-if="state === 'ready'" type="button" class="button button--small" @click="retry">
        重新加载场景
      </button>
    </div>

    <div
      v-if="state === 'idle' || state === 'loading'"
      class="viewer-overlay"
      role="status"
      aria-live="polite"
    >
      <span class="spinner" aria-hidden="true"></span>
      <p>正在加载 CesiumJS 场景…</p>
      <p class="hint">首次加载会获取本地 Workers、Assets 与 Widgets 资源。</p>
    </div>

    <div
      v-else-if="state === 'error' || state === 'unsupported'"
      class="viewer-overlay viewer-overlay--error"
      role="alert"
    >
      <h3>{{ state === 'unsupported' ? '当前环境不支持 WebGL 渲染' : '场景加载失败' }}</h3>
      <p>{{ message }}</p>
      <pre v-if="detail" class="error-detail">{{ detail }}</pre>
      <button type="button" class="button" @click="retry">重试</button>
      <p class="hint">
        如果问题持续，请检查浏览器的硬件加速 / WebGL 设置，并查看开发者控制台日志。
      </p>
    </div>

    <div v-else-if="state === 'ready'" class="viewer-hint" aria-hidden="true">
      拖动旋转 · 滚轮缩放 · 右键倾斜
    </div>
  </div>
</template>
