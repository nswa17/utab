<template>
  <div class="row publish-switch-status-row">
    <Button
      v-if="showPriorRoundsHideButton"
      variant="ghost"
      class="prior-rounds-hide-button"
      size="sm"
      :disabled="effectiveBusy || priorRoundsHideDisabled"
      @click="$emit('hide-prior-rounds')"
    >
      {{ priorRoundsHideLabel }}
    </Button>

    <label
      v-if="showBreakRoundSwitch"
      class="row publish-switch-inline publish-switch-inline-compact"
    >
      <span class="publish-switch-label">{{ breakRoundLabel }}</span>
      <ToggleSwitch
        class="publish-switch-toggle"
        :model-value="breakRoundEnabled"
        :disabled="effectiveBusy || breakRoundDisabled"
        :aria-label="breakRoundLabel"
        @update:model-value="(checked) => $emit('update:break-round-enabled', checked)"
      />
    </label>

    <label class="row publish-switch-inline publish-switch-inline-compact">
      <span class="publish-switch-label">{{ motionLabel }}</span>
      <ToggleSwitch
        class="publish-switch-toggle"
        :model-value="motionOpened"
        :disabled="effectiveBusy || motionDisabled"
        :aria-label="motionLabel"
        @update:model-value="(checked) => $emit('update:motion-opened', checked)"
      />
    </label>

    <label class="row publish-switch-inline publish-switch-inline-compact">
      <span class="publish-switch-label">{{ teamAllocationLabel }}</span>
      <ToggleSwitch
        class="publish-switch-toggle"
        :model-value="teamAllocationOpened"
        :disabled="effectiveBusy || teamAllocationDisabled"
        :aria-label="teamAllocationLabel"
        @update:model-value="(checked) => $emit('update:team-allocation-opened', checked)"
      />
    </label>

    <label class="row publish-switch-inline publish-switch-inline-compact">
      <span class="publish-switch-label">{{ adjudicatorAllocationLabel }}</span>
      <ToggleSwitch
        class="publish-switch-toggle"
        :model-value="adjudicatorAllocationOpened"
        :disabled="effectiveBusy || adjudicatorAllocationDisabled"
        :aria-label="adjudicatorAllocationLabel"
        @update:model-value="(checked) => $emit('update:adjudicator-allocation-opened', checked)"
      />
    </label>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import Button from '@/components/common/Button.vue'
import ToggleSwitch from '@/components/common/ToggleSwitch.vue'

const props = withDefaults(
  defineProps<{
    busy?: boolean
    showPriorRoundsHideButton?: boolean
    priorRoundsHideDisabled?: boolean
    priorRoundsHideLabel?: string
    showBreakRoundSwitch?: boolean
    breakRoundEnabled?: boolean
    breakRoundDisabled?: boolean
    breakRoundLabel?: string
    motionOpened: boolean
    motionDisabled?: boolean
    motionLabel: string
    teamAllocationOpened: boolean
    teamAllocationDisabled?: boolean
    teamAllocationLabel: string
    adjudicatorAllocationOpened: boolean
    adjudicatorAllocationDisabled?: boolean
    adjudicatorAllocationLabel: string
  }>(),
  {
    busy: false,
    showPriorRoundsHideButton: false,
    priorRoundsHideDisabled: false,
    priorRoundsHideLabel: '',
    showBreakRoundSwitch: false,
    breakRoundEnabled: false,
    breakRoundDisabled: false,
    breakRoundLabel: '',
    motionDisabled: false,
    teamAllocationDisabled: false,
    adjudicatorAllocationDisabled: false,
  }
)

defineEmits<{
  (event: 'update:break-round-enabled', value: boolean): void
  (event: 'update:motion-opened', value: boolean): void
  (event: 'update:team-allocation-opened', value: boolean): void
  (event: 'update:adjudicator-allocation-opened', value: boolean): void
  (event: 'hide-prior-rounds'): void
}>()

const effectiveBusy = computed(() => Boolean(props.busy))
</script>

<style scoped>
.publish-switch-label {
  color: var(--color-text);
  font-size: 13px;
  font-weight: 600;
  text-align: left;
}

.publish-switch-toggle {
  align-self: center;
}

.publish-switch-inline {
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
}

.publish-switch-inline-compact {
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  padding: 6px 8px;
  background: var(--color-surface-soft, var(--color-surface-muted));
}

.publish-switch-status-row {
  width: 100%;
  justify-content: flex-end;
  gap: var(--space-2);
  flex-wrap: wrap;
}

.prior-rounds-hide-button {
  border-color: #f59e0b;
  color: #9a3412;
  background: #fff7ed;
}

.prior-rounds-hide-button:hover:not(.is-disabled) {
  border-color: #d97706;
  color: #7c2d12;
  background: #ffedd5;
}
</style>
