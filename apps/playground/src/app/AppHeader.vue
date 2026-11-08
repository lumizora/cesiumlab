<script setup lang="ts">
import { computed } from 'vue';

import type { Route } from '../router';

const props = defineProps<{ route: Route }>();

const isGallery = computed(() => props.route.name === 'gallery');
const revision = __GIT_REVISION__;
</script>

<template>
  <header class="site-header">
    <a class="brand" href="#/" aria-label="cesiumlab 首页">
      <span class="brand-mark" aria-hidden="true">C</span>
      <span class="brand-text">
        <strong>cesiumlab</strong>
        <small>visual CesiumJS lab</small>
      </span>
    </a>

    <nav class="site-nav" aria-label="主导航">
      <a href="#/" :aria-current="isGallery ? 'page' : undefined">Gallery</a>
    </nav>

    <span class="build-pill" title="构建时的 Git revision">rev {{ revision }}</span>
  </header>
</template>
