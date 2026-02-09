<template>
  <div class="draggable-list">
    <div v-for="(item, index) in items" :key="item.value" class="row item">
      <Button
        variant="ghost"
        size="sm"
        :aria-label="$t('上に移動')"
        @click="moveUp(index)"
        :disabled="index === 0"
      >
        ↑
      </Button>
      <Button
        variant="ghost"
        size="sm"
        :aria-label="$t('下に移動')"
        @click="moveDown(index)"
        :disabled="index === items.length - 1"
      >
        ↓
      </Button>
      <Button variant="ghost" size="sm" @click="toggle(item)">
        {{ item.disabled ? $t('有効化') : $t('無効化') }}
      </Button>
      <span :class="{ disabled: item.disabled }">{{ label(item.value) }}</span>
      <span v-if="!item.disabled" class="badge">{{ activeIndex(item.value) }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import Button from '@/components/common/Button.vue'

type DraggableItem = {
  value: string
  disabled: boolean
}

const props = defineProps<{
  list: string[]
  labels?: Record<string, string>
}>()

const emit = defineEmits<{
  (event: 'change', value: string[]): void
}>()

const items = ref<DraggableItem[]>([])
const { t: $t } = useI18n({ useScope: 'global' })

const activeValues = computed(() =>
  items.value.filter((item) => !item.disabled).map((item) => item.value)
)

function init() {
  items.value = props.list.map((value) => ({ value, disabled: false }))
}

function label(value: string) {
  return props.labels?.[value] ?? value
}

function moveUp(index: number) {
  if (index <= 0) return
  const next = [...items.value]
  const temp = next[index - 1]
  next[index - 1] = next[index]
  next[index] = temp
  items.value = next
}

function moveDown(index: number) {
  if (index >= items.value.length - 1) return
  const next = [...items.value]
  const temp = next[index + 1]
  next[index + 1] = next[index]
  next[index] = temp
  items.value = next
}

function toggle(item: DraggableItem) {
  item.disabled = !item.disabled
}

function activeIndex(value: string) {
  return activeValues.value.findIndex((item) => item === value) + 1
}

watch(
  () => props.list,
  () => init(),
  { immediate: true }
)

watch(
  items,
  () => {
    emit('change', activeValues.value)
  },
  { deep: true }
)
</script>

<style scoped>
.draggable-list {
  display: grid;
  gap: 8px;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  padding: 8px;
}

.item {
  align-items: center;
  gap: 8px;
}

.disabled {
  color: #9ca3af;
}

.badge {
  background: #2563eb;
  color: #fff;
  border-radius: 999px;
  padding: 2px 8px;
  font-size: 12px;
}
</style>
