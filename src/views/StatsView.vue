<script setup lang="ts">
import CategoryColor from '@/components/CategoryColor.vue'
import MiniCalendar from '@/components/MiniCalendar.vue'
import { dateToYYYYMMDD, dateTrim, isSameDay } from '@/helper'
import { categoryManager, META_ADD_NEW_CATEGORY, type Category } from '@/schemas/category'
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
import { Doughnut, Bar } from 'vue-chartjs'
import BaseView from './BaseView.vue'

const selectedDate: Ref<Date> = ref(dateTrim(new Date()))
const showAll: Ref<boolean> = ref(true)

enum Filter {
  None,
  Date,
}

const filter: Ref<Filter> = ref(Filter.None)

watch(showAll, (value) => {
  filter.value = value ? Filter.None : Filter.Date
  timeEntries.value = computeEntries()
})

watch(selectedDate, () => {
  if (!showAll.value) {
    timeEntries.value = computeEntries()
  }
})

const categories: Ref<Category[]> = ref(categoryManager.all())
const filterableCategories = computed(() =>
  categories.value.filter((c) => c.id !== META_ADD_NEW_CATEGORY),
)
const filteredCategories: Ref<Category[]> = ref([])
watch(
  filteredCategories,
  () => {
    console.log('change')
    timeEntries.value = computeEntries()
  },
  { deep: true },
)

function ensureNotDeleted(input: TimeEntry[]): TimeEntry[] {
  return input.filter((e) => taskManager.someBy((t) => t.id === e.taskId))
}

function computeEntries(): TimeEntry[] {
  let result: TimeEntry[] = []

  switch (filter.value) {
    case Filter.None:
      result = timeEntryManager.all()
      break
    case Filter.Date:
      result = timeEntryManager.filterBy(
        (x) => dateToYYYYMMDD(x.date) === dateToYYYYMMDD(selectedDate.value),
      )
      break
  }

  // Filter out entries based on category
  result = result.filter((entry) => {
    if (filteredCategories.value.length === 0) {
      return true
    }

    let task = taskManager.findBy('id', entry.taskId)
    if (task === undefined) {
      return false
    }

    return filteredCategories.value.some((c) => c.id === task.category)
  })

  return ensureNotDeleted(result)
}

const timeEntries: Ref<TimeEntry[]> = ref(computeEntries())
const allEntries = ref(timeEntryManager.all())

function categoryFromEntry(entry: TimeEntry): Category | undefined {
  const task = taskManager.findBy('id', entry.taskId)
  if (!task) return undefined
  return categoryManager.findBy('id', task.category)
}

function taskFromEntry(entry: TimeEntry): Task | undefined {
  return taskManager.findBy('id', entry.taskId)
}

const totalMinutes = computed(() => timeEntries.value.reduce((sum, e) => sum + e.minutes, 0))
const totalHours = computed(() => totalMinutes.value / 60)
const totalHoursLabel = computed(() => `${totalHours.value.toFixed(1)}h`)

const tasksInScope = computed(() => {
  const ids = new Set(timeEntries.value.map((e) => e.taskId))
  return taskManager.filterBy((t) => ids.has(t.id))
})

const taskBreakdown = computed(() => {
  const map = new Map<
    number,
    {
      task: Task
      category: Category | undefined
      minutes: number
      entryCount: number
    }
  >()

  for (const entry of timeEntries.value) {
    const task = taskFromEntry(entry)
    if (!task) continue

    const category = categoryManager.findBy('id', task.category)
    const existing = map.get(task.id)

    if (existing) {
      existing.minutes += entry.minutes
      existing.entryCount += 1
    } else {
      map.set(task.id, {
        task,
        category,
        minutes: entry.minutes,
        entryCount: 1,
      })
    }
  }

  return Array.from(map.values()).sort((a, b) => b.minutes - a.minutes)
})

const categoryBreakdown = computed(() => {
  const map = new Map<
    number,
    {
      category: Category
      minutes: number
    }
  >()

  for (const entry of timeEntries.value) {
    const category = categoryFromEntry(entry)
    if (!category) continue

    const existing = map.get(category.id)
    if (existing) {
      existing.minutes += entry.minutes
    } else {
      map.set(category.id, {
        category,
        minutes: entry.minutes,
      })
    }
  }

  return Array.from(map.values()).sort((a, b) => b.minutes - a.minutes)
})

const loggedTaskCount = computed(() => taskBreakdown.value.length)

