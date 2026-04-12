import { z, ZodObject } from 'zod'

// Prefix used for key names, to keep site working across different versions
const VERSION_PREFIX = 'v5'

type ManagerHooks<T> = {
  onStartup?: (data: T) => void
  onUpdate?: (oldData: T, newData: T) => void
  onDelete?: (data: T) => void
}

type Predicate<T> = (item: T) => boolean

// TODO: Caching reads
export class DataManager<TSchema extends z.ZodTypeAny> {
  protected schema: TSchema
  protected key: string
  protected hooks?: ManagerHooks<z.infer<TSchema>>

  constructor(schema: TSchema, key: string, hooks?: ManagerHooks<z.infer<TSchema>>) {
    this.schema = schema
    this.key = `${VERSION_PREFIX}-${key}`
    this.hooks = hooks

    const data = this.load()
    if (data !== undefined) {
      this.hooks?.onStartup?.(data)
    }
  }

  public installHooks(hooks: ManagerHooks<z.infer<TSchema>>) {
    this.hooks = {
      ...this.hooks,
      ...hooks,
    }
  }

  public reset() {
    const prevData = this.load()

    localStorage.removeItem(this.key)

    if (prevData !== undefined) {
      this.hooks?.onDelete?.(prevData)
    }
  }

  public load(): z.infer<TSchema> | undefined {
    try {
      const data = JSON.parse(localStorage.getItem(this.key) ?? '{}')
      return this.schema.parse(data)
    } catch {
      return undefined
    }
  }

  public save(input: z.infer<TSchema>, ignoreHook: boolean = false) {
    let prevData = undefined
    if (!ignoreHook) {
      prevData = this.load()
    }

    localStorage.setItem(this.key, JSON.stringify(input))

    if (prevData !== undefined) {
      this.hooks?.onUpdate?.(prevData, input)
    }
  }
}

export class ArrayDataManager<TObjectSchema extends ZodObject<any>> extends DataManager<
  z.ZodArray<TObjectSchema>
> {
  constructor(
    elementSchema: TObjectSchema,
    key: string,
    hooks?: ManagerHooks<z.infer<TObjectSchema>[]>,
  ) {
    super(z.array(elementSchema), key, hooks)
  }

  public override load(): z.infer<TObjectSchema>[] {
    const raw = localStorage.getItem(this.key)
    if (!raw) return []
    try {
      const parsed = JSON.parse(raw)
      const data = this.schema.parse(parsed)
      return Array.isArray(data) ? data : []
    } catch {
      this.save([], true)
      return []
    }
  }

  public all(): z.infer<TObjectSchema>[] {
    return this.load()
  }

  public add(item: z.infer<TObjectSchema>) {
    const data = this.all()
    data.push(item)
    this.save(data)
  }

  public findBy<K extends keyof z.infer<TObjectSchema>>(
    fieldOrPredicate: K | Predicate<z.infer<TObjectSchema>>,
    value?: z.infer<TObjectSchema>[K],
  ): z.infer<TObjectSchema> | undefined {
    const data = this.all()
    if (typeof fieldOrPredicate === 'function') {
      return data.find(fieldOrPredicate)
    } else {
      return data.find((item) => item[fieldOrPredicate] === value)
    }
  }

  public someBy<K extends keyof z.infer<TObjectSchema>>(
    fieldOrPredicate: K | Predicate<z.infer<TObjectSchema>>,
    value?: z.infer<TObjectSchema>[K],
  ): boolean {
    const data = this.all()
    if (typeof fieldOrPredicate === 'function') {
      return data.some(fieldOrPredicate)
    } else {
      return data.some((item) => item[fieldOrPredicate] === value)
    }
  }

  public filterBy<K extends keyof z.infer<TObjectSchema>>(
    fieldOrPredicate: K | Predicate<z.infer<TObjectSchema>>,
    value?: z.infer<TObjectSchema>[K],
  ): z.infer<TObjectSchema>[] {
    const data = this.all()
    if (typeof fieldOrPredicate === 'function') {
      return data.filter(fieldOrPredicate)
    } else {
      return data.filter((item) => item[fieldOrPredicate] === value)
    }
  }

  // TODO: Change into allowing a predicate
  public updateBy<K extends keyof z.infer<TObjectSchema>>(
    field: K,
    value: z.infer<TObjectSchema>[K],
    updater:
      | Partial<z.infer<TObjectSchema>>
      | ((old: z.infer<TObjectSchema>) => z.infer<TObjectSchema>),
  ) {
    const oldData = this.filterBy(field, value)
    const updated = this.all().map((item) => {
      if (item[field] === value) {
        if (typeof updater === 'function') {
          return (updater as (old: z.infer<TObjectSchema>) => z.infer<TObjectSchema>)(item)
        } else {
          return { ...item, ...updater }
        }
      }
      return item
    })
    const newData = this.filterBy(field, value)
    this.save(updated)

    this.hooks?.onUpdate?.(oldData, newData)
  }

  public removeBy<K extends keyof z.infer<TObjectSchema>>(
    fieldOrPredicate: K | Predicate<z.infer<TObjectSchema>>,
    value?: z.infer<TObjectSchema>[K],
  ) {
    const removed = this.filterBy(fieldOrPredicate, value)

    let filtered: z.infer<TObjectSchema>[]
    const data = this.all()

    if (typeof fieldOrPredicate === 'function') {
      filtered = data.filter((item) => !fieldOrPredicate(item))
    } else {
      filtered = data.filter((item) => item[fieldOrPredicate] !== value)
    }

    this.save(filtered)

    this.hooks?.onDelete?.(removed)
  }
}

export class IdArrayDataManager<
  TObjectSchema extends ZodObject<any>,
> extends ArrayDataManager<TObjectSchema> {
  private counterKey: string

  constructor(
    elementSchema: TObjectSchema,
    key: string,
    hooks?: ManagerHooks<z.infer<TObjectSchema>[]>,
  ) {
    super(elementSchema, key, hooks)
    this.counterKey = `${VERSION_PREFIX}-${key}-id-counter`
  }

  private nextId(): number {
    const current = this.currentId()
    localStorage.setItem(this.counterKey, String(current + 1))
    return current
  }

  private currentId() {
    return Number(localStorage.getItem(this.counterKey) ?? '0')
  }

  public add(item: Omit<z.infer<TObjectSchema>, 'id'>): number {
    const id = this.nextId()
    const newItem = { ...(item as any), id } as z.infer<TObjectSchema>
    super.add(newItem)
    return id
  }

  public insert(item: z.infer<TObjectSchema>) {
    const list = this.all()
    if (
      typeof item.id === 'number' &&
      item.id < this.currentId() &&
      !list.some((x) => item.id === x.id)
    ) {
      list.push(item)
      this.save(list)
    }
  }

  public override reset(includeCounter = false) {
    super.reset()
    if (includeCounter) localStorage.removeItem(this.counterKey)
  }
}
