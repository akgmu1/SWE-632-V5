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
import { subtaskManager } from '@/schemas/subtask'
import { taskManager, type Task } from '@/schemas/task'
import { computed, onMounted, ref, type Ref } from 'vue'
import z from 'zod'
import BaseView from './BaseView.vue'

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
const selectedCategory = ref<number>(DEFAULT_CATEGORY)
const newCategoryName = ref('')
const newCategoryColor = ref(randomColor())

const currentCategory = computed(() => {
  return categoryManager.findBy('id', selectedCategory.value)!
})

const newSubtaskText = ref('')
const tempSubtasks = ref<string[]>([])

function addTempSubtask() {
  const text = newSubtaskText.value.trim()
  if (!text) return

  tempSubtasks.value.push(text)
  newSubtaskText.value = ''
}

function removeTempSubtask(index: number) {
  tempSubtasks.value.splice(index, 1)
}

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

onMounted(() => {
  loadRememberedOptions()
})

function saveRememberedOptions() {
  if (!rememberOptions.value) return
  rememberedOptions.save({
    dueDate: dateTrim(dueDate.value),
    category: selectedCategory.value,
  })
}

const modalRef: Ref<InstanceType<typeof ConfirmationModal> | null> = ref(null)

defineExpose({
  showModal: () => {
    categories.value = categoryManager.all()
    selectedCategory.value = DEFAULT_CATEGORY
    newCategoryName.value = ''
    newCategoryColor.value = randomColor()
    newSubtaskText.value = ''
    tempSubtasks.value = []

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
  const createdAt = new Date()

  const newTaskId = taskManager.add({
    title: text,
    completed: false,
    dueDate: dueDate.value,
    category: finalCategory,
    created: createdAt,
  })

  tempSubtasks.value.forEach((subtaskText) => {
    subtaskManager.add({
      taskId: newTaskId,
      completed: false,
      text: subtaskText,
    })
  })

  saveRememberedOptions()

  title.value = ''
  newSubtaskText.value = ''
  tempSubtasks.value = []

  if (!rememberOptions.value) {
    dueDate.value = new Date()
    selectedCategory.value = DEFAULT_CATEGORY
  }

  newCategoryName.value = ''
  newCategoryColor.value = randomColor()

  taskList.value = taskManager.all()

  router.push('/')
}

function onCancel() {
  if (history.state?.back) {
    router.back()
  } else {
    router.push('/')
  }
}

const taskList = ref(taskManager.all())
const sortedTaskList: Ref<Task[]> = computed(() => {
  return [...taskList.value].sort((a, b) => b.created.getTime() - a.created.getTime())
})

function dueDateLabel(task: Task): string {
  const rawDate = task.dueDate

  if (Number.isNaN(rawDate.getTime())) return ''
  const date = dateTrim(rawDate)

  const today = dateTrim(new Date())
  const diffMs = date.getTime() - today.getTime()
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24))

  if (diffDays === 0) return 'Due today'
  if (diffDays === 1) return 'Due in 1 day'
  if (diffDays > 1) return `Due in ${diffDays} days`
  if (diffDays === -1) return 'Overdue by 1 day'
  return `Overdue by ${Math.abs(diffDays)} days`
}

function dueBadgeClass(dueLabel: string): string {
  if (!dueLabel) return ''
  if (dueLabel.startsWith('Overdue')) return 'badge-error'
  if (dueLabel === 'Due today') return 'badge-warning'
  return 'badge-ghost'
}

function createdDateLabel(task: Task): string {
  const rawDate = task.created

  if (Number.isNaN(rawDate.getTime())) return ''
  const date = dateTrim(rawDate)

  const today = dateTrim(new Date())
  const diffMs = today.getTime() - date.getTime()
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24))

  if (diffDays === 0) return 'Created today'
  if (diffDays === 1) return 'Created 1 day ago'
  if (diffDays >= 30) return 'Created over a month ago'
  if (diffDays > 1) return `Created ${diffDays} days ago`
  return 'Created today'
}

