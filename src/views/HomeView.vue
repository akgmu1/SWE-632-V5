<script setup lang="ts">
import CategoryColor from '@/components/CategoryColor.vue'
import ConfirmationModal from '@/components/ConfirmationModal.vue'
import LogTimeModal from '@/components/LogTimeModal.vue'
import SearchBar from '@/components/SearchBar.vue'
import TaskItem from '@/components/TaskItem.vue'
import UpdateTaskModal from '@/components/UpdateTaskModal.vue'
import { HomeState } from '@/enums'
import { SortOption, sortTasks } from '@/helper'
import { notify } from '@/notification'
import { categoryManager, META_ADD_NEW_CATEGORY, type Category } from '@/schemas/category'
import { subtaskManager } from '@/schemas/subtask'
import { deletedTaskManager, taskManager, type Task } from '@/schemas/task'
import { timeEntryManager, type CreateTimeEntry } from '@/schemas/timeEntry'
import { computed, ref, type Ref } from 'vue'
import BaseView from './BaseView.vue'

const logTimeModalRef: Ref<InstanceType<typeof LogTimeModal> | null> = ref(null)

function openLogTime(task: Task) {
  logTimeModalRef.value!.showModal(task)
}

function handleLogTime(entry: CreateTimeEntry) {
  timeEntryManager.add(entry)
  refreshTasks()
  notify('Time entry added', 'success')
}

function handleUpdateTimeEntry(payload: { id: number; entry: CreateTimeEntry }) {
  timeEntryManager.updateBy('id', payload.id, payload.entry)
  refreshTasks()
  notify('Time entry updated', 'info')
}

function handleDeleteTimeEntry(id: number) {
  timeEntryManager.removeBy('id', id)
  refreshTasks()
  notify('Time entry deleted', 'error')
}

const sortOption = ref<SortOption>(SortOption.Created)
const sortDescending = ref(false)

const categories: Ref<Category[]> = ref(categoryManager.all())
const filterableCategories = computed(() =>
  categories.value.filter((c) => c.id !== META_ADD_NEW_CATEGORY),
)
const tasks: Ref<Task[]> = ref(taskManager.all())
const deletedTasks: Ref<Task[]> = ref(deletedTaskManager.all())

const search = ref('')
const q = computed(() => search.value.trim().toLowerCase())

const filteredCategories: Ref<Category[]> = ref([])

function applyDirection(items: Task[]) {
  return sortDescending.value ? [...items].reverse() : items
}

const activeTasks = computed(() =>
  applyDirection(
    sortTasks(
      tasks.value.filter(
        (t) =>
          !t.completed &&
          (!q.value || t.title.toLowerCase().includes(q.value)) &&
          (filteredCategories.value.length === 0 ||
            filteredCategories.value.some((c) => c.id === t.category)),
      ),
      sortOption.value,
    ),
  ),
)

const completedTasks = computed(() =>
  applyDirection(
    sortTasks(
      tasks.value.filter(
        (t) =>
          t.completed &&
          (!q.value || t.title.toLowerCase().includes(q.value)) &&
          (filteredCategories.value.length === 0 ||
            filteredCategories.value.some((c) => c.id === t.category)),
      ),
      sortOption.value,
    ),
  ),
)

const filteredDeletedTasks = computed(() =>
  applyDirection(
    sortTasks(
      deletedTasks.value.filter(
        (t) =>
          (!q.value || t.title.toLowerCase().includes(q.value)) &&
          (filteredCategories.value.length === 0 ||
            filteredCategories.value.some((c) => c.id === t.category)),
      ),
      sortOption.value,
    ),
  ),
)

const activeTaskCount = computed(() => activeTasks.value.length)
const completedTaskCount = computed(() => completedTasks.value.length)
const deletedTaskCount = computed(() => filteredDeletedTasks.value.length)

function refreshTasks() {
  tasks.value = [...taskManager.all()]
  deletedTasks.value = [...deletedTaskManager.all()]
  categories.value = [...categoryManager.all()]
}

