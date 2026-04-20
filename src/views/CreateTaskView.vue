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
    <div class="mx-auto flex w-full max-w-7xl flex-col gap-8 pb-10 xl:gap-10">
      <!-- Top content area -->
      <div class="grid grid-cols-1 gap-8 xl:grid-cols-[1.2fr_0.9fr]">
        <!-- Main form -->
        <div class="rounded-3xl border border-base-300 bg-base-100 p-6 shadow-sm xl:p-8">
          <div class="mb-6">
            <div class="text-lg font-semibold">Create a New Task</div>
            <div class="mt-1 text-sm text-base-content/60">
              Fill out the task details, choose a category, and optionally add subtasks.
            </div>
          </div>

          <div class="space-y-6">
            <!-- Task details -->
            <section class="rounded-2xl bg-base-200/50 p-5">
              <div class="mb-1 text-sm font-bold text-base-content">Task Details</div>
              <div class="mb-4 text-sm text-base-content/60">
                Start by entering the main task name.
              </div>

              <div class="grid grid-cols-1 gap-4 md:grid-cols-[1fr_220px]">
                <div class="flex flex-col">
                  <input
                    v-model="form.values.title"
                    @blur="form.touch('title')"
                    type="text"
                    placeholder="Task title"
                    class="input-bordered input input-lg w-full bg-base-100"
                    :class="{
                      'input-error': form.touched.title && form.errors.title,
                    }"
                    @keyup.enter="onConfirm"
                  />

                  <label v-if="form.errors.title && form.touched.title" class="label pb-0">
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
                  class="input-bordered input input-sm w-full bg-base-100 self-center"
                />
              </div>
            </section>

            <!-- Category -->
            <section class="rounded-2xl bg-base-200/50 p-5">
              <div class="mb-4 text-xs font-semibold uppercase tracking-wide text-base-content/60">
                Category
              </div>

              <div class="flex items-center gap-3">
                <div
                  class="flex h-11 w-11 items-center justify-center rounded-xl border border-base-300 bg-base-100"
                >
                  <CategoryColor :category="currentCategory" />
                </div>

                <select
                  class="select-bordered select w-full bg-base-100"
                  :value="form.values.selectedCategory"
                  @change="onCategoryChange(Number(($event.target as HTMLSelectElement).value))"
                >
                  <option value="" disabled>Selected Category (optional)</option>
                  <option v-for="c in categories" :key="c.id" :value="c.id">
                    {{ c.id === META_ADD_NEW_CATEGORY ? '+ Add new category…' : c.name }}
                  </option>
                </select>
              </div>

              <div v-if="isAddingNewCategory" class="mt-4 flex items-start gap-3">
                <ToolTip tip="Change Color" :direction="ToolTipDirection.Top">
                  <label
                    class="flex h-11 w-11 cursor-pointer items-center justify-center rounded-xl border border-base-300 bg-base-100"
                  >
                    <input type="color" v-model="form.values.newCategoryColor" class="sr-only" />
                    <CategoryColor :color="form.values.newCategoryColor" />
                  </label>
                </ToolTip>

                <div class="flex w-full flex-col">
                  <input
                    v-model="form.values.newCategoryName"
                    @blur="form.touch('newCategoryName')"
                    type="text"
                    placeholder="New category name"
                    class="input-bordered input w-full bg-base-100"
                    :class="{
                      'input-error': form.touched.newCategoryName && form.errors.newCategoryName,
                    }"
                    @keyup.enter="onConfirm"
                  />

                  <label
                    v-if="form.errors.newCategoryName && form.touched.newCategoryName"
                    class="label pb-0"
                  >
                    <div class="label-text-alt text-error text-wrap">
                      {{ form.errors.newCategoryName }}
                    </div>

                    <template v-if="existingCategory !== undefined">
                      <button
                        class="btn btn-secondary btn-sm mt-2"
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
                class="mt-4 rounded-2xl border border-warning/30 bg-warning/10 p-4"
              >
                <div class="mb-3 text-sm">
                  <span class="font-bold">Warning:</span>
                  The color selected is similar to another category's color. Selecting it can lower
                  the user experience.
                </div>

                <button
                  class="btn btn-outline btn-sm"
                  @click="form.values.newCategoryColor = randomColor()"
                >
                  Select New Random Color
                </button>

                <div class="mt-4 flex flex-col gap-2">
                  <div
                    v-for="c in similarCurrentCategories"
                    :key="c.category.id"
                    class="flex items-center justify-between rounded-xl bg-base-100 px-3 py-2"
                  >
                    <div class="flex items-center gap-2">
                      <CategoryColor :category="c.category" />
                      <div>{{ c.category.name }}</div>
                    </div>
                    <div class="text-sm font-semibold">
                      {{ Math.trunc(c.percent * 100) }}% similar
                    </div>
                  </div>
                </div>
              </div>
            </section>

            <!-- Subtasks -->
            <section class="rounded-2xl bg-base-200/50 p-5">
              <div class="mb-4 flex items-start justify-between gap-4">
                <div>
                  <div class="text-xs font-semibold uppercase tracking-wide text-base-content/60">
                    Subtasks
                  </div>
                  <div class="mt-1 text-sm text-base-content/60">
                    Add smaller steps to help break this task down.
                  </div>
                </div>

                <label class="flex cursor-pointer items-center gap-2 whitespace-nowrap">
                  <input
                    type="checkbox"
                    class="checkbox checkbox-sm"
                    v-model="form.values.rememberOptions"
                  />
                  <span class="text-sm text-base-content/80">Remember Options</span>
                </label>
              </div>

              <div v-if="tempSubtasks.length" class="mb-4 space-y-2">
                <SortableList
                  v-model="tempSubtasks"
                  item-key="sortId"
                  :options="{
                    handle: '.handle',
                  }"
                  class="flex flex-col gap-2"
                >
                  <template #default="s">
                    <div
                      class="flex items-center justify-between rounded-2xl border border-base-300 bg-base-100 px-3 py-2 shadow-sm"
                    >
                      <div class="flex items-center gap-3">
                        <div
                          class="handle flex cursor-grab items-center justify-center rounded-lg border border-primary/30 bg-primary/5 p-2 text-primary"
                        >
                          <ArrowsUpDownIcon class="size-4" />
                        </div>
                        <input
                          type="checkbox"
                          class="checkbox checkbox-sm"
                          :checked="s.item.completed"
                          @change="toggleSubtask(s.item, ($event.target as HTMLInputElement).checked)"
                        />
                        <div class="text-sm">{{ s.item.text }}</div>
                      </div>

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

              <div class="flex gap-3">
                <div class="flex-1">
                  <input
                    ref="subtaskTextRef"
                    v-model="subtaskForm.values.newSubtaskText"
                    class="input-bordered input w-full bg-base-100"
                    placeholder="Add a subtask..."
                    @keydown.enter.prevent="addTempSubtask"
                    :class="{
                      'input-error':
                        subtaskForm.errors.newSubtaskText && subtaskForm.touched.newSubtaskText,
                    }"
                  />
                  <label
                    v-if="subtaskForm.errors.newSubtaskText && subtaskForm.touched.newSubtaskText"
                    class="label pb-0"
                  >
                    <div class="label-text-alt text-error text-wrap">
                      {{ subtaskForm.errors.newSubtaskText }}
                    </div>
                  </label>
                </div>

                <button
                  ref="addSubtaskRef"
                  type="button"
                  class="btn btn-primary btn-outline min-w-24"
                  @click="addTempSubtask"
                >
                  Add
                </button>
              </div>
            </section>

            <!-- Errors + actions -->
            <div class="pt-2">
              <div class="flex justify-center" v-if="form.state.hasErrors">
                <div class="alert alert-error max-w-md">
                  <span>Please fix the errors above</span>
                </div>
              </div>

              <div class="mt-5 flex justify-center gap-4">
                <button class="btn btn-outline min-w-28" @click="onCancel">Cancel</button>
                <button ref="createButtonRef" class="btn btn-primary min-w-28" @click="onConfirm">
                  Create
                </button>
              </div>
            </div>
          </div>
        </div>

        <!-- Side panel -->
        <div class="rounded-3xl border border-base-300 bg-base-100 p-6 shadow-sm xl:p-8">
          <div class="mb-4">
            <div class="text-lg font-semibold">Recently Created Tasks</div>
            <div class="mt-1 text-sm text-base-content/60">
              Click a task to insert its fields into the form.
            </div>
          </div>

          <div class="space-y-3">
            <template v-if="sortedTaskList.length === 0">
              <div
                class="rounded-2xl border border-dashed border-base-300 bg-base-200/40 p-4 text-sm text-base-content/70"
              >
                There are no recently created tasks. When there are, you can insert them from here.
              </div>
            </template>

            <template v-else>
              <div
                v-for="task in sortedTaskList"
                :key="task.id"
                class="cursor-pointer rounded-2xl border border-base-300 bg-base-200/50 p-4 shadow-sm transition hover:-translate-y-0.5 hover:bg-base-200 hover:shadow"
                @click="
                  () => {
                    selectedTask = task
                    confirmInsertModalRef?.showModal()
                  }
                "
              >
                <div class="flex items-start justify-between gap-4">
                  <div class="flex items-start gap-3">
                    <input
                      class="checkbox checkbox-sm mt-1 pointer-events-none"
                      type="checkbox"
                      :checked="task.completed"
                    />

                    <CategoryColor
                      :category="categoryManager.findBy('id', task.category)"
                      :size="4"
                    />

                    <div class="min-w-0">
                      <div class="truncate font-medium">{{ task.title }}</div>
                      <div class="mt-2">
                        <div class="badge badge-outline badge-sm h-auto">
                          {{ categoryManager.findBy('id', task.category)?.name }}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div class="flex flex-col items-end gap-2">
                    <div class="badge badge-sm h-auto" :class="dueBadgeClass(dueDateLabel(task))">
                      <b>Due:</b> {{ task.dueDate.toDateString() }}
                    </div>
                    <div class="badge badge-soft badge-sm h-auto">
                      {{ createdDateLabel(task) }}
                    </div>
                  </div>
                </div>
              </div>
            </template>
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
