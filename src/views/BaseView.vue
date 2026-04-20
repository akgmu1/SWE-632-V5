<script setup lang="ts">
interface Props {
  title: string
}

const props = defineProps<Props>()
</script>

<template>
  <main class="container mx-auto py-6">
    <div class="mb-8 text-center">
      <h1 class="text-3xl font-bold tracking-tight text-base-content">
        {{ props.title }}
      </h1>
      <div class="mx-auto mt-3 h-1 w-16 rounded-full bg-primary/70"></div>
    </div>

    <div>
      <slot>
        <!-- Content -->
      </slot>
    </div>
  </main>
</template>