function toggleTask(id: number, completed: boolean) {
  taskManager.updateBy('id', id, { completed })
  let task = taskManager.findBy('id', id)
  if (completed) {
    notify(`Marked task as complete '${task?.title}'`, 'success')
  } else {
    notify(`Marked task as not complete '${task?.title}'`, 'warning')
  }
  refreshTasks()
}
function toggleSubtask(id: number, completed: boolean) {
  subtaskManager.updateBy('id', id, { completed })

  const subtask = subtaskManager.findBy('id', id)
  if (completed) {
    notify(`Marked subtask as complete '${subtask?.text}'`, 'success')
  } else {
    notify(`Marked subtask as not complete '${subtask?.text}'`, 'warning')
  }

  refreshTasks()
}

const selectedTask: Ref<Task | undefined> = ref(undefined)

const confirmDeleteModalRef: Ref<InstanceType<typeof ConfirmationModal> | null> = ref(null)
function confirmDelete() {
  if (!selectedTask.value) return

  deletedTaskManager.add(selectedTask.value)
  taskManager.removeBy('id', selectedTask.value.id)
  refreshTasks()
  notify(`Deleted task '${selectedTask.value.title}'`, 'error')
}

const confirmRecoverModalRef: Ref<InstanceType<typeof ConfirmationModal> | null> = ref(null)
function confirmRecover() {
  if (!selectedTask.value) return

  taskManager.insert(selectedTask.value)
  deletedTaskManager.removeBy('id', selectedTask.value.id)
  refreshTasks()
  notify(`Recovered task '${selectedTask.value.title}'`, 'success')
}

const updateModalRef: Ref<InstanceType<typeof UpdateTaskModal> | null> = ref(null)
function updateTask(task: Task, subtask: boolean) {
  taskManager.updateBy('id', task.id, task)
  refreshTasks()
  notify('Task updated', 'info')
}

function taskClicked(id: number, isDeleted: boolean) {
  if (isDeleted) {
    switch (props.state) {
      case HomeState.Delete: {
        selectedTask.value = deletedTaskManager.findBy('id', id)
        if (selectedTask.value !== undefined) {
          confirmRecoverModalRef.value!.showModal()
        }
        break
      }
    }
  } else {
    switch (props.state) {
      case HomeState.Update: {
        selectedTask.value = taskManager.findBy('id', id)
        if (selectedTask.value !== undefined) {
          updateModalRef.value!.showModal(selectedTask.value)
        }
        break
      }
      case HomeState.Delete: {
        selectedTask.value = taskManager.findBy('id', id)
        if (selectedTask.value !== undefined) {
          confirmDeleteModalRef.value!.showModal()
        }
        break
      }
    }
  }
}

const confirmClearRecentlyDeleteModalRef: Ref<InstanceType<typeof ConfirmationModal> | null> =
  ref(null)

function clearRecentlyDeletedTasks() {
  deletedTaskManager.reset()
  notify(
    `Cleared ${deletedTasks.value.length} task${deletedTasks.value.length == 1 ? '' : 's'}`,
    'info',
  )
  refreshTasks()
}

interface Props {
  state: HomeState
}

const props = defineProps<Props>()

const baseViewTitle = computed(() => {
  switch (props.state) {
    case HomeState.Default:
      return 'Home'
    case HomeState.Update:
      return 'Edit Task'
    case HomeState.Delete:
      return 'Delete Task'
  }
})
</script>

