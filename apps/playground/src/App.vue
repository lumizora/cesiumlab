<script setup lang="ts">
import { onErrorCaptured, ref, watch } from 'vue';

import AppFooter from './app/AppFooter.vue';
import AppHeader from './app/AppHeader.vue';
import ExperimentDetailView from './features/detail/ExperimentDetailView.vue';
import GalleryView from './features/gallery/GalleryView.vue';
import NotFoundView from './features/not-found/NotFoundView.vue';
import { useHashRoute } from './router';

const { route } = useHashRoute();
const fatalError = ref<string | null>(null);

onErrorCaptured((error) => {
  console.error('[cesiumlab] Unhandled UI error.', error);
  fatalError.value = error instanceof Error ? error.message : String(error);
  return false;
});

watch(route, () => {
  fatalError.value = null;
});

function reloadPage() {
  window.location.reload();
}
</script>

<template>
  <a class="skip-link" href="#main">跳到主要内容</a>

  <div class="app-shell">
    <AppHeader :route="route" />

    <main id="main" tabindex="-1">
      <div v-if="fatalError" class="fatal-error" role="alert">
        <p class="eyebrow">UI ERROR</p>
        <h1>页面组件发生未处理错误</h1>
        <p>导航仍可用；你也可以重新加载页面恢复初始状态。</p>
        <pre class="error-detail">{{ fatalError }}</pre>
        <div class="fatal-actions">
          <a class="button" href="#/">回到 Gallery</a>
          <button type="button" class="button button--ghost" @click="reloadPage">
            重新加载页面
          </button>
        </div>
      </div>

      <GalleryView v-else-if="route.name === 'gallery'" />
      <ExperimentDetailView v-else-if="route.name === 'experiment'" :experiment-id="route.id" />
      <NotFoundView v-else :path="route.path" />
    </main>

    <AppFooter />
  </div>
</template>
