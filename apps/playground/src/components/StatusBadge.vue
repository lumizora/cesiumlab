<script setup lang="ts">
defineProps<{
  label: string;
  tone: 'ok' | 'warn' | 'muted' | 'danger' | 'info';
}>();
</script>

<template>
  <span class="badge" :class="`badge--${tone}`">{{ label }}</span>
</template>
