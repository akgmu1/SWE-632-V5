<script setup lang="ts">
import CategoryColor from '@/components/CategoryColor.vue'
import ConfirmationModal from '@/components/ConfirmationModal.vue'
import ToolTip from '@/components/ToolTip.vue'
import { DataManager } from '@/data'
import { ToolTipDirection } from '@/enums'
import { dateToYYYYMMDD, dateTrim, randomColor } from '@/helper'
import router from '@/router'
import {
  categoryManager,
  DEFAULT_CATEGORY,
  META_ADD_NEW_CATEGORY,
  type Category,
} from '@/schemas/category'
import { taskManager, type CreateTask } from '@/schemas/task'
import { computed, ref, type Ref } from 'vue'
import z from 'zod'
import BaseView from './BaseView.vue'

// interface Emits {
//   (e: 'addTask', task: CreateTask): void
// }
// const emits = defineEmits<Emits>()

const inputRef: Ref<HTMLInputElement | null> = ref(null)

const title = ref('')
const dueDate = ref(new Date())
const rememberOptions = ref(true)

const rememberedOptionsSchema = z.object({
  dueDate: z.coerce.date(),
  category: z.number(),
})

const rememberedOptions = new DataManager(rememberedOptionsSchema, 'add-task-remembered-options')

const categories = ref<Category[]>(categoryManager.all())
const selectedCategory = ref<number>(0)
const newCategoryName = ref('')
const newCategoryColor = ref(randomColor())
const currentCategory = computed(() => {
  return categoryManager.findBy('id', selectedCategory.value)!
})

function loadRememberedOptions() {
  const x = rememberedOptions.load()
  if (x === undefined) {
    return
  }
  if (categoryManager.findBy('id', x.category) === undefined) {
    x.category = DEFAULT_CATEGORY
  }
  dueDate.value = x.dueDate
  selectedCategory.value = x.category
}

function saveRememberedOptions() {
  if (!rememberOptions.value) return
  rememberedOptions.save({
    dueDate: dateTrim(dueDate.value),
    category: selectedCategory.value, // TODO: Make sure not save META add
  })
}

const modalRef: Ref<InstanceType<typeof ConfirmationModal> | null> = ref(null)

defineExpose({
  showModal: () => {
    categories.value = categoryManager.all()
    selectedCategory.value = DEFAULT_CATEGORY
    newCategoryName.value = ''
    newCategoryColor.value = randomColor()

    loadRememberedOptions()

    modalRef.value!.showModal()
    setTimeout(() => inputRef.value?.focus(), 0)
  },
  close: () => modalRef.value!.close(),
})

const isAddingNewCategory = computed(() => selectedCategory.value === META_ADD_NEW_CATEGORY)

function onCategoryChange(val: number) {
  selectedCategory.value = val
  if (val !== META_ADD_NEW_CATEGORY) {
    newCategoryName.value = ''
    newCategoryColor.value = randomColor()
  }
}

const canConfirm = computed(() => {
  if (!title.value.trim()) return false
  if (isAddingNewCategory.value) {
    return newCategoryName.value.trim().length > 0
  }
  return true
})

function onConfirm() {
  if (!canConfirm.value) return

  let finalCategory: number = DEFAULT_CATEGORY

  if (isAddingNewCategory.value) {
    const newName = newCategoryName.value.trim()
    finalCategory = categoryManager.add({
      name: newName,
      color: newCategoryColor.value,
    })
    selectedCategory.value = finalCategory
  } else {
    finalCategory = selectedCategory.value
  }

  const text = title.value.trim()

  taskManager.add({
    title: text,
    completed: false,
    dueDate: dueDate.value,
    category: finalCategory,
  })

  saveRememberedOptions()

  title.value = ''

  if (!rememberOptions.value) {
    dueDate.value = new Date()
    selectedCategory.value = DEFAULT_CATEGORY
  }

  newCategoryName.value = ''
  newCategoryColor.value = randomColor()

  router.push('/')
}
</script>

<template>
  <BaseView title="Create Task">
    <div class="flex flex-col gap-4 w-1/2 mx-auto pb-4">
      <div class="flex flex-col gap-4 sm:flex-row">
        <input
          ref="inputRef"
          v-model="title"
          type="text"
          placeholder="Title"
          class="input-bordered input w-full"
          @keyup.enter="onConfirm"
        />

        <input
          type="date"
          :value="dateToYYYYMMDD(dueDate)"
          @input="
            dueDate = dateTrim(($event.target as HTMLInputElement).valueAsDate ?? new Date(), true)
          "
          class="input-bordered input w-full"
        />
      </div>

      <div class="flex items-center gap-3">
        <CategoryColor :category="currentCategory" />

        <select
          class="select-bordered select w-full"
          :value="selectedCategory"
          @change="onCategoryChange(Number(($event.target as HTMLSelectElement).value))"
        >
          <option value="" disabled>Selected Category (optional)</option>
          <option v-for="c in categories" :key="c.id" :value="c.id">
            <div v-if="c.id === META_ADD_NEW_CATEGORY">+ Add new category…</div>
            <div v-else>{{ c.name }}</div>
          </option>
        </select>
      </div>
      <div v-if="isAddingNewCategory" class="flex items-center gap-3">
        <ToolTip tip="Change Color" :direction="ToolTipDirection.Right">
          <button
            @click="
              () => {
                newCategoryColor = randomColor()
              }
            "
            class="cursor-pointer"
          >
            <CategoryColor :color="newCategoryColor" />
          </button>
        </ToolTip>
        <input
          v-model="newCategoryName"
          type="text"
          placeholder="New category name"
          class="input-bordered input w-full"
          @keyup.enter="onConfirm"
        />
      </div>

      <!-- Remember Options -->
      <label class="flex cursor-pointer items-center gap-2">
        <input type="checkbox" class="checkbox" v-model="rememberOptions" />
        <span>Remember Options</span>
      </label>
    </div>
    <div class="flex justify-center">
      <button class="btn btn-outline" @click="">Cancel</button>
      <div class="px-4"></div>
      <button class="btn btn-success" @click="onConfirm">
        <slot name="confirm"> Create </slot>
      </button>
    </div>
  </BaseView>
</template>
