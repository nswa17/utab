<template>
  <section class="stack round-motion-editor">
    <Field :label="$t('モーション')" v-slot="{ id, describedBy }">
      <div class="row round-motion-row">
        <input v-model="draftMotion" :id="id" :aria-describedby="describedBy" type="text" />
        <Button size="sm" variant="secondary" :disabled="saveDisabled" @click="saveMotion">
          {{ $t('モーションを更新') }}
        </Button>
      </div>
    </Field>
    <div class="row round-motion-foot">
      <p class="muted small round-motion-saved">
        {{ $t('保存済みモーション: {motion}', { motion: savedMotionLabel }) }}
      </p>
      <div v-if="$slots.status" class="row round-motion-status">
        <slot name="status" />
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import Field from '@/components/common/Field.vue'
import Button from '@/components/common/Button.vue'
import { useRoundsStore } from '@/stores/rounds'
import {
  getRoundMotionDraft,
  setRoundMotionDraft,
  syncRoundMotionDraft,
} from '@/composables/useRoundMotionDrafts'

const props = withDefaults(
  defineProps<{
    tournamentId: string
    roundId: string
    savedMotion?: string
    disabled?: boolean
  }>(),
  {
    savedMotion: '',
    disabled: false,
  }
)

const roundsStore = useRoundsStore()
const { t } = useI18n({ useScope: 'global' })

const normalizedRoundId = computed(() => String(props.roundId ?? '').trim())
const normalizedSavedMotion = computed(() => String(props.savedMotion ?? ''))

watch(
  [normalizedRoundId, normalizedSavedMotion],
  ([roundId, savedMotion], [previousRoundId, previousSavedMotion]) => {
    if (!roundId) return
    if (previousRoundId !== roundId) {
      syncRoundMotionDraft(roundId, savedMotion, '')
      return
    }
    syncRoundMotionDraft(roundId, savedMotion, previousSavedMotion ?? '')
  },
  { immediate: true }
)

const draftMotion = computed({
  get() {
    return getRoundMotionDraft(normalizedRoundId.value, normalizedSavedMotion.value)
  },
  set(value: string) {
    setRoundMotionDraft(normalizedRoundId.value, value)
  },
})

const saveDisabled = computed(
  () => props.disabled || roundsStore.loading || normalizedRoundId.value.length === 0
)

const savedMotionLabel = computed(() =>
  normalizedSavedMotion.value.trim().length > 0 ? normalizedSavedMotion.value : t('未設定')
)

async function saveMotion() {
  if (!normalizedRoundId.value || !props.tournamentId) return
  const motion = draftMotion.value.trim()
  const updated = await roundsStore.updateRound({
    tournamentId: props.tournamentId,
    roundId: normalizedRoundId.value,
    motions: motion ? [motion] : [],
  })
  if (!updated) return
  const saved = Array.isArray(updated.motions) ? String(updated.motions[0] ?? '') : motion
  setRoundMotionDraft(normalizedRoundId.value, saved)
}
</script>

<style scoped>
.round-motion-row {
  align-items: center;
  gap: var(--space-2);
  flex-wrap: wrap;
}

.round-motion-row input {
  flex: 1 1 260px;
  margin-bottom: 0;
}

.round-motion-foot {
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
  flex-wrap: wrap;
}

.round-motion-saved {
  margin: 0;
}

.round-motion-status {
  gap: var(--space-2);
  flex-wrap: wrap;
}
</style>
