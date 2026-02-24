<template>
  <div class="card stack soft table-wrap draw-preview-panel">
    <div v-if="rows.length === 0" class="muted">{{ $t('有効なマッチがありません。') }}</div>
    <div v-else>
      <table class="draw-preview-table">
        <thead>
          <tr>
            <th>
              <div class="draw-header-cell">
                <SortHeaderButton
                  :label="$t('会場')"
                  :indicator="sortIndicator('venue')"
                  @click="setSort('venue')"
                />
                <div v-if="columnHeaderBadges('venue').length > 0" class="draw-header-badge-list">
                  <span
                    v-for="(badge, index) in columnHeaderBadges('venue')"
                    :key="`venue-badge-${index}-${badge.text}`"
                    class="draw-header-badge"
                    :class="`is-${badge.tone ?? 'neutral'}`"
                  >
                    {{ badge.text }}
                  </span>
                </div>
              </div>
            </th>
            <th>
              <div class="draw-header-cell">
                <SortHeaderButton
                  :label="govLabel"
                  :indicator="sortIndicator('gov')"
                  @click="setSort('gov')"
                />
                <div v-if="columnHeaderBadges('gov').length > 0" class="draw-header-badge-list">
                  <span
                    v-for="(badge, index) in columnHeaderBadges('gov')"
                    :key="`gov-badge-${index}-${badge.text}`"
                    class="draw-header-badge"
                    :class="`is-${badge.tone ?? 'neutral'}`"
                  >
                    {{ badge.text }}
                  </span>
                </div>
              </div>
            </th>
            <th>
              <div class="draw-header-cell">
                <SortHeaderButton
                  :label="oppLabel"
                  :indicator="sortIndicator('opp')"
                  @click="setSort('opp')"
                />
                <div v-if="columnHeaderBadges('opp').length > 0" class="draw-header-badge-list">
                  <span
                    v-for="(badge, index) in columnHeaderBadges('opp')"
                    :key="`opp-badge-${index}-${badge.text}`"
                    class="draw-header-badge"
                    :class="`is-${badge.tone ?? 'neutral'}`"
                  >
                    {{ badge.text }}
                  </span>
                </div>
              </div>
            </th>
            <th>
              <div class="draw-header-cell">
                <SortHeaderButton
                  :label="winColumnLabel"
                  :indicator="sortIndicator('win')"
                  @click="setSort('win')"
                />
                <div v-if="columnHeaderBadges('win').length > 0" class="draw-header-badge-list">
                  <span
                    v-for="(badge, index) in columnHeaderBadges('win')"
                    :key="`win-badge-${index}-${badge.text}`"
                    class="draw-header-badge"
                    :class="`is-${badge.tone ?? 'neutral'}`"
                  >
                    {{ badge.text }}
                  </span>
                </div>
              </div>
            </th>
            <th v-if="showScoreColumn">
              <div class="draw-header-cell">
                <SortHeaderButton
                  :label="scoreColumnLabel"
                  :indicator="sortIndicator('score')"
                  @click="setSort('score')"
                />
                <div v-if="columnHeaderBadges('score').length > 0" class="draw-header-badge-list">
                  <span
                    v-for="(badge, index) in columnHeaderBadges('score')"
                    :key="`score-badge-${index}-${badge.text}`"
                    class="draw-header-badge"
                    :class="`is-${badge.tone ?? 'neutral'}`"
                  >
                    {{ badge.text }}
                  </span>
                </div>
              </div>
            </th>
            <th class="draw-col-chair">
              <div class="draw-header-cell">
                <SortHeaderButton
                  :label="$t('チェア')"
                  :indicator="sortIndicator('chair')"
                  @click="setSort('chair')"
                />
                <div v-if="columnHeaderBadges('chair').length > 0" class="draw-header-badge-list">
                  <span
                    v-for="(badge, index) in columnHeaderBadges('chair')"
                    :key="`chair-badge-${index}-${badge.text}`"
                    class="draw-header-badge"
                    :class="`is-${badge.tone ?? 'neutral'}`"
                  >
                    {{ badge.text }}
                  </span>
                </div>
              </div>
            </th>
            <th class="draw-col-panel">
              <div class="draw-header-cell">
                <SortHeaderButton
                  :label="$t('パネル')"
                  :indicator="sortIndicator('panel')"
                  @click="setSort('panel')"
                />
                <div v-if="columnHeaderBadges('panel').length > 0" class="draw-header-badge-list">
                  <span
                    v-for="(badge, index) in columnHeaderBadges('panel')"
                    :key="`panel-badge-${index}-${badge.text}`"
                    class="draw-header-badge"
                    :class="`is-${badge.tone ?? 'neutral'}`"
                  >
                    {{ badge.text }}
                  </span>
                </div>
              </div>
            </th>
            <th class="draw-col-trainee">
              <div class="draw-header-cell">
                <SortHeaderButton
                  :label="$t('トレーニー')"
                  :indicator="sortIndicator('trainee')"
                  @click="setSort('trainee')"
                />
                <div v-if="columnHeaderBadges('trainee').length > 0" class="draw-header-badge-list">
                  <span
                    v-for="(badge, index) in columnHeaderBadges('trainee')"
                    :key="`trainee-badge-${index}-${badge.text}`"
                    class="draw-header-badge"
                    :class="`is-${badge.tone ?? 'neutral'}`"
                  >
                    {{ badge.text }}
                  </span>
                </div>
              </div>
            </th>
            <th v-if="showSubmissionColumns">
              <div class="draw-header-cell">
                <SortHeaderButton
                  :label="teamSubmissionLabel"
                  :indicator="sortIndicator('teamSubmission')"
                  @click="setSort('teamSubmission')"
                />
                <div
                  v-if="columnHeaderBadges('teamSubmission').length > 0"
                  class="draw-header-badge-list"
                >
                  <span
                    v-for="(badge, index) in columnHeaderBadges('teamSubmission')"
                    :key="`team-submission-badge-${index}-${badge.text}`"
                    class="draw-header-badge"
                    :class="`is-${badge.tone ?? 'neutral'}`"
                  >
                    {{ badge.text }}
                  </span>
                </div>
              </div>
            </th>
            <th v-if="showJudgeSubmissionColumn">
              <div class="draw-header-cell">
                <SortHeaderButton
                  :label="judgeSubmissionLabel"
                  :indicator="sortIndicator('judgeSubmission')"
                  @click="setSort('judgeSubmission')"
                />
                <div
                  v-if="columnHeaderBadges('judgeSubmission').length > 0"
                  class="draw-header-badge-list"
                >
                  <span
                    v-for="(badge, index) in columnHeaderBadges('judgeSubmission')"
                    :key="`judge-submission-badge-${index}-${badge.text}`"
                    class="draw-header-badge"
                    :class="`is-${badge.tone ?? 'neutral'}`"
                  >
                    {{ badge.text }}
                  </span>
                </div>
              </div>
            </th>
            <th v-if="showDetailColumn" class="draw-col-detail"></th>
          </tr>
        </thead>
        <tbody>
          <template v-for="row in sortedRows" :key="`preview-${row.key}`">
            <tr>
              <td>{{ row.venueLabel }}</td>
              <td>{{ row.govName }}</td>
              <td>{{ row.oppName }}</td>
              <td>
                <div class="draw-win-cell">
                  <span class="draw-win-main">
                    <span class="draw-win-value">{{ row.winLabel }}</span>
                    <span
                      v-if="row.winStatusLabel"
                      class="draw-win-status"
                      :class="`draw-win-status--${row.winStatus ?? 'insufficient'}`"
                    >
                      {{ row.winStatusLabel }}
                    </span>
                  </span>
                  <span v-if="row.winMetaLabel" class="muted tiny draw-win-meta">{{
                    row.winMetaLabel
                  }}</span>
                </div>
              </td>
              <td v-if="showScoreColumn">
                {{ row.scoreLabel ?? '—' }}
              </td>
              <td class="draw-col-chair draw-wrap-cell">
                {{ row.chairsLabel }}
              </td>
              <td class="draw-col-panel draw-wrap-cell">
                {{ row.panelsLabel }}
              </td>
              <td class="draw-col-trainee draw-wrap-cell">
                {{ row.traineesLabel }}
              </td>
              <td v-if="showSubmissionColumns">
                <span
                  class="submission-count-chip"
                  :class="`submission-count-chip--${submissionCountTone(
                    row.teamSubmissionCount,
                    row.teamSubmissionExpectedCount
                  )}`"
                >
                  {{
                    submissionCountText(row.teamSubmissionCount, row.teamSubmissionExpectedCount)
                  }}
                </span>
              </td>
              <td v-if="showJudgeSubmissionColumn">
                <span
                  class="submission-count-chip"
                  :class="`submission-count-chip--${submissionCountTone(
                    row.judgeSubmissionCount,
                    row.judgeSubmissionExpectedCount
                  )}`"
                >
                  {{
                    submissionCountText(row.judgeSubmissionCount, row.judgeSubmissionExpectedCount)
                  }}
                </span>
              </td>
              <td v-if="showDetailColumn" class="draw-col-detail">
                <button
                  type="button"
                  class="preview-detail-toggle"
                  :disabled="!hasSubmissionDetail(row)"
                  @click="toggleRowDetail(row.key)"
                >
                  {{ isExpandedRow(row.key) ? $t('隠す') : $t('詳細') }}
                </button>
              </td>
            </tr>
            <tr v-if="showDetailColumn && isExpandedRow(row.key)" class="draw-preview-detail-row">
              <td :colspan="columnCount">
                <div class="draw-preview-detail-grid">
                  <section v-if="showSubmissionColumns" class="draw-preview-detail-panel">
                    <div class="row draw-preview-detail-head">
                      <strong>{{ teamSubmissionLabel }}</strong>
                    </div>
                    <table
                      v-if="(row.submissionDetail?.team ?? []).length > 0"
                      class="draw-preview-detail-table"
                    >
                      <thead>
                        <tr>
                          <th>{{ $t('提出者') }}</th>
                          <th>{{ $t('概要') }}</th>
                          <th>{{ $t('作成日時') }}</th>
                          <th>{{ $t('操作') }}</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr
                          v-for="entry in row.submissionDetail?.team ?? []"
                          :key="`team-${row.key}-${entry.key}`"
                        >
                          <td>{{ entry.submittedByLabel }}</td>
                          <td>{{ entry.summaryLabel }}</td>
                          <td>{{ entry.submittedAtLabel }}</td>
                          <td>
                            <button
                              type="button"
                              class="preview-detail-edit-button"
                              :disabled="!entry.submissionId"
                              @click="onEditSubmission(entry.submissionId)"
                            >
                              {{ $t('編集') }}
                            </button>
                          </td>
                        </tr>
                      </tbody>
                    </table>
                    <p v-else class="muted small">{{ $t('提出がありません。') }}</p>
                  </section>
                  <section v-if="showJudgeSubmissionColumn" class="draw-preview-detail-panel">
                    <div class="row draw-preview-detail-head">
                      <strong>{{ judgeSubmissionLabel }}</strong>
                    </div>
                    <table
                      v-if="(row.submissionDetail?.judge ?? []).length > 0"
                      class="draw-preview-detail-table"
                    >
                      <thead>
                        <tr>
                          <th>{{ $t('提出者') }}</th>
                          <th>{{ $t('概要') }}</th>
                          <th>{{ $t('作成日時') }}</th>
                          <th>{{ $t('操作') }}</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr
                          v-for="entry in row.submissionDetail?.judge ?? []"
                          :key="`judge-${row.key}-${entry.key}`"
                        >
                          <td>{{ entry.submittedByLabel }}</td>
                          <td>{{ entry.summaryLabel }}</td>
                          <td>{{ entry.submittedAtLabel }}</td>
                          <td>
                            <button
                              type="button"
                              class="preview-detail-edit-button"
                              :disabled="!entry.submissionId"
                              @click="onEditSubmission(entry.submissionId)"
                            >
                              {{ $t('編集') }}
                            </button>
                          </td>
                        </tr>
                      </tbody>
                    </table>
                    <p v-else class="muted small">{{ $t('提出がありません。') }}</p>
                  </section>
                </div>
              </td>
            </tr>
          </template>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import SortHeaderButton from '@/components/common/SortHeaderButton.vue'
import type { DrawPreviewRow } from '@/types/draw-preview'

type PreviewSortKey =
  | 'venue'
  | 'gov'
  | 'opp'
  | 'win'
  | 'score'
  | 'chair'
  | 'panel'
  | 'trainee'
  | 'teamSubmission'
  | 'judgeSubmission'
type PreviewSortDirection = 'asc' | 'desc'
type PreviewSortState = { key: PreviewSortKey; direction: PreviewSortDirection }
type HeaderBadgeTone = 'open' | 'closed' | 'neutral'
type HeaderBadge = { text: string; tone?: HeaderBadgeTone }
type ColumnHeaderBadgeMap = Partial<Record<PreviewSortKey, HeaderBadge[]>>

const props = withDefaults(
  defineProps<{
    rows: DrawPreviewRow[]
    govLabel?: string
    oppLabel?: string
    teamVisible?: boolean
    adjudicatorVisible?: boolean
    showSubmissionColumns?: boolean
    showJudgeSubmissionColumn?: boolean
    teamSubmissionLabel?: string
    judgeSubmissionLabel?: string
    winColumnLabel?: string
    showScoreColumn?: boolean
    scoreColumnLabel?: string
    columnHeaderBadges?: ColumnHeaderBadgeMap
  }>(),
  {
    govLabel: 'Gov',
    oppLabel: 'Opp',
    teamVisible: true,
    adjudicatorVisible: true,
    showSubmissionColumns: false,
    showJudgeSubmissionColumn: true,
    teamSubmissionLabel: 'チーム評価',
    judgeSubmissionLabel: 'ジャッジ評価',
    winColumnLabel: 'Win',
    showScoreColumn: false,
    scoreColumnLabel: 'SCORE合計',
    columnHeaderBadges: () => ({}),
  }
)
const emit = defineEmits<{
  (event: 'edit-submission', submissionId: string): void
}>()

const sortState = ref<PreviewSortState>({
  key: 'venue',
  direction: 'asc',
})
const expandedRows = ref<Record<string, boolean>>({})

const sortCollator = new Intl.Collator(['ja', 'en'], {
  numeric: true,
  sensitivity: 'base',
})
const showSubmissionColumns = computed(() => props.showSubmissionColumns)
const showJudgeSubmissionColumn = computed(
  () => showSubmissionColumns.value && props.showJudgeSubmissionColumn
)
const showDetailColumn = computed(
  () => showSubmissionColumns.value || showJudgeSubmissionColumn.value
)
const showScoreColumn = computed(() => props.showScoreColumn)
const teamSubmissionLabel = computed(() => props.teamSubmissionLabel)
const judgeSubmissionLabel = computed(() => props.judgeSubmissionLabel)
const winColumnLabel = computed(() => props.winColumnLabel)
const scoreColumnLabel = computed(() => props.scoreColumnLabel)
const columnCount = computed(() => {
  const scoreColumn = Number(showScoreColumn.value)
  const submissionColumns =
    Number(showSubmissionColumns.value) + Number(showJudgeSubmissionColumn.value)
  const detailColumn = Number(showDetailColumn.value)
  return 7 + scoreColumn + submissionColumns + detailColumn
})

function columnHeaderBadges(key: PreviewSortKey) {
  return props.columnHeaderBadges?.[key] ?? []
}

function sortValue(row: DrawPreviewRow, key: PreviewSortKey) {
  if (key === 'score' && !showScoreColumn.value) return -1
  if (key === 'teamSubmission' && !showSubmissionColumns.value) return 0
  if (key === 'judgeSubmission' && !showJudgeSubmissionColumn.value) return 0
  if (key === 'venue') return row.venueLabel
  if (key === 'gov') return row.govName
  if (key === 'opp') return row.oppName
  if (key === 'win') return row.winTotal
  if (key === 'score') return row.scoreTotal ?? -1
  if (key === 'chair') return row.chairsLabel
  if (key === 'panel') return row.panelsLabel
  if (key === 'teamSubmission') return row.teamSubmissionCount ?? 0
  if (key === 'judgeSubmission') return row.judgeSubmissionCount ?? 0
  return row.traineesLabel
}

const sortedRows = computed(() => {
  const state = sortState.value
  const direction = state.direction === 'asc' ? 1 : -1
  return props.rows.slice().sort((left, right) => {
    if (state.key === 'venue' && left.venuePriority !== right.venuePriority) {
      return direction * (left.venuePriority - right.venuePriority)
    }
    const leftValue = sortValue(left, state.key)
    const rightValue = sortValue(right, state.key)
    if (typeof leftValue === 'number' && typeof rightValue === 'number') {
      const diff = leftValue - rightValue
      if (diff !== 0) return direction * diff
    } else {
      const diff = sortCollator.compare(String(leftValue), String(rightValue))
      if (diff !== 0) return direction * diff
    }
    if (state.key === 'score' && (left.scoreGap ?? 0) !== (right.scoreGap ?? 0)) {
      return (left.scoreGap ?? 0) - (right.scoreGap ?? 0)
    }
    if (left.winGap !== right.winGap) return left.winGap - right.winGap
    return left.matchIndex - right.matchIndex
  })
})

function getDisplayRows() {
  return sortedRows.value.slice()
}

function setSort(key: PreviewSortKey) {
  if (sortState.value.key === key) {
    sortState.value = {
      key,
      direction: sortState.value.direction === 'asc' ? 'desc' : 'asc',
    }
    return
  }
  sortState.value = {
    key,
    direction: key === 'win' || key === 'score' ? 'desc' : 'asc',
  }
}

function sortIndicator(key: PreviewSortKey) {
  if (sortState.value.key !== key) return '↕'
  return sortState.value.direction === 'asc' ? '↑' : '↓'
}

function hasSubmissionDetail(row: DrawPreviewRow) {
  const teamCount = row.teamSubmissionCount ?? 0
  const judgeCount = row.judgeSubmissionCount ?? 0
  const teamExpected = row.teamSubmissionExpectedCount ?? 0
  const judgeExpected = row.judgeSubmissionExpectedCount ?? 0
  const detail = row.submissionDetail
  const visibleTeamCount = showSubmissionColumns.value ? teamCount : 0
  const visibleJudgeCount = showJudgeSubmissionColumn.value ? judgeCount : 0
  const visibleTeamExpected = showSubmissionColumns.value ? teamExpected : 0
  const visibleJudgeExpected = showJudgeSubmissionColumn.value ? judgeExpected : 0
  const visibleDetailRows =
    (showSubmissionColumns.value ? (detail?.team?.length ?? 0) : 0) +
    (showJudgeSubmissionColumn.value ? (detail?.judge?.length ?? 0) : 0)
  return (
    visibleTeamCount +
      visibleJudgeCount +
      visibleTeamExpected +
      visibleJudgeExpected +
      visibleDetailRows >
    0
  )
}

function isExpandedRow(key: string) {
  return Boolean(expandedRows.value[key])
}

function toggleRowDetail(key: string) {
  expandedRows.value = {
    ...expandedRows.value,
    [key]: !expandedRows.value[key],
  }
}

function submissionCountText(actual?: number, expected?: number) {
  const left = Number.isFinite(actual) ? Math.max(0, Number(actual)) : 0
  if (!Number.isFinite(expected)) return String(left)
  const right = Math.max(0, Number(expected))
  return `${left}/${right}`
}

function submissionCountTone(actual?: number, expected?: number) {
  const left = Number.isFinite(actual) ? Math.max(0, Number(actual)) : 0
  if (!Number.isFinite(expected)) return 'neutral'
  const right = Math.max(0, Number(expected))
  if (right <= 0) return 'neutral'
  if (left < right) return 'missing'
  return 'complete'
}

function onEditSubmission(submissionId?: string) {
  const normalized = String(submissionId ?? '').trim()
  if (!normalized) return
  emit('edit-submission', normalized)
}

defineExpose({
  getDisplayRows,
})
</script>

<style scoped>
.draw-preview-panel {
  overflow: auto;
}

.draw-preview-table {
  width: 100%;
  border-collapse: separate;
  border-spacing: 0;
}

.draw-preview-table th,
.draw-preview-table td {
  padding: var(--space-2);
  border-bottom: 1px solid var(--color-border);
  vertical-align: top;
  font-size: 13px;
  text-align: left;
}

.draw-preview-table th {
  background: var(--color-surface-muted);
  font-weight: 700;
  white-space: nowrap;
}

.draw-header-cell {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.draw-header-badge-list {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  flex-wrap: wrap;
}

.draw-header-badge {
  display: inline-flex;
  align-items: center;
  border-radius: 999px;
  border: 1px solid var(--color-border);
  padding: 1px 6px;
  font-size: 11px;
  font-weight: 700;
  line-height: 1.2;
}

.draw-header-badge.is-open {
  border-color: #86efac;
  color: #166534;
  background: #f0fdf4;
}

.draw-header-badge.is-closed {
  border-color: #fdba74;
  color: #9a3412;
  background: #fff7ed;
}

.draw-header-badge.is-neutral {
  color: var(--color-text);
  background: var(--color-surface);
}

.draw-preview-table tbody tr:last-child td {
  border-bottom: none;
}

.draw-col-chair,
.draw-col-panel,
.draw-col-trainee {
  width: auto;
}

.draw-col-chair {
  min-width: 180px;
}

.draw-col-panel,
.draw-col-trainee {
  width: 1%;
  min-width: 72px;
}

.draw-col-detail {
  width: 74px;
  white-space: nowrap;
}

.draw-wrap-cell {
  white-space: normal;
  overflow-wrap: anywhere;
}

.draw-win-cell {
  display: grid;
  gap: 2px;
}

.draw-win-main {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  white-space: nowrap;
}

.draw-win-value {
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.draw-win-status {
  display: inline-flex;
  align-items: center;
  width: fit-content;
  min-height: 18px;
  border-radius: 999px;
  padding: 0 8px;
  font-size: 11px;
  font-weight: 700;
  border: 1px solid transparent;
}

.draw-win-status--confirmed {
  color: #166534;
  background: #dcfce7;
  border-color: #86efac;
}

.draw-win-status--provisional {
  color: #92400e;
  background: #fef3c7;
  border-color: #fcd34d;
}

.draw-win-status--insufficient {
  color: #475569;
  background: #e2e8f0;
  border-color: #cbd5e1;
}

.draw-win-meta {
  line-height: 1.25;
}

.submission-count-chip {
  display: inline-flex;
  align-items: center;
  border-radius: 999px;
  padding: 2px 8px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.submission-count-chip--neutral {
  color: var(--color-text);
  background: transparent;
}

.submission-count-chip--complete {
  color: #166534;
  background: #dcfce7;
}

.submission-count-chip--missing {
  color: #9a3412;
  background: #ffedd5;
}

.preview-detail-toggle,
.preview-detail-edit-button {
  appearance: none;
  border: 1px solid var(--color-border-strong);
  background: var(--color-surface);
  color: var(--color-text);
  border-radius: var(--radius-sm);
  padding: var(--space-1) var(--space-2);
  font-size: 12px;
  line-height: 1.2;
  cursor: pointer;
  font-weight: 400;
  min-height: auto;
  white-space: nowrap;
  writing-mode: horizontal-tb;
  text-orientation: mixed;
}

.preview-detail-toggle:disabled,
.preview-detail-edit-button:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}

.preview-detail-edit-button:hover:not(:disabled) {
  background: var(--color-surface-muted);
}

.draw-preview-detail-row td {
  background: color-mix(in srgb, var(--color-surface-muted) 45%, transparent);
}

.draw-preview-detail-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
  gap: var(--space-3);
  align-items: start;
}

.draw-preview-detail-panel {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: var(--space-2);
  display: grid;
  gap: var(--space-2);
  align-content: start;
}

.draw-preview-detail-head {
  justify-content: flex-start;
  align-items: center;
}

.draw-preview-detail-table {
  width: 100%;
  border-collapse: collapse;
}

.draw-preview-detail-table th,
.draw-preview-detail-table td {
  padding: 6px;
  border-bottom: 1px solid var(--color-border);
  font-size: 12px;
  text-align: left;
  vertical-align: top;
}

.draw-preview-detail-table th {
  background: var(--color-surface-muted);
  font-weight: 600;
}

.draw-preview-detail-table tbody tr:last-child td {
  border-bottom: none;
}

@media (max-width: 900px) {
  .draw-preview-detail-grid {
    grid-template-columns: 1fr;
  }
}
</style>
