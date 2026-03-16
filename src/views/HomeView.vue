<script setup lang="ts">
import AddTaskModal from '@/components/AddTaskModal.vue'
import ConfirmationModal from '@/components/ConfirmationModal.vue'
import LogTimeModal from '@/components/LogTimeModal.vue'
import ManageCategoriesModal from '@/components/ManageCategoriesModal.vue'
import SearchBar from '@/components/SearchBar.vue'
import StatsModal from '@/components/StatsModal.vue'
import TaskItem from '@/components/TaskItem.vue'
import UpdateTaskModal from '@/components/UpdateTaskModal.vue'
import { HomeState } from '@/enums'
import { categoryManager, type Category } from '@/schemas/category'
import { deletedTaskManager, taskManager, type CreateTask, type Task } from '@/schemas/task'
import { timeEntryManager, type CreateTimeEntry } from '@/schemas/timeEntry'
import { computed, ref, type Ref } from 'vue'

const logTimeModalRef: Ref<InstanceType<typeof LogTimeModal> | null> = ref(null)

function openLogTime(task: Task) {
  logTimeModalRef.value!.showModal(task)
}

function logTime(entry: CreateTimeEntry) {
  timeEntryManager.add(entry)
  refreshTasks()
}

const categories: Ref<Category[]> = ref(categoryManager.all())
const tasks: Ref<Task[]> = ref(taskManager.all())
const deletedTasks: Ref<Task[]> = ref(deletedTaskManager.all())

const q = computed(() => search.value.trim().toLowerCase())
const search = ref('')

const activeTasks = computed(() =>
  tasks.value.filter((t) => !t.completed && (!q.value || t.title.toLowerCase().includes(q.value))),
)

const completedTasks = computed(() =>
  tasks.value.filter((t) => t.completed && (!q.value || t.title.toLowerCase().includes(q.value))),
)

const filteredDeletedTasks = computed(() =>
  deletedTasks.value.filter((t) => !q.value || t.title.toLowerCase().includes(q.value)),
)

function refreshTasks() {
  tasks.value = [...taskManager.all()]
  deletedTasks.value = [...deletedTaskManager.all()]
  categories.value = [...categoryManager.all()]
}

function toggleTask(id: number, completed: boolean) {
  taskManager.updateBy('id', id, { completed })
  refreshTasks()
}

const selectedTask: Ref<Task | undefined> = ref(undefined)

const confirmDeleteModalRef: Ref<InstanceType<typeof ConfirmationModal> | null> = ref(null)
function confirmDelete() {
  deletedTaskManager.add(selectedTask.value!)
  taskManager.removeBy('id', selectedTask.value!.id)
  refreshTasks()
}

const confirmRecoverModalRef: Ref<InstanceType<typeof ConfirmationModal> | null> = ref(null)
function confirmRecover() {
  taskManager.insert(selectedTask.value!)
  deletedTaskManager.removeBy('id', selectedTask.value!.id)
  refreshTasks()
}

const updateModalRef: Ref<InstanceType<typeof UpdateTaskModal> | null> = ref(null)
function updateTask(task: Task, subtask: boolean) {
  taskManager.updateBy('id', task.id, task)
  refreshTasks()
}

function taskClicked(id: number, isDeleted: boolean) {
  if (isDeleted) {
    switch (props.state) {
      case HomeState.Delete: {
        // homeState.value = HomeState.Default
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
        // homeState.value = HomeState.Default
        selectedTask.value = taskManager.findBy('id', id)
        if (selectedTask.value !== undefined) {
          updateModalRef.value!.showModal(selectedTask.value)
        }
        break
      }
      case HomeState.Delete: {
        // homeState.value = HomeState.Default
        selectedTask.value = taskManager.findBy('id', id)
        if (selectedTask.value !== undefined) {
          confirmDeleteModalRef.value!.showModal()
        }
        break
      }
    }
  }
}

const addTaskModalRef: Ref<InstanceType<typeof AddTaskModal> | null> = ref(null)

function addTask(task: CreateTask) {
  taskManager.add(task)
  refreshTasks()
}

function addButton() {
  addTaskModalRef.value!.showModal()
}

const confirmClearRecentlyDeleteModalRef: Ref<InstanceType<typeof ConfirmationModal> | null> =
  ref(null)
function clearRecentlyDeletedTasks() {
  deletedTaskManager.reset()
  refreshTasks()
}

