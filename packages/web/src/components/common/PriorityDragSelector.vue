<template>
  <div class="stack priority-dnd">
    <section
      v-if="props.layout === 'single'"
      ref="singleContainerRef"
      class="stack priority-dnd-single"
      :class="{ 'priority-dnd-single--disabled': props.disabled }"
      @dragover.prevent="onSingleContainerDragOver"
      @drop.prevent="dropSingleByContainer"
    >
      <div class="row priority-dnd-column-head">
        <strong class="priority-dnd-column-title">{{ props.activeTitle }}</strong>
      </div>
      <div
        v-for="value in singleOrder"
        :key="`single-${value}`"
        class="stack priority-dnd-single-item"
        :data-priority-value="value"
        :class="{
          'priority-dnd-single-item--active': activeSet.has(value),
          'priority-dnd-single-item--inactive': !activeSet.has(value),
          'priority-dnd-single-item--drag-source': singleDragSource === value,
          'priority-dnd-single-item--drag-target': singleDragTarget === value,
        }"
        :draggable="!props.disabled"
        @dragstart="startSingleDrag(value, $event)"
        @dragover.prevent.stop="onSingleDragOver(value, $event)"
        @drop.prevent.stop="dropSingle(value, $event)"
        @dragend="endSingleDrag"
      >
        <label class="row priority-dnd-single-row">
          <span class="priority-dnd-rank" :class="{ 'priority-dnd-rank--inactive': !activeSet.has(value) }">
            {{ singleActiveRank(value) }}
          </span>
          <input
            type="checkbox"
            :checked="activeSet.has(value)"
            :disabled="props.disabled"
            @change="toggleSingle(value, $event)"
          />
          <span class="priority-dnd-chip-label">{{ optionLabel(value) }}</span>
        </label>
        <span v-if="optionDescription(value)" class="priority-dnd-chip-help priority-dnd-single-help">{{
          optionDescription(value)
        }}</span>
      </div>
    </section>

    <div v-else class="priority-dnd-columns">
      <section
        class="stack priority-dnd-column priority-dnd-column--active"
        :class="{
          'priority-dnd-column--drop-active': dropZone === 'active',
          'priority-dnd-column--drop-disabled': isDragActive && !canDropToActive,
        }"
        @dragover.prevent="onActiveColumnDragOver"
        @drop.prevent="dropToActiveEnd"
      >
        <div class="row priority-dnd-column-head">
          <strong class="priority-dnd-column-title">{{ props.activeTitle }}</strong>
        </div>
        <div
          v-for="(value, index) in activeValues"
          :key="`active-${value}`"
          class="row priority-dnd-chip priority-dnd-chip--active"
          :class="{
            'priority-dnd-chip--dragging':
              draggingItem?.value === value && draggingItem?.source === 'active',
            'priority-dnd-chip--drop-target':
              dropZone === 'active' && dropTargetValue === value,
          }"
          :draggable="!props.disabled"
          @dragstart="startDrag(value, 'active', $event)"
          @dragover.prevent.stop="onActiveChipDragOver(value)"
          @drop.prevent.stop="dropToActive(value)"
          @dragend="endDrag"
        >
          <span class="priority-dnd-rank">{{ index + 1 }}</span>
          <span class="priority-dnd-chip-label">{{ optionLabel(value) }}</span>
          <span v-if="optionDescription(value)" class="priority-dnd-chip-help">{{
            optionDescription(value)
          }}</span>
          <Button
            v-if="props.activeActionLabel"
            variant="ghost"
            size="sm"
            class="priority-dnd-exclude"
            :disabled="props.disabled || activeValues.length <= props.minActive"
            @click="excludeValue(value)"
          >
            {{ props.activeActionLabel }}
          </Button>
        </div>
      </section>

      <section
        class="stack priority-dnd-column priority-dnd-column--inactive"
        :class="{
          'priority-dnd-column--drop-active': dropZone === 'inactive',
          'priority-dnd-column--drop-disabled': isDragActive && !canDropToInactive,
        }"
        @dragover.prevent="onInactiveColumnDragOver"
        @drop.prevent="dropToInactive"
      >
        <div class="row priority-dnd-column-head">
          <strong class="priority-dnd-column-title">{{ props.inactiveTitle }}</strong>
        </div>
        <p v-if="inactiveValues.length === 0 && props.inactiveEmptyText" class="muted small">
          {{ props.inactiveEmptyText }}
        </p>
        <div
          v-for="value in inactiveValues"
          :key="`inactive-${value}`"
          class="row priority-dnd-chip priority-dnd-chip--inactive"
          :class="{
            'priority-dnd-chip--dragging':
              draggingItem?.value === value && draggingItem?.source === 'inactive',
          }"
          :draggable="!props.disabled"
          @dragstart="startDrag(value, 'inactive', $event)"
          @dragend="endDrag"
        >
          <span class="priority-dnd-chip-label">{{ optionLabel(value) }}</span>
          <span v-if="optionDescription(value)" class="priority-dnd-chip-help">{{
            optionDescription(value)
          }}</span>
        </div>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import Button from '@/components/common/Button.vue'

