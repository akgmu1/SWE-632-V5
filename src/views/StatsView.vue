<script setup lang="ts">
import CategoryColor from '@/components/CategoryColor.vue'
import { dateToYYYYMMDD, dateTrim } from '@/helper'
import { categoryManager, type Category } from '@/schemas/category'
import { taskManager, type Task } from '@/schemas/task'
import { timeEntryManager, type TimeEntry } from '@/schemas/timeEntry'
import {
  ArcElement,
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Legend,
  LinearScale,
  Title,
  Tooltip,
  type ChartData,
  type TooltipCallbacks,
} from 'chart.js'
import { computed, ref, watch, type ComputedRef, type Ref } from 'vue'
import { Doughnut } from 'vue-chartjs'
import BaseView from './BaseView.vue'

const selectedDate: Ref<Date> = ref(dateTrim(new Date()))
watch(selectedDate, () => {
  timeEntries.value = computeEntries()
})

enum Filter {
  None,
  Date,
}

const filter: Ref<Filter> = ref(Filter.None)
watch(filter, () => {
  timeEntries.value = computeEntries()
})

function ensureNotDeleted(input: TimeEntry[]): TimeEntry[] {
  return input.filter((e) => taskManager.someBy((t) => t.id === e.taskId))
}

function computeEntries(): TimeEntry[] {
  let result = []
  switch (filter.value) {
    case Filter.None: {
      result = timeEntryManager.all()
      break
    }
    case Filter.Date: {
      result = timeEntryManager.filterBy((x) => {
        return dateToYYYYMMDD(x.date) === dateToYYYYMMDD(selectedDate.value)
      })
      break
    }
  }

  return ensureNotDeleted(result)
}

const timeEntries: Ref<TimeEntry[]> = ref(computeEntries())

const associatedTask = computed(() => {
  let result = new Map<number, Task>()
  for (const entry of timeEntries.value) {
    result.set(entry.id, taskManager.findBy('id', entry.taskId)!)
  }
  return result
})

const associatedCategories = computed(() => {
  let result = new Map<number, Category>()
  for (const [entry, task] of associatedTask.value) {
    result.set(entry, categoryManager.findBy('id', task.category)!)
  }
  return result
})

const totalMinutesPerCategory = computed(() => {
  let result = new Map<number, number>()

  for (const entry of timeEntries.value) {
    let category = associatedCategories.value.get(entry.id)!
    result.set(category.id, (result.get(category.id) ?? 0) + entry.minutes)
  }

  return result
})

const totalMinutes = computed(() => timeEntries.value.reduce((sum, e) => sum + e.minutes, 0))

const tasks = computed(() =>
  taskManager.filterBy((t) => timeEntries.value.some((e) => e.taskId === t.id)),
)

const totalHoursLabel = computed(() => {
  if (!totalMinutes.value) return ''
  return `${(totalMinutes.value / 60).toFixed(1)}h`
})

const chartData: ComputedRef<ChartData<'doughnut'>> = computed(() => {
  return {
    labels: Array.from(totalMinutesPerCategory.value.keys()).map(
      (e) => categoryManager.findBy('id', e)!.name,
    ),
    datasets: [
      {
        label: 'My First Dataset',
        data: Array.from(totalMinutesPerCategory.value.values()),
        backgroundColor: Array.from(totalMinutesPerCategory.value.keys()).map(
          (e) => categoryManager.findBy('id', e)!.color,
        ),
        hoverOffset: 4,
      },
    ],
  }
})

const chartOptions = ref({
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: {
      onClick: () => {},
    },
    tooltip: {
      callbacks: {
        label: function (context) {
          let label = context.label || ''
          if (label) {
            label += ': '
          }
          if (context.parsed !== null) {
            label += context.parsed + ' minutes'
          }
          return label
        },
      } as TooltipCallbacks<'doughnut'>,
    },
  },
})

ChartJS.register(Title, Tooltip, Legend, ArcElement, BarElement, CategoryScale, LinearScale)

function computeHoursLabel(task: Task): string {
  const totalMinutes = timeEntryManager
    .filterBy('taskId', task.id)
    .reduce((sum, e) => sum + e.minutes, 0)

  return `${(totalMinutes / 60).toFixed(1)}h`
}

const showAll: Ref<boolean> = ref(true)
watch(showAll, (value) => {
  filter.value = value ? Filter.None : Filter.Date
})
</script>

<template>
  <BaseView title="Statistics">
    <div v-if="timeEntries.length > 0" class="flex">
      <Doughnut :data="chartData" :options="chartOptions" />
    </div>

    <div class="flex justify-between mt-5">
      <label class="label">
        <input type="checkbox" v-model="showAll" class="checkbox" />
        Show All
      </label>
      <label v-if="!showAll" class="input">
        <span class="label">Selected Date</span>
        <input
          type="date"
          :value="dateToYYYYMMDD(selectedDate)"
          @input="
            selectedDate = dateTrim(
              ($event.target as HTMLInputElement).valueAsDate ?? new Date(),
              true,
            )
          "
        />
      </label>
    </div>

    <hr class="my-2" />

    <div v-if="timeEntries.length > 0">
      <div class="mt-5">
        Total:
        <span class="badge badge-neutral">{{ totalHoursLabel }} worked</span>
      </div>

      <div class="flex flex-col gap-2 mt-5">
        <div v-for="t in tasks" :key="t.id">
          <div class="flex gap-2">
            <CategoryColor :category="categoryManager.findBy('id', t.category)" />
            <div>Task: {{ t.title }}</div>
            <div class="badge badge-neutral">{{ computeHoursLabel(t) }} worked</div>
          </div>
        </div>
      </div>
    </div>
    <div v-else>No hours logged</div>
  </BaseView>
</template>