const avgMinutesPerTask = computed(() => {
  if (!loggedTaskCount.value) return 0
  return totalMinutes.value / loggedTaskCount.value
})

const avgHoursPerTaskLabel = computed(() => `${(avgMinutesPerTask.value / 60).toFixed(1)}h`)

const topCategory = computed(() => categoryBreakdown.value[0]?.category?.name ?? '—')

const recentEntries = computed(() => {
  return [...timeEntries.value]
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, 8)
    .map((entry) => {
      const task = taskFromEntry(entry)
      const category = categoryFromEntry(entry)
      return {
        ...entry,
        task,
        category,
      }
    })
})

function minutesToHoursLabel(minutes: number): string {
  return `${(minutes / 60).toFixed(1)}h`
}

function percentOfTotal(minutes: number): string {
  if (!totalMinutes.value) return '0%'
  return `${Math.round((minutes / totalMinutes.value) * 100)}%`
}

function formatEntryDate(date: Date | string): string {
  return new Date(date).toLocaleDateString()
}

const chartData: ComputedRef<ChartData<'doughnut'>> = computed(() => {
  return {
    labels: categoryBreakdown.value.map((x) => x.category.name),
    datasets: [
      {
        label: 'Time by Category',
        data: categoryBreakdown.value.map((x) => x.minutes),
        backgroundColor: categoryBreakdown.value.map((x) => x.category.color),
        hoverOffset: 6,
      },
    ],
  }
})

const taskRankingData: ComputedRef<ChartData<'bar'>> = computed(() => {
  return {
    labels: taskBreakdown.value.map((x) => x.task.title),
    datasets: [
      {
        label: 'Hours Logged',
        data: taskBreakdown.value.map((x) => Number((x.minutes / 60).toFixed(1))),
        backgroundColor: '#4f46e5',
        borderRadius: 6,
        borderSkipped: false,
      },
    ],
  }
})

const chartOptions = ref({
  responsive: true,
  maintainAspectRatio: false,
  cutout: '60%',
  plugins: {
    legend: {
      position: 'bottom' as const,
      onClick: () => {},
    },
    tooltip: {
      callbacks: {
        label: function (context) {
          const minutes = Number(context.parsed ?? 0)
          const hours = (minutes / 60).toFixed(1)
          const percent = totalMinutes.value ? Math.round((minutes / totalMinutes.value) * 100) : 0
          return `${context.label}: ${hours}h (${minutes} min, ${percent}%)`
        },
      } as TooltipCallbacks<'doughnut'>,
    },
  },
})

const barOptions = ref({
  responsive: true,
  maintainAspectRatio: false,
  indexAxis: 'y' as const,
  plugins: {
    legend: {
      display: false,
    },
    tooltip: {
      callbacks: {
        label: function (context: any) {
          return `${context.raw}h`
        },
      },
    },
  },
  scales: {
    x: {
      beginAtZero: true,
      ticks: {
        callback: function (value: string | number) {
          return `${value}h`
        },
      },
      grid: {
        color: 'rgba(0,0,0,0.06)',
      },
    },
    y: {
      grid: {
        display: false,
      },
    },
  },
})

ChartJS.register(Title, Tooltip, Legend, ArcElement, BarElement, CategoryScale, LinearScale)
const hasTasks = computed(() => taskManager.all().length > 0)
const dateFilterLabel = computed(() => {
  if (showAll.value) return 'All Time'
  return selectedDate.value.toLocaleDateString()
})
</script>

