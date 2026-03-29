import { IdArrayDataManager } from '@/data'
import type { Optionalize } from '@/helper'
import z from 'zod'

const subtaskSchema = z.object({
  id: z.number(),
  order: z.number(),
  taskId: z.number(),
  text: z.string(),
  completed: z.boolean(),
})

export type Subtask = z.infer<typeof subtaskSchema>
export type SubtaskLike = Omit<Optionalize<Subtask, 'id'>, 'order' | 'taskId'> & {
  sortId: number
}

export const subtaskManager = new IdArrayDataManager(subtaskSchema, 'subtask')
