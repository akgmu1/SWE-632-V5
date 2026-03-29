<script setup lang="ts" generic="T">
import Sortable, { type SortableOptions } from 'sortablejs'
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'

interface Props {
  modelValue: T[]
  itemKey?: keyof T | ((item: T) => string | number)
  options?: SortableOptions
  tag?: string
}

const props = defineProps<Props>()

interface Emits {
  (e: 'update:modelValue', value: T[]): void
}

const emit = defineEmits<Emits>()

const el = ref<HTMLElement | null>(null)
let sortable: Sortable | null = null

onMounted(() => {
  if (!el.value) return

  sortable = Sortable.create(el.value, {
    animation: 150,
    ...props.options,
    onEnd(evt) {
      if (evt.oldIndex == null || evt.newIndex == null) return

      const newValue = [...props.modelValue]
      const [moved] = newValue.splice(evt.oldIndex, 1)

      if (moved === undefined) return

      newValue.splice(evt.newIndex, 0, moved)

      emit('update:modelValue', newValue)
    },
  })
})

onBeforeUnmount(() => {
  sortable?.destroy()
  sortable = null
})

watch(
  () => props.options,
  (options) => {
    if (!sortable || !options) return

    Object.entries(options).forEach(([key, value]) => {
      sortable!.option(key as keyof SortableOptions, value)
    })
  },
  { deep: true },
)
</script>

<template>
  <component :is="tag || 'div'" ref="el" v-bind="$attrs">
    <template
      v-for="(item, index) in modelValue"
      :key="itemKey ? (typeof itemKey === 'function' ? itemKey(item) : item[itemKey]) : index"
    >
      <slot :item="item" :index="index" />
    </template>
  </component>
</template>