type PriorityOption = {
  value: string
  label: string
  description?: string
}

type DragSource = 'active' | 'inactive'

type DragState = {
  value: string
  source: DragSource
}

const props = withDefaults(
  defineProps<{
    modelValue: string[]
    options: PriorityOption[]
    disabled?: boolean
    activeTitle?: string
    inactiveTitle?: string
    inactiveEmptyText?: string
    activeActionLabel?: string
    minActive?: number
    layout?: 'dual' | 'single'
  }>(),
  {
    disabled: false,
    activeTitle: '',
    inactiveTitle: '',
    inactiveEmptyText: '',
    activeActionLabel: '',
    minActive: 0,
    layout: 'dual',
  }
)

const emit = defineEmits<{
  (event: 'update:modelValue', value: string[]): void
}>()

const draggingItem = ref<DragState | null>(null)
const dropZone = ref<'active' | 'inactive' | null>(null)
const dropTargetValue = ref<string | null>(null)

const optionMap = computed(() => new Map(props.options.map((option) => [option.value, option])))
const validValues = computed(() => props.options.map((option) => option.value))

const activeValues = computed(() => normalizeSelectedValues(props.modelValue))
const activeSet = computed(() => new Set(activeValues.value))
const inactiveValues = computed(() => {
  return validValues.value.filter((value) => !activeSet.value.has(value))
})

const singleOrder = ref<string[]>([])
const singleContainerRef = ref<HTMLElement | null>(null)
const singleDragSource = ref<string | null>(null)
const singleDragTarget = ref<string | null>(null)
const singleDropPosition = ref<'before' | 'after' | null>(null)

const isDragActive = computed(() => draggingItem.value !== null)
const canDropToActive = computed(() => isDragActive.value && !props.disabled)
const canDropToInactive = computed(
  () =>
    isDragActive.value &&
    draggingItem.value?.source === 'active' &&
    activeValues.value.length > props.minActive &&
    !props.disabled
)

watch(
  activeValues,
  (next) => {
    if (!sameOrder(next, props.modelValue ?? [])) {
      emit('update:modelValue', next)
    }
  },
  { immediate: true }
)

watch(
  validValues,
  () => {
    syncSingleOrder()
  },
  { immediate: true }
)

function sameOrder(left: string[], right: string[]) {
  if (left.length !== right.length) return false
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) return false
  }
  return true
}

function normalizeSelectedValues(values: string[] | undefined): string[] {
  const source = Array.isArray(values) ? values : []
  const validSet = new Set(validValues.value)
  const seen = new Set<string>()
  const normalized: string[] = []
  source.forEach((value) => {
    if (!validSet.has(value)) return
    if (seen.has(value)) return
    seen.add(value)
    normalized.push(value)
  })
  if (normalized.length < props.minActive) {
    for (const value of validValues.value) {
      if (normalized.includes(value)) continue
      normalized.push(value)
      if (normalized.length >= props.minActive) break
    }
  }
  return normalized
}

function updateActiveValues(next: string[]) {
  emit('update:modelValue', normalizeSelectedValues(next))
}

