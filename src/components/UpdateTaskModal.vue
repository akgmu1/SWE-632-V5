<script setup lang="ts">
import { ToolTipDirection } from '@/enums'
import { createFormState, dateToYYYYMMDD, dateTrim, randomColor, triggerAddClass } from '@/helper'
import {
  categoryManager,
  DEFAULT_CATEGORY,
  META_ADD_NEW_CATEGORY,
  type Category,
} from '@/schemas/category'
import { subtaskManager, type Subtask } from '@/schemas/subtask'
import type { Task } from '@/schemas/task'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch, type Ref } from 'vue'
import BaseModal from './BaseModal.vue'
import CategoryColor from './CategoryColor.vue'
import ConfirmationModal from './ConfirmationModal.vue'
import ToolTip from './ToolTip.vue'

interface Emits {
  (e: 'updateTask', task: Task, subtask: boolean): void
}

const emits = defineEmits<Emits>()

const subtaskForm = createFormState(
  {
    newSubtaskText: '',
  },
  {
    newSubtaskText: (x) => {
      if (x.trim().length === 0) {
        return 'Subtask text cannot be empty'
      }

      return ''
    },
  },
)

let timeout: number | undefined = undefined
watch(subtaskForm.state, (s) => {
  if (s.hasErrors) {
    clearTimeout(timeout)
    timeout = setTimeout(() => {
      subtaskForm.clearTouchAndErrors()
    }, 3000)
  }
})

onBeforeUnmount(() => {
  clearTimeout(timeout)
})

const task: Ref<Task | undefined> = ref(undefined)
const subtasks: Ref<Subtask[]> = ref([])
const tempSubtasks = ref<string[]>([])

const dueDate = ref(new Date())

const categories: Ref<Category[]> = ref(categoryManager.all())
const selectedCategory = ref<number>(0)
const newCategoryName = ref('')
const newCategoryColor = ref(randomColor())

const currentCategory = computed(() => {
  return categoryManager.findBy('id', selectedCategory.value)!
})

const isAddingNewCategory = computed(() => selectedCategory.value === META_ADD_NEW_CATEGORY)

function onCategoryChange(val: number) {
  selectedCategory.value = val
  if (val !== META_ADD_NEW_CATEGORY) {
    newCategoryName.value = ''
    newCategoryColor.value = randomColor()
  }
}

const addSubtaskRef: Ref<HTMLElement | null> = ref(null)
async function addSubtask() {
  subtaskForm.touchAll()
  await nextTick()

  if (subtaskForm.state.hasErrors) {
    triggerAddClass(addSubtaskRef.value!, 'animate-shake')
    await nextTick()
    ;(document.querySelector('.input-error')! as HTMLInputElement).focus()
    return
  }

  const text = subtaskForm.values.newSubtaskText.trim()
  tempSubtasks.value.push(text)
  subtaskForm.reset()
}

function removeTempSubtask(index: number) {
  tempSubtasks.value.splice(index, 1)
}

function toggleSubtask(subtask: Subtask, completed: boolean) {
  if (!task.value) return

  subtaskManager.updateBy('id', subtask.id, {
    completed,
  })

  emits('updateTask', task.value, true)
}

function removeSubtask(subtask: Subtask) {
  if (!task.value) return

  subtaskManager.removeBy('id', subtask.id)
  subtasks.value = subtaskManager.filterBy('taskId', task.value.id)

  emits('updateTask', task.value, true)
}

const modalRef: Ref<InstanceType<typeof BaseModal> | null> = ref(null)

defineExpose({
  showModal: (t: Task) => {
    categories.value = categoryManager.all()
    task.value = t
    selectedCategory.value = t.category
    subtasks.value = subtaskManager.filterBy('taskId', t.id)
    tempSubtasks.value = []
    dueDate.value = t.dueDate
    title.value = t.title.trim()
    checkTitle()
    newCategoryName.value = ''
    newCategoryColor.value = randomColor()

    subtaskForm.reset()

    modalRef.value!.showModal()
  },
  close: () => {
    modalRef.value!.close()
  },
})

const title: Ref<string> = ref('')
const titleErrorStr: Ref<string> = ref('')
const hadError = computed(() => titleErrorStr.value)

async function checkTitle() {
  titleErrorStr.value = ''

  const trimmed = title.value.trim()
  if (trimmed.length === 0) {
    titleErrorStr.value = 'Title can not be empty'
    return
  }
}

onMounted(() => {
  checkTitle()
})

const canConfirm = computed(() => {
  if (hadError.value) return false
  if (!title.value.trim()) return false
  if (isAddingNewCategory.value) {
    return newCategoryName.value.trim().length > 0
  }
  return true
})

