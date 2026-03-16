<script setup lang="ts">
interface Props {
  title: String
}

const props = defineProps<Props>()
</script>

<template>
  <main class="container mx-auto py-4">
    <div class="text-2xl font-semibold text-center pt-2">
      {{ props.title }}
    </div>

    <div class="pt-5">
      <slot>
        <!-- Content -->
      </slot>
    </div>
  </main>
</template>