<template>
  <BaseView :title="baseViewTitle">
    <div class="mb-4 flex justify-center">
      <SearchBar v-model="search" />
    </div>

    <div v-if="props.state === HomeState.Default && tasks.length > 0" class="alert alert-info mb-4">
      <span>
        To view statistics, first go to
        <RouterLink to="/edit" class="font-semibold underline text-primary"> Edit </RouterLink>
        and log time for a task.
      </span>
    </div>

    <div class="mb-4 flex items-center justify-end gap-2">
      <div>
        <span class="text-sm font-medium">Filter:</span>
        <div class="dropdown dropdown-center">
          <div tabindex="0" role="button" class="select select-sm m-1">Category</div>
          <div
            tabindex="-1"
            class="dropdown-content menu bg-base-100 rounded-box z-1 w-52 p-2 shadow-sm"
          >
            <div class="flex flex-col gap-2">
              <template v-for="c in filterableCategories">
                <div class="flex justify-start items-center gap-1.5">
                  <input
                    type="checkbox"
                    class="checkbox checkbox-sm"
                    :checked="filteredCategories.some((f) => f.id === c.id)"
                    @change="
                      (event) => {
                        const checked = (event.target as HTMLInputElement).checked
                        if (checked) {
                          filteredCategories.push(c)
                        } else {
                          filteredCategories = filteredCategories.filter((f) => f.id !== c.id)
                        }
                      }
                    "
                  />
                  <CategoryColor :category="c" :size="4" />
                  <div>
                    {{ c.name }}
                  </div>
                </div>
              </template>
            </div>
            <div class="mt-2 text-end">
              <button class="btn btn-primary btn-xs" @click="filteredCategories = []">Clear</button>
            </div>
          </div>
        </div>
      </div>

      <label class="flex items-center gap-2">
        <span class="text-sm font-medium">Sort by:</span>
        <select v-model="sortOption" class="select select-bordered select-sm w-auto">
          <option :value="SortOption.Name">Name</option>
          <option :value="SortOption.Created">Created Date</option>
          <option :value="SortOption.Due">Due Date</option>
        </select>
      </label>

      <button class="btn btn-outline btn-sm" @click="sortDescending = !sortDescending">
        {{ sortDescending ? '▼' : '▲' }}
      </button>
    </div>

    <div class="tabs tabs-lift">
      <input
        type="radio"
        name="task_tabs"
        class="tab"
        :aria-label="`Active (${activeTaskCount})`"
        checked
      />
      <div class="tab-content border-base-300 bg-base-100 p-3">
        <div v-if="activeTasks.length > 0" class="flex flex-col gap-2">
        <TaskItem
          v-for="t in activeTasks"
          :key="t.id"
          :task="t"
          :is-deleted="false"
          :home-state="props.state"
          @toggle="toggleTask"
          @clicked="taskClicked"
          @logTimeClicked="openLogTime"
          @subtaskToggle="toggleSubtask"
        />
        </div>

        <div v-else-if="q" class="py-6 text-center">
          <div class="text-base font-medium">No active tasks match "{{ search }}"</div>
          <div class="mt-1 text-sm text-base-content/70">
            Try a different search term or clear the search.
          </div>
          <button class="btn btn-ghost btn-sm mt-3" @click="search = ''">Clear search</button>
        </div>

        <div v-else-if="filteredCategories.length > 0" class="py-6 text-center">
          <div class="text-base font-medium">No active tasks with category:</div>
          <div class="flex flex-col gap-2">
            <div v-for="c in filteredCategories" class="flex justify-center items-center gap-2">
              <CategoryColor :category="c" :size="4" />
              <div>
                {{ c.name }}
              </div>
            </div>
          </div>

          <div class="mt-3 text-sm text-base-content/70">
            Try a different search term or clear the search.
          </div>
          <button class="btn btn-ghost btn-sm mt-2" @click="filteredCategories = []">
            Clear filter
          </button>
        </div>

        <div v-else class="py-2">
          There are no active tasks, click
          <RouterLink to="/create" class="link link-primary">here</RouterLink>
          to create a task.
        </div>
      </div>

      <input
        type="radio"
        name="task_tabs"
        class="tab"
        :aria-label="`Completed (${completedTaskCount})`"
      />
      <div class="tab-content border-base-300 bg-base-100 p-3">
        <div v-if="completedTasks.length > 0" class="flex flex-col gap-2">
          <TaskItem
            v-for="task in completedTasks"
            :key="task.id"
            :task="task"
            :home-state="props.state"
            :is-deleted="false"
            @toggle="toggleTask"
            @clicked="taskClicked"
          />
        </div>

        <div v-else-if="q" class="py-6 text-center">
          <div class="text-base font-medium">No completed tasks match "{{ search }}"</div>
          <div class="mt-1 text-sm text-base-content/70">
            Try a different search term or clear the search.
          </div>
          <button class="btn btn-ghost btn-sm mt-3" @click="search = ''">Clear search</button>
        </div>

        <div v-else-if="activeTasks.length > 0" class="py-2">
          No tasks are marked as completed. Click on the checkbox
          <div class="whitespace-nowrap inline-block">
            (
            <input
              class="checkbox m-0 pointer-events-none checkbox-sm checkbox-ghost"
              type="checkbox"
            />
            )
          </div>
          next to an active task in order to mark it as complete.
        </div>

        <div v-else class="py-2">
          There are no active tasks to be completed, click
          <RouterLink to="/create" class="link link-primary">here</RouterLink>
          to create a task.
        </div>
      </div>

      <template v-if="props.state === HomeState.Delete">
        <input
          type="radio"
          name="task_tabs"
          class="tab"
          :aria-label="`Deleted (${deletedTaskCount})`"
        />
        <div class="tab-content border-base-300 bg-base-100 p-3">
          <div class="flex justify-center items-center gap-4 pb-2">
            <div class="text-xl">
              Recently Deleted {{ deletedTasks.length }}
              {{ deletedTasks.length === 1 ? 'Task' : 'Tasks' }}
            </div>
            <button
              v-if="deletedTasks.length > 0"
              class="btn btn-accent btn-sm"
              @click="confirmClearRecentlyDeleteModalRef!.showModal"
            >
              Clear
            </button>
          </div>

          <div v-if="filteredDeletedTasks.length > 0" class="flex flex-col gap-2">
            <TaskItem
              v-for="task in filteredDeletedTasks"
              :key="task.id"
              :task="task"
              :home-state="props.state"
              :is-deleted="true"
              @clicked="taskClicked"
            />
          </div>

          <div v-else-if="q" class="py-6 text-center">
            <div class="text-base font-medium">No deleted tasks match "{{ search }}"</div>
            <div class="mt-1 text-sm text-base-content/70">
              Try a different search term or clear the search.
            </div>
            <button class="btn btn-ghost btn-sm mt-3" @click="search = ''">Clear search</button>
          </div>

          <div v-else class="py-2">
            There are no deleted tasks, when they are deleted you can recover them here if you
            choose to.
          </div>
        </div>
      </template>
    </div>
  </BaseView>

  <UpdateTaskModal ref="updateModalRef" @confirm="refreshTasks" />

  <ConfirmationModal
    ref="confirmClearRecentlyDeleteModalRef"
    title="Clear Recently Deleted"
    @confirm="clearRecentlyDeletedTasks"
  >
    Are you sure you want to clear the
    <span class="font-bold">{{ deletedTasks.length }}</span> recently deleted
    {{ deletedTasks.length == 1 ? 'task' : 'tasks' }}?
  </ConfirmationModal>

  <ConfirmationModal ref="confirmDeleteModalRef" title="Delete Task" @confirm="confirmDelete">
    Are you sure you want to delete task?
    <div class="pt-2 text-center font-bold">"{{ selectedTask?.title }}"</div>
    <template #confirm> Delete </template>
  </ConfirmationModal>

  <ConfirmationModal ref="confirmRecoverModalRef" title="Recover Task" @confirm="confirmRecover">
    Are you sure you want to recover task?
    <div class="pt-2 text-center font-bold">"{{ selectedTask?.title }}"</div>
    <template #confirm> Recover </template>
  </ConfirmationModal>

  <LogTimeModal
    ref="logTimeModalRef"
    @logTime="handleLogTime"
    @updateTimeEntry="handleUpdateTimeEntry"
    @deleteTimeEntry="handleDeleteTimeEntry"
  />
</template>
