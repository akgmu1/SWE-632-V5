import { ref } from 'vue'

export type NotificationType = 'success' | 'info' | 'error' | 'warning'

export interface Notification {
  id: number
  message: string
  type: NotificationType
  duration?: number
}

export const notifications = ref<Notification[]>([])
let id = 0

export function notify(message: string, type: NotificationType, duration = 3000) {
  const notification: Notification = {
    id: id++,
    message,
    type,
    duration,
  }

  notifications.value.push(notification)

  if (duration > 0) {
    setTimeout(() => remove(notification.id), duration)
  }
}

function remove(id: number) {
  notifications.value = notifications.value.filter((n) => n.id !== id)
}