function syncSingleOrder() {
  const valid = validValues.value
  const validSet = new Set(valid)
  const next = singleOrder.value.filter((value) => validSet.has(value))
  valid.forEach((value) => {
    if (!next.includes(value)) next.push(value)
  })
  singleOrder.value = next
}

function optionLabel(value: string) {
  return optionMap.value.get(value)?.label ?? value
}

function optionDescription(value: string) {
  return optionMap.value.get(value)?.description ?? ''
}

function singleActiveRank(value: string) {
  const index = activeValues.value.indexOf(value)
  return index >= 0 ? String(index + 1) : '-'
}

function toggleSingle(value: string, event: Event) {
  const checked = (event.target as HTMLInputElement | null)?.checked === true
  const nextActive = new Set(activeValues.value)
  if (checked) {
    nextActive.add(value)
  } else {
    if (nextActive.size <= props.minActive) return
    nextActive.delete(value)
  }
  updateActiveValues(singleOrder.value.filter((item) => nextActive.has(item)))
}

function startSingleDrag(value: string, event: DragEvent) {
  if (props.disabled) return
  singleDragSource.value = value
  singleDragTarget.value = value
  singleDropPosition.value = null
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.dropEffect = 'move'
    event.dataTransfer.setData('text/plain', `single:${value}`)
  }
}

function readSingleDragPayload(event: DragEvent) {
  const raw = String(event.dataTransfer?.getData('text/plain') ?? '').trim()
  if (!raw.startsWith('single:')) return ''
  return raw.slice('single:'.length).trim()
}

function onSingleDragOver(value: string, event: DragEvent) {
  const source = singleDragSource.value
  if (!source || source === value) return
  singleDragTarget.value = value
  const targetElement = event.currentTarget as HTMLElement | null
  const rect = targetElement?.getBoundingClientRect()
  if (rect) {
    singleDropPosition.value = event.clientY >= rect.top + rect.height / 2 ? 'after' : 'before'
  }
  if (event.dataTransfer) {
    event.dataTransfer.dropEffect = 'move'
  }
}

function moveSingleOrder(fromValue: string, toValue: string, position: 'before' | 'after' = 'before') {
  const next = [...singleOrder.value]
  const fromIndex = next.indexOf(fromValue)
  const toIndex = next.indexOf(toValue)
  if (fromIndex < 0 || toIndex < 0) return
  const [moved] = next.splice(fromIndex, 1)
  const normalizedTargetIndex = next.indexOf(toValue)
  if (!moved || normalizedTargetIndex < 0) return
  const insertIndex = normalizedTargetIndex + (position === 'after' ? 1 : 0)
  next.splice(insertIndex, 0, moved)
  if (sameOrder(next, singleOrder.value)) return
  singleOrder.value = next
  updateActiveValues(next.filter((value) => activeSet.value.has(value)))
}

function dropSingle(targetValue: string, event: DragEvent) {
  if (props.disabled) {
    endSingleDrag()
    return
  }
  const sourceValue = singleDragSource.value ?? readSingleDragPayload(event)
  if (!sourceValue) {
    endSingleDrag()
    return
  }
  moveSingleOrder(sourceValue, targetValue, singleDropPosition.value ?? 'before')
  endSingleDrag()
}

function resolveSingleContainerDrop(event: DragEvent): { value: string; position: 'before' | 'after' } | null {
  const container = singleContainerRef.value
  if (!container) return null
  const items = Array.from(container.querySelectorAll<HTMLElement>('.priority-dnd-single-item'))
  if (items.length === 0) return null
  const pointerY = Number(event.clientY)
  if (!Number.isFinite(pointerY)) return null

  for (const item of items) {
    const value = String(item.dataset.priorityValue ?? '').trim()
    if (!value) continue
    const rect = item.getBoundingClientRect()
    const middle = rect.top + rect.height / 2
    if (pointerY <= middle) {
      return { value, position: 'before' }
    }
    if (pointerY <= rect.bottom) {
      return { value, position: 'after' }
    }
  }

  const lastItem = items[items.length - 1]
  const lastValue = String(lastItem?.dataset.priorityValue ?? '').trim()
  if (!lastValue) return null
  return { value: lastValue, position: 'after' }
}

