export type Optionalize<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>

export function dateToYYYYMMDD(date: Date): string | undefined {
  // Helper method to format date to 'YYYY-MM-DD'
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().split('T')[0]
}

export function dateTrim(rawDate: Date, addOffset: boolean = false): Date {
  const date = addOffset
    ? new Date(rawDate.getTime() + rawDate.getTimezoneOffset() * 60000)
    : rawDate
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

export function randomColor(): string {
  return `#${Math.floor(Math.random() * 0xffffff)
    .toString(16)
    .padStart(6, '0')}`
}

import type { Task } from '@/schemas/task'
import { reactive, watch } from 'vue'
export enum SortOption {
  Name = 'name',
  Created = 'created',
  Due = 'due',
}

export function sortTasks(tasks: Task[], sortOption: SortOption): Task[] {
  return [...tasks].sort((a, b) => {
    switch (sortOption) {
      case SortOption.Name:
        return a.title.localeCompare(b.title)

      case SortOption.Created:
        return a.id - b.id

      case SortOption.Due:
        return a.dueDate.getTime() - b.dueDate.getTime()

      default:
        return 0
    }
  })
}

// Makes it so a class field will be triggered,
// example is adding the shake animation
export function triggerAddClass(e: HTMLElement, c: string) {
  e.classList.remove(c)
  void e.offsetWidth
  e.classList.add(c)
}

// Form Helper Utilities

type FormErrors<T> = {
  [K in keyof T]: string
}

type FormTouched<T> = {
  [K in keyof T]: boolean
}

type FormValidators<T> = {
  [K in keyof T]?: (value: T[K], form: Omit<T, K>) => string
}

type FormInitial<T> = {
  [K in keyof T]: T[K] | (() => T[K])
}

export function createFormState<T extends Record<string, any>>(
  initial: FormInitial<T>,
  validators: FormValidators<T> = {},
) {
  const values = reactive({}) as T
  for (const key in initial) {
    const value = initial[key]
    values[key] = typeof value === 'function' ? (value as Function)() : value
  }

  const errors = reactive(
    Object.fromEntries(Object.keys(initial).map((k) => [k, ''])),
  ) as FormErrors<T>

  const state = reactive({ hasErrors: false })
  watch(errors, (e) => {
    state.hasErrors = Object.values(e).some((x) => !!x)
  })

  const touched = reactive(
    Object.fromEntries(Object.keys(initial).map((k) => [k, false])),
  ) as FormTouched<T>

  function validateField<K extends keyof T>(field: K) {
    const validator = validators[field]
    errors[field] = validator ? validator(values[field], values) : ''
  }

  function touch<K extends keyof T>(field: K) {
    touched[field] = true
    validateField(field)
  }

  function reset(newValues?: Partial<T>) {
    for (const key in initial) {
      const value = initial[key]
      values[key] =
        (newValues?.[key] ?? typeof value === 'function') ? (value as Function)() : value
    }

    for (const key in errors) {
      errors[key] = ''
    }

    for (const key in touched) {
      touched[key] = false
    }
  }

  function touchAll() {
    ;(Object.keys(touched) as (keyof FormTouched<T>)[]).forEach(touch)
  }

  function clearTouchAndErrors() {
    for (const key in errors) {
      errors[key] = ''
    }

    for (const key in touched) {
      touched[key] = false
    }
  }

  return {
    values,
    errors,
    state,
    touched,
    validateField,
    touch,
    touchAll,
    reset,
    clearTouchAndErrors,
  }
}
