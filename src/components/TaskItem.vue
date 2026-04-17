<script setup lang="ts">
import { HomeState } from '@/enums'
import { dateTrim } from '@/helper'
import { categoryManager } from '@/schemas/category'
import { subtaskManager } from '@/schemas/subtask'
import { type Task } from '@/schemas/task'
import { timeEntryManager } from '@/schemas/timeEntry'
import { computed } from 'vue'
import CategoryColor from './CategoryColor.vue'
import ToolTip from './ToolTip.vue'

interface Emits {
  (e: 'toggle', id: number, completed: boolean): void
  (e: 'clicked', id: number, isDeleted: boolean): void
  (e: 'logTimeClicked', task: Task): void
  (e: 'subtaskToggle', id: number, completed: boolean): void
}

const emits = defineEmits<Emits>()

interface Props {
  task: Task
  isDeleted: boolean
  homeState: HomeState
}

const props = defineProps<Props>()

const homeStateDefault = computed(() => props.homeState === HomeState.Default)
const homeStateDelete = computed(() => props.homeState === HomeState.Delete)
const homeStateUpdate = computed(() => props.homeState === HomeState.Update)

const taskCategory = computed(() => {
  return categoryManager.findBy('id', props.task.category)
})

const taskSubtasks = computed(() => {
  return subtaskManager.filterBy('taskId', props.task.id).sort((a, b) => a.order - b.order)
})

const taskTimeEntries = computed(() => {
  return timeEntryManager.filterBy('taskId', props.task.id)
})

const hasLoggedTime = computed(() => taskTimeEntries.value.length > 0)

const dueLabel = computed(() => {
  const rawDate = props.task.dueDate

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
})

const dueBadgeClass = computed(() => {
  if (!dueLabel.value) return ''
  if (dueLabel.value.startsWith('Overdue')) return 'badge-error'
  if (dueLabel.value === 'Due today') return 'badge-warning'
  return 'badge-ghost'
})

function onChange(checked: boolean) {
  if (props.homeState == HomeState.Default && !props.isDeleted) {
    props.task.completed = checked
    emits('toggle', props.task.id, props.task.completed)
  }
}

function onSubtaskChange(id: number, checked: boolean) {
  if (props.homeState == HomeState.Default && !props.isDeleted) {
    emits('subtaskToggle', id, checked)
  }
}

const totalMinutes = computed(() => taskTimeEntries.value.reduce((sum, e) => sum + e.minutes, 0))

const totalHoursLabel = computed(() => {
  if (!totalMinutes.value) return ''
  return `${(totalMinutes.value / 60).toFixed(1)}h`
})

const subtaskProgress = computed(() => {
  const total = taskSubtasks.value.length
  if (total === 0) return ''
  const done = taskSubtasks.value.filter((s) => s.completed).length
  return `${done}/${total} subtasks`
})
</script>

<template>
  <div
    class="align-center flex items-center justify-between gap-3 rounded p-2 py-1 bg-base-200 lg:bg-transparent"
    :class="{
      'cursor-pointer': props.isDeleted || (!props.isDeleted && !homeStateDefault),
      'hover:bg-base-300 hover:shadow':
        (props.isDeleted && homeStateDelete) || (!props.isDeleted && homeStateUpdate),
      'hover:bg-error hover:text-error-content hover:shadow hover:shadow-error':
        !props.isDeleted && homeStateDelete,
    }"
    @click="emits('clicked', props.task.id, props.isDeleted)"
  >
    <div class="flex min-w-0 items-center gap-3">
      <input
        class="checkbox m-0"
        :class="{
          'pointer-events-none': props.isDeleted || (!props.isDeleted && !homeStateDefault),
        }"
        type="checkbox"
        :checked="props.task.completed"
        @change="onChange(($event.target as HTMLInputElement).checked)"
      />

      <CategoryColor v-if="taskCategory" :category="taskCategory" :size="4" />

      <div class="min-w-0 flex-1">
        <div class="flex min-w-0 items-center gap-2 flex-col lg:flex-row">
          <div
            class="flex-2 truncate"
            :class="{ 'text-base-content/70 line-through': props.task.completed }"
          >
            Task: {{ props.task.title }}
          </div>

          <span
            v-if="subtaskProgress"
            class="badge shrink-0 badge-secondary badge-sm md:badge-md h-auto"
          >
            {{ subtaskProgress }}
          </span>
        </div>

        <div v-if="taskSubtasks.length" class="mt-2 space-y-1 pl-1 text-sm opacity-80">
          <div v-for="s in taskSubtasks" :key="s.id" class="flex min-w-0 items-center gap-2">
            <input
              class="checkbox checkbox-xs"
              type="checkbox"
              :checked="s.completed"
              :disabled="props.isDeleted || !homeStateDefault"
              @click.stop
              @change="onSubtaskChange(s.id, ($event.target as HTMLInputElement).checked)"
            />
            <span class="flex-1 truncate" :class="{ 'line-through opacity-60': s.completed }">
              {{ s.text }}
            </span>
          </div>
        </div>

        <div class="mt-2 flex flex-wrap items-center gap-2">
          <span v-if="taskCategory" class="badge badge-outline badge-sm md:badge-md h-auto">
            {{ taskCategory.name }}
          </span>

          <span v-if="totalHoursLabel" class="badge badge-neutral badge-sm md:badge-md h-auto">
            {{ totalHoursLabel }} worked
          </span>

          <span v-else-if="homeStateUpdate" class="badge badge-warning badge-sm md:badge-md h-auto">
            No time logged yet
          </span>

          <button
            v-if="homeStateUpdate"
            class="btn btn-primary btn-xs"
            @click.stop="emits('logTimeClicked', props.task)"
          >
            {{ hasLoggedTime ? 'Log Time' : 'Log First Time Entry' }}
          </button>
        </div>

        <div v-if="homeStateUpdate && !hasLoggedTime" class="mt-2 text-xs text-base-content/70">
          Log time for this task before it appears in Statistics.
        </div>
      </div>
    </div>

    <div class="shrink-0">
      <ToolTip :tip="task.dueDate.toDateString()">
        <span v-if="dueLabel" class="badge badge-sm md:badge-md h-auto" :class="dueBadgeClass">
          {{ dueLabel }}
        </span>
      </ToolTip>
    </div>
  </div>
</template>
