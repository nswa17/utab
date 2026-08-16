<template>
  <div class="stack round-option-editor">
    <section class="stack option-group">
      <div class="row option-group-head">
        <h6 class="option-group-title">{{ $t('ジャッジ評価設定') }}</h6>
        <HelpTip :text="$t('ジャッジ・チームのどちらから評価を受け付けるかを設定します。')" />
      </div>
      <div class="grid option-grid">
        <label class="row small option-item">
          <input v-model="evaluateFromAdjudicators" type="checkbox" :disabled="disabled" />
          <span>{{ $t('評価をジャッジから') }}</span>
          <HelpTip :text="$t('ジャッジからのフィードバック入力を有効にします。')" />
        </label>
        <label class="row small option-item">
          <input v-model="evaluateFromTeams" type="checkbox" :disabled="disabled" />
          <span>{{ $t('評価をチームから') }}</span>
          <HelpTip :text="$t('チームからのフィードバック入力を有効にします。')" />
        </label>
        <label class="row small option-item">
          <input v-model="chairsAlwaysEvaluated" type="checkbox" :disabled="disabled" />
          <span>{{ $t('チェアを常に評価') }}</span>
          <HelpTip :text="$t('チェアの評価入力を常に要求します。')" />
        </label>
        <div class="stack option-subgroup">
          <span class="muted small">{{ $t('判定提出を許可するジャッジ役割') }}</span>
          <label
            v-for="role in ballotSubmitterRoleOptions"
            :key="`ballot-submitter-${role.value}`"
            class="row small option-item option-item--nested"
          >
            <input
              type="checkbox"
              :checked="ballotSubmitterRoles.includes(role.value)"
              :disabled="disabled"
              @change="
                setBallotSubmitterRole(role.value, ($event.target as HTMLInputElement).checked)
              "
            />
            <span>{{ role.label }}</span>
            <HelpTip :text="role.help" />
          </label>
        </div>
        <Field :label="$t('チーム内の評価者')">
          <template #default="{ id, describedBy }">
            <select
              v-model="evaluatorInTeam"
              :id="id"
              :aria-describedby="describedBy"
              :disabled="disabled"
            >
              <option value="team">{{ $t('チーム') }}</option>
              <option value="speaker">{{ $t('スピーカー') }}</option>
            </select>
          </template>
          <template #label-suffix>
            <HelpTip :text="$t('評価者の単位をチームかスピーカーから選択します。')" />
          </template>
        </Field>
      </div>
    </section>

    <section class="stack option-group">
      <div class="row option-group-head">
        <h6 class="option-group-title">{{ $t('チーム評価設定') }}</h6>
        <HelpTip :text="$t('勝敗判定や入力フォーマットに関する設定です。')" />
      </div>
      <div class="grid option-grid">
        <label class="row small option-item">
          <input v-model="noSpeakerScore" type="checkbox" :disabled="disabled" />
          <span>{{ $t('スピーカースコア無し') }}</span>
          <HelpTip :text="$t('スピーカースコア入力を無効にします。')" />
        </label>
        <label class="row small option-item">
          <input v-model="scoreByMatterManner" type="checkbox" :disabled="disabled" />
          <span>{{ $t('Matter/Manner採点') }}</span>
          <HelpTip :text="$t('Matter/Manner の個別入力を有効にします。')" />
        </label>
        <label class="row small option-item">
          <input v-model="poi" type="checkbox" :disabled="disabled" />
          <span>{{ $t('POI賞') }}</span>
          <HelpTip :text="$t('POI賞の入力を有効にします。')" />
        </label>
        <label class="row small option-item">
          <input v-model="best" type="checkbox" :disabled="disabled" />
          <span>{{ $t('Best Speaker賞') }}</span>
          <HelpTip :text="$t('ベストスピーカー賞の入力を有効にします。')" />
        </label>
        <label class="row small option-item">
          <input
            v-model="allowLowTieWin"
            type="checkbox"
            :disabled="disabled || lockAllowLowTieWin"
          />
          <span>{{ $t('引き分け許可') }}</span>
          <HelpTip
            :text="
              lockAllowLowTieWin
                ? $t(
                    'ブレイクラウンドでは引き分け入力と低勝ち・同点勝ちは常に無効です。引き分け時の勝敗点は0.5-0.5固定です。'
                  )
                : $t(
                    '引き分け入力と低勝ち・同点勝ちを許可します。引き分け時の勝敗点は0.5-0.5固定です。'
                  )
            "
          />
        </label>
      </div>
      <slot name="after-team-settings" />
    </section>

    <section class="stack option-group">
      <div class="row option-group-head">
        <h6 class="option-group-title">{{ $t('表彰人数設定') }}</h6>
        <HelpTip :text="$t('提出時に選択できるベストディベーターとPOIの人数範囲を設定します。')" />
      </div>
      <div class="grid option-grid">
        <Field :label="$t('ベストディベーター最小人数')">
          <template #default="{ id, describedBy }">
            <input
              v-model.number="bestMinCount"
              :id="id"
              :aria-describedby="describedBy"
              type="number"
              min="0"
              :max="bestMaxCount"
              :disabled="disabled || !best"
            />
          </template>
        </Field>
        <Field :label="$t('ベストディベーター最大人数')">
          <template #default="{ id, describedBy }">
            <input
              v-model.number="bestMaxCount"
              :id="id"
              :aria-describedby="describedBy"
              type="number"
              :min="bestMinCount"
              :disabled="disabled || !best"
            />
          </template>
        </Field>
        <Field :label="$t('POI最小人数')">
          <template #default="{ id, describedBy }">
            <input
              v-model.number="poiMinCount"
              :id="id"
              :aria-describedby="describedBy"
              type="number"
              min="0"
              :max="poiMaxCount"
              :disabled="disabled || !poi"
            />
          </template>
        </Field>
        <Field :label="$t('POI最大人数')">
          <template #default="{ id, describedBy }">
            <input
              v-model.number="poiMaxCount"
              :id="id"
              :aria-describedby="describedBy"
              type="number"
              :min="poiMinCount"
              :disabled="disabled || !poi"
            />
          </template>
        </Field>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import Field from '@/components/common/Field.vue'
