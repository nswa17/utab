<template>
  <Table hover striped sticky-header>
    <thead>
      <tr>
        <th v-for="key in columns" :key="`col-${key}`">
          <SortHeaderButton
            compact
            :label="columnLabel(key)"
            :indicator="sortIndicator(key)"
            @click="onSort(key)"
          />
        </th>
      </tr>
    </thead>
    <tbody>
      <tr v-for="(row, rowIndex) in rows" :key="rowKey(row, rowIndex)">
        <td v-for="key in columns" :key="`${rowIndex}-${key}`">
          <span v-if="key === identityKey">{{ identityLabel(row) }}</span>
          <span v-else-if="key === rankingKey" class="diff-value">
            <span>{{ valueFormatter(row?.[key]) }}</span>
            <span
              class="diff-marker"
              :class="rankingClass(row)"
              :title="rankingText(row)"
              :aria-label="rankingText(row)"
            >
              {{ rankingSymbol(row) }}
            </span>
            <span v-if="rankingDelta(row)" class="muted diff-delta">
              {{ rankingDelta(row) }}
            </span>
          </span>
          <span v-else-if="plainKeySet.has(key)">
            {{ plainCellValue(row, key) }}
          </span>
          <span v-else class="diff-value">
            <span>{{ valueFormatter(row?.[key]) }}</span>
            <span v-if="metricDelta(row, key)" class="muted diff-delta">
              {{ metricDelta(row, key) }}
            </span>
          </span>
        </td>
      </tr>
    </tbody>
  </Table>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import Table from '@/components/common/Table.vue'
import SortHeaderButton from '@/components/common/SortHeaderButton.vue'

type RankingRow = Record<string, any>

const props = defineProps<{
  rows: RankingRow[]
  columns: string[]
  identityKey: string
  identityLabel: (row: RankingRow) => string
  rowKey: (row: RankingRow, index: number) => string
  columnLabel: (key: string) => string
  sortIndicator: (key: string) => string
  onSort: (key: string) => void
  valueFormatter: (value: unknown) => string
  rankingClass: (row: RankingRow) => string
  rankingText: (row: RankingRow) => string
  rankingSymbol: (row: RankingRow) => string
  rankingDelta: (row: RankingRow) => string
  metricDelta: (row: RankingRow, key: string) => string
  rankingKey?: string
  plainKeys?: string[]
  plainValueFormatter?: (value: unknown, key: string, row: RankingRow) => string
}>()

const rankingKey = computed(() => props.rankingKey ?? 'ranking')
const plainKeySet = computed(() => new Set(props.plainKeys ?? []))

function plainCellValue(row: RankingRow, key: string): string {
  if (props.plainValueFormatter) return props.plainValueFormatter(row?.[key], key, row)
  const value = row?.[key]
  if (Array.isArray(value)) return value.map((item) => String(item)).join(', ')
  if (value === null || value === undefined || value === '') return '—'
  return String(value)
}
</script>

<style scoped>
.diff-value {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.diff-marker {
  font-weight: 700;
  font-size: 0.88rem;
}

.diff-delta {
  font-size: 0.75rem;
}

.diff-improved {
  color: #15803d;
}

.diff-worsened {
  color: #b91c1c;
}

.diff-unchanged {
  color: #475569;
}

.diff-new {
  color: #0f766e;
}

.diff-na {
  color: var(--color-muted);
}
</style>
