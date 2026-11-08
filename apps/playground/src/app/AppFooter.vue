<script setup lang="ts">
const version = __APP_VERSION__;
const revision = __GIT_REVISION__;
</script>

<template>
  <footer class="site-footer">
    <p>cesiumlab · Stage 1 工程烟雾测试 · 非视觉验收成果</p>
    <p class="footer-meta">v{{ version }} · rev {{ revision }} · 无 Cesium ion Token 依赖</p>
  </footer>
</template>