import HelpTip from '@/components/common/HelpTip.vue'

withDefaults(
  defineProps<{
    disabled?: boolean
    lockAllowLowTieWin?: boolean
  }>(),
  {
    disabled: false,
    lockAllowLowTieWin: false,
  }
)

const evaluateFromAdjudicators = defineModel<boolean>('evaluateFromAdjudicators', {
  required: true,
})
const evaluateFromTeams = defineModel<boolean>('evaluateFromTeams', { required: true })
const chairsAlwaysEvaluated = defineModel<boolean>('chairsAlwaysEvaluated', { required: true })
const evaluatorInTeam = defineModel<'team' | 'speaker'>('evaluatorInTeam', { required: true })
const noSpeakerScore = defineModel<boolean>('noSpeakerScore', { required: true })
const allowLowTieWin = defineModel<boolean>('allowLowTieWin', { required: true })
type BallotSubmitterRole = 'chair' | 'panel' | 'trainee'
const ballotSubmitterRoles = defineModel<BallotSubmitterRole[]>('ballotSubmitterRoles', {
  default: () => ['chair', 'panel'],
})
const scoreByMatterManner = defineModel<boolean>('scoreByMatterManner', { required: true })
const poi = defineModel<boolean>('poi', { required: true })
const best = defineModel<boolean>('best', { required: true })
const bestMinCount = defineModel<number>('bestMinCount', { required: true })
const bestMaxCount = defineModel<number>('bestMaxCount', { required: true })
const poiMinCount = defineModel<number>('poiMinCount', { required: true })
const poiMaxCount = defineModel<number>('poiMaxCount', { required: true })

const ballotSubmitterRoleOptions = computed(() => [
  {
    value: 'chair' as const,
    label: 'チェア',
    help: 'チェアジャッジが判定結果を提出できます。',
  },
  {
    value: 'panel' as const,
    label: 'パネル',
    help: 'パネルジャッジが判定結果を提出できます。',
  },
  {
    value: 'trainee' as const,
    label: 'トレーニー',
    help: 'トレーニーが判定結果を提出できます。',
  },
])

function setBallotSubmitterRole(role: BallotSubmitterRole, enabled: boolean) {
  const current = Array.isArray(ballotSubmitterRoles.value)
    ? ballotSubmitterRoles.value.filter(
        (entry): entry is BallotSubmitterRole =>
          entry === 'chair' || entry === 'panel' || entry === 'trainee'
      )
    : []
  if (enabled && !current.includes(role)) {
    ballotSubmitterRoles.value = [...current, role]
    return
  }
  if (!enabled) {
    ballotSubmitterRoles.value = current.filter((entry) => entry !== role)
  }
}
</script>

<style scoped>
.round-option-editor {
  gap: var(--space-2);
}

.option-group {
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-surface);
  padding: var(--space-2);
  gap: var(--space-2);
}

.option-group-head {
  align-items: center;
  justify-content: flex-start;
  gap: var(--space-2);
}

.option-group-title {
  margin: 0;
  font-size: 1rem;
  font-weight: 700;
  color: var(--color-text);
}

.option-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: var(--space-2);
}

.option-item {
  align-items: center;
  gap: var(--space-2);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  padding: 6px 8px;
  background: var(--color-surface-soft);
  font-size: 0.9rem;
}

.option-subgroup {
  gap: 4px;
}

.option-item--nested {
  margin-left: 4px;
}

.round-option-editor :deep(.field-label) {
  font-size: 0.84rem;
  font-weight: 700;
  color: var(--color-muted);
}
</style>
