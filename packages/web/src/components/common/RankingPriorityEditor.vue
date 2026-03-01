<template>
  <section class="stack ranking-priority-group">
    <div class="row ranking-priority-group-head">
      <h6 class="ranking-priority-group-title">{{ props.title }}</h6>
      <HelpTip v-if="props.helpText" :text="props.helpText" />
    </div>
    <PriorityDragSelector
      v-model="model"
      :options="props.options"
      :disabled="props.disabled"
      :min-active="props.minActive"
      layout="single"
      :active-title="props.activeTitle"
      :inactive-title="props.inactiveTitle"
      :inactive-empty-text="props.inactiveEmptyText"
      :active-action-label="props.activeActionLabel"
    />
  </section>
</template>

<script setup lang="ts">
import HelpTip from '@/components/common/HelpTip.vue'
import PriorityDragSelector from '@/components/common/PriorityDragSelector.vue'

type PriorityOption = {
  value: string
  label: string
  description?: string
}

const props = withDefaults(
  defineProps<{
    options: PriorityOption[]
    title: string
    helpText?: string
    disabled?: boolean
    minActive?: number
    activeTitle?: string
    inactiveTitle?: string
    inactiveEmptyText?: string
    activeActionLabel?: string
  }>(),
  {
    helpText: '',
    disabled: false,
    minActive: 1,
    activeTitle: '使用する基準',
    inactiveTitle: '不使用',
    inactiveEmptyText: '不使用の指標はありません。',
    activeActionLabel: '除外',
  }
)

const model = defineModel<string[]>({ required: true })
</script>

<style scoped>
.ranking-priority-group {
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-surface);
  padding: var(--space-3);
  gap: var(--space-3);
}

.ranking-priority-group-head {
  align-items: center;
  justify-content: flex-start;
  gap: var(--space-2);
  padding-bottom: var(--space-1);
  border-bottom: 1px solid var(--color-border);
}

.ranking-priority-group-title {
  margin: 0;
  font-size: 1rem;
  font-weight: 700;
  color: var(--color-text);
}
</style>
