<template>
  <div class="card stack soft table-wrap draw-preview-panel">
    <div v-if="rows.length === 0" class="muted">{{ $t('有効なマッチがありません。') }}</div>
    <div v-else>
      <table class="draw-preview-table">
        <thead>
          <tr>
            <th>
              <SortHeaderButton
                :label="$t('会場')"
                :indicator="sortIndicator('venue')"
                @click="setSort('venue')"
              />
            </th>
            <th>
              <SortHeaderButton
                :label="govLabel"
                :indicator="sortIndicator('gov')"
                @click="setSort('gov')"
              />
            </th>
            <th>
              <SortHeaderButton
                :label="oppLabel"
                :indicator="sortIndicator('opp')"
                @click="setSort('opp')"
              />
            </th>
            <th>
              <SortHeaderButton
                :label="$t('Win')"
                :indicator="sortIndicator('win')"
                @click="setSort('win')"
              />
            </th>
            <th>
              <SortHeaderButton
                :label="$t('チェア')"
                :indicator="sortIndicator('chair')"
                @click="setSort('chair')"
              />
            </th>
            <th>
              <SortHeaderButton
                :label="$t('パネル')"
                :indicator="sortIndicator('panel')"
                @click="setSort('panel')"
              />
            </th>
            <th>
              <SortHeaderButton
                :label="$t('トレーニー')"
                :indicator="sortIndicator('trainee')"
                @click="setSort('trainee')"
              />
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in sortedRows" :key="`preview-${row.key}`">
            <td>{{ row.venueLabel }}</td>
            <td>{{ teamVisible ? row.govName : $t('非公開') }}</td>
            <td>{{ teamVisible ? row.oppName : $t('非公開') }}</td>
            <td>{{ teamVisible ? row.winLabel : '—' }}</td>
            <td>{{ adjudicatorVisible ? row.chairsLabel : $t('非公開') }}</td>
            <td>{{ adjudicatorVisible ? row.panelsLabel : $t('非公開') }}</td>
            <td>{{ adjudicatorVisible ? row.traineesLabel : $t('非公開') }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import SortHeaderButton from '@/components/common/SortHeaderButton.vue'
import type { DrawPreviewRow } from '@/types/draw-preview'

type PreviewSortKey = 'venue' | 'gov' | 'opp' | 'win' | 'chair' | 'panel' | 'trainee'
type PreviewSortDirection = 'asc' | 'desc'
type PreviewSortState = { key: PreviewSortKey; direction: PreviewSortDirection }

const props = withDefaults(
  defineProps<{
    rows: DrawPreviewRow[]
    govLabel?: string
    oppLabel?: string
    teamVisible?: boolean
    adjudicatorVisible?: boolean
  }>(),
  {
    govLabel: 'Gov',
    oppLabel: 'Opp',
    teamVisible: true,
    adjudicatorVisible: true,
  }
)

const sortState = ref<PreviewSortState>({
  key: 'venue',
  direction: 'asc',
})

const sortCollator = new Intl.Collator(['ja', 'en'], {
  numeric: true,
  sensitivity: 'base',
})

function sortValue(row: DrawPreviewRow, key: PreviewSortKey) {
  if (!props.teamVisible && (key === 'gov' || key === 'opp' || key === 'win')) return ''
  if (!props.adjudicatorVisible && (key === 'chair' || key === 'panel' || key === 'trainee')) {
    return ''
  }
  if (key === 'venue') return row.venueLabel
  if (key === 'gov') return row.govName
  if (key === 'opp') return row.oppName
  if (key === 'win') return row.winTotal
  if (key === 'chair') return row.chairsLabel
  if (key === 'panel') return row.panelsLabel
  return row.traineesLabel
}

const sortedRows = computed(() => {
  const state = sortState.value
  const direction = state.direction === 'asc' ? 1 : -1
  return props.rows
    .slice()
    .sort((left, right) => {
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
      if (left.winGap !== right.winGap) return left.winGap - right.winGap
      return left.matchIndex - right.matchIndex
    })
})

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
    direction: key === 'win' ? 'desc' : 'asc',
  }
}

function sortIndicator(key: PreviewSortKey) {
  if (sortState.value.key !== key) return '↕'
  return sortState.value.direction === 'asc' ? '↑' : '↓'
}
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

.draw-preview-table tbody tr:last-child td {
  border-bottom: none;
}
</style>