const manageCategoriesModalRef: Ref<InstanceType<typeof ManageCategoriesModal> | null> = ref(null)
function updateCategory(category: Category) {
  categoryManager.updateBy('id', category.id, category)
  refreshTasks()
}

function deleteCategory(category: Category) {
  categoryManager.removeBy('id', category.id)
  refreshTasks()
}

const statsModalRef: Ref<InstanceType<typeof StatsModal> | null> = ref(null)

interface Props {
  state: HomeState
}

const props = defineProps<Props>()
// const homeState: Ref<HomeState> = ref(HomeState.Default)
</script>

<template>
  <main class="container mx-auto py-4">
    <div class="mb-4 flex justify-center">
      <SearchBar v-model="search" />
    </div>

    <div class="tabs tabs-lift">
      <input type="radio" name="task_tabs" class="tab" aria-label="Active" checked />
      <div class="tab-content border-base-300 bg-base-100 p-3">
        <div class="flex flex-col gap-2">
          <TaskItem
            v-for="task in activeTasks"
            :key="task.id"
            :task="task"
            :home-state="props.state"
            :is-deleted="false"
            @toggle="toggleTask"
            @clicked="taskClicked"
            @logTimeClicked="openLogTime"
          />
        </div>
      </div>

      <input type="radio" name="task_tabs" class="tab" aria-label="Completed" />
      <div class="tab-content border-base-300 bg-base-100 p-3">
        <div class="flex flex-col gap-2">
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
      </div>

      <template v-if="props.state === HomeState.Delete">
        <input type="radio" name="task_tabs" class="tab" aria-label="Deleted" />
        <div class="tab-content border-base-300 bg-base-100 p-3">
          <div class="flex justify-center align-middle pb-2">
            <!-- TODO: mt-3 may not be correct here... -->
            <div class="text-xl" :class="{ 'mt-2 pr-5': deletedTasks.length > 0 }">
              Recently Deleted {{ deletedTasks.length }}
              {{ deletedTasks.length === 1 ? 'Task' : 'Task' }}
            </div>
            <button
              v-if="deletedTasks.length > 0"
              class="btn btn-accent"
              @click="confirmClearRecentlyDeleteModalRef!.showModal"
            >
              Clear
            </button>
          </div>
          <div class="flex flex-col gap-2">
            <TaskItem
              v-for="task in filteredDeletedTasks"
              :key="task.id"
              :task="task"
              :home-state="props.state"
              :is-deleted="true"
              @clicked="taskClicked"
            />
          </div>
        </div>
      </template>
      <!-- <input type="radio" name="task_tabs" class="tab" aria-label="Tab 3" />
      <div class="tab-content border-base-300 bg-base-100 p-10">Tab content 3</div> -->
    </div>

    <!-- Statistics -->
    <StatsModal ref="statsModalRef" />

    <!-- Add a task -->
    <AddTaskModal ref="addTaskModalRef" @add-task="addTask" />

    <!-- Update a task -->
    <UpdateTaskModal ref="updateModalRef" @updateTask="updateTask" />

    <!-- Manage the categories -->
    <ManageCategoriesModal
      ref="manageCategoriesModalRef"
      @updateCategory="updateCategory"
      @delete-category="deleteCategory"
    />

    <!-- Confirming to clear all recently deleted tasks -->
    <ConfirmationModal
      ref="confirmClearRecentlyDeleteModalRef"
      title="Clear Recently Deleted"
      @confirm="clearRecentlyDeletedTasks"
    >
      Are you sure you want to clear the
      <span class="font-bold">{{ deletedTasks.length }}</span> recently deleted
      {{ deletedTasks.length == 1 ? 'task' : 'tasks' }}?
    </ConfirmationModal>

    <!-- Confirming to delete a task -->
    <ConfirmationModal ref="confirmDeleteModalRef" title="Delete Task" @confirm="confirmDelete">
      Are you sure you want to delete task?
      <div class="pt-2 text-center font-bold">"{{ selectedTask?.title }}"</div>
      <template #confirm> Delete </template>
    </ConfirmationModal>

    <!-- Confirming to recover a task -->
    <ConfirmationModal ref="confirmRecoverModalRef" title="Recover Task" @confirm="confirmRecover">
      Are you sure you want to recover task?
      <div class="pt-2 text-center font-bold">"{{ selectedTask?.title }}"</div>
      <template #confirm> Recover </template>
    </ConfirmationModal>
    <LogTimeModal ref="logTimeModalRef" @log-time="logTime" />
  </main>
</template>
