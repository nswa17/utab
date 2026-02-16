<template>
  <div class="stack round-option-editor">
    <section class="stack option-group">
      <div class="row option-group-head">
        <h6 class="option-group-title">{{ $t('評価提出設定') }}</h6>
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
        <Field :label="$t('Evaluator in Team')">
          <template #default="{ id, describedBy }">
            <select v-model="evaluatorInTeam" :id="id" :aria-describedby="describedBy" :disabled="disabled">
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
        <h6 class="option-group-title">{{ $t('スコア設定') }}</h6>
        <HelpTip :text="$t('勝敗判定や入力フォーマットに関する設定です。')" />
      </div>
      <div class="grid option-grid">
        <label class="row small option-item">
          <input v-model="noSpeakerScore" type="checkbox" :disabled="disabled" />
          <span>{{ $t('スピーカースコア無し') }}</span>
          <HelpTip :text="$t('スピーカースコア入力を無効にします。')" />
        </label>
        <label class="row small option-item">
          <input v-model="allowLowTieWin" type="checkbox" :disabled="disabled" />
          <span>{{ $t('低勝ち/同点勝ち許可') }}</span>
          <HelpTip :text="$t('低勝ち・同点勝ちを許可します。')" />
        </label>
        <label class="row small option-item">
          <input v-model="scoreByMatterManner" type="checkbox" :disabled="disabled" />
          <span>{{ $t('Matter/Manner採点') }}</span>
          <HelpTip :text="$t('Matter/Manner の個別入力を有効にします。')" />
        </label>
      </div>
    </section>

    <section class="stack option-group">
      <div class="row option-group-head">
        <h6 class="option-group-title">{{ $t('賞設定') }}</h6>
        <HelpTip :text="$t('POI賞とベストスピーカー賞の入力有無を設定します。')" />
      </div>
      <div class="grid option-grid">
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
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import Field from '@/components/common/Field.vue'
import HelpTip from '@/components/common/HelpTip.vue'

withDefaults(
  defineProps<{
    disabled?: boolean
  }>(),
  {
    disabled: false,
  }
)

const evaluateFromAdjudicators = defineModel<boolean>('evaluateFromAdjudicators', { required: true })
const evaluateFromTeams = defineModel<boolean>('evaluateFromTeams', { required: true })
const chairsAlwaysEvaluated = defineModel<boolean>('chairsAlwaysEvaluated', { required: true })
const evaluatorInTeam = defineModel<'team' | 'speaker'>('evaluatorInTeam', { required: true })
const noSpeakerScore = defineModel<boolean>('noSpeakerScore', { required: true })
const allowLowTieWin = defineModel<boolean>('allowLowTieWin', { required: true })
const scoreByMatterManner = defineModel<boolean>('scoreByMatterManner', { required: true })
const poi = defineModel<boolean>('poi', { required: true })
const best = defineModel<boolean>('best', { required: true })
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
  justify-content: space-between;
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

.round-option-editor :deep(.field-label) {
  font-size: 0.84rem;
  font-weight: 700;
  color: var(--color-muted);
}
</style>
