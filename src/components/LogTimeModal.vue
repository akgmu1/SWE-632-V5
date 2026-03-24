<script setup lang="ts">
import { dateToYYYYMMDD, dateTrim } from '@/helper'
import type { Task } from '@/schemas/task'
import type { CreateTimeEntry } from '@/schemas/timeEntry'
import { timeEntryManager } from '@/schemas/timeEntry'
import { computed, ref, type Ref } from 'vue'
import BaseModal from './BaseModal.vue'
import ConfirmationModal from './ConfirmationModal.vue'

interface TimeEntryLike {
  id: number
  taskId: number
  date: Date | string
  minutes: number
  note?: string
}

interface Emits {
  (e: 'logTime', entry: CreateTimeEntry): void
  (e: 'updateTimeEntry', payload: { id: number; entry: CreateTimeEntry }): void
  (e: 'deleteTimeEntry', id: number): void
}
const emits = defineEmits<Emits>()

const modalRef: Ref<InstanceType<typeof BaseModal> | null> = ref(null)
const task: Ref<Task | undefined> = ref(undefined)

const minutes = ref<number>(30)
const selectedDate = ref<Date>(new Date())
const editingEntryId = ref<number | null>(null)

const existingEntries = ref<TimeEntryLike[]>([])

function reloadEntries() {
  if (!task.value) {
    existingEntries.value = []
    return
  }

  existingEntries.value = timeEntryManager
    .filterBy('taskId', task.value.id)
    .slice()
    .sort((a: TimeEntryLike, b: TimeEntryLike) => {
      return new Date(b.date).getTime() - new Date(a.date).getTime()
    })
}

const totalMinutes = computed(() => {
  return existingEntries.value.reduce((sum, entry) => sum + entry.minutes, 0)
})

const totalHoursWorked = computed(() => {
  if (!totalMinutes.value) return '0.0'
  return (totalMinutes.value / 60).toFixed(1)
})

const canSubmit = computed(() => minutes.value > 0 && !!task.value)

function resetForm() {
  minutes.value = 30
  selectedDate.value = new Date()
  editingEntryId.value = null
}

function formatEntryDate(date: Date | string) {
  const d = new Date(date)
  return d.toLocaleDateString()
}

function editEntry(entry: TimeEntryLike) {
  editingEntryId.value = entry.id
  minutes.value = entry.minutes
  selectedDate.value = dateTrim(new Date(entry.date), true)
}

function cancelEdit() {
  resetForm()
}

function removeEntry(entryId: number) {
  emits('deleteTimeEntry', entryId)

  if (editingEntryId.value === entryId) {
    resetForm()
  }

  reloadEntries()
}

function onConfirm() {
  if (!task.value || minutes.value <= 0) return

  const payload: CreateTimeEntry = {
    taskId: task.value.id,
    date: dateTrim(selectedDate.value),
    minutes: minutes.value,
    note: '',
  }

  if (editingEntryId.value !== null) {
    emits('updateTimeEntry', {
      id: editingEntryId.value,
      entry: payload,
    })
  } else {
    emits('logTime', payload)
  }

  reloadEntries()
  resetForm()
}

defineExpose({
  showModal: (t: Task) => {
    task.value = t
    resetForm()
    reloadEntries()
    modalRef.value?.showModal()
  },
  close: () => modalRef.value?.close(),
})
</script>

<template>
  <ConfirmationModal
    ref="modalRef"
    :title="editingEntryId !== null ? 'Edit Time Entry' : 'Log Time'"
    @confirm="onConfirm"
    :should-close="canSubmit"
    :positive="true"
  >
    <div class="space-y-4">
      <div class="text-sm opacity-70">
        Task:
        <span class="font-semibold">{{ task?.title }}</span>
      </div>

      <div class="text-sm">
        Total:
        <span class="font-semibold">{{ totalHoursWorked }} hours worked</span>
      </div>

      <div class="grid grid-cols-2 gap-3">
        <label class="form-control w-full">
          <div class="label">
            <span class="label-text">Minutes</span>
          </div>
          <input
            v-model.number="minutes"
            type="number"
            min="1"
            class="input input-bordered w-full"
          />
        </label>

        <label class="form-control w-full">
          <div class="label">
            <span class="label-text">Date</span>
          </div>
          <input
            type="date"
            :value="dateToYYYYMMDD(selectedDate)"
            @input="
              selectedDate = dateTrim(
                ($event.target as HTMLInputElement).valueAsDate ?? new Date(),
                true,
              )
            "
            class="input input-bordered w-full"
          />
        </label>
      </div>

      <div v-if="editingEntryId !== null" class="flex items-center gap-2">
        <div class="badge badge-warning">Editing existing entry</div>
        <button type="button" class="btn btn-ghost btn-xs" @click.stop="cancelEdit">
          Cancel edit
        </button>
      </div>

      <div class="divider my-1"></div>

      <div class="space-y-2">
        <div class="text-sm font-medium">Time Entry History</div>

        <div
          v-if="existingEntries.length"
          class="max-h-60 space-y-2 overflow-y-auto rounded-lg border border-base-300 p-2"
        >
          <div
            v-for="entry in existingEntries"
            :key="entry.id"
            class="flex items-center justify-between rounded bg-base-200 px-3 py-2 text-sm"
          >
            <div>
              <div class="font-medium">{{ entry.minutes }} minutes</div>
              <div class="text-base-content/70">
                {{ formatEntryDate(entry.date) }}
              </div>
            </div>

            <div class="flex gap-2">
              <button type="button" class="btn btn-outline btn-xs" @click.stop="editEntry(entry)">
                Edit
              </button>
              <button
                type="button"
                class="btn btn-error btn-outline btn-xs"
                @click.stop="removeEntry(entry.id)"
              >
                Delete
              </button>
            </div>
          </div>
        </div>

        <div v-else class="text-sm text-base-content/70">No time entries yet.</div>
      </div>
    </div>

    <template #confirm>
      {{ editingEntryId !== null ? 'Update' : 'Save' }}
    </template>
  </ConfirmationModal>
</template>
