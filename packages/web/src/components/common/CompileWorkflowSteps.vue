<template>
  <section class="workflow-steps" aria-label="compile workflow steps">
    <p class="muted small workflow-line">
      {{ $t('条件設定') }} -> {{ $t('プレビュー更新') }} -> {{ $t('集計結果保存') }}
      <span class="workflow-status" :class="{ warning: previewStale }">
        / {{ previewStale ? $t('設定変更により要再プレビュー') : canSave ? $t('保存可能') : previewReady ? $t('更新済み') : $t('未実行') }}
      </span>
    </p>
  </section>
</template>

<script setup lang="ts">
defineProps<{
  previewReady: boolean
  previewStale: boolean
  canSave: boolean
}>()
</script>

<style scoped>
.workflow-steps {
  margin: 0;
}

.workflow-line {
  margin: 0;
}

.workflow-status.warning {
  color: var(--color-warn);
}
</style>
