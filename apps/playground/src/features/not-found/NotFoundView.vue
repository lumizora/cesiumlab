<script setup lang="ts">
defineProps<{ path: string }>();
</script>

<template>
  <div class="page not-found" data-testid="route-not-found">
    <p class="eyebrow">404</p>
    <h1>页面不存在</h1>
    <p>
      没有匹配 <code>#{{ path }}</code> 的页面。请回到 Gallery 继续浏览。
    </p>
    <a class="button" href="#/">回到 Gallery</a>
  </div>
</template>
