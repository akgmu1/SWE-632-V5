<script setup lang="ts">
import CategoryColor from '@/components/CategoryColor.vue'
import ConfirmationModal from '@/components/ConfirmationModal.vue'
import SortableList from '@/components/SortableList.vue'
import ToolTip from '@/components/ToolTip.vue'
import { DataManager } from '@/data'
import { ToolTipDirection } from '@/enums'
import {
  colorSimilarity,
  createFormState,
  dateToYYYYMMDD,
  dateTrim,
  parseColor,
  randomColor,
  SIMILAR_COLOR_THRESHOLD,
  triggerAddClass,
} from '@/helper'
import router from '@/router'
import {
  categoryManager,
  DEFAULT_CATEGORY,
  META_ADD_NEW_CATEGORY,
  PERM_CATEGORIES,
  type Category,
} from '@/schemas/category'
import { subtaskManager, type SubtaskLike } from '@/schemas/subtask'
import { taskManager, type Task } from '@/schemas/task'
import { ArrowsUpDownIcon } from '@heroicons/vue/24/solid'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch, type Ref } from 'vue'
import z from 'zod'
import BaseView from './BaseView.vue'

const categories = ref<Category[]>(categoryManager.all())
const existingCategory: Ref<number | undefined> = ref()

const form = createFormState(
  {
    title: '',
    selectedCategory: DEFAULT_CATEGORY,
    newCategoryName: '',
    newCategoryColor: randomColor(),
    dueDate: new Date(),
    rememberOptions: true,
  },
  {
    title: (x) => (x.trim().length > 0 ? '' : 'Title cannot be empty'),
    newCategoryName: (x, form) => {
      // No errors when not adding one
      existingCategory.value = undefined
      if (form.selectedCategory !== META_ADD_NEW_CATEGORY) {
        return ''
      }

      const name = x.trim()
      if (name.length === 0) {
        return 'Category name cannot be empty'
      }

      for (const c of categories.value) {
        if (c.name === name) {
          existingCategory.value = c.id
          return 'Category name already taken, please pick another name or select that category'
        }
      }

      return ''
    },
  },
)

const similarCurrentCategories = computed(() => {
  if (form.values.selectedCategory === META_ADD_NEW_CATEGORY) {
    const categories = categoryManager.filterBy(
      (x) =>
        colorSimilarity(parseColor(x.color), parseColor(form.values.newCategoryColor)) >
        SIMILAR_COLOR_THRESHOLD,
    )

    const result = []
    for (let c of categories) {
      // Skip meta categories
      if (PERM_CATEGORIES.includes(c.id) && c.id !== DEFAULT_CATEGORY) {
        continue
      }

      const percent = colorSimilarity(parseColor(c.color), parseColor(form.values.newCategoryColor))
      result.push({
        category: c,
        percent,
      })
    }

    return result
  } else {
    return []
  }
})

const currentCategory = computed(() => {
  return categoryManager.findBy('id', form.values.selectedCategory)!
})

const createButtonRef: Ref<HTMLInputElement | null> = ref(null)
const addSubtaskRef: Ref<HTMLInputElement | null> = ref(null)

const rememberedOptionsSchema = z.object({
  dueDate: z.coerce.date(),
  category: z.number(),
})

const rememberedOptions = new DataManager(rememberedOptionsSchema, 'add-task-remembered-options')

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

const tempSubtasks: Ref<SubtaskLike[]> = ref([])
let sortId: number = 0
const subtaskTextRef: Ref<HTMLInputElement | null> = ref(null)

async function addTempSubtask() {
  subtaskForm.touchAll()
  await nextTick()

  if (subtaskForm.state.hasErrors) {
    triggerAddClass(addSubtaskRef.value!, 'animate-shake')
    await nextTick()
    subtaskTextRef.value!.focus()
    return
  }

  const text = subtaskForm.values.newSubtaskText.trim()
  tempSubtasks.value.push({
    text,
    completed: false,
    sortId: sortId++,
  })
  subtaskForm.reset()
}

function toggleSubtask(subtask: SubtaskLike, completed: boolean) {
  subtask.completed = completed
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
  form.values.dueDate = x.dueDate
  form.values.selectedCategory = x.category
}

onMounted(() => {
  loadRememberedOptions()
})

function saveRememberedOptions() {
  if (!form.values.rememberOptions) return
  rememberedOptions.save({
    dueDate: dateTrim(form.values.dueDate),
    category: form.values.selectedCategory,
  })
}

const isAddingNewCategory = computed(() => form.values.selectedCategory === META_ADD_NEW_CATEGORY)