const selectedTask: Ref<Task | undefined> = ref(undefined)

const confirmInsertModalRef: Ref<InstanceType<typeof ConfirmationModal> | null> = ref(null)
function confirmInsert() {
  if (selectedTask.value === undefined) {
    return
  }
  title.value = selectedTask.value.title
  dueDate.value = selectedTask.value.dueDate
  selectedCategory.value = selectedTask.value.category
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
            {{ c.id === META_ADD_NEW_CATEGORY ? '+ Add new category…' : c.name }}
          </option>
        </select>
      </div>

      <div v-if="isAddingNewCategory" class="flex items-center gap-3">
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

      <div class="text-left">
        <div class="mb-2 font-semibold">Subtasks</div>

        <div v-if="tempSubtasks.length" class="space-y-2">
          <div
            v-for="(subtask, index) in tempSubtasks"
            :key="`temp-${index}`"
            class="flex items-center gap-2"
          >
            <div class="flex-1 rounded bg-base-200 px-3 py-2">
              {{ subtask }}
            </div>

            <button type="button" class="btn btn-ghost btn-xs" @click="removeTempSubtask(index)">
              Remove
            </button>
          </div>
        </div>

        <div class="mt-3 flex gap-2">
          <input
            v-model="newSubtaskText"
            class="input-bordered input w-full"
            placeholder="Add a subtask..."
            @keydown.enter.prevent="addTempSubtask"
          />
          <button type="button" class="btn btn-primary" @click="addTempSubtask">Add</button>
        </div>
      </div>

      <label class="flex cursor-pointer items-center gap-2">
        <input type="checkbox" class="checkbox" v-model="rememberOptions" />
        <span>Remember Options</span>
      </label>
    </div>

    <div class="flex justify-center">
      <button class="btn btn-outline" @click="onCancel">Cancel</button>
      <div class="px-4"></div>
      <button class="btn btn-success" @click="onConfirm">
        <slot name="confirm"> Create </slot>
      </button>
    </div>

    <div class="text-center font-bold text-lg pt-7">Recently Created Tasks</div>
    <div class="text-center text-base-content/70">Click a task to insert fields into the form</div>

    <div class="border border-base-300 bg-base-100 rounded-box p-6 mt-5 flex flex-col gap-2">
      <div
        v-for="task in sortedTaskList"
        :key="task.id"
        class="flex justify-between items-center hover:bg-base-300 hover:shadow rounded p-2 py-1 cursor-pointer"
        @click="
          () => {
            selectedTask = task
            confirmInsertModalRef?.showModal()
          }
        "
      >
        <div class="flex gap-3 items-center">
          <input
            class="checkbox m-0 pointer-events-none"
            type="checkbox"
            :checked="task.completed"
          />

          <CategoryColor :category="categoryManager.findBy('id', task.category)" :size="4" />

          <div class="flex flex-col gap-2">
            <div class="truncate">Task: {{ task.title }}</div>
            <div class="badge badge-outline badge-sm md:badge-md h-auto">
              {{ categoryManager.findBy('id', task.category)?.name }}
            </div>
          </div>
        </div>

        <div class="flex gap-2 flex-col lg:flex-row">
          <div class="badge badge-sm md:badge-md h-auto" :class="dueBadgeClass(dueDateLabel(task))">
            <b>Due:</b> {{ task.dueDate.toDateString() }}
          </div>
          <div class="badge badge-ghost badge-sm md:badge-md h-auto">
            {{ createdDateLabel(task) }}
          </div>
        </div>
      </div>
    </div>
  </BaseView>

  <ConfirmationModal
    ref="confirmInsertModalRef"
    title="Insert task fields"
    @confirm="confirmInsert"
  >
    Clicking on <b>Confirm</b> will fill in the form with the information used to create this task.
    <div class="py-2 text-center font-bold">"{{ selectedTask?.title }}"</div>
    It will overwrite any previously written data in the form.
  </ConfirmationModal>
</template>