function onSingleContainerDragOver(event: DragEvent) {
  const sourceValue = singleDragSource.value ?? readSingleDragPayload(event)
  if (!sourceValue) return
  const hint = resolveSingleContainerDrop(event)
  if (!hint) return
  singleDragTarget.value = hint.value
  singleDropPosition.value = hint.position
  if (event.dataTransfer) {
    event.dataTransfer.dropEffect = 'move'
  }
}

function dropSingleByContainer(event: DragEvent) {
  if (props.disabled) {
    endSingleDrag()
    return
  }
  const sourceValue = singleDragSource.value ?? readSingleDragPayload(event)
  if (!sourceValue) {
    endSingleDrag()
    return
  }
  const hint = resolveSingleContainerDrop(event)
  if (!hint) {
    endSingleDrag()
    return
  }
  moveSingleOrder(sourceValue, hint.value, hint.position)
  endSingleDrag()
}

function endSingleDrag() {
  singleDragSource.value = null
  singleDragTarget.value = null
  singleDropPosition.value = null
}

function excludeValue(value: string) {
  const current = activeValues.value
  if (current.length <= props.minActive) return
  updateActiveValues(current.filter((item) => item !== value))
}

function startDrag(value: string, source: DragSource, event: DragEvent) {
  if (props.disabled) return
  draggingItem.value = { value, source }
  dropZone.value = null
  dropTargetValue.value = null
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.dropEffect = 'move'
    event.dataTransfer.setData('text/plain', `${source}:${value}`)
  }
}

function readDragPayload(event: DragEvent): DragState | null {
  const raw = String(event.dataTransfer?.getData('text/plain') ?? '').trim()
  if (!raw) return null
  const separator = raw.indexOf(':')
  if (separator <= 0) return null
  const source = raw.slice(0, separator)
  const value = raw.slice(separator + 1).trim()
  if (!value) return null
  if (source !== 'active' && source !== 'inactive') return null
  return { source, value }
}

function endDrag() {
  draggingItem.value = null
  dropZone.value = null
  dropTargetValue.value = null
}

function onActiveColumnDragOver() {
  if (!canDropToActive.value) return
  dropZone.value = 'active'
  dropTargetValue.value = null
}

function onActiveChipDragOver(value: string) {
  if (!canDropToActive.value) return
  dropZone.value = 'active'
  dropTargetValue.value = value
}

function onInactiveColumnDragOver() {
  if (!canDropToInactive.value) return
  dropZone.value = 'inactive'
  dropTargetValue.value = null
}

function dropToActive(targetValue: string) {
  if (props.disabled) return
  const dragged = draggingItem.value
  if (!dragged) return
  const current = activeValues.value
  const targetIndex = current.indexOf(targetValue)
  if (targetIndex < 0) {
    endDrag()
    return
  }

  if (dragged.source === 'active') {
    const fromIndex = current.indexOf(dragged.value)
    if (fromIndex < 0 || fromIndex === targetIndex) {
      endDrag()
      return
    }
    const next = [...current]
    next.splice(fromIndex, 1)
    const insertIndex = fromIndex < targetIndex ? targetIndex - 1 : targetIndex
    next.splice(insertIndex, 0, dragged.value)
    updateActiveValues(next)
    endDrag()
    return
  }

  if (!current.includes(dragged.value)) {
    const next = [...current]
    next.splice(targetIndex, 0, dragged.value)
    updateActiveValues(next)
  }
  endDrag()
}

function dropToActiveEnd() {
  if (props.disabled) return
  const dragged = draggingItem.value ?? null
  if (!dragged) return
  const current = activeValues.value
  if (dragged.source === 'active') {
    const fromIndex = current.indexOf(dragged.value)
    if (fromIndex < 0 || fromIndex === current.length - 1) {
      endDrag()
      return
    }
    const next = [...current]
    next.splice(fromIndex, 1)
    next.push(dragged.value)
    updateActiveValues(next)
    endDrag()
    return
  }
  if (!current.includes(dragged.value)) {
    updateActiveValues([...current, dragged.value])
  }
  endDrag()
}

