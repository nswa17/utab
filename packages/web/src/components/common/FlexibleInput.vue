<template>
  <div class="flexible" @click="startEdit">
    <span v-if="!editing" class="text">{{ displayText }}</span>
    <input
      v-else
      ref="inputRef"
      class="input"
      :type="inputType"
      v-model="innerText"
      @keyup.esc="cancelEdit"
      @keydown.enter.prevent="submit"
      @blur="cancelEdit"
      :disabled="loading"
    />
    <span v-if="!editing && !loading" class="icon">✎</span>
    <span v-if="loading" class="icon">…</span>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'

const props = withDefaults(
  defineProps<{
    text: string | number
    loading?: boolean
    type?: 'string' | 'number'
  }>(),
  {
    loading: false,
    type: 'string',
  }
)

const emit = defineEmits<{
  (event: 'text-update', value: string | number): void
  (event: 'start'): void
}>()

const editing = ref(false)
const innerText = ref('')
const previousText = ref('')
const inputRef = ref<HTMLInputElement | null>(null)

const inputType = computed(() => (props.type === 'number' ? 'number' : 'text'))
const displayText = computed(() => String(props.text ?? ''))

function startEdit() {
  if (props.loading) return
  editing.value = true
}

function submit() {
  if (!editing.value) return
  editing.value = false
  emit('text-update', props.type === 'number' ? Number(innerText.value) : innerText.value)
}

function cancelEdit() {
  if (!editing.value) return
  editing.value = false
  innerText.value = previousText.value
}

watch(
  () => props.text,
  (value) => {
    innerText.value = props.type === 'number' ? String(value ?? '') : String(value ?? '')
  },
  { immediate: true }
)

watch(editing, async (value) => {
  if (!value) return
  emit('start')
  previousText.value = innerText.value
  await nextTick()
  inputRef.value?.focus()
})
</script>

<style scoped>
.flexible {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
}

.text {
  padding: 4px 6px;
}

.input {
  border: none;
  border-bottom: 1px solid #d1d5db;
  padding: 4px 6px;
  background: rgba(148, 163, 184, 0.1);
}

.icon {
  font-size: 12px;
  color: #6b7280;
}
</style>
