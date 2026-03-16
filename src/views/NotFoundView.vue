<script setup lang="ts">
import BaseView from './BaseView.vue'
</script>

<template>
  <BaseView title="Page Not Found">
    <div class="flex justify-center">
      <RouterLink to="/" class="btn btn-primary"> Go Back Home </RouterLink>
    </div>
  </BaseView>
</template>
