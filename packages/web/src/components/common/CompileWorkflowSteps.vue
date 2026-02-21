<template>
  <section class="card soft stack workflow-steps" aria-label="compile workflow steps">
    <h5>{{ $t('集計ワークフロー') }}</h5>
    <ol class="workflow-step-list">
      <li class="workflow-step is-active">
        <span class="workflow-step-index">1</span>
        <div class="stack tight">
          <strong>{{ $t('条件設定') }}</strong>
          <span class="muted small">{{ $t('対象ラウンドと集計オプションを確認します。') }}</span>
        </div>
      </li>
      <li class="workflow-step" :class="{ 'is-done': previewReady, 'is-stale': previewStale }">
        <span class="workflow-step-index">2</span>
        <div class="stack tight">
          <strong>{{ $t('プレビュー更新') }}</strong>
          <span class="muted small">
            {{ previewStale ? $t('設定変更により要再プレビュー') : previewReady ? $t('更新済み') : $t('未実行') }}
          </span>
        </div>
      </li>
      <li class="workflow-step" :class="{ 'is-done': canSave }">
        <span class="workflow-step-index">3</span>
        <div class="stack tight">
          <strong>{{ $t('スナップショット保存') }}</strong>
          <span class="muted small">{{ canSave ? $t('保存可能') : $t('プレビュー後に保存可能') }}</span>
        </div>
      </li>
    </ol>
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
  gap: var(--space-2);
}

.workflow-steps h5 {
  margin: 0;
}

.workflow-step-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: var(--space-2);
}

.workflow-step {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: var(--space-2);
  align-items: start;
  padding: var(--space-2);
  border-radius: var(--radius-sm);
  border: 1px solid var(--color-border);
  background: var(--color-surface);
}

.workflow-step-index {
  width: 22px;
  height: 22px;
  border-radius: 999px;
  border: 1px solid var(--color-border);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 600;
}

.workflow-step.is-done {
  border-color: #16a34a;
  background: rgba(22, 163, 74, 0.08);
}

.workflow-step.is-stale {
  border-color: #f59e0b;
  background: rgba(245, 158, 11, 0.1);
}
</style>
