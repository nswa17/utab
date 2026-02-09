<template>
  <div class="loading">
    <span class="dot" />
    <span>{{ $t('読み込み中...') }}</span>
  </div>
</template>

<script setup lang="ts"></script>

<style scoped>
.loading {
  display: flex;
  gap: 8px;
  align-items: center;
  color: #6b7280;
}

.dot {
  width: 8px;
  height: 8px;
  border-radius: 999px;
  background: #2563eb;
  animation: pulse 1s infinite;
}

@keyframes pulse {
  0% {
    opacity: 0.2;
  }
  50% {
    opacity: 1;
  }
  100% {
    opacity: 0.2;
  }
}
</style>
