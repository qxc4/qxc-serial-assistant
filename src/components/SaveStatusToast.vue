<script setup lang="ts">
import { computed } from 'vue'
import { CheckCircle2, XCircle, Loader2, AlertCircle } from 'lucide-vue-next'
import type { SaveStatus } from '../composables/useFileSave'

const props = defineProps<{
  visible: boolean
  status: SaveStatus
  message?: string
  filePath?: string
}>()

const statusConfig = computed(() => {
  switch (props.status) {
    case 'saving':
      return {
        icon: Loader2,
        iconClass: 'animate-spin text-blue-500',
        bgClass: 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800',
        textClass: 'text-blue-700 dark:text-blue-300'
      }
    case 'success':
      return {
        icon: CheckCircle2,
        iconClass: 'text-green-500',
        bgClass: 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800',
        textClass: 'text-green-700 dark:text-green-300'
      }
    case 'error':
      return {
        icon: XCircle,
        iconClass: 'text-red-500',
        bgClass: 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800',
        textClass: 'text-red-700 dark:text-red-300'
      }
    default:
      return {
        icon: AlertCircle,
        iconClass: 'text-slate-400',
        bgClass: 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700',
        textClass: 'text-slate-600 dark:text-slate-400'
      }
  }
})

const statusText = computed(() => {
  switch (props.status) {
    case 'saving':
      return '正在保存...'
    case 'success':
      return '保存成功'
    case 'error':
      return '保存失败'
    default:
      return ''
  }
})
</script>

<template>
  <Teleport to="body">
    <Transition name="toast">
      <div 
        v-if="visible && status !== 'idle'"
        class="fixed bottom-6 right-6 z-50 max-w-sm"
      >
        <div 
          class="flex items-start gap-3 p-4 rounded-xl border shadow-lg backdrop-blur-sm"
          :class="statusConfig.bgClass"
        >
          <component 
            :is="statusConfig.icon" 
            class="w-5 h-5 shrink-0 mt-0.5"
            :class="statusConfig.iconClass"
          />
          <div class="flex-1 min-w-0">
            <div class="font-medium text-sm" :class="statusConfig.textClass">
              {{ statusText }}
            </div>
            <div v-if="message" class="text-xs mt-1 text-slate-500 dark:text-slate-400">
              {{ message }}
            </div>
            <div v-if="filePath && status === 'success'" class="text-xs mt-1 text-slate-500 dark:text-slate-400 truncate">
              文件：{{ filePath }}
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.toast-enter-active,
.toast-leave-active {
  transition: all 0.3s ease;
}

.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translateX(100%);
}
</style>
