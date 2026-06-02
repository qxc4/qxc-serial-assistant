<script setup lang="ts">
import type { JLinkDiagnosticReport } from '../../debug-core'

defineProps<{
  report: JLinkDiagnosticReport
}>()
</script>

<template>
  <div class="p-3 border-b border-slate-200 dark:border-slate-800">
    <div class="mb-2">
      <h3 class="text-xs font-medium text-slate-500 dark:text-slate-400">{{ report.title }}</h3>
      <p class="mt-1 text-[10px] text-slate-500 dark:text-slate-400">
        {{ report.summary }}
      </p>
    </div>
    <div class="space-y-1.5">
      <div
        v-for="route in report.routes"
        :key="route.key"
        class="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-[10px] dark:border-slate-700 dark:bg-slate-900/50"
      >
        <div class="mb-0.5 flex items-center justify-between gap-2">
          <span class="font-medium text-slate-700 dark:text-slate-200">{{ route.title }}</span>
          <span
            class="rounded px-1.5 py-0.5"
            :class="route.status === 'requires-license'
              ? 'bg-purple-50 text-purple-700 dark:bg-purple-900/20 dark:text-purple-300'
              : route.status === 'available-with-local-service'
                ? 'bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-300'
                : route.status === 'blocked'
                  ? 'bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-300'
                  : 'bg-yellow-50 text-yellow-700 dark:bg-yellow-900/20 dark:text-yellow-300'"
          >
            {{ route.status }}
          </span>
        </div>
        <p class="text-slate-500 dark:text-slate-400">{{ route.detail }}</p>
        <p class="mt-0.5 text-slate-400 dark:text-slate-500">{{ route.action }}</p>
      </div>
    </div>
    <div class="mt-2 space-y-1">
      <p
        v-for="warning in report.warnings"
        :key="warning"
        class="text-[10px] text-yellow-600 dark:text-yellow-400"
      >
        {{ warning }}
      </p>
    </div>
  </div>
</template>