function onCategoryChange(val: number) {
  form.values.selectedCategory = val
  if (val !== META_ADD_NEW_CATEGORY) {
    form.values.newCategoryName = ''
    form.values.newCategoryColor = randomColor()
  }
}

async function onConfirm() {
  // Check for errors
  form.touchAll()
  await nextTick()

  if (form.state.hasErrors) {
    triggerAddClass(createButtonRef.value!, 'animate-shake')
    await nextTick()
    ;(document.querySelector('.input-error')! as HTMLInputElement).focus()
    return
  }

  let finalCategory: number = DEFAULT_CATEGORY

  if (isAddingNewCategory.value) {
    const newName = form.values.newCategoryName.trim()
    finalCategory = categoryManager.add({
      name: newName,
      color: form.values.newCategoryColor,
    })
    form.values.selectedCategory = finalCategory
  } else {
    finalCategory = form.values.selectedCategory
  }

  const text = form.values.title.trim()
  const createdAt = new Date()

  const newTaskId = taskManager.add({
    title: text,
    completed: false,
    dueDate: form.values.dueDate,
    category: finalCategory,
    created: createdAt,
  })

  for (const [index, s] of tempSubtasks.value.entries()) {
    subtaskManager.add({
      order: index,
      taskId: newTaskId,
      completed: s.completed,
      text: s.text,
    })
  }

  saveRememberedOptions()

  form.reset()
  subtaskForm.reset()
  tempSubtasks.value = []

  if (!form.values.rememberOptions) {
    form.values.dueDate = new Date()
    form.values.selectedCategory = DEFAULT_CATEGORY
  }

  taskList.value = taskManager.all()

  return router.push('/')
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
  return 'badge-soft'
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
  form.values.title = selectedTask.value.title
  form.values.dueDate = selectedTask.value.dueDate
  form.values.selectedCategory = selectedTask.value.category
}
</script>