function dropToInactive(event: DragEvent) {
  if (props.disabled) return
  const dragged = draggingItem.value ?? readDragPayload(event)
  if (!dragged || dragged.source !== 'active') {
    endDrag()
    return
  }
  const current = activeValues.value
  if (current.length <= props.minActive) {
    endDrag()
    return
  }
  updateActiveValues(current.filter((value) => value !== dragged.value))
  endDrag()
}
</script>

<style scoped>
.priority-dnd {
  gap: var(--space-2);
}

.priority-dnd-columns {
  display: grid;
  grid-template-columns: minmax(260px, 1fr) minmax(220px, 0.9fr);
  gap: var(--space-2);
}

@media (max-width: 900px) {
  .priority-dnd-columns {
    grid-template-columns: 1fr;
  }
}

.priority-dnd-column {
  gap: var(--space-1);
  min-height: 48px;
  border: 1px dashed var(--color-border);
  border-radius: var(--radius-md);
  padding: var(--space-1);
  background: var(--color-surface-soft);
  transition:
    border-color 120ms ease,
    background 120ms ease,
    box-shadow 120ms ease;
}

.priority-dnd-single {
  gap: 8px;
  border: 1px dashed var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-surface-soft);
  padding: var(--space-1);
}

.priority-dnd-single--disabled {
  opacity: 0.9;
}

.priority-dnd-single-item {
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: var(--color-surface);
  padding: 6px 8px;
  gap: 4px;
  transition:
    border-color 120ms ease,
    background 120ms ease,
    box-shadow 120ms ease;
}

.priority-dnd-single-item--active {
  border-color: #93c5fd;
}

.priority-dnd-single-item--inactive {
  opacity: 0.82;
}

.priority-dnd-single-item--drag-source {
  border-color: #1d4ed8;
  background: #e0ecff;
}

.priority-dnd-single-item--drag-target {
  border-color: #3b82f6;
  box-shadow: inset 0 0 0 1px rgba(59, 130, 246, 0.28);
}

.priority-dnd-single-row {
  align-items: center;
  gap: 8px;
}

.priority-dnd-single-help {
  margin-left: 52px;
}

.priority-dnd-column-head {
  align-items: center;
  justify-content: flex-start;
  padding: 2px 2px;
}

.priority-dnd-column-title {
  font-size: 0.86rem;
  color: var(--color-muted);
}

.priority-dnd-chip {
  align-items: center;
  gap: 6px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: var(--color-surface);
  padding: 6px 8px;
}

.priority-dnd-chip--active {
  cursor: grab;
}

.priority-dnd-chip--inactive {
  cursor: grab;
}

.priority-dnd-chip--dragging {
  opacity: 0.6;
}

.priority-dnd-chip--drop-target {
  border-color: #1d4ed8;
  background: #e0ecff;
  box-shadow: inset 0 0 0 1px rgba(29, 78, 216, 0.25);
}

.priority-dnd-column--drop-active {
  border-color: #1d4ed8;
  background:
    repeating-linear-gradient(
      -45deg,
      rgba(59, 130, 246, 0.12) 0 8px,
      rgba(59, 130, 246, 0.22) 8px 16px
    ),
    #e0ecff;
  box-shadow: inset 0 0 0 1px rgba(29, 78, 216, 0.35);
}

.priority-dnd-column--drop-disabled {
  border-color: #cbd5e1;
  background: #f8fafc;
  opacity: 0.92;
}

.priority-dnd-exclude {
  min-height: 28px;
  padding: 0 8px;
  font-size: 0.74rem;
}

.priority-dnd-rank {
  min-width: 1.5rem;
  height: 1.5rem;
  border-radius: 999px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: var(--color-surface-soft);
  color: var(--color-muted);
  font-size: 0.78rem;
  font-weight: 700;
}

.priority-dnd-rank--inactive {
  color: #94a3b8;
}

.priority-dnd-chip-label {
  flex: 0 0 auto;
  min-width: fit-content;
}

.priority-dnd-chip-help {
  flex: 1;
  min-width: 0;
  color: var(--color-muted);
  font-size: 0.72rem;
  line-height: 1.35;
}
</style>