<template>
  <BaseView title="Statistics">
    <div class="space-y-8">
      <div class="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div
          class="rounded-2xl border-2 border-primary/30 bg-base-100 p-5 shadow-md xl:col-span-2"
        >
          <div class="text-sm font-medium uppercase tracking-wide text-base-content/60">
            Total Time Logged
          </div>
          <div class="mt-2 text-4xl font-bold text-primary">{{ totalHoursLabel }}</div>
          <div class="mt-2 text-sm text-base-content/60">{{ dateFilterLabel }}</div>
        </div>

        <div class="rounded-xl border border-base-300 bg-base-100 p-4 shadow-sm">
          <div class="text-sm text-base-content/70">Tasks With Time Logged</div>
          <div class="mt-1 text-xl font-semibold">{{ loggedTaskCount }}</div>
          <div class="mt-1 text-xs text-base-content/60">Tasks included in this view</div>
        </div>

        <div class="rounded-xl border border-base-300 bg-base-100 p-4 shadow-sm">
          <div class="text-sm text-base-content/70">Average Time Per Task</div>
          <div class="mt-1 text-xl font-semibold">{{ avgHoursPerTaskLabel }}</div>
          <div class="mt-1 text-xs text-base-content/60">Based on logged tasks only</div>
        </div>

        <div class="rounded-xl border border-base-300 bg-base-100 p-4 shadow-sm">
          <div class="text-sm text-base-content/70">Top Category</div>
          <div class="mt-1 text-xl font-semibold">{{ topCategory }}</div>
          <div class="mt-1 text-xs text-base-content/60">Most time logged</div>
        </div>
      </div>

      <div class="flex items-center justify-center gap-2">
        <div>
          <label class="label gap-2">
            <input type="checkbox" v-model="showAll" class="checkbox" />
            Show All
          </label>
        </div>
        <div>
          <div class="dropdown dropdown-center">
            <div tabindex="0" role="button" class="select select-sm m-1">Filter Category</div>
            <div
              tabindex="-1"
              class="dropdown-content menu bg-base-100 rounded-box z-1 w-52 p-2 shadow-sm"
            >
              <div class="flex flex-col gap-2">
                <template v-for="c in filterableCategories" :key="c.id">
                  <div class="flex items-center justify-start gap-1.5">
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
                    <div>{{ c.name }}</div>
                  </div>
                </template>
              </div>
              <div class="mt-2 text-end">
                <button class="btn btn-primary btn-xs" @click="filteredCategories = []">
                  Clear
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div v-if="!showAll" class="flex justify-center">
        <MiniCalendar v-model="selectedDate">
          <template #day="{ date, isToday, isSelected }">
            <div
              class="text-center"
              :class="{
                'text-primary font-semibold': isToday && !isSelected,
              }"
            >
              {{ date.getDate() }}
            </div>
            <div class="flex justify-center gap-0.5">
              <template
                v-for="e in allEntries.filter((e) => isSameDay(e.date, date)).slice(0, 3)"
                :key="e.id"
              >
                <div
                  :style="{
                    '--entry-background': categoryFromEntry(e)?.color,
                  }"
                  class="inline-block h-1.5 w-1.5 rounded-full bg-(--entry-background)"
                ></div>
              </template>
            </div>
          </template>
        </MiniCalendar>
      </div>

      <div
        v-if="timeEntries.length === 0 && !showAll"
        class="rounded-xl border border-dashed border-base-300 bg-base-100 p-6 text-center"
      >
        <div class="text-lg font-semibold">No time entries for this date</div>
        <div class="mt-2 text-sm text-base-content/70">
          Select another date or enable "Show All" to see your statistics.
        </div>
        <div class="mt-4">
          <button class="btn btn-sm" @click="showAll = true">Show All Data</button>
        </div>

        <div v-if="filteredCategories.length > 0" class="py-6 text-center">
          <div class="text-lg font-semibold">No time entries with this category filter:</div>
          <div class="mt-2 flex flex-col gap-2">
            <div
              v-for="c in filteredCategories"
              :key="c.id"
              class="flex items-center justify-center gap-2"
            >
              <CategoryColor :category="c" :size="4" />
              <div>{{ c.name }}</div>
            </div>
          </div>

          <div class="mt-3 text-sm text-base-content/70">
            Select more categories in the filter or clear the filter to show more time entries.
          </div>
          <button class="btn btn-sm mt-2" @click="filteredCategories = []">Clear filter</button>
        </div>
      </div>

      <div
        v-else-if="timeEntries.length === 0 && filteredCategories.length > 0"
        class="py-6 text-center"
      >
        <div class="text-lg font-semibold">No time entries with this category filter:</div>
        <div class="mt-2 flex flex-col gap-2">
          <div
            v-for="c in filteredCategories"
            :key="c.id"
            class="flex items-center justify-center gap-2"
          >
            <CategoryColor :category="c" :size="4" />
            <div>{{ c.name }}</div>
          </div>
        </div>

        <div class="mt-3 text-sm text-base-content/70">
          Select more categories in the filter or clear the filter to show more time entries.
        </div>
        <button class="btn btn-sm mt-2" @click="filteredCategories = []">Clear filter</button>
      </div>

      <template v-else-if="timeEntries.length > 0">
        <div class="grid grid-cols-1 gap-6 xl:grid-cols-[1.25fr_0.95fr]">
          <div class="rounded-2xl border border-base-300 bg-base-100 p-6 shadow-md">
            <div class="mb-5">
              <div class="text-xl font-semibold">Category Breakdown</div>
              <div class="text-sm text-base-content/60">See where your logged time is going.</div>
            </div>

            <div
              v-if="categoryBreakdown.length"
              class="grid grid-cols-1 gap-6 lg:grid-cols-[320px_1fr]"
            >
              <div class="mx-auto h-80 w-full max-w-[320px]">
                <Doughnut :data="chartData" :options="chartOptions" />
              </div>

              <div class="space-y-3">
                <div
                  v-for="item in categoryBreakdown"
                  :key="item.category.id"
                  class="rounded-lg border border-base-300 bg-base-200/50 p-3"
                >
                  <div class="flex items-center justify-between gap-3">
                    <div class="flex min-w-0 items-center gap-2">
                      <CategoryColor :category="item.category" />
                      <div class="truncate font-medium">{{ item.category.name }}</div>
                    </div>

                    <div class="text-right">
                      <div class="font-semibold">{{ minutesToHoursLabel(item.minutes) }}</div>
                      <div class="text-xs text-base-content/60">
                        {{ item.minutes }} min • {{ percentOfTotal(item.minutes) }}
                      </div>
                    </div>
                  </div>

                  <progress
                    class="progress progress-primary mt-3 w-full"
                    :value="item.minutes"
                    :max="totalMinutes"
                  ></progress>
                </div>
              </div>
            </div>
          </div>

          <div class="rounded-xl border border-base-300 bg-base-100 p-5 shadow-sm">
            <div class="mb-4">
              <div class="text-base font-semibold">Recent Time Entries</div>
              <div class="text-sm text-base-content/60">
                Most recent logs in the current filter.
              </div>
            </div>

            <div v-if="recentEntries.length" class="space-y-3">
              <div
                v-for="entry in recentEntries"
                :key="entry.id"
                class="rounded-lg border border-base-300 bg-base-200/50 p-3"
              >
                <div class="flex items-start justify-between gap-3">
                  <div class="min-w-0">
                    <div class="truncate font-medium">
                      {{ entry.task?.title ?? 'Unknown Task' }}
                    </div>
                    <div class="mt-1 flex items-center gap-2 text-sm text-base-content/70">
                      <CategoryColor v-if="entry.category" :category="entry.category" />
                      <span>{{ entry.category?.name ?? 'Unknown Category' }}</span>
                    </div>
                  </div>

                  <div class="text-right text-sm">
                    <div class="font-semibold">{{ entry.minutes }} min</div>
                    <div class="text-base-content/60">
                      {{ formatEntryDate(entry.date) }}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div v-else class="text-sm text-base-content/70">
              No recent time entries in this filter.
            </div>
          </div>
        </div>

        <div class="rounded-xl border border-base-300 bg-base-100 p-5 shadow-sm">
          <div class="mb-4">
            <div class="text-lg font-semibold">Task Ranking by Hours Logged</div>
            <div class="text-sm text-base-content/70">
              Compare how much time each task has received.
            </div>
          </div>

          <div v-if="taskBreakdown.length" class="h-80">
            <Bar :data="taskRankingData" :options="barOptions" />
          </div>

          <div v-else class="text-sm text-base-content/70">
            No task ranking data available in this filter.
          </div>
        </div>
      </template>

     <div
  v-else
  class="rounded-2xl border border-dashed border-base-300 bg-base-100 p-8 text-center shadow-sm"
>
  <div class="mb-3 text-4xl opacity-60">📊</div>

  <div class="text-xl font-semibold">No statistics available yet</div>

  <div v-if="!hasTasks" class="mt-2 text-sm text-base-content/70">
    Create your first task to begin tracking time and viewing statistics.
  </div>

  <div v-else class="mt-2 text-sm text-base-content/70">
    Log time on an existing task to start seeing insights and statistics.
  </div>

  <div class="mt-4 rounded-xl bg-base-200/70 p-4 text-sm text-base-content/70">
    <template v-if="!hasTasks">
      You need to create a task before you can log time and generate statistics.
    </template>
    <template v-else>
      Open an existing task and use <span class="font-semibold">Log Time</span> to add your first
      entry.
    </template>
  </div>

  <div class="mt-5">
    <button
      v-if="!hasTasks"
      class="btn btn-primary btn-sm"
      @click="$router.push('/create')"
    >
      Create Task
    </button>

    <button
      v-else
      class="btn btn-primary btn-sm"
      @click="$router.push('/edit')"
    >
      Go to Edit Task
    </button>
  </div>
</div>
    </div>
  </BaseView>
</template>