<template>
  <BaseView title="Create Task">
    <div class="flex flex-col gap-4 w-1/2 mx-auto pb-4">
      <div class="flex flex-col gap-4 sm:flex-row">
        <div class="flex flex-col w-full">
          <input
            v-model="form.values.title"
            @blur="form.touch('title')"
            type="text"
            placeholder="Title"
            class="input-bordered input w-full"
            :class="{
              'input-error': form.touched.title && form.errors.title,
            }"
            @keyup.enter="onConfirm"
          />

          <label v-if="form.errors.title && form.touched.title" class="label">
            <div class="label-text-alt text-error text-wrap">
              {{ form.errors.title }}
            </div>
          </label>
        </div>

        <input
          type="date"
          :value="dateToYYYYMMDD(form.values.dueDate)"
          @input="
            form.values.dueDate = dateTrim(
              ($event.target as HTMLInputElement).valueAsDate ?? new Date(),
              true,
            )
          "
          class="input-bordered input w-full"
        />
      </div>

      <div class="flex items-center gap-3">
        <CategoryColor :category="currentCategory" />

        <select
          class="select-bordered select w-full"
          :value="form.values.selectedCategory"
          @change="onCategoryChange(Number(($event.target as HTMLSelectElement).value))"
        >
          <option value="" disabled>Selected Category (optional)</option>
          <option v-for="c in categories" :key="c.id" :value="c.id">
            {{ c.id === META_ADD_NEW_CATEGORY ? '+ Add new category…' : c.name }}
          </option>
        </select>
      </div>

      <div v-if="isAddingNewCategory" class="flex items-center gap-3">
        <ToolTip tip="Change Color" :direction="ToolTipDirection.Top">
          <label class="cursor-pointer">
            <input type="color" v-model="form.values.newCategoryColor" class="sr-only" />
            <CategoryColor :color="form.values.newCategoryColor" />
          </label>
        </ToolTip>
        <div class="flex flex-col w-full">
          <input
            v-model="form.values.newCategoryName"
            @blur="form.touch('newCategoryName')"
            type="text"
            placeholder="New category name"
            class="input-bordered input w-full"
            :class="{
              'input-error': form.touched.newCategoryName && form.errors.newCategoryName,
            }"
            @keyup.enter="onConfirm"
          />

          <label v-if="form.errors.newCategoryName && form.touched.newCategoryName" class="label">
            <div class="label-text-alt text-error text-wrap">
              {{ form.errors.newCategoryName }}
            </div>

            <template v-if="existingCategory !== undefined">
              <button
                class="btn btn-secondary btn-sm"
                @click="
                  () => {
                    form.values.selectedCategory = existingCategory!
                    form.values.newCategoryName = ''
                    form.errors.newCategoryName = ''
                    existingCategory = undefined
                  }
                "
              >
                Click to select that category
              </button>
            </template>
          </label>
        </div>
      </div>

      <div
        v-if="isAddingNewCategory && similarCurrentCategories.length > 0"
        class="rounded-xl border border-base-300 bg-base-100 p-4 shadow-sm"
      >
        <div class="alert alert-warning">
          <p>
            <span class="font-bold">Warning:</span>
            The color selected is similar to another category's color. Selecting it can result in a
            lower user experience.
          </p>
        </div>

        <button class="btn btn-outline my-3" @click="form.values.newCategoryColor = randomColor()">
          Select New Random Color
        </button>

        <div class="flex flex-col gap-2 pt-2">
          <div v-for="c in similarCurrentCategories" class="flex justify-between">
            <div class="flex gap-2">
              <CategoryColor :category="c.category" />
              <div>
                {{ c.category.name }}
              </div>
            </div>
            <div class="font-bold">{{ Math.trunc(c.percent * 100) }}% similar</div>
          </div>
        </div>
      </div>

      <div class="text-left">
        <div class="mb-2 font-semibold">Subtasks</div>

        <div v-if="tempSubtasks.length" class="space-y-2">
          <SortableList
            v-model="tempSubtasks"
            item-key="sortId"
            :options="{
              handle: '.handle',
            }"
            class="flex flex-col gap-2 border border-base-300 bg-base-100 rounded-box p-2"
          >
            <template #default="s">
              <div class="flex justify-between bg-base-200 rounded shadow p-2">
                <!-- Left Side -->
                <div class="flex gap-2 items-center">
                  <div class="handle cursor-grab border-primary border text-primary p-1 rounded">
                    <ArrowsUpDownIcon class="size-5" />
                  </div>
                  <input
                    type="checkbox"
                    class="checkbox"
                    :checked="s.item.completed"
                    @change="toggleSubtask(s.item, ($event.target as HTMLInputElement).checked)"
                  />
                  {{ s.item.text }}
                </div>

                <!-- Right side -->
                <button
                  type="button"
                  class="btn btn-error btn-xs"
                  @click="removeTempSubtask(s.index)"
                >
                  Remove
                </button>
              </div>
            </template>
          </SortableList>
        </div>

        <div class="flex flex-col">
          <div class="mt-3 flex gap-2">
            <input
              ref="subtaskTextRef"
              v-model="subtaskForm.values.newSubtaskText"
              class="input-bordered input w-full"
              placeholder="Add a subtask..."
              @keydown.enter.prevent="addTempSubtask"
              :class="{
                'input-error':
                  subtaskForm.errors.newSubtaskText && subtaskForm.touched.newSubtaskText,
              }"
            />
            <button
              ref="addSubtaskRef"
              type="button"
              class="btn btn-outline btn-primary"
              @click="addTempSubtask"
            >
              Add
            </button>
          </div>
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

      <label class="flex cursor-pointer items-center gap-2">
        <input type="checkbox" class="checkbox" v-model="form.values.rememberOptions" />
        <span>Remember Options</span>
      </label>
    </div>

    <div class="flex justify-center py-3">
      <div v-if="form.state.hasErrors" class="alert alert-error min-w-max">
        <span>Please fix the errors above</span>
      </div>
    </div>

    <div class="flex justify-center">
      <button class="btn btn-outline" @click="onCancel">Cancel</button>
      <div class="px-4"></div>
      <button ref="createButtonRef" class="btn btn-primary" @click="onConfirm">Create</button>
    </div>

    <div class="text-center font-bold text-lg pt-7">Recently Created Tasks</div>
    <div class="text-center text-base-content/70">Click a task to insert fields into the form</div>

    <div class="border border-base-300 bg-base-100 rounded-box p-6 mt-5 flex flex-col gap-3">
      <template v-if="sortedTaskList.length === 0">
        There are no recently created tasks, when there are you can insert them from here if you
        choose to.
      </template>
      <template v-else>
        <div
          v-for="task in sortedTaskList"
          :key="task.id"
          class="flex justify-between items-center bg-base-200 shadow hover:bg-base-300 hover:shadow rounded p-2 py-1 cursor-pointer"
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
            <div
              class="badge badge-sm md:badge-md h-auto"
              :class="dueBadgeClass(dueDateLabel(task))"
            >
              <b>Due:</b> {{ task.dueDate.toDateString() }}
            </div>
            <div class="badge badge-soft badge-sm md:badge-md h-auto">
              {{ createdDateLabel(task) }}
            </div>
          </div>
        </div>
      </template>
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