function onConfirm(): void {
  if (!canConfirm.value || !task.value) return

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

  const updatedTask: Task = {
    ...task.value,
    title: title.value.trim(),
    category: finalCategory,
    dueDate: dateTrim(dueDate.value),
  }

  emits('updateTask', updatedTask, true)

  // Existing task flow: attach newly added subtasks immediately.
  // If your create page uses a different component, copy this same pattern there.
  tempSubtasks.value.forEach((text) => {
    subtaskManager.add({
      taskId: updatedTask.id,
      completed: false,
      text,
    })
  })

  subtasks.value = subtaskManager.filterBy('taskId', updatedTask.id)
  tempSubtasks.value = []

  subtaskForm.reset()
  newCategoryName.value = ''
  newCategoryColor.value = randomColor()
}
</script>

<template>
  <ConfirmationModal
    ref="modalRef"
    title="Update Task"
    @confirm="onConfirm"
    :should-close="canConfirm"
    :positive="true"
  >
    <div class="container mx-auto pt-4 text-center">
      <div class="flex flex-col gap-4 sm:flex-row">
        <label class="w-full input">
          <span class="label">Title</span>
          <div class="flex justify-center">
            <input
              :class="{ 'input-error': titleErrorStr }"
              :placeholder="task?.title"
              @input="checkTitle"
              v-model="title"
            />
          </div>
        </label>

        <input
          type="date"
          :value="dateToYYYYMMDD(dueDate)"
          @input="
            dueDate = dateTrim(($event.target as HTMLInputElement).valueAsDate ?? new Date(), true)
          "
          class="input-bordered input w-full"
        />
      </div>

      <div :hidden="!titleErrorStr" class="text-error">Error: {{ titleErrorStr }}</div>

      <div class="mx-auto mt-6 flex items-center gap-3">
        <CategoryColor :category="currentCategory" />

        <select
          class="select-bordered select w-full"
          :value="selectedCategory"
          @change="onCategoryChange(Number(($event.target as HTMLSelectElement).value))"
        >
          <option value="" disabled>Selected Category (optional)</option>
          <option v-for="c in categories" :key="c.id" :value="c.id">
            {{ c.id === META_ADD_NEW_CATEGORY ? '+ Add new category…' : c.name }}
          </option>
        </select>
      </div>

      <div v-if="isAddingNewCategory" class="mt-6 flex items-center gap-3">
        <ToolTip tip="Change Color" :direction="ToolTipDirection.Right">
          <button
            type="button"
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

      <div class="mt-6 text-left">
        <div class="mb-2 font-semibold">Subtasks</div>

        <div v-if="subtasks.length || tempSubtasks.length" class="space-y-2">
          <div v-for="s in subtasks" :key="s.id" class="flex items-center gap-2">
            <input
              type="checkbox"
              class="checkbox"
              :checked="s.completed"
              @change="toggleSubtask(s, ($event.target as HTMLInputElement).checked)"
            />

            <div class="flex-1" :class="{ 'line-through opacity-60': s.completed }">
              {{ s.text }}
            </div>

            <button type="button" class="btn btn-ghost btn-xs" @click="removeSubtask(s)">
              Remove
            </button>
          </div>

          <div
            v-for="(s, index) in tempSubtasks"
            :key="`temp-${index}`"
            class="flex items-center gap-2"
          >
            <div class="flex-1">
              {{ s }}
            </div>

            <button type="button" class="btn btn-ghost btn-xs" @click="removeTempSubtask(index)">
              Remove
            </button>
          </div>
        </div>

        <div class="flex flex-col mt-5">
          <div class="flex gap-2">
            <input
              v-model="subtaskForm.values.newSubtaskText"
              class="input-bordered input w-full"
              placeholder="Add a subtask..."
              @keydown.enter.prevent="addSubtask"
              :class="{
                'input-error':
                  subtaskForm.errors.newSubtaskText && subtaskForm.touched.newSubtaskText,
              }"
            />
            <button ref="addSubtaskRef" type="button" class="btn btn-primary" @click="addSubtask">
              Add
            </button>
          </div>
          <label
            v-if="subtaskForm.errors.newSubtaskText && subtaskForm.touched.newSubtaskText"
            class="label"
          >
            <div class="label-text-alt text-error text-wrap">
              {{ subtaskForm.errors.newSubtaskText }}
            </div>
          </label>
        </div>
      </div>
    </div>

    <template #confirm> Update </template>
  </ConfirmationModal>
</template>
