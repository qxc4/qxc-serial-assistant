<script setup lang="ts">
import { Download, RefreshCw } from 'lucide-vue-next'
import type { RttSourceFile } from '../../debug-core/rttSourceDownloads'

defineProps<{
  files: RttSourceFile[]
  repositoryUrl: string
  downloadingId: string
  downloadMessage: string
  downloadError: string
  t: (key: string) => string
}>()

defineEmits<{
  downloadSource: [file: RttSourceFile]
  exportTxt: []
  exportSession: []
}>()
</script>

<template>
  <div class="p-3 border-b border-slate-200 dark:border-slate-800">
    <div class="flex items-center justify-between gap-2 mb-2">
      <div class="min-w-0">
        <h3 class="text-xs font-medium text-slate-500 dark:text-slate-400">RTT 库文件</h3>
        <p class="text-[10px] text-slate-400 dark:text-slate-500 truncate">
          从 SEGGER 官方 GitHub 获取，不随本站打包分发
        </p>
      </div>
      <a
        :href="repositoryUrl"
        target="_blank"
        rel="noopener noreferrer"
        class="shrink-0 text-[10px] text-blue-600 dark:text-blue-400 hover:underline"
      >
        官方仓库
      </a>
    </div>

    <div class="space-y-1.5">
      <button
        v-for="file in files"
        :key="file.id"
        :data-testid="`rtt-source-${file.id}`"
        @click="$emit('downloadSource', file)"
        :disabled="Boolean(downloadingId)"
        class="w-full flex items-center justify-between gap-2 rounded-lg border border-slate-200 dark:border-slate-700 px-2 py-1.5 text-left text-[10px] text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50 transition-colors"
        :title="file.description"
      >
        <span class="min-w-0">
          <span class="block truncate font-mono text-slate-700 dark:text-slate-200">{{ file.fileName }}</span>
          <span class="block truncate text-slate-400 dark:text-slate-500">{{ file.path }}</span>
        </span>
        <RefreshCw
          v-if="downloadingId === file.id"
          class="w-3.5 h-3.5 shrink-0 animate-spin text-blue-500"
        />
        <Download v-else class="w-3.5 h-3.5 shrink-0 text-slate-400" />
      </button>
    </div>

    <p class="mt-2 text-[10px] text-slate-500 dark:text-slate-400">
      集成：把以上文件加入 MCU 工程，业务代码包含 <span class="font-mono">SEGGER_RTT.h</span>，调用 <span class="font-mono">SEGGER_RTT_WriteString()</span> 或 <span class="font-mono">SEGGER_RTT_printf()</span>。
    </p>
    <p v-if="downloadMessage" class="mt-1 text-[10px] text-green-600 dark:text-green-400">
      {{ downloadMessage }}
    </p>
    <p v-if="downloadError" class="mt-1 text-[10px] text-red-600 dark:text-red-400 break-words">
      {{ downloadError }}
    </p>
  </div>

  <div class="p-3 border-b border-slate-200 dark:border-slate-800">
    <h3 class="text-xs font-medium text-slate-500 dark:text-slate-400 mb-2">{{ t('rtt.exportOptions') }}</h3>
    <div class="flex flex-col gap-1.5">
      <button
        data-testid="rtt-export-txt"
        @click="$emit('exportTxt')"
        class="flex items-center gap-1.5 px-2 py-1.5 rounded text-xs text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all"
      >
        <Download class="w-3.5 h-3.5" />
        {{ t('rtt.exportTxt') }}
      </button>
      <button
        data-testid="rtt-export-session"
        @click="$emit('exportSession')"
        class="flex items-center gap-1.5 px-2 py-1.5 rounded text-xs text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all"
      >
        <Download class="w-3.5 h-3.5" />
        {{ t('rtt.exportSession') }}
      </button>
    </div>
  </div>
</template